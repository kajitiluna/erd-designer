import React from "react";

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import DisplayScaleContext from "~/context/DisplayScaleContext";
import CanvasPositionContext from "~/context/CanvasPositionContext";
import { RelationLabelData } from "~/features/canvas/ErdRelationPathView";
import { DRAWABLE_AREA } from "~/features/canvas/support";

type Point = { x: number, y: number };

type RelationLabelOverlayProps = {
    labelData: RelationLabelData,
    selected: boolean
};

const DEFAULT_SEGMENT = 0;
const DEFAULT_FRACTION = 0.15;
const DEFAULT_DY = -14;

const pointOnSegment = (points: Point[], segment: number, fraction: number): Point => {
    if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
    const i = Math.max(0, Math.min(segment, points.length - 2));
    const f = Math.max(0, Math.min(1, fraction));
    return {
        x: points[i].x + f * (points[i + 1].x - points[i].x),
        y: points[i].y + f * (points[i + 1].y - points[i].y)
    };
};

const projectOntoPath = (points: Point[], target: Point): { segment: number, fraction: number, dx: number, dy: number } => {
    if (points.length < 2) return { segment: 0, fraction: 0, dx: 0, dy: 0 };

    let bestDist = Infinity;
    let bestSegment = 0;
    let bestFraction = 0;
    let bestClosest: Point = points[0];

    for (let i = 0; i < points.length - 1; i++) {
        const sdx = points[i + 1].x - points[i].x;
        const sdy = points[i + 1].y - points[i].y;
        const len = Math.sqrt(sdx * sdx + sdy * sdy);
        if (len === 0) { continue; }

        const tx = target.x - points[i].x;
        const ty = target.y - points[i].y;
        const proj = Math.max(0, Math.min(1, (tx * sdx + ty * sdy) / (len * len)));

        const cx = points[i].x + proj * sdx;
        const cy = points[i].y + proj * sdy;
        const dist = (target.x - cx) ** 2 + (target.y - cy) ** 2;

        if (dist < bestDist) {
            bestDist = dist;
            bestSegment = i;
            bestFraction = proj;
            bestClosest = { x: cx, y: cy };
        }
    }

    return {
        segment: bestSegment,
        fraction: bestFraction,
        dx: target.x - bestClosest.x,
        dy: target.y - bestClosest.y
    };
};

const RelationLabelOverlay = ({ labelData, selected }: RelationLabelOverlayProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const displayScale = React.useContext(DisplayScaleContext);
    const positionResolver = React.useContext(CanvasPositionContext);
    const labelRef = React.useRef<HTMLDivElement>(null);
    const stableAnchorRef = React.useRef<Point | null>(null);
    const prevPointCountRef = React.useRef(0);
    const reanchorRef = React.useRef<{ segment: number, fraction: number, dx: number, dy: number } | null>(null);

    const { relationView, pathPoints } = labelData;
    const relationName = relationView.relationModel.relationName;
    const persisted = relationView.lineViewModel.labelPosition;
    const [dragPos, setDragPos] = React.useState<Point | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);

    React.useEffect(() => {
        if (reanchorRef.current) {
            const data = reanchorRef.current;
            reanchorRef.current = null;
            documentsHolder.updateRelationLabelPosition(
                relationView.relationId,
                data,
                `Re-anchor label: ${relationView.relationId}`
            );
        }
    });

    if (!relationName || pathPoints.length < 2) {
        return null;
    }

    const hasPosition = persisted.segment >= 0;
    let seg = hasPosition ? persisted.segment : DEFAULT_SEGMENT;
    let frac = hasPosition ? persisted.fraction : DEFAULT_FRACTION;
    const dx = hasPosition ? persisted.dx : 0;
    const dy = hasPosition ? persisted.dy : DEFAULT_DY;

    // When path topology changes (points added/removed via virtual edge drag),
    // segment indices shift. Re-project the cached anchor world position to
    // find the correct segment on the new path.
    if (hasPosition
        && stableAnchorRef.current !== null
        && prevPointCountRef.current > 0
        && prevPointCountRef.current !== pathPoints.length) {
        const reproj = projectOntoPath(pathPoints, stableAnchorRef.current);
        seg = reproj.segment;
        frac = reproj.fraction;
        reanchorRef.current = { segment: seg, fraction: frac, dx, dy };
    }

    const anchor = pointOnSegment(pathPoints, seg, frac);
    stableAnchorRef.current = anchor;
    prevPointCountRef.current = pathPoints.length;
    const labelX = dragPos?.x ?? (anchor.x + dx);
    const labelY = dragPos?.y ?? (anchor.y + dy);

    const left = labelX + DRAWABLE_AREA.width / 2;
    const top = labelY + DRAWABLE_AREA.height / 2;

    const getLabelCenter = (): { x: number, y: number } => {
        const el = labelRef.current;
        if (el) return { x: labelX + el.offsetWidth / 2, y: labelY + el.offsetHeight / 2 };
        return { x: labelX, y: labelY };
    };

    const showAnchor = isDragging || selected;
    const anchorProjection = showAnchor
        ? (() => {
            const center = getLabelCenter();
            const proj = projectOntoPath(pathPoints, center);
            return pointOnSegment(pathPoints, proj.segment, proj.fraction);
        })()
        : null;

    const handleMouseDown = (event: React.MouseEvent) => {
        if (event.button !== 0) return;
        event.stopPropagation();

        const startPos = positionResolver.getLogicalPosition(event, displayScale);
        const startLabel = { x: labelX, y: labelY };

        setIsDragging(true);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const movePos = positionResolver.getLogicalPosition(moveEvent as unknown as React.MouseEvent, displayScale);
            setDragPos({
                x: startLabel.x + movePos.x - startPos.x,
                y: startLabel.y + movePos.y - startPos.y
            });
        };

        const handleMouseUp = (upEvent: MouseEvent) => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);

            const upPos = positionResolver.getLogicalPosition(upEvent as unknown as React.MouseEvent, displayScale);
            const finalPos = {
                x: startLabel.x + upPos.x - startPos.x,
                y: startLabel.y + upPos.y - startPos.y
            };

            const projected = projectOntoPath(pathPoints, finalPos);

            setIsDragging(false);
            setDragPos(null);
            documentsHolder.updateRelationLabelPosition(
                relationView.relationId,
                projected,
                `Update relation label position: ${relationView.relationId}`
            );
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
    };

    const projDotLeft = anchorProjection ? anchorProjection.x + DRAWABLE_AREA.width / 2 : 0;
    const projDotTop = anchorProjection ? anchorProjection.y + DRAWABLE_AREA.height / 2 : 0;
    const logicalCenter = getLabelCenter();
    const labelCenterLeft = logicalCenter.x + DRAWABLE_AREA.width / 2;
    const labelCenterTop = logicalCenter.y + DRAWABLE_AREA.height / 2;

    return (
        <>
            {anchorProjection && (
                <>
                    <svg style={{
                        position: "absolute", top: 0, left: 0,
                        width: DRAWABLE_AREA.width, height: DRAWABLE_AREA.height,
                        pointerEvents: "none", overflow: "visible"
                    }}>
                        <line
                            x1={projDotLeft} y1={projDotTop}
                            x2={labelCenterLeft} y2={labelCenterTop}
                            stroke="rgba(123, 31, 162, 0.3)" strokeWidth={1}
                            strokeDasharray="4 3" />
                    </svg>
                    <div style={{
                        position: "absolute",
                        left: `${projDotLeft - 4}px`,
                        top: `${projDotTop - 4}px`,
                        width: "8px", height: "8px",
                        borderRadius: "50%",
                        backgroundColor: "#7B1FA2",
                        pointerEvents: "none"
                    }} />
                </>
            )}
            <div ref={labelRef} style={{
                position: "absolute",
                left: `${left}px`,
                top: `${top}px`,
                fontSize: "13px",
                color: selected || isDragging ? "#7B1FA2" : "rgba(60, 60, 60, 0.95)",
                fontWeight: selected || isDragging ? 600 : 400,
                textShadow: selected || isDragging ? "0 0 6px rgba(123, 31, 162, 0.4)" : "none",
                cursor: "move",
                userSelect: "none",
                pointerEvents: "auto",
                whiteSpace: "nowrap"
            }}
                onMouseDown={handleMouseDown}>
                {relationName}
            </div>
        </>
    );
};

export default RelationLabelOverlay;
