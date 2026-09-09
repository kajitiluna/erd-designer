import {
    ColumnSnapshot, ForeignKeySnapshot, IndexSnapshot, TableSnapshot, UniqueKeySnapshot
} from "~/models/schema/schema-snapshot";
import { DestructivePolicy, MigrationStatement } from "~/models/schema/schema-migration-ddl/migration-statement";

export type DialectFormatter = {
    formatAddColumn: (table: TableSnapshot, column: ColumnSnapshot, previousColumnName: string | null) => MigrationStatement[];
    formatModifyColumn: (table: TableSnapshot, expectedColumn: ColumnSnapshot, actualColumn: ColumnSnapshot) => MigrationStatement[];
    formatDropColumn: (table: TableSnapshot, columnName: string) => MigrationStatement;
    formatCreateUnique: (table: TableSnapshot, uniqueKey: UniqueKeySnapshot) => MigrationStatement;
    formatDropUnique: (table: TableSnapshot, uniqueKey: UniqueKeySnapshot) => MigrationStatement;
    formatCreateIndex: (table: TableSnapshot, index: IndexSnapshot) => MigrationStatement;
    formatDropIndex: (table: TableSnapshot, index: IndexSnapshot) => MigrationStatement;
    formatAddForeignKey: (table: TableSnapshot, foreignKey: ForeignKeySnapshot) => MigrationStatement;
    formatDropForeignKey: (table: TableSnapshot, foreignKey: ForeignKeySnapshot) => MigrationStatement;
    formatDropTable: (table: TableSnapshot) => MigrationStatement;
};

/** 方言ごとの DialectFormatter 生成器。postgres-dialect.ts / mysql-dialect.ts がこの型で自らを公開する。 */
export type DialectFactory = (destructivePolicy: DestructivePolicy, withComment: boolean) => DialectFormatter;

export class DialectSql {

    /** 型・NULL可否・DEFAULT句を1列分組み立てる。UNSIGNED接尾辞の綴りだけが方言間で異なる。 */
    public static columnAttributes(column: ColumnSnapshot, unsignedSuffix: string, escapeBackslash: boolean): string {
        return formatColumnAttributes(column, unsignedSuffix, escapeBackslash);
    }

    /**
     * defaultValue は比較用に ColumnSnapshot が大文字化・引用符除去済みのため、元の大小文字までは再現できない(既知の制約)。
     * 数値・既知キーワードはそのまま、それ以外は文字列リテラルとして引用する。
     * escapeBackslash は MySQL(バックスラッシュがエスケープ文字として働く)にのみ true を渡す。
     */
    public static defaultLiteral(defaultValue: string, escapeBackslash: boolean): string {
        return formatDefaultLiteral(defaultValue, escapeBackslash);
    }
};

const formatColumnAttributes = (column: ColumnSnapshot, unsignedSuffix: string, escapeBackslash: boolean): string => {
    const type = column.unsigned ? `${column.typeExpression}${unsignedSuffix}` : column.typeExpression;
    const nullability = column.notNull ? "NOT NULL" : "NULL";
    const defaultLiteral = formatDefaultLiteral(column.defaultValue, escapeBackslash);
    const defaultClause = (column.defaultValue !== "") ? ` DEFAULT ${defaultLiteral}` : "";

    return `${type} ${nullability}${defaultClause}`;
};

const KEYWORD_DEFAULT_VALUES = new Set(["CURRENT_TIMESTAMP", "TRUE", "FALSE", "NULL"]);
const NUMERIC_DEFAULT_PATTERN = /^-?\d+(\.\d+)?$/;
// MySQL の ON UPDATE 句付き既定値。mysql.ts の toColumnRow が組み立てる複合表現と対応する。
const CURRENT_TIMESTAMP_ON_UPDATE_PATTERN = /^CURRENT_TIMESTAMP( ON UPDATE CURRENT_TIMESTAMP)?$/;

const formatDefaultLiteral = (defaultValue: string, escapeBackslash: boolean): string => {
    if (
        KEYWORD_DEFAULT_VALUES.has(defaultValue) || NUMERIC_DEFAULT_PATTERN.test(defaultValue)
        || CURRENT_TIMESTAMP_ON_UPDATE_PATTERN.test(defaultValue)
    ) {
        return defaultValue;
    }

    const escaped = escapeBackslash ? defaultValue.replaceAll("\\", "\\\\") : defaultValue;
    return `'${escaped.replaceAll("'", "''")}'`;
};
