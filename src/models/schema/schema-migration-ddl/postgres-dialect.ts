import {
    ColumnSnapshot, ForeignKeySnapshot, IndexSnapshot, TableSnapshot, UniqueKeySnapshot
} from "~/models/schema/schema-snapshot";
import {
    DestructivePolicy, MigrationStatement, MigrationStatements
} from "~/models/schema/schema-migration-ddl/migration-statement";
import { DialectFactory, DialectSql } from "~/models/schema/schema-migration-ddl/dialect";

export const postgresDialect: DialectFactory = (destructivePolicy, withComment) => {
    // identifier はイントロスペクションで取得した実DBの名前であり、ERD Designer の名前検証を通らない。
    // ダブルクォートを含む名前で囲みが破れないよう二重化する。
    const escapeName = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

    const tableRef = (table: TableSnapshot): string => toQualifiedName(table.schemaName, table.tableName, escapeName);
    const formatColumnComment = (table: TableSnapshot, columnName: string, comment: string): MigrationStatement => {
        return {
            kind: "comment", schemaName: table.schemaName, tableName: table.tableName,
            sql: `COMMENT ON COLUMN ${tableRef(table)}.${escapeName(columnName)} IS '${comment.replaceAll("'", "''")}';`
        };
    };

    return {
        formatAddColumn: initAddColumnFormatter(tableRef, withComment, escapeName, formatColumnComment),
        formatModifyColumn: initModifyColumnFormatter(tableRef, withComment, escapeName, formatColumnComment),
        formatDropColumn: initDropColumnFormatter(tableRef, destructivePolicy, escapeName),
        formatCreateUnique: initCreateUniqueFormatter(tableRef, escapeName),
        formatDropUnique: initDropUniqueFormatter(tableRef, destructivePolicy, escapeName),
        formatCreateIndex: initCreateIndexFormatter(tableRef, escapeName),
        formatDropIndex: initDropIndexFormatter(destructivePolicy, escapeName),
        formatAddForeignKey: initAddForeignKeyFormatter(tableRef, escapeName),
        formatDropForeignKey: initDropForeignKeyFormatter(tableRef, destructivePolicy, escapeName),
        formatDropTable: initDropTableFormatter(tableRef, destructivePolicy)
    };
};

const initAddColumnFormatter = (
    tableRef: (table: TableSnapshot) => string,
    withComment: boolean,
    escapeName: (identifier: string) => string,
    formatColumnComment: (table: TableSnapshot, columnName: string, comment: string) => MigrationStatement
) => {
    // PostgreSQL には列挿入位置を指定する構文が無いため、previousColumnName は参照しない。
    return (table: TableSnapshot, column: ColumnSnapshot): MigrationStatement[] => {
        const definition = DialectSql.columnAttributes(column, "");
        const columnStatement: MigrationStatement = {
            kind: "addColumn", schemaName: table.schemaName, tableName: table.tableName,
            // PostgreSQL に列挿入位置を指定する構文は無く、常に末尾に追加される。
            sql: `ALTER TABLE ${tableRef(table)} ADD COLUMN ${escapeName(column.columnName)} ${definition};\n`
                + `-- note: PostgreSQL appends new columns at the end; column order may not match the design.`
        };

        const autoIncrementNote = column.autoIncrement ? [
            MigrationStatements.unsupported(table, "auto-increment for a new PostgreSQL column is not generated; "
                + "add IDENTITY manually if needed.")
        ] : [];
        const commentStatement = (withComment && (column.comment !== ""))
            ? [formatColumnComment(table, column.columnName, column.comment)] : [];

        return [columnStatement, ...autoIncrementNote, ...commentStatement];
    };
};

const initModifyColumnFormatter = (
    tableRef: (table: TableSnapshot) => string,
    withComment: boolean,
    escapeName: (identifier: string) => string,
    formatColumnComment: (table: TableSnapshot, columnName: string, comment: string) => MigrationStatement
) => {
    const initStatement = (table: TableSnapshot, sql: string): MigrationStatement => {
        return {
            kind: "modifyColumn", schemaName: table.schemaName, tableName: table.tableName, sql
        };
    };

    return (table: TableSnapshot, expected: ColumnSnapshot, actual: ColumnSnapshot): MigrationStatement[] => {
        const statements: MigrationStatement[] = [];

        if (expected.typeExpression !== actual.typeExpression) {
            const sql = `ALTER TABLE ${tableRef(table)} ALTER COLUMN ${escapeName(expected.columnName)} `
                + `TYPE ${expected.typeExpression} USING ${escapeName(expected.columnName)}::${expected.typeExpression};`;

            const statement = initStatement(table, sql);
            statements.push(statement);
        }

        if (expected.notNull !== actual.notNull) {
            const sql = `ALTER TABLE ${tableRef(table)} ALTER COLUMN ${escapeName(expected.columnName)} `
                + `${expected.notNull ? "SET NOT NULL" : "DROP NOT NULL"};`;

            const statement = initStatement(table, sql);
            statements.push(statement);
        }

        if (expected.defaultValue !== actual.defaultValue) {
            const clause = (expected.defaultValue !== "")
                ? `SET DEFAULT ${DialectSql.defaultLiteral(expected.defaultValue)}` : "DROP DEFAULT";
            const sql = `ALTER TABLE ${tableRef(table)} ALTER COLUMN ${escapeName(expected.columnName)} ${clause};`;

            const statement = initStatement(table, sql);
            statements.push(statement);
        }

        if (expected.autoIncrement !== actual.autoIncrement) {
            const reason = "changing auto-increment on an existing PostgreSQL column "
                + "requires IDENTITY/sequence changes that are not generated."

            const statement = MigrationStatements.unsupported(table, reason);
            statements.push(statement);
        }

        if (withComment && (expected.comment !== actual.comment)) {
            const statement = formatColumnComment(table, expected.columnName, expected.comment);
            statements.push(statement);
        }

        return statements;
    };
};

const initDropColumnFormatter = (
    tableRef: (table: TableSnapshot) => string, policy: DestructivePolicy, escapeName: (identifier: string) => string
) => {
    return (table: TableSnapshot, columnName: string): MigrationStatement => {
        const sql = `ALTER TABLE ${tableRef(table)} DROP COLUMN ${escapeName(columnName)};`;
        return MigrationStatements.destructive("dropColumn", table, sql, policy);
    };
};

const initCreateUniqueFormatter = (
    tableRef: (table: TableSnapshot) => string, escapeName: (identifier: string) => string
) => {
    return (table: TableSnapshot, uniqueKey: UniqueKeySnapshot): MigrationStatement => {
        const columns = uniqueKey.columnNames.map(escapeName).join(", ");

        return {
            kind: "createUnique", schemaName: table.schemaName, tableName: table.tableName,
            sql: `ALTER TABLE ${tableRef(table)} ADD UNIQUE (${columns});`
        };
    };
};

const initDropUniqueFormatter = (
    tableRef: (table: TableSnapshot) => string, policy: DestructivePolicy, escapeName: (identifier: string) => string
) => {
    return (table: TableSnapshot, uniqueKey: UniqueKeySnapshot): MigrationStatement => {
        if (uniqueKey.constraintName === "") {
            return MigrationStatements.unsupported(table,
                `dropping an unnamed unique constraint on (${uniqueKey.columnNames.join(", ")}) requires its name, `
                + "which was not available.");
        }

        const sql = `ALTER TABLE ${tableRef(table)} DROP CONSTRAINT ${escapeName(uniqueKey.constraintName)};`;

        return MigrationStatements.destructive("dropUnique", table, sql, policy);
    };
};

const initCreateIndexFormatter = (
    tableRef: (table: TableSnapshot) => string, escapeName: (identifier: string) => string
) => {
    return (table: TableSnapshot, index: IndexSnapshot): MigrationStatement => {
        const columns = index.columnNames.map(escapeName).join(", ");
        const usingClause = (index.indexType !== "") ? ` USING ${index.indexType}` : "";

        return {
            kind: "createIndex", schemaName: table.schemaName, tableName: table.tableName,
            sql: `CREATE INDEX ${escapeName(index.indexName)} ON ${tableRef(table)}${usingClause} (${columns});`
        };
    };
};

const initDropIndexFormatter = (policy: DestructivePolicy, escapeName: (identifier: string) => string) => {
    return (table: TableSnapshot, index: IndexSnapshot): MigrationStatement => {
        // インデックスはテーブルと同じスキーマに属するため、DROP は修飾が必要
        // (CREATE 側のインデックス名は非修飾のまま — PostgreSQL がインデックス名の修飾を構文エラーにするため)。
        const indexRef = toQualifiedName(table.schemaName, index.indexName, escapeName);
        const sql = `DROP INDEX ${indexRef};`;

        return MigrationStatements.destructive("dropIndex", table, sql, policy);
    };
};

const initAddForeignKeyFormatter = (
    tableRef: (table: TableSnapshot) => string, escapeName: (identifier: string) => string
) => {
    return (table: TableSnapshot, foreignKey: ForeignKeySnapshot): MigrationStatement => {
        const childColumns = foreignKey.columnNames.map(escapeName).join(", ");
        const parentColumns = foreignKey.parentColumnNames.map(escapeName).join(", ");
        const parentTable = toQualifiedName(foreignKey.parentSchemaName, foreignKey.parentTableName, escapeName);

        return {
            kind: "addForeignKey", schemaName: table.schemaName, tableName: table.tableName,
            sql: `ALTER TABLE ${tableRef(table)}\n`
                + `    ADD FOREIGN KEY (${childColumns})\n`
                + `    REFERENCES ${parentTable} (${parentColumns})\n`
                + `    ON UPDATE ${foreignKey.onUpdate}\n`
                + `    ON DELETE ${foreignKey.onDelete};`
        };
    };
};

const initDropForeignKeyFormatter = (
    tableRef: (table: TableSnapshot) => string, policy: DestructivePolicy, escapeName: (identifier: string) => string
) => {
    return (table: TableSnapshot, foreignKey: ForeignKeySnapshot): MigrationStatement => {
        if (foreignKey.constraintName === "") {
            const reasonMessage = `dropping an unnamed foreign key on (${foreignKey.columnNames.join(", ")}) `
                + "requires its name, which was not available.";
            return MigrationStatements.unsupported(table, reasonMessage);
        }

        const sql = `ALTER TABLE ${tableRef(table)} DROP CONSTRAINT ${escapeName(foreignKey.constraintName)};`;
        return MigrationStatements.destructive("dropForeignKey", table, sql, policy);
    };
};

const initDropTableFormatter = (tableRef: (table: TableSnapshot) => string, policy: DestructivePolicy) => {
    return (table: TableSnapshot): MigrationStatement => {
        const sql = `DROP TABLE ${tableRef(table)};`;
        return MigrationStatements.destructive("dropTable", table, sql, policy);
    };
};

// 修飾対象と escape 規則を1箇所にまとめ、テーブル参照と FK 親テーブル参照で別々に組み立てて非対称になる事態を防ぐ。
const toQualifiedName = (schemaName: string, objectName: string, escape: (identifier: string) => string): string => {
    return (schemaName !== "") ? `${escape(schemaName)}.${escape(objectName)}` : escape(objectName);
};