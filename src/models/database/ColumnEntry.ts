type ColumnEntry =
    { modelType: "single", columnModelId: string }
    | { modelType: "group", columnGroupId: string };

// type エイリアス(union)は静的メソッドを持てないため、同名の const を companion object として併置する。
const ColumnEntry = {

    /**
     * ColumnEntry の配列同士を順序込みで比較する。
     * TableModel と StructColumnShareModel の equals で共用する。
     */
    equalsEntries(first: readonly ColumnEntry[], second: readonly ColumnEntry[]): boolean {
        if (first.length !== second.length) {
            return false;
        }

        for (let index = 0; index < first.length; index++) {
            const firstColumn = first[index];
            const secondColumn = second[index];
            if (firstColumn.modelType !== secondColumn.modelType) {
                return false;
            }
            if ((firstColumn.modelType === "single") && (secondColumn.modelType === "single")
                && (firstColumn.columnModelId !== secondColumn.columnModelId)) {
                return false;
            }
            if ((firstColumn.modelType === "group") && (secondColumn.modelType === "group")
                && (firstColumn.columnGroupId !== secondColumn.columnGroupId)) {
                return false;
            }
        }

        return true;
    },

    /**
     * ColumnEntry の配列を永続化用の文字列配列(columnModelIds)に変換する。
     * single はそのままの id、group は "group:<id>" のプレフィックス付き文字列とする。
     * TableModel と StructColumnShareModel の toJSON で共用する。
     */
    serializeEntries(columns: readonly ColumnEntry[]): string[] {
        return columns.map(column => {
            if (column.modelType === "group") {
                return `group:${column.columnGroupId}`;
            }

            return column.columnModelId;
        });
    },

    /**
     * 永続化用の文字列配列(columnModelIds)を ColumnEntry の配列に復元する。
     * serializeEntries の逆変換。TableModel と StructColumnShareModel の toObject で共用する。
     */
    deserializeEntries(columnModelIds: string[]): ColumnEntry[] {
        return columnModelIds.map(id => {
            if (id.startsWith("group:")) {
                return { modelType: "group", columnGroupId: id.substring(6) };
            }

            return { modelType: "single", columnModelId: id };
        });
    }
} as const;

export default ColumnEntry;
