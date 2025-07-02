import { MouseEvent } from "react";
import { DragState } from "~/context/DragActionContext";
import { SelectState } from "~/context/SelectEntityContext";

import { CardinalityType } from "~/models/database";
import { OrthogonalDirection } from "~/models/LineViewModel";
import RectangleViewModel from "~/models/RectangleViewModel";
import RelationViewModel from "~/models/RelationViewModel";

export const CANVAS_AREA = { width: 25000, height: 25000 } as const;
// 描画領域は CANVAS_AREA を下に、最大拡大率を表示しうるサイズにする
export const DRAWABLE_AREA = { width: CANVAS_AREA.width * 2, height: CANVAS_AREA.height * 2 } as const;

/**
 * displayScale の表示拡大率を無視した、論理的な点座標を取得する。
 * なお、論理的な点座標とは、キャンバス中央を (0, 0) とした座標を指す。
 * 
 * @param event マウスイベント
 * @param displayScale 表示拡大率
 * @returns 
 */
export const getLogicalMousePosition = (event: MouseEvent, displayScale: number) => {
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

export const handlePreventMouseEvent = (event: React.MouseEvent) => event.stopPropagation();

/**
 * shift, ctrl, command キーいずれかが押下されているかを判定する。
 * 
 * @param event マウスイベント
 * @returns 複数選択許可時は true
 */
export const withMultiSelectKey = (event: React.MouseEvent): boolean => {
    return (event.shiftKey || event.ctrlKey || event.metaKey) ? true : false;
};

export const CARDINALITY_MARKER = {
    ONE: "cardinality_one",
    NONE_TO_ONE: "cardinality_none_to_one",
    NONE_TO_MANY: "cardinality_none_to_many",
    ONE_TO_MANY: "cardinality_one_to_many"
} as const;

const cardinalityMapping = {
    "1": CARDINALITY_MARKER.ONE,
    "0..1": CARDINALITY_MARKER.NONE_TO_ONE,
    "0..N": CARDINALITY_MARKER.NONE_TO_MANY,
    "1..N": CARDINALITY_MARKER.ONE_TO_MANY
};

export const toMarkerId = (cardinality: CardinalityType) => `url(#${cardinalityMapping[cardinality]})`;

type ToOrthogonalPointsArgs = {
    orthogonalLines: OrthogonalDirection[],
    parentTable: RectangleViewModel,
    childTable: RectangleViewModel
};

type Point = { x: number, y: number };

export const toOrthogonalPoints = (
    { orthogonalLines, parentTable, childTable }: ToOrthogonalPointsArgs
): Point[] => {

    const points = orthogonalLines.map((line, index) => {
        // 始点の個別制御
        if (index === 0) {
            if (line.direction === "horizontal") {
                const xDirection = (orthogonalLines.length > 1) ? orthogonalLines[1].position : childTable.center.x;
                const startX = (xDirection > parentTable.center.x) ? parentTable.right : parentTable.left;
                return { x: startX, y: line.position };
            }

            const yDirection = (orthogonalLines.length > 1) ? orthogonalLines[1].position : childTable.center.y;
            const startY = (yDirection > parentTable.center.y) ? parentTable.bottom : parentTable.top;

            return { x: line.position, y: startY };
        }

        if (line.direction === "horizontal") {
            const startX = orthogonalLines[index - 1].position;
            return { x: startX, y: line.position };
        }

        const startY = orthogonalLines[index - 1].position;
        return { x: line.position, y: startY };
    });

    // 終点の個別制御
    const lastPoint = (() => {
        const lastIndex = orthogonalLines.length - 1;
        if (orthogonalLines[lastIndex].direction === "horizontal") {
            const xDirection = (orthogonalLines.length > 1) ? orthogonalLines[lastIndex - 1].position : parentTable.center.x;
            const endX = (xDirection > childTable.center.x) ? childTable.right : childTable.left;
            return { x: endX, y: orthogonalLines[lastIndex].position };
        }

        const yDirection = (orthogonalLines.length > 1) ? orthogonalLines[lastIndex - 1].position : parentTable.center.y;
        const endY = (yDirection > childTable.center.y) ? childTable.bottom : childTable.top;
        return { x: orthogonalLines[lastIndex].position, y: endY };
    })();

    points.push(lastPoint);

    return points;
};

type ToDraggedOrthogonalPointsArgs = {
    relationView: RelationViewModel,
    points: Point[],
    parentTable: RectangleViewModel,
    childTable: RectangleViewModel,
    selectState: SelectState,
    dragState: DragState
};

export const toDraggedOrthogonalPoints = ({
    relationView, points, parentTable, childTable, selectState, dragState
}: ToDraggedOrthogonalPointsArgs): { draggedPoints: Point[], isReducedLine: boolean } => {
    let isReducedLine: boolean = false;

    const draggedPoints = points
        .map((point, index) => {
            if ((dragState.status !== "on_dragging")) {
                return [point];
            }

            if ((selectState.relationId !== relationView.relationId)
                || ((selectState.edgeId !== index) && (selectState.edgeId !== index - 1)
                    && (selectState.edgeId !== index + 1) && (selectState.edgeId !== index - 2))
            ) {
                const relationModel = relationView.relationModel;
                const parentSelected = selectState.tableIds.has(relationModel.parentTableModelId);
                const childSelected = selectState.tableIds.has(relationModel.childTableModelId);

                // 親テーブルと子テーブルを同時にドラッグ移動している場合は、Edge もそれに合わせて移動させる
                if (parentSelected && childSelected) {
                    const delta = dragState.delta();
                    return [{ x: point.x + delta.x, y: point.y + delta.y }];
                }

                // 親テーブルがドラッグ移動されている場合の制御
                if ((index === 0) && parentSelected) {
                    const draggingParentTable = parentTable.move(dragState.delta());
                    const direction = (points[1].x === point.x) ? "vertical" : "horizontal";

                    if (direction === "horizontal") {
                        if ((point.y < draggingParentTable.top) || (draggingParentTable.bottom < point.y)) {
                            const startY = (point.y < draggingParentTable.top)
                                ? draggingParentTable.top : draggingParentTable.bottom;
                            return [
                                { x: draggingParentTable.center.x, y: startY },
                                { x: draggingParentTable.center.x, y: point.y }
                            ];
                        }

                        const startX = (points[1].x < draggingParentTable.left)
                            ? draggingParentTable.left : draggingParentTable.right;
                        return [{ x: startX, y: point.y }];
                    }

                    if (direction === "vertical") {
                        if ((point.x < draggingParentTable.left) || (draggingParentTable.right < point.x)) {
                            const startX = (point.x < draggingParentTable.left)
                                ? draggingParentTable.left : draggingParentTable.right;
                            return [
                                { x: startX, y: draggingParentTable.center.y },
                                { x: point.x, y: draggingParentTable.center.y }
                            ];
                        }

                        const startY = (points[1].y < draggingParentTable.top)
                            ? draggingParentTable.top : draggingParentTable.bottom;
                        return [{ x: point.x, y: startY }];
                    }
                }

                // 子テーブルがドラッグ移動されている場合の制御
                if ((index === points.length - 1) && childSelected) {
                    const draggingChildTable = childTable.move(dragState.delta());
                    const direction = (points[points.length - 2].x === point.x) ? "vertical" : "horizontal";

                    if (direction === "horizontal") {
                        if ((point.y < draggingChildTable.top) || (draggingChildTable.bottom < point.y)) {
                            const endY = (point.y < draggingChildTable.top)
                                ? draggingChildTable.top : draggingChildTable.bottom;
                            return [
                                { x: draggingChildTable.center.x, y: point.y },
                                { x: draggingChildTable.center.x, y: endY }
                            ];
                        }

                        const endX = (points[points.length - 2].x < draggingChildTable.left)
                            ? draggingChildTable.left : draggingChildTable.right;
                        return [{ x: endX, y: point.y }];
                    }

                    if (direction === "vertical") {
                        if ((point.x < draggingChildTable.left) || (draggingChildTable.right < point.x)) {
                            const endX = (point.x < draggingChildTable.left)
                                ? draggingChildTable.left : draggingChildTable.right;
                            return [
                                { x: point.x, y: draggingChildTable.center.y },
                                { x: endX, y: draggingChildTable.center.y }
                            ];
                        }

                        const endY = (points[points.length - 2].y < draggingChildTable.top)
                            ? draggingChildTable.top : draggingChildTable.bottom;
                        return [{ x: point.x, y: endY }];
                    }
                }

                return [point];
            }

            const direction = (points[selectState.edgeId].x === points[selectState.edgeId + 1].x)
                ? "vertical" : "horizontal";

            // 親テーブルに直接紐づく線分が選択されている場合
            if ((index === 0) && (selectState.edgeId === 0)) {
                if ((direction === "horizontal")
                    && ((parentTable.top > dragState.current.y) || (dragState.current.y > parentTable.bottom))
                ) {
                    const startY = (parentTable.top > dragState.current.y) ? parentTable.top : parentTable.bottom;
                    return [
                        { x: parentTable.center.x, y: startY },
                        { x: parentTable.center.x, y: dragState.current.y }
                    ];
                }
                if ((direction === "vertical")
                    && ((parentTable.left > dragState.current.x) || (dragState.current.x > parentTable.right))
                ) {
                    const startX = (parentTable.left > dragState.current.x) ? parentTable.left : parentTable.right;
                    return [
                        { x: startX, y: parentTable.center.y },
                        { x: dragState.current.x, y: parentTable.center.y }
                    ];
                }
            }

            // 親テーブルのひとつ先に紐づく線分がドラッグされて、直接紐づく線分の情報を更新する場合
            if ((index === 0) && (selectState.edgeId === 1)) {
                if (direction === "vertical") {
                    if ((parentTable.left < dragState.current.x) && (dragState.current.x < parentTable.right)) {
                        isReducedLine = true;
                        return [];
                    }
                    const startX = (dragState.current.x < parentTable.left) ? parentTable.left : parentTable.right;
                    return [{ x: startX, y: point.y }];
                }
                if (direction === "horizontal") {
                    if ((parentTable.top < dragState.current.y) && (dragState.current.y < parentTable.bottom)) {
                        isReducedLine = true;
                        return [];
                    }
                    const startY = (dragState.current.y < parentTable.top) ? parentTable.top : parentTable.bottom;
                    return [{ x: point.x, y: startY }];
                }
            }
            if ((index === 1) && (selectState.edgeId === 1)) {
                if ((direction === "vertical")
                    && (parentTable.left < dragState.current.x) && (dragState.current.x < parentTable.right)
                ) {
                    const yDirection = (points.length > 2) ? points[2].y : childTable.center.y;
                    const endY = (yDirection < parentTable.top) ? parentTable.top : parentTable.bottom;

                    return [{ x: dragState.current.x, y: endY }];
                }
                if ((direction === "horizontal")
                    && (parentTable.top < dragState.current.y) && (dragState.current.y < parentTable.bottom)
                ) {
                    const xDirection = (points.length > 2) ? points[2].x : childTable.center.x;
                    const endX = (xDirection < parentTable.left) ? parentTable.left : parentTable.right;

                    return [{ x: endX, y: dragState.current.y }];
                }
            }

            // 子テーブルのひとつ先に紐づく線分がドラッグされて、直接紐づく線分の情報を更新する場合
            if ((index === points.length - 2) && (selectState.edgeId === points.length - 3)) {
                if ((direction === "vertical")
                    && (childTable.left < dragState.current.x) && (dragState.current.x < childTable.right)
                ) {
                    const yDirection = (points.length > 2) ? points[points.length - 3].y : parentTable.center.y;
                    const endY = (yDirection < childTable.top) ? childTable.top : childTable.bottom;

                    return [{ x: dragState.current.x, y: endY }];
                }
                if ((direction === "horizontal")
                    && (childTable.top < dragState.current.y) && (dragState.current.y < childTable.bottom)
                ) {
                    const xDirection = (points.length > 2) ? points[points.length - 3].x : parentTable.center.x;
                    const endX = (xDirection < childTable.left) ? childTable.left : childTable.right;

                    return [{ x: endX, y: dragState.current.y }];
                }
            }
            if ((index === points.length - 1) && (selectState.edgeId === points.length - 3)) {
                if (direction === "vertical") {
                    if ((childTable.left < dragState.current.x) && (dragState.current.x < childTable.right)) {
                        isReducedLine = true;
                        return [];
                    }
                    const endX = (dragState.current.x < childTable.left) ? childTable.left : childTable.right;
                    return [{ x: endX, y: point.y }];
                }
                if (direction === "horizontal") {
                    if ((childTable.top < dragState.current.y) && (dragState.current.y < childTable.bottom)) {
                        isReducedLine = true;
                        return [];
                    }
                    const endY = (dragState.current.y < childTable.top) ? childTable.top : childTable.bottom;
                    return [{ x: point.x, y: endY }];
                }
            }

            // 子テーブルに直接紐づく線分が選択されている場合
            if ((index === points.length - 1) && (selectState.edgeId === points.length - 2)) {
                if ((direction === "horizontal")
                    && ((childTable.top > dragState.current.y) || (dragState.current.y > childTable.bottom))
                ) {
                    const endY = (childTable.top > dragState.current.y) ? childTable.top : childTable.bottom;
                    return [
                        { x: childTable.center.x, y: dragState.current.y },
                        { x: childTable.center.x, y: endY }
                    ];
                }
                if ((direction === "vertical")
                    && ((childTable.left > dragState.current.x) || (dragState.current.x > childTable.right))
                ) {
                    const endX = (childTable.left > dragState.current.x) ? childTable.left : childTable.right;
                    return [
                        { x: dragState.current.x, y: childTable.center.y },
                        { x: endX, y: childTable.center.y }
                    ];
                }
            }

            if ((selectState.edgeId === index + 1) || (selectState.edgeId === index - 2)) {
                return [point];
            }

            return [{
                x: (direction === "vertical") ? dragState.current.x : point.x,
                y: (direction === "horizontal") ? dragState.current.y : point.y
            }];
        })
        .flatMap(point => point)
        .map((point, index, draggingPoints) => {
            if ((index === 0) || (index === draggingPoints.length - 1)) {
                return point;
            }

            const nextPoint = draggingPoints[index + 1];
            const direction = (point.x === nextPoint.x) ? "vertical" : "horizontal";
            const delta = (direction === "vertical") ? nextPoint.y - point.y : nextPoint.x - point.x;
            // 前後の線分と同じ位置にある場合は無視するので、isReducedLine を true にする
            if (Math.abs(delta) < 15) {
                isReducedLine = true;
            }

            return point;
        })
        .filter(point => (point != null));

    return { draggedPoints, isReducedLine };
};

type ToNextOrthogonalLinesArgs = {
    relationViews: RelationViewModel[],
    tableRectangles: Map<string, RectangleViewModel>,
    selectState: SelectState,
    dragState: DragState
};

export const toNextOrthogonalLines = (
    { relationViews, tableRectangles, selectState, dragState }: ToNextOrthogonalLinesArgs
): { relationId: string, orthogonalLines: OrthogonalDirection[] }[] => {
    return relationViews.map(relationView => {
        const parentTable = tableRectangles.get(relationView.relationModel.parentTableModelId);
        const childTable = tableRectangles.get(relationView.relationModel.childTableModelId);
        if ((parentTable == null) || (childTable == null)) {
            return null;
        }

        const orthogonalLines = relationView.lineViewModel.orthogonalLines;
        const points = toOrthogonalPoints({ orthogonalLines, parentTable, childTable });
        const { draggedPoints } = toDraggedOrthogonalPoints(
            { relationView, points, parentTable, childTable, selectState, dragState }
        );

        const draggedPairs = draggedPoints.slice(0, -1)
            .map((value, index) => [value, draggedPoints[index + 1]]);

        const nextOrthogonalLines = draggedPairs
            .map((pair, index) => {
                const direction: "vertical" | "horizontal" = (pair[0].x === pair[1].x) ? "vertical" : "horizontal";
                const position = (direction === "vertical") ? pair[0].x : pair[0].y;

                if ((index > 0) && (index < draggedPairs.length - 1)) {
                    const delta = (direction === "vertical") ? pair[1].y - pair[0].y : pair[1].x - pair[0].x;
                    // 前後の線分と同じ位置にある場合は、無視する
                    if (Math.abs(delta) < 15) {
                        return null;
                    }
                }

                return { direction, position };
            })
            .filter(pair => (pair != null))
            .filter((pair, index, baseArray) =>
                (index === 0) || (pair.direction !== baseArray[index - 1].direction));

        return {
            relationId: relationView.relationId,
            orthogonalLines: nextOrthogonalLines
        };
    }).filter(item => (item != null));
};
