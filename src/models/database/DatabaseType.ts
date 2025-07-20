import TableIndexSupport from "~/models/database/TableIndexSupport";

export type DatabaseType = "postgres" | "mysql"

export class Database {

    constructor(
        public readonly databaseType: DatabaseType,
        public readonly name: string,
        public readonly tableIndexSupport: TableIndexSupport,
        public readonly supportsArrayType: boolean,
    ) { }

    public static get(databaseType: DatabaseType): Database {
        return databases[databaseType];
    }

    public static allDatabaseTypes(): readonly DatabaseType[] {
        return Object.keys(databases) as DatabaseType[];
    }
}

// cSpell: ignore SPGIST FULLTEXT
const databases: { [key in DatabaseType]: Database } = {
    "postgres": new Database("postgres", "PostgreSQL",
        new TableIndexSupport(["UNIQUE"], ["BTREE", "HASH", "GIST", "SPGIST", "GIN", "BRIN"], true),
        true
    ),
    "mysql": new Database("mysql", "MySQL",
        new TableIndexSupport(["UNIQUE", "FULLTEXT", "SPATIAL"], ["BTREE", "HASH"]),
        false
    ),
};