import ColumnModel from "~/models/database/ColumnModel";
import StructColumnModel from "~/models/database/StructColumnModel";
import TableModel from "~/models/database/TableModel";
import DisplayColumnStyle from "~/models/DisplayColumnStyle";
import ErdDocument from "~/models/ErdDocument";

export type ColumnRowEntry = {
    columnModel: ColumnModel;
    /** 同一 struct 定義を複数の兄弟カラムが共有していても一意になる、経路付きの行識別子。 */
    rowId: string;
    nestCount: number;
};

/**
 * テーブル・struct のカラムを、nested struct のメンバーまで再帰的に展開しフラットな行リストにする。
 * キャンバス描画・SVGエクスポート・キャンバス検索の3箇所が同じ展開順序と行識別子を必要とするため、
 * ここに中立モジュールとして抽出している。
 * rowId はラッパー struct カラム自身の columnModelId を経由の都度連結して構築するため、
 * 同一 StructColumnShareModel を参照する兄弟 struct カラム間でも重複しない。
 * 循環参照は検出した struct 自身の行のみ残し、その先には descend しない。
 */
export const expandColumnRows = (
    erdDocument: ErdDocument, columnModels: readonly ColumnModel[]
): ColumnRowEntry[] => {
    return doExpandColumnRows(erdDocument, columnModels, "", 0, new Set());
};

const doExpandColumnRows = (
    erdDocument: ErdDocument, columnModels: readonly ColumnModel[], prefix: string, nestCount: number,
    visitedStructIds: ReadonlySet<string>
): ColumnRowEntry[] => {
    return columnModels.flatMap(columnModel => {
        const rowId = `${prefix}${columnModel.columnModelId}`;

        if (ColumnModel.isSimpleColumn(columnModel)) {
            return [{ columnModel, rowId, nestCount }];
        }

        return expandStructColumnRows(erdDocument, columnModel, rowId, nestCount, visitedStructIds);
    });
};

const expandStructColumnRows = (
    erdDocument: ErdDocument, structColumn: StructColumnModel, rowId: string, nestCount: number,
    visitedStructIds: ReadonlySet<string>
): ColumnRowEntry[] => {
    const currentRow = { columnModel: structColumn, rowId, nestCount };

    const structShare = erdDocument.findStructColumnShareModel(structColumn.structShareModelId);
    if (structShare == null) {
        return [currentRow];
    }

    if (visitedStructIds.has(structShare.structShareModelId)) {
        return [currentRow];
    }

    const innerVisitedIds = new Set(visitedStructIds);
    innerVisitedIds.add(structShare.structShareModelId);

    const memberColumns = erdDocument.toAllColumnsWithStruct(structShare);
    const innerRows = doExpandColumnRows(
        erdDocument, memberColumns, `${rowId}_`, nestCount + 1, innerVisitedIds
    );

    return [currentRow, ...innerRows];
};

export const isColumnRowVisible = (erdDocument: ErdDocument, tableModel: TableModel, row: ColumnRowEntry): boolean => {
    const displayColumnStyle = erdDocument.getDisplayColumnStyle();

    if (ColumnModel.isSimpleColumn(row.columnModel)) {
        const inChildRelation = erdDocument.inChildRelation(tableModel.tableModelId, row.columnModel.columnModelId);
        return displayColumnStyle.viewable(row.columnModel, inChildRelation);
    }

    return displayColumnStyle.equals(DisplayColumnStyle.ALL);
};
