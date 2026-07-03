import React from "react";
import { Box } from "@mui/material";

import useStateRef from "~/components/useStateRef";
import ViewportContext, { CanvasViewport, useViewport } from "~/context/ViewportContext";
import { DragAction, DragActionContext } from "~/context/DragActionContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { RELEASE_ACTION, SelectAction, SelectEntityContext } from "~/context/SelectEntityContext";
import { LocalSetting, LocalSettingContext } from "~/context/LocalSettingContext";
import PortalCanvasContext from "~/context/PortalCanvasContext";
import TableModel from "~/models/database/TableModel";
import EditMode, { EditModeType } from "~/models/EditMode";
import RectangleViewModel from "~/models/RectangleViewModel";
import TableViewModel from "~/models/TableViewModel";
import MemoViewModel from "~/models/MemoViewModel";
import PerspectiveModel from "~/models/PerspectiveModel";
import ErdDocument from "~/models/ErdDocument";
import { OrthogonalDirection } from "~/models/LineViewModel";
import RelationViewModel from "~/models/RelationViewModel";
import {
    CARDINALITY_MARKER, handlePreventContextMenu, toNextOrthogonalLines, withMultiSelectKey
} from "~/features/canvas/support";
import EditAction from "~/features/canvas/EditAction";
import ErdRelationPathView, { ErdRelationTooltipRef } from "~/features/canvas/ErdRelationPathView";
import ErdTableView, { ERD_TABLE_VIEW_CLASS_NAME } from "~/features/canvas/ErdTableView";
import PerspectiveSettingView from "~/features/editor/PerspectiveSettingView";
import RelationEditView from "~/features/editor/RelationEditView";
import TableEditView from "~/features/editor/TableEditView";
import StickyMemoView, { ERD_MEMO_VIEW_CLASS_NAME } from "~/features/canvas/StickyMemoView";
import { DragState } from "~/models/DragState";
import { SelectState } from "~/models/SelectState";
import { inOpenControlPanel } from "~/components/support";

export const ERD_CANVAS_ID = "erd-canvas";

type ErdCanvasProps = {
    onDragAction: React.Dispatch<DragAction>;
    children?: React.ReactNode;
};

const ErdCanvas = ({ onDragAction: dispatchDragAction, children }: ErdCanvasProps) => {
    const documentsHolder = React.useContext(ErdDocumentsHolderContext);
    const dragState = React.useContext(DragActionContext);
    const { editMode, dispatchEditMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const { localSetting, dispatchLocalSetting } = React.useContext(LocalSettingContext);

    const viewportRef = React.useRef<HTMLDivElement>(null);
    const erdCanvasRef = React.useRef<HTMLDivElement>(null);
    const isDraggingRef = React.useRef(false);
    React.useEffect(() => {
        isDraggingRef.current = (dragState.status === "on_dragging");
    }, [dragState.status]);

    const [canvasElement, canvasElementRef] = useStateRef<HTMLDivElement>();
    const [toolbarCanvasElement, toolbarCanvasRef] = useStateRef<HTMLDivElement>()
    const [svgCanvasElement, svgCanvasRef] = useStateRef<SVGSVGElement>();

    const canvasRefCallback = React.useCallback((element: HTMLDivElement | null) => {
        Object.assign(erdCanvasRef, { current: element });
        canvasElementRef(element);
    }, [canvasElementRef]);

    // Canvas に描画されている短形の情報を保持する
    const [rectangleArea, setRectangleArea] = React.useState<RectangleArea>(
        { tableRectangles: new Map(), memoRectangles: new Map() }
    );
    // 画面に表示している Relation に関する svg 要素への参照を保持する
    const relationRef = React.useRef<ErdRelationTooltipRef>(null);
    // リレーション等の線情報を保持する
    const [svgPaths, setSvgPaths] = React.useState<React.JSX.Element[]>([]);
    const [relationLabels, setRelationLabels] = React.useState<React.JSX.Element[]>([]);
    // 編集中の対象
    const [editAction, setEditAction] = React.useState<EditAction>(NO_EDIT_ACTION);
    // リレーション作成にて親テーブルが指定されているときに、論理的なマウス位置を保持する
    const [relationEdge, setRelationEdge] = React.useState<Point | null>(null);
    // FireFox の場合、ドラッグ完了後に click イベントが発生するため、ドラッグ距離を保持して、ドラッグ後のイベントを制御する
    const [dragDistance, setDragDistance] = React.useState<number>(0);

    const { viewport, scaleState } = useViewport({ viewportRef, canvasRef: erdCanvasRef, isDraggingRef });
    const { grabbingPanel, startGrabbing } = useGrabbing(viewport, editMode);

    const erdDocument = documentsHolder.current();

    const erdSetting = erdDocument.erdSettingModel;
    const currentPerspective = erdSetting.findPerspectiveModel(localSetting.perspectiveId);

    if ((localSetting.perspectiveId !== "") && (currentPerspective == null)) {
        // 指定されている Perspective が存在しない場合は、デフォルトに戻す
        dispatchLocalSetting({ type: "perspective", perspectiveId: "" });
    }

    const tableViews = erdDocument.getTableViewModels().map(tableView => (
        <ErdTableView key={`erd-table-view_${tableView.tableId}`} tableViewModel={tableView}
            visible={(currentPerspective == null) || currentPerspective.containsModel(tableView.tableId)}
            onEditAction={setEditAction} onDragAction={dispatchDragAction} />
    ));

    const initToMemoView = (foreground: boolean) => {
        const toMemoView = (memo: MemoViewModel) => {
            const handleSettingAction = () => {
                setEditAction({ editType: "perspective", targetId: memo.memoId });
            };

            return (
                <StickyMemoView key={`sticky-note_${memo.memoId}`} memoViewModel={memo}
                    visible={(currentPerspective == null) || currentPerspective.containsModel(memo.memoId)}
                    onSettingAction={handleSettingAction} onDragAction={dispatchDragAction} foreground={foreground} />
            );
        };

        return toMemoView;
    };
    const { frontMemos, backMemos } = erdDocument.getMemoViewModels();
    const frontMemoViews = frontMemos.map(initToMemoView(true));
    const backMemoViews = backMemos.map(initToMemoView(false));

    // リレーション作成にて、親テーブル指定後、子テーブルを指定する際に動的に表示するライン
    const activeLine = initCreatingRelationLine({
        editMode, relationEdge, selectState: selectState,
        tableRectangles: rectangleArea.tableRectangles
    });

    // キャンバスがクリックされた時の制御を定義
    const handleClickOnCanvas = (event: React.MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        const mousePosition = viewport.getLogicalPosition(event);

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
    const handleDragStart = (event: React.MouseEvent) => {
        setDragDistance(0);
        const mousePosition = viewport.getLogicalPosition(event);

        // 右クリックもしくは中クリックの場合は、grab 操作を開始する
        if ((event.button === 1) || (event.button === 2)) {
            startGrabbing(mousePosition);
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

    const handleMoveMouseOnCanvas = (event: React.MouseEvent) => {
        const mousePosition = viewport.getLogicalPosition(event);

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

    const handleDragEnd = (event: React.MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        if ((editMode !== EditModeType.SELECT) || (dragState.status !== "on_dragging")) {
            return;
        }

        const mousePosition = viewport.getLogicalPosition(event);
        dispatchDragAction({ type: "clear" });

        // テーブルもしくはメモを選択状態でドラッグが完了した場合の制御
        if (selectState.tableIds.size + selectState.memoIds.size > 0) {
            const offset = {
                x: mousePosition.x - dragState.start.x,
                y: mousePosition.y - dragState.start.y
            };
            if ((Math.abs(offset.x) < 5) && (Math.abs(offset.y) < 5)) {
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

        // リレーションの edge をドラッグし終えた場合の制御
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
        const selectedTableIds = doFindRectangleSelected(draggedArea, rectangleArea.tableRectangles, currentPerspective);
        const selectedMemoIds = doFindRectangleSelected(draggedArea, rectangleArea.memoRectangles, currentPerspective);

        const withMultiSelection = withMultiSelectKey(event);
        dispatchSelectAction({ type: "bulk", tableIds: selectedTableIds, memoIds: selectedMemoIds, withMultiSelection });
    };

    const handleCloseEditDialog = () => setEditAction(NO_EDIT_ACTION);

    // Canvas に描画されている短形の情報を取得
    React.useLayoutEffect(() => {
        const erdCanvas = erdCanvasRef.current;
        if (!erdCanvas || !viewport.isMounted()) {
            return;
        }

        const rectangleArea = initRectangleArea(erdCanvas, viewport);
        setRectangleArea(rectangleArea);

        if (rectangleArea.tableRectangles.size === 0) {
            return;
        }

        // 描画変更をイベント通知 (VSCode 拡張機能側で利用できるよう、VsCodeExtensionApplication にて制御する)
        const customEvent = new CustomEvent("canvasRectanglesDrawn", {
            detail: {
                tableRectangles: rectangleArea.tableRectangles
            }
        });
        window.dispatchEvent(customEvent);
    }, [erdDocument.lastUpdatedAt, scaleState.scale, dragState.status, currentPerspective, viewport]);

    // // リレーションの線情報を更新
    React.useLayoutEffect(() => {
        if (relationRef.current == null) {
            return;
        }

        const targetElements = (currentPerspective == null)
            ? relationRef.current.svgElements()
            : relationRef.current.svgElements()
                .filter(element => (localSetting.visibleLineStyle === "both-bounded")
                    ? element.tableIds.every(tableId => currentPerspective.containsModel(tableId))
                    : element.tableIds.some(tableId => currentPerspective.containsModel(tableId)));

        setSvgPaths(targetElements.map(element => element.path));
        setRelationLabels(targetElements.map(element => element.label));
    }, [selectState, dragState, rectangleArea, localSetting.visibleLineStyle, erdDocument, currentPerspective]);

    // マウスカーソルのアイコン設定
    React.useLayoutEffect(() => {
        const erdCanvas = erdCanvasRef.current;
        if (!erdCanvas) {
            return;
        }

        return initEffectOfMouseCursorOnCanvas(editMode, erdCanvas);
    }, [editMode]);

    // keyUp 時のイベントを window.document に登録
    React.useEffect(() => {
        // ダイアログ表示時はキー操作イベントを無効にする
        if (editAction.editType !== "none") {
            return;
        }

        const handlers = [
            // ESC キーを押下した場合は SELECT モードに移行し、選択した要素を選択解除する
            initSelectModeHandler(dispatchEditMode, erdCanvasRef),
            // `Ctrl/Command + Y` または `Ctrl/Command + Shift + Z` で Redo
            initRedoHandler(documentsHolder),
            // `Ctrl + Z` または `Command + Z` で Undo
            initUndoHandler(documentsHolder),
            // `Delete` または `Backspace` キーで、選択した要素を削除
            initDeleteHandler(documentsHolder, selectState, dispatchSelectAction),
        ];

        return initEffectOfKeyDownOnCanvas(handlers);
    }, [editAction.editType, selectState, dispatchSelectAction, dispatchEditMode, documentsHolder]);

    // 外部からの変更を Canvas の表示に反映する
    React.useEffect(() => {
        const handleExternalDocumentChange = (event: Event) => {
            const customEvent = event as CustomEvent;
            const eventDetail = customEvent.detail;
            if (!("erdDocument" in eventDetail)) {
                console.warn(`Unexpected event detail structure: ${JSON.stringify(eventDetail)}`);
                return;
            }

            const erdDocument = eventDetail.erdDocument as ErdDocument;
            documentsHolder.update(erdDocument, `Update document from external change: ${JSON.stringify(erdDocument)}`);
            console.info("ErdCanvas: External document change has been applied.");
        };

        window.addEventListener("externalDocumentChanged", handleExternalDocumentChange);

        return () => {
            window.removeEventListener("externalDocumentChanged", handleExternalDocumentChange);
        };
    }, [documentsHolder]);

    const mainCanvas = (
        <div ref={viewportRef} style={VIEWPORT_CONTAINER_STYLE}
            onClick={handleClickOnCanvas} onMouseMove={handleMoveMouseOnCanvas}
            onMouseDown={handleDragStart} onMouseUp={handleDragEnd}
            onContextMenu={handlePreventContextMenu}>

            <div id={ERD_CANVAS_ID} ref={canvasRefCallback} style={CANVAS_STYLE}>

                {backMemoViews}

                <svg ref={svgCanvasRef} style={CANVAS_SVG_STYLE} viewBox={SVG_VIEW_BOX}>
                    {initRelationCardinalityDefinitions()}
                    {svgPaths}
                    {activeLine}
                </svg>

                {tableViews}
                {frontMemoViews}
                {erdSetting.showRelationNames && relationLabels}

                {(scaleState.phase === "idle") && (
                    <div ref={toolbarCanvasRef} data-erd-toolbar-canvas style={TOOLBAR_CANVAS_STYLE} />
                )}

                <ActiveDraggingArea editMode={editMode} dragState={dragState} selectState={selectState} />
            </div>

            {grabbingPanel}

            <div style={{ visibility: (scaleState.phase === "scaling") ? "hidden" : "visible" }}>
                <ErdRelationPathView ref={relationRef}
                    relationViews={erdDocument.getRelationViewModels()}
                    rectangleMap={rectangleArea.tableRectangles}
                    onEditAction={setEditAction} onDragAction={dispatchDragAction} />
            </div>

        </div>
    );

    return (
        <ViewportContext.Provider value={{ viewport, scaleState }}>
            <PortalCanvasContext.Provider value={{ canvasElement, toolbarCanvasElement, svgCanvasElement }}>
                {mainCanvas}
                {children}
            </PortalCanvasContext.Provider>

            {initEditView(editAction, rectangleArea, handleCloseEditDialog)}
        </ViewportContext.Provider>
    );
};

const CANVAS_SIZE = 200000;
const SVG_VIEW_BOX = `${-CANVAS_SIZE / 2} ${-CANVAS_SIZE / 2} ${CANVAS_SIZE} ${CANVAS_SIZE}`;

const VIEWPORT_CONTAINER_STYLE: React.CSSProperties = {
    position: "relative", width: "100%", height: "100vh",
    overflow: "hidden", backgroundColor: "white"
} as const;

const CANVAS_STYLE: React.CSSProperties = {
    position: "absolute",
    transformOrigin: "0 0",
    userSelect: "none"
} as const;

const CANVAS_SVG_STYLE: React.CSSProperties = {
    position: "absolute",
    left: `${-CANVAS_SIZE / 2}px`,
    top: `${-CANVAS_SIZE / 2}px`,
    width: `${CANVAS_SIZE}px`,
    height: `${CANVAS_SIZE}px`,
    overflow: "visible",
    pointerEvents: "none"
} as const;

const TOOLBAR_CANVAS_STYLE: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: `${CANVAS_SIZE}px`,
    height: `${CANVAS_SIZE}px`,
    overflow: "visible",
    pointerEvents: "none"
} as const;

type RectangleArea = {
    tableRectangles: Map<string, RectangleViewModel>,
    memoRectangles: Map<string, RectangleViewModel>
};

const initEditView = (editAction: EditAction, rectangleArea: RectangleArea, onClose: () => void) => {
    if (editAction.editType === "none") {
        return (<></>);
    }

    if (editAction.editType === "table") {
        return (
            <TableEditView isOpen={editAction.editType === "table"}
                tableViewModel={editAction.tableViewModel}
                onClose={onClose} />
        );
    }

    if (editAction.editType === "perspective") {
        return (
            <PerspectiveSettingView
                isOpen={editAction.editType === "perspective"}
                targetId={editAction.targetId}
                onClose={onClose} />
        );
    }

    if (editAction.editType === "relation") {
        // 自己関連かつ、新規作成か否かを判断する
        const relationView = doCreateSelfRelation(editAction, rectangleArea);

        return (
            <RelationEditView isOpen={editAction.editType === "relation"}
                relationViewModel={relationView}
                parentTableModel={editAction.parentTable}
                childTableModel={editAction.childTable}
                onClose={onClose} />
        );
    }

    return (<></>);
};

const doCreateSelfRelation = (editAction: EditAction & { editType: "relation" }, rectangleArea: RectangleArea) => {
    const lineViewModel = editAction.relationViewModel.lineViewModel;
    const parentTableId = editAction.parentTable.tableModelId;
    const childTableId = editAction.childTable.tableModelId;

    if ((parentTableId !== childTableId) || (lineViewModel.orthogonalLines.length >= 3)) {
        return editAction.relationViewModel;
    }

    const rectangle = rectangleArea.tableRectangles.get(parentTableId) as RectangleViewModel;
    const orthogonalLines: OrthogonalDirection[] = [
        { direction: "horizontal", position: rectangle.bottom - rectangle.height / 4 },
        { direction: "vertical", position: rectangle.right + 70 },
        { direction: "horizontal", position: rectangle.bottom + 70 },
        { direction: "vertical", position: rectangle.right - rectangle.width / 4 }
    ];
    const nextLineViewModel = lineViewModel.updateOrthogonalLines(orthogonalLines);

    return new RelationViewModel({ ...editAction.relationViewModel, lineViewModel: nextLineViewModel });
};

const useGrabbing = (viewport: CanvasViewport, editMode: EditMode) => {
    const grabbingPanelRef = React.useRef<HTMLDivElement>(null);
    const [availableGrabbing, setAvailableGrabbing] = React.useState<boolean>(false);

    // grabbing 操作による Canvas 移動の起点となる位置を保持する
    const [isGrabbing, setGrabbing] = React.useState<boolean>(false);
    const grabbingAnimationRef = React.useRef<number | null>(null);

    const handleGrabMouseDown = React.useCallback((event: React.MouseEvent) => {
        if (grabbingPanelRef.current == null) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const startPosition = viewport.getLogicalPosition(event);
        setGrabbing(true);

        const onGrabEndFromPanel = () => setGrabbing(false);
        performGrabbing({
            viewport,
            grabbingPanelRef, grabbingAnimationRef, startPosition,
            onGrabEnd: onGrabEndFromPanel
        });
    }, [viewport]);

    const grabPanelStyle = React.useMemo<React.CSSProperties>(() => ({
        position: "absolute", top: 0, left: 0,
        width: ((editMode === EditModeType.GRAB) || availableGrabbing) ? "100%" : "0px",
        height: ((editMode === EditModeType.GRAB) || availableGrabbing) ? "100%" : "0px",
        cursor: isGrabbing ? "grabbing" : "grab"
    }), [editMode, availableGrabbing, isGrabbing]);

    const grabbingPanel = (<div ref={grabbingPanelRef} style={grabPanelStyle} onMouseDown={handleGrabMouseDown} />);

    const startGrabbing = (position: Point) => {
        if (editMode === EditModeType.GRAB) {
            return;
        }

        setGrabbing(true);
        setAvailableGrabbing(true);

        const onGrabEndFromCanvas = () => {
            setGrabbing(false);
            setAvailableGrabbing(false);
        };

        performGrabbing({
            viewport, grabbingPanelRef, grabbingAnimationRef, startPosition: position,
            onGrabEnd: onGrabEndFromCanvas
        });
    };

    return { grabbingPanel, startGrabbing };
};

type PerformGrabbingArgs = {
    viewport: CanvasViewport;
    grabbingPanelRef: React.RefObject<HTMLDivElement | null>;
    grabbingAnimationRef: React.RefObject<number | null>;
    startPosition: Point;
    onGrabEnd: () => void;
};

const performGrabbing = ({
    viewport, grabbingPanelRef, grabbingAnimationRef, startPosition, onGrabEnd
}: PerformGrabbingArgs) => {

    if (grabbingPanelRef.current == null) {
        return;
    }

    const handleMouseMove = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        if (grabbingAnimationRef.current) {
            cancelAnimationFrame(grabbingAnimationRef.current);
        }

        const clientX = event.clientX;
        const clientY = event.clientY;

        grabbingAnimationRef.current = requestAnimationFrame(() => {
            if (!viewport.isMounted()) {
                grabbingAnimationRef.current = null;
                return;
            }

            const { viewportPosition, screenCenter, scale: currentScale } = viewport.getViewInfo();

            const newCenterX = startPosition.x - (clientX - screenCenter.x) / currentScale;
            const newCenterY = startPosition.y - (clientY - screenCenter.y) / currentScale;

            const deltaX = Math.abs(newCenterX - viewportPosition.centerX);
            const deltaY = Math.abs(newCenterY - viewportPosition.centerY);
            if (deltaX + deltaY < 0.5) {
                grabbingAnimationRef.current = null;
                return;
            }

            viewport.updateViewportPosition(newCenterX, newCenterY);
            grabbingAnimationRef.current = null;
        });
    };

    const handleDragEnd = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        onGrabEnd();

        if (grabbingPanelRef.current == null) {
            return;
        }

        grabbingPanelRef.current.removeEventListener("mousemove", handleMouseMove);
        grabbingPanelRef.current.removeEventListener("mouseup", handleDragEnd);
    };

    grabbingPanelRef.current.addEventListener("mouseup", handleDragEnd);
    grabbingPanelRef.current.addEventListener("mousemove", handleMouseMove);
};

type CreateRelationLineArgs = {
    editMode: EditMode,
    relationEdge: Point | null,
    selectState: SelectState,
    tableRectangles: Map<string, RectangleViewModel>
};

const initCreatingRelationLine = ({
    editMode, relationEdge, selectState, tableRectangles
}: CreateRelationLineArgs) => {
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
                stroke={SELECTED_LINE_COLOR} strokeDasharray="4" strokeWidth="3">
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
        <path d={drawingLine} fill="none" stroke={SELECTED_LINE_COLOR} strokeDasharray="4" strokeWidth="3">
            <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1s" repeatCount="indefinite" />
        </path>
    );
};

type ActiveDraggingAreaProps = {
    editMode: EditMode,
    dragState: DragState,
    selectState: SelectState
};

const ActiveDraggingArea = ({ editMode, dragState, selectState }: ActiveDraggingAreaProps) => {
    const { viewport } = React.useContext(ViewportContext);

    if ((editMode !== EditModeType.SELECT) || (dragState.status !== "on_dragging")
        || (selectState.tableIds.size + selectState.memoIds.size !== 0)
        || (selectState.relationId != null)) {

        return (<></>);
    }

    const rectangle = RectangleViewModel.createFromPoints(dragState.start, dragState.current);
    const physicalPosition = viewport.toPhysicalPosition({ x: rectangle.left, y: rectangle.top });

    return (
        <Box sx={{
            position: "absolute",
            left: physicalPosition.x, top: physicalPosition.y,
            width: rectangle.width, height: rectangle.height,
            border: `1px solid ${SELECTED_COLOR}`,
            backgroundColor: SELECTED_COLOR
        }} />
    );
};

const doFindRectangleSelected = (
    selectedArea: RectangleViewModel, rectangles: Map<string, RectangleViewModel>,
    perspective: PerspectiveModel | null
) =>
    Array.from(rectangles.entries())
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .filter(([_rectangleId, rectangle]) => selectedArea.contains(rectangle))
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .filter(([rectangleId, _rectangle]) => (perspective == null) || perspective.containsModel(rectangleId))
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(([rectangleId, _rectangle]) => rectangleId);

const NO_EDIT_ACTION: EditAction = { editType: "none" } as const


const SELECTED_COLOR = "rgba(73, 76, 218, 0.2)";
const SELECTED_LINE_COLOR = "rgba(73, 76, 218, 1)";

type Point = { x: number, y: number };

// リレーションの線の定義
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

const initRectangleArea = (erdCanvas: HTMLDivElement, viewport: CanvasViewport) => {
    const tableRectangles = new Map<string, RectangleViewModel>();
    const memoRectangles = new Map<string, RectangleViewModel>();

    Array.from(erdCanvas.children).forEach(element => {
        if (element.tagName === "svg") {
            return;
        }

        const tableElements = element.getElementsByClassName(ERD_TABLE_VIEW_CLASS_NAME);
        if ((tableElements != null) && (tableElements.length > 0)) {
            const rectangle = initRectangleWithoutScale(tableElements[0], viewport);
            tableRectangles.set(tableElements[0].id, rectangle);
        }

        const memoElements = element.getElementsByClassName(ERD_MEMO_VIEW_CLASS_NAME);
        if ((memoElements != null) && (memoElements.length > 0)) {
            const rectangle = initRectangleWithoutScale(memoElements[0], viewport);
            memoRectangles.set(memoElements[0].id, rectangle);
        }
    });

    return { tableRectangles, memoRectangles };
};

const initRectangleWithoutScale = (element: Element, viewport: CanvasViewport) => {
    const elementRect = element.getBoundingClientRect();
    const { viewportPosition, screenCenter, scale: currentScale } = viewport.getViewInfo();

    return new RectangleViewModel({
        positionX: (elementRect.left - screenCenter.x) / currentScale + viewportPosition.centerX,
        positionY: (elementRect.top - screenCenter.y) / currentScale + viewportPosition.centerY,
        width: elementRect.width / currentScale,
        height: elementRect.height / currentScale
    });
};

const initEffectOfMouseCursorOnCanvas = (editMode: EditMode, erdCanvas: HTMLDivElement) => {
    // Grab モードの場合は、別のコンポーネントでマウスカーソルを制御しているので、ここでは何もしない
    if (editMode === EditModeType.GRAB) {
        return;
    }

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
        return "copy";
    }

    if (editMode === EditModeType.CREATE_RELATION) {
        return "crosshair";
    }

    return "default";
};


type KeyEventHandler = {

    isMatching: (event: KeyboardEvent) => boolean,

    /**
     * Handles the keyboard event. 
     * 
     * @returns {boolean}
     *      Return `true` to prevent event propagation (e.g., calling `event.preventDefault()` and `event.stopPropagation()`).
     *      Return `false` to allow the event to propagate further.
     */
    handle: () => boolean
};

const initEffectOfKeyDownOnCanvas = (handlers: KeyEventHandler[]) => {

    const handleKeyUpOnCanvas = (event: KeyboardEvent) => {

        // ダイアログが表示されているときはキー操作を無視する
        const inOpenControlPane = inOpenControlPanel();
        if (inOpenControlPane) {
            return;
        }

        for (const handler of handlers) {
            if (handler.isMatching(event) === false) {
                continue;
            }

            const shouldPreventDefault = handler.handle();
            if (shouldPreventDefault === false) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            return;
        }
    };

    window.document.addEventListener("keydown", handleKeyUpOnCanvas, true);

    return () => {
        window.document.removeEventListener("keydown", handleKeyUpOnCanvas, true);
    };
};

const initSelectModeHandler = (
    dispatchEditMode: (action: EditMode) => void, erdCanvasRef: React.RefObject<HTMLDivElement | null>
) => {
    return {
        isMatching: (event: KeyboardEvent) => (event.key === "Escape"),
        handle: () => {
            dispatchEditMode(EditModeType.SELECT);

            if (erdCanvasRef.current) {
                erdCanvasRef.current.style.cursor = "default";
            }

            return true; // イベントの伝播を止める
        }
    };
};

const initRedoHandler = (documentsHolder: ErdDocumentsHolder): KeyEventHandler => {
    return {
        isMatching: (event: KeyboardEvent) => (event.metaKey || event.ctrlKey)
            && ((event.key === "y") || ((event.key === "z") && event.shiftKey)),
        handle: () => {
            documentsHolder.redo();
            return true; // イベントの伝播を止める
        }
    };
};

const initUndoHandler = (documentsHolder: ErdDocumentsHolder): KeyEventHandler => {
    return {
        isMatching: (event: KeyboardEvent) => (event.metaKey || event.ctrlKey)
            && (event.key === "z"),
        handle: () => {
            documentsHolder.undo();
            return true; // イベントの伝播を止める
        }
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
                return false; // イベントの伝播を止めない
            }

            const deleteIds = {
                tableIds: selectState.tableIds,
                memoIds: selectState.memoIds,
                relationId: selectState.relationId ?? null
            };

            documentsHolder.delete(deleteIds);
            dispatchSelectAction(RELEASE_ACTION);

            return true; // イベントの伝播を止める
        }
    };
};

export default ErdCanvas;
