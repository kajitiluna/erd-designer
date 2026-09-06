import { ForeignKeySnapshot, IndexSnapshot, TableSnapshot, UniqueKeySnapshot } from "~/models/schema/schema-snapshot";
import { MigrationStatement } from "~/models/schema/schema-migration-ddl/migration-statement";
import { DialectFormatter } from "~/models/schema/schema-migration-ddl/dialect";
import ColumnDifference from "~/models/schema/schema-migration-ddl/column-difference";

export default class TableDifference {

    private constructor() {
        // do nothing.
    }

    public static toStatements(
        expected: TableSnapshot, actual: TableSnapshot, dialect: DialectFormatter, withComment: boolean
    ): TableStatements {
        return buildTableStatements(expected, actual, dialect, withComment);
    }
};

type TableStatements = { additive: MigrationStatement[], destructive: MigrationStatement[] };

const buildTableStatements = (
    expectedTable: TableSnapshot, actualTable: TableSnapshot, dialect: DialectFormatter, withComment: boolean
): TableStatements => {
    const columnResult = ColumnDifference.toStatements(expectedTable, actualTable, dialect, withComment);
    const uniqueResult = buildUniqueKeyStatements(expectedTable, actualTable, dialect);
    const indexResult = buildIndexStatements(expectedTable, actualTable, dialect);
    const foreignKeyResult = buildForeignKeyStatements(expectedTable, actualTable, dialect);

    // 生成順序: 列追加 → 列変更 → インデックス/UNIQUE → 外部キー
    const additive = [
        ...columnResult.additive, ...uniqueResult.additive, ...indexResult.additive, ...foreignKeyResult.additive
    ];

    // 削除順序はこの逆: 外部キー → インデックス → 列
    const destructive = [
        ...foreignKeyResult.destructive, ...indexResult.destructive,
        ...uniqueResult.destructive, ...columnResult.destructive
    ];

    return { additive, destructive };
};

const buildUniqueKeyStatements = (
    expectedTable: TableSnapshot, actualTable: TableSnapshot, dialect: DialectFormatter
): TableStatements => {
    // constraintName は設計側の既定が "" のため(schema-snapshot.ts の UniqueKeySnapshot 参照)、
    // キーへ含めると全 UNIQUE が常に DROP+ADD になってしまう。意図的に列構成のみで照合する。
    const toUniqueKeyMatchKey = (uniqueKey: UniqueKeySnapshot): string => JSON.stringify(uniqueKey.columnNames);
    const matched = matchByColumns(expectedTable.uniqueKeys, actualTable.uniqueKeys, toUniqueKeyMatchKey);

    return {
        additive: matched.missing.map(key => dialect.formatCreateUnique(expectedTable, key)),
        destructive: matched.unexpected.map(key => dialect.formatDropUnique(actualTable, key))
    };
};

const buildIndexStatements = (
    expectedTable: TableSnapshot, actualTable: TableSnapshot, dialect: DialectFormatter
): TableStatements => {

    // indexName は db-diff (schema-diff.ts の compareIndexes) が名前照合の一次キーに使う一方、
    // migrate-ddl は命名の割り当てを行わないため対象外。
    // 列構成に加えて indexOption/indexType(BTREE→HASH 等)の変更も見逃さないよう、indexName を除く全フィールドをキーに含める。
    const toIndexMatchKey = (index: IndexSnapshot): string => {
        return JSON.stringify([index.columnNames, index.indexOption, index.indexType]);
    };

    const matched = matchByColumns(expectedTable.indexes, actualTable.indexes, toIndexMatchKey);

    return {
        additive: matched.missing.map(index => dialect.formatCreateIndex(expectedTable, index)),
        destructive: matched.unexpected.map(index => dialect.formatDropIndex(actualTable, index))
    };
};

const buildForeignKeyStatements = (
    expectedTable: TableSnapshot, actualTable: TableSnapshot, dialect: DialectFormatter
): TableStatements => {
    // constraintName は create-ddl.ts が出力しないため設計側は常に "" になり、キーに使えない(schema-snapshot.ts 参照)。
    // 列構成に加えて参照先(parentSchemaName/parentTableName/parentColumnNames)と ON UPDATE/ON DELETE の
    // 変更も検出できるよう、constraintName を除く全フィールドをキーに含める。
    const toForeignKeyMatchKey = (foreignKey: ForeignKeySnapshot): string => {
        const keys = [
            foreignKey.columnNames, foreignKey.parentSchemaName, foreignKey.parentTableName,
            foreignKey.parentColumnNames, foreignKey.onUpdate, foreignKey.onDelete
        ];
        return JSON.stringify(keys);
    };

    const matched = matchByColumns(expectedTable.foreignKeys, actualTable.foreignKeys, toForeignKeyMatchKey);

    return {
        additive: matched.missing.map(key => dialect.formatAddForeignKey(expectedTable, key)),
        destructive: matched.unexpected.map(key => dialect.formatDropForeignKey(actualTable, key))
    };
};

// migrate-ddl は「レビューしてから実行する」草案生成であり、SchemaComparison.compare のような名前の割り当ては行わないが、
// 列構成だけでなく toMatchKey が表す主要な属性(FK の参照/アクション、index の種別等)の一致も見て突き合わせる。
const matchByColumns = <TYPE>(
    expectedItems: readonly TYPE[], actualItems: readonly TYPE[], toMatchKey: (item: TYPE) => string
): { missing: readonly TYPE[], unexpected: readonly TYPE[] } => {
    const actualKeys = new Set(actualItems.map(actual => toMatchKey(actual)));
    const expectedKeys = new Set(expectedItems.map(expected => toMatchKey(expected)));

    const missing = expectedItems.filter(expectedItem => {
        const matchKey = toMatchKey(expectedItem);
        return (actualKeys.has(matchKey) === false);
    });

    const unexpected = actualItems.filter(actualItem => {
        const matchKey = toMatchKey(actualItem);
        return (expectedKeys.has(matchKey) === false);
    });

    return { missing, unexpected };
};
