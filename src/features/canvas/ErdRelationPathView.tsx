import React from "react";
import ReactDOM from "react-dom";
import {
    Button, ButtonGroup, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    Divider, IconButton, Popover, Stack, Tooltip
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import TextFormatIcon from '@mui/icons-material/TextFormat';

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import EditModeContext from "~/context/EditModeContext";
import { RELEASE_ACTION, SelectEntityContext } from "~/context/SelectEntityContext";
import { DragAction, DragActionContext } from "~/context/DragActionContext";
import ViewportContext from "~/context/ViewportContext";
import PortalCanvasContext from "~/context/PortalCanvasContext";
import RelationModel from "~/models/database/RelationModel";
import RectangleViewModel from "~/models/RectangleViewModel";
import RelationViewModel from "~/models/RelationViewModel";
import { EditModeType } from "~/models/EditMode";
import ErdDocument from "~/models/ErdDocument";
import ColorValue from "~/models/ColorValue";
import ColorSelector from "~/components/ColorSelector";
import LineSelectorIcon from "~/components/icons/LineSelectorIcon";
import LineWidthIcon from "~/components/icons/LineWidthIcon";
import LineStraightIcon from "~/components/icons/LineStraightIcon";
import LineOrthogonalIcon from "~/components/icons/LineOrthogonalIcon";
import {
    handlePreventMouseEvent, ORTHOGONAL_THRESHOLD,
    toDraggedOrthogonalPoints, toMarkerId, toOrthogonalPoints, toRoundedPath
} from "~/features/canvas/support";
import EditAction from "~/features/canvas/EditAction";
import RelationLabelOverlay from "~/features/canvas/RelationLabelOverlay";

import styleClasses from "./ErdCanvas.module.css";
import LabelViewModel from "~/models/LabelViewModel";

export const ERD_RELATION_PATH_CLASS_NAME = "erd-relation-path";

export type ErdRelationTooltipRef = {
    svgElements: () => { tableIds: string[], path: React.JSX.Element, label: React.JSX.Element }[]
};

type ErdRelationPathViewProps = {
    relationViews: RelationViewModel[],
    rectangleMap: Map<string, RectangleViewModel>
    onEditAction: (editAction: EditAction) => void,
    onDragAction: (dragAction: DragAction) => void,
    ref: React.Ref<ErdRelationTooltipRef>
};

const ErdRelationPathView = ({
    relationViews, rectangleMap, onEditAction, onDragAction, ref
}: ErdRelationPathViewProps) => {

    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { dispatchSelectAction } = React.useContext(SelectEntityContext);

    const [clickedPosition, setClickedPosition] = React.useState<{ x: number, y: number }>({ x: 0, y: 0 });
    const [deletingRelation, setDeletingRelation] = React.useState<RelationViewModel | null>(null);

    const handleOpenEditDialog = (event: React.MouseEvent, relationView: RelationViewModel) => {
        if (editMode !== EditModeType.SELECT) {
            return;
        }

        event.stopPropagation();

        const relationModel: RelationModel = relationView.relationModel;
        const erdDocument: ErdDocument = documentsHolder.current();

        const parentTable = erdDocument.findTableViewModel(relationModel.parentTableModelId);
        if (parentTable == null) {
            console.error("Not found the parent tableViewModel. "
                + `relationId = ${relationView.relationId}, tableId = ${relationModel.parentTableModelId}`);
            return;
        }
        const childTable = erdDocument.findTableViewModel(relationModel.childTableModelId);
        if (childTable == null) {
            console.error("Not found the child tableViewModel. "
                + `relationId = ${relationView.relationId}, tableId = ${relationModel.childTableModelId}`);
            return;
        }

        onEditAction({
            editType: "relation",
            relationViewModel: relationView,
            parentTable: parentTable.tableModel,
            childTable: childTable.tableModel
        });
        dispatchSelectAction(RELEASE_ACTION);
    };

    const straightLinePaths =
        useStraightLineView(relationViews, rectangleMap, setClickedPosition, handleOpenEditDialog, onDragAction);
    const orthogonalLinePaths =
        useOrthogonalLine(relationViews, rectangleMap, setClickedPosition, handleOpenEditDialog, onDragAction);

    const tooltip = useRelationTooltip(relationViews, rectangleMap, clickedPosition, onEditAction, setDeletingRelation);

    React.useImperativeHandle(ref, () => {
        return {
            svgElements: () => [...straightLinePaths, ...orthogonalLinePaths]
        };
    }, [straightLinePaths, orthogonalLinePaths]);

    const handleDeleteRelation = (event: React.MouseEvent, relationView: RelationViewModel) => {
        event.stopPropagation();

        const loggingMessage = `Delete Relation: ${JSON.stringify(relationView.relationModel)}`;
        documentsHolder.deleteRelation(relationView.relationId, loggingMessage);
        setDeletingRelation(null);
    };

    const handleCloseDeleteDialog = (event: React.MouseEvent) => {
        event.stopPropagation();
        setDeletingRelation(null);
    };

    return (
        <>
            {tooltip}
            {(deletingRelation != null) && (
                <Dialog open={deletingRelation != null} onClose={handleCloseDeleteDialog}>
                    <DialogTitle>Delete relation?</DialogTitle>
                    <DialogContent>
                        <DialogContentText>
                            Are you sure to delete the relation {"'"}{deletingRelation.relationModel.relationName}{"'"} ?
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDeleteDialog}>Cancel</Button>
                        <Button variant="contained" color="error"
                            onClick={event => handleDeleteRelation(event, deletingRelation)}>Delete</Button>
                    </DialogActions>
                </Dialog>
            )}
        </>
    );
};

const useRelationTooltip = (
    relationViews: RelationViewModel[], rectangleMap: Map<string, RectangleViewModel>,
    clickedPosition: Point, onEditAction: (editAction: EditAction) => void,
    setDeletingRelation: (relation: RelationViewModel | null) => void
) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);
    const { scaleState } = React.useContext(ViewportContext);
    const displayScale = scaleState.scale;
    const { toolbarCanvasElement } = React.useContext(PortalCanvasContext);

    const [lineEditElement, setLineEditElement] = React.useState<HTMLElement | null>(null);
    const [resetLabelElement, setResetLabelElement] = React.useState<HTMLElement | null>(null);

    if (
        (selectState.relationId == null)
        || (selectState.edgeType == null)
        || (editMode !== EditModeType.SELECT)
        || (dragState.status === "on_dragging")
    ) {
        return (<></>);
    }

    const relationView = relationViews.find(relation => relation.relationId === selectState.relationId);
    if (relationView == null) {
        return (<></>);
    }

    const handleSetColor = (background: ColorValue) => {
        const loggingMessage = `Update relation color. ${JSON.stringify({
            relationId: relationView.relationId,
            before: relationView.lineViewModel.color.toHex(),
            after: background.toHex()
        })}`;
        documentsHolder.updateRelationColor(relationView.relationId, background, loggingMessage);

        dispatchSelectAction(RELEASE_ACTION);
    };

    const handleOpenEditDialog = (event: React.MouseEvent, relationView: RelationViewModel) => {
        if (editMode !== EditModeType.SELECT) {
            return;
        }

        event.stopPropagation();

        const relationModel: RelationModel = relationView.relationModel;
        const erdDocument: ErdDocument = documentsHolder.current();

        const parentTable = erdDocument.findTableViewModel(relationModel.parentTableModelId);
        if (parentTable == null) {
            console.error("Not found the parent tableViewModel. "
                + `relationId = ${relationView.relationId}, tableId = ${relationModel.parentTableModelId}`);
            return;
        }
        const childTable = erdDocument.findTableViewModel(relationModel.childTableModelId);
        if (childTable == null) {
            console.error("Not found the child tableViewModel. "
                + `relationId = ${relationView.relationId}, tableId = ${relationModel.childTableModelId}`);
            return;
        }

        onEditAction({
            editType: "relation",
            relationViewModel: relationView,
            parentTable: parentTable.tableModel,
            childTable: childTable.tableModel
        });
        dispatchSelectAction(RELEASE_ACTION);
    };

    const initLinePopover = (element: HTMLElement | null) => {
        if (element == null) {
            return null;
        }

        const handleClose = () => {
            setLineEditElement(null);
            dispatchSelectAction(RELEASE_ACTION);
        };

        const lineView = relationView.lineViewModel;
        const widthButtons = [1, 2, 3].map((width, index) => {
            const handleClick = () => {
                const loggingMessage = `Update relation line width. ${JSON.stringify({
                    relationId: relationView.relationId,
                    before: lineView.strokeWidth,
                    after: width
                })}`;
                documentsHolder.updateRelationWidth(relationView.relationId, width, loggingMessage);

                handleClose();
            };

            return (
                <IconButton key={`relation-line-width_${index}`}
                    color={(lineView.strokeWidth === width) ? "primary" : "default"}
                    onClick={handleClick}>
                    <LineWidthIcon width={width * 1.5} />
                </IconButton>
            );
        });

        const relationModel = relationView.relationModel;

        const handleLineStraight = () => {
            if ((lineView.lineType === "straight") ||
                (relationModel.parentTableModelId === relationModel.childTableModelId)) {
                return;
            }

            const updateArg = { relationId: relationView.relationId, orthogonalLines: [], changedIndex: 0 };
            documentsHolder.updateRelationOrthogonal([updateArg]);

            handleClose();
        };

        const handleLineOrthogonal = () => {
            if (lineView.lineType === "orthogonal") {
                return;
            }

            const orthogonalLines = initOrthogonalLine(relationView, rectangleMap);
            const updateArg = { relationId: relationView.relationId, orthogonalLines, changedIndex: 0 };
            documentsHolder.updateRelationOrthogonal([updateArg]);

            handleClose();
        };

        return (
            <Popover open={Boolean(element)} anchorEl={element}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                transformOrigin={{ vertical: 'top', horizontal: 'center' }}
                onClose={handleClose}>
                <Stack direction="column" divider={<Divider flexItem />}
                    sx={{ alignItems: "center", justifyContent: "flex-start" }}>
                    <Stack direction="row" sx={{ alignItems: "center" }}>{widthButtons}</Stack>
                    <Stack direction="row" sx={{ alignItems: "center" }}>
                        <IconButton color={(lineView.lineType === "straight") ? "primary" : "default"}
                            disabled={relationModel.parentTableModelId === relationModel.childTableModelId}
                            onClick={handleLineStraight}>
                            <LineStraightIcon />
                        </IconButton>
                        <IconButton color={(lineView.lineType === "orthogonal") ? "primary" : "default"}
                            onClick={handleLineOrthogonal}>
                            <LineOrthogonalIcon />
                        </IconButton>
                    </Stack>
                </Stack>
            </Popover>
        );
    };

    const initLabelPopover = (element: HTMLElement | null) => {
        if (element == null) {
            return null;
        }

        const handleClose = () => {
            setResetLabelElement(null);
            dispatchSelectAction(RELEASE_ACTION);
        };

        const handleResetLabel = () => {
            const relationModel = relationView.relationModel;
            const nextLabelModel = new LabelViewModel({ label: relationModel.relationName })
            const nextRelationView = new RelationViewModel({
                ...relationView,
                labelViewModel: nextLabelModel
            });

            const loggingMessage = `Reset relation label. relationId = ${relationView.relationId}`
            documentsHolder.updateRelation(nextRelationView, loggingMessage);

            handleClose();
        };

        return (
            <Popover open={Boolean(element)} anchorEl={element}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                onClose={handleClose}>
                <Button variant="text" sx={{ padding: "8px" }} onClick={handleResetLabel}>Reset label</Button>
            </Popover>
        );
    };

    const tooltipStyle: React.CSSProperties = {
        position: "absolute",
        left: clickedPosition.x + 15,
        top: clickedPosition.y - 45,
        backgroundColor: "#FFFFFF",
        pointerEvents: "auto",
        transformOrigin: "top left",
        transform: `scale(${1 / displayScale})`,
    };

    if (!toolbarCanvasElement) {
        return (<></>);
    }

    const erdDocument = documentsHolder.current();
    const erdSetting = erdDocument.erdSettingModel;

    return ReactDOM.createPortal((
        <ButtonGroup key={`relation-line_${relationView.relationId}_tooltip`}
            variant="contained" size="small" sx={tooltipStyle} onClick={handlePreventMouseEvent}
            onMouseDown={handlePreventMouseEvent} onMouseUp={handlePreventMouseEvent}>
            <ColorSelector key={`relation-color-selector_${relationView.relationId}`}
                color={relationView.lineViewModel.color}
                callback={handleSetColor} />
            <Tooltip title="Edit style" placement="top-end">
                <IconButton onClick={event => setLineEditElement(event.currentTarget)}>
                    <LineSelectorIcon />
                </IconButton>
            </Tooltip>
            <Tooltip title="Edit relation" placement="top-end">
                <IconButton onClick={event => handleOpenEditDialog(event, relationView)}>
                    <EditIcon />
                </IconButton>
            </Tooltip>
            {erdSetting.showRelationNames && (
                <Tooltip title="Reset label" placement="top-end">
                    <IconButton onClick={event => setResetLabelElement(event.currentTarget)}>
                        <TextFormatIcon />
                    </IconButton>
                </Tooltip>
            )}
            <Tooltip title="Delete relation" placement="top-end">
                <IconButton onClick={() => setDeletingRelation(relationView)}>
                    <DeleteIcon />
                </IconButton>
            </Tooltip>
            {initLinePopover(lineEditElement)}
            {initLabelPopover(resetLabelElement)}
        </ButtonGroup >
    ), toolbarCanvasElement);
};

type LineDragging = {
    on_dragging: true,
    majorChanging: boolean
} | { on_dragging: false };

type Point = { x: number, y: number };

const useStraightLineView = (
    relationViews: RelationViewModel[], rectangleMap: Map<string, RectangleViewModel>,
    setClickedPosition: (position: Point) => void,
    handleOpenEditDialog: (event: React.MouseEvent, relationView: RelationViewModel) => void,
    onDragAction: (dragAction: DragAction) => void
) => {

    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { viewport } = React.useContext(ViewportContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);

    const [lineDragging, setLineDragging] = React.useState<LineDragging>({ on_dragging: false });

    const findTableRectangle = (tableId: string) => {
        const rectangle = rectangleMap.get(tableId);
        if (rectangle == null) {
            return null;
        }

        if ((dragState.status !== "on_dragging") || !selectState.tableIds.has(tableId)) {
            return rectangle;
        }

        return rectangle.move(dragState.delta());
    };

    const initDualPoints = (
        relationView: RelationViewModel, parentTable: RectangleViewModel, childTable: RectangleViewModel
    ) => {
        const edges = relationView.lineViewModel.edges;
        const baseDualPoints = (edges.length === 0)
            ? { parentDual: childTable.center, childDual: parentTable.center }
            : { parentDual: edges[0], childDual: edges[edges.length - 1] };

        const onDraggingParentDual = (selectState.edgeId === 0);
        const onDraggingChildDual = ((selectState.edgeType === "real") && (selectState.edgeId === edges.length - 1))
            || ((selectState.edgeType === "virtual") && (selectState.edgeId === edges.length));

        // 親テーブルもしくは子テーブルに最も近い Edge をドラッグ操作中である場合
        if (
            (selectState.relationId === relationView.relationId)
            && (dragState.status === "on_dragging")
            && (onDraggingParentDual || onDraggingChildDual)
        ) {
            const parentDual = onDraggingParentDual ? dragState.current : baseDualPoints.parentDual;
            const childDual = onDraggingChildDual ? dragState.current : baseDualPoints.childDual;

            return { parentDual, childDual };
        }

        const relationModel = relationView.relationModel;
        if ((edges.length === 0)
            || (selectState.tableIds.has(relationModel.parentTableModelId) == false)
            || (selectState.tableIds.has(relationModel.childTableModelId) == false)
            || (dragState.status !== "on_dragging")
        ) {
            return baseDualPoints;
        }

        // 親テーブルと子テーブルを同時にドラッグ移動している場合は、Edge もそれに合わせて移動させる
        const delta = dragState.delta();
        return {
            parentDual: {
                x: baseDualPoints.parentDual.x + delta.x,
                y: baseDualPoints.parentDual.y + delta.y
            },
            childDual: {
                x: baseDualPoints.childDual.x + delta.x,
                y: baseDualPoints.childDual.y + delta.y
            }
        };
    };

    const initLineSegmentInfo = (relationView: RelationViewModel) => {
        const relationModel: RelationModel = relationView.relationModel;

        const parentTable = findTableRectangle(relationModel.parentTableModelId);
        const childTable = findTableRectangle(relationModel.childTableModelId);
        if ((parentTable == null) || (childTable == null)) {
            return null;
        }

        const dualPoints = initDualPoints(relationView, parentTable, childTable);
        const { edge: parentEdge } = calculateRectangleEdge(parentTable, dualPoints.parentDual);
        const { edge: childEdge } = calculateRectangleEdge(childTable, dualPoints.childDual);
        const relationEdges = [parentEdge, ...relationView.lineViewModel.edges, childEdge];
        const relationLinePairs = relationEdges.slice(0, -1)
            .map((value, index) => [value, relationEdges[index + 1]]);

        const relationLineSegments = relationLinePairs.map((pair, index) => {
            const baseSvgPath: React.JSX.Element = initBaseSvgPath(relationView, index, pair);
            const drawingPoints: Point[] = initDrawingPoint(relationView, index, pair);

            return { baseSvgPath, drawingPoints };
        });

        const svgBasePaths = relationLineSegments.map(lineSegment => lineSegment.baseSvgPath);
        const svgEdges = initSvgEdges(relationView);
        const svgRemoveEdgePath = initSvgRemoveEdgePath(relationView, relationLinePairs);

        const svgPaths = (svgRemoveEdgePath != null)
            ? [...svgBasePaths, ...svgEdges, svgRemoveEdgePath] : [...svgBasePaths, ...svgEdges];

        const edgePoints = [parentEdge, ...relationLineSegments.flatMap(lineSegment => lineSegment.drawingPoints)];
        const drawingPath = toRoundedPath(edgePoints, 15);

        const labelEdges = [...relationEdges];
        if ((selectState.relationId === relationView.relationId)
            && (dragState.status === "on_dragging")
            && (selectState.edgeId != null)
        ) {
            if (selectState.edgeType === "real") {
                const edgeIndex = selectState.edgeId + 1;
                if (edgeIndex >= 0 && edgeIndex < labelEdges.length) {
                    labelEdges[edgeIndex] = dragState.current;
                }
            } else if ((selectState.edgeType === "virtual")
                && lineDragging.on_dragging && lineDragging.majorChanging
            ) {
                const insertIndex = selectState.edgeId + 1;
                labelEdges.splice(insertIndex, 0, dragState.current);
            }
        }

        return { svgPaths, drawingPath, labelEdges };
    };

    const doHandleDragEnd = (event: React.MouseEvent | MouseEvent) => {
        const mousePosition = viewport.getLogicalPosition(event);
        setClickedPosition(mousePosition);

        setLineDragging({ on_dragging: false });
        onDragAction({ type: "clear" });
    };

    // 操作対象の元となる線分 (透過) を作成する
    const initBaseSvgPath = (relationView: RelationViewModel, index: number, pair: Point[]) => {
        if (editMode !== EditModeType.SELECT) {
            return (<></>);
        }

        const handleDragStart = (event: React.MouseEvent) => {
            // 左クリック以外は無視
            if (event.button !== 0) {
                return;
            }

            event.stopPropagation();

            const mousePosition = viewport.getLogicalPosition(event);

            dispatchSelectAction({
                type: "edge",
                relationId: relationView.relationId,
                lineType: "virtual",
                edgeId: index
            });
            onDragAction({ type: "start_dragging", start: mousePosition });

            const handleDragEndOverLine = (event: MouseEvent) => {
                window.removeEventListener("mouseup", handleDragEndOverLine);
                doHandleDragEnd(event);
            };
            window.addEventListener("mouseup", handleDragEndOverLine);
        };

        const initActiveDragModification = (majorChanging: boolean) => {
            return (event: React.MouseEvent) => {
                if (dragState.status === "none") {
                    return;
                }

                event.stopPropagation();

                if (
                    (selectState.relationId !== relationView.relationId)
                    || (selectState.edgeType === "real")
                    || (selectState.edgeId !== index)
                ) {
                    return;
                }

                setLineDragging({ on_dragging: true, majorChanging });
            };
        };

        // 元の線分上でドラッグを終えた場合の制御 (Canvas に伝搬させないようにする)
        const handleDragEndOnLine = (event: React.MouseEvent) => {
            // 左クリック以外は無視
            if (event.button !== 0) {
                return;
            }

            event.stopPropagation();
            doHandleDragEnd(event);
        };

        const handleDoubleClick = (event: React.MouseEvent) => {
            // 左クリック以外は無視
            if (event.button !== 0) {
                return;
            }

            handleOpenEditDialog(event, relationView)
        };

        const line = `M ${pair[0].x},${pair[0].y}`
            + ` L ${pair[1].x},${pair[1].y}`;

        return (
            <path key={`relation-line_${relationView.relationId}_path-${index}`}
                d={line} stroke="transparent" strokeWidth={15} fill="none"
                style={{ cursor: 'pointer', pointerEvents: "auto" }}
                onMouseDown={handleDragStart} onMouseUp={handleDragEndOnLine}
                onMouseEnter={initActiveDragModification(false)}
                onMouseLeave={initActiveDragModification(true)}
                onClick={handleClickIgnored} onDoubleClick={handleDoubleClick} />
        );
    };

    // ドラッグ中の状態を考慮したうえで、線分を描画する点を決定する
    const initDrawingPoint = (relationView: RelationViewModel, index: number, pair: Point[]) => {
        if (
            (selectState.relationId !== relationView.relationId)
            || (selectState.edgeId !== index)
            || (dragState.status !== "on_dragging")
        ) {
            // 親テーブルと子テーブルを同時にドラッグ移動している場合は、Edge もそれに合わせて移動させる
            const delta = (
                (selectState.tableIds.has(relationView.relationModel.parentTableModelId))
                && (selectState.tableIds.has(relationView.relationModel.childTableModelId))
                && (dragState.status === "on_dragging")
                && (index < relationView.lineViewModel.edges.length)
            ) ? dragState.delta() : { x: 0, y: 0 };

            return [{ x: pair[1].x + delta.x, y: pair[1].y + delta.y }];
        }

        if (selectState.edgeType === "real") {
            return [dragState.current];
        }

        // Edge 変更が有効な場所に移っていない場合は、元の線分を描画する
        if (!lineDragging.on_dragging || !lineDragging.majorChanging) {
            return [pair[1]];
        }

        return [dragState.current, pair[1]];
    };

    const initHandleDragEdgeStart = (relationId: string, index: number) => {
        return (event: React.MouseEvent) => {
            // 左クリック以外は無視
            if (event.button !== 0) {
                return;
            }

            event.stopPropagation();

            if (selectState.relationId !== relationId) {
                return;
            }

            const mousePosition = viewport.getLogicalPosition(event);

            dispatchSelectAction({
                type: "edge",
                relationId: relationId,
                lineType: "real",
                edgeId: index
            });
            onDragAction({ type: "start_dragging", start: mousePosition });
        };
    };

    // ドラッグ可能な Edge を描画する
    const initSvgEdges = (relationView: RelationViewModel) => {
        const edges = relationView.lineViewModel.edges;

        if ((selectState.relationId !== relationView.relationId) || (edges.length === 0)) {
            return [];
        }

        return edges.map((edge, index) => {
            const onDragging = (dragState.status === "on_dragging")
                && (selectState.edgeType === "real") && (selectState.edgeId === index);
            const currentEdge = onDragging ? dragState.current : edge;

            return (
                <rect key={`relation-line_${relationView.relationId}_edge-${index}`}
                    x={currentEdge.x - 5} y={currentEdge.y - 5}
                    width="10" height="10" fill={onDragging ? "black" : "white"} stroke="black"
                    className={initPathCss(relationView, onDragging) + " " + styleClasses.selectableSvg}
                    style={{ cursor: 'pointer', pointerEvents: "auto" }}
                    onMouseDown={initHandleDragEdgeStart(relationView.relationId, index)} />
            );
        });
    };

    // Edge を削除する制御
    const initSvgRemoveEdgePath = (relationView: RelationViewModel, relationLinePairs: Point[][]) => {
        if (
            (dragState.status !== "on_dragging")
            || (selectState.relationId !== relationView.relationId)
            || (relationLinePairs.length <= 1)
            || (selectState.edgeType !== "real")
            || (selectState.edgeId == null)
        ) {
            return null;
        }

        const parentEdge = relationLinePairs[selectState.edgeId][0];
        const childEdge = relationLinePairs[selectState.edgeId + 1][1];

        const deActiveLine = `M ${parentEdge.x},${parentEdge.y}`
            + ` L ${childEdge.x},${childEdge.y}`;

        const initActiveDragModification = (majorChanging: boolean) => {
            return (event: React.MouseEvent) => {
                event.stopPropagation();

                if (selectState.edgeId == null) {
                    return;
                }

                setLineDragging({ on_dragging: true, majorChanging });
            };
        };

        const handleDragEnd = (event: React.MouseEvent) => {
            // 左クリック以外は無視
            if (event.button !== 0) {
                return;
            }

            event.stopPropagation();

            if (
                (lineDragging.on_dragging == false)
                || (lineDragging.majorChanging == true)
                || (selectState.edgeId == null)
                || (selectState.edgeType !== "real")
            ) {
                return;
            }

            documentsHolder.deleteRelationEdge(relationView.relationId, selectState.edgeId);

            setLineDragging({ on_dragging: false });
            onDragAction({ type: "clear" });
        };

        return (
            <path key={`relation-line_${relationView.relationId}_deActive-line`}
                d={deActiveLine} stroke="transparent" strokeWidth={15} fill="none"
                className={styleClasses.inactiveDraggedSvg} style={{ pointerEvents: "auto" }}
                onMouseEnter={initActiveDragModification(false)}
                onMouseLeave={initActiveDragModification(true)}
                onMouseUp={handleDragEnd} />
        );
    };

    const initPathCss = (relationView: RelationViewModel, selected: boolean) => {
        if (!selected) {
            return "";
        }

        if (
            lineDragging.on_dragging
            && (selectState.relationId === relationView.relationId)
            && !lineDragging.majorChanging
        ) {
            return styleClasses.inactiveDraggedSvg;
        }

        return styleClasses.selectedSvg;
    };

    return relationViews.map(relationView => {
        // 対象が直線描画のもののみに絞り込む
        if (relationView.lineViewModel.lineType !== "straight") {
            return null;
        }

        const lineSegment = initLineSegmentInfo(relationView);
        if (lineSegment == null) {
            return null;
        }

        const relationModel = relationView.relationModel;
        const lineViewModel = relationView.lineViewModel;
        const parentMarker = toMarkerId(relationModel.parentCardinality);
        const childMarker = toMarkerId(relationModel.childCardinality);
        const selected = (selectState.relationId === relationView.relationId);
        const cssClassName = `${ERD_RELATION_PATH_CLASS_NAME} ${initPathCss(relationView, selected)}`;

        return {
            tableIds: [relationModel.parentTableModelId, relationModel.childTableModelId],
            path: (
                <g key={`relation-line_${relationView.relationId}`}
                    data-erd-relation-parent-table-id={relationModel.parentTableModelId}
                    data-erd-relation-child-table-id={relationModel.childTableModelId}>
                    <path d={lineSegment.drawingPath} className={cssClassName} fill="none"
                        stroke={lineViewModel.color.toRgba()} strokeWidth={lineViewModel.strokeWidth}
                        markerStart={parentMarker} markerEnd={childMarker} />
                    {lineSegment.svgPaths}
                </g>
            ),
            label: (
                <RelationLabelOverlay key={`relation-label_${relationView.relationId}`}
                    relationView={relationView} pathPoints={lineSegment.labelEdges} />
            )
        };
    }).filter(element => (element != null));
};

const initOrthogonalLine = (
    relationView: RelationViewModel, rectangleMap: Map<string, RectangleViewModel>
): { direction: "vertical" | "horizontal", position: number }[] => {

    const relationModel: RelationModel = relationView.relationModel;

    const parentTable = rectangleMap.get(relationModel.parentTableModelId);
    const childTable = rectangleMap.get(relationModel.childTableModelId);
    if ((parentTable == null) || (childTable == null)) {
        return [];
    }

    const parentCenter = parentTable.center;
    const childCenter = childTable.center;

    const { edge: parentEdge, position: parentPosition } = calculateRectangleEdge(parentTable, childCenter);
    const { edge: childEdge, position: childPosition } = calculateRectangleEdge(childTable, parentCenter);
    if ((parentPosition === "center") || (childPosition === "center")) {
        return [];
    }

    // 親->子 の方向が 横->縦 の場合
    if (((parentPosition === "left") || (parentPosition === "right"))
        && ((childPosition === "top") || (childPosition === "bottom"))) {
        return [
            { direction: "horizontal", position: parentCenter.y },
            { direction: "vertical", position: childCenter.x }
        ];
    }

    // 親->子 の方向が 縦->横 の場合
    if (((parentPosition === "top") || (parentPosition === "bottom"))
        && ((childPosition === "left") || (childPosition === "right"))) {
        return [
            { direction: "vertical", position: parentCenter.x },
            { direction: "horizontal", position: childCenter.y }
        ];
    };

    // 親->子 の方向が 横->縦->横 の場合
    if (((parentPosition === "left") || (parentPosition === "right"))
        && ((childPosition === "left") || (childPosition === "right"))) {

        if (Math.abs(parentCenter.y - childCenter.y) < ORTHOGONAL_THRESHOLD) {
            return [{ direction: "horizontal", position: parentCenter.y }];
        }

        return [
            { direction: "horizontal", position: parentCenter.y },
            { direction: "vertical", position: (parentEdge.x + childEdge.x) / 2 },
            { direction: "horizontal", position: childCenter.y }
        ];
    }

    // 親->子 の方向が 縦->横->縦 の場合
    if (((parentPosition === "top") || (parentPosition === "bottom"))
        && ((childPosition === "top") || (childPosition === "bottom"))) {

        if (Math.abs(parentCenter.x - childCenter.x) < ORTHOGONAL_THRESHOLD) {
            return [{ direction: "vertical", position: parentCenter.x }];
        }

        return [
            { direction: "vertical", position: parentCenter.x },
            { direction: "horizontal", position: (parentEdge.y + childEdge.y) / 2 },
            { direction: "vertical", position: childCenter.x }
        ];
    }

    // ここに到達することはない
    return [];
};

const useOrthogonalLine = (
    relationViews: RelationViewModel[], rectangleMap: Map<string, RectangleViewModel>,
    setClickedPosition: (position: { x: number, y: number }) => void,
    handleOpenEditDialog: (event: React.MouseEvent, relationView: RelationViewModel) => void,
    onDragAction: (dragAction: DragAction) => void
) => {

    const { viewport } = React.useContext(ViewportContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);

    const initPathCss = (selected: boolean, isReducedLine: boolean) => {
        if (!selected) {
            return ERD_RELATION_PATH_CLASS_NAME;
        }

        if (isReducedLine) {
            return `${ERD_RELATION_PATH_CLASS_NAME} ${styleClasses.inactiveDraggedSvg}`;
        }

        return `${ERD_RELATION_PATH_CLASS_NAME} ${styleClasses.selectedSvg}`;
    };

    const doHandleDragEnd = (event: React.MouseEvent | MouseEvent) => {
        const mousePosition = viewport.getLogicalPosition(event);
        setClickedPosition(mousePosition);

        onDragAction({ type: "clear" });
    };

    return relationViews.map(relationView => {
        // 対象が直線描画のもののみに絞り込む
        if (relationView.lineViewModel.lineType !== "orthogonal") {
            return null;
        }

        const relationModel: RelationModel = relationView.relationModel;

        const parentTable = rectangleMap.get(relationModel.parentTableModelId);
        const childTable = rectangleMap.get(relationModel.childTableModelId);
        if ((parentTable == null) || (childTable == null)) {
            return null;
        }

        const orthogonalLines = relationView.lineViewModel.orthogonalLines;
        if (orthogonalLines.length === 0) {
            return null;
        }

        const points = toOrthogonalPoints({ orthogonalLines, parentTable, childTable });
        const pointPairs = points.slice(0, -1).map((value, index) => [value, points[index + 1]]);

        const handlePaths = pointPairs.map((pair, index) => {
            if (editMode !== EditModeType.SELECT) {
                return (<></>);
            }

            const handleDragStart = (event: React.MouseEvent) => {
                // 左クリック以外は無視
                if (event.button !== 0) {
                    return;
                }

                event.stopPropagation();

                const mousePosition = viewport.getLogicalPosition(event);

                dispatchSelectAction({
                    type: "edge",
                    relationId: relationView.relationId,
                    lineType: "real",
                    edgeId: index
                });
                onDragAction({ type: "start_dragging", start: mousePosition });

                const handleDragEndOverLine = (event: MouseEvent) => {
                    window.removeEventListener("mouseup", handleDragEndOverLine);
                    doHandleDragEnd(event);
                };
                window.addEventListener("mouseup", handleDragEndOverLine);
            };

            const handleDragEndOnLine = (event: React.MouseEvent) => {
                // 左クリック以外は無視
                if (event.button !== 0) {
                    return;
                }

                event.stopPropagation();
                doHandleDragEnd(event);
            };

            const handleDoubleClick = (event: React.MouseEvent) => {
                // 左クリック以外は無視
                if (event.button !== 0) {
                    return;
                }

                handleOpenEditDialog(event, relationView)
            };

            const line = `M ${pair[0].x},${pair[0].y}`
                + ` L ${pair[1].x},${pair[1].y}`;

            return (
                <path key={`relation-line_${relationView.relationId}_path-${index}`}
                    d={line} stroke="transparent" strokeWidth={15} fill="none"
                    style={{ cursor: 'pointer', pointerEvents: "auto" }}
                    onMouseDown={handleDragStart} onMouseUp={handleDragEndOnLine}
                    onClick={handleClickIgnored} onDoubleClick={handleDoubleClick} />
            );
        });

        const { draggedPoints, isReducedLine } = toDraggedOrthogonalPoints(
            { relationView, points, parentTable, childTable, selectState, dragState }
        );
        const drawingLine = toRoundedPath(draggedPoints, 10);
        const selected = (selectState.relationId === relationView.relationId);

        return {
            tableIds: [relationModel.parentTableModelId, relationModel.childTableModelId],
            path: (
                <g key={`relation-line_${relationView.relationId}`}
                    data-erd-relation-parent-table-id={relationModel.parentTableModelId}
                    data-erd-relation-child-table-id={relationModel.childTableModelId}>
                    <path d={drawingLine} fill="none"
                        stroke={relationView.lineViewModel.color.toRgba()}
                        strokeWidth={relationView.lineViewModel.strokeWidth}
                        markerStart={toMarkerId(relationModel.parentCardinality)}
                        markerEnd={toMarkerId(relationModel.childCardinality)}
                        className={initPathCss(selected, isReducedLine)} />
                    {handlePaths}
                </g>
            ),
            label: (
                <RelationLabelOverlay key={`relation-label_${relationView.relationId}`}
                    relationView={relationView} pathPoints={draggedPoints} />
            )
        };
    }).filter(element => (element != null));
};

const calculateRectangleEdge = (rectangle: RectangleViewModel, dualPoint: Point) => {
    const center = rectangle.center;
    // x 座標が同一の場合 (直線の傾きがx軸に垂直になる場合は特別な演算を行う)
    if (center.x === dualPoint.x) {
        if (center.y === dualPoint.y) {
            return { edge: center, position: "center" };
        }

        const edge = { x: center.x, y: ((center.y > dualPoint.y) ? rectangle.top : rectangle.bottom) };
        const position = (center.y > dualPoint.y) ? "top" : "bottom";
        return { edge, position };
    }

    // y 座標が同一の場合 (直線の傾きがy軸に垂直になる場合は特別な演算を行う)
    if (center.y === dualPoint.y) {
        const edge = { x: ((center.x > dualPoint.x) ? rectangle.left : rectangle.right), y: center.y };
        const position = (center.x > dualPoint.x) ? "left" : "right";
        return { edge, position };
    }

    // 短形の中心と対抗点を結んだ直線の傾き
    const slopeOfEdges = (center.y - dualPoint.y) / (center.x - dualPoint.x);
    // 短形の対角線の傾き
    const slopeOfDiagonal = Math.sign(slopeOfEdges) * rectangle.height / rectangle.width;

    // 短形の中心と対抗点を結んだ線分が、短形と交わる点を算出するための計算式
    const calculateYPoint = (x: number) => (slopeOfEdges * (x - center.x) + center.y);
    const calculateXPoint = (y: number) => ((y - center.y) / slopeOfEdges + center.x);

    if ((slopeOfEdges - slopeOfDiagonal) * slopeOfEdges < 0) {
        const candidateX = (dualPoint.x > center.x) ? rectangle.right : rectangle.left;
        const edge = { x: candidateX, y: calculateYPoint(candidateX) };
        const position = (candidateX > center.x) ? "right" : "left";

        return { edge, position };
    }

    const candidateY = ((dualPoint.x - center.x) * slopeOfEdges > 0) ? rectangle.bottom : rectangle.top;
    const edge = { x: calculateXPoint(candidateY), y: candidateY };
    const position = (candidateY > center.y) ? "bottom" : "top";

    return { edge, position };
};

const handleClickIgnored = (event: React.MouseEvent) => {
    // 左クリック以外は無視
    if (event.button !== 0) {
        return;
    }

    event.stopPropagation();
};

export default ErdRelationPathView;
