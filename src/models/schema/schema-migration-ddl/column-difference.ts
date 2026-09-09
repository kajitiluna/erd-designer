import { ColumnSnapshot, TableSnapshot } from "~/models/schema/schema-snapshot";
import { MigrationStatement, MigrationStatements } from "~/models/schema/schema-migration-ddl/migration-statement";
import { DialectFormatter } from "~/models/schema/schema-migration-ddl/dialect";

export default class ColumnDifference {

    private constructor() {
        // do nothing.
    }

    public static toStatements({
        expectedTable, actualTable, dialect, withComment, isCaseSensitive
    }: ToStatementArgs): StatementGroup {
        return buildColumnStatements(expectedTable, actualTable, dialect, withComment, isCaseSensitive);
    }
};

type ToStatementArgs = {
    expectedTable: TableSnapshot;
    actualTable: TableSnapshot;
    dialect: DialectFormatter;
    withComment: boolean;
    isCaseSensitive: boolean
};

type StatementGroup = { additive: MigrationStatement[], destructive: MigrationStatement[] };

const buildColumnStatements = (
    expectedTable: TableSnapshot, actualTable: TableSnapshot, dialect: DialectFormatter, withComment: boolean,
    isCaseSensitive: boolean
): StatementGroup => {
    const actualByName = new Map(actualTable.columns.map(column => [column.columnName, column]));
    const actualByCaseFoldedName = new Map(actualTable.columns.map(column => [column.columnName.toUpperCase(), column]));
    const expectedByName = new Map(expectedTable.columns.map(column => [column.columnName, column]));
    const expectedByCaseFoldedName = new Map(expectedTable.columns.map(column => [column.columnName.toUpperCase(), column]));

    const toActualColumn = (columnName: string): ColumnSnapshot | undefined => {
        const exactMatch = actualByName.get(columnName);
        if ((exactMatch != null) || (isCaseSensitive === true)) {
            return exactMatch;
        }

        return actualByCaseFoldedName.get(columnName.toUpperCase());
    };

    const hasExpectedMatch = (columnName: string): boolean => {
        if (expectedByName.has(columnName)) {
            return true;
        }

        return (isCaseSensitive === false) && expectedByCaseFoldedName.has(columnName.toUpperCase());
    };

    // マイグレーション後に実在する列(既存列、または追加可能な新規列)だけが AFTER の参照先になれる。
    const survivesMigration = expectedTable.columns
        .map(column => ((toActualColumn(column.columnName) != null) || canAddColumn(column)));

    const additive = expectedTable.columns.flatMap((column, index) => {
        const actualColumn = toActualColumn(column.columnName);
        if (actualColumn == null) {
            const previousColumnName = findPreviousColumnName(expectedTable.columns, survivesMigration, index);
            return buildAddColumnStatements(expectedTable, column, previousColumnName, dialect);
        }

        // withComment === false のときはコメントを変更しないため、
        // コメントだけが異なる列は差分として扱わない(扱うとコメントを持つ全列が MODIFY 対象になってしまう)。
        const isSameColumn =
            (column.typeExpression === actualColumn.typeExpression) && (column.unsigned === actualColumn.unsigned)
            && (column.notNull === actualColumn.notNull) && (column.defaultValue === actualColumn.defaultValue)
            && (column.autoIncrement === actualColumn.autoIncrement)
            && ((withComment === false) || (column.comment === actualColumn.comment));

        if (isSameColumn) {
            return [];
        }

        return dialect.formatModifyColumn(expectedTable, column, actualColumn);
    });

    const destructive = actualTable.columns
        .filter(column => (hasExpectedMatch(column.columnName) === false))
        .map(column => dialect.formatDropColumn(actualTable, column.columnName));

    const caseFoldedNotices = toCaseFoldedColumnNotices(expectedTable, actualTable, isCaseSensitive);

    return { additive: [...additive, ...caseFoldedNotices], destructive };
};

// テーブル名の case-fold 通知(migration-ddl.ts の toCaseFoldedTableNotice)と対称。
// 大小文字違いで一致した列は additive/destructive に現れず気づかれずに素通りしてしまうため、
// 事実そのものを unsupported として明示する(何も生成しない)。
const toCaseFoldedColumnNotices = (
    expectedTable: TableSnapshot, actualTable: TableSnapshot, caseSensitiveColumnNames: boolean
): MigrationStatement[] => {
    if (caseSensitiveColumnNames === true) {
        return [];
    }

    const actualByCaseFoldedName = new Map(actualTable.columns.map(column => [column.columnName.toUpperCase(), column]));

    return expectedTable.columns.flatMap(column => {
        const actualColumn = actualByCaseFoldedName.get(column.columnName.toUpperCase());
        if ((actualColumn == null) || (actualColumn.columnName === column.columnName)) {
            return [];
        }

        const reason = "Column name differs only in case: "
            + `design="${column.columnName}", database="${actualColumn.columnName}". `
            + "Treated as the same column; review the naming difference manually.";

        return [MigrationStatements.unsupported(actualTable, reason)];
    });
};

// 既存行に依存する NOT NULL 化(DEFAULT なしの NOT NULL 列追加を含む)は安全に導出できない。
const canAddColumn = (column: ColumnSnapshot): boolean => {
    return (column.notNull && (column.defaultValue === "") && (column.autoIncrement === false)) === false;
};

// previousColumnName(MySQL 系の AFTER 句)は「マイグレーション後に実在する列」だけを指せる。
// 直前の列が canAddColumn で生成不可(unsupported)になっていると、
// 存在しない列を AFTER で参照してしまうため、生成可否を先に確定させてから直近の生存列を辿る。
const findPreviousColumnName = (
    columns: readonly ColumnSnapshot[], survivesMigration: readonly boolean[], index: number
): string | null => {
    const precedingSurvivors = columns.slice(0, index).filter((_, cursor) => survivesMigration[cursor]);

    return (precedingSurvivors.length > 0) ? precedingSurvivors[precedingSurvivors.length - 1].columnName : null;
};

const buildAddColumnStatements = (
    table: TableSnapshot, column: ColumnSnapshot, previousColumnName: string | null, dialect: DialectFormatter
): MigrationStatement[] => {
    if (canAddColumn(column) === false) {
        const reasonMessage = `adding NOT NULL column "${column.columnName}" `
            + "without a DEFAULT depends on existing row values, so it is not generated.";
        return [MigrationStatements.unsupported(table, reasonMessage)];
    }

    return dialect.formatAddColumn(table, column, previousColumnName);
};
