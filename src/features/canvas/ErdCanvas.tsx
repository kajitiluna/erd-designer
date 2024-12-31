import React, { MouseEvent, useEffect, useLayoutEffect, useState } from "react";
import { Box } from "@mui/material";

import DisplayScaleContext from "~/context/DisplayScaleContext";
import { DragActionContext, DragState, NO_DRAGGING, reduceDragAction } from "~/context/DragActionContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { RELEASE_ACTION, SelectEntityContext, SelectState } from "~/context/SelectEntityContext";
import EditAction from "~/features/canvas/EditAction";
import ErdRelationPath from "~/features/canvas/ErdRelationPath";
import ErdTableView, { ERD_TABLE_VIEW_CLASS_NAME } from "~/features/canvas/ErdTableView";
import { CARDINALITY_MARKER, withMultiSelectKey } from "~/features/canvas/support";
import RelationEditView from "~/features/editor/RelationEditView";
import TableEditView from "~/features/editor/TableEditView";
import TableModel from "~/models/database/TableModel";
import EditMode, { EditModeType } from "~/models/EditMode";
import ErdSettingModel from "~/models/ErdSettingModel";
import RectangleViewModel from "~/models/RectangleViewModel";
import TableViewModel from "~/models/TableViewModel";

const CANVAS_AREA = { width: 5000, height: 5000 } as const;
// 描画領域は CANVAS_AREA を下に、最大拡大率を表示しうるサイズにする
// eslint-disable-next-line react-refresh/only-export-components
export const DRAWABLE_AREA = { width: CANVAS_AREA.width * 2, height: CANVAS_AREA.height * 2 } as const;

const ErdCanvas = () => {
    const erdCanvasRef = React.useRef<HTMLDivElement>(null);
    const [dragState, dispatchDragAction] = React.useReducer(reduceDragAction, NO_DRAGGING);

    const documentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode, dispatchEditMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const displayScale = React.useContext(DisplayScaleContext);

    // 画面に表示しているテーブルの位置情報を保持する
    const tableViewsRef = React.useRef<ErdTableRectangleInfo>({ updateCount: 0, rectangleMap: new Map() });
    // リレーション等の線情報を保持する
    const [lineViews, setLineViews] = useState<JSX.Element[]>([]);
    // 編集中の対象
    const [editAction, setEditAction] = useState<EditAction>(NO_EDIT_ACTION);
    // リレーション作成にて親テーブルが指定されているときに、論理的なマウス位置を保持する
    const [relationEdge, setRelationEdge] = useState<Point | null>(null);

    const erdDocument = documentsHolder.current();

    // リレーション作成にて、親テーブル指定後、子テーブルを指定する際に動的に表示するライン
    const activeLine = initCreatingRelationLine({ editMode, relationEdge, selectState: selectState, tableViewsRef });

    const tableViews = erdDocument.getTableViewModels().map((tableView) => (
        <ErdTableView key={`erd-table-view_${tableView.tableId}`}
            tableViewModel={tableView} onEditAction={setEditAction} />
    ));

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
            // TODO
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

        // 既にテーブルが選択されている場合は、該当テーブルにてドラッグ開始されたか確認する
        if (selectState.tableIds.size > 0) {
            for (const tableId of selectState.tableIds) {
                const rectangle = tableViewsRef.current.rectangleMap.get(tableId);
                if (rectangle == null) {
                    continue;
                }

                if (rectangle.contains(mousePosition)) {
                    // テーブルが選択されている場合は、ドラッグ開始
                    dispatchDragAction({ type: "start_dragging", start: mousePosition });
                    return;
                }
            }

            // 選択中のテーブルの上でドラッグ開始していない場合は何もしない
            return;
        }

        // line が選択中の場合
        if (selectState.relationId && (selectState.edgeId != null)) {
            // TODO
        }

        // テーブルが選択中ではない場合は、ドラッグ開始位置がテーブル上ではないことを確認する
        for (const rectangle of tableViewsRef.current.rectangleMap.values()) {
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

        if (selectState.tableIds.size > 0) {
            const offset = {
                x: mousePosition.x - dragState.start.x,
                y: mousePosition.y - dragState.start.y
            };

            documentsHolder.moveTableView(Array.from(selectState.tableIds), offset);
            return;
        }

        if (selectState.relationId && (selectState.edgeId != null)) {
            // TODO
            return;
        }

        // 短形選択モードの場合
        const draggedArea = RectangleViewModel.createFromPoints(dragState.start, mousePosition);
        const selectedTableIds = Array.from(tableViewsRef.current.rectangleMap.entries())
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .filter(([_tableId, rectangle]) => draggedArea.contains(rectangle))
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .map(([tableId, _rectangle]) => tableId);

        const withMultiSelection = withMultiSelectKey(event);
        dispatchSelectAction({ type: "bulk_table", tableIds: selectedTableIds, withMultiSelection });
    };

    const handleCloseEditDialog = () => setEditAction(NO_EDIT_ACTION);

    // Canvas 描画領域の初期化、および View 更新を監視して描画領域に反映する
    useLayoutEffect(() => {
        const erdCanvas = erdCanvasRef.current;
        if (!erdCanvas) {
            return;
        }

        // Canvas 描画領域の初期化
        const rectangleMap = initTableRectangleMap(erdCanvas, displayScale);
        tableViewsRef.current = { updateCount: 0, rectangleMap: rectangleMap };

        // Canvas 描画領域の変更を監視
        const callback = initCallbackMutationErdTableView(tableViewsRef, displayScale);
        const observer = new MutationObserver(callback);
        observer.observe(erdCanvas, { childList: true, attributes: true, subtree: true });

        return () => observer.disconnect();
    }, [displayScale, dragState.status, erdDocument.erdSettingModel.displayStyle]);

    // リレーションの線情報を更新
    useLayoutEffect(() => {
        const relationLines = erdDocument.getRelationViewModels().map(relationView => (
            <ErdRelationPath key={`line_${relationView.relationId}`}
                relationView={relationView}
                rectangleMap={tableViewsRef.current.rectangleMap}
                onEditAction={setEditAction} />
        ));

        setLineViews(relationLines);
    }, [tableViewsRef.current.updateCount, erdDocument]);

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
                    {lineViews}
                    {activeLine}
                </svg>

                {tableViews}

                <ActiveDraggingArea editMode={editMode} dragState={dragState} selectState={selectState} />
            </div>
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

type ErdTableRectangleInfo = {
    updateCount: number, rectangleMap: Map<string, RectangleViewModel>
};

type CreateRelationLineArgs = {
    editMode: EditMode,
    relationEdge: Point | null,
    selectState: SelectState,
    tableViewsRef: { current: ErdTableRectangleInfo }
};

const initCreatingRelationLine = ({ editMode, relationEdge, selectState, tableViewsRef }: CreateRelationLineArgs) => {
    if (editMode !== EditModeType.CREATE_RELATION) {
        return (<></>);
    }

    if ((relationEdge == null) || (selectState.tableIds.size !== 1)) {
        return (<></>);
    }

    const parentTableId = selectState.tableIds.values().next().value as string;
    const parentTable = tableViewsRef.current.rectangleMap.get(parentTableId);
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
        || (selectState.tableIds.size !== 0) || (selectState.relationId != null)) {

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

/**
 * displayScale の表示拡大率を無視した、論理的な点座標を取得する。
 * なお、論理的な点座標とは、キャンバス中央を (0, 0) とした座標を指す。
 * 
 * @param event マウスイベント
 * @param displayScale 表示拡大率
 * @returns 
 */
const getLogicalMousePosition = (event: MouseEvent, displayScale: number): Point => {
    const logicalPosition = {
        x: (event.clientX + window.scrollX - DRAWABLE_AREA.width / 2) / displayScale,
        y: (event.clientY + window.scrollY - DRAWABLE_AREA.height / 2) / displayScale
    };

    const validatedX = Math.min(Math.max(CANVAS_AREA.width * (-1) / 2, logicalPosition.x), CANVAS_AREA.width / 2);
    const validatedY = Math.min(Math.max(CANVAS_AREA.height * (-1) / 2, logicalPosition.y), CANVAS_AREA.height / 2);

    return {
        x: Math.floor(validatedX * 100) / 100,
        y: Math.floor(validatedY * 100) / 100
    };
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

const initTableRectangleMap = (erdCanvas: HTMLDivElement, displayScale: number) => {
    const rectangleMap = new Map<string, RectangleViewModel>();

    Array.from(erdCanvas.children).forEach(element => {
        if (element.tagName === "svg") {
            return;
        }

        const tableViewElements = element.getElementsByClassName(ERD_TABLE_VIEW_CLASS_NAME);
        if ((tableViewElements == null) || (tableViewElements.length === 0)) {
            return;
        }

        const tableId = tableViewElements[0].id;
        const rectangle = tableViewElements[0].getBoundingClientRect()

        rectangleMap.set(tableId, initRectangleWithoutScale(rectangle, displayScale));
    });

    return rectangleMap;
};

const initRectangleWithoutScale = (rectangle: DOMRect, displayScale: number) => {
    return new RectangleViewModel({
        positionX: (rectangle.left + window.scrollX - DRAWABLE_AREA.width / 2) / displayScale,
        positionY: (rectangle.top + window.scrollY - DRAWABLE_AREA.height / 2) / displayScale,
        width: rectangle.width / displayScale,
        height: rectangle.height / displayScale
    });
};

const initCallbackMutationErdTableView = (
    tableViewsRef: { current: ErdTableRectangleInfo }, displayScale: number
) => {
    return (mutations: MutationRecord[]) => {
        const rectangleMap = tableViewsRef.current.rectangleMap;
        const nextMap = initNextRectangleMap(mutations, rectangleMap, displayScale);
        if (nextMap == null) {
            return;
        }

        tableViewsRef.current = { updateCount: tableViewsRef.current.updateCount + 1, rectangleMap: nextMap };
    }
};

const initNextRectangleMap = (
    mutations: MutationRecord[], rectangleMap: Map<string, RectangleViewModel>, displayScale: number
) => {
    let isChanged = false;
    const nextMap = new Map(rectangleMap);

    mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
            return;
        }

        mutation.removedNodes.forEach(node => {
            const baseElement = node as Element;
            const tableViewElements = baseElement.getElementsByClassName(ERD_TABLE_VIEW_CLASS_NAME);

            if ((tableViewElements == null) || (tableViewElements.length === 0)) {
                return;
            }

            for (const element of tableViewElements) {
                if (nextMap.has(element.id) === false) {
                    continue;
                }

                nextMap.delete(element.id);
                isChanged = true;
            }
        });

        const element = mutation.target as Element;
        if (element.className === ERD_TABLE_VIEW_CLASS_NAME) {
            const rectangle = element.getBoundingClientRect();
            nextMap.set(element.id, initRectangleWithoutScale(rectangle, displayScale));

            isChanged = true;
        }

        mutation.addedNodes.forEach(node => {
            const baseElement = node as Element;
            const tableViewElements = baseElement.getElementsByClassName(ERD_TABLE_VIEW_CLASS_NAME);

            if ((tableViewElements == null) || (tableViewElements.length === 0)) {
                return;
            }

            for (const element of tableViewElements) {
                const rectangle = element.getBoundingClientRect()
                nextMap.set(element.id, initRectangleWithoutScale(rectangle, displayScale));

                isChanged = true;
            }
        });
    });

    return isChanged ? nextMap : null;
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
