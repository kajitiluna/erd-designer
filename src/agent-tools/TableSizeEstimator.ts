import { ColumnRowEntry, expandColumnRows, isColumnRowVisible } from "~/models/column-row-expansion";
import DisplayColumnStyle from "~/models/DisplayColumnStyle";
import ErdDocument from "~/models/ErdDocument";
import TableViewModel from "~/models/TableViewModel";
import ColumnModel from "~/models/database/ColumnModel";
import SimpleColumnModel from "~/models/database/SimpleColumnModel";
import StructColumnModel from "~/models/database/StructColumnModel";
import { overrideColumnName } from "~/models/database/support";

type EstimatedSize = { width: number; height: number };

/**
 * Estimates the on-canvas size of a table when no rendered rectangle is available (e.g. the CLI,
 * which never draws the canvas). The result is an approximation derived from the same row
 * expansion the canvas uses, so agents can reserve space when placing tables.
 */
export default class TableSizeEstimator {

    private constructor() {
        // do nothing
    }

    public static estimate(erdDocument: ErdDocument, tableView: TableViewModel): EstimatedSize {
        const columnRows = toVisibleRows(erdDocument, tableView);

        // 列が 0 件でも、キャンバスは空行を 1 行描画する。
        const rowCount = Math.max(columnRows.length, 1);
        const height = HEADER_HEIGHT + (rowCount * ROW_HEIGHT);

        const headerWidth = estimateHeaderWidth(erdDocument, tableView);
        const bodyWidth = estimateBodyWidth(erdDocument, tableView, columnRows);
        const width = Math.max(headerWidth, bodyWidth);

        return { width: Math.ceil(width), height };
    }
}

const toVisibleRows = (erdDocument: ErdDocument, tableView: TableViewModel): ColumnRowEntry[] => {
    const tableModel = tableView.tableModel;
    const displayStyle = erdDocument.getDisplayColumnStyle();

    const allColumns = displayStyle.equals(DisplayColumnStyle.NONE)
        ? [] : erdDocument.toAllColumnsWithStruct(tableModel);

    return expandColumnRows(erdDocument, allColumns)
        .filter(row => isColumnRowVisible(erdDocument, tableModel, row));
};

// 描画されたテーブルの寸法は DOM 計測値に基づく近似であり、フォントやテーマで数 px 変動する。
const HEADER_HEIGHT = 28;

const ROW_HEIGHT = 24;

const estimateHeaderWidth = (erdDocument: ErdDocument, tableView: TableViewModel): number => {
    const displayStyle = erdDocument.getDisplayNameStyle();

    const tableModel = tableView.tableModel;
    const dbSchema = erdDocument.findSchema(tableModel.schemaId);
    const physicalName = (dbSchema != null)
        ? `${dbSchema.schemaName}.${tableModel.physicalName}` : tableModel.physicalName;

    const displayName = displayStyle.displayName(physicalName, tableModel.logicalName);

    const textWidth = measureText(displayName);

    return textWidth + HEADER_HORIZONTAL_PADDING;
};

// ヘッダーの左右 padding(8px × 2)にテーブル外枠(2px × 2)を足した値(px)。ErdTableView の HEADER_STYLE と外枠に由来する。
const HEADER_HORIZONTAL_PADDING = 20;

type ColumnTexts = { name: string; type: string; option: string };

type ColumnWidths = { name: number; type: number; option: number };

// 本体は 1 つの MUI Table で描画され、列ごとに最も広いセルへ幅が揃う。
// そのため行ごとの合計の最大値ではなく、列ごとの最大値の合計で本体幅を求める。
const estimateBodyWidth = (
    erdDocument: ErdDocument, tableView: TableViewModel, columnRows: ColumnRowEntry[]
): number => {
    const rowWidths = columnRows.map(row => estimateRowWidths(erdDocument, tableView, row));

    const nameWidths = rowWidths.map(rowWidth => rowWidth.name);
    const typeWidths = rowWidths.map(rowWidth => rowWidth.type);
    const optionWidths = rowWidths.map(rowWidth => rowWidth.option);

    const nameWidth = Math.max(0, ...nameWidths);
    const typeWidth = Math.max(0, ...typeWidths);
    const optionWidth = Math.max(0, ...optionWidths);

    const tableModel = tableView.tableModel;
    const markerWidth = estimateMarkerColumnWidth(tableModel.uniqueKeysModels.length)
        + estimateMarkerColumnWidth(tableModel.tableIndexModels.length);

    const textCellsWidth = nameWidth + typeWidth + optionWidth + (TEXT_CELL_COUNT * TEXT_CELL_HORIZONTAL_PADDING);

    return TABLE_BORDER_WIDTH + KEY_CELLS_WIDTH + textCellsWidth + markerWidth;
};

// テーブル外枠 `2px solid` の左右合計(px)。
const TABLE_BORDER_WIDTH = 4;

// PK / FK セルの padding(PK: 左 12 + 右 2、FK: 左 2 + 右 12)とアイコン 2 個分(各 14px)の合計(px)。
// アイコンは TableBody の fontSize(0.875em)に対する 100% で描画される。行にキーが無くても列幅は確保される。
const KEY_CELLS_WIDTH = 56;

// 列名・型・オプションの 3 セルは MUI size="small" の既定 padding(左右 16px ずつ)を持つ。
const TEXT_CELL_COUNT = 3;
const TEXT_CELL_HORIZONTAL_PADDING = 32;

const estimateRowWidths = (erdDocument: ErdDocument, tableView: TableViewModel, row: ColumnRowEntry): ColumnWidths => {
    const texts = ColumnModel.isSimpleColumn(row.columnModel)
        ? toSimpleColumnTexts(erdDocument, tableView, row.columnModel)
        : toStructColumnTexts(erdDocument, row.columnModel);

    // marginLeft のインデントは列名と型の span にだけ掛かり、オプションには掛からない。
    const indentWidth = row.nestCount * STRUCT_INDENT_WIDTH;

    return {
        name: measureText(texts.name) + indentWidth,
        type: measureText(texts.type) + indentWidth,
        option: measureText(texts.option)
    };
};

// STRUCT のネスト 1 階層あたりのインデント幅(px)。
const STRUCT_INDENT_WIDTH = 10;

// マーカー列(UK / インデックス)は 1 件以上あるときだけ描画され、右 padding 10px の 1 セルに 1 件 1 Grid が並ぶ。
const estimateMarkerColumnWidth = (markerCount: number): number => {
    if (markerCount === 0) {
        return 0;
    }

    return MARKER_CELL_RIGHT_PADDING + (markerCount * MARKER_WIDTH);
};

const MARKER_CELL_RIGHT_PADDING = 10;

// Grid の左右 padding(6px × 2)と記号 1 文字(約 7px)・spacing の合計の近似(px)。
const MARKER_WIDTH = 20;

const toSimpleColumnTexts = (
    erdDocument: ErdDocument, tableView: TableViewModel, columnModel: SimpleColumnModel
): ColumnTexts => {
    const columnShare = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
    if (columnShare == null) {
        return EMPTY_TEXTS;
    }

    const displayStyle = erdDocument.getDisplayNameStyle();

    const overrideName = overrideColumnName(columnModel, columnShare);
    const columnName = displayStyle.displayName(overrideName.physicalName, overrideName.logicalName);

    const inChildRelation = erdDocument.inChildRelation(tableView.tableId, columnModel.columnModelId);
    const columnType = columnShare.specifiedColumnType(inChildRelation).replace("TIME ZONE", "TZ");

    const optionFlags = [
        ...(columnModel.unique ? ["U"] : []),
        ...(columnModel.notNull ? ["NN"] : [])
    ];
    const option = (optionFlags.length > 0) ? `(${optionFlags.join("")})` : "";

    return { name: columnName, type: columnType, option };
};

const toStructColumnTexts = (erdDocument: ErdDocument, columnModel: StructColumnModel): ColumnTexts => {
    const structShare = erdDocument.findStructColumnShareModel(columnModel.structShareModelId);
    if (structShare == null) {
        return EMPTY_TEXTS;
    }

    const displayStyle = erdDocument.getDisplayNameStyle();

    const overrideName = overrideColumnName(columnModel, structShare);
    const columnName = displayStyle.displayName(overrideName.physicalName, overrideName.logicalName);
    const option = columnModel.notNull ? "(NN)" : "";

    return { name: columnName, type: structShare.simpleColumnType(), option };
};

const EMPTY_TEXTS: ColumnTexts = { name: "", type: "", option: "" };

// 半角(ASCII と半角カナ)を 1、それ以外を 2 として文字幅を換算する。
const measureText = (text: string): number => {
    const units = Array.from(text).reduce((sum, character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        const isHalfWidth = (codePoint <= 0x7F) || ((codePoint >= 0xFF61) && (codePoint <= 0xFF9F));
        return sum + (isHalfWidth ? 1 : 2);
    }, 0);

    return units * CHAR_WIDTH;
};

// 半角 1 文字あたりの描画幅(px)。全角は 2 文字分として数える。
const CHAR_WIDTH = 7;
