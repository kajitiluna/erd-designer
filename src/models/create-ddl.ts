import { Database, DatabaseType } from "~/models/database";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import DbSchemaModel from "~/models/database/DbSchemaModel";
import RelationModel from "~/models/database/RelationModel";
import { overrideColumnName } from "~/models/database/support";
import TableModel from "~/models/database/TableModel";
import TableUniqueKeysModel from "~/models/database/TableUniqueKeysModel";
import ErdDocument from "~/models/ErdDocument";
import { DdlCommentStyle } from "~/models/ExportDdlSettingModel";
import TableViewModel from "~/models/TableViewModel";

type DdlOption = {
    withTable: boolean,
    withIndex: boolean,
    withForeignKey: boolean,
    withSchema: boolean,
    withComment: boolean,
    commentStyle: DdlCommentStyle,
    commentSeparator: string
};

export const createDdl = (erdDocument: ErdDocument, option: DdlOption) => {
    const database: Database = erdDocument.getDatabase();
    const ddlCreator = exportConfigs[database.databaseType];

    return ddlCreator.create(erdDocument, option);
};

type OverrideName = {
    physicalName: string;
    logicalName: string;
};

type IndexQueryArgs = {
    indexOption: string;
    indexName: string;
    tableName: string;
    indexTypeQuery: string;
    columnQueries: string[];
};

type ForeignKeyQueryArgs = {
    childTableName: string;
    parentTableName: string;
    childColumnNames: string[];
    parentColumnNames: string[];
    onUpdateAction: string;
    onDeleteAction: string;
};

type DatabaseDdlCreatorArgs = {
    tableQueryWithOption: (query: string, tableModel: TableModel, option: DdlOption) => string,
    columnQueryWithOption?: (query: string, columnShare: ColumnShareModel, overrideName: OverrideName, option: DdlOption) => string,
    indexQuery: (args: IndexQueryArgs) => string,
    foreignKeyQuery?: (args: ForeignKeyQueryArgs) => string,
    commentQuery: (erdDocument: ErdDocument, option: DdlOption, escape: (value: string) => string) => string[],
    autoIncrementKeyword: string,
    reservedWords: string[],
    escapeString: (value: string) => string,
    escapeCollate?: (value: string) => string
};

class DatabaseDdlCreator {

    private readonly tableQueryWithOption: (query: string, tableModel: TableModel, option: DdlOption) => string;
    private readonly columnQueryWithOption: (
        query: string, columnShare: ColumnShareModel, overrideName: OverrideName, option: DdlOption
    ) => string;
    private readonly indexQuery: (args: IndexQueryArgs) => string;
    private readonly foreignKeyQuery: (args: ForeignKeyQueryArgs) => string;
    private readonly commentQuery: (
        erdDocument: ErdDocument, option: DdlOption, escape: (value: string) => string
    ) => string[];
    private readonly autoIncrementKeyword: string;
    private readonly reservedWords: Set<string>;
    private readonly escapeString: (value: string) => string;
    private readonly escapeCollate: ((value: string) => string);

    constructor({
        tableQueryWithOption, columnQueryWithOption = (query: string) => query, indexQuery,
        foreignKeyQuery = foreignKeyQueryForAlter, commentQuery,
        autoIncrementKeyword, reservedWords, escapeString, escapeCollate = (value: string) => value
    }: DatabaseDdlCreatorArgs) {
        this.tableQueryWithOption = tableQueryWithOption;
        this.columnQueryWithOption = columnQueryWithOption;
        this.indexQuery = indexQuery;
        this.foreignKeyQuery = foreignKeyQuery;
        this.commentQuery = commentQuery;
        this.autoIncrementKeyword = autoIncrementKeyword;
        this.reservedWords = new Set(reservedWords);
        this.escapeString = escapeString;
        this.escapeCollate = escapeCollate;
    }

    public create(erdDocument: ErdDocument, option: DdlOption) {
        const schemaQueries = this.createSchemaDdl(erdDocument, option);
        const tableQueries = this.createTableDdl(erdDocument, option);
        const indexQueries = this.createIndexDdl(erdDocument, option);
        const foreignKeyQueries = this.createForeignKeyDdl(erdDocument, option);
        const commentQueries = this.createCommentDdl(erdDocument, option);

        return [
            ...schemaQueries, ...tableQueries, ...indexQueries,
            ...foreignKeyQueries, ...commentQueries
        ].join("\n");
    }

    createSchemaDdl(erdDocument: ErdDocument, option: DdlOption): string[] {
        if (option.withSchema === false) {
            return [];
        }

        const database = erdDocument.getDatabase();
        if (database.supportsSchema === false) {
            return [];
        }

        const schemaModels = erdDocument.schemaConfig.getSchemas();
        const queries = schemaModels.map(schema => `CREATE SCHEMA ${this.escape(schema.schemaName)};`);

        return (queries.length > 0) ? ["/* create schemas. */", ...queries, "\n"] : [];
    }

    createTableDdl(erdDocument: ErdDocument, option: DdlOption): string[] {
        if (option.withTable === false) {
            return [];
        }

        const tableViewModels = erdDocument.getTableViewModels();
        const queries = tableViewModels.map(tableViewModel => {
            const tableModel: TableModel = tableViewModel.tableModel;

            const columnQueries = this.initTableDefinitionQuery(erdDocument, tableViewModel, option)
            const schemaModel = erdDocument.findSchema(tableModel.schemaId);

            return `${this.tableQuery(tableModel, schemaModel, columnQueries, option)};\n`;
        });

        return (queries.length > 0) ? ["/* create tables. */", ...queries, ""] : [];
    }

    private tableQuery(
        tableModel: TableModel, schemaModel: DbSchemaModel | null, columnQueries: string[], option: DdlOption
    ) {
        const tableName = this.escape(tableModel.physicalName);
        const schemaPrefix = (schemaModel != null) ? `${this.escape(schemaModel.schemaName)}.` : "";
        const query = `CREATE TABLE ${schemaPrefix}${tableName} (\n    ${columnQueries.join(",\n    ")}\n)`;

        return this.tableQueryWithOption(query, tableModel, option);
    }

    private initTableDefinitionQuery(erdDocument: ErdDocument, tableViewModel: TableViewModel, option: DdlOption) {
        const tableModel: TableModel = tableViewModel.tableModel;
        const allColumnModels = erdDocument.toAllColumnModels(tableModel);

        const columnPairs = allColumnModels.map(columnModel => {
            const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;
            const inChildRelation = erdDocument.inChildRelation(tableModel.tableModelId, columnModel.columnModelId);

            return { columnModel, columnShareModel, inChildRelation };
        });

        const database = erdDocument.getDatabase();
        const columnQueries = columnPairs.map(columnPair => {
            const { columnModel, columnShareModel, inChildRelation } = columnPair;
            return this.columnQuery(columnModel, columnShareModel, inChildRelation, database, option);
        });

        const primaryKeys = columnPairs
            .filter(columnPair => (columnPair.columnModel.primaryKey === true))
            .map(columnPair => {
                const { columnModel, columnShareModel } = columnPair;
                const overrideName = overrideColumnName(columnModel, columnShareModel);
                return this.escape(overrideName.physicalName);
            });

        if (primaryKeys.length > 0) {
            const primaryKeyQuery = `PRIMARY KEY (${primaryKeys.join(", ")})`
            columnQueries.push(primaryKeyQuery);
        }

        if (tableModel.uniqueKeysModels.length > 0) {
            const uniqueKeyConstraints = this.initUniqueConstraintQuery(tableModel.uniqueKeysModels, columnPairs);
            columnQueries.push(...uniqueKeyConstraints);
        }

        if (tableModel.checkExpression !== "") {
            const resolvedExpression = this.initTableCheckExpression(tableModel.checkExpression, columnPairs);
            columnQueries.push(`CHECK (${resolvedExpression})`);
        }

        if (tableModel.definitionExpression !== "") {
            columnQueries.push(tableModel.definitionExpression);
        }

        return columnQueries;
    }

    private initTableCheckExpression(checkExpression: string, columnPairs: ColumnModelPair[]): string {
        const nameMap = new Map(columnPairs.map(pair => {
            const overrideName = overrideColumnName(pair.columnModel, pair.columnShareModel);
            return [overrideName.physicalName, this.escape(overrideName.physicalName)];
        }));

        return checkExpression.replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, name) => {
            return nameMap.get(name) ?? `\${${name}}`;
        });
    }

    private columnQuery(
        columnModel: ColumnModel, columnShareModel: ColumnShareModel, inChildRelation: boolean,
        database: Database, option: DdlOption
    ): string {
        const attributes = [columnShareModel.specifiedColumnType(inChildRelation)];

        const characterSet = columnShareModel.characterSet(database);
        if (characterSet !== "") {
            attributes.push(`CHARACTER SET ${characterSet}`);
        }
        if (columnShareModel.collate !== "") {
            attributes.push(`COLLATE ${this.escapeCollate(columnShareModel.collate)}`);
        }
        if (columnShareModel.unsigned && columnShareModel.columnType.withUnsigned) {
            attributes.push("UNSIGNED");
        }

        if (columnShareModel.optionExpression !== "") {
            attributes.push(columnShareModel.optionExpression);
        }

        if (columnModel.notNull) {
            attributes.push("NOT NULL");
        }
        if (columnModel.autoIncrement && columnShareModel.columnType.withAutoIncrement) {
            attributes.push(this.autoIncrementKeyword);
        }
        if (columnModel.unique) {
            attributes.push("UNIQUE");
        }
        if (columnModel.defaultValue) {
            attributes.push("DEFAULT " + columnModel.defaultValue);
        }

        const overrideName = overrideColumnName(columnModel, columnShareModel);

        const checkExpression = this.initColumnCheckExpression(columnShareModel, overrideName);

        const query = `${this.escape(overrideName.physicalName)} ` + attributes.join(" ")
        return this.columnQueryWithOption(query, columnShareModel, overrideName, option) + checkExpression;
    }

    private initColumnCheckExpression(columnShare: ColumnShareModel, overrideName: { physicalName: string }) {
        if (columnShare.checkExpression === "") {
            return "";
        }

        const escapedName = this.escape(overrideName.physicalName);
        const resolved = columnShare.checkExpression.replace(/\$\{this\}/g, escapedName);

        return ` CHECK (${resolved})`;
    }

    private initUniqueConstraintQuery(uniqueKeysModels: readonly TableUniqueKeysModel[], columnPairs: ColumnModelPair[]) {
        const columnPairMapping = new Map(columnPairs.map(pair => [pair.columnModel.columnModelId, pair]));

        return uniqueKeysModels
            .filter(uniqueKeysModel => (uniqueKeysModel.uniqueKeysColumnModels.length > 0))
            .map(uniqueKeysModel => {
                const constraintName = (uniqueKeysModel.physicalName !== "")
                    ? `CONSTRAINT ${this.escape(uniqueKeysModel.physicalName)} ` : "";

                const constraintDefinitions = uniqueKeysModel.uniqueKeysColumnModels
                    .map(uniqueDefinition => {
                        const pair = columnPairMapping.get(uniqueDefinition.columnModelId)!;
                        return (pair != null) ? { uniqueDefinition, ...pair } : null;
                    })
                    .filter(pair => (pair != null))
                    .map(pair => {
                        const { uniqueDefinition, columnModel, columnShareModel } = pair;
                        const overrideName = overrideColumnName(columnModel, columnShareModel);

                        const order = (uniqueDefinition.sortOrderType != "")
                            ? ` ${uniqueDefinition.sortOrderType}` : "";
                        return `${this.escape(overrideName.physicalName)}${order}`;
                    });

                if (constraintDefinitions.length === 0) {
                    return null;
                }

                return `${constraintName}UNIQUE (${constraintDefinitions.join(", ")})`;
            })
            .filter(constraint => (constraint != null));
    }

    createIndexDdl(erdDocument: ErdDocument, option: DdlOption): string[] {
        if (option.withIndex === false) {
            return [];
        }

        const tableViewModels = erdDocument.getTableViewModels();
        const queries = tableViewModels.flatMap(tableViewModel => {
            const tableModel: TableModel = tableViewModel.tableModel;
            const schemaModel = erdDocument.findSchema(tableModel.schemaId);

            return tableModel.tableIndexModels.map(indexModel => {
                const columnQueries = indexModel.indexColumnModels.map(indexColumn => {
                    const columnModel = erdDocument.findColumnModel(indexColumn.columnModelId) as ColumnModel;
                    const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;

                    const overrideName = overrideColumnName(columnModel, columnShareModel);
                    const columnName = this.escape(overrideName.physicalName);
                    const sortQuery = indexColumn.querySort();

                    return columnName + (sortQuery ? ` ${sortQuery}` : "");
                });

                const indexOptionValues = [indexModel.indexOption, (indexModel.clustered ? "CLUSTERED" : "")]
                    .filter(value => (value !== ""));

                const indexOption = (indexOptionValues.length > 0) ? `${indexOptionValues.join(" ")} ` : ""
                const indexTypeQuery = indexModel.indexType ? ` USING ${indexModel.indexType}` : "";
                const indexName = this.escape(indexModel.physicalName);
                const tableName = ((schemaModel != null) ? `${this.escape(schemaModel.schemaName)}.` : "")
                    + this.escape(tableModel.physicalName);

                return this.indexQuery({ indexOption, indexName, tableName, indexTypeQuery, columnQueries });
            });
        });

        return (queries.length > 0) ? ["/* create indexes. */", ...queries, ""] : [];
    }

    createForeignKeyDdl(erdDocument: ErdDocument, option: DdlOption) {
        if (option.withForeignKey === false) {
            return [];
        }

        const relationViewModels = erdDocument.getRelationViewModels();
        const queries = relationViewModels.map(relationViewModel => {
            const relationModel: RelationModel = relationViewModel.relationModel;

            const childTableViewModel = erdDocument.findTableViewModel(relationModel.childTableModelId) as TableViewModel;
            const childTableModel = childTableViewModel.tableModel;
            const childSchema = erdDocument.findSchema(childTableModel.schemaId);

            const parentTableViewModel = erdDocument.findTableViewModel(relationModel.parentTableModelId) as TableViewModel;
            const parentTableModel = parentTableViewModel.tableModel;
            const parentSchema = erdDocument.findSchema(parentTableModel.schemaId);

            const pairColumnNames = relationModel.relationPairs.map(relationPair => {
                const childColumnModel = erdDocument.findColumnModel(relationPair.childColumnModelId) as ColumnModel;
                const childColumnShareModel = erdDocument.findColumnShareModel(childColumnModel.columnShareModelId) as ColumnShareModel;

                const parentColumnModel = erdDocument.findColumnModel(relationPair.parentColumnModelId) as ColumnModel;
                const parentColumnShareModel = (parentColumnModel.columnShareModelId === childColumnModel.columnShareModelId)
                    ? childColumnShareModel : erdDocument.findColumnShareModel(parentColumnModel.columnShareModelId) as ColumnShareModel;

                const parentColumnName = overrideColumnName(parentColumnModel, parentColumnShareModel);
                const childColumnName = overrideColumnName(childColumnModel, childColumnShareModel);

                return {
                    parent: this.escape(parentColumnName.physicalName),
                    child: this.escape(childColumnName.physicalName)
                };
            });

            const parentTableName = ((parentSchema != null) ? `${this.escape(parentSchema.schemaName)}.` : "")
                + this.escape(parentTableModel.physicalName);
            const childTableName = ((childSchema != null) ? `${this.escape(childSchema.schemaName)}.` : "")
                + this.escape(childTableModel.physicalName);

            return this.foreignKeyQuery({
                childTableName,
                parentTableName,
                childColumnNames: pairColumnNames.map(pair => pair.child),
                parentColumnNames: pairColumnNames.map(pair => pair.parent),
                onUpdateAction: relationModel.onUpdateAction,
                onDeleteAction: relationModel.onDeleteAction
            });
        });

        return (queries.length > 0) ? ["/* create foreign keys. */", ...queries, ""] : [];
    }

    createCommentDdl(erdDocument: ErdDocument, option: DdlOption): string[] {
        const escape = (org: string) => this.escape(org);
        return this.commentQuery(erdDocument, option, escape);
    }

    private escape(org: string): string {
        if (this.reservedWords.has(org.toUpperCase()) === false) {
            return org;
        }

        return this.escapeString(org);
    }
}

type ColumnModelPair = { columnModel: ColumnModel, columnShareModel: ColumnShareModel, inChildRelation: boolean };

const foreignKeyQueryForAlter = (args: ForeignKeyQueryArgs): string => {
    const alterQueries = [
        `ADD FOREIGN KEY (${args.childColumnNames.join(", ")})`,
        `REFERENCES ${args.parentTableName} (${args.parentColumnNames.join(", ")})`,
        `ON UPDATE ${args.onUpdateAction}`,
        `ON DELETE ${args.onDeleteAction}`
    ];

    return `ALTER TABLE ${args.childTableName}\n    ${alterQueries.join("\n    ")};\n`;
};

// cSpell:disable

const commonReservedWords = [
    "ALL", "AND", "ANY", "AS", "ASC", "BETWEEN", "BY", "CASE", "CHECK", "COLUMN", "CONSTRAINT", "CREATE",
    "CROSS", "CURRENT_DATE", "CURRENT_TIME", "CURRENT_TIMESTAMP", "CURRENT_USER", "DATABASE", "DEFAULT",
    "DELETE", "DESC", "DISTINCT", "DROP", "ELSE", "END", "EXISTS", "FALSE", "FETCH", "FOR", "FOREIGN",
    "FROM", "FULL", "GRANT", "GROUP", "HAVING", "IF", "IN", "INNER", "INSERT", "INTERSECT", "INTO", "IS",
    "JOIN", "KEY", "LEFT", "LIKE", "LIMIT", "NATURAL", "NOT", "NULL", "ON", "OR", "ORDER", "OUTER",
    "PRIMARY", "REFERENCES", "RETURN", "RIGHT", "SCHEMA", "SELECT", "SET", "TABLE", "THEN", "TO", "TRUE",
    "UNION", "UNIQUE", "UPDATE", "USER", "USING", "VALUES", "WHEN", "WHERE", "WITH"
];

const postgresReservedWords = [
    "ABORT", "ABSOLUTE", "ACCESS", "ACTION", "ADMIN", "AFTER", "AGGREGATE", "ALSO", "ALTER", "ALWAYS",
    "ANALYSE", "ANALYZE", "ARRAY", "ASSERTION", "ASSIGNMENT", "ASYMMETRIC", "AT", "ATOMIC", "ATTACH",
    "ATTRIBUTE", "AUTHORIZATION", "BACKWARD", "BEFORE", "BEGIN", "BIGINT", "BINARY", "BIT", "BOOLEAN",
    "BOTH", "BREADTH", "CACHE", "CALL", "CALLED", "CASCADE", "CASCADED", "CAST", "CATALOG", "CHAIN",
    "CHAR", "CHARACTER", "CHARACTERISTICS", "CHECKPOINT", "CLASS", "CLOSE", "CLUSTER", "COALESCE",
    "COLLATE", "COLLATION", "COLUMNS", "COMMENT", "COMMENTS", "COMMIT", "COMMITTED", "CONCURRENTLY",
    "CONFIGURATION", "CONFLICT", "CONNECTION", "CONSTRAINTS", "CONTENT", "CONTINUE", "CONVERSION", "COPY",
    "COST", "CSV", "CUBE", "CURRENT", "CURRENT_CATALOG", "CURRENT_ROLE", "CURRENT_SCHEMA", "CURSOR",
    "CYCLE", "DATA", "DAY", "DEALLOCATE", "DEC", "DECIMAL", "DECLARE", "DEFERRABLE", "DEFERRED",
    "DEFINER", "DELIMITER", "DELIMITERS", "DEPENDS", "DEPTH", "DEREFERENCE", "DETACH", "DICTIONARY",
    "DISABLE", "DISCARD", "DISTRIBUTED", "DO", "DOCUMENT", "DOMAIN", "DOUBLE", "EACH", "ENABLE",
    "ENCODING", "ENCRYPTED", "ENUM", "ESCAPE", "EVENT", "EXCEPT", "EXCLUDE", "EXCLUDING", "EXCLUSIVE",
    "EXECUTE", "EXPLAIN", "EXPRESSION", "EXTENSION", "EXTERNAL", "EXTRACT", "FAMILY", "FILTER",
    "FINALIZE", "FIRST", "FLOAT", "FOLLOWING", "FORCE", "FORWARD", "FREEZE", "FUNCTION", "FUNCTIONS",
    "GENERATED", "GLOBAL", "GRANTED", "GREATEST", "GROUPING", "GROUPS", "HANDLER", "HEADER", "HOLD",
    "HOUR", "IDENTITY", "ILIKE", "IMMEDIATE", "IMMUTABLE", "IMPLICIT", "IMPORT", "INCLUDE", "INCLUDING",
    "INCREMENT", "INDENT", "INDEX", "INDEXES", "INHERIT", "INHERITS", "INITIALLY", "INLINE", "INOUT",
    "INPUT", "INSENSITIVE", "INSTEAD", "INT", "INTEGER", "INTERVAL", "INVOKER", "ISNULL", "ISOLATION",
    "LABEL", "LANGUAGE", "LARGE", "LAST", "LATERAL", "LEADING", "LEAKPROOF", "LEAST", "LEVEL", "LISTEN",
    "LOAD", "LOCAL", "LOCALTIME", "LOCALTIMESTAMP", "LOCATION", "LOCK", "LOCKED", "LOGGED", "MAPPING",
    "MATCH", "MATERIALIZED", "MAXVALUE", "METHOD", "MINUTE", "MINVALUE", "MODE", "MONTH", "MOVE", "NAME",
    "NAMES", "NATIONAL", "NCHAR", "NEW", "NEXT", "NFC", "NFD", "NFKC", "NFKD", "NO", "NONE", "NORMALIZE",
    "NORMALIZED", "NOTHING", "NOTIFY", "NOTNULL", "NOWAIT", "NULLIF", "NULLS", "NUMERIC", "OBJECT", "OF",
    "OFF", "OFFSET", "OIDS", "OLD", "ONLY", "OPERATOR", "OPTION", "OPTIONS", "ORDINALITY", "OTHERS",
    "OUT", "OVER", "OVERLAPS", "OVERLAY", "OVERRIDING", "OWNED", "OWNER", "PARALLEL", "PARSER", "PARTIAL",
    "PARTITION", "PASSING", "PASSWORD", "PLANS", "POLICY", "POSITION", "PRECEDING", "PRECISION",
    "PREPARE", "PREPARED", "PRESERVE", "PRIOR", "PRIVILEGES", "PROCEDURAL", "PROCEDURE", "PROCEDURES",
    "PROGRAM", "PUBLICATION", "QUOTE", "RANGE", "READ", "REAL", "REASSIGN", "RECHECK", "RECURSIVE",
    "REF", "REFERENCING", "REFRESH", "REINDEX", "RELATIVE", "RELEASE", "RENAME", "REPEATABLE", "REPLACE",
    "REPLICA", "RESET", "RESTART", "RESTRICT", "RETURNING", "RETURNS", "REVOKE", "ROLE", "ROLLBACK",
    "ROLLUP", "ROUTINE", "ROUTINES", "ROW", "ROWS", "RULE", "SAVEPOINT", "SCHEMAS", "SCROLL", "SEARCH",
    "SECOND", "SECURITY", "SEQUENCE", "SEQUENCES", "SERIALIZABLE", "SERVER", "SESSION", "SESSION_USER",
    "SETOF", "SETS", "SHARE", "SHOW", "SIMILAR", "SIMPLE", "SKIP", "SMALLINT", "SNAPSHOT", "SOME", "SQL",
    "STABLE", "STANDALONE", "START", "STATEMENT", "STATISTICS", "STDIN", "STDOUT", "STORAGE", "STORED",
    "STRICT", "STRIP", "SUBSTRING", "SYMMETRIC", "SYSID", "SYSTEM", "TABLES", "TABLESAMPLE",
    "TABLESPACE", "TEMP", "TEMPLATE", "TEMPORARY", "TEXT", "TIES", "TIME", "TIMESTAMP", "TRAILING",
    "TRANSACTION", "TRANSFORM", "TREAT", "TRIGGER", "TRIM", "TYPE", "TYPES", "UESCAPE", "UNBOUNDED",
    "UNCOMMITTED", "UNENCRYPTED", "UNKNOWN", "UNLISTEN", "UNLOGGED", "UNTIL", "VACUUM", "VALID",
    "VALIDATE", "VALIDATOR", "VALUE", "VARCHAR", "VARIADIC", "VARYING", "VERBOSE", "VERSION", "VIEW",
    "VIEWS", "VOLATILE", "WHITESPACE", "WINDOW", "WITHIN", "WITHOUT", "WORK", "WRAPPER", "WRITE", "XML",
    "XMLATTRIBUTES", "XMLCONCAT", "XMLELEMENT", "XMLEXISTS", "XMLFOREST", "XMLNAMESPACES", "XMLPARSE",
    "XMLPI", "XMLROOT", "XMLSERIALIZE", "XMLTABLE", "YEAR", "YES", "ZONE"
];

const mysqlReservedWords = [
    "ACCESSIBLE", "ACCOUNT", "ACTIVE", "ADD", "ADMIN", "AFTER", "AGAINST", "AGGREGATE", "ALGORITHM",
    "ALTER", "ALWAYS", "ANALYZE", "ASENSITIVE", "AT", "AUTOCOMMIT", "AUTOEXTEND_SIZE", "AUTO_INCREMENT",
    "AVG", "AVG_ROW_LENGTH", "BACKUP", "BEFORE", "BEGIN", "BIGINT", "BINARY", "BINLOG", "BIT", "BLOB",
    "BLOCK", "BOOL", "BOOLEAN", "BOTH", "BTREE", "BUFFER", "BYTE", "CACHE", "CALL", "CASCADE", "CASCADED",
    "CAST", "CATALOG_NAME", "CHAIN", "CHANGE", "CHANGED", "CHANNEL", "CHAR", "CHARACTER", "CHARSET",
    "CHECKSUM", "CIPHER", "CLASS_ORIGIN", "CLIENT", "CLONE", "CLOSE", "COALESCE", "CODE", "COLLATE",
    "COLLATION", "COLUMN_FORMAT", "COLUMN_NAME", "COLUMNS", "COMMENT", "COMMIT", "COMMITTED",
    "COMPLETION", "COMPONENT", "COMPRESSED", "COMPRESSION", "CONCURRENT", "CONDITION", "CONNECTION",
    "CONSISTENT", "CONSTRAINT_CATALOG", "CONSTRAINT_NAME", "CONSTRAINT_SCHEMA", "CONTAINS", "CONTEXT",
    "CONTINUE", "CONVERT", "CPU", "CREATE", "CUBE", "CUME_DIST", "CURRENT", "CURSOR", "CURSOR_NAME",
    "DATA", "DATABASES", "DATAFILE", "DATE", "DATETIME", "DAY", "DAY_HOUR", "DAY_MICROSECOND",
    "DAY_MINUTE", "DAY_SECOND", "DEALLOCATE", "DEC", "DECIMAL", "DECLARE", "DEFAULT", "DEFAULT_AUTH",
    "DEFINER", "DEFINITION", "DELAYED", "DELAY_KEY_WRITE", "DENSE_RANK", "DESCRIBE", "DESCRIPTION",
    "DES_KEY_FILE", "DETAIL", "DETERMINISTIC", "DIAGNOSTICS", "DIRECTORY", "DISABLE", "DISCARD", "DISK",
    "DISTINCT", "DISTINCTROW", "DIV", "DO", "DOUBLE", "DROP", "DUAL", "DUMPFILE", "DUPLICATE", "DYNAMIC",
    "EACH", "ELSEIF", "EMPTY", "ENABLE", "ENCLOSED", "ENCRYPTION", "ENDS", "ENGINE", "ENGINES", "ENUM",
    "ERROR", "ERRORS", "ESCAPE", "ESCAPED", "EVENT", "EVERY", "EXCEPT", "EXCHANGE", "EXCLUDE", "EXECUTE",
    "EXPANSION", "EXPIRE", "EXPLAIN", "EXPORT", "EXTENDED", "EXTENT_SIZE", "FAST", "FAULTS", "FETCH",
    "FIELDS", "FILE", "FILE_BLOCK_SIZE", "FILTER", "FIRST", "FIRST_VALUE", "FIXED", "FLOAT", "FLOAT4",
    "FLOAT8", "FLUSH", "FOLLOWING", "FOLLOWS", "FORCE", "FORMAT", "FOUND", "GENERAL", "GENERATED",
    "GEOMETRY", "GEOMETRYCOLLECTION", "GET", "GLOBAL", "GRANTS", "GROUPING", "GROUPS", "HANDLER", "HASH",
    "HELP", "HIGH_PRIORITY", "HISTOGRAM", "HISTORY", "HOST", "HOSTS", "HOUR", "HOUR_MICROSECOND",
    "HOUR_MINUTE", "HOUR_SECOND", "IDENTIFIED", "IGNORE", "IGNORE_SERVER_IDS", "IMPORT",
    "IMPORT_TABLESPACE", "INACTIVE", "INDEXES", "INFILE", "INITIAL_SIZE", "INOUT", "INSENSITIVE",
    "INSERT_METHOD", "INSTALL", "INSTANCE", "INT", "INT1", "INT2", "INT3", "INT4", "INT8", "INTEGER",
    "INTERVAL", "INTO", "INVISIBLE", "INVOKER", "IO", "IO_AFTER_GTIDS", "IO_BEFORE_GTIDS", "IO_THREAD",
    "IPC", "ISOLATION", "ISSUER", "ITERATE", "JSON", "JSON_TABLE", "KEYS", "KEY_BLOCK_SIZE", "KILL",
    "LAG", "LANGUAGE", "LAST", "LAST_VALUE", "LATERAL", "LEAD", "LEADING", "LEAVE", "LEAVES", "LESS",
    "LEVEL", "LINEAR", "LINES", "LINESTRING", "LIST", "LOAD", "LOCAL", "LOCALTIME", "LOCALTIMESTAMP",
    "LOCK", "LOCKED", "LOGS", "LONG", "LONGBLOB", "LONGTEXT", "LOOP", "LOW_PRIORITY", "MASTER",
    "MASTER_AUTO_POSITION", "MASTER_BIND", "MASTER_CONNECT_RETRY", "MASTER_DELAY",
    "MASTER_HEARTBEAT_PERIOD", "MASTER_HOST", "MASTER_LOG_FILE", "MASTER_LOG_POS", "MASTER_PASSWORD",
    "MASTER_PORT", "MASTER_RETRY_COUNT", "MASTER_SERVER_ID", "MASTER_SSL", "MASTER_SSL_CA",
    "MASTER_SSL_CAPATH", "MASTER_SSL_CERT", "MASTER_SSL_CIPHER", "MASTER_SSL_CRL", "MASTER_SSL_CRLPATH",
    "MASTER_SSL_KEY", "MASTER_SSL_VERIFY_SERVER_CERT", "MASTER_TLS_VERSION", "MASTER_USER", "MATCH",
    "MAXVALUE", "MEDIUMBLOB", "MEDIUMINT", "MEDIUMTEXT", "MEMBER", "MEMORY", "MERGE", "MESSAGE_TEXT",
    "MICROSECOND", "MIDDLEINT", "MIGRATE", "MINUTE", "MINUTE_MICROSECOND", "MINUTE_SECOND", "MODE",
    "MODIFIES", "MODIFY", "MONTH", "MULTILINESTRING", "MULTIPOINT", "MULTIPOLYGON", "MUTEX",
    "MYSQL_ERRNO", "NAME", "NAMES", "NATIONAL", "NCHAR", "NDB", "NDBCLUSTER", "NESTED",
    "NETWORK_NAMESPACE", "NEVER", "NEW", "NEXT", "NO", "NODEGROUP", "NONE", "NOWAIT", "NO_WAIT",
    "NO_WRITE_TO_BINLOG", "NULLS", "NUMBER", "NUMERIC", "NVARCHAR", "OF", "OFF", "OFFSET", "OJ", "OLD",
    "ONE", "ONLY", "OPEN", "OPTIMIZE", "OPTIMIZER_COSTS", "OPTION", "OPTIONAL", "OPTIONALLY", "OPTIONS",
    "ORDINALITY", "ORGANIZATION", "OTHERS", "OUT", "OUTFILE", "OVER", "OWNER", "PACK_KEYS", "PAGE",
    "PARSER", "PARSE_GCOL_EXPR", "PARTIAL", "PARTITION", "PARTITIONING", "PARTITIONS", "PASSWORD", "PATH",
    "PERSIST", "PERSIST_ONLY", "PHASE", "PLUGIN", "PLUGINS", "PLUGIN_DIR", "POINT", "POLYGON", "PORT",
    "PRECEDES", "PRECEDING", "PRECISION", "PREPARE", "PRESERVE", "PREV", "PRIVILEGES", "PROCEDURE",
    "PROCESS", "PROCESSLIST", "PROFILE", "PROFILES", "PROXY", "PURGE", "QUARTER", "QUERY", "QUICK",
    "RANGE", "RANK", "READ", "READS", "READ_ONLY", "READ_WRITE", "REAL", "REBUILD", "RECOVER",
    "RECURSIVE", "REDOFILE", "REDO_BUFFER_SIZE", "REDUNDANT", "REFERENCE", "REGEXP", "RELAY", "RELAYLOG",
    "RELAY_LOG_FILE", "RELAY_LOG_POS", "RELAY_THREAD", "RELEASE", "RELOAD", "REMOTE", "REMOVE", "RENAME",
    "REORGANIZE", "REPAIR", "REPEAT", "REPEATABLE", "REPLACE", "REPLICATE_DO_DB", "REPLICATE_DO_TABLE",
    "REPLICATE_IGNORE_DB", "REPLICATE_IGNORE_TABLE", "REPLICATE_REWRITE_DB", "REPLICATE_WILD_DO_TABLE",
    "REPLICATE_WILD_IGNORE_TABLE", "REPLICATION", "REQUIRE", "RESET", "RESIGNAL", "RESOURCE", "RESPECT",
    "RESTART", "RESTORE", "RESTRICT", "RESUME", "RETURNED_SQLSTATE", "RETURNS", "REUSE", "REVERSE",
    "REVOKE", "ROLE", "ROLLBACK", "ROLLUP", "ROTATE", "ROUTINE", "ROW", "ROWS", "ROW_COUNT", "ROW_FORMAT",
    "ROW_NUMBER", "RTREE", "SAVEPOINT", "SCHEDULE", "SCHEMA", "SCHEMA_NAME", "SECOND", "SECONDARY",
    "SECONDARY_ENGINE", "SECONDARY_LOAD", "SECONDARY_UNLOAD", "SECOND_MICROSECOND", "SECURITY",
    "SENSITIVE", "SEPARATOR", "SERIAL", "SERIALIZABLE", "SERVER", "SESSION", "SHARE", "SHOW", "SHUTDOWN",
    "SIGNAL", "SIGNED", "SIMPLE", "SLAVE", "SLOW", "SMALLINT", "SNAPSHOT", "SOCKET", "SOME", "SONAME",
    "SOUNDS", "SOURCE", "SPATIAL", "SPECIFIC", "SQL", "SQLEXCEPTION", "SQLSTATE", "SQLWARNING",
    "SQL_AFTER_GTIDS", "SQL_AFTER_MTS_GAPS", "SQL_BEFORE_GTIDS", "SQL_BIG_RESULT", "SQL_BUFFER_RESULT",
    "SQL_CACHE", "SQL_CALC_FOUND_ROWS", "SQL_NO_CACHE", "SQL_SMALL_RESULT", "SQL_THREAD", "SQL_TSI_DAY",
    "SQL_TSI_HOUR", "SQL_TSI_MINUTE", "SQL_TSI_MONTH", "SQL_TSI_QUARTER", "SQL_TSI_SECOND",
    "SQL_TSI_WEEK", "SQL_TSI_YEAR", "SSL", "STACKED", "START", "STARTING", "STARTS", "STATS_AUTO_RECALC",
    "STATS_PERSISTENT", "STATS_SAMPLE_PAGES", "STATUS", "STOP", "STORAGE", "STORED", "STRAIGHT_JOIN",
    "STRING", "SUBCLASS_ORIGIN", "SUBJECT", "SUBPARTITION", "SUBPARTITIONS", "SUPER", "SUSPEND", "SWAPS",
    "SWITCHES", "SYSTEM", "TABLES", "TABLESPACE", "TABLE_CHECKSUM", "TABLE_NAME", "TEMPORARY",
    "TEMPTABLE", "TERMINATED", "TEXT", "THAN", "THREAD_PRIORITY", "TIES", "TIME", "TIMESTAMP",
    "TIMESTAMPADD", "TIMESTAMPDIFF", "TINYBLOB", "TINYINT", "TINYTEXT", "TO", "TRAILING", "TRANSACTION",
    "TRIGGER", "TRIGGERS", "TRUE", "TRUNCATE", "TYPE", "TYPES", "UNCOMMITTED", "UNDEFINED", "UNDO",
    "UNDOFILE", "UNDO_BUFFER_SIZE", "UNICODE", "UNINSTALL", "UNKNOWN", "UNLOCK", "UNSIGNED", "UNTIL",
    "UPGRADE", "USAGE", "USE", "USE_FRM", "UTC_DATE", "UTC_TIME", "UTC_TIMESTAMP", "VALIDATION", "VALUE",
    "VARBINARY", "VARCHAR", "VARCHARACTER", "VARIABLES", "VARYING", "VCPU", "VIEW", "VIRTUAL", "VISIBLE",
    "WAIT", "WARNINGS", "WEEK", "WEIGHT_STRING", "WHILE", "WINDOW", "WITHOUT", "WORK", "WRAPPER", "WRITE",
    "X509", "XA", "XID", "XML", "XOR", "YEAR", "YEAR_MONTH", "ZEROFILL"
];

const mariadbReservedWords = [
    ...mysqlReservedWords,
    "CURRENT_ROLE", "DELETE_DOMAIN_ID", "DO_DOMAIN_IDS", "GENERAL", "IGNORE_DOMAIN_IDS",
    "MASTER_HEARTBEAT_PERIOD", "PAGE_CHECKSUM", "PARSE_VCOL_EXPR", "POSITION", "ROWNUM", "ROWTYPE",
    "SLOW", "STATEMENT", "UTC_DATE", "UTC_TIME", "UTC_TIMESTAMP"
];

const msSqlServerReservedWords = [
    "ADD", "EXTERNAL", "PROCEDURE", "ALL", "FETCH", "PUBLIC", "ALTER", "FILE", "RAISERROR", "AND",
    "FILLFACTOR", "READ", "ANY", "FOR", "READTEXT", "AS", "FOREIGN", "RECONFIGURE", "ASC", "FREETEXT",
    "REFERENCES", "AUTHORIZATION", "FREETEXTTABLE", "REPLICATION", "BACKUP", "FROM", "RESTORE",
    "BEGIN", "FULL", "RESTRICT", "BETWEEN", "FUNCTION", "RETURN", "BREAK", "GOTO", "REVERT", "BROWSE",
    "GRANT", "REVOKE", "BULK", "GROUP", "RIGHT", "BY", "HAVING", "ROLLBACK", "CASCADE", "HOLDLOCK",
    "ROWCOUNT", "CASE", "IDENTITY", "ROWGUIDCOL", "CHECK", "IDENTITY_INSERT", "RULE", "CHECKPOINT",
    "IDENTITYCOL", "SAVE", "CLOSE", "IF", "SCHEMA", "CLUSTERED", "IN", "SECURITYAUDIT", "COALESCE",
    "INDEX", "SELECT", "COLLATE", "INNER", "SEMANTICKEYPHRASETABLE", "COLUMN", "INSERT",
    "SEMANTICSIMILARITYDETAILSTABLE", "COMMIT", "INTERSECT", "SEMANTICSIMILARITYTABLE", "COMPUTE",
    "INTO", "SESSION_USER", "CONSTRAINT", "IS", "SET", "CONTAINS", "JOIN", "SETUSER", "CONTAINSTABLE",
    "KEY", "SHUTDOWN", "CONTINUE", "KILL", "SOME", "CONVERT", "LEFT", "STATISTICS", "CREATE", "LIKE",
    "SYSTEM_USER", "CROSS", "LINENO", "TABLE", "CURRENT", "LOAD", "TABLESAMPLE", "CURRENT_DATE",
    "MERGE", "TEXTSIZE", "CURRENT_TIME", "NATIONAL", "THEN", "CURRENT_TIMESTAMP", "NOCHECK", "TO",
    "CURRENT_USER", "NONCLUSTERED", "TOP", "CURSOR", "NOT", "TRAN", "DATABASE", "NULL", "TRANSACTION",
    "DBCC", "NULLIF", "TRIGGER", "DEALLOCATE", "OF", "TRUNCATE", "DECLARE", "OFF", "TRY_CONVERT",
    "DEFAULT", "OFFSETS", "TSEQUAL", "DELETE", "ON", "UNION", "DENY", "OPEN", "UNIQUE", "DESC",
    "OPENDATASOURCE", "UNPIVOT", "DISK", "OPENQUERY", "UPDATE", "DISTINCT", "OPENROWSET", "UPDATETEXT",
    "DISTRIBUTED", "OPENXML", "USE", "DOUBLE", "OPTION", "USER", "DROP", "OR", "VALUES", "DUMP",
    "ORDER", "VARYING", "ELSE", "OUTER", "VIEW", "END", "OVER", "WAITFOR", "ERRLVL", "PERCENT",
    "WHEN", "ESCAPE", "PIVOT", "WHERE", "EXCEPT", "PLAN", "WHILE", "EXEC", "PRECISION", "WITH",
    "EXECUTE", "PRIMARY", "WITHIN GROUP", "EXISTS", "PRINT", "WRITETEXT", "EXIT", "PROC"
];

const sqliteReservedWords = [
    "ABORT", "ACTION", "ADD", "AFTER", "ALTER", "ALWAYS", "ANALYZE", "ATTACH", "AUTOINCREMENT", "BEFORE",
    "BEGIN", "CASCADE", "CAST", "COLLATE", "COMMIT", "CONFLICT", "CROSS", "CURRENT", "DATABASE",
    "DEFERRABLE", "DEFERRED", "DETACH", "DO", "EACH", "ESCAPE", "EXCEPT", "EXCLUDE", "EXCLUSIVE",
    "EXPLAIN", "FAIL", "FILTER", "FOLLOWING", "FULL", "GENERATED", "GLOB", "GROUPS", "IGNORE",
    "IMMEDIATE", "INDEX", "INDEXED", "INITIALLY", "INSTEAD", "ISNULL", "MATCH", "MATERIALIZED", "NO",
    "NOTHING", "NOTNULL", "NULLS", "OF", "OFFSET", "OTHERS", "OVER", "PARTITION", "PLAN", "PRAGMA",
    "PRECEDING", "QUERY", "RAISE", "RANGE", "RECURSIVE", "REGEXP", "REINDEX", "RELEASE", "RENAME",
    "REPLACE", "RESTRICT", "RETURNING", "ROLLBACK", "ROW", "ROWS", "SAVEPOINT", "TEMP", "TEMPORARY",
    "TIES", "TRANSACTION", "TRIGGER", "UNBOUNDED", "VACUUM", "VIEW", "VIRTUAL", "WINDOW", "WITHOUT"
];

const snowflakeReservedWords = [
    "ACCOUNT", "CLUSTER", "COLLATE", "CONNECT", "CONNECTION", "CURRENT_ACCOUNT", "FILE", "GSCLUSTER",
    "ILIKE", "INCREMENT", "ISSUE", "LOCALTIME", "LOCALTIMESTAMP", "MINUS", "MODIFY", "ORGANIZATION",
    "QUALIFY", "REGEXP", "RENAME", "REVOKE", "RLIKE", "ROW", "ROWS", "SAMPLE", "SOME", "START",
    "TABLESAMPLE", "TRIGGER", "TRY_CAST", "VIEW", "WHENEVER"
];

// cSpell:enable

const initComment = (physicalName: string, logicalName: string, description: string, option: DdlOption): string => {
    if (option.withComment === false) {
        return "";
    }

    if (option.commentStyle === "logical_name") {
        return (logicalName !== physicalName) ? logicalName : "";
    }

    const comment = (description !== "") ? `${logicalName}${option.commentSeparator}${description}` : logicalName;
    return (comment !== physicalName) ? comment : "";
};

const tableQuery = (query: string, tableModel: TableModel) => {
    return (tableModel.optionExpression !== "") ? `${query}\n${tableModel.optionExpression}` : query;
};

const tableQueryForMySql = (query: string, tableModel: TableModel, option: DdlOption) => {
    const tableComment = initComment(tableModel.physicalName, tableModel.logicalName, tableModel.description, option);

    const tableOptions = [
        (tableModel.characterSet !== "") ? `CHARACTER SET ${tableModel.characterSet}` : null,
        (tableModel.collate !== "") ? `COLLATE ${tableModel.collate}` : null,
        (tableComment !== "") ? `COMMENT '${escapeComment(tableComment)}'` : null,
        (tableModel.optionExpression !== "") ? `\n${tableModel.optionExpression}` : null
    ].filter(option => (option != null));

    return (tableOptions.length === 0) ? query : `${query} ${tableOptions.join(", ")}`;
};

const columnQueryForMySql = (
    query: string, column: ColumnShareModel, overrideName: OverrideName, option: DdlOption
) => {
    const columnComment = initComment(overrideName.physicalName, overrideName.logicalName, column.description, option);

    return (columnComment !== "") ? `${query} COMMENT '${escapeComment(columnComment)}'` : query;
};

const tableQueryForSnowflake = (query: string, tableModel: TableModel, option: DdlOption) => {
    const tableComment = initComment(tableModel.physicalName, tableModel.logicalName, tableModel.description, option);

    const tableOptions = [
        (tableComment !== "") ? `COMMENT = '${escapeComment(tableComment)}'` : null,
        (tableModel.optionExpression !== "") ? `\n${tableModel.optionExpression}` : null
    ].filter(option => (option != null));

    return (tableOptions.length === 0) ? query : `${query} ${tableOptions.join(", ")}`;
};

const columnQueryForSnowflake = (
    query: string, column: ColumnShareModel, overrideName: OverrideName, option: DdlOption
) => {
    const columnComment = initComment(overrideName.physicalName, overrideName.logicalName, column.description, option);

    return (columnComment !== "") ? `${query} COMMENT '${escapeComment(columnComment)}'` : query;
};

const indexQueryForSnowflake = (args: IndexQueryArgs): string => {
    return `-- Snowflake: CREATE INDEX is not supported on standard tables: `
        + `${args.indexName} ON ${args.tableName} (${args.columnQueries.join(", ")})`;
};

const commentQueryForPostgres = (
    erdDocument: ErdDocument, option: DdlOption, escape: (value: string) => string
): string[] => {
    if (option.withTable === false) {
        return [];
    }

    const tableViewModels = erdDocument.getTableViewModels();
    const queries = tableViewModels.flatMap(tableViewModel => {
        const tableModel: TableModel = tableViewModel.tableModel;
        const schemaModel = erdDocument.findSchema(tableModel.schemaId);
        const tableName = ((schemaModel != null) ? `${escape(schemaModel.schemaName)}.` : "")
            + escape(tableModel.physicalName);

        const commentQueries = erdDocument.toAllColumnModels(tableModel)
            .map(columnModel => initColumnCommentQueryForPostgres(columnModel, tableName, erdDocument, option, escape))
            .filter(comment => (comment != null));

        const tableComment = initComment(tableModel.physicalName, tableModel.logicalName, tableModel.description, option);
        if (tableComment !== "") {
            commentQueries.unshift(`COMMENT ON TABLE ${tableName} IS '${escapeComment(tableComment)}';`);
        }

        if (commentQueries.length > 0) {
            commentQueries.push("");
        }

        return commentQueries;
    });

    return (queries.length > 0) ? ["/* create comments. */", ...queries, ""] : [];
};

const initColumnCommentQueryForPostgres = (
    columnModel: ColumnModel, tableName: string, erdDocument: ErdDocument, option: DdlOption,
    escape: (value: string) => string
) => {
    const columnShare = erdDocument.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;
    const overrideName = overrideColumnName(columnModel, columnShare);
    const comment = initComment(overrideName.physicalName, overrideName.logicalName, columnShare.description, option);

    if (comment === "") {
        return null;
    }

    const columnName = escape(overrideName.physicalName);
    return `COMMENT ON COLUMN ${tableName}.${columnName} IS '${escapeComment(comment)}';`;
};

const escapeComment = (comment: string) => {
    return comment.replaceAll("'", '"');
};

const commentQueryForSqlite = (
    erdDocument: ErdDocument, option: DdlOption, escape: (value: string) => string
): string[] => {
    if (option.withTable === false) {
        return [];
    }

    const tableViews = erdDocument.getTableViewModels();
    const queries = tableViews.flatMap(tableView => {
        const tableModel: TableModel = tableView.tableModel;
        const schemaModel = erdDocument.findSchema(tableModel.schemaId);
        const tableName = ((schemaModel != null) ? `${escape(schemaModel.schemaName)}.` : "")
            + escape(tableModel.physicalName);

        const commentQueries = erdDocument.toAllColumnModels(tableModel)
            .map(columnModel => initColumnCommentQueryForSqlite(columnModel, tableName, erdDocument, option, escape))
            .filter(comment => (comment != null));

        const tableComment = initComment(tableModel.physicalName, tableModel.logicalName, tableModel.description, option);
        if (tableComment !== "") {
            commentQueries.unshift(`-- ${tableName}: ${escapeSqliteLineComment(tableComment)}`);
        }

        if (commentQueries.length > 0) {
            commentQueries.push("");
        }

        return commentQueries;
    });

    return (queries.length > 0) ? ["/* create comments. */", ...queries, ""] : [];
};

const initColumnCommentQueryForSqlite = (
    columnModel: ColumnModel, tableName: string, erdDocument: ErdDocument, option: DdlOption,
    escape: (value: string) => string
): string | null => {
    const columnShare = erdDocument.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;
    const overrideName = overrideColumnName(columnModel, columnShare);
    const comment = initComment(overrideName.physicalName, overrideName.logicalName, columnShare.description, option);

    if (comment === "") {
        return null;
    }

    const columnName = escape(overrideName.physicalName);
    return `-- ${tableName}.${columnName}: ${escapeSqliteLineComment(comment)}`;
};

// SQLiteの `--` は行末までのコメントのため、改行を含むコメントはそのままだと構文破綻する。改行を空白に無害化する。
const escapeSqliteLineComment = (comment: string) => {
    return comment.replaceAll("\n", " ");
};

const foreignKeyQueryForSqlite = (args: ForeignKeyQueryArgs): string => {
    const childColumns = args.childColumnNames.join(", ");
    const parentColumns = args.parentColumnNames.join(", ");

    // TODO 外部キーは CREATE TABLE 内に FOREIGN KEY 句として定義する必要がある
    return "-- Not support foreign key: " +
        `${args.childTableName} (${childColumns}) -> ${args.parentTableName} (${parentColumns})\n`;
};

const exportConfigs: { [key in DatabaseType]: DatabaseDdlCreator } = {
    "postgres": new DatabaseDdlCreator({
        tableQueryWithOption: tableQuery,
        indexQuery: (args: IndexQueryArgs) =>
            `CREATE ${args.indexOption}INDEX ${args.indexName} ON ${args.tableName}`
            + `${args.indexTypeQuery} (${args.columnQueries.join(", ")});`,
        commentQuery: commentQueryForPostgres,
        autoIncrementKeyword: "GENERATED ALWAYS AS IDENTITY",
        reservedWords: [...commonReservedWords, ...postgresReservedWords],
        escapeString: (value: string) => `"${value}"`, // PostgreSQL uses double quotes as escape character
        escapeCollate: (collate: string) => (collate.startsWith('"') && collate.endsWith('"')) ? collate : `"${collate}"`
    }),

    "mysql": new DatabaseDdlCreator({
        tableQueryWithOption: tableQueryForMySql,
        columnQueryWithOption: columnQueryForMySql,
        indexQuery: (args: IndexQueryArgs) =>
            `CREATE ${args.indexOption}INDEX ${args.indexName}${args.indexTypeQuery}`
            + ` ON ${args.tableName} (${args.columnQueries.join(", ")});`,
        commentQuery: () => [],
        autoIncrementKeyword: "AUTO_INCREMENT",
        reservedWords: [...commonReservedWords, ...mysqlReservedWords],
        escapeString: (value: string) => '`' + value + '`' // MySQL uses backticks as escape character
    }),

    "mariadb": new DatabaseDdlCreator({
        tableQueryWithOption: tableQueryForMySql,
        columnQueryWithOption: columnQueryForMySql,
        indexQuery: (args: IndexQueryArgs) =>
            `CREATE ${args.indexOption}INDEX ${args.indexName}${args.indexTypeQuery}`
            + ` ON ${args.tableName} (${args.columnQueries.join(", ")});`,
        commentQuery: () => [],
        autoIncrementKeyword: "AUTO_INCREMENT",
        reservedWords: [...commonReservedWords, ...mariadbReservedWords],
        escapeString: (value: string) => '`' + value + '`' // MariaDB uses backticks as escape character
    }),

    "ms_sqlserver": new DatabaseDdlCreator({
        tableQueryWithOption: tableQuery,
        indexQuery: (args: IndexQueryArgs) =>
            `CREATE ${args.indexOption}INDEX ${args.indexName} ON ${args.tableName}`
            + ` (${args.columnQueries.join(", ")});`,
        commentQuery: () => [],
        autoIncrementKeyword: "IDENTITY",
        reservedWords: [...commonReservedWords, ...msSqlServerReservedWords],
        escapeString: (value: string) => `[${value}]` // MS SQL Server uses square brackets as escape character
    }),

    "sqlite": new DatabaseDdlCreator({
        tableQueryWithOption: tableQuery,
        indexQuery: (args: IndexQueryArgs) =>
            `CREATE ${args.indexOption}INDEX ${args.indexName} ON ${args.tableName}`
            + ` (${args.columnQueries.join(", ")});`,
        foreignKeyQuery: foreignKeyQueryForSqlite,
        commentQuery: commentQueryForSqlite,
        autoIncrementKeyword: "",  // 全型 withAutoIncrement:false のため実際には出力されない
        reservedWords: [...commonReservedWords, ...sqliteReservedWords],
        escapeString: (value: string) => `"${value}"` // SQLite uses double quotes as escape character
    }),

    "snowflake": new DatabaseDdlCreator({
        tableQueryWithOption: tableQueryForSnowflake,
        columnQueryWithOption: columnQueryForSnowflake,
        indexQuery: indexQueryForSnowflake,
        commentQuery: () => [],
        autoIncrementKeyword: "AUTOINCREMENT",
        reservedWords: [...commonReservedWords, ...snowflakeReservedWords],
        escapeString: (value: string) => `"${value}"` // Snowflake uses double quotes as escape character
    })
};