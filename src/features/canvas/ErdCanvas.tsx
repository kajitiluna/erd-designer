import React, { JSX, MouseEvent, useEffect, useLayoutEffect, useState } from "react";
import { Box } from "@mui/material";

import DisplayScaleContext from "~/context/DisplayScaleContext";
import { DragActionContext, DragState, NO_DRAGGING, reduceDragAction } from "~/context/DragActionContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { RELEASE_ACTION, SelectAction, SelectEntityContext, SelectState } from "~/context/SelectEntityContext";
import EditAction from "~/features/canvas/EditAction";
import ErdRelationPathView, { ErdRelationTooltipRef } from "~/features/canvas/ErdRelationPathView";
import ErdTableView, { ERD_TABLE_VIEW_CLASS_NAME } from "~/features/canvas/ErdTableView";
import {
    CANVAS_AREA, CARDINALITY_MARKER, DRAWABLE_AREA,
    getLogicalMousePosition, toNextOrthogonalLines, withMultiSelectKey
} from "~/features/canvas/support";
import RelationEditView from "~/features/editor/RelationEditView";
import TableEditView from "~/features/editor/TableEditView";
import TableModel from "~/models/database/TableModel";
import EditMode, { EditModeType } from "~/models/EditMode";
import RectangleViewModel from "~/models/RectangleViewModel";
import TableViewModel from "~/models/TableViewModel";
import MemoViewModel from "~/models/MemoViewModel";
import StickyMemoView, { ERD_MEMO_VIEW_CLASS_NAME } from "~/features/canvas/StickyMemoView";
import { LocalSetting, LocalSettingContext } from "~/context/LocalSettingContext";

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
    const { localSetting } = React.useContext(LocalSettingContext);
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
    // 中クリックにより Canvas 移動の起点となる位置を保持する
    const [panningPoint, setPanningPoint] = useState<Point | null>(null);
    // FireFox の場合、ドラッグ完了後に click イベントが発生するため、ドラッグ距離を保持して、ドラッグ後のイベントを制御する
    const [dragDistance, setDragDistance] = useState<number>(0);

    const erdDocument = documentsHolder.current();

    const tableViews = erdDocument.getTableViewModels().map(tableView => (
        <ErdTableView key={`erd-table-view_${tableView.tableId}`}
            tableViewModel={tableView}
            onEditAction={setEditAction}
            onDragAction={dispatchDragAction} />
    ));

    const initToMemoView = (foreground: boolean) => {
        const toMemoView = (memo: MemoViewModel) => (
            <StickyMemoView key={`sticky-note_${memo.memoId}`}
                memoViewModel={memo} onDragAction={dispatchDragAction}
                foreground={foreground} />
        );

        return toMemoView;
    };
    const { frontMemos, backMemos } = erdDocument.getMemoViewModels();
    const frontMemoViews = frontMemos.map(initToMemoView(true));
    const backMemoViews = backMemos.map(initToMemoView(false));

    // リレーション作成にて、親テーブル指定後、子テーブルを指定する際に動的に表示するライン
    const activeLine = initCreatingRelationLine({
        editMode, relationEdge, selectState: selectState, tableRectangles: rectangleArea.tableRectangles
    });

    // キャンバスがクリックされた時の制御を定義
    const handleClickOnCanvas = (event: MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        const mousePosition = getLogicalMousePosition(event, displayScale);

        if (editMode === EditModeType.CREATE_TABLE) {
            const tableViewModel = createNewTable(mousePosition, localSetting);
            setEditAction({ editType: "table", tableViewModel });
            return;
        }

        if (editMode === EditModeType.CREATE_RELATION) {
            // テーブルが指定されていない場合は、親の選択を解除する
            dispatchSelectAction(RELEASE_ACTION);
            return;
        }

        if (editMode === EditModeType.CREATE_MEMO) {
            const memoViewModel = createNewMemo(mousePosition, localSetting);
            documentsHolder.addMemo(memoViewModel);

            dispatchSelectAction(RELEASE_ACTION);
            dispatchEditMode(EditModeType.SELECT);
            return;
        }

        // ドラッグ操作が行われていると判断した場合は、クリック時の制御を行わない
        if (dragDistance > 5) {
            return;
        }

        // 以降の処理は SELECT モード
        dispatchSelectAction(RELEASE_ACTION);
    };

    // ドラッグが開始されたときの制御
    const handleDragStart = (event: MouseEvent) => {
        setDragDistance(0);
        const mousePosition = getLogicalMousePosition(event, displayScale);

        // 中クリックの場合は、キャンバスを移動する
        if (event.button === 1) {
            doHandleMiddleClickOnCanvas(mousePosition);
            return;
        }

        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        if (editMode !== EditModeType.SELECT) {
            return;
        }

        // 短形選択中に canvas が押下された場合は、選択を解除する
        if (selectState.tableIds.size + selectState.memoIds.size > 0) {
            dispatchSelectAction(RELEASE_ACTION);
        }

        // line が選択中の場合
        if (selectState.relationId) {
            return;
        }

        dispatchDragAction({ type: "start_dragging", start: mousePosition });
    };

    const doHandleMiddleClickOnCanvas = (mousePosition: Point) => {
        if (panningPoint != null) {
            setPanningPoint(null);

            // カーソルを元に戻す
            if (erdCanvasRef.current) {
                erdCanvasRef.current.style.cursor = findMouseCursorIcon(editMode);
            }

            return;
        }

        setPanningPoint(mousePosition);

        if (erdCanvasRef.current) {
            erdCanvasRef.current.style.cursor = "all-scroll";
        }
    };

    const handleMoveMouseOnCanvas = (event: MouseEvent) => {
        const mousePosition = getLogicalMousePosition(event, displayScale);

        if (panningPoint != null) {
            // スクロール位置を更新
            window.scrollBy((mousePosition.x - panningPoint.x) / 1.2, (mousePosition.y - panningPoint.y) / 1.2);
            setPanningPoint(mousePosition);

            return;
        }

        if (editMode === EditModeType.CREATE_RELATION) {
            setRelationEdge((selectState.tableIds.size === 1) ? mousePosition : null);
            return;
        }

        if ((editMode !== EditModeType.SELECT) || (dragState.status !== "on_dragging")) {
            return;
        }

        // ドラッグ操作を記録する
        setDragDistance(current => current + 1);
        dispatchDragAction({ type: "on_dragging", current: mousePosition });
    };

    const handleDragEnd = (event: MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

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

            const relationViews = erdDocument
                .fetchRelationsByTableIds(Array.from(selectState.tableIds))
                .filter(relationView => relationView.lineViewModel.lineType === "orthogonal");
            const nextArgs = toNextOrthogonalLines({
                relationViews, tableRectangles: rectangleArea.tableRectangles, selectState, dragState
            });

            documentsHolder.moveRectangle(selectState.tableIds, selectState.memoIds, offset, nextArgs);
            return;
        }

        if (selectState.relationId && (selectState.edgeId != null)) {
            if (!selectState.edgeType) {
                return;
            }

            const relationView = erdDocument.findRelationViewModel(selectState.relationId);
            if (relationView == null) {
                return;
            }
            if (relationView.lineViewModel.lineType === "orthogonal") {
                const nextArgs = toNextOrthogonalLines({
                    relationViews: [relationView],
                    tableRectangles: rectangleArea.tableRectangles,
                    selectState,
                    dragState
                });

                documentsHolder.updateRelationOrthogonal(nextArgs);
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

        return initEffectOfMouseCursorOnCanvas(editMode, panningPoint, erdCanvas);
    }, [editMode, panningPoint]);

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

    // keyUp 時のイベントを window.document に登録
    useEffect(() => {
        // ダイアログ表示時はキー操作イベントを無効にする
        if (editAction.editType !== "none") {
            return;
        }

        const handlers = [
            // ESC キーを押下した場合は SELECT モードに移行し、選択した要素を選択解除する
            initSelectModeHandler(dispatchEditMode),
            // `Ctrl/Command + Y` または `Ctrl/Command + Shift + Z` で Redo
            initRedoHandler(documentsHolder),
            // `Ctrl + Z` または `Command + Z` で Undo
            initUndoHandler(documentsHolder),
            // `Delete` または `Backspace` キーで、選択した要素を削除
            initDeleteHandler(documentsHolder, selectState, dispatchSelectAction),
        ];

        return initEffectOfKeyDownOnCanvas(handlers);
    }, [editAction.editType, selectState, dispatchSelectAction, dispatchEditMode, documentsHolder]);

    const canvasStyle = initCanvasStyle(displayScale);
    const svgStyle: React.CSSProperties = {
        position: "absolute", top: 0, left: 0,
        width: `${DRAWABLE_AREA.width}px`,
        height: `${DRAWABLE_AREA.height}px`,
        pointerEvents: "none"
    };

    return (
        <DragActionContext.Provider value={dragState}>
            <div id="erd-canvas" ref={erdCanvasRef} style={canvasStyle}
                onClick={handleClickOnCanvas} onMouseMove={handleMoveMouseOnCanvas}
                onMouseDown={handleDragStart} onMouseUp={handleDragEnd}>

                {backMemoViews}

                <svg style={svgStyle}>
                    {initRelationCardinalityDefinitions()}
                    {svgPaths}
                    {activeLine}
                </svg>

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

const initCanvasStyle = (displayScale: number): React.CSSProperties => {
    const baseCanvasStyle: React.CSSProperties = {
        position: "absolute", top: 0, left: 0, // right: 0, bottom: 0,
        width: DRAWABLE_AREA.width, height: DRAWABLE_AREA.height,
        overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center",
        // overscrollBehavior: "none", scrollbarWidth: "none", msOverflowStyle: "none",
        backgroundColor: "white", backgroundAttachment: "local",
        transform: `scale(${displayScale})`, transformOrigin: "center center"
    };

    const gridStyle: React.CSSProperties = (displayScale >= 0.5) ? {
        backgroundImage: linerGradient([0, 90]),
        backgroundSize: `${25 * displayScale}px ${25 * displayScale}px`,
        backgroundPosition: `0 0, ${25 * displayScale}px ${25 * displayScale}px`
    } : {};

    return {
        ...baseCanvasStyle, ...gridStyle,
    };
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

const createNewTable = (position: Point, localSetting: LocalSetting) => {
    const color = localSetting.defaultColor;

    return new TableViewModel({
        tableModel: new TableModel({}),
        corner: { left: position.x, top: position.y },
        headerColor: { background: color.background, foreground: color.foreground }
    });
};

const createNewMemo = (position: Point, localSetting: LocalSetting) => {
    const stickySize = localSetting.stickySize;
    const rectangle = new RectangleViewModel({
        positionX: position.x, positionY: position.y,
        width: stickySize.width, height: stickySize.height
    });

    return MemoViewModel.create(rectangle, localSetting.defaultColor, localSetting.stickyFontSize);
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

const initEffectOfMouseCursorOnCanvas = (editMode: EditMode, panningPoint: Point | null, erdCanvas: HTMLDivElement) => {
    const handleMouseIcon = () => {
        erdCanvas.style.cursor = (panningPoint != null) ? "all-scroll" : findMouseCursorIcon(editMode);
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
        const rightEdge = (DRAWABLE_AREA.width + CANVAS_AREA.width * displayScale) / 2 - window.innerWidth;
        const topEdge = (DRAWABLE_AREA.height - CANVAS_AREA.height * displayScale) / 2;
        const bottomEdge = (DRAWABLE_AREA.height + CANVAS_AREA.height * displayScale) / 2 - window.innerHeight;

        let modifyScroll = false;
        let nextScrollX = window.scrollX;
        let nextScrollY = window.scrollY;

        if (window.scrollX < leftEdge) {
            modifyScroll = true;
            nextScrollX = leftEdge;
        } else if (window.scrollX > rightEdge) {
            modifyScroll = true;
            nextScrollX = rightEdge;
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

type KeyEventHandler = {
    isMatching: (event: KeyboardEvent) => boolean,
    handle: () => void
};

const initEffectOfKeyDownOnCanvas = (handlers: KeyEventHandler[]) => {

    const handleKeyUpOnCanvas = (event: KeyboardEvent) => {

        // ダイアログが表示されているときはキー操作を無視する
        // DOM 要素を直接みているため、MUI のバージョン変更時には修正が必要に可能性がある
        const dialogs = window.document.querySelectorAll('[role="dialog"]');
        const backdrops = window.document.querySelectorAll('.MuiBackdrop-root');
        if ((dialogs.length > 0) || (backdrops.length > 0)) {
            return;
        }

        for (const handler of handlers) {
            if (handler.isMatching(event) === false) {
                continue;
            }

            event.preventDefault();
            event.stopPropagation();

            handler.handle();
            return;
        }
    };

    window.document.addEventListener("keydown", handleKeyUpOnCanvas, true);

    return () => {
        window.document.removeEventListener("keydown", handleKeyUpOnCanvas, true);
    };
};

const initSelectModeHandler = (dispatchEditMode: (action: EditMode) => void) => {
    return {
        isMatching: (event: KeyboardEvent) => (event.key === "Escape"),
        handle: () => dispatchEditMode(EditModeType.SELECT)
    };
};

const initRedoHandler = (documentsHolder: ErdDocumentsHolder): KeyEventHandler => {
    return {
        isMatching: (event: KeyboardEvent) => (event.metaKey || event.ctrlKey)
            && ((event.key === "y") || (event.key === "z") && event.shiftKey),
        handle: () => documentsHolder.redo()
    };
};

const initUndoHandler = (documentsHolder: ErdDocumentsHolder): KeyEventHandler => {
    return {
        isMatching: (event: KeyboardEvent) => (event.metaKey || event.ctrlKey)
            && (event.key === "z"),
        handle: () => documentsHolder.undo()
    };
};

const initDeleteHandler = (
    documentsHolder: ErdDocumentsHolder, selectState: SelectState,
    dispatchSelectAction: (action: SelectAction) => void
): KeyEventHandler => {
    return {
        isMatching: (event: KeyboardEvent) => (event.key === "Delete") || (event.key === "Backspace"),
        handle: () => {
            if (selectState.status === "none") {
                return;
            }

            const deleteIds = {
                tableIds: selectState.tableIds,
                memoIds: selectState.memoIds,
                relationId: selectState.relationId ?? null
            };

            documentsHolder.delete(deleteIds);
            dispatchSelectAction(RELEASE_ACTION);
        }
    };
};

export default ErdCanvas;
