import { LocalSetting } from "~/context/LocalSettingContext";
import EditMode, { EditModeType } from "~/models/EditMode";
import MemoViewModel from "~/models/MemoViewModel";
import RectangleViewModel from "~/models/RectangleViewModel";
import TableModel from "~/models/database/TableModel";
import TableViewModel from "~/models/TableViewModel";
import SelectState from "~/models/SelectState";
import { erdPalette } from "~/components/ErdTheme";
import type { ColorTheme } from "~/models/ColorValue";
import { CARDINALITY_MARKER } from "~/features/canvas/support";

/**
 * ErdCanvas 内部専用モジュール。外部からの import は禁止 (ESLint no-restricted-imports で検査)。
 *
 * Canvas 上の装飾表示 (リレーション作成中のガイド線・カーディナリティマーカー) と、
 * 新規エンティティの生成ファクトリ。
 */

type Point = { x: number, y: number };

type CreateRelationLineArgs = {
    editMode: EditMode,
    relationEdge: Point | null,
    selectState: SelectState,
    tableRectangles: Map<string, RectangleViewModel>,
    colorTheme: ColorTheme
};

// リレーション作成にて、親テーブル指定後、子テーブルを指定する際に動的に表示するライン
export const initCreatingRelationLine = ({
    editMode, relationEdge, selectState, tableRectangles, colorTheme
}: CreateRelationLineArgs) => {
    // SVG の属性では CSS 変数が書き出し時に解決されないため、解決済みの色を直接指定する
    const selectionColor = erdPalette.of(colorTheme).selection;

    if (editMode !== EditModeType.CREATE_RELATION) {
        return (<></>);
    }

    if ((relationEdge == null) || (selectState.tableIds.size !== 1)) {
        return (<></>);
    }

    const parentTableId = selectState.tableIds.values().next().value as string;
    const parentRectangle = tableRectangles.get(parentTableId);
    if (parentRectangle == null) {
        return (<></>);
    }

    if (parentRectangle.contains(relationEdge) === false) {
        return (
            <line
                x1={parentRectangle.xCenter}
                y1={parentRectangle.yCenter}
                x2={relationEdge.x}
                y2={relationEdge.y}
                stroke={selectionColor} strokeDasharray="4" strokeWidth="3">
                <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1s" repeatCount="indefinite" />
            </line>
        );
    }

    const drawingPoints = [
        { x: parentRectangle.right, y: parentRectangle.yCenter + parentRectangle.height / 4 },
        { x: parentRectangle.right + 70, y: parentRectangle.yCenter + parentRectangle.height / 4 },
        { x: parentRectangle.right + 70, y: parentRectangle.bottom + 70 },
        { x: parentRectangle.xCenter + parentRectangle.width / 4, y: parentRectangle.bottom + 70 },
        { x: parentRectangle.xCenter + parentRectangle.width / 4, y: parentRectangle.bottom }
    ];
    const drawingLine = "M" + drawingPoints.map(point =>
        `${point.x},${point.y}`
    ).join(" L");

    return (
        <path d={drawingLine} fill="none" stroke={selectionColor} strokeDasharray="4" strokeWidth="3">
            <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1s" repeatCount="indefinite" />
        </path>
    );
};

// リレーションの線の定義
export const initRelationCardinalityDefinitions = (colorTheme: ColorTheme) => {
    const markerColor = erdPalette.of(colorTheme).lineMarker;
    const markerNone = (<circle cx="10" cy="15" r="10" fill={markerColor} />);
    const markerOne = (<line x1="25" y1="0" x2="25" y2="30" stroke={markerColor} />);
    const markerMany = (<path d="M 40,0 L 25,15 L 40,30" fill="none" stroke={markerColor} />);

    return (
        <defs>
            <marker id={CARDINALITY_MARKER.ONE} orient="auto-start-reverse"
                markerWidth="40" markerHeight="30" refX="40" refY="15" markerUnits="userSpaceOnUse">
                {markerOne}
            </marker>
            <marker id={CARDINALITY_MARKER.NONE_TO_ONE} orient="auto-start-reverse"
                markerWidth="40" markerHeight="30" refX="40" refY="15" markerUnits="userSpaceOnUse">
                {markerNone}
                {markerOne}
            </marker>
            <marker id={CARDINALITY_MARKER.NONE_TO_MANY} orient="auto-start-reverse"
                markerWidth="40" markerHeight="30" refX="40" refY="15" markerUnits="userSpaceOnUse">
                {markerNone}
                {markerMany}
            </marker>
            <marker id={CARDINALITY_MARKER.ONE_TO_MANY} orient="auto-start-reverse"
                markerWidth="40" markerHeight="30" refX="40" refY="15" markerUnits="userSpaceOnUse">
                {markerOne}
                {markerMany}
            </marker>
        </defs>
    );
};

export const createNewTable = (position: Point, localSetting: LocalSetting) => {
    const color = localSetting.defaultColor;

    return new TableViewModel({
        tableModel: new TableModel({}),
        corner: { left: position.x, top: position.y },
        headerColor: { background: color.background, foreground: color.foreground }
    });
};

export const createNewMemo = (position: Point, localSetting: LocalSetting) => {
    const stickySize = localSetting.stickySize;
    const rectangle = new RectangleViewModel({
        positionX: position.x, positionY: position.y,
        width: stickySize.width, height: stickySize.height
    });

    return MemoViewModel.create(rectangle, localSetting.defaultColor, localSetting.stickyFontSize);
};
