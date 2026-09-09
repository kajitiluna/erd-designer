import { TableSnapshot } from "~/models/schema/schema-snapshot";

/** 破壊的操作の扱い。コメントアウトと素の SQL を1つの union で切り替える。 */
export type DestructivePolicy = "commentOut" | "emit";

export type MigrationStatement = {
    kind: MigrationStatementKind;
    schemaName: string;
    tableName: string;
    sql: string;
};

type MigrationStatementKind =
    "addColumn" | "modifyColumn" | "comment" | "createUnique" | "createIndex" | "addForeignKey"
    | DestructiveStatementKind | "unsupported";

/** buildMigrationDdl の destructiveCount 集計対象。破壊的 kind の集合を型でも表現する。 */
type DestructiveStatementKind =
    "dropForeignKey" | "dropIndex" | "dropUnique" | "dropColumn" | "dropTable";

const DESTRUCTIVE_STATEMENT_KINDS = new Set<MigrationStatementKind>(
    ["dropForeignKey", "dropIndex", "dropUnique", "dropColumn", "dropTable"]
);

export class MigrationStatements {

    private constructor() {
        // do nothing.
    }

    public static unsupported(table: TableSnapshot, reason: string): MigrationStatement {
        return {
            kind: "unsupported",
            schemaName: table.schemaName,
            tableName: table.tableName,
            sql: `-- unsupported: ${reason}`
        };
    }

    /** kind は DestructiveStatementKind に限定し、破壊的 SQL のコメントアウト方針をここで一元適用する。 */
    public static destructive(
        kind: DestructiveStatementKind, table: TableSnapshot, sql: string, destructivePolicy: DestructivePolicy
    ): MigrationStatement {
        const destructiveSql = (destructivePolicy === "emit")
            ? sql : `-- destructive: pass --allow-destructive to emit this as executable SQL\n-- ${sql}`;

        return { kind, schemaName: table.schemaName, tableName: table.tableName, sql: destructiveSql };
    }

    public static isDestructive(statement: MigrationStatement): boolean {
        return DESTRUCTIVE_STATEMENT_KINDS.has(statement.kind);
    }
};
