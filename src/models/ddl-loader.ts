import { v4 as uuidV4 } from 'uuid';
import { Parser as PostgresParser } from "node-sql-parser/build/postgresql";
import { Parser as MySQLParser } from "node-sql-parser/build/mysql";
import { Alter, AST, Create, Parser, ValueExpr } from "node-sql-parser";

import { DatabaseType, findDatabaseColumns, IndexColumnModel, NullsOrderType, SortOrderType, TableReferenceActionType } from "~/models/database";
import ErdDocument from "~/models/ErdDocument";
import { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import ColumnModel from '~/models/database/ColumnModel';
import TableIndexModel from '~/models/database/TableIndexModel';
import TableModel, { ColumnModelType } from '~/models/database/TableModel';
import RelationPair from '~/models/database/RelationPair';
import RelationModel from '~/models/database/RelationModel';

export const loadDdl = (erdDocument: ErdDocument, ddl: string): DdlLoadResult => {
    const ddlLoader = new DdlLoader(erdDocument);
    return ddlLoader.load(ddl);
};

export type DdlLoadResult = {
    summaries: DdlLoadSummary[];
    tableDefinitions: DdlTableDefinition[];
    relationDefinitions: DdlRelationDefinition[];
};

const dispatchInitParser: { [key in DatabaseType]: () => Parser } = {
    "postgres": () => new PostgresParser(),
    "mysql": () => new MySQLParser(),
};

class DdlLoader {

    private parser: Parser;
    private existedTableNames: Set<string>;
    private parseOption;
    private resolver: ColumnTypeResolver;

    private tableNames: string[];
    private tableBaseDefinitions: Map<string, TableBaseDefinition>;
    private relationDefinitions: DdlRelationDefinition[];
    private summaries: DdlLoadSummary[];

    constructor(erdDocument: ErdDocument) {
        const databaseType = erdDocument.databaseSettingModel.databaseType;

        this.parser = dispatchInitParser[databaseType]();
        this.existedTableNames = new Set(erdDocument.getTableViewModels()
            .map(tableView => tableView.tableModel.physicalName));
        this.parseOption = {
            database: (databaseType === "mysql") ? "MySQL" : "PostgreSQL",
        };
        this.resolver = new ColumnTypeResolver(databaseType, erdDocument.getColumnShareModelStorage());

        this.tableNames = [];
        this.tableBaseDefinitions = new Map<string, TableBaseDefinition>();
        this.relationDefinitions = [];
        this.summaries = [];
    }

    public load(ddl: string): DdlLoadResult {
        let analyzedQueries: AST[];
        try {
            const ast: AST | AST[] = this.parser.astify(ddl, this.parseOption);
            analyzedQueries = Array.isArray(ast) ? ast : [ast];
        } catch (error) {
            return {
                summaries: [{
                    result: "failure",
                    message: `Failed to parse DDL: ${error instanceof Error ? error.message : String(error)}`,
                    sql: "-"
                }],
                tableDefinitions: [],
                relationDefinitions: [],
            };
        }

        analyzedQueries.forEach(query => {
            if (query.type === "create") {
                return this.doLoadCreateDdl(query as Create);
            }
            if (query.type === "alter") {
                return this.doLoadAlterDdl(query as Alter);
            }

            // ライブラリの型定義が type = "comment" の場合に対応していないため、型アサーションを使用
            if (query.type as unknown as string === "comment") {
                return this.doLoadCommentDdl(query as unknown as Comment);
            }

            // 上記外の DDL は未対応なのでスキップ
            const sql = this.parser.sqlify(query, this.parseOption);
            this.summaries.push({
                result: "skipped",
                message: `Not supported query type "${query.type}".`,
                sql: sql
            });
        });

        const tableDefinitions = this.tableNames
            .map(tableName => this.tableBaseDefinitions.get(tableName) as TableBaseDefinition)
            .map(tableDefinition => {
                const columnDefinitions = tableDefinition.columnDefinitions.map(columnDef => {
                    const columnShareModel = this.resolver.resolve(columnDef);
                    if (columnShareModel == null) {
                        this.summaries.push({
                            result: "failure",
                            message: `Failed to resolve column type "${columnDef.columnName}"`
                                + ` in table "${tableDefinition.tableName}" : ${JSON.stringify(columnDef)}`,
                            sql: ""
                        });
                        return;
                    }

                    return { ...columnDef, columnShareModel } as ColumnDefinition;
                }).filter((columnDef): columnDef is ColumnDefinition => (columnDef != null));

                return { ...tableDefinition, columnDefinitions } as DdlTableDefinition;
            });

        return {
            summaries: [...this.summaries],
            tableDefinitions: tableDefinitions,
            relationDefinitions: [...this.relationDefinitions],
        }
    }

    doLoadCreateDdl(query: Create) {
        if (query.keyword === "table") {
            return this.doLoadCreateTableDdl(query);
        }
        if (query.keyword === "index") {
            return this.doLoadCreateIndexDdl(query);
        }

        const sql = this.parser.sqlify(query, this.parseOption);
        this.summaries.push({
            result: "skipped",
            message: `Not supported create query type "${query.keyword}".`,
            sql: sql
        });
    }

    private doLoadCreateTableDdl(query: Create) {
        const sql = this.parser.sqlify(query, this.parseOption);

        const [tableDefinition, noSuccessResult] = loadCreateTableDdl(query);
        if (noSuccessResult != null) {
            this.summaries.push({
                result: noSuccessResult.result,
                message: noSuccessResult.message,
                sql: sql
            });

            return;
        }

        if (this.existedTableNames.has(tableDefinition.tableName)) {
            this.summaries.push({
                result: "skipped",
                message: `Table "${tableDefinition.tableName}" is already existed.`,
                sql: sql
            });

            return;
        }
        if (this.tableBaseDefinitions.has(tableDefinition.tableName)) {
            this.summaries.push({
                result: "skipped",
                message: `Table "${tableDefinition.tableName}" is duplicated in ddl.`,
                sql: sql
            });

            return;
        }

        this.tableNames.push(tableDefinition.tableName);
        this.tableBaseDefinitions.set(tableDefinition.tableName, tableDefinition);

        this.summaries.push({
            result: (tableDefinition.skippedReasons.length === 0) ? "success" : "warning",
            message: tableDefinition.skippedReasons.map(reason => reason.message).join(", "),
            sql: sql
        });
    }

    private doLoadCreateIndexDdl(query: Create) {
        const sql = this.parser.sqlify(query, this.parseOption);

        const [tableIndex, noSuccessResult] = loadCreateIndexDdl(query);
        if (noSuccessResult != null) {
            this.summaries.push({
                result: noSuccessResult.result,
                message: noSuccessResult.message,
                sql: sql
            });

            return;
        }

        const tableDefinition = this.tableBaseDefinitions.get(tableIndex.tableName);
        if (tableDefinition == null) {
            this.summaries.push({
                result: "skipped",
                message: `Table "${tableIndex.tableName}" is not defined in ddl.`,
                sql: sql
            });

            return;
        }

        tableDefinition.tableIndexDefinitions.push(tableIndex.indexDefinition);
    }

    doLoadAlterDdl(query: Alter) {
        const sql = this.parser.sqlify(query, this.parseOption);
        if (!("keyword" in query) || (query.keyword !== "table")) {
            this.summaries.push({
                result: "skipped",
                message: `Not supported alter query type "${("keyword" in query) ? query.keyword : '????'}".`,
                sql: sql
            });

            return;
        }

        const [relationResult, noSuccessResult] = loadAlterTableDdl(query, this.tableBaseDefinitions);
        if (noSuccessResult != null) {
            this.summaries.push({
                result: noSuccessResult.result,
                message: noSuccessResult.message,
                sql: sql
            });

            return;
        }

        this.relationDefinitions.push(...relationResult.relationDefinitions);
        this.summaries.push({
            result: (relationResult.skippedReasons.length === 0) ? "success" : "warning",
            message: relationResult.skippedReasons.map(reason => reason.message).join(", "),
            sql: sql
        });
    }

    doLoadCommentDdl(query: Comment) {
        const sql = this.parser.sqlify(query as unknown as AST, this.parseOption);

        const tableName = query.target.name.table;
        const tableDefinition = this.tableBaseDefinitions.get(tableName);
        if (tableDefinition == null) {
            this.summaries.push({
                result: "skipped",
                message: `Table "${tableName}" is not defined in ddl.`,
                sql: sql
            });

            return;
        }

        const comment = query.expr.expr.value;
        if (query.target.type === "table") {
            // テーブルのコメントを設定
            tableDefinition.comment = comment;

            this.summaries.push({ result: "success", message: "", sql: sql });
            return;
        }

        const columnName = query.target.name.column.expr.value;
        const columnDefinition = tableDefinition.columnDefinitions
            .find(columnDef => (columnDef.columnName === columnName));
        if (columnDefinition == null) {
            this.summaries.push({
                result: "skipped",
                message: `Column "${columnName}" is not defined in table "${tableName}".`,
                sql: sql
            });

            return;
        }

        columnDefinition.comment = comment;
        this.summaries.push({ result: "success", message: "", sql: sql });
    }
}

export type DdlLoadSummary = {
    result: "success" | "warning" | "failure" | "skipped";
    message: string;
    sql: string;
};

type LoadFailure = {
    result: "failure" | "skipped";
    message: string;
};

type TableBaseDefinition = {
    tableName: string;
    columnDefinitions: ColumnBaseDefinition[];
    tableIndexDefinitions: TableIndexDefinition[];
    skippedReasons: LoadFailure[];
    comment: string;
};

type ColumnBaseDefinition = {
    columnName: string;
    columnType: string;
    timezone: "with time zone" | "without time zone" | "";
    unsigned: boolean;
    zeroFill: boolean;
    precision: number | null;
    scale: number | null;
    primaryKey: boolean;
    notNull: boolean;
    unique: boolean;
    autoIncrement: boolean;
    defaultValue: string;
    comment: string;
};

export type DdlTableDefinition = {
    tableName: string;
    columnDefinitions: ColumnDefinition[];
    tableIndexDefinitions: TableIndexDefinition[];
    skippedReasons: LoadFailure[];
    comment: string;
};

type ColumnDefinition = {
    columnShareModel: ColumnShareModel;
    primaryKey: boolean;
    notNull: boolean;
    unique: boolean;
    autoIncrement: boolean;
    defaultValue: string;
};

type UpdateColumnDefinition = {
    index: number;
    columnDefinition: ColumnBaseDefinition;
};

type TableIndexDefinition = {
    indexName: string;
    indexColumns: IndexColumn[];
    indexOption: TableIndexOption;
    indexType: TableIndexType;
};

type IndexColumn = {
    columnName: string;
    sortOrderType: SortOrderType;
    nullsOrderType: NullsOrderType;
}

const fail = (message: string): LoadFailure => {
    return {
        result: "failure",
        message: message,
    };
};
const skip = (message: string): LoadFailure => {
    return {
        result: "skipped",
        message: message,
    };
};

type CreateDefinition = NonNullable<Create["create_definitions"]>[number];
type CreateColumnDefinition = Extract<CreateDefinition, { resource: 'column' }>;

const loadCreateTableDdl = (query: Create): ([TableBaseDefinition, null] | [null, LoadFailure]) => {
    if ((query.table == null) || (query.table.length === 0)) {
        return [null, fail("Table name is not specified in create table query.")];
    }
    if (query.table.length > 1) {
        return [null, fail("Unsupported multiple table names in create table query.")];
    }

    const tableName = query.table?.[0].table || "";
    if (tableName === "") {
        return [null, fail("Table name is not specified in create table query.")];
    }

    const columnBaseDefinitions: ColumnBaseDefinition[] = [];
    const tableIndexDefinitions: TableIndexDefinition[] = [];
    const skippedReasons: LoadFailure[] = [];

    for (const [index, createDefinition] of (query.create_definitions || []).entries()) {
        // CreateColumnDefinition 型の場合
        if (createDefinition.resource === "column") {
            const [columnDefinition, noSuccessResult] =
                loadCreateColumnDefinition(createDefinition as CreateColumnDefinition, index);
            if (noSuccessResult != null) {
                return [null, noSuccessResult];
            }

            columnBaseDefinitions.push(columnDefinition);
            continue;
        }

        // CreateConstraintDefinition 型の場合
        if (createDefinition.resource === "constraint") {
            const [nextColumnDefinitions, tableIndexDefinition, noSuccessResult] =
                loadCreateConstraintDefinition(createDefinition as CreateConstraintDefinition, index, columnBaseDefinitions);
            if (noSuccessResult != null) {
                if (noSuccessResult.result === "failure") {
                    return [null, noSuccessResult];
                }

                skippedReasons.push(noSuccessResult);
                continue;
            }

            nextColumnDefinitions.forEach(nextColumnDefinition => {
                columnBaseDefinitions[nextColumnDefinition.index] = nextColumnDefinition.columnDefinition;
            });
            if (tableIndexDefinition != null) {
                tableIndexDefinitions.push(tableIndexDefinition);
            }

            continue;
        }

        // CreateIndexDefinition もしくは CreateFulltextSpatialIndexDefinition 型の場合
        if (createDefinition.resource === "index") {
            const [tableIndexDefinition, noSuccessResult] =
                loadCreateIndexDefinition(createDefinition as CreateIndexDefinition, index, columnBaseDefinitions);
            if (noSuccessResult != null) {
                return [null, noSuccessResult];
            }

            tableIndexDefinitions.push(tableIndexDefinition);
            continue;
        }
    }

    let comment = "";
    if (("table_options" in query) && (query.table_options != null) && Array.isArray(query.table_options)) {
        const commentOption = query.table_options.find(option => (option.type === "comment"));
        if (commentOption != null) {
            comment = commentOption.value || "";
        }
    }

    return [
        {
            tableName: tableName,
            columnDefinitions: columnBaseDefinitions,
            tableIndexDefinitions: tableIndexDefinitions.map(definition => {
                if (definition.indexName != "") {
                    return definition;
                }

                return {
                    ...definition,
                    indexName: `index_${tableName}__${definition.indexColumns.join("_")}`,
                }
            }),
            skippedReasons: skippedReasons,
            comment: comment,
        },
        null
    ];
};

const loadCreateColumnDefinition = (
    createDefinition: CreateColumnDefinition, index: number
): [ColumnBaseDefinition, null] | [null, LoadFailure] => {

    if (createDefinition.column.type !== "column_ref") {
        return [null, fail(`Unsupported column definition format at position ${index + 1}.`)];
    }

    const column = createDefinition.column.column;
    const columnName = (typeof column === "string") ? column : column.expr.value;
    if (typeof columnName !== "string") {
        return [null, fail(`Unexpected analysis for column name at position ${index + 1}. `
            + `create_definitions[${index}].column.column : ${JSON.stringify(column)}`)];
    }

    const dataType = createDefinition.definition;
    const columnType = dataType.dataType;
    const timezone = (dataType.suffix && (dataType.suffix.length === 3)
        && (dataType.suffix[1] === "TIME") && (dataType.suffix[2] === "ZONE"))
        ? ((dataType.suffix[0] === "WITH") ? "with time zone" : "without time zone")
        : "";
    const unsigned = (dataType.suffix && (dataType.suffix.length === 1) && (dataType.suffix[0] === "UNSIGNED")) || false;
    const zeroFill = (dataType.suffix && (dataType.suffix.length === 1) && (dataType.suffix[0] === "ZEROFILL")) || false;
    const precision = dataType.length || null;
    const scale = dataType.scale || null;

    const notNull = createDefinition.nullable && (createDefinition.nullable.value === "not null") || false;
    const unique = (createDefinition.unique != null) || false;
    const autoIncrement = (createDefinition.auto_increment != null) || false;

    let defaultValue = "";
    if (createDefinition.default_val != null) {
        const defaultValueObj = createDefinition.default_val.value;
        if (defaultValueObj.type === "function") {
            if (!("name" in defaultValueObj.name)) {
                return [null, fail(`Unexpected analysis for default value function at position ${index + 1}. `
                    + `create_definitions[${index}].default_val.value.name : ${JSON.stringify(defaultValueObj.name)}`)];
            }
            if ((Array.isArray(defaultValueObj.name.name) == false) || (defaultValueObj.name.name.length !== 1)) {
                return [null, fail(`Unexpected analysis for default value function at position ${index + 1}. `
                    + `create_definitions[${index}].default_val.value.name.name : ${JSON.stringify(defaultValueObj.name.name)}`)];
            }

            defaultValue = defaultValueObj.name.name[0].value;
        } else if (defaultValueObj.type === "single_quote_string") {
            defaultValue = `'${defaultValueObj.value}'`
        } else if (defaultValueObj.type === "double_quote_string") {
            defaultValue = `"${defaultValueObj.value}"`
        } else {
            defaultValue = defaultValueObj.value;
        }
    }

    const comment = (createDefinition.comment != null) ? createDefinition.comment.value : "";

    return [
        {
            columnName, columnType, timezone, unsigned, zeroFill, precision, scale,
            primaryKey: false, notNull, unique, autoIncrement, defaultValue, comment
        }, null
    ];
};

type CreateConstraintDefinition = Extract<CreateDefinition, { resource: 'constraint' }>;
type CreateConstraintPrimary = Extract<CreateConstraintDefinition, { constraint_type: 'primary key' }>;
type CreateConstraintUnique = Extract<CreateConstraintDefinition, {
    constraint_type: 'unique' | 'unique key' | 'unique index';
}>;

const loadCreateConstraintDefinition = (
    createDefinition: CreateConstraintDefinition, index: number, columnDefinitions: ColumnBaseDefinition[]
): ([UpdateColumnDefinition[], null, null] | [UpdateColumnDefinition[], TableIndexDefinition, null] | [UpdateColumnDefinition[], null, LoadFailure]) => {

    if (createDefinition.constraint_type === "primary key") {
        const [nextColumnDefinitions, noSuccessResult] =
            doLoadCreatePrimaryKeyDefinition(createDefinition as CreateConstraintPrimary, index, columnDefinitions);

        return [nextColumnDefinitions, null, noSuccessResult];
    }

    if ((createDefinition.constraint_type === "unique")
        || (createDefinition.constraint_type === "unique key")
        || (createDefinition.constraint_type === "unique index")) {

        const [nextColumnDefinition, tableIndexDefinition, noSuccessResult] =
            doLoadCreateUniqueKeyDefinition(createDefinition as CreateConstraintUnique, index, columnDefinitions);

        if (noSuccessResult != null) {
            return [[], null, noSuccessResult];
        }
        if (nextColumnDefinition != null) {
            return [[nextColumnDefinition], null, null];
        }

        return [[], tableIndexDefinition, null];
    }

    return [[], null, skip(`Unsupported constraint type "${createDefinition.constraint_type}" at position ${index + 1}.`)];
};

const doLoadCreatePrimaryKeyDefinition = (
    createDefinition: CreateConstraintPrimary, index: number, columnDefinitions: ColumnBaseDefinition[]
): ([UpdateColumnDefinition[], LoadFailure | null]) => {
    const nextDefinitions = [];

    for (const [indexDefinition, definition] of createDefinition.definition.entries()) {
        if (definition.type !== "column_ref") {
            return [[], fail(`Unsupported primary key definition at position ${index + 1}. `
                + `create_definitions[${index}].definition[${indexDefinition}] : ${JSON.stringify(definition)}`)];
        }

        const columnName = (typeof definition.column === "string") ? definition.column : definition.column.expr.value;
        if (typeof columnName !== "string") {
            return [[], fail(`Unexpected analysis for primary key column name at position ${index + 1}. `
                + `create_definitions[${index}].definition[${indexDefinition}] : ${JSON.stringify(definition)}`)];
        }

        const indexColumn = columnDefinitions.findIndex(colDef => (colDef.columnName === columnName));
        if (indexColumn < 0) {
            return [[], fail(`Primary key column "${columnName}" is not defined in create table query. `
                + `create_definitions[${index}].definition[${indexDefinition}] : ${JSON.stringify(definition)}`)];
        }

        const columnDefinition = columnDefinitions[indexColumn];
        const nextColumnDefinition = {
            ...columnDefinition,
            primaryKey: true,
        }

        nextDefinitions.push({ index: indexColumn, columnDefinition: nextColumnDefinition });
    }

    return [nextDefinitions, null]
};

const doLoadCreateUniqueKeyDefinition = (
    createDefinition: CreateConstraintUnique, index: number, columnDefinitions: ColumnBaseDefinition[]
): ([UpdateColumnDefinition, null, null] | [null, TableIndexDefinition, null] | [null, null, LoadFailure]) => {

    const doValidateDefinition = (
        definitions: NonNullable<CreateConstraintUnique["definition"]>, indexDefinition: number
    ): ([number, string, null] | [null, null, LoadFailure]) => {

        const definition = definitions[indexDefinition];

        if (definition.type !== "column_ref") {
            return [null, null, fail(`Unsupported unique key definition at position ${index + 1}. `
                + `create_definitions[${index}].definition[${indexDefinition}] : ${JSON.stringify(definition)}`)];
        }

        const columnName = (typeof definition.column === "string") ? definition.column : definition.column.expr.value;
        if (typeof columnName !== "string") {
            return [null, null, fail(`Unexpected analysis for unique key column name at position ${index + 1}. `
                + `create_definitions[${index}].definition[${indexDefinition}] : ${JSON.stringify(definition)}`)];
        }

        const indexColumn = columnDefinitions.findIndex(colDef => (colDef.columnName === columnName));
        if (indexColumn < 0) {
            return [null, null, fail(`Unique key column "${columnName}" is not defined in create table query. `
                + `create_definitions[${index}].definition[${indexDefinition}] : ${JSON.stringify(definition)}`)];
        }

        return [indexColumn, columnName, null]
    };

    if (createDefinition.definition.length === 1) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [indexColumn, _, noSuccessResult] = doValidateDefinition(createDefinition.definition, 0);
        if (noSuccessResult != null) {
            return [null, null, noSuccessResult];
        }

        const columnDefinition = columnDefinitions[indexColumn];
        const nextColumnDefinition = {
            ...columnDefinition,
            unique: true,
        }

        return [{ index: indexColumn, columnDefinition: nextColumnDefinition }, null, null];
    }

    const indexedColumns: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [indexDefinition, _] of createDefinition.definition.entries()) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_, columnName, noSuccessResult] = doValidateDefinition(createDefinition.definition, indexDefinition);
        if (noSuccessResult != null) {
            return [null, null, noSuccessResult];
        }

        indexedColumns.push(columnName);
    }

    if (indexedColumns.length === 0) {
        return [null, null, fail(`No columns defined for unique key at position ${index + 1}.`)];
    }

    const constraintName = createDefinition.constraint || "";
    const indexType = createDefinition.index_type?.type.toUpperCase() || "";

    return [
        null,
        {
            indexName: constraintName,
            indexColumns: indexedColumns.map(columnName => ({
                columnName,
                sortOrderType: "",
                nullsOrderType: "",
            } as IndexColumn)),
            indexOption: "UNIQUE",
            indexType: indexType as TableIndexType,
        },
        null
    ];
};

type CreateIndexDefinition = Extract<CreateDefinition, { resource: 'index' }>;

const loadCreateIndexDefinition = (
    createDefinition: CreateIndexDefinition, index: number, columnDefinitions: ColumnBaseDefinition[]
): ([TableIndexDefinition, null] | [null, LoadFailure]) => {
    const indexedColumns: string[] = [];
    for (const [indexDefinition, definition] of createDefinition.definition.entries()) {
        if (definition.type !== "column_ref") {
            return [null, fail(`Unsupported index definition at position ${index + 1}. `
                + `create_definitions[${index}].definition[${indexDefinition}] : ${JSON.stringify(definition)}`)];
        }

        const columnName = (typeof definition.column === "string") ? definition.column : definition.column.expr.value;
        if (typeof columnName !== "string") {
            return [null, fail(`Unexpected analysis for index column name at position ${index + 1}. `
                + `create_definitions[${index}].definition[${indexDefinition}] : ${JSON.stringify(definition)}`)];
        }

        const indexColumn = columnDefinitions.findIndex(colDef => (colDef.columnName === columnName));
        if (indexColumn < 0) {
            return [null, fail(`Index column "${columnName}" is not defined in create table query. `
                + `create_definitions[${index}].definition[${indexDefinition}] : ${JSON.stringify(definition)}`)];
        }

        indexedColumns.push(columnName);
    }

    if (indexedColumns.length === 0) {
        return [null, fail(`No columns defined for index at position ${index + 1}.`)];
    }

    const constraintName = createDefinition.index || "";
    const indexType = (("index_type" in createDefinition) && (createDefinition.index_type != null))
        ? createDefinition.index_type.type.toUpperCase() : "";
    const indexOption = createDefinition.keyword?.includes("fulltext") ? "FULLTEXT" :
        (createDefinition.keyword?.includes("spatial") ? "SPATIAL" : "");

    return [
        {
            indexName: constraintName,
            indexColumns: indexedColumns.map(columnName => ({
                columnName,
                sortOrderType: "",
                nullsOrderType: "",
            } as IndexColumn)),
            indexOption: indexOption as TableIndexOption,
            indexType: indexType as TableIndexType,
        },
        null
    ];
};

const loadCreateIndexDdl = (query: Create): (
    [{ tableName: string, indexDefinition: TableIndexDefinition }, null] | [null, LoadFailure]
) => {

    if (query.table == null) {
        return [null, fail("Table name is not specified in create table query.")];
    }
    if ((query.table.length > 1)) {
        return [null, fail("Unsupported multiple table names in create table query.")];
    }

    // ライブラリの型定義と実際のオブジェクトの形式が異なるため、強制的に型アサーションを適用
    const tableObj = query.table as unknown as { db: string; table: string };

    const tableName = tableObj.table || "";
    if (tableName === "") {
        return [null, fail("Table name is not specified in create table query.")];
    }

    if (!("index_columns" in query) || (query.index_columns == null) || (query.index_columns.length === 0)) {
        return [null, fail("Index columns are not specified in create index query.")];
    }

    const indexColumns: IndexColumn[] = [];
    for (const [index, indexColumn] of query.index_columns.entries()) {
        if (indexColumn.type !== "column_ref") {
            return [null, fail(`Unsupported column definition format at position ${index + 1}.`)];
        }

        const column = indexColumn.column;
        const columnName = (typeof column === "string") ? column : column.expr.value;
        if (typeof columnName !== "string") {
            return [null, fail(`Unexpected analysis for column name at position ${index + 1}. `
                + `create_definitions[${index}].column.column : ${JSON.stringify(column)}`)];
        }

        const orderBy = indexColumn.order_by?.toUpperCase() || "";
        let nullsOrder: NullsOrderType = "";
        if (("nulls" in indexColumn) && (indexColumn.nulls != null)) {
            const nullsValue = indexColumn.nulls as string;
            if (nullsValue.includes("first")) {
                nullsOrder = "FIRST";
            } else if (nullsValue.includes("last")) {
                nullsOrder = "LAST";
            }
        }

        indexColumns.push({
            columnName: columnName,
            sortOrderType: orderBy as SortOrderType,
            nullsOrderType: nullsOrder,
        } as IndexColumn);
    }

    const indexName = query.index || "";
    const indexOption = query.index_using?.type.toUpperCase() || "";
    const indexType = query.index_type?.toUpperCase() || "";

    const indexDefinition: TableIndexDefinition = {
        indexName: indexName,
        indexColumns: indexColumns,
        indexOption: indexOption as TableIndexOption,
        indexType: indexType as TableIndexType,
    }

    return [
        { tableName, indexDefinition },
        null
    ];
};

export type DdlRelationDefinition = {
    constraintName: string;
    parentTableName: string;
    childTableName: string;
    parentColumnNames: string[];
    childColumnNames: string[];
    onUpdateAction: TableReferenceActionType;
    onDeleteAction: TableReferenceActionType;
};

const loadAlterTableDdl = (query: Alter, tableDefinitions: Map<string, TableBaseDefinition>): (
    [{ relationDefinitions: DdlRelationDefinition[], skippedReasons: LoadFailure[] }, null] | [null, LoadFailure]
) => {
    if ((query.table == null) || (query.table.length === 0)) {
        return [null, fail("Table name is not specified in alter table query.")];
    }
    if (query.table.length > 1) {
        return [null, fail("Unsupported multiple table names in alter table query.")];
    }

    const tableObj = query.table[0];
    if (!("table" in tableObj)) {
        return [null, fail("Table name is not specified in alter table query.")];
    }

    const childTableName = tableObj.table;
    if (childTableName === "") {
        return [null, fail("Table name is not specified in alter table query.")];
    }

    const childTableDefinition = tableDefinitions.get(childTableName);
    if (childTableDefinition == null) {
        return [null, skip(`Table "${childTableName}" is not defined in ddl.`)];
    }

    if ((Array.isArray(query.expr) === false) || (query.expr.length === 0)) {
        return [null, fail("Alter table query does not have expressions.")];
    }

    const relationDefinitions: DdlRelationDefinition[] = [];
    const skippedReasons: LoadFailure[] = [];

    for (const [index, expr] of query.expr.entries()) {
        if (!("action" in expr) || !("create_definitions" in expr) || !("constraint_type" in expr.create_definitions)) {
            return [null, fail("Unexpected analysis for alter table. "
                + `expr[${index}] : ${JSON.stringify(expr)}`
            )];
        }

        const createDefinition = expr.create_definitions;
        if ((expr.action !== "add") || (createDefinition.constraint_type !== "FOREIGN KEY")) {
            const message = 'Unsupported alter table query. Only supports "ADD FOREIGN KEY". '
                + `action : "${expr.action}", constraint type : "${expr.create_definitions.constraint_type}"`;
            skippedReasons.push(skip(message));
            continue;
        }

        if (!("definition" in createDefinition) || (Array.isArray(createDefinition.definition) === false)
            || !("reference_definition" in createDefinition)) {

            return [null, fail("Unexpected analysis for alter table. "
                + `expr[${index}].create_definitions : ${JSON.stringify(createDefinition)}`)];
        }

        const constraintName = (("constraint" in createDefinition) && (typeof createDefinition.constraint === "string"))
            ? createDefinition.constraint : "";

        const referenceDefinition = createDefinition.reference_definition;
        if (!("definition" in referenceDefinition) || (Array.isArray(referenceDefinition.definition) === false)
            || (referenceDefinition.definition.length === 0)
            || !("table" in referenceDefinition) || (Array.isArray(referenceDefinition.table) === false)
            || (referenceDefinition.table.length === 0)) {

            return [null, fail("Unexpected analysis for alter table. "
                + `expr[${index}].create_definitions.reference_definition : ${JSON.stringify(referenceDefinition)}`)];
        }

        const parentTableName = referenceDefinition.table[0].table as string;
        const parentTableDefinition = tableDefinitions.get(parentTableName);
        if (parentTableDefinition == null) {
            skippedReasons.push(skip(`Parent table "${parentTableName}" is not defined in ddl.`));
            continue;
        }

        const childColumnNames: string[] = [];
        for (const definition of createDefinition.definition) {
            if (!("type" in definition) || (definition.type !== "column_ref")) {
                return [null, fail(`Unsupported column definition format at position ${index + 1}. `
                    + `expr[${index}].create_definitions : ${JSON.stringify(createDefinition)}`
                )];
            }

            const column = definition.column;
            const columnName = (typeof column === "string") ? column : column.expr.value;
            if (typeof columnName !== "string") {
                return [null, fail(`Unexpected analysis for column name at position ${index + 1}. `
                    + `expr[${index}].create_definitions : ${JSON.stringify(createDefinition)}`)];
            }

            childColumnNames.push(columnName);
        }

        if (referenceDefinition.table.length > 1) {
            return [null, fail("Unsupported multiple table names in alter table query.")];
        }

        const parentColumnNames: string[] = [];
        for (const definition of referenceDefinition.definition) {
            if (!("type" in definition) || (definition.type !== "column_ref")) {
                return [null, fail(`Unsupported column definition format at position ${index + 1}. `
                    + `expr[${index}].create_definitions.reference_definition : ${JSON.stringify(referenceDefinition)}`
                )];
            }

            const column = definition.column;
            const columnName = (typeof column === "string") ? column : column.expr.value;
            if (typeof columnName !== "string") {
                return [null, fail(`Unexpected analysis for column name at position ${index + 1}. `
                    + `expr[${index}].create_definitions.reference_definition : ${JSON.stringify(referenceDefinition)}`)];
            }

            parentColumnNames.push(columnName);
        }

        if (parentColumnNames.length !== childColumnNames.length) {
            return [null, fail(`Parent and child column names are not matched at position ${index + 1}. `
                + `parent : ${JSON.stringify(parentColumnNames)}, child : ${JSON.stringify(childColumnNames)}`)];
        }

        let onUpdateAction: TableReferenceActionType = "NO ACTION";
        let onDeleteAction: TableReferenceActionType = "NO ACTION";
        if (("on_action" in referenceDefinition) && (Array.isArray(referenceDefinition.on_action))) {
            for (const onAction of referenceDefinition.on_action) {
                if (!("type" in onAction) || !("value" in onAction) || !("value" in onAction.value)
                    || (typeof onAction.value.value !== "string")) {

                    return [null, fail(`Unexpected analysis for on update action at position ${index + 1}. `
                        + `expr[${index}].create_definitions.reference_definition.on_action : ${JSON.stringify(onAction)}`)];
                }

                if (onAction.type === "on update") {
                    onUpdateAction = onAction.value.value.toUpperCase() as TableReferenceActionType;
                }
                if (onAction.type === "on delete") {
                    onDeleteAction = onAction.value.value.toUpperCase() as TableReferenceActionType;
                }
            }
        }

        relationDefinitions.push({
            constraintName,
            parentTableName,
            parentColumnNames,
            childTableName,
            childColumnNames,
            onUpdateAction,
            onDeleteAction,
        });
    }

    return [{ relationDefinitions, skippedReasons }, null]
};

type Comment = {
    type: "comment";
    target: {
        type: "table";
        name: {
            table: string;
        };
    } | {
        type: "column";
        name: {
            type: "column_ref";
            table: string;
            column: {
                expr: ValueExpr<string>;
            };
        };
    };
    expr: {
        keyword: string;
        expr: ValueExpr<string>;
    };
};

class ColumnTypeResolver {

    private databaseType: DatabaseType;
    private columnNameToColumnShare: Map<string, ColumnShareModel[]>;

    constructor(databaseType: DatabaseType, columnModelShareStorage: ColumnShareModelStorage) {
        this.databaseType = databaseType;
        this.columnNameToColumnShare = ColumnTypeResolver.initMapping(columnModelShareStorage);
    }

    private static initMapping(columnModelShareStorage: ColumnShareModelStorage) {
        const columnNameToColumnShare = new Map<string, ColumnShareModel[]>();
        for (const columnShare of columnModelShareStorage.getModels()) {
            const models = columnNameToColumnShare.get(columnShare.physicalName);
            if (models == null) {
                columnNameToColumnShare.set(columnShare.physicalName, [columnShare]);
                continue;
            }

            models.push(columnShare);
        }

        return columnNameToColumnShare;
    }

    public resolve(columnDefinition: ColumnBaseDefinition): ColumnShareModel | null {
        const physicalColumnName = columnDefinition.columnName;
        const logicalColumnName = (columnDefinition.comment !== "") ? columnDefinition.comment : physicalColumnName;

        const columnTypeParam = ((columnDefinition.precision != null) && (columnDefinition.scale != null))
            ? ` (${columnDefinition.precision}, ${columnDefinition.scale})`
            : ((columnDefinition.precision != null) ? ` (${columnDefinition.precision})` : "");
        const columnType = `${columnDefinition.columnType}${columnTypeParam}`.toUpperCase()
            + (columnDefinition.timezone !== "" ? ` ${columnDefinition.timezone}` : "");

        // TODO zerofill は未対応

        const columnShareModels = this.columnNameToColumnShare.get(physicalColumnName) ?? [];
        for (const target of columnShareModels) {
            if (target.logicalName !== logicalColumnName) {
                continue;
            }
            const specifiedColumnType = target.specifiedColumnType().toUpperCase();
            if (specifiedColumnType !== columnType) {
                continue;
            }
            if (target.unsigned !== columnDefinition.unsigned) {
                continue;
            }

            return target;
        }

        const columnTypes = findDatabaseColumns(this.databaseType);
        const targetColumnType = columnTypes.find(target => {
            const indexOfSpace = target.name.indexOf(" ");
            const columnTypeName = (indexOfSpace >= 0)
                ? target.name.substring(0, target.name.indexOf(" ")) : target.name;
            if (columnTypeName.toLowerCase() !== columnDefinition.columnType.toLowerCase()) {
                return false;
            }

            if ((columnDefinition.timezone !== "")
                && (target.name.includes(columnDefinition.timezone) === false)) {
                return false;
            }

            return true;
        });

        if (targetColumnType == null) {
            return null;
        }

        const columnShareModel = new ColumnShareModel({
            columnShareModelId: uuidV4(),
            physicalName: physicalColumnName,
            logicalName: logicalColumnName,
            columnType: targetColumnType,
            precision: columnDefinition.precision?.toString() || "",
            scale: columnDefinition.scale?.toString() || "",
            unsigned: columnDefinition.unsigned,
        });

        columnShareModels.push(columnShareModel);
        this.columnNameToColumnShare.set(physicalColumnName, columnShareModels);

        return columnShareModel;
    }
}

export const importDdl = (loadResult: DdlLoadResult) => {
    const { tableDefinitions, relationDefinitions } = loadResult;

    const { tableModels, columnShareModels, nameToColumnModels } = doInitTableModels(tableDefinitions);

    const nameToTableModelIds = new Map<string, string>(
        tableModels.map(tableModel => [tableModel.physicalName, tableModel.tableModelId])
    );

    const relationModels = relationDefinitions.map(relation => {
        const parentTableName = relation.parentTableName;
        const childTableName = relation.childTableName;

        const relationPairs = relation.parentColumnNames.map((parentColumnName, index) => {
            const parentColumnModel = nameToColumnModels.get(`${parentTableName}:${parentColumnName}`) as ColumnModel;
            const childColumnName = relation.childColumnNames[index];
            const childColumnModel = nameToColumnModels.get(`${childTableName}:${childColumnName}`) as ColumnModel;

            return new RelationPair({
                parentColumnModelId: parentColumnModel.columnModelId,
                childColumnModelId: childColumnModel.columnModelId,
            });
        });

        return new RelationModel({
            relationName: relation.constraintName,
            parentTableModelId: nameToTableModelIds.get(parentTableName) as string,
            childTableModelId: nameToTableModelIds.get(childTableName) as string,
            childCardinality: "0..N",
            relationPairs: relationPairs,
            onUpdateAction: relation.onUpdateAction,
            onDeleteAction: relation.onDeleteAction,
        });
    });

    const columnModels = Array.from(nameToColumnModels.values());

    return { tableModels, columnModels, columnShareModels, relationModels };
};

const doInitTableModels = (tableDefinitions: DdlTableDefinition[]) => {
    const columnShareModels: ColumnShareModel[] = [];
    const nameToColumnModels = new Map<string, ColumnModel>();

    const tableModels = tableDefinitions.map(tableDefinition => {
        const physicalTableName = tableDefinition.tableName;

        const columnModelTypes = tableDefinition.columnDefinitions.map(columnDefinition => {
            const columnShareModel = columnDefinition.columnShareModel;

            columnShareModels.push(columnShareModel);
            const columnModel = new ColumnModel({
                columnShareModelId: columnShareModel.columnShareModelId,
                primaryKey: columnDefinition.primaryKey,
                notNull: columnDefinition.notNull,
                unique: columnDefinition.unique,
                autoIncrement: columnShareModel.columnType.withAutoIncrement && columnDefinition.autoIncrement,
                defaultValue: columnDefinition.defaultValue,
            });

            nameToColumnModels.set(`${physicalTableName}:${columnShareModel.physicalName}`, columnModel);

            return {
                modelType: "single",
                columnModelId: columnModel.columnModelId,
            } as ColumnModelType;
        });

        const tableIndexModels = tableDefinition.tableIndexDefinitions.map(indexDefinition => {
            const indexColumnModels = indexDefinition.indexColumns.map(indexColumn => {
                const columnModel = nameToColumnModels.get(`${physicalTableName}:${indexColumn.columnName}`) as ColumnModel;

                return new IndexColumnModel({
                    columnModelId: columnModel.columnModelId,
                    sortOrderType: indexColumn.sortOrderType,
                    nullsOrderType: indexColumn.nullsOrderType,
                });
            });

            return new TableIndexModel({
                tableIndexModelId: uuidV4(),
                physicalName: indexDefinition.indexName,
                indexColumnModels: indexColumnModels,
                indexOption: indexDefinition.indexOption,
                indexType: indexDefinition.indexType,
            });
        });

        return new TableModel({
            tableModelId: uuidV4(),
            physicalName: physicalTableName,
            logicalName: (tableDefinition.comment !== "") ? tableDefinition.comment : physicalTableName,
            columns: columnModelTypes,
            tableIndexModels: tableIndexModels,
        });
    });

    return { tableModels, columnShareModels, nameToColumnModels };
};