import React from "react";

import useStateRef from "~/components/useStateRef";
import ViewportContext, { useViewport } from "~/context/ViewportContext";
import { DragAction, DragActionContext } from "~/context/DragActionContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { RELEASE_ACTION, SelectEntityContext } from "~/context/SelectEntityContext";
import { LocalSettingContext } from "~/context/LocalSettingContext";
import PortalCanvasContext from "~/context/PortalCanvasContext";
import { EditModeType } from "~/models/EditMode";
import RectangleViewModel from "~/models/RectangleViewModel";
import MemoViewModel from "~/models/MemoViewModel";
import { handlePreventContextMenu, toNextOrthogonalLines, withMultiSelectKey } from "~/features/canvas/support";
import EditAction from "~/features/canvas/EditAction";
import ErdRelationPathView, { ErdRelationTooltipRef } from "~/features/canvas/ErdRelationPathView";
import ErdTableView from "~/features/canvas/ErdTableView";
import StickyMemoView from "~/features/canvas/StickyMemoView";
import { useGrabbing } from "~/features/canvas/ErdCanvas/useGrabbing";
import {
    initDeleteHandler, initEffectOfKeyDownOnCanvas, initEffectOfMouseCursorOnCanvas,
    initRedoHandler, initSelectModeHandler, initUndoHandler
} from "~/features/canvas/ErdCanvas/event-handlers";
import { RectangleArea, doFindRectangleSelected, initRectangleArea } from "~/features/canvas/ErdCanvas/rectangle-area";
import ActiveDraggingArea from "~/features/canvas/ErdCanvas/ActiveDraggingArea";
import {
    createNewMemo, createNewTable, initCreatingRelationLine, initRelationCardinalityDefinitions
} from "~/features/canvas/ErdCanvas/decorations";
import { initEditView } from "~/features/canvas/ErdCanvas/edit-view";
import { CANVAS_RECTANGLES_DRAWN_EVENT } from "~/components/constant";

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

    // コンテキスト値は参照が変わると全コンシューマが再レンダーされるため、useMemo で安定化する
    const viewportContextValue = React.useMemo(() => {
        return { viewport, scaleState };
    }, [viewport, scaleState]);
    const portalCanvasContextValue = React.useMemo(() => {
        return { canvasElement, toolbarCanvasElement, svgCanvasElement };
    }, [canvasElement, toolbarCanvasElement, svgCanvasElement]);

    const erdDocument = documentsHolder.current();

    const erdSetting = erdDocument.erdSettingModel;
    const currentPerspective = erdSetting.findPerspectiveModel(localSetting.perspectiveId);

    if ((localSetting.perspectiveId !== "") && (currentPerspective == null)) {
        // 指定されている Perspective が存在しない場合は、デフォルトに戻す
        dispatchLocalSetting({ type: "perspective", perspectiveId: "" });
    }

    const tableViews = erdDocument.getTableViewModels().map(tableView => (
        <ErdTableView key={`erd-table-view_${tableView.tableId}`} tableView={tableView}
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
            const tableView = createNewTable(mousePosition, localSetting);
            setEditAction({ editType: "table", tableView });
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
            if (selectState.edgeType == null) {
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
        if ((erdCanvas == null) || (viewport.isMounted() === false)) {
            return;
        }

        const rectangleArea = initRectangleArea(erdCanvas, viewport);
        setRectangleArea(rectangleArea);

        if (rectangleArea.tableRectangles.size === 0) {
            return;
        }

        // 描画変更をイベント通知 (VSCode 拡張機能側で利用できるよう、VsCodeExtensionApplication にて制御する)
        const customEvent = new CustomEvent(CANVAS_RECTANGLES_DRAWN_EVENT, {
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
        if (erdCanvas == null) {
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
        <ViewportContext.Provider value={viewportContextValue}>
            <PortalCanvasContext.Provider value={portalCanvasContextValue}>
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

const NO_EDIT_ACTION: EditAction = { editType: "none" } as const

type Point = { x: number, y: number };

export default ErdCanvas;
