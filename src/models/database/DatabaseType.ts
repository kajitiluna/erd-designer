import TableIndexSupport from "~/models/database/TableIndexSupport";
import TableUniqueKeySupport from "~/models/database/TableUniqueKeySupport";

export type DatabaseType = "postgres" | "mysql" | "ms_sqlserver" | "mariadb" | "sqlite" | "snowflake" | "bigquery";

export class Database {

    constructor(
        public readonly databaseType: DatabaseType,
        public readonly name: string,
        public readonly uniqueKeySupport: TableUniqueKeySupport,
        public readonly tableIndexSupport: TableIndexSupport,
        private readonly tableOption: TableOption,
        private readonly columnOption: ColumnOption
    ) { }

    public static get(databaseType: DatabaseType): Database {
        return databases[databaseType];
    }

    public static allDatabaseTypes(): readonly DatabaseType[] {
        return Object.keys(databases) as DatabaseType[];
    }

    public get supportsSchema(): boolean {
        return this.tableOption.supportsSchema;
    }

    public get supportsTableCollate(): boolean {
        return this.tableOption.supportsTableCollate;
    }

    public get supportsArrayType(): boolean {
        return this.columnOption.supportArray;
    }

    public get supportsStructType(): boolean {
        return this.columnOption.supportStruct;
    }

    public get editableCharacterSet(): boolean {
        return this.columnOption.editableCharacterSet;
    }

    public get collatePattern(): RegExp {
        return this.tableOption.collatePattern;
    }

    public autoIncrementLabel(): string {
        return this.columnOption.autoIncrementLabel;
    }
}

type TableOption = {
    supportsSchema: boolean,
    supportsTableCollate: boolean,
    collatePattern: RegExp
};

type ColumnOption = {
    autoIncrementLabel: string,
    editableCharacterSet: boolean,
    supportArray: boolean,
    supportStruct: boolean
};

// cSpell: ignore SPGIST FULLTEXT
const databases: { [key in DatabaseType]: Database } = {
    "postgres": new Database(
        "postgres", "PostgreSQL",
        new TableUniqueKeySupport({ orderable: false }),
        new TableIndexSupport({
            indexOptions: ["UNIQUE"],
            indexTypes: ["BTREE", "HASH", "GIST", "SPGIST", "GIN", "BRIN"],
            nullsOrder: true
        }),
        { supportsSchema: true, supportsTableCollate: false, collatePattern: /^[a-zA-Z][a-zA-Z0-9_.-]*$/ } as const,
        {
            autoIncrementLabel: "Generated Always As Identity", editableCharacterSet: false,
            supportArray: true, supportStruct: false
        } as const
    ),
    "mysql": new Database(
        "mysql", "MySQL",
        new TableUniqueKeySupport({ orderable: true }),
        new TableIndexSupport({
            indexOptions: ["UNIQUE", "FULLTEXT", "SPATIAL"],
            indexTypes: ["BTREE", "HASH"]
        }),
        { supportsSchema: false, supportsTableCollate: true, collatePattern: /^[a-zA-Z][a-zA-Z0-9_]*$/ } as const,
        { autoIncrementLabel: "Auto Increment", editableCharacterSet: true, supportArray: false, supportStruct: false } as const
    ),
    "mariadb": new Database(
        "mariadb", "MariaDB",
        new TableUniqueKeySupport({ orderable: true }),
        new TableIndexSupport({
            indexOptions: ["UNIQUE", "FULLTEXT", "SPATIAL"],
            indexTypes: ["BTREE", "HASH"]
        }),
        { supportsSchema: false, supportsTableCollate: true, collatePattern: /^[a-zA-Z][a-zA-Z0-9_]*$/ } as const,
        { autoIncrementLabel: "Auto Increment", editableCharacterSet: true, supportArray: false, supportStruct: false } as const
    ),
    "ms_sqlserver": new Database(
        "ms_sqlserver", "MS SQL Server",
        new TableUniqueKeySupport({ orderable: true }),
        new TableIndexSupport({
            indexOptions: ["UNIQUE"],
            indexTypes: [],
            supportsClustered: true,
        }),
        { supportsSchema: true, supportsTableCollate: false, collatePattern: /^[a-zA-Z][a-zA-Z0-9_]*$/ } as const,
        { autoIncrementLabel: "Identity", editableCharacterSet: false, supportArray: false, supportStruct: false } as const
    ),
    "sqlite": new Database(
        "sqlite", "SQLite",
        new TableUniqueKeySupport({ orderable: true }),
        new TableIndexSupport({
            indexOptions: ["UNIQUE"],
            indexTypes: []
        }),
        { supportsSchema: false, supportsTableCollate: false, collatePattern: /^[a-zA-Z][a-zA-Z0-9_]*$/ } as const,
        { autoIncrementLabel: "", editableCharacterSet: false, supportArray: false, supportStruct: false } as const
    ),
    "snowflake": new Database(
        "snowflake", "Snowflake",
        new TableUniqueKeySupport({ orderable: false }),
        new TableIndexSupport({ indexOptions: [], indexTypes: [], supportsIndex: false }),
        { supportsSchema: true, supportsTableCollate: false, collatePattern: /^[a-zA-Z][a-zA-Z0-9_.-]*$/ } as const,
        { autoIncrementLabel: "Autoincrement", editableCharacterSet: false, supportArray: false, supportStruct: false } as const
    ),
    "bigquery": new Database(
        "bigquery", "BigQuery",
        new TableUniqueKeySupport({ orderable: false, supportsUniqueKey: false }),
        new TableIndexSupport({ indexOptions: [], indexTypes: [], supportsIndex: false }),
        { supportsSchema: true, supportsTableCollate: false, collatePattern: /^[a-zA-Z][a-zA-Z0-9_.-]*$/ } as const,
        { autoIncrementLabel: "", editableCharacterSet: false, supportArray: true, supportStruct: true } as const
    ),
};