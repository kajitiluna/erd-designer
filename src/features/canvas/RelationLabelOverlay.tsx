import React from "react";
import { createPortal } from "react-dom";
import { IconButton, Tooltip } from "@mui/material";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import DisplayScaleContext from "~/context/DisplayScaleContext";
import CanvasPositionContext from "~/context/CanvasPositionContext";
import ToolbarPortalContext from "~/context/ToolbarPortalContext";
import { SelectEntityContext } from "~/context/SelectEntityContext";
import { DragActionContext } from "~/context/DragActionContext";
import EditModeContext from "~/context/EditModeContext";
import { EditModeType } from "~/models/EditMode";
import ColorValue from "~/models/ColorValue";
import { LabelStyle } from "~/models/LineViewModel";
import ColorSelector from "~/components/ColorSelector";
import { RelationLabelData } from "~/features/canvas/ErdRelationPathView";
import { DRAWABLE_AREA, handlePreventMouseEvent } from "~/features/canvas/support";

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
    const { scale: displayScale } = React.useContext(DisplayScaleContext);
    const positionResolver = React.useContext(CanvasPositionContext);
    const toolbarPortalRef = React.useContext(ToolbarPortalContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);
    const labelRef = React.useRef<HTMLDivElement>(null);
    const didDragRef = React.useRef(false);
    const [toolbarVisible, setToolbarVisible] = React.useState(false);
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

    const labelStyle: LabelStyle = relationView.lineViewModel.labelStyle;

    const handleMouseDown = (event: React.MouseEvent) => {
        if (event.button !== 0) return;
        event.stopPropagation();

        setToolbarVisible(false);
        didDragRef.current = false;
        const startPos = positionResolver.getLogicalPosition(event, displayScale);
        const startLabel = { x: labelX, y: labelY };

        setIsDragging(true);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            didDragRef.current = true;
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

    const handleClick = (event: React.MouseEvent) => {
        if (didDragRef.current) {
            didDragRef.current = false;
            return;
        }
        event.stopPropagation();
        setToolbarVisible(true);
        dispatchSelectAction({ type: "relation", relationId: relationView.relationId });
    };

    const handleToggleBold = () => {
        const next = { ...labelStyle, bold: !labelStyle.bold };
        documentsHolder.updateRelationLabelStyle(
            relationView.relationId, next,
            `Update label style: ${relationView.relationId}`
        );
    };

    const handleToggleItalic = () => {
        const next = { ...labelStyle, italic: !labelStyle.italic };
        documentsHolder.updateRelationLabelStyle(
            relationView.relationId, next,
            `Update label style: ${relationView.relationId}`
        );
    };

    const handleToggleStrikethrough = () => {
        const next = { ...labelStyle, strikethrough: !labelStyle.strikethrough };
        documentsHolder.updateRelationLabelStyle(
            relationView.relationId, next,
            `Update label style: ${relationView.relationId}`
        );
    };

    const handleFontSizeChange = (delta: number) => {
        const next = { ...labelStyle, fontSize: Math.max(1, labelStyle.fontSize + delta) };
        documentsHolder.updateRelationLabelStyle(
            relationView.relationId, next,
            `Update label style: ${relationView.relationId}`
        );
    };

    const handleSetColor = (background: ColorValue) => {
        const hex = background.toHex();
        const next = { ...labelStyle, color: hex === "#3c3c3c" ? undefined : hex };
        documentsHolder.updateRelationLabelStyle(
            relationView.relationId, next,
            `Update label style: ${relationView.relationId}`
        );
    };

    const projDotLeft = anchorProjection ? anchorProjection.x + DRAWABLE_AREA.width / 2 : 0;
    const projDotTop = anchorProjection ? anchorProjection.y + DRAWABLE_AREA.height / 2 : 0;
    const logicalCenter = getLabelCenter();
    const labelCenterLeft = logicalCenter.x + DRAWABLE_AREA.width / 2;
    const labelCenterTop = logicalCenter.y + DRAWABLE_AREA.height / 2;

    if (!selected && toolbarVisible) {
        setToolbarVisible(false);
    }

    const showToolbar = toolbarVisible && selected && selectState.edgeType == null
        && editMode === EditModeType.SELECT
        && dragState.status !== "on_dragging" && !isDragging;

    const counterScale = 1 / displayScale;

    const toolbar = (!showToolbar || !toolbarPortalRef.current) ? null : createPortal(
        <div style={{
            position: "absolute",
            left,
            top: top + (labelRef.current?.offsetHeight ?? 16),
            transform: `scale(${counterScale})`,
            transformOrigin: "top left",
            marginTop: 4,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 2,
            backgroundColor: "#fff",
            borderRadius: 4,
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            padding: "2px 4px"
        }}
            onClick={handlePreventMouseEvent}
            onMouseDown={handlePreventMouseEvent}
            onMouseUp={handlePreventMouseEvent}>
            <ColorSelector
                color={labelStyle.color ? ColorValue.fromHex(labelStyle.color) : undefined}
                callback={handleSetColor} />
            <Tooltip title="Decrease font size" placement="top">
                <IconButton size="small" onClick={() => handleFontSizeChange(-1)}>
                    <RemoveIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <span style={{ fontSize: 12, minWidth: 20, textAlign: "center", lineHeight: "30px" }}>
                {labelStyle.fontSize}
            </span>
            <Tooltip title="Increase font size" placement="top">
                <IconButton size="small" onClick={() => handleFontSizeChange(1)}>
                    <AddIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <Tooltip title="Bold" placement="top">
                <IconButton size="small"
                    color={labelStyle.bold ? "primary" : "default"}
                    onClick={handleToggleBold}>
                    <FormatBoldIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <Tooltip title="Italic" placement="top">
                <IconButton size="small"
                    color={labelStyle.italic ? "primary" : "default"}
                    onClick={handleToggleItalic}>
                    <FormatItalicIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <Tooltip title="Strikethrough" placement="top">
                <IconButton size="small"
                    color={labelStyle.strikethrough ? "primary" : "default"}
                    onClick={handleToggleStrikethrough}>
                    <StrikethroughSIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </div>,
        toolbarPortalRef.current
    );

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
            <div ref={labelRef}
                data-parent={relationView.relationModel.parentTableModelId}
                data-child={relationView.relationModel.childTableModelId}
                style={{
                position: "absolute",
                left: `${left}px`,
                top: `${top}px`,
                fontSize: `${labelStyle.fontSize}px`,
                fontStyle: labelStyle.italic ? "italic" : "normal",
                textDecoration: labelStyle.strikethrough ? "line-through" : "none",
                color: labelStyle.color ?? "rgba(60, 60, 60, 0.95)",
                fontWeight: labelStyle.bold ? 700 : (selected || isDragging ? 600 : 400),
                textShadow: selected || isDragging ? "0 0 8px rgba(123, 31, 162, 0.6)" : "none",
                outline: selected || isDragging ? "1.5px solid rgba(123, 31, 162, 0.5)" : "none",
                outlineOffset: "2px",
                borderRadius: "2px",
                cursor: "move",
                userSelect: "none",
                pointerEvents: "auto",
                whiteSpace: "nowrap"
            }}
                onMouseDown={handleMouseDown}
                onClick={handleClick}>
                {relationName}
            </div>
            {toolbar}
        </>
    );
};

export default RelationLabelOverlay;
