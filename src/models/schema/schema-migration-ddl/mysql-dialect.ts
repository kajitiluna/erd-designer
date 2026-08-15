import {
    ColumnSnapshot, ForeignKeySnapshot, IndexSnapshot, TableSnapshot, UniqueKeySnapshot
} from "~/models/schema/schema-snapshot";
import {
    DestructivePolicy, MigrationStatement, MigrationStatements
} from "~/models/schema/schema-migration-ddl/migration-statement";
import { DialectFactory, DialectSql } from "~/models/schema/schema-migration-ddl/dialect";

export const mySqlDialect: DialectFactory = (policy, withComment) => {
    // identifier はイントロスペクションで取得した実DBの名前であり、ERD Designer の名前検証を通らない。
    // バッククォートを含む名前で囲みが破れないよう二重化する。
    const escapeName = (identifier: string): string => `\`${identifier.replaceAll("`", "``")}\``;
    const tableRef = (table: TableSnapshot): string => escapeName(table.tableName);

    // commentValue は呼び出し元が決める: 新規列は withComment===false なら常に空(保全すべき既存値が無い)、
    // 既存列は withComment===false なら actual(DB の現在値)を再掲する。
    const formatColumnClause = (column: ColumnSnapshot, commentValue: string): string => {
        const attributes = DialectSql.columnAttributes(column, " UNSIGNED");
        const autoIncrementClause = column.autoIncrement ? " AUTO_INCREMENT" : "";
        const commentClause = (commentValue !== "") ? ` COMMENT '${commentValue.replaceAll("'", "''")}'` : "";

        return `${attributes}${autoIncrementClause}${commentClause}`;
    };

    return {
        formatAddColumn: initAddColumnFormatter(tableRef, withComment, escapeName, formatColumnClause),
        formatModifyColumn: initModifyColumnFormatter(tableRef, withComment, escapeName, formatColumnClause),
        formatDropColumn: initDropColumnFormatter(tableRef, policy, escapeName),
        formatCreateUnique: initCreateUniqueFormatter(tableRef, escapeName),
        formatDropUnique: initDropUniqueFormatter(tableRef, policy, escapeName),
        formatCreateIndex: initCreateIndexFormatter(tableRef, escapeName),
        formatDropIndex: initDropIndexFormatter(tableRef, policy, escapeName),
        formatAddForeignKey: initAddForeignKeyFormatter(tableRef, escapeName),
        formatDropForeignKey: initDropForeignKeyFormatter(tableRef, policy, escapeName),
        formatDropTable: initDropTableFormatter(tableRef, policy)
    };
};

const initAddColumnFormatter = (
    tableRef: (table: TableSnapshot) => string, withComment: boolean, escapeName: (identifier: string) => string,
    formatColumnClause: (column: ColumnSnapshot, commentValue: string) => string
) => {
    return (table: TableSnapshot, column: ColumnSnapshot, previousColumnName: string | null): MigrationStatement[] => {
        const positionClause = (previousColumnName != null) ? ` AFTER ${escapeName(previousColumnName)}` : " FIRST";
        const commentValue = withComment ? column.comment : "";
        const sql = `ALTER TABLE ${tableRef(table)} ADD COLUMN ${escapeName(column.columnName)} `
            + `${formatColumnClause(column, commentValue)}${positionClause};`;

        return [
            { kind: "addColumn", schemaName: table.schemaName, tableName: table.tableName, sql }
        ];
    };
};

const initModifyColumnFormatter = (
    tableRef: (table: TableSnapshot) => string, withComment: boolean, escapeName: (identifier: string) => string,
    formatColumnClause: (column: ColumnSnapshot, commentValue: string) => string
) => {
    // MODIFY COLUMN は全属性を再指定する方言のため、1つでも省くと既存属性が消える。
    // withComment===false のときは expected のコメントではなく actual を再掲し、既存コメントを保全する。
    return (table: TableSnapshot, expected: ColumnSnapshot, actual: ColumnSnapshot): MigrationStatement[] => {
        const commentValue = withComment ? expected.comment : actual.comment;
        const sql = `ALTER TABLE ${tableRef(table)} MODIFY COLUMN ${escapeName(expected.columnName)} `
            + `${formatColumnClause(expected, commentValue)};`;

        return [
            { kind: "modifyColumn", schemaName: table.schemaName, tableName: table.tableName, sql }
        ];
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
        const sql = `ALTER TABLE ${tableRef(table)} ADD UNIQUE (${columns});`;

        return {
            kind: "createUnique", schemaName: table.schemaName, tableName: table.tableName, sql
        };
    };
};

const initDropUniqueFormatter = (
    tableRef: (table: TableSnapshot) => string, policy: DestructivePolicy, escapeName: (identifier: string) => string
) => {
    return (table: TableSnapshot, uniqueKey: UniqueKeySnapshot): MigrationStatement => {
        if (uniqueKey.constraintName === "") {
            const reasonMessage = `dropping an unnamed unique key on (${uniqueKey.columnNames.join(", ")}) `
                + "requires its name, which was not available.";
            return MigrationStatements.unsupported(table, reasonMessage);
        }

        const sql = `ALTER TABLE ${tableRef(table)} DROP INDEX ${escapeName(uniqueKey.constraintName)};`;
        return MigrationStatements.destructive("dropUnique", table, sql, policy);
    };
};

const initCreateIndexFormatter = (
    tableRef: (table: TableSnapshot) => string, escapeName: (identifier: string) => string
) => {
    return (table: TableSnapshot, index: IndexSnapshot): MigrationStatement => {
        const columns = index.columnNames.map(escapeName).join(", ");
        // MySQL/MariaDB は USING をインデックス名の後に置く(postgres はテーブル名の後)。
        const usingClause = (index.indexType !== "") ? ` USING ${index.indexType}` : "";
        const createKeyword = toCreateIndexKeyword(index.indexOption);
        const sql = `${createKeyword} ${escapeName(index.indexName)}${usingClause} ON ${tableRef(table)} (${columns});`;

        return {
            kind: "createIndex", schemaName: table.schemaName, tableName: table.tableName, sql
        };
    };
};

const initDropIndexFormatter = (
    tableRef: (table: TableSnapshot) => string, policy: DestructivePolicy, escapeName: (identifier: string) => string
) => {
    return (table: TableSnapshot, index: IndexSnapshot): MigrationStatement => {
        const sql = `ALTER TABLE ${tableRef(table)} DROP INDEX ${escapeName(index.indexName)};`;
        return MigrationStatements.destructive("dropIndex", table, sql, policy);
    };
};

const initAddForeignKeyFormatter = (
    tableRef: (table: TableSnapshot) => string, escapeName: (identifier: string) => string
) => {
    return (table: TableSnapshot, foreignKey: ForeignKeySnapshot): MigrationStatement => {
        const childColumns = foreignKey.columnNames.map(escapeName).join(", ");
        const parentColumns = foreignKey.parentColumnNames.map(escapeName).join(", ");
        const sql = `ALTER TABLE ${tableRef(table)}\n    ADD FOREIGN KEY (${childColumns})\n`
            + `    REFERENCES ${escapeName(foreignKey.parentTableName)} (${parentColumns})\n`
            + `    ON UPDATE ${foreignKey.onUpdate}\n    ON DELETE ${foreignKey.onDelete};`;

        return {
            kind: "addForeignKey", schemaName: table.schemaName, tableName: table.tableName, sql
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

        const sql = `ALTER TABLE ${tableRef(table)} DROP FOREIGN KEY ${escapeName(foreignKey.constraintName)};`;
        return MigrationStatements.destructive("dropForeignKey", table, sql, policy);
    };
};

const initDropTableFormatter = (tableRef: (table: TableSnapshot) => string, policy: DestructivePolicy) => {
    return (table: TableSnapshot): MigrationStatement => {
        const sql = `DROP TABLE ${tableRef(table)};`;

        return MigrationStatements.destructive("dropTable", table, sql, policy);
    };
};

// UNIQUE は design-snapshot.ts が uniqueKeys へ合流させるため formatCreateIndex には到達しない。
// ここで扱うのは FULLTEXT/SPATIAL のみで、それ以外(空文字含む)は無印の CREATE INDEX。
const toCreateIndexKeyword = (indexOption: IndexSnapshot["indexOption"]): string => {
    if (indexOption === "FULLTEXT") {
        return "CREATE FULLTEXT INDEX";
    }

    if (indexOption === "SPATIAL") {
        return "CREATE SPATIAL INDEX";
    }

    return "CREATE INDEX";
};
