import React, { JSX, MouseEvent, useEffect, useLayoutEffect, useState } from "react";
import { Box } from "@mui/material";

import DisplayScaleContext from "~/context/DisplayScaleContext";
import { DragActionContext, DragState, NO_DRAGGING, reduceDragAction } from "~/context/DragActionContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { RELEASE_ACTION, SelectEntityContext, SelectState } from "~/context/SelectEntityContext";
import EditAction from "~/features/canvas/EditAction";
import ErdRelationPathView, { ErdRelationTooltipRef } from "~/features/canvas/ErdRelationPathView";
import ErdTableView, { ERD_TABLE_VIEW_CLASS_NAME } from "~/features/canvas/ErdTableView";
import {
    CANVAS_AREA, CARDINALITY_MARKER, DRAWABLE_AREA,
    getLogicalMousePosition, withMultiSelectKey
} from "~/features/canvas/support";
import RelationEditView from "~/features/editor/RelationEditView";
import TableEditView from "~/features/editor/TableEditView";
import TableModel from "~/models/database/TableModel";
import EditMode, { EditModeType } from "~/models/EditMode";
import ErdSettingModel from "~/models/ErdSettingModel";
import RectangleViewModel from "~/models/RectangleViewModel";
import TableViewModel from "~/models/TableViewModel";
import MemoViewModel from "~/models/MemoViewModel";
import StickyMemoView, { ERD_MEMO_VIEW_CLASS_NAME } from "~/features/canvas/StickyMemoView";

type RectangleArea = {
    tableRectangles: Map<string, RectangleViewModel>,
    memoRectangles: Map<string, RectangleViewModel>
};

const ErdCanvas = () => {
    const erdCanvasRef = React.useRef<HTMLDivElement>(null);
    const [dragState, dispatchDragAction] = React.useReducer(reduceDragAction, NO_DRAGGING);

    const documentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode, dispatchEditMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const displayScale = React.useContext(DisplayScaleContext);

    // Canvas に描画されている短形の情報を保持する
    const [rectangleArea, setRectangleArea] = useState<RectangleArea>({ tableRectangles: new Map(), memoRectangles: new Map() });
    // 画面に表示している Relation に関する svg 要素への参照を保持する
    const relationRef = React.useRef<ErdRelationTooltipRef>(null);
    // リレーション等の線情報を保持する
    const [svgPaths, setSvgPaths] = useState<JSX.Element[]>([]);
    // 編集中の対象
    const [editAction, setEditAction] = useState<EditAction>(NO_EDIT_ACTION);
    // リレーション作成にて親テーブルが指定されているときに、論理的なマウス位置を保持する
    const [relationEdge, setRelationEdge] = useState<Point | null>(null);

    const erdDocument = documentsHolder.current();

    const tableViews = erdDocument.getTableViewModels().map((tableView) => (
        <ErdTableView key={`erd-table-view_${tableView.tableId}`}
            tableViewModel={tableView} onEditAction={setEditAction} />
    ));

    const { frontMemos, backMemos } = erdDocument.getMemoViewModels();
    const toMemoView = (memo: MemoViewModel) => (
        <StickyMemoView key={`sticky-note_${memo.memoId}`} memoViewModel={memo} />
    );
    const frontMemoViews = frontMemos.map(toMemoView);
    const backMemoViews = backMemos.map(toMemoView);

    // リレーション作成にて、親テーブル指定後、子テーブルを指定する際に動的に表示するライン
    const activeLine = initCreatingRelationLine({
        editMode, relationEdge, selectState: selectState, tableRectangles: rectangleArea.tableRectangles
    });

    // キャンバスがクリックされた時の制御を定義
    const handleClickOnCanvas = (event: MouseEvent) => {
        const mousePosition = getLogicalMousePosition(event, displayScale);

        if (editMode === EditModeType.CREATE_TABLE) {
            const tableViewModel = createNewTable(erdDocument.erdSettingModel, mousePosition);
            setEditAction({ editType: "table", tableViewModel });
            return;
        }

        if (editMode === EditModeType.CREATE_RELATION) {
            // テーブルが指定されていない場合は、親の選択を解除する
            dispatchSelectAction(RELEASE_ACTION);
            return;
        }

        if (editMode === EditModeType.CREATE_MEMO) {
            const memoViewModel = createNewMemo(erdDocument.erdSettingModel, mousePosition);
            documentsHolder.addMemo(memoViewModel);

            dispatchSelectAction(RELEASE_ACTION);
            dispatchEditMode(EditModeType.SELECT);
            return;
        }

        // 以降の処理は SELECT モード
        dispatchSelectAction(RELEASE_ACTION);
    };

    // ドラッグが開始されたときの制御
    const handleDragStart = (event: MouseEvent) => {
        if (editMode !== EditModeType.SELECT) {
            return;
        }

        const mousePosition = getLogicalMousePosition(event, displayScale);
        const rectangleMap = new Map([...rectangleArea.tableRectangles, ...rectangleArea.memoRectangles]);

        // 既に短形が選択されている場合は、該当テーブルにてドラッグ開始されたか確認する
        if (selectState.tableIds.size + selectState.memoIds.size > 0) {
            for (const rectangleId of [...selectState.tableIds, ...selectState.memoIds]) {
                const rectangle = rectangleMap.get(rectangleId);
                if (rectangle == null) {
                    continue;
                }

                if (rectangle.contains(mousePosition)) {
                    // 短形が選択されている場合は、ドラッグ開始
                    dispatchDragAction({ type: "start_dragging", start: mousePosition });
                    return;
                }
            }

            // 選択中の短形上でドラッグ開始していない場合は何もしない
            return;
        }

        // line が選択中の場合
        if (selectState.relationId) {
            // TODO
            return;
        }

        // 短形が選択中ではない場合は、ドラッグ開始位置がテーブル上ではないことを確認する
        for (const rectangle of rectangleMap.values()) {
            if (rectangle.contains(mousePosition)) {
                return;
            }
        }

        dispatchDragAction({ type: "start_dragging", start: mousePosition });
    };

    const handleMoveMouseOnCanvas = (event: MouseEvent) => {
        const mousePosition = getLogicalMousePosition(event, displayScale);

        if (editMode === EditModeType.CREATE_RELATION) {
            setRelationEdge((selectState.tableIds.size === 1) ? mousePosition : null);
            return;
        }

        if ((editMode !== EditModeType.SELECT) || (dragState.status !== "on_dragging")) {
            return;
        }

        dispatchDragAction({ type: "on_dragging", current: mousePosition });
    };

    const handleDragEnd = (event: MouseEvent) => {
        if ((editMode !== EditModeType.SELECT) || (dragState.status !== "on_dragging")) {
            return;
        }

        const mousePosition = getLogicalMousePosition(event, displayScale);
        dispatchDragAction({ type: "clear" });

        if (selectState.tableIds.size + selectState.memoIds.size > 0) {
            const offset = {
                x: mousePosition.x - dragState.start.x,
                y: mousePosition.y - dragState.start.y
            };

            if ((offset.x === 0) && (offset.y === 0)) {
                return;
            }

            documentsHolder.moveRectangle(selectState.tableIds, selectState.memoIds, offset);
            return;
        }

        if (selectState.relationId && (selectState.edgeId != null)) {
            if ((!selectState.edgeType) || (selectState.edgeId == null)) {
                return;
            }

            const updating = {
                edgeType: selectState.edgeType,
                edgeId: selectState.edgeId,
                point: mousePosition
            };

            documentsHolder.updateRelationEdge(selectState.relationId, updating);
            return;
        }

        // 短形選択モードの場合
        const draggedArea = RectangleViewModel.createFromPoints(dragState.start, mousePosition);
        const selectedTableIds = doFindRectangleSelected(draggedArea, rectangleArea.tableRectangles);
        const selectedMemoIds = doFindRectangleSelected(draggedArea, rectangleArea.memoRectangles);

        const withMultiSelection = withMultiSelectKey(event);
        dispatchSelectAction({ type: "bulk", tableIds: selectedTableIds, memoIds: selectedMemoIds, withMultiSelection });
    };

    const handleCloseEditDialog = () => setEditAction(NO_EDIT_ACTION);

    // Canvas に描画されている短形の情報を取得
    useLayoutEffect(() => {
        const erdCanvas = erdCanvasRef.current;
        if (!erdCanvas) {
            return;
        }

        // Canvas 描画領域の初期化
        const rectangleArea = initRectangleArea(erdCanvas, displayScale);
        setRectangleArea(rectangleArea);
    }, [displayScale, dragState.status, erdDocument.erdSettingModel.displayStyle]);

    // // リレーションの線情報を更新
    useLayoutEffect(() => {
        if (relationRef.current == null) {
            return;
        }

        const svgElements = relationRef.current.svgElements();
        setSvgPaths(svgElements);
    }, [selectState, dragState, rectangleArea, erdDocument]);

    // マウスカーソルのアイコン設定
    useLayoutEffect(() => {
        const erdCanvas = erdCanvasRef.current;
        if (!erdCanvas) {
            return;
        }

        return initEffectOfMouseCorsorOnCanvas(editMode, erdCanvas);
    }, [editMode]);

    // 初回表示時に Canvas の中央にスクロール
    useLayoutEffect(() => {
        window.scrollTo(
            (DRAWABLE_AREA.width - window.innerWidth) / 2,
            (DRAWABLE_AREA.height - window.innerHeight) / 2);
    }, []);

    // スクロール可能領域の制御を window に登録
    useLayoutEffect(() => {
        return initEffectOfScrollOnCanvas(displayScale);
    }, [displayScale]);

    // keyUp 時のイベントを widnow.document に登録
    useEffect(() => {
        return initEffectOfKeyUpOnCanvas(dispatchEditMode);
    }, [dispatchEditMode]);

    return (
        <DragActionContext.Provider value={dragState}>
            <div id="erd-canvas" ref={erdCanvasRef}
                onClick={handleClickOnCanvas} onMouseMove={handleMoveMouseOnCanvas}
                onMouseDown={handleDragStart} onMouseUp={handleDragEnd}
                style={{
                    position: "absolute", top: 0, left: 0, // right: 0, bottom: 0,
                    width: DRAWABLE_AREA.width, height: DRAWABLE_AREA.height,
                    overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center",
                    // overscrollBehavior: "none", scrollbarWidth: "none", msOverflowStyle: "none",
                    backgroundColor: "white", backgroundImage: linerGradient([0, 90]),
                    backgroundSize: `${25 * displayScale}px ${25 * displayScale}px`,
                    backgroundPosition: `0 0, ${25 * displayScale}px ${25 * displayScale}px`,
                    backgroundAttachment: "local",
                    transform: `scale(${displayScale})`, transformOrigin: "center center"
                }}>

                <svg style={{
                    position: "absolute", top: 0, left: 0,
                    width: `${DRAWABLE_AREA.width}px`, height: `${DRAWABLE_AREA.height}px`
                }}>
                    {initRelationCardinalityDefinitions()}
                    {svgPaths}
                    {activeLine}
                </svg>

                {backMemoViews}
                {tableViews}
                {frontMemoViews}

                <ActiveDraggingArea editMode={editMode} dragState={dragState} selectState={selectState} />
            </div>

            <ErdRelationPathView ref={relationRef}
                relationViews={erdDocument.getRelationViewModels()}
                rectangleMap={rectangleArea.tableRectangles}
                onEditAction={setEditAction} onDragAction={dispatchDragAction} />

            {(editAction.editType === "table") && (
                <TableEditView isOpen={editAction.editType === "table"}
                    tableViewModel={editAction.tableViewModel}
                    onClose={handleCloseEditDialog} />
            )}
            {(editAction.editType === "relation") && (
                <RelationEditView isOpen={editAction.editType === "relation"}
                    relationViewModel={editAction.relationViewModel}
                    parentTableModel={editAction.parentTable}
                    childTableModel={editAction.childTable}
                    onClose={handleCloseEditDialog} />
            )}
        </DragActionContext.Provider>
    );
};

type CreateRelationLineArgs = {
    editMode: EditMode,
    relationEdge: Point | null,
    selectState: SelectState,
    tableRectangles: Map<string, RectangleViewModel>
};

const initCreatingRelationLine = ({ editMode, relationEdge, selectState, tableRectangles }: CreateRelationLineArgs) => {
    if (editMode !== EditModeType.CREATE_RELATION) {
        return (<></>);
    }

    if ((relationEdge == null) || (selectState.tableIds.size !== 1)) {
        return (<></>);
    }

    const parentTableId = selectState.tableIds.values().next().value as string;
    const parentTable = tableRectangles.get(parentTableId);
    if (parentTable == null) {
        return (<></>);
    }

    return (
        <line
            x1={parentTable.xCenter + DRAWABLE_AREA.width / 2}
            y1={parentTable.yCenter + DRAWABLE_AREA.height / 2}
            x2={relationEdge.x + DRAWABLE_AREA.width / 2}
            y2={relationEdge.y + DRAWABLE_AREA.height / 2}
            stroke={SELECTED_LINE_COLOR} strokeDasharray="4" strokeWidth="3" />
    );
};

type ActiveDraggingAreaProps = {
    editMode: EditMode,
    dragState: DragState,
    selectState: SelectState
};

const ActiveDraggingArea = ({ editMode, dragState, selectState }: ActiveDraggingAreaProps) => {
    if ((editMode !== EditModeType.SELECT) || (dragState.status !== "on_dragging")
        || (selectState.tableIds.size + selectState.memoIds.size !== 0)
        || (selectState.relationId != null)) {

        return (<></>);
    }

    const rectangle = RectangleViewModel.createFromPoints(dragState.start, dragState.current);

    return (
        <Box sx={{
            position: "absolute",
            left: rectangle.left + DRAWABLE_AREA.width / 2,
            top: rectangle.top + DRAWABLE_AREA.height / 2,
            width: rectangle.width, height: rectangle.height,
            border: `1px solid ${SELECTED_COLOR}`,
            backgroundColor: SELECTED_COLOR
        }} />
    );
};

const doFindRectangleSelected = (selectedArea: RectangleViewModel, rectangles: Map<string, RectangleViewModel>) =>
    Array.from(rectangles.entries())
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .filter(([_tableId, rectangle]) => selectedArea.contains(rectangle))
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(([tableId, _rectangle]) => tableId);

const NO_EDIT_ACTION: EditAction = { editType: "none" } as const

const linerGradient = (degrees: number[]) =>
    degrees.map((degree) =>
        `linear-gradient(${degree}deg, #EFEFEF 0%, #EFEFEF 5%, rgba(255,255,255,0) 5%, rgba(255,255,255,0) 100%)`
    ).join(", ");

const SELECTED_COLOR = "rgba(73, 76, 218, 0.2)";
const SELECTED_LINE_COLOR = "rgba(73, 76, 218, 1)";

type Point = { x: number, y: number };

const initRelationCardinalityDefinitions = () => {
    const markerNone = (<circle cx="10" cy="15" r="10" fill="black" />);
    const markerOne = (<line x1="25" y1="0" x2="25" y2="30" stroke="black" />);
    const markerMany = (<path d="M 40,0 L 25,15 L 40,30" stroke="black" fill="none" />);

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

const createNewTable = (erdSetting: ErdSettingModel, position: Point) => {
    return new TableViewModel({
        tableModel: new TableModel({}),
        corner: {
            left: position.x,
            top: position.y
        },
        headerColor: {
            background: erdSetting.backgroundColor,
            foreground: erdSetting.foregroundColor
        }
    });
};

const createNewMemo = (erdSetting: ErdSettingModel, position: Point) => {
    // TODO メモの短形サイズは直近に設定した大きさにしたい
    const rectangle = new RectangleViewModel({
        positionX: position.x, positionY: position.y, width: 100, height: 100
    });

    return MemoViewModel.create(rectangle, erdSetting.backgroundColor, erdSetting.foregroundColor);
};

const initRectangleArea = (erdCanvas: HTMLDivElement, displayScale: number) => {
    const tableRectangles = new Map<string, RectangleViewModel>();
    const memoRectangles = new Map<string, RectangleViewModel>();

    Array.from(erdCanvas.children).forEach(element => {
        if (element.tagName === "svg") {
            return;
        }

        const tableElements = element.getElementsByClassName(ERD_TABLE_VIEW_CLASS_NAME);
        if ((tableElements != null) && (tableElements.length > 0)) {
            tableRectangles.set(tableElements[0].id, initRectangleWithoutScale(tableElements[0], displayScale));
        }

        const memoElements = element.getElementsByClassName(ERD_MEMO_VIEW_CLASS_NAME);
        if ((memoElements != null) && (memoElements.length > 0)) {
            memoRectangles.set(memoElements[0].id, initRectangleWithoutScale(memoElements[0], displayScale));
        }
    });

    return { tableRectangles, memoRectangles };
};

const initRectangleWithoutScale = (element: Element, displayScale: number) => {
    const rectangle = element.getBoundingClientRect();

    return new RectangleViewModel({
        positionX: (rectangle.left + window.scrollX - DRAWABLE_AREA.width / 2) / displayScale,
        positionY: (rectangle.top + window.scrollY - DRAWABLE_AREA.height / 2) / displayScale,
        width: rectangle.width / displayScale,
        height: rectangle.height / displayScale
    });
};

const initEffectOfMouseCorsorOnCanvas = (editMode: EditMode, erdCanvas: HTMLDivElement) => {
    const handleMouseIcon = () => {
        erdCanvas.style.cursor = findMouseCursorIcon(editMode);
    };

    erdCanvas.addEventListener("mousemove", handleMouseIcon);

    return () => {
        erdCanvas.removeEventListener("mousemove", handleMouseIcon);
    };
};

const findMouseCursorIcon = (editMode: EditMode) => {
    if (((editMode === EditModeType.CREATE_TABLE) || (editMode === EditModeType.CREATE_MEMO))) {
        // erCanvas.style.cursor = `url('/icon/icon_add-table.png'), auto`;
        return "copy";
    }

    if (editMode === EditModeType.CREATE_RELATION) {
        return "crosshair";
    }

    return "default";
};

const initEffectOfScrollOnCanvas = (displayScale: number) => {
    const moveEdge = () => {
        const leftEdge = (DRAWABLE_AREA.width - CANVAS_AREA.width * displayScale) / 2;
        const rigthEdge = (DRAWABLE_AREA.width + CANVAS_AREA.width * displayScale) / 2 - window.innerWidth;
        const topEdge = (DRAWABLE_AREA.height - CANVAS_AREA.height * displayScale) / 2;
        const bottomEdge = (DRAWABLE_AREA.height + CANVAS_AREA.height * displayScale) / 2 - window.innerHeight;

        let modifyScroll = false;
        let nextScrollX = window.scrollX;
        let nextScrollY = window.scrollY;

        if (window.scrollX < leftEdge) {
            modifyScroll = true;
            nextScrollX = leftEdge;
        } else if (window.scrollX > rigthEdge) {
            modifyScroll = true;
            nextScrollX = rigthEdge;
        }
        if (window.scrollY < topEdge) {
            modifyScroll = true;
            nextScrollY = topEdge;
        } else if (window.scrollY > bottomEdge) {
            modifyScroll = true;
            nextScrollY = bottomEdge;
        }

        if (modifyScroll) {
            window.scrollTo(nextScrollX, nextScrollY);
        }
    };

    moveEdge();
    window.addEventListener("scroll", moveEdge);

    return () => window.removeEventListener("scroll", moveEdge);
};

const initEffectOfKeyUpOnCanvas = (dispatchEditMode: (action: EditMode) => void) => {
    const handleKeyUpOnCanvas = (event: KeyboardEvent) => {

        // ESC キーを押下した場合は SELECT モードに移行し、選択した要素を選択解除する
        if (event.key === "Escape") {
            dispatchEditMode(EditModeType.SELECT);
        }

        // TODO
    };

    window.document.addEventListener("keyup", handleKeyUpOnCanvas);

    return () => {
        window.document.removeEventListener("keyup", handleKeyUpOnCanvas);
    };
};

export default ErdCanvas;
