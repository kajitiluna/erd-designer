import { DifferenceCategory, DifferenceValue, SchemaDiff, SchemaDifference } from "~/models/schema/schema-difference";
import {
    ColumnSnapshot, ForeignKeySnapshot, IndexSnapshot, SchemaCompareScope, SchemaSnapshot, SchemaWarning,
    TableSnapshot, UniqueKeySnapshot
} from "~/models/schema/schema-snapshot";
import { arraysEqual } from "~/models/schema/support";
import TableMatcher, { TableMatchPair } from "~/models/schema/table-matcher";

export class SchemaComparison {

    private constructor() {
        // do nothing
    }

    /**
     * expected を正、actual を比較対象として差分を取る。方向中立。
     * missing / unexpected は常に actual 側から見た意味で、表示語への翻訳は出力層(schema-diff-report.ts)が担う。
     */
    public static compare(expected: SchemaSnapshot, actual: SchemaSnapshot, scope: SchemaCompareScope): SchemaDiff {
        const tableMatch = TableMatcher.match(expected.tables, actual.tables, scope.withSchema);

        const schemaDifferences = compareSchemaNames(expected.schemaNames, actual.schemaNames);
        const tableMissingExpects = tableMatch.missingExpected.map(table =>
            toDifference("table.missing", table.schemaName, table.tableName, table.tableName,
                PRESENT_VALUE, ABSENT_VALUE)
        );
        const tableUnexpectedActual = tableMatch.unexpectedActual.map(table =>
            toDifference("table.unexpected", table.schemaName, table.tableName, table.tableName,
                ABSENT_VALUE, PRESENT_VALUE)
        );
        const tablePairResults = tableMatch.pairs.map(pair => compareTablePair(pair.expected, pair.actual, scope));
        const caseFoldedTableWarnings = tableMatch.caseFoldedPairs.map(pair => toCaseFoldedTableWarning(pair));

        const differences = [
            ...schemaDifferences, ...tableMissingExpects, ...tableUnexpectedActual,
            ...tablePairResults.flatMap(result => result.differences)
        ];
        const warnings = [
            ...expected.warnings, ...actual.warnings, ...caseFoldedTableWarnings,
            ...tablePairResults.flatMap(result => result.warnings)
        ];

        return { differences, warnings };
    }
}

const toCaseFoldedTableWarning = (pair: TableMatchPair): SchemaWarning => {
    return {
        category: "name.caseFolded", schemaName: pair.expected.schemaName, tableName: pair.expected.tableName,
        message: `Table name differs only in case: design="${pair.expected.tableName}" `
            + `database="${pair.actual.tableName}".`
    };
};

const compareSchemaNames = (expectedNames: readonly string[], actualNames: readonly string[]): SchemaDifference[] => {
    const actualSet = new Set(actualNames);
    const expectedSet = new Set(expectedNames);

    const missing = expectedNames.filter(name => (actualSet.has(name) === false))
        .map(name => toDifference("schema.missing", name, "", name, PRESENT_VALUE, ABSENT_VALUE));
    const unexpected = actualNames.filter(name => (expectedSet.has(name) === false))
        .map(name => toDifference("schema.unexpected", name, "", name, ABSENT_VALUE, PRESENT_VALUE));

    return [...missing, ...unexpected];
};

type TablePairResult = { differences: SchemaDifference[], warnings: SchemaWarning[] };

const compareTablePair = (
    expectedTable: TableSnapshot, actualTable: TableSnapshot, scope: SchemaCompareScope
): TablePairResult => {
    const schemaName = expectedTable.schemaName;
    const tableName = expectedTable.tableName;

    const commentDifferences = ((scope.withComment) && (expectedTable.comment !== actualTable.comment)) ? [
        toDifference("table.comment", schemaName, tableName, tableName,
            toValueOrBlank(expectedTable.comment), toValueOrBlank(actualTable.comment))
    ] : [];

    const columnResult = compareColumns(expectedTable.columns, actualTable.columns, scope, schemaName, tableName);
    const primaryKeyDiffers = comparePrimaryKey(expectedTable.primaryKeyColumnNames, actualTable.primaryKeyColumnNames,
        schemaName, tableName);
    const uniqueKeyDiffers = compareUniqueKeys(expectedTable.uniqueKeys, actualTable.uniqueKeys, schemaName, tableName);
    const indexDiffers = compareIndexes(expectedTable.indexes, actualTable.indexes, schemaName, tableName);
    const foreignKeyDiffers = compareForeignKeys(expectedTable.foreignKeys, actualTable.foreignKeys,
        schemaName, tableName);

    const differences = [
        ...commentDifferences, ...columnResult.differences, ...primaryKeyDiffers,
        ...uniqueKeyDiffers, ...indexDiffers, ...foreignKeyDiffers
    ];

    return { differences, warnings: columnResult.warnings };
};

type ColumnCompareResult = { differences: SchemaDifference[], warnings: SchemaWarning[] };

// compareColumns も matchTables と同じ理由で状態を持つ蓄積になる(ルール5の例外)。
const compareColumns = (
    expectedColumns: readonly ColumnSnapshot[], actualColumns: readonly ColumnSnapshot[],
    scope: SchemaCompareScope, schemaName: string, tableName: string
): ColumnCompareResult => {
    const actualByName = new Map(actualColumns.map(column => [column.columnName, column]));
    const actualByCaseFoldedName = new Map(actualColumns.map(column => [column.columnName.toUpperCase(), column]));

    const matchedActualNames = new Set<string>();
    const differences: SchemaDifference[] = [];
    const warnings: SchemaWarning[] = [];
    // 突き合わせ後に実際の配列上の位置で順序を判定するため、名前ではなくペアを蓄積する
    // (大小文字無視で一致した場合、expected と actual の列名自体が異なりうる)。
    const matchedPairs: { expectedName: string, actualName: string }[] = [];

    expectedColumns.forEach(expectedColumn => {
        const exactMatch = actualByName.get(expectedColumn.columnName);
        const caseFoldedCandidate = actualByCaseFoldedName.get(expectedColumn.columnName.toUpperCase());

        const caseFoldedMatch = (
            (exactMatch == null) && (caseFoldedCandidate != null)
            && (matchedActualNames.has(caseFoldedCandidate.columnName) === false)
        ) ? caseFoldedCandidate : null;

        const actualColumn = exactMatch ?? caseFoldedMatch;

        if (actualColumn == null) {
            const expected = formatColumnTypeSummary(expectedColumn);
            const difference = toDifference("column.missing", schemaName, tableName,
                expectedColumn.columnName, toValue(expected), ABSENT_VALUE);
            differences.push(difference);

            return;
        }

        matchedActualNames.add(actualColumn.columnName);
        matchedPairs.push({ expectedName: expectedColumn.columnName, actualName: actualColumn.columnName });

        if (caseFoldedMatch != null) {
            warnings.push({
                category: "name.caseFolded", schemaName, tableName,
                message: `Column name differs only in case: design="${expectedColumn.columnName}" `
                    + `database="${actualColumn.columnName}".`
            });
        }

        differences.push(...compareColumnPair(expectedColumn, actualColumn, scope, schemaName, tableName));
    });

    const unexpectedColumns = actualColumns.filter(column => (matchedActualNames.has(column.columnName) === false));
    unexpectedColumns.forEach(actualColumn => {
        const difference = toDifference("column.unexpected", schemaName, tableName, actualColumn.columnName,
            ABSENT_VALUE, toValue(formatColumnTypeSummary(actualColumn)));
        differences.push(difference);
    });

    const actualIndexByName = new Map(actualColumns.map((column, index) => [column.columnName, index]));
    const actualIndexesInExpectedOrder = matchedPairs.map(pair => actualIndexByName.get(pair.actualName) as number);
    if (isAscending(actualIndexesInExpectedOrder) === false) {
        const actualOrderOfMatched = actualColumns.filter(column => matchedActualNames.has(column.columnName))
            .map(column => column.columnName);

        warnings.push({
            category: "column.order", schemaName, tableName,
            message: `Column order differs (design: ${matchedPairs.map(pair => pair.expectedName).join(", ")} / `
                + `database: ${actualOrderOfMatched.join(", ")}).`
        });
    }

    return { differences, warnings };
};

const isAscending = (values: readonly number[]): boolean => {
    return values.every((value, index) => ((index === 0) || (values[index - 1] <= value)));
};

const formatFullType = (column: ColumnSnapshot): string => {
    return column.unsigned ? `${column.typeExpression} UNSIGNED` : column.typeExpression;
};

const formatColumnTypeSummary = (column: ColumnSnapshot): string => {
    const type = formatFullType(column);
    return column.notNull ? `${type} NOT NULL` : type;
};

const compareColumnPair = (
    expectedColumn: ColumnSnapshot, actualColumn: ColumnSnapshot, scope: SchemaCompareScope,
    schemaName: string, tableName: string
): SchemaDifference[] => {
    const targetName = expectedColumn.columnName;
    const differences: SchemaDifference[] = [];

    if (formatFullType(expectedColumn) !== formatFullType(actualColumn)) {
        const difference = toDifference("column.type", schemaName, tableName, targetName,
            toValue(formatFullType(expectedColumn)), toValue(formatFullType(actualColumn)));
        differences.push(difference);
    }

    if (expectedColumn.notNull !== actualColumn.notNull) {
        const difference = toDifference("column.nullability", schemaName, tableName, targetName,
            toValue(toNullabilityLabel(expectedColumn.notNull)), toValue(toNullabilityLabel(actualColumn.notNull)));
        differences.push(difference);
    }

    if (expectedColumn.defaultValue !== actualColumn.defaultValue) {
        const difference = toDifference("column.default", schemaName, tableName, targetName,
            toValueOrBlank(expectedColumn.defaultValue), toValueOrBlank(actualColumn.defaultValue));
        differences.push(difference);
    }

    if (expectedColumn.autoIncrement !== actualColumn.autoIncrement) {
        const difference = toDifference("column.autoIncrement", schemaName, tableName, targetName,
            toAutoIncrementValue(expectedColumn.autoIncrement), toAutoIncrementValue(actualColumn.autoIncrement));
        differences.push(difference);
    }

    const logicalNameChanged = scope.withLogicalName && (expectedColumn.logicalName !== actualColumn.logicalName);
    if (logicalNameChanged) {
        const difference = toDifference("column.logicalName", schemaName, tableName, targetName,
            toValueOrBlank(expectedColumn.logicalName), toValueOrBlank(actualColumn.logicalName));
        differences.push(difference);
    }

    // commentStyle="logical_name" のときコメントは論理名そのものであり、logicalName の変更が
    // comment にも現れて同じ変更が二重に報告される。この組み合わせのときだけ comment を抑止する。
    // 既定の commentStyle ("with_description") ではコメントは "${logicalName}${separator}${description}" の形で、
    // logicalName とは独立に description が変わりうるため、常には抑止しない。
    const suppressCommentForLogicalName = (scope.commentStyle === "logical_name") && logicalNameChanged;
    if (
        (scope.withComment) && (suppressCommentForLogicalName === false)
        && (expectedColumn.comment !== actualColumn.comment)
    ) {
        const difference = toDifference("column.comment", schemaName, tableName, targetName,
            toValueOrBlank(expectedColumn.comment), toValueOrBlank(actualColumn.comment));
        differences.push(difference);
    }

    return differences;
};

const toNullabilityLabel = (notNull: boolean): string => (notNull ? "NOT NULL" : "NULL");

const comparePrimaryKey = (
    expectedColumnNames: readonly string[], actualColumnNames: readonly string[], schemaName: string, tableName: string
): SchemaDifference[] => {
    if (arraysEqual(expectedColumnNames, actualColumnNames)) {
        return [];
    }

    const difference = toDifference("primaryKey", schemaName, tableName, tableName,
        toColumnListValue(expectedColumnNames), toColumnListValue(actualColumnNames));
    return [difference];
};

const toColumnListDisplay = (columnNames: readonly string[]): string => {
    return (columnNames.length > 0) ? `(${columnNames.join(", ")})` : "";
};

// UniqueKeySnapshot/IndexSnapshot/ForeignKeySnapshot の照合は「消費済みの候補を除いていく」
// 突き合わせのため、matchTables と同じ理由でローカル配列への splice を用いる(ルール5の例外)。
// 引数の uniqueKeys 自体は書き換えない([...actualKeys] でコピーしてから操作する。ルール4準拠)。
const compareUniqueKeys = (
    expectedKeys: readonly UniqueKeySnapshot[], actualKeys: readonly UniqueKeySnapshot[],
    schemaName: string, tableName: string
): SchemaDifference[] => {
    const remainingActual = [...actualKeys];
    const differences: SchemaDifference[] = [];

    expectedKeys.forEach(expectedKey => {
        // 一次キー: 列並びの完全一致
        const columnMatchIndex = remainingActual.findIndex(actualKey =>
            arraysEqual(actualKey.columnNames, expectedKey.columnNames)
        );
        if (columnMatchIndex >= 0) {
            remainingActual.splice(columnMatchIndex, 1);
            return;
        }

        // 二次キー: 両側の制約名が非空で一致するなら「列構成が変わった」とみなす
        const nameMatchIndex = (expectedKey.constraintName !== "")
            ? remainingActual.findIndex(actual => (actual.constraintName === expectedKey.constraintName)) : -1;

        if (nameMatchIndex >= 0) {
            const actualKey = remainingActual[nameMatchIndex];
            remainingActual.splice(nameMatchIndex, 1);

            const difference = toDifference("uniqueKey.columns", schemaName, tableName, expectedKey.constraintName,
                toColumnListValue(expectedKey.columnNames), toColumnListValue(actualKey.columnNames));
            differences.push(difference);

            return;
        }

        const difference = toDifference("uniqueKey.missing", schemaName, tableName, toUniqueKeyTargetName(expectedKey),
            toColumnListValue(expectedKey.columnNames), ABSENT_VALUE);
        differences.push(difference);
    });

    remainingActual.forEach(actualKey => {
        const difference = toDifference("uniqueKey.unexpected", schemaName, tableName, toUniqueKeyTargetName(actualKey),
            ABSENT_VALUE, toColumnListValue(actualKey.columnNames));
        differences.push(difference);
    });

    return differences;
};

const toUniqueKeyTargetName = (uniqueKey: UniqueKeySnapshot): string => {
    return (uniqueKey.constraintName !== "") ? uniqueKey.constraintName : toColumnListDisplay(uniqueKey.columnNames);
};

const compareIndexes = (
    expectedIndexes: readonly IndexSnapshot[], actualIndexes: readonly IndexSnapshot[],
    schemaName: string, tableName: string
): SchemaDifference[] => {
    const remainingActual = [...actualIndexes];
    const differences: SchemaDifference[] = [];

    expectedIndexes.forEach(expected => {
        // 一次キー: インデックス名(大小文字無視)。二次キー: 列並びの完全一致
        const nameMatchIndex = remainingActual.findIndex(actual =>
            (actual.indexName.toUpperCase() === expected.indexName.toUpperCase())
        );
        const columnMatchIndex = (nameMatchIndex < 0)
            ? remainingActual.findIndex(actual => arraysEqual(actual.columnNames, expected.columnNames)) : -1;
        const matchIndex = (nameMatchIndex >= 0) ? nameMatchIndex : columnMatchIndex;

        if (matchIndex < 0) {
            const difference = toDifference("index.missing", schemaName, tableName, expected.indexName,
                toColumnListValue(expected.columnNames), ABSENT_VALUE);
            differences.push(difference);

            return;
        }

        const actualIndex = remainingActual[matchIndex];
        remainingActual.splice(matchIndex, 1);

        if (arraysEqual(expected.columnNames, actualIndex.columnNames) === false) {
            const difference = toDifference("index.columns", schemaName, tableName, expected.indexName,
                toColumnListValue(expected.columnNames), toColumnListValue(actualIndex.columnNames));
            differences.push(difference);
        }

        if (formatIndexKind(expected) !== formatIndexKind(actualIndex)) {
            const difference = toDifference("index.type", schemaName, tableName, expected.indexName,
                toValueOrBlank(formatIndexKind(expected)), toValueOrBlank(formatIndexKind(actualIndex)));
            differences.push(difference);
        }
    });

    remainingActual.forEach(actualIndex => {
        const difference = toDifference("index.unexpected", schemaName, tableName, actualIndex.indexName,
            ABSENT_VALUE, toColumnListValue(actualIndex.columnNames));
        differences.push(difference);
    });

    return differences;
};

const formatIndexKind = (index: IndexSnapshot): string => {
    const parts = [index.indexOption, index.indexType].filter(part => (part !== ""));
    return (parts.length > 0) ? parts.join(" ") : "";
};

const compareForeignKeys = (
    expectedKeys: readonly ForeignKeySnapshot[], actualKeys: readonly ForeignKeySnapshot[],
    schemaName: string, tableName: string
): SchemaDifference[] => {
    const remainingActual = [...actualKeys];
    const differences: SchemaDifference[] = [];

    expectedKeys.forEach(expectedKey => {
        const matchIndex = remainingActual.findIndex(actualKey => isSameForeignKeyReference(expectedKey, actualKey));
        if (matchIndex < 0) {
            const targetName = toForeignKeyTargetName(expectedKey);
            const difference = toDifference("foreignKey.missing", schemaName, tableName, targetName,
                toValue(formatForeignKeyReference(expectedKey)), ABSENT_VALUE);
            differences.push(difference);

            return;
        }

        const actualKey = remainingActual[matchIndex];
        remainingActual.splice(matchIndex, 1);

        if ((expectedKey.onUpdate !== actualKey.onUpdate) || (expectedKey.onDelete !== actualKey.onDelete)) {
            const targetName = toForeignKeyTargetName(expectedKey);
            const difference = toDifference("foreignKey.reference", schemaName, tableName, targetName,
                toValue(formatForeignKeyAction(expectedKey)), toValue(formatForeignKeyAction(actualKey)));
            differences.push(difference);
        }
    });

    remainingActual.forEach(actualKey => {
        const targetName = toForeignKeyTargetName(actualKey);
        const difference = toDifference("foreignKey.unexpected", schemaName, tableName, targetName,
            ABSENT_VALUE, toValue(formatForeignKeyReference(actualKey)));
        differences.push(difference);
    });

    return differences;
};

// FK は制約名を照合キーに使わない(create-ddl.ts が FK 制約名を出力しないため、設計側は常に "" になる)。
const isSameForeignKeyReference = (first: ForeignKeySnapshot, second: ForeignKeySnapshot): boolean => {
    return arraysEqual(first.columnNames, second.columnNames)
        && (first.parentSchemaName === second.parentSchemaName)
        && (first.parentTableName === second.parentTableName)
        && arraysEqual(first.parentColumnNames, second.parentColumnNames);
};

const toForeignKeyTargetName = (foreignKey: ForeignKeySnapshot): string => foreignKey.columnNames.join(", ");

const formatForeignKeyReference = (foreignKey: ForeignKeySnapshot): string => {
    const parentTable = (foreignKey.parentSchemaName !== "")
        ? `${foreignKey.parentSchemaName}.${foreignKey.parentTableName}` : foreignKey.parentTableName;

    return `${parentTable} (${foreignKey.parentColumnNames.join(", ")})`;
};

const formatForeignKeyAction = (foreignKey: ForeignKeySnapshot): string => {
    return `ON UPDATE ${foreignKey.onUpdate} ON DELETE ${foreignKey.onDelete}`;
};

const toDifference = (
    category: DifferenceCategory, schemaName: string, tableName: string, targetName: string,
    expected: DifferenceValue, actual: DifferenceValue
): SchemaDifference => {
    return { category, schemaName, tableName, targetName, expected, actual };
};

const toValue = (text: string): DifferenceValue => {
    return { state: "value", text };
};

// 空文字は「対象はあるが値が無い」状態。センチネル文字列に潰さないことで、
// ユーザが実際に "-" と書いた値と区別できる。
const toValueOrBlank = (text: string): DifferenceValue => {
    return (text !== "") ? { state: "value", text } : { state: "blank" };
};

const toColumnListValue = (columnNames: readonly string[]): DifferenceValue => {
    const display = toColumnListDisplay(columnNames);
    return toValueOrBlank(display);
};

// AUTO_INCREMENT でない列は「その属性を持たない」= blank。真偽値を表示文字列に潰さない。
const toAutoIncrementValue = (autoIncrement: boolean): DifferenceValue => {
    return autoIncrement ? { state: "value", text: "AUTO_INCREMENT" } : { state: "blank" };
};

const ABSENT_VALUE: DifferenceValue = { state: "absent" };
const PRESENT_VALUE: DifferenceValue = { state: "present" };
