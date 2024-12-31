import TableIndexSupport from "~/models/database/TableIndexSupport";

export type DatabaseType = "postgres" | "mysql"

export class Database {
    constructor(
        public readonly databaseType: DatabaseType,
        public readonly name: string,
        public readonly tableIndexSupport: TableIndexSupport
    ) { }
}

export type Databases = { [key in DatabaseType]: Database };

export const databases: Databases = {
    "postgres": new Database("postgres", "PostgreSQL",
        new TableIndexSupport(["UNIQUE"], ["BTREE", "HASH", "GIST", "SPGIST", "GIN", "BRIN"], true)
    ),
    "mysql": new Database("mysql", "MySQL",
        new TableIndexSupport(["UNIQUE", "FULLTEXT", "SPATIAL"], ["BTREE", "HASH"])
    ),
};