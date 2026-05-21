import React from "react";
import ReactDom from "react-dom";
import { IconButton, Tooltip } from "@mui/material";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";

import useStateRef from "~/components/useStateRef";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import DisplayScaleContext from "~/context/DisplayScaleContext";
import CanvasPositionContext from "~/context/CanvasPositionContext";
import PortalCanvasContext from "~/context/PortalCanvasContext";
import { SelectEntityContext } from "~/context/SelectEntityContext";
import { DragActionContext } from "~/context/DragActionContext";
import EditModeContext from "~/context/EditModeContext";
import { EditModeType } from "~/models/EditMode";
import ColorValue from "~/models/ColorValue";
import { LabelPosition } from "~/models/LabelViewModel";
import RelationViewModel from "~/models/RelationViewModel";
import ColorSelector from "~/components/ColorSelector";
import { handlePreventMouseEvent } from "~/features/canvas/support";

import styleClasses from "./ErdCanvas.module.css";

export const ERD_RELATION_LABEL_CLASS_NAME = "erd-relation-label";

type Point = { x: number, y: number };

type RelationLabelOverlayProps = {
    relationView: RelationViewModel,
    pathPoints: Point[]
};

const DEFAULT_SEGMENT = 0;
const DEFAULT_FRACTION = 0.15;
const DEFAULT_OFFSET_Y = -14;

const RelationLabelOverlay = ({ relationView, pathPoints }: RelationLabelOverlayProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { scale: displayScale } = React.useContext(DisplayScaleContext);
    const positionResolver = React.useContext(CanvasPositionContext);
    const { toolbarCanvasElement, svgCanvasElement } = React.useContext(PortalCanvasContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);

    const [labelElement, labelRef] = useStateRef<HTMLDivElement>();
    const [stableAnchor, setStableAnchor] = React.useState<Point | null>(null);
    const [prevPointCount, setPrevPointCount] = React.useState(0);
    const mouseMoveHandlerRef = React.useRef<((event: MouseEvent) => void) | null>(null);
    const mouseUpHandlerRef = React.useRef<((event: MouseEvent) => void) | null>(null);
    const [draggingPosition, setDraggingPosition] = React.useState<Point | null>(null);

    const labelView = relationView.labelViewModel;

    React.useEffect(() => {
        return () => {
            if (mouseMoveHandlerRef.current) {
                window.removeEventListener("mousemove", mouseMoveHandlerRef.current);
            }
            if (mouseUpHandlerRef.current) {
                window.removeEventListener("mouseup", mouseUpHandlerRef.current);
            }
        };
    }, []);

    const labelPosition = labelView.position;
    const hasPosition = (labelPosition.segment >= 0);
    let segment = hasPosition ? labelPosition.segment : DEFAULT_SEGMENT;
    let fraction = hasPosition ? labelPosition.fraction : DEFAULT_FRACTION;
    const offsetX = hasPosition ? labelPosition.offsetX : 0;
    const offsetY = hasPosition ? labelPosition.offsetY : DEFAULT_OFFSET_Y;

    // When path topology changes (points added/removed via virtual edge drag),
    // segment indices shift. Re-project the cached anchor world position to
    // find the correct segment on the new path.
    if ((pathPoints.length >= 2)
        && hasPosition
        && (stableAnchor !== null)
        && (prevPointCount > 0)
        && (prevPointCount !== pathPoints.length)
    ) {
        const reproj = projectOntoPath(pathPoints, stableAnchor);
        segment = reproj.segment;
        fraction = reproj.fraction;
    }

    const anchorPoint = (pathPoints.length >= 2) ? pointOnSegment(pathPoints, segment, fraction) : { x: 0, y: 0 };
    // Intentional "storing information from previous renders" pattern (React docs):
    // https://react.dev/reference/react/useState#storing-information-from-previous-renders
    //
    // These setState calls during render are necessary to keep stableAnchor (the cached
    // world-space anchor position) and prevPointCount in sync with the current render output.
    // Using useRef with direct mutation (stableAnchorRef.current = ...) was the original
    // approach, but eslint-plugin-react-hooks v7 introduced the react-hooks/react-compiler
    // rule which flags ref.current mutations during render as a Rules-of-React violation.
    // The conditional guards (prevPointCount !== / stableAnchor.x !== ...) ensure React's
    // "bail out when equal" optimisation prevents an infinite re-render loop.
    if (pathPoints.length >= 2) {
        if (prevPointCount !== pathPoints.length) {
            setPrevPointCount(pathPoints.length);
        }
        if (stableAnchor === null || stableAnchor.x !== anchorPoint.x || stableAnchor.y !== anchorPoint.y) {
            setStableAnchor(anchorPoint);
        }
    }

    const { x: labelX, y: labelY } = draggingPosition ?? { x: anchorPoint.x + offsetX, y: anchorPoint.y + offsetY };
    const labelToolbar = useRelationLabelToolbar({
        relationView, toolbarCanvasElement, labelElement, labelLeft: labelX, labelTop: labelY,
        isLabelDragging: (draggingPosition != null)
    });

    if (!toolbarCanvasElement) {
        return null;
    }

    if (!labelView.label || (pathPoints.length < 2)) {
        return null;
    }
    // ドラッグ操作により、対象リレーション描画が変わる際に label の描画場所が不安定になるため、非表示にする
    if ((dragState.status === "on_dragging") && (
        (selectState.relationId === relationView.relationId)
        || selectState.tableIds.has(relationView.relationModel.parentTableModelId)
        || selectState.tableIds.has(relationView.relationModel.childTableModelId)
    )) {
        return null;
    }

    const handleMouseDown = (event: React.MouseEvent) => {
        if (event.button !== 0) {
            return;
        }

        event.stopPropagation();

        const startPos = positionResolver.getLogicalPosition(event, displayScale);
        const startLabel = { x: labelX, y: labelY };

        setDraggingPosition(startLabel);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const movingPosition = positionResolver.getLogicalPosition(moveEvent, displayScale);
            setDraggingPosition({
                x: startLabel.x + movingPosition.x - startPos.x,
                y: startLabel.y + movingPosition.y - startPos.y
            });
        };

        const handleMouseUp = (upEvent: MouseEvent) => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
            mouseMoveHandlerRef.current = null;
            mouseUpHandlerRef.current = null;

            const mousePosition = positionResolver.getLogicalPosition(upEvent, displayScale);
            const finalPosition = {
                x: startLabel.x + mousePosition.x - startPos.x,
                y: startLabel.y + mousePosition.y - startPos.y
            };

            const projected = projectOntoPath(pathPoints, finalPosition);

            setDraggingPosition(null);

            documentsHolder.updateRelationLabelPosition(relationView.relationId, projected);
        };

        mouseMoveHandlerRef.current = handleMouseMove;
        mouseUpHandlerRef.current = handleMouseUp;
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
    };

    const handleClick = (event: React.MouseEvent) => {
        event.stopPropagation();

        dispatchSelectAction({ type: "relation", relationId: relationView.relationId });
    };

    const initAnchorDrawing = (showingAnchor: boolean) => {
        if (showingAnchor == false) {
            return null;
        }

        const actualElement = labelElement ?? { offsetWidth: 0, offsetHeight: 0 };
        const labelCenter = { x: labelX + actualElement.offsetWidth / 2, y: labelY + actualElement.offsetHeight / 2 };
        const proj = projectOntoPath(pathPoints, labelCenter);
        const anchorPoint = pointOnSegment(pathPoints, proj.segment, proj.fraction);

        const anchorLine = (
            <line x1={anchorPoint.x} y1={anchorPoint.y} x2={labelCenter.x} y2={labelCenter.y}
                stroke="rgba(123, 31, 162, 0.3)" strokeWidth={1} strokeDasharray="4 3" />
        );
        const anchorDot = (
            <div style={{
                position: "absolute", left: `${anchorPoint.x - 4}px`, top: `${anchorPoint.y - 4}px`,
                width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#7B1FA2",
                pointerEvents: "none"
            }} />
        );

        return (<>
            {svgCanvasElement && ReactDom.createPortal(anchorLine, svgCanvasElement)}
            {toolbarCanvasElement && ReactDom.createPortal(anchorDot, toolbarCanvasElement)}
        </>);
    };

    const showingAnchor = (draggingPosition != null) || (selectState.relationId === relationView.relationId);
    const cssClassName = showingAnchor ? `${ERD_RELATION_LABEL_CLASS_NAME} ${styleClasses.selectedLabel}`
        : ERD_RELATION_LABEL_CLASS_NAME;
    const labelFont = labelView.style;
    const labelStyle: React.CSSProperties = {
        position: "absolute", left: `${labelX}px`, top: `${labelY}px`,
        fontSize: `${labelFont.fontSize / 10}em`, fontWeight: labelFont.bold ? 700 : 400,
        fontStyle: labelFont.italic ? "italic" : "normal",
        textDecoration: labelFont.strikethrough ? "line-through" : "none",
        color: labelView.color.toHex(),
        whiteSpace: "nowrap",
        cursor: "move", userSelect: "none", pointerEvents: "auto",
        zIndex: 90,
    };

    return (<>
        {initAnchorDrawing(showingAnchor)}
        {ReactDom.createPortal(
            <div ref={labelRef} style={labelStyle} className={cssClassName}
                data-erd-relation-parent-table-id={relationView.relationModel.parentTableModelId}
                data-erd-relation-child-table-id={relationView.relationModel.childTableModelId}
                onMouseDown={handleMouseDown} onClick={handleClick}>
                {labelView.label}
            </div>,
            toolbarCanvasElement
        )}
        {labelToolbar}
    </>);
};

type RelationLabelToolbarProps = {
    relationView: RelationViewModel,
    toolbarCanvasElement: HTMLDivElement | null,
    labelElement: HTMLDivElement | null,
    labelLeft: number, labelTop: number, isLabelDragging: boolean
};

const useRelationLabelToolbar = ({
    relationView, toolbarCanvasElement, labelElement, labelLeft, labelTop, isLabelDragging
}: RelationLabelToolbarProps) => {

    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { scale: displayScale } = React.useContext(DisplayScaleContext);
    const { selectState } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);

    if (!toolbarCanvasElement) {
        return null;
    }

    const relationSelected = (selectState.relationId === relationView.relationId);
    // リレーションが選択されている場合は、ラベルの tooltip は表示しない
    const showToolbar = relationSelected && (selectState.edgeType == null)
        && (editMode === EditModeType.SELECT)
        && !isLabelDragging && (dragState.status !== "on_dragging");

    if (showToolbar === false) {
        return null;
    }

    const handleSetColor = (background: ColorValue) => {
        documentsHolder.updateRelationLabelColor(relationView.relationId, background);
    };

    const labelView = relationView.labelViewModel;
    const labelFont = labelView.style;

    const handleFontSizeChange = (delta: number) => {
        const nextSize = Math.max(8, Math.min(32, labelFont.fontSize + delta));
        const next = { ...labelFont, fontSize: nextSize };

        documentsHolder.updateRelationLabelStyle(relationView.relationId, next);
    };

    const handleToggleBold = () => {
        const next = { ...labelFont, bold: !labelFont.bold };
        documentsHolder.updateRelationLabelStyle(relationView.relationId, next);
    };

    const handleToggleItalic = () => {
        const next = { ...labelFont, italic: !labelFont.italic };
        documentsHolder.updateRelationLabelStyle(relationView.relationId, next);
    };

    const handleToggleStrikethrough = () => {
        const next = { ...labelFont, strikethrough: !labelFont.strikethrough };
        documentsHolder.updateRelationLabelStyle(relationView.relationId, next);
    };

    const toolbarStyle: React.CSSProperties = {
        position: "absolute",
        left: labelLeft, top: labelTop + (labelElement?.offsetHeight ?? 16),
        marginTop: 4,
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        gap: 2,
        backgroundColor: "#fff",
        borderRadius: 4,
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        padding: "2px 4px",
        transformOrigin: "top left",
        transform: `scale(${1 / displayScale})`,
    };

    const toolbar = (
        <div style={toolbarStyle} onClick={handlePreventMouseEvent}
            onMouseDown={handlePreventMouseEvent} onMouseUp={handlePreventMouseEvent}>
            <ColorSelector color={labelView.color} callback={handleSetColor} />
            <IconButton size="small" onClick={() => handleFontSizeChange(-1)}>
                <RemoveIcon fontSize="small" />
            </IconButton>
            <span style={FONT_SIZE_STYLE}>
                {labelFont.fontSize}
            </span>
            <IconButton size="small" onClick={() => handleFontSizeChange(1)}>
                <AddIcon fontSize="small" />
            </IconButton>
            <Tooltip title="Bold" placement="top">
                <IconButton size="small" color={initButtonStyle(labelFont.bold)}
                    onClick={handleToggleBold}>
                    <FormatBoldIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <Tooltip title="Italic" placement="top">
                <IconButton size="small" color={initButtonStyle(labelFont.italic)}
                    onClick={handleToggleItalic}>
                    <FormatItalicIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <Tooltip title="Strikethrough" placement="top">
                <IconButton size="small" color={initButtonStyle(labelFont.strikethrough)}
                    onClick={handleToggleStrikethrough}>
                    <StrikethroughSIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </div>
    );

    return ReactDom.createPortal(toolbar, toolbarCanvasElement);
};

const FONT_SIZE_STYLE: React.CSSProperties = {
    fontSize: 12, color: "#000",
    minWidth: 20, textAlign: "center", lineHeight: "30px",
    userSelect: "none"
};

const initButtonStyle = (active: boolean) => active ? "primary" : "default";

const pointOnSegment = (points: Point[], segment: number, fraction: number): Point => {
    if (points.length < 2) {
        return points[0] ?? { x: 0, y: 0 };
    }

    const index = Math.max(0, Math.min(segment, points.length - 2));
    const actualFraction = Math.max(0, Math.min(1, fraction));

    return {
        x: points[index].x + actualFraction * (points[index + 1].x - points[index].x),
        y: points[index].y + actualFraction * (points[index + 1].y - points[index].y)
    };
};

const projectOntoPath = (points: Point[], target: Point): LabelPosition => {
    if (points.length < 2) {
        return { segment: 0, fraction: 0, offsetX: 0, offsetY: 0 };
    }

    let bestDistance = Infinity;
    let bestSegment = 0;
    let bestFraction = 0;
    let bestClosest: Point = points[0];

    for (let index = 0; index < points.length - 1; index++) {
        const segmentDiffX = points[index + 1].x - points[index].x;
        const segmentDiffY = points[index + 1].y - points[index].y;
        if ((segmentDiffX === 0) && (segmentDiffY === 0)) {
            continue;
        }

        const targetDiffX = target.x - points[index].x;
        const targetDiffY = target.y - points[index].y;
        // projectionRate は target から該当線分への最短点の内分比
        const projectionRate = Math.max(0, Math.min(1,
            (targetDiffX * segmentDiffX + targetDiffY * segmentDiffY) / (segmentDiffX ** 2 + segmentDiffY ** 2)
        ));

        const cx = points[index].x + projectionRate * segmentDiffX;
        const cy = points[index].y + projectionRate * segmentDiffY;
        const distance = (target.x - cx) ** 2 + (target.y - cy) ** 2;

        if (distance < bestDistance) {
            bestDistance = distance;
            bestSegment = index;
            bestFraction = projectionRate;
            bestClosest = { x: cx, y: cy };
        }
    }

    return {
        segment: bestSegment,
        fraction: bestFraction,
        offsetX: target.x - bestClosest.x,
        offsetY: target.y - bestClosest.y
    };
};

const areRelationLabelPropsEqual = (
    prevProps: RelationLabelOverlayProps,
    nextProps: RelationLabelOverlayProps
): boolean => {
    if (prevProps.relationView !== nextProps.relationView) {
        return false;
    }

    const previousPoints = prevProps.pathPoints;
    const nextPoints = nextProps.pathPoints;
    if (previousPoints.length !== nextPoints.length) {
        return false;
    }

    return previousPoints.every((previous, index) =>
        (previous.x === nextPoints[index].x) && (previous.y === nextPoints[index].y));
};

export default React.memo(RelationLabelOverlay, areRelationLabelPropsEqual);
