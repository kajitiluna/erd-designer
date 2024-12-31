import React, { MouseEvent } from "react";

import { DRAWABLE_AREA } from "~/features/canvas/ErdCanvas";
import { handlePreventMouseEvent, toMarkerId } from "~/features/canvas/support";
import RelationModel from "~/models/database/RelationModel";
import LineViewModel from "~/models/LineViewModel";
import RectangleViewModel from "~/models/RectangleViewModel";
import RelationViewModel from "~/models/RelationViewModel";
import { RELEASE_ACTION, SelectEntityContext } from "~/context/SelectEntityContext";
import styleClasses from "./ErdCanvas.module.css";
import EditModeContext from "~/context/EditModeContext";
import { EditModeType } from "~/models/EditMode";
import { DragActionContext } from "~/context/DragActionContext";
import EditAction from "~/features/canvas/EditAction";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";

type ErdRelationPathOptions = {
    relationView: RelationViewModel,
    rectangleMap: Map<string, RectangleViewModel>
    onEditAction: (editAction: EditAction) => void
};

const ErdRelationPath = ({ relationView, rectangleMap, onEditAction }: ErdRelationPathOptions) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);

    const relationModel: RelationModel = relationView.relationModel;
    const baseParentTable = rectangleMap.get(relationModel.parentTableModelId);
    const baseChildTable = rectangleMap.get(relationModel.childTableModelId);
    if ((baseParentTable == null) || (baseChildTable == null)) {
        return;
    }

    const parentTable = (
        (dragState.status === "on_dragging")
        && (selectState.tableIds.has(relationModel.parentTableModelId))
    ) ? baseParentTable.move(dragState.delta()) : baseParentTable;

    const childTable = (
        (dragState.status === "on_dragging")
        && (selectState.tableIds.has(relationModel.childTableModelId))
    ) ? baseChildTable.move(dragState.delta()) : baseChildTable;

    const lineModel: LineViewModel = relationView.lineViewModel;

    const edges = lineModel.edges;
    // TODO 未決定 edge をドラッグ中の場合のパターン制御
    const dualPoints = (edges.length === 0)
        ? { parentDual: childTable.center, childDual: parentTable.center }
        : { parentDual: edges[0], childDual: edges[edges.length - 1] };

    const parentEdge = calculateRectangleEdge(parentTable, dualPoints.parentDual);
    const childEdge = calculateRectangleEdge(childTable, dualPoints.childDual);

    const parentMarker = toMarkerId(relationModel.parentCardinality);
    const childMarker = toMarkerId(relationModel.childCardinality);

    const svgPath = calcSvgPath(parentEdge, edges, childEdge);

    const selected = (selectState.relationId === relationView.relationId);

    const handleClickLine = (event: MouseEvent) => {
        if (editMode !== EditModeType.SELECT) {
            return
        }

        event.stopPropagation();

        dispatchSelectAction({ type: "relation", relationId: relationView.relationId });
    };

    const handleOpenEditDialog = (event: MouseEvent) => {
        if (editMode !== EditModeType.SELECT) {
            return;
        }

        event.stopPropagation();

        const erdDocument = documentsHolder.current();
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

    return (
        <g>
            {(editMode === EditModeType.SELECT) && (
                <path d={svgPath} stroke="transparent"
                    strokeWidth={15} fill="none" style={{ cursor: 'pointer' }}
                    onMouseDown={handlePreventMouseEvent} onMouseUp={handlePreventMouseEvent}
                    onClick={handleClickLine} onDoubleClick={handleOpenEditDialog} />
            )}
            <path d={svgPath} stroke="black" strokeWidth={lineModel.strokeWidth} fill="none"
                markerStart={parentMarker} markerEnd={childMarker}
                className={selected ? styleClasses.selectedSvg : ""} />
        </g>
    );
};

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
    // const slopeOfDiagonal = rectangle.getSlopeOfDiagonal(slopeOfEdges > 0);
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

const calcSvgPath = (parentEdge: Point, edges: Point[], childEdge: Point) => {
    const gapX = DRAWABLE_AREA.width / 2;
    const gapY = DRAWABLE_AREA.height / 2;

    const startPath = `M ${parentEdge.x + gapX},${parentEdge.y + gapY}`;
    const path = edges.map(edge => ` L ${edge.x + gapX},${edge.y + gapY}`).join("");
    const endPath = ` L ${childEdge.x + gapX},${childEdge.y + gapY}`;

    return `${startPath}${path}${endPath}`
};

export default ErdRelationPath;
