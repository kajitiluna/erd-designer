import { Database, DatabaseType } from "~/models/database";
import ColumnModel from "~/models/database/ColumnModel";
import ColumnShareModel from "~/models/database/ColumnShareModel";
import RelationModel from "~/models/database/RelationModel";
import { overrideColumnName } from "~/models/database/support";
import TableModel from "~/models/database/TableModel";
import ErdDocument from "~/models/ErdDocument";
import TableViewModel from "~/models/TableViewModel";

type DdlOption = {
    withTable: boolean,
    withIndex: boolean,
    withForeignKey: boolean,
    withComment: boolean,
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

class DatabaseDdlCreator {

    private readonly tableQueryWithOption: (query: string, tableModel: TableModel, option: DdlOption) => string;
    private readonly columnQueryWithOption: (query: string, overrideName: OverrideName, option: DdlOption) => string;
    private readonly indexQuery: (args: IndexQueryArgs) => string;
    private readonly commentQuery: (erdDocument: ErdDocument, option: DdlOption, escape: (value: string) => string) => string[];
    private readonly reservedWords: Set<string>;
    private readonly escapeChar: string;

    constructor(
        tableQueryWithOption: (query: string, tableModel: TableModel, option: DdlOption) => string,
        columnQueryWithOption: (query: string, overrideName: OverrideName, option: DdlOption) => string,
        indexQuery: (args: IndexQueryArgs) => string,
        commentQuery: (erdDocument: ErdDocument, option: DdlOption, escape: (value: string) => string) => string[],
        reservedWords: string[], escapeChar: string
    ) {
        this.tableQueryWithOption = tableQueryWithOption;
        this.columnQueryWithOption = columnQueryWithOption;
        this.indexQuery = indexQuery;
        this.commentQuery = commentQuery;
        this.reservedWords = new Set(reservedWords);
        this.escapeChar = escapeChar;
    }

    public create(erdDocument: ErdDocument, option: DdlOption) {
        const tableQueries = this.createTableDdl(erdDocument, option);
        const indexQueries = this.createIndexDdl(erdDocument, option);
        const foreignKeyQueries = this.createForeignKeyDdl(erdDocument, option);
        const commentQueries = this.createCommentDdl(erdDocument, option);

        return [...tableQueries, ...indexQueries, ...foreignKeyQueries, ...commentQueries].join("\n");
    }

    createTableDdl(erdDocument: ErdDocument, option: DdlOption): string[] {
        if (option.withTable === false) {
            return [];
        }

        const tableViewModels = erdDocument.getTableViewModels();
        const queries = tableViewModels.map(tableViewModel => {
            const tableModel: TableModel = tableViewModel.tableModel;
            const allColumnModels = erdDocument.toAllColumnModels(tableModel);

            const columnPairs = allColumnModels.map(columnModel => {
                const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;
                const inChildRelation = erdDocument.inChildRelation(tableModel.tableModelId, columnModel.columnModelId);

                return { columnModel, columnShareModel, inChildRelation };
            });

            const columnQueries = columnPairs.map(columnPair => {
                const { columnModel, columnShareModel, inChildRelation } = columnPair;
                return this.columnQuery(columnModel, columnShareModel, inChildRelation, option);
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

            return `${this.tableQuery(tableModel, columnQueries, option)};\n`;
        });

        return (queries.length > 0) ? ["/* create tables. */", ...queries, ""] : [];
    }

    private tableQuery(tableModel: TableModel, columnQueries: string[], option: DdlOption) {
        const query = `CREATE TABLE ${this.escape(tableModel.physicalName)} (\n    ${columnQueries.join(",\n    ")}\n)`;
        return this.tableQueryWithOption(query, tableModel, option);
    }

    private columnQuery(
        columnModel: ColumnModel, columnShareModel: ColumnShareModel, inChildRelation: boolean, option: DdlOption
    ): string {

        const overrideName = overrideColumnName(columnModel, columnShareModel);

        const attributes = [columnShareModel.specifiedColumnType(inChildRelation)];

        if (columnShareModel.unsigned && columnShareModel.columnType.withUnsigned) {
            attributes.push("UNSIGNED");
        }
        if (columnModel.notNull) {
            attributes.push("NOT NULL");
        }
        if (columnModel.unique) {
            attributes.push("UNIQUE");
        }
        if (columnModel.defaultValue) {
            attributes.push("DEFAULT " + columnModel.defaultValue);
        }
        if (columnModel.autoIncrement && columnShareModel.columnType.withAutoIncrement) {
            attributes.push("AUTO_INCREMENT");
        }

        const query = `${this.escape(overrideName.physicalName)} ` + attributes.join(" ")

        return this.columnQueryWithOption(query, overrideName, option);
    }

    createIndexDdl(erViewModel: ErdDocument, option: DdlOption): string[] {
        if (option.withIndex === false) {
            return [];
        }

        const tableViewModels = erViewModel.getTableViewModels();
        const queries = tableViewModels.flatMap(tableViewModel => {
            const tableModel: TableModel = tableViewModel.tableModel;

            return tableModel.tableIndexModels.map(indexModel => {
                const columnQueries = indexModel.indexColumnModels.map(indexColumn => {
                    const columnModel = erViewModel.findColumnModel(indexColumn.columnModelId) as ColumnModel;
                    const columnShareModel = erViewModel.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;

                    const overrideName = overrideColumnName(columnModel, columnShareModel);
                    const columnName = this.escape(overrideName.physicalName);
                    const sortQuery = indexColumn.querySort();

                    return columnName + (sortQuery ? ` ${sortQuery}` : "");
                });

                const indexTypeQuery = indexModel.indexType ? ` USING ${indexModel.indexType}` : "";
                const indexOption = indexModel.indexOption ? `${indexModel.indexOption} ` : ""
                const indexName = this.escape(indexModel.physicalName);
                const tableName = this.escape(tableModel.physicalName);

                return this.indexQuery({ indexOption, indexName, tableName, indexTypeQuery, columnQueries });
            });
        });

        return (queries.length > 0) ? ["/* create indexes. */", ...queries, ""] : [];
    }

    createForeignKeyDdl(erViewModel: ErdDocument, option: DdlOption) {
        if (option.withForeignKey === false) {
            return [];
        }

        const relationViewModels = erViewModel.getRelationViewModels();
        const queries = relationViewModels.map(relationViewModel => {
            const relationModel: RelationModel = relationViewModel.relationModel;

            const childTableViewModel = erViewModel.findTableViewModel(relationModel.childTableModelId) as TableViewModel;
            const childTableModel = childTableViewModel.tableModel;
            const parentTableViewModel = erViewModel.findTableViewModel(relationModel.parentTableModelId) as TableViewModel;
            const parentTableModel = parentTableViewModel.tableModel;

            const pairColumnNames = relationModel.relationPairs.map(relationPair => {
                const childColumnModel = erViewModel.findColumnModel(relationPair.childColumnModelId) as ColumnModel;
                const childColumnShareModel = erViewModel.findColumnShareModel(childColumnModel.columnShareModelId) as ColumnShareModel;

                const parentColumnModel = erViewModel.findColumnModel(relationPair.parentColumnModelId) as ColumnModel;
                const parentColumnShareModel = (parentColumnModel.columnShareModelId === childColumnModel.columnShareModelId)
                    ? childColumnShareModel : erViewModel.findColumnShareModel(parentColumnModel.columnShareModelId) as ColumnShareModel;

                const parentColumnName = overrideColumnName(parentColumnModel, parentColumnShareModel);
                const childColumnName = overrideColumnName(childColumnModel, childColumnShareModel);

                return {
                    parent: this.escape(parentColumnName.physicalName),
                    child: this.escape(childColumnName.physicalName)
                };
            });

            const parentTableName = this.escape(parentTableModel.physicalName);
            const alterQueries = [
                `ADD FOREIGN KEY (${pairColumnNames.map(pair => pair.child).join(", ")})`,
                `REFERENCES ${parentTableName} (${pairColumnNames.map(pair => pair.parent).join(", ")})`,
                `ON UPDATE ${relationModel.onUpdateAction}`,
                `ON DELETE ${relationModel.onDeleteAction}`
            ];

            const childTableName = this.escape(childTableModel.physicalName);

            return `ALTER TABLE ${childTableName}\n    ${alterQueries.join("\n    ")};\n`;
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

        return `${this.escapeChar}${org}${this.escapeChar}`;
    }
}

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

// cSpell:enable

const tableQueryForMySql = (query: string, tableModel: TableModel, option: DdlOption) => {
    if ((option.withComment === false) || (tableModel.logicalName === tableModel.physicalName)) {
        return query
    }

    return `${query} COMMENT '${escapeComment(tableModel.logicalName)}'`;
};

const columnQueryForMySql = (query: string, overrideName: OverrideName, option: DdlOption) => {
    if (option.withComment === false) {
        return query
    }

    if (overrideName.physicalName === overrideName.logicalName) {
        return query;
    }

    return `${query} COMMENT '${escapeComment(overrideName.logicalName)}'`;
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

        const commentQueries = erdDocument.toAllColumnModels(tableModel)
            .map(columnModel => {
                const columnShareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId) as ColumnShareModel;
                if (columnShareModel.logicalName === columnShareModel.physicalName) {
                    return null;
                }

                const tableName = escape(tableModel.physicalName);
                const overrideName = overrideColumnName(columnModel, columnShareModel);
                const columnName = escape(overrideName.physicalName);

                return `COMMENT ON COLUMN ${tableName}.${columnName}`
                    + ` IS '${escapeComment(overrideName.logicalName)}';`;
            })
            .filter((comment): comment is string => (comment != null));

        if (tableModel.logicalName !== tableModel.physicalName) {
            const tableName = escape(tableModel.physicalName);
            commentQueries.unshift(`COMMENT ON TABLE ${tableName} IS '${escapeComment(tableModel.logicalName)}';`);
        }

        if (commentQueries.length > 0) {
            commentQueries.push("");
        }

        return commentQueries;
    });

    return ["/* create comments. */", ...queries, ""];
};

const escapeComment = (comment: string) => {
    return comment.replace("'", '"');
};

const exportConfigs: { [key in DatabaseType]: DatabaseDdlCreator } = {
    "postgres": new DatabaseDdlCreator(
        (query: string) => query,
        (query: string) => query,
        (args: IndexQueryArgs) =>
            `CREATE ${args.indexOption}INDEX ${args.indexName} ON ${args.tableName}`
            + `${args.indexTypeQuery} (${args.columnQueries.join(", ")});`,
        commentQueryForPostgres,
        [...commonReservedWords, ...postgresReservedWords],
        '"' // PostgreSQL uses double quotes as escape character
    ),
    "mysql": new DatabaseDdlCreator(
        tableQueryForMySql,
        columnQueryForMySql,
        (args: IndexQueryArgs) =>
            `CREATE ${args.indexOption}INDEX ${args.indexName} ON ${args.tableName}`
            + `${args.indexTypeQuery} (${args.columnQueries.join(", ")});`,
        () => [],
        [...commonReservedWords, ...mysqlReservedWords],
        '`' // MySQL uses backticks as escape character
    )
};