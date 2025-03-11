import React, { JSX, MouseEvent, useImperativeHandle } from "react";
import {
    Button, ButtonGroup, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    IconButton, Tooltip
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

import { DRAWABLE_AREA, getLogicalMousePosition, handlePreventMouseEvent, toMarkerId } from "~/features/canvas/support";
import RelationModel from "~/models/database/RelationModel";
import LineViewModel from "~/models/LineViewModel";
import RectangleViewModel from "~/models/RectangleViewModel";
import RelationViewModel from "~/models/RelationViewModel";
import { RELEASE_ACTION, SelectEntityContext } from "~/context/SelectEntityContext";
import EditModeContext from "~/context/EditModeContext";
import { EditModeType } from "~/models/EditMode";
import { DragAction, DragActionContext } from "~/context/DragActionContext";
import EditAction from "~/features/canvas/EditAction";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import DisplayScaleContext from "~/context/DisplayScaleContext";
import ErdDocument from "~/models/ErdDocument";
import styleClasses from "./ErdCanvas.module.css";

export type ErdRelationTooltipRef = {
    svgElements: () => JSX.Element[]
};

type ErdRelationPathViewProps = {
    relationViews: RelationViewModel[],
    rectangleMap: Map<string, RectangleViewModel>
    onEditAction: (editAction: EditAction) => void,
    onDragAction: (dragAction: DragAction) => void,
    ref: React.Ref<ErdRelationTooltipRef>
};

const ErdRelationPathView = ({ relationViews, rectangleMap, onEditAction, onDragAction, ref }: ErdRelationPathViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);
    const displayScale = React.useContext(DisplayScaleContext);

    const [clickedPosition, setClickedPosition] = React.useState<{ x: number, y: number }>({ x: 0, y: 0 });
    const [deletingRelation, setDeletingRelation] = React.useState<RelationViewModel | null>(null);
    const [lineDragging, setLineDragging] = React.useState<LineDragging>({ on_dragging: false });

    const handleOpenEditDialog = (event: MouseEvent, relationView: RelationViewModel) => {
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

    const initLineSegumentInfo = (relationView: RelationViewModel) => {

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

        const relationModel: RelationModel = relationView.relationModel;

        const parentTable = findTableRectangle(relationModel.parentTableModelId);
        const childTable = findTableRectangle(relationModel.childTableModelId);
        if ((parentTable == null) || (childTable == null)) {
            return null;
        }

        const lineModel: LineViewModel = relationView.lineViewModel;
        const edges = lineModel.edges;

        const initDualPoints = () => {
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

        const dualPoints = initDualPoints();

        const parentEdge = calculateRectangleEdge(parentTable, dualPoints.parentDual);
        const childEdge = calculateRectangleEdge(childTable, dualPoints.childDual);

        const relationEdges = [parentEdge, ...edges, childEdge];
        const relationLinePairs = relationEdges.slice(0, -1)
            .map((value, index) => [value, relationEdges[index + 1]]);

        const relationLineSeguments = relationLinePairs.map((pair, index) => {
            const baseSvgPath: JSX.Element = initBaseSvgPath(relationView, index, pair);
            const drawingLine: string = initDrawingLine(relationView, index, pair);

            return { baseSvgPath, drawingLine };
        });

        const svgBasePaths = relationLineSeguments.map(lineSegument => lineSegument.baseSvgPath);
        const svgEdges = initSvgEdges(relationView);
        const svgRemoveEdgePath = initSvgRemoveEdgePath(relationView, relationLinePairs);

        const svgPaths = (svgRemoveEdgePath != null)
            ? [...svgBasePaths, ...svgEdges, svgRemoveEdgePath] : [...svgBasePaths, ...svgEdges];

        const drawingPath = `M ${parentEdge.x + DRAWABLE_AREA.width / 2},${parentEdge.y + DRAWABLE_AREA.height / 2}`
            + relationLineSeguments.map(lineSegument => lineSegument.drawingLine).join(" ");

        return { svgPaths, drawingPath };
    };

    // 操作対象の元となる線分を作成する
    const initBaseSvgPath = (relationView: RelationViewModel, index: number, pair: Point[]) => {
        if (editMode !== EditModeType.SELECT) {
            return (<></>);
        }

        const handleDragStart = (event: MouseEvent) => {
            if (editMode !== EditModeType.SELECT) {
                return
            }

            event.stopPropagation();

            const mousePosition = getLogicalMousePosition(event, displayScale);

            dispatchSelectAction({
                type: "edge",
                relationId: relationView.relationId,
                lineType: "virtual",
                edgeId: index
            });
            onDragAction({ type: "start_dragging", start: mousePosition });
        };

        const initActiveDragModification = (majorChanging: boolean) => {
            return (event: MouseEvent) => {
                if (dragState.status === "none") {
                    return;
                }

                event.stopPropagation();

                if ((selectState.relationId !== relationView.relationId)
                    || (selectState.edgeType === "real") || (selectState.edgeId !== index)) {
                    return;
                }

                setLineDragging({ on_dragging: true, majorChanging });
            };
        };

        const handleDragEnd = (event: MouseEvent) => {
            event.stopPropagation();

            const mousePosition = getLogicalMousePosition(event, displayScale);
            setClickedPosition(mousePosition);

            setLineDragging({ on_dragging: false });
            onDragAction({ type: "clear" });
        };

        const line = `M ${pair[0].x + DRAWABLE_AREA.width / 2},${pair[0].y + DRAWABLE_AREA.height / 2}`
            + ` L ${pair[1].x + DRAWABLE_AREA.width / 2},${pair[1].y + DRAWABLE_AREA.height / 2}`;

        return (
            <path key={`relation-line_${relationView.relationId}_path-${index}`}
                d={line} stroke="transparent" strokeWidth={15} fill="none"
                style={{ cursor: 'pointer', pointerEvents: "auto" }}
                onMouseDown={handleDragStart} onMouseUp={handleDragEnd}
                onMouseEnter={initActiveDragModification(false)}
                onMouseLeave={initActiveDragModification(true)}
                onClick={event => event.stopPropagation()}
                onDoubleClick={event => handleOpenEditDialog(event, relationView)} />
        );
    };

    // ドラッグ中の状態を考慮したうえで、線分を描画する
    const initDrawingLine = (relationView: RelationViewModel, index: number, pair: Point[]) => {
        if ((selectState.relationId !== relationView.relationId)
            || (selectState.edgeId !== index) || (dragState.status !== "on_dragging")) {

            // 親テーブルと子テーブルを同時にドラッグ移動している場合は、Edge もそれに合わせて移動させる
            const delta = (
                (selectState.tableIds.has(relationView.relationModel.parentTableModelId))
                && (selectState.tableIds.has(relationView.relationModel.childTableModelId))
                && (dragState.status === "on_dragging") && (index < relationView.lineViewModel.edges.length)
            ) ? dragState.delta() : { x: 0, y: 0 };

            return `L ${pair[1].x + delta.x + DRAWABLE_AREA.width / 2},${pair[1].y + delta.y + DRAWABLE_AREA.height / 2}`;
        }

        if (selectState.edgeType === "real") {
            return `L ${dragState.current.x + DRAWABLE_AREA.width / 2},${dragState.current.y + DRAWABLE_AREA.height / 2}`;
        }

        // Edge 変更が有効な場所に移っていない場合は、元の線分を描画する
        if (!lineDragging.on_dragging || !lineDragging.majorChanging) {
            return `L ${pair[1].x + DRAWABLE_AREA.width / 2},${pair[1].y + DRAWABLE_AREA.height / 2}`;
        }

        return `L ${dragState.current.x + DRAWABLE_AREA.width / 2},${dragState.current.y + DRAWABLE_AREA.height / 2}`
            + ` L ${pair[1].x + DRAWABLE_AREA.width / 2},${pair[1].y + DRAWABLE_AREA.height / 2}`;
    };

    // ドラッグ可能な Edge を描画する
    const initSvgEdges = (relationView: RelationViewModel) => {
        const edges = relationView.lineViewModel.edges;

        if ((selectState.relationId !== relationView.relationId) || (edges.length === 0)) {
            return [];
        }

        const initHandleDragStart = (index: number) => {
            return (event: MouseEvent) => {
                event.stopPropagation();

                if (selectState.relationId !== relationView.relationId) {
                    return;
                }

                const mousePosition = getLogicalMousePosition(event, displayScale);

                dispatchSelectAction({
                    type: "edge",
                    relationId: relationView.relationId,
                    lineType: "real",
                    edgeId: index
                });
                onDragAction({ type: "start_dragging", start: mousePosition });
            };
        };

        return edges.map((edge, index) => {
            const onDragging = (dragState.status === "on_dragging")
                && (selectState.edgeType === "real") && (selectState.edgeId === index);
            const currentEdge = onDragging ? dragState.current : edge;

            return (
                <rect key={`relation-line_${relationView.relationId}_edge-${index}`}
                    x={currentEdge.x - 5 + DRAWABLE_AREA.width / 2} y={currentEdge.y - 5 + DRAWABLE_AREA.height / 2}
                    width="10" height="10" fill={onDragging ? "black" : "white"} stroke="black"
                    className={initPathCss(relationView, onDragging) + " " + styleClasses.selectableSvg}
                    style={{ cursor: 'pointer', pointerEvents: "auto" }}
                    onMouseDown={initHandleDragStart(index)} />
            )
        });
    };

    // Edge を削除する制御
    const initSvgRemoveEdgePath = (relationView: RelationViewModel, relationLinePairs: Point[][]) => {
        if ((dragState.status !== "on_dragging")
            || (selectState.relationId !== relationView.relationId) || (relationLinePairs.length <= 1)
            || (selectState.edgeType !== "real") || (selectState.edgeId == null)) {
            return null;
        }

        const parentEdge = relationLinePairs[selectState.edgeId][0];
        const childEdge = relationLinePairs[selectState.edgeId + 1][1];

        const deactiveLine = `M ${parentEdge.x + DRAWABLE_AREA.width / 2},${parentEdge.y + DRAWABLE_AREA.height / 2}`
            + ` L ${childEdge.x + DRAWABLE_AREA.width / 2},${childEdge.y + DRAWABLE_AREA.height / 2}`;

        const initActiveDragModification = (majorChanging: boolean) => {
            return (event: MouseEvent) => {
                event.stopPropagation();

                if (selectState.edgeId == null) {
                    return;
                }

                setLineDragging({ on_dragging: true, majorChanging });
            };
        };

        const handleDragEnd = (event: MouseEvent) => {
            event.stopPropagation();

            if ((lineDragging.on_dragging == false) || (lineDragging.majorChanging == true)
                || (selectState.edgeId == null) || (selectState.edgeType !== "real")) {
                return;
            }

            documentsHolder.deleteRelationEdge(relationView.relationId, selectState.edgeId);

            setLineDragging({ on_dragging: false });
            onDragAction({ type: "clear" });
        };

        return (
            <path key={`relation-line_${relationView.relationId}_deactive-line`}
                d={deactiveLine} stroke="transparent" strokeWidth={15} fill="none"
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

        if (lineDragging.on_dragging && (selectState.relationId === relationView.relationId)
            && !lineDragging.majorChanging) {
            return styleClasses.inactiveDraggedSvg;
        }

        return styleClasses.selectedSvg;
    };

    const elements = relationViews.map(relationView => {
        const lineSegument = initLineSegumentInfo(relationView);
        if (lineSegument == null) {
            return null;
        }

        const relationModel: RelationModel = relationView.relationModel;
        const parentMarker = toMarkerId(relationModel.parentCardinality);
        const childMarker = toMarkerId(relationModel.childCardinality);
        const selected = (selectState.relationId === relationView.relationId);

        const tooltip = (
            !selected || (editMode !== EditModeType.SELECT) || (dragState.status === "on_dragging")
        ) ? null : (
            <ButtonGroup variant="contained" size="small"
                onMouseDown={handlePreventMouseEvent} onMouseUp={handlePreventMouseEvent}
                sx={{
                    position: "absolute",
                    left: clickedPosition.x + 15 + DRAWABLE_AREA.width / 2,
                    top: clickedPosition.y - 45 + DRAWABLE_AREA.height / 2,
                    backgroundColor: "#FFFFFF"
                }}>
                <Tooltip title="Edit relation" placement="top-end">
                    <IconButton onClick={event => handleOpenEditDialog(event, relationView)}>
                        <EditIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Delete relation" placement="top-end">
                    <IconButton onClick={() => setDeletingRelation(relationView)}>
                        <DeleteIcon />
                    </IconButton>
                </Tooltip>
            </ButtonGroup >
        );

        return {
            svgElement: (
                <g key={`relation-line_${relationView.relationId}`}>
                    <path d={lineSegument.drawingPath} stroke="black" fill="none"
                        strokeWidth={relationView.lineViewModel.strokeWidth}
                        markerStart={parentMarker} markerEnd={childMarker}
                        className={initPathCss(relationView, selected)} />
                    {lineSegument.svgPaths}
                </g>
            ),
            tooltip: tooltip
        };
    }).filter(element => element != null);

    useImperativeHandle(ref, () => {
        return {
            svgElements: () => elements.map(element => element.svgElement)
        };
    }, [elements]);

    const handleDeleteRelation = (event: MouseEvent, relationView: RelationViewModel) => {
        event.stopPropagation();

        documentsHolder.deleteRelation(relationView.relationId);
        setDeletingRelation(null);
    };

    const handleCloseDeleteDialog = (event: MouseEvent) => {
        event.stopPropagation();
        setDeletingRelation(null);
    };

    return (
        <>
            {elements.find(element => element.tooltip != null)?.tooltip}
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

type LineDragging = {
    on_dragging: true,
    majorChanging: boolean
} | { on_dragging: false };

type Point = { x: number, y: number };

const calculateRectangleEdge = (rectangle: RectangleViewModel, dualPoint: Point) => {
    const center = rectangle.center;
    // x 座標が同一の場合 (直線の傾きがx軸に垂直になる場合は特別な演算を行う)
    if (center.x === dualPoint.x) {
        if (center.y === dualPoint.y) {
            return center;
        }

        return { x: center.x, y: ((center.y > dualPoint.y) ? rectangle.top : rectangle.bottom) };
    }

    // y 座標が同一の場合 (直線の傾きがy軸に垂直になる場合は特別な演算を行う)
    if (center.y === dualPoint.y) {
        return { x: ((center.x > dualPoint.x) ? rectangle.left : rectangle.right), y: center.y };
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
        return { x: candidateX, y: calculateYPoint(candidateX) };
    }

    const candidateY = ((dualPoint.x - center.x) * slopeOfEdges > 0) ? rectangle.bottom : rectangle.top;
    return { x: calculateXPoint(candidateY), y: candidateY };
};

export default ErdRelationPathView;
