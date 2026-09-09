import { TableSnapshot } from "~/models/schema/schema-snapshot";

export type TableMatchResult = {
    pairs: TableMatchPair[];
    missingExpected: TableSnapshot[];
    unexpectedActual: TableSnapshot[];
    /** pairs のうち、大小文字無視でのみ一致した組。名前が完全一致した組との呼び分けは呼び出し側の関心(警告文言など)。 */
    caseFoldedPairs: TableMatchPair[];
};

export type TableMatchPair = { expected: TableSnapshot, actual: TableSnapshot };

export default class TableMatcher {

    private constructor() {
        // do nothing.
    }

    public static match(expected: TableSnapshot[], actual: TableSnapshot[], withSchema: boolean): TableMatchResult {
        return matchTables(expected, actual, withSchema);
    };
};

// 大小文字無視の再照合や「既に消費済みの actual を再利用しない」制御が必要なため、
// Map/Set への逐次登録という状態を持つ蓄積になる(coding-style ルール5の例外。関数的スタイルでは
// 「1つの expected に対しどの actual を消費したか」を素直に表現できない)。
const matchTables = (
    expectedTables: TableSnapshot[], actualTables: TableSnapshot[], withSchema: boolean
): TableMatchResult => {
    const toKey = (table: TableSnapshot): string => {
        return withSchema ? `${table.schemaName} ${table.tableName}` : table.tableName;
    };

    const actualByKey = new Map(actualTables.map(table => [toKey(table), table]));
    const actualByCaseFoldedKey = new Map(actualTables.map(table => [toKey(table).toUpperCase(), table]));

    const matchedActualKeys = new Set<string>();
    const pairs: TableMatchPair[] = [];
    const missingExpected: TableSnapshot[] = [];
    const caseFoldedPairs: TableMatchPair[] = [];

    expectedTables.forEach(expectedTable => {
        const key = toKey(expectedTable);
        const exactMatch = actualByKey.get(key);
        if (exactMatch != null) {
            pairs.push({ expected: expectedTable, actual: exactMatch });
            matchedActualKeys.add(toKey(exactMatch));

            return;
        }

        const caseFoldedMatch = actualByCaseFoldedKey.get(key.toUpperCase());
        if ((caseFoldedMatch == null) || matchedActualKeys.has(toKey(caseFoldedMatch))) {
            missingExpected.push(expectedTable);

            return;
        }

        const pair = { expected: expectedTable, actual: caseFoldedMatch };
        pairs.push(pair);
        caseFoldedPairs.push(pair);
        matchedActualKeys.add(toKey(caseFoldedMatch));
    });

    const unexpectedActual = actualTables.filter(table => (matchedActualKeys.has(toKey(table)) === false));

    return { pairs, missingExpected, unexpectedActual, caseFoldedPairs };
};
