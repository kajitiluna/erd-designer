import { v4 as uuidV4 } from 'uuid';
import { Parser as PostgresParser } from "node-sql-parser/build/postgresql";
import { Parser as MySqlParser } from "node-sql-parser/build/mysql";
// cSpell: ignore transactsql mariadb sqlite
import { Parser as MsSqlServerParser } from "node-sql-parser/build/transactsql";
import { Parser as MariaDbParser } from "node-sql-parser/build/mariadb";
import { Parser as SqliteParser } from "node-sql-parser/build/sqlite";
import { Parser as SnowflakeParser } from "node-sql-parser/build/snowflake";
import { Parser as BigQueryParser } from "node-sql-parser/build/bigquery";
import { Alter, AST, Create, DataType, Parser, ValueExpr } from "node-sql-parser";

import {
    Database, DatabaseType, IndexColumnModel, TableReferenceActionType
} from "~/models/database";
import { DeclaredColumnType } from "~/models/schema/column-type-match";
import ErdDocument from "~/models/ErdDocument";
import { TableIndexOption, TableIndexType } from "~/models/database/TableIndexSupport";
import ColumnShareModelStorage from "~/models/ColumnShareModelStorage";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import ColumnModel from '~/models/database/ColumnModel';
import ColumnEntry from '~/models/database/ColumnEntry';
import SimpleColumnModel from '~/models/database/SimpleColumnModel';
import TableIndexModel from '~/models/database/TableIndexModel';
import TableModel from '~/models/database/TableModel';
import RelationPair from '~/models/database/RelationPair';
import RelationModel from '~/models/database/RelationModel';
import { NullsOrderType, SortOrderType } from '~/models/database/ValueType';
import TableUniqueKeysModel, { UniqueKeysColumnModel } from '~/models/database/TableUniqueKeysModel';

export const loadDdl = (erdDocument: ErdDocument, ddl: string, separator: string = ""): DdlLoadResult => {
    const ddlLoader = new DdlLoader(erdDocument, separator);
    return ddlLoader.load(ddl);
};

export type DdlLoadResult = {
    summaries: DdlLoadSummary[];
    tableDefinitions: DdlTableDefinition[];
    relationDefinitions: DdlRelationDefinition[];
};

const dispatchInitParser: { [key in DatabaseType]: () => Parser } = {
    "postgres": () => new PostgresParser(),
    "mysql": () => new MySqlParser(),
    "mariadb": () => new MariaDbParser(),
    "ms_sqlserver": () => new MsSqlServerParser(),
    "sqlite": () => new SqliteParser(),
    "bigquery": () => new BigQueryParser(),
    "snowflake": () => new SnowflakeParser(),
};

class DdlLoader {

    private readonly parser: Parser;
    private readonly existedTableNames: Set<string>;
    private readonly parseOption: { database: string };
    private readonly resolver: ColumnTypeResolver;

    private tableNames: string[];
    private tableBaseDefinitions: Map<string, TableBaseDefinition>;
    private relationDefinitions: DdlRelationDefinition[];
    private summaries: DdlLoadSummary[];

    constructor(erdDocument: ErdDocument, separator: string = "") {
        const database = erdDocument.getDatabase();
        const databaseType = database.databaseType;

        this.parser = dispatchInitParser[databaseType]();
        this.existedTableNames = new Set(erdDocument.getTableViewModels()
            .map(tableView => tableView.tableModel.physicalName));
        this.parseOption = parseOptions[databaseType];
        this.resolver = new ColumnTypeResolver(database, erdDocument.getColumnShareModelStorage(), separator);

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
            const location = ((error != null) && (typeof error === "object") && ("location" in error)) ?
                `\nat ${JSON.stringify(error.location)}` : "";
            return {
                summaries: [{
                    result: "failure",
                    message: `Failed to parse DDL: ${error instanceof Error ? error.message : String(error)}${location}`,
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
                        return null;
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

    private parserEngine(): ParserEngine {
        const parser = this.parser;
        const parseOption = this.parseOption;

        return { parse: (query: object) => parser.exprToSQL(query, parseOption) };
    }

    private doLoadCreateTableDdl(query: Create) {
        const sql = this.parser.sqlify(query, this.parseOption);

        const [tableDefinition, noSuccessResult] = loadCreateTableDdl(query, this.parserEngine());
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

type ParserEngine = { parse: (query: object) => string };

const parseOptions: { [key in DatabaseType]: { database: string } } = {
    "postgres": { database: "PostgreSQL" },
    "mysql": { database: "MySQL" },
    "mariadb": { database: "MariaDB" },
    "ms_sqlserver": { database: "TransactSQL" },
    "sqlite": { database: "Sqlite" },
    "bigquery": { database: "BigQuery" },
    "snowflake": { database: "Snowflake" },
};

type DdlLoadSummary = {
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
    checkExpression: string;
    characterSet: string;
    collate: string;
    tableOption: string;
};

type ColumnBaseDefinition = {
    columnName: string;
    columnType: string;
    timezone: "with time zone" | "without time zone" | "";
    unsigned: boolean;
    zeroFill: boolean;
    precision: number | "max" | null;
    scale: number | null;
    primaryKey: boolean;
    notNull: boolean;
    unique: boolean;
    autoIncrement: boolean;
    isArray: boolean;
    defaultValue: string;
    comment: string;
    checkExpression: string;
    characterSet: string;
    collate: string;
    columnOption: string;
};

type DdlTableDefinition = { columnDefinitions: ColumnDefinition[] } & TableBaseDefinition;

type ColumnDefinition = ColumnBaseDefinition & { columnShareModel: ColumnShareModel };

type UpdateColumnDefinition = {
    index: number;
    columnDefinition: ColumnBaseDefinition;
};

type TableIndexDefinition = {
    indexName: string;
    indexColumns: IndexColumn[];
    indexOption: TableIndexOption;
    indexType: TableIndexType;
    clustered: boolean;
    uniqueKeyConstraint: boolean;
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

const loadCreateTableDdl = (query: Create, engine: ParserEngine): ([TableBaseDefinition, null] | [null, LoadFailure]) => {
    const [tableObj, failure] = doFindTableObj(query);
    if (failure != null) {
        return [null, failure];
    }

    const tableName = tableObj.table || "";
    if (tableName === "") {
        return [null, fail("Table name is not specified in create table query.")];
    }

    const columnBaseDefinitions: ColumnBaseDefinition[] = [];
    const tableIndexDefinitions: TableIndexDefinition[] = [];
    let checkExpression = "";
    const skippedReasons: LoadFailure[] = [];

    for (const [index, createDefinition] of (query.create_definitions || []).entries()) {
        // CreateColumnDefinition 型の場合
        if (createDefinition.resource === "column") {
            const [columnDefinition, noSuccessResult] =
                loadCreateColumnDefinition(createDefinition as CreateColumnDefinition, index, engine);
            if (noSuccessResult != null) {
                if (noSuccessResult.result === "failure") {
                    return [null, noSuccessResult];
                }

                skippedReasons.push(noSuccessResult);
                continue;
            }

            columnBaseDefinitions.push(columnDefinition);
            continue;
        }

        // CreateConstraintDefinition 型の場合
        if (createDefinition.resource === "constraint") {
            const constraintDefinition = createDefinition as CreateConstraintDefinition;
            const [result, noSuccessResult] =
                loadCreateConstraintDefinition(constraintDefinition, index, columnBaseDefinitions, engine);
            if (noSuccessResult != null) {
                if (noSuccessResult.result === "failure") {
                    return [null, noSuccessResult];
                }

                skippedReasons.push(noSuccessResult);
                continue;
            }

            const { nextColumnDefinitions, tableIndexDefinition, checkExpression: expression } = result;

            nextColumnDefinitions.forEach(nextColumnDefinition => {
                columnBaseDefinitions[nextColumnDefinition.index] = nextColumnDefinition.columnDefinition;
            });

            if (tableIndexDefinition != null) {
                tableIndexDefinitions.push(tableIndexDefinition);
            }

            if (expression != null) {
                checkExpression = expression;
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
    let characterSet = "";
    let collate = "";
    const tableOptions = [];
    if (("table_options" in query) && (query.table_options != null) && Array.isArray(query.table_options)) {
        for (const option of query.table_options) {
            if ((("keyword" in option) === false) || (("value" in option) === false)) {
                continue;
            }

            if (option.keyword === "comment") {
                comment = option.value || "";
                if (comment.startsWith("'") && (comment.endsWith("'")) && (comment.length > 1)) {
                    comment = comment.slice(1, -1); // Remove surrounding single quotes
                }

                continue;
            }

            if (option.keyword === "character set") {
                characterSet = parseValue(option.value);
                continue;
            }
            if (option.keyword === "collate") {
                collate = parseValue(option.value);
                continue;
            }

            const tableOption = [
                option.keyword.toUpperCase(),
                ("symbol" in option) ? option.symbol : null,
                parseValue(option.value)
            ].filter(option => (option != null)).join(" ");
            tableOptions.push(tableOption);
        }
    }

    return [
        {
            tableName: tableName,
            columnDefinitions: columnBaseDefinitions,
            tableIndexDefinitions: tableIndexDefinitions.map(definition => {
                if (definition.uniqueKeyConstraint || (definition.indexName != "")) {
                    return definition;
                }

                const columnNames = definition.indexColumns.map(column => column.columnName);

                return {
                    ...definition,
                    indexName: `index_${tableName}__${columnNames.join("_")}`,
                }
            }),
            skippedReasons, comment, checkExpression, characterSet, collate,
            tableOption: tableOptions.join(" ")
        },
        null
    ];
};

const parseValue = (value: unknown) => {
    if (value == null) {
        return "";
    }

    if (typeof value === "string") {
        return value;
    }

    if ((typeof value === "object") && ("value" in value)) {
        return String(value.value);
    }

    return String(value);
};

const doFindTableObj = (query: Create): ([{ db: string | null; table: string }, null] | [null, LoadFailure]) => {
    if (query.table == null) {
        return [null, fail("Table name is not specified in create table query.")];
    }

    if (Array.isArray(query.table) === false) {
        return [query.table, null];
    }

    if (query.table.length === 0) {
        return [null, fail("Table name is not specified in create table query.")];
    }
    if (query.table.length > 1) {
        return [null, fail("Unsupported multiple table names in create table query.")];
    }

    return [query.table[0], null];
};

const loadCreateColumnDefinition = (
    createDefinition: CreateColumnDefinition, index: number, engine: ParserEngine
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
    if (dataType.dataType === "STRUCT") {
        return [null, skip(`Column "${columnName}" has an unsupported STRUCT type at position ${index + 1}. `
            + "Reading STRUCT columns from DDL is not supported.")];
    }

    const { columnType, isArray } = resolveColumnType(dataType);
    if (columnType == null) {
        return [null, fail(`Unsupported ARRAY column definition at position ${index + 1}. `
            + `create_definitions[${index}].definition : ${JSON.stringify(dataType)}`)];
    }
    if (columnType.toUpperCase() === "STRUCT") {
        return [null, skip(`Column "${columnName}" has an unsupported ARRAY<STRUCT<...>> type at position ${index + 1}. `
            + "Reading STRUCT columns from DDL is not supported.")];
    }

    const timezone = (dataType.suffix && (dataType.suffix.length === 3)
        && (dataType.suffix[1] === "TIME") && (dataType.suffix[2] === "ZONE"))
        ? ((dataType.suffix[0] === "WITH") ? "with time zone" : "without time zone") : "";
    const unsigned = (dataType.suffix && (dataType.suffix.length === 1) && (dataType.suffix[0] === "UNSIGNED")) || false;
    const zeroFill = (dataType.suffix && (dataType.suffix.length === 1) && (dataType.suffix[0] === "ZEROFILL")) || false;
    const precision = dataType.length || null;
    const scale = dataType.scale || null;

    const notNull = (createDefinition.nullable != null) && (createDefinition.nullable.value === "not null");
    const unique = (createDefinition.unique != null) || false;
    const autoIncrement = (createDefinition.auto_increment != null) || false;

    const defaultValue = (createDefinition.default_val != null) ? engine.parse(createDefinition.default_val.value) : "";

    let comment = "";
    if (createDefinition.comment != null) {
        const commentObj = createDefinition.comment.value;
        if (typeof commentObj === "object") {
            comment = (commentObj as ValueExpr<string>).value || "";
        } else {
            comment = String(commentObj);
        }
    }

    const checkExpression = (
        ("check" in createDefinition) && (typeof createDefinition.check === "object")
        && (createDefinition.check !== null) && ("definition" in createDefinition.check)
        && (Array.isArray(createDefinition.check.definition)) && (createDefinition.check.definition.length > 0)
    ) ? engine.parse(createDefinition.check.definition[0]) : "";

    const characterSet = (createDefinition.character_set != null)
        ? parseValue(createDefinition.character_set.value) : "";

    const collate = ((createDefinition.collate != null) && ("name" in createDefinition.collate.collate))
        ? String(createDefinition.collate.collate.name) : "";

    const columnOption = [
        ((createDefinition.column_format != null) && ("value" in createDefinition.column_format))
            ? `COLUMN_FORMAT ${String(createDefinition.column_format.value).toUpperCase()}` : null,
        ((createDefinition.storage != null) && ("value" in createDefinition.storage))
            ? `STORAGE ${String(createDefinition.storage.value).toUpperCase()}` : null
    ].filter(option => (option != null)).join(" ");

    return [
        {
            columnName, columnType, timezone, unsigned, zeroFill, precision, scale,
            primaryKey: false, notNull, unique, autoIncrement, isArray, defaultValue, comment,
            checkExpression, characterSet, collate, columnOption
        }, null
    ];
};

const resolveColumnType = (
    dataType: DataType
): { columnType: string | null, isArray: boolean } => {
    if (dataType.dataType === "ARRAY") {
        if (isBigQueryArrayDataType(dataType) === false) {
            return { columnType: null, isArray: false };
        }

        return { columnType: dataType.definition[0].field_type.dataType, isArray: true };
    }

    return dataType.dataType.endsWith("[]")
        ? { columnType: dataType.dataType.slice(0, -2), isArray: true }
        : { columnType: dataType.dataType, isArray: false };
};

// BigQuery ダイアレクトの ARRAY<T> は `{ dataType: "ARRAY", definition: [{ field_type: { dataType: T } }] }`
// という汎用の DataType 型に含まれない拡張構造を持つため、内部型を個別に解決する。
type BigQueryArrayDataType = {
    dataType: "ARRAY";
    definition: [{ field_type: { dataType: string } }];
};

const isBigQueryArrayDataType = (dataType: object): dataType is BigQueryArrayDataType => {
    if (("dataType" in dataType) === false) {
        return false;
    }
    if (dataType.dataType !== "ARRAY") {
        return false;
    }
    if ((("definition" in dataType) === false) || (Array.isArray(dataType.definition) === false)) {
        return false;
    }

    const definition = dataType.definition;
    return (definition.length === 1)
        && (typeof definition[0] === "object") && (definition[0] != null)
        && ("field_type" in definition[0])
        && (typeof definition[0].field_type === "object") && (definition[0].field_type != null)
        && ("dataType" in definition[0].field_type)
        && (typeof definition[0].field_type.dataType === "string");
};

type CreateConstraintDefinition = Extract<CreateDefinition, { resource: 'constraint' }>;
type CreateConstraintPrimary = Extract<CreateConstraintDefinition, { constraint_type: 'primary key' }>;
type CreateConstraintUnique = Extract<CreateConstraintDefinition, {
    constraint_type: 'unique' | 'unique key' | 'unique index';
}>;

type LoadedConstraintDefinition = {
    nextColumnDefinitions: UpdateColumnDefinition[],
    tableIndexDefinition?: TableIndexDefinition,
    checkExpression?: string,
};

const loadCreateConstraintDefinition = (
    createDefinition: CreateConstraintDefinition, index: number, columnDefinitions: ColumnBaseDefinition[],
    engine: ParserEngine
): ([LoadedConstraintDefinition, null] | [null, LoadFailure]) => {

    if (createDefinition.constraint_type === "primary key") {
        const [nextColumnDefinitions, noSuccessResult] =
            doLoadCreatePrimaryKeyDefinition(createDefinition as CreateConstraintPrimary, index, columnDefinitions);

        if (noSuccessResult != null) {
            return [null, noSuccessResult];
        }

        return [{ nextColumnDefinitions }, null];
    }

    if ((createDefinition.constraint_type === "unique")
        || (createDefinition.constraint_type === "unique key")
        || (createDefinition.constraint_type === "unique index")) {

        const uniqueKeyConstraint = createDefinition.constraint_type !== "unique index";
        const [nextColumnDefinition, tableIndexDefinition, noSuccessResult] =
            doLoadCreateUniqueKeyDefinition(createDefinition as CreateConstraintUnique,
                uniqueKeyConstraint, index, columnDefinitions);

        if (noSuccessResult != null) {
            return [null, noSuccessResult];
        }

        if (nextColumnDefinition != null) {
            return [{ nextColumnDefinitions: [nextColumnDefinition] }, null];
        }

        return [{ nextColumnDefinitions: [], tableIndexDefinition }, null];
    }

    if ((createDefinition.constraint_type === "check") && (createDefinition.definition.length > 0)) {
        const checkExpression = engine.parse(createDefinition.definition[0]);
        return [{ nextColumnDefinitions: [], checkExpression }, null]
    }

    return [null, skip(`Unsupported constraint type "${createDefinition.constraint_type}" at position ${index + 1}.`)];
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
    createDefinition: CreateConstraintUnique, uniqueKeyConstraint: boolean,
    index: number, columnDefinitions: ColumnBaseDefinition[]
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

    const clustered = (createDefinition.index?.toUpperCase() === "CLUSTERED") || false;

    // MS SQL Server にて、クラスタインデクス定義が指定された場合は、カラム単独のユニーク制約は定義しない
    if ((createDefinition.definition.length === 1) && (clustered === false)) {
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
            indexColumns: indexedColumns.map(columnName => {
                return {
                    columnName,
                    sortOrderType: "",
                    nullsOrderType: "",
                } as IndexColumn;
            }),
            indexOption: "UNIQUE",
            indexType: indexType as TableIndexType,
            clustered: clustered,
            uniqueKeyConstraint: uniqueKeyConstraint,
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

    // TODO MS SQL Server の場合、本来は CREATE TABLE 内の `INDEX <index_name> CLUSTERED (...)` の構文でクラスタインデクスが定義できる。
    // しかし node-sql-parser がパース失敗するため、クラスタインデクスの定義は未対応。
    return [
        {
            indexName: constraintName,
            indexColumns: indexedColumns.map(columnName => {
                return {
                    columnName,
                    sortOrderType: "",
                    nullsOrderType: "",
                } as IndexColumn;
            }),
            indexOption: indexOption as TableIndexOption,
            indexType: indexType as TableIndexType,
            clustered: false,
            uniqueKeyConstraint: false,
        },
        null
    ];
};

const loadCreateIndexDdl = (query: Create): (
    [{ tableName: string, indexDefinition: TableIndexDefinition }, null] | [null, LoadFailure]
) => {

    const [tableObj, failure] = doFindTableObj(query);
    if (failure != null) {
        return [null, failure];
    }

    const tableName = tableObj.table || "";
    if (tableName === "") {
        return [null, fail("Table name is not specified in create table query.")];
    }

    if ((("index_columns" in query) === false) || (query.index_columns == null) || (query.index_columns.length === 0)) {
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

        const sortOrderType = (indexColumn.order_by?.toUpperCase() || "") as SortOrderType;
        let nullsOrderType: NullsOrderType = "";
        if (("nulls" in indexColumn) && (indexColumn.nulls != null)) {
            const nullsValue = indexColumn.nulls as string;
            if (nullsValue.includes("first")) {
                nullsOrderType = "FIRST";
            } else if (nullsValue.includes("last")) {
                nullsOrderType = "LAST";
            }
        }

        indexColumns.push({ columnName, sortOrderType, nullsOrderType, });
    }

    // TODO 現状、CREATE INDEX 文でスキーマ指定されたインデクスは読み込みできないので、スキーマは未対応
    const indexName = ((query.index != null) && (typeof query.index === "object"))
        ? query.index.name : (query.index || "") as string;
    const queryIndexType = query.index_type?.toUpperCase() || "";
    const usingIndexType = query.index_using?.type.toUpperCase() || "";

    const clustered = (queryIndexType === "CLUSTERED");
    const indexOption = (clustered ? "" : queryIndexType) as TableIndexOption;

    const indexDefinition: TableIndexDefinition = {
        indexName: indexName,
        indexColumns: indexColumns,
        indexOption: indexOption,
        indexType: usingIndexType as TableIndexType,
        clustered: clustered,
        uniqueKeyConstraint: false,
    }

    return [
        { tableName, indexDefinition },
        null
    ];
};

type DdlRelationDefinition = {
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
        return [null, skip("Table name is not specified in alter table query.")];
    }
    if (query.table.length > 1) {
        return [null, skip("Unsupported multiple table names in alter table query.")];
    }

    const tableObj = query.table[0];
    if (("table" in tableObj) === false) {
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
        if (("action" in expr) === false) {
            return [null, fail("Unexpected analysis for alter table. "
                + `expr[${index}] : ${JSON.stringify(expr)}`
            )];
        }

        if (expr.action !== "add") {
            const message = 'Unsupported alter table query. Only supports "ADD FOREIGN KEY". '
                + `action : "${expr.action}"`;
            skippedReasons.push(skip(message));
            continue;
        }

        if ((("create_definitions" in expr) === false) || (("constraint_type" in expr.create_definitions) === false)) {
            return [null, skip("Unexpected analysis for alter table. "
                + `expr[${index}] : ${JSON.stringify(expr)}`
            )];
        }

        const createDefinition = expr.create_definitions;
        if (createDefinition.constraint_type.toUpperCase() === "FOREIGN KEY") {
            const [relationDefinition, failure] =
                doLoadAlterForeignKeyDdl(childTableName, index, createDefinition, tableDefinitions);
            if (failure != null) {
                if (failure.result === "failure") {
                    return [null, failure];
                }

                skippedReasons.push(failure);
                continue;
            }

            relationDefinitions.push(relationDefinition);
            continue;
        }
        if (createDefinition.constraint_type.toUpperCase() === "UNIQUE") {
            const [tableIndexDefinition, failure] = doLoadAlterUniqueDdl(index, createDefinition);
            if (failure != null) {
                if (failure.result === "failure") {
                    return [null, failure];
                }

                skippedReasons.push(failure);
                continue;
            }

            childTableDefinition.tableIndexDefinitions.push(tableIndexDefinition);
            continue;
        }

        const message = 'Unsupported alter table query. Only supports "ADD FOREIGN KEY" or "ADD CONSTRAINT UNIQUE". '
            + `action : "${expr.action}", constraint type : "${expr.create_definitions.constraint_type}"`;
        skippedReasons.push(skip(message));
    }

    return [{ relationDefinitions, skippedReasons }, null]
};

const doLoadAlterForeignKeyDdl = (
    childTableName: string, index: number, createDefinition: object, tableDefinitions: Map<string, TableBaseDefinition>
): ([DdlRelationDefinition, null] | [null, LoadFailure]) => {

    if ((("definition" in createDefinition) === false) || (Array.isArray(createDefinition.definition) === false)
        || (("reference_definition" in createDefinition) === false)) {

        return [null, fail("Unexpected analysis for alter table. "
            + `expr[${index}].create_definitions : ${JSON.stringify(createDefinition)}`)];
    }

    const constraintName = (("constraint" in createDefinition) && (typeof createDefinition.constraint === "string"))
        ? createDefinition.constraint : "";

    const referenceDefinition = createDefinition.reference_definition as object;
    if ((("definition" in referenceDefinition) === false) || (Array.isArray(referenceDefinition.definition) === false)
        || (referenceDefinition.definition.length === 0)
        || (("table" in referenceDefinition) === false) || (Array.isArray(referenceDefinition.table) === false)
        || (referenceDefinition.table.length === 0)) {

        return [null, fail("Unexpected analysis for alter table. "
            + `expr[${index}].create_definitions.reference_definition : ${JSON.stringify(referenceDefinition)}`)];
    }

    const parentTableName = referenceDefinition.table[0].table as string;
    const parentTableDefinition = tableDefinitions.get(parentTableName);
    if (parentTableDefinition == null) {
        return [null, skip(`Parent table "${parentTableName}" is not defined in ddl.`)];
    }

    const childColumnNames: string[] = [];
    for (const definition of createDefinition.definition) {
        if ((("type" in definition) === false) || (definition.type !== "column_ref")) {
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
        if ((("type" in definition) === false) || (definition.type !== "column_ref")) {
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
            if ((("type" in onAction) === false) || (("value" in onAction) === false)
                || (("value" in onAction.value) === false)
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

    return [
        {
            constraintName, parentTableName, parentColumnNames, childTableName, childColumnNames,
            onUpdateAction, onDeleteAction,
        },
        null
    ];
};

const doLoadAlterUniqueDdl = (index: number, createDefinition: object): ([TableIndexDefinition, null] | [null, LoadFailure]) => {

    if ((("definition" in createDefinition) === false) || (Array.isArray(createDefinition.definition) === false)) {
        return [null, fail("Unexpected analysis for alter table. "
            + `expr[${index}].create_definitions : ${JSON.stringify(createDefinition)}`)];
    }

    const constraintName = (("constraint" in createDefinition) && (typeof createDefinition.constraint === "string"))
        ? createDefinition.constraint : "";

    const indexColumns: IndexColumn[] = [];
    for (const definition of createDefinition.definition) {
        if ((("type" in definition) === false) || (definition.type !== "column_ref")) {
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

        const sortOrderType: SortOrderType = (("order_by" in definition) && (typeof definition.order_by === "string"))
            ? definition.order_by.toUpperCase() : "";

        indexColumns.push({ columnName, sortOrderType, nullsOrderType: "" });
    }

    return [
        {
            indexName: constraintName,
            indexColumns: indexColumns,
            indexOption: "UNIQUE" as TableIndexOption,
            indexType: "" as TableIndexType,
            clustered: isClusteredIndexInAlterDdl(createDefinition),
            uniqueKeyConstraint: true,
        },
        null
    ];
};

// MS SQL Server の場合、 ALTER TABLE 構文にてクラスタユニーク制約が定義されているかを判定する
const isClusteredIndexInAlterDdl = (createDefinition: object) => {
    if (("index" in createDefinition) === false) {
        return false;
    }

    if (typeof createDefinition.index !== "string") {
        return false;
    }

    return (createDefinition.index.toUpperCase() === "CLUSTERED");
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

    private readonly database: Database;
    private readonly columnNameToColumnShare: Map<string, ColumnShareModel[]>;
    private readonly separator: string;

    constructor(database: Database, columnModelShareStorage: ColumnShareModelStorage, separator: string) {
        this.database = database;
        this.columnNameToColumnShare = ColumnTypeResolver.initMapping(columnModelShareStorage);
        this.separator = separator;
    }

    private static initMapping(columnModelShareStorage: ColumnShareModelStorage) {
        const columnNameToColumnShare = new Map<string, ColumnShareModel[]>();
        for (const columnShare of columnModelShareStorage.getColumnShareModels()) {
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
        const [logicalName, description] = parseComment(columnDefinition.comment, this.separator);
        const logicalColumnName = (logicalName !== "") ? logicalName : physicalColumnName;

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
            if (target.description !== description) {
                continue;
            }
            if (target.checkExpression !== columnDefinition.checkExpression) {
                continue;
            }
            if (target.characterSet(this.database) !== columnDefinition.characterSet) {
                continue;
            }
            if (target.collate !== columnDefinition.collate) {
                continue;
            }
            if (target.optionExpression !== columnDefinition.columnOption) {
                continue;
            }

            const specifiedColumnType = target.specifiedColumnType().toUpperCase();
            if (specifiedColumnType !== columnType) {
                continue;
            }
            if (target.unsigned !== columnDefinition.unsigned) {
                continue;
            }
            if (target.isArray !== columnDefinition.isArray) {
                continue;
            }

            return target;
        }

        const targetColumnType = DeclaredColumnType.find(this.database.databaseType, columnDefinition);
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
            isArray: columnDefinition.isArray,
            description: description,
            checkExpression: columnDefinition.checkExpression,
            characterSet: (this.database.editableCharacterSet && (targetColumnType.category === "text"))
                ? columnDefinition.characterSet : "",
            collate: (targetColumnType.category === "text") ? columnDefinition.collate : "",
            optionExpression: columnDefinition.columnOption
        });

        columnShareModels.push(columnShareModel);
        this.columnNameToColumnShare.set(physicalColumnName, columnShareModels);

        return columnShareModel;
    }
}

const parseComment = (comment: string, separator: string): [string, string] => {
    if ((separator === "") || (comment === "")) {
        return [comment, ""];
    }

    const indexOfSeparator = comment.indexOf(separator);
    if (indexOfSeparator <= 0) {
        return [comment, ""];
    }

    return [
        comment.substring(0, indexOfSeparator).trim(),
        comment.substring(indexOfSeparator + separator.length).trim()
    ];
}

export const importDdl = (database: Database, loadResult: DdlLoadResult, separator: string = "") => {
    const { tableDefinitions, relationDefinitions } = loadResult;

    const { tableModels, columnShareModels, nameToColumnModels }
        = doInitTableModels(database, tableDefinitions, separator);

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

const doInitTableModels = (database: Database, tableDefinitions: DdlTableDefinition[], separator: string) => {
    const columnShareModels: ColumnShareModel[] = [];
    const nameToColumnModels = new Map<string, ColumnModel>();

    const tableModels = tableDefinitions.map(tableDefinition => {
        const physicalTableName = tableDefinition.tableName;
        const [logicalName, description] = parseComment(tableDefinition.comment, separator);
        const logicalTableName = (logicalName !== "") ? logicalName : physicalTableName;

        const columnEntries = tableDefinition.columnDefinitions.map(columnDefinition => {
            const columnShareModel = columnDefinition.columnShareModel;

            columnShareModels.push(columnShareModel);
            const columnModel = new SimpleColumnModel({
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
            } as ColumnEntry;
        });

        const uniqueKeysModels = tableDefinition.tableIndexDefinitions
            .filter(uniqueKeyDefinition => (uniqueKeyDefinition.uniqueKeyConstraint === true))
            .map(uniqueKeyDefinition => {
                const uniqueKeyColumnModels = uniqueKeyDefinition.indexColumns.map(uniqueKeyColumn => {
                    const columnModel = nameToColumnModels.get(`${physicalTableName}:${uniqueKeyColumn.columnName}`)!;

                    return new UniqueKeysColumnModel({
                        columnModelId: columnModel.columnModelId,
                        sortOrderType: uniqueKeyColumn.sortOrderType
                    });
                });

                return new TableUniqueKeysModel({
                    tableUniqueKeysModelId: uuidV4(),
                    physicalName: uniqueKeyDefinition.indexName,
                    uniqueKeysColumnModels: uniqueKeyColumnModels
                });
            });

        const tableIndexModels = tableDefinition.tableIndexDefinitions
            .filter(indexDefinition => (indexDefinition.uniqueKeyConstraint === false))
            .map(indexDefinition => {
                const indexColumnModels = indexDefinition.indexColumns.map(indexColumn => {
                    const columnModel = nameToColumnModels.get(`${physicalTableName}:${indexColumn.columnName}`)!;

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
                    clustered: indexDefinition.clustered,
                });
            });

        return new TableModel({
            tableModelId: uuidV4(),
            physicalName: physicalTableName,
            logicalName: logicalTableName,
            columnEntries: columnEntries,
            uniqueKeysModels: uniqueKeysModels,
            tableIndexModels: tableIndexModels,
            description: description,
            checkExpression: tableDefinition.checkExpression,
            characterSet: (database.supportsTableCollate && database.editableCharacterSet)
                ? tableDefinition.characterSet : "",
            collate: (database.supportsTableCollate) ? tableDefinition.collate : "",
            optionExpression: tableDefinition.tableOption,
        });
    });

    return { tableModels, columnShareModels, nameToColumnModels };
};