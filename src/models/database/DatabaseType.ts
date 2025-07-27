import TableIndexSupport from "~/models/database/TableIndexSupport";

export type DatabaseType = "postgres" | "mysql" | "ms_sqlserver";

export class Database {

    constructor(
        public readonly databaseType: DatabaseType,
        public readonly name: string,
        public readonly tableIndexSupport: TableIndexSupport,
        private readonly columnOption: ColumnOption
    ) { }

    public static get(databaseType: DatabaseType): Database {
        return databases[databaseType];
    }

    public static allDatabaseTypes(): readonly DatabaseType[] {
        return Object.keys(databases) as DatabaseType[];
    }

    public get supportsArrayType(): boolean {
        return this.columnOption.supportArray;
    }

    public autoIncrementLabel(): string {
        return this.columnOption.autoIncrementLabel ?? "";
    }
}

type ColumnOption = {
    autoIncrementLabel?: string,
    supportArray: boolean
};

// cSpell: ignore SPGIST FULLTEXT
const databases: { [key in DatabaseType]: Database } = {
    "postgres": new Database(
        "postgres", "PostgreSQL",
        new TableIndexSupport({
            indexOptions: ["UNIQUE"],
            indexTypes: ["BTREE", "HASH", "GIST", "SPGIST", "GIN", "BRIN"],
            nullsOrder: true
        }),
        { supportArray: true }
    ),
    "mysql": new Database(
        "mysql", "MySQL",
        new TableIndexSupport({
            indexOptions: ["UNIQUE", "FULLTEXT", "SPATIAL"],
            indexTypes: ["BTREE", "HASH"]
        }),
        { autoIncrementLabel: "Auto Increment", supportArray: false }
    ),
    "ms_sqlserver": new Database(
        "ms_sqlserver", "MS SQL Server",
        new TableIndexSupport({
            indexOptions: ["UNIQUE"],
            indexTypes: [],
            supportsClustered: true,
        }),
        { autoIncrementLabel: "Identity", supportArray: false }
    ),
};