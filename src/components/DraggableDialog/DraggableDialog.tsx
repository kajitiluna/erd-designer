import React from "react";
import { Box, Dialog, DialogProps, dialogClasses, dialogTitleClasses } from "@mui/material";

import useStateRef from "~/components/useStateRef";
import DialogLayoutStore, { DialogBounds } from "~/components/DraggableDialog/DialogLayoutStore";

type DraggableDialogProps = Omit<DialogProps, "slotProps"> & {

    /** 
     * When set, position and size are remembered per tab under this name;
     * otherwise the dialog always opens at its default position.
     */
    layoutName?: string
};

type Viewport = { width: number, height: number };

/** Adds title-bar-drag move and edge-drag resize to MUI Dialog. */
const DraggableDialog = ({ children, open, layoutName, ...dialogProps }: DraggableDialogProps) => {
    const [paperElement, paperRef] = useStateRef<HTMLDivElement>();
    const [bounds, setBounds] = React.useState<DialogBounds | null>(() => initStoredBounds(layoutName));
    const [viewport, setViewport] = React.useState<Viewport>(currentViewport);
    const sessionRef = React.useRef<DragSession>(IDLE_SESSION);

    // 開き直しのたびに保存値を読み直す。閉じている間も DraggableDialog 自体は残るため、明示的な初期化が必要
    React.useEffect(() => {
        if (open === false) {
            return;
        }

        sessionRef.current = IDLE_SESSION;
        setBounds(initStoredBounds(layoutName));
    }, [open, layoutName]);

    // 比率は不変なので、ビューポートを更新して再描画するだけで四辺の比率が保たれる。
    React.useEffect(() => {
        const handleViewportResize = () => {
            const viewport = currentViewport();
            setViewport(viewport);
        }

        window.addEventListener("resize", handleViewportResize);
        return () => window.removeEventListener("resize", handleViewportResize);
    }, []);

    const startSession = (event: React.PointerEvent<HTMLElement>, edge: ResizeEdge | null) => {
        if ((event.button !== 0) || (paperElement == null)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);

        const base = (bounds != null) ? toRect(bounds, viewport) : rectOf(paperElement);
        const origin = { x: event.clientX, y: event.clientY };
        sessionRef.current = (edge == null)
            ? { status: "moving", pointerId: event.pointerId, origin, base }
            : { status: "resizing", edge, pointerId: event.pointerId, origin, base };

        const nextBounds = toBounds(base, viewport);
        setBounds(nextBounds);
    };

    // タイトルバーは呼び出し側が置く DialogTitle そのものなので、Paper 上の委譲で拾う。
    // 入れ子のダイアログは React ツリー上では親ダイアログの子であり、ポインタイベントはポータル越しに親まで伝播する。
    // 掴まれたタイトルが DOM 上でこの Paper のものか照合し、子ダイアログのタイトルドラッグで親が動くのを防ぐ。
    const handlePaperPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const pointedElement = event.target as HTMLElement;
        const titleElement = pointedElement.closest(`.${dialogTitleClasses.root}`);
        if ((titleElement == null) || (titleElement.closest(`.${dialogClasses.paper}`) !== paperElement)) {
            return;
        }

        startSession(event, null);
    };

    const handlePaperPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const nextBound = doHandlePaperPointerMove(sessionRef.current, viewport, event);
        if (nextBound == null) {
            return;
        }

        setBounds(nextBound);
    };

    const handlePaperPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        const session = sessionRef.current;
        if ((session.status === "idle") || (session.pointerId !== event.pointerId)) {
            return;
        }

        sessionRef.current = IDLE_SESSION;
        if ((layoutName != null) && (bounds != null)) {
            DialogLayoutStore.save(layoutName, bounds);
        }
    };

    const resizeHandles = RESIZE_EDGES.map(edge => {
        return (
            <Box key={`resize-handle_${edge}`} sx={initHandleStyle(edge)}
                onPointerDown={event => startSession(event, edge)} />
        );
    });

    return (
        <Dialog {...dialogProps} open={open} slotProps={{
            paper: {
                ref: paperRef, sx: initPaperStyle(bounds, viewport),
                onPointerDown: handlePaperPointerDown,
                onPointerMove: handlePaperPointerMove,
                onPointerUp: handlePaperPointerUp,
                onPointerCancel: handlePaperPointerUp
            }
        }}>
            {children}
            {resizeHandles}
        </Dialog>
    );
};

const initStoredBounds = (layoutName: string | undefined): DialogBounds | null => {
    if (layoutName == null) {
        return null;
    }

    return DialogLayoutStore.load(layoutName);
};

const currentViewport = (): Viewport => {
    return { width: window.innerWidth, height: window.innerHeight };
};

const MINIMUM_WIDTH = 320;
const MINIMUM_HEIGHT = 200;
/** Leaves roughly Paper's default margin (32px) at each end of the viewport */
const VIEWPORT_GUTTER = 64;
/** Width of the strip always kept inside the viewport so the dialog can be grabbed again */
const VISIBLE_MARGIN = 80;

const toRect = (bounds: DialogBounds, viewport: Viewport): DialogRect => {
    const maximumWidth = Math.max(MINIMUM_WIDTH, viewport.width - VIEWPORT_GUTTER);
    const maximumHeight = Math.max(MINIMUM_HEIGHT, viewport.height - VIEWPORT_GUTTER);
    const width = clamp(bounds.widthRatio * viewport.width, MINIMUM_WIDTH, maximumWidth);
    const height = clamp(bounds.heightRatio * viewport.height, MINIMUM_HEIGHT, maximumHeight);

    const minimumLeft = VISIBLE_MARGIN - width;
    const maximumLeft = viewport.width - VISIBLE_MARGIN;
    const minimumTop = VISIBLE_MARGIN - height;
    const maximumTop = viewport.height - VISIBLE_MARGIN;

    // A dialog dragged fully off-screen could never be grabbed again,
    // so the rectangle is clamped to a range that always leaves a title-bar strip grabbable within the viewport.
    const left = clamp(bounds.leftRatio * viewport.width, minimumLeft, maximumLeft)
    const top = clamp(bounds.topRatio * viewport.height, minimumTop, maximumTop)

    return { left, top, width, height };
};

const clamp = (value: number, minimum: number, maximum: number): number => {
    return Math.min(Math.max(value, minimum), maximum);
};

/** Derives the initial px rectangle from an untouched Paper. */
const rectOf = (paperElement: HTMLDivElement): DialogRect => {
    const rectangle = paperElement.getBoundingClientRect();

    return { left: rectangle.left, top: rectangle.top, width: rectangle.width, height: rectangle.height };
};

const doHandlePaperPointerMove = (session: DragSession, viewport: Viewport, event: React.PointerEvent) => {
    if ((session.status === "idle") || (session.pointerId !== event.pointerId)) {
        return null;
    }

    const delta = { x: event.clientX - session.origin.x, y: event.clientY - session.origin.y };
    const nextRect = (session.status === "moving")
        ? doMoveRect(session.base, delta)
        : doResizeRect(session.base, session.edge, delta, viewport);

    return toBounds(nextRect, viewport);
};

const doMoveRect = (base: DialogRect, delta: { x: number, y: number }): DialogRect => {
    return { ...base, left: base.left + delta.x, top: base.top + delta.y };
};

const doResizeRect = (
    base: DialogRect, edge: ResizeEdge, delta: { x: number, y: number }, viewport: Viewport
): DialogRect => {
    const horizontal = doResizeHorizontal(base, edge, delta.x, viewport.width);
    const vertical = doResizeVertical(base, edge, delta.y, viewport.height);

    return { left: horizontal.start, top: vertical.start, width: horizontal.length, height: vertical.length };
};

const doResizeHorizontal = (
    base: DialogRect, edge: ResizeEdge, deltaX: number, viewportWidth: number
): { start: number, length: number } => {
    const maximumWidth = Math.max(MINIMUM_WIDTH, viewportWidth - VIEWPORT_GUTTER);

    if (edge.includes("left")) {
        const width = clamp(base.width - deltaX, MINIMUM_WIDTH, maximumWidth);
        return { start: base.left + base.width - width, length: width };
    }

    if (edge.includes("right")) {
        const width = clamp(base.width + deltaX, MINIMUM_WIDTH, maximumWidth);
        return { start: base.left, length: width };
    }

    return { start: base.left, length: base.width };
};

const doResizeVertical = (
    base: DialogRect, edge: ResizeEdge, deltaY: number, viewportHeight: number
): { start: number, length: number } => {
    const maximumHeight = Math.max(MINIMUM_HEIGHT, viewportHeight - VIEWPORT_GUTTER);

    if (edge.includes("top")) {
        const height = clamp(base.height - deltaY, MINIMUM_HEIGHT, maximumHeight);
        return { start: base.top + base.height - height, length: height };
    }

    if (edge.includes("bottom")) {
        const height = clamp(base.height + deltaY, MINIMUM_HEIGHT, maximumHeight);
        return { start: base.top, length: height };
    }

    return { start: base.top, length: base.height };
};

type DragSession =
    { status: "idle" }
    | { status: "moving", pointerId: number, origin: { x: number, y: number }, base: DialogRect }
    | { status: "resizing", edge: ResizeEdge, pointerId: number, origin: { x: number, y: number }, base: DialogRect };

/** A px rectangle with its origin at the viewport's top-left. */
type DialogRect = {
    left: number,
    top: number,
    width: number,
    height: number
};

type ResizeEdge = "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

const RESIZE_EDGES: readonly ResizeEdge[] = [
    "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"
] as const;

const IDLE_SESSION: DragSession = { status: "idle" } as const;

const initHandleStyle = (edge: ResizeEdge): React.CSSProperties => {
    const cssProperty = EDGE_POSITIONS[edge];

    return {
        position: "absolute", zIndex: 1, touchAction: "none",
        cursor: EDGE_CURSORS[edge], ...cssProperty
    };
};

// EDGE_POSITIONS はモジュール読み込み時に評価されるため、寸法定数を先に置く
const HANDLE_THICKNESS = 8;
const HANDLE_INSET = -4;
const CORNER_SIZE = 14;

/** Corner handles should sit above edge handles, so edge handles are inset to stop short of the corners. */
const EDGE_POSITIONS: Record<ResizeEdge, React.CSSProperties> = {
    "top": { top: HANDLE_INSET, left: CORNER_SIZE, right: CORNER_SIZE, height: HANDLE_THICKNESS },
    "bottom": { bottom: HANDLE_INSET, left: CORNER_SIZE, right: CORNER_SIZE, height: HANDLE_THICKNESS },
    "left": { left: HANDLE_INSET, top: CORNER_SIZE, bottom: CORNER_SIZE, width: HANDLE_THICKNESS },
    "right": { right: HANDLE_INSET, top: CORNER_SIZE, bottom: CORNER_SIZE, width: HANDLE_THICKNESS },
    "top-left": { top: HANDLE_INSET, left: HANDLE_INSET, width: CORNER_SIZE, height: CORNER_SIZE },
    "top-right": { top: HANDLE_INSET, right: HANDLE_INSET, width: CORNER_SIZE, height: CORNER_SIZE },
    "bottom-left": { bottom: HANDLE_INSET, left: HANDLE_INSET, width: CORNER_SIZE, height: CORNER_SIZE },
    "bottom-right": { bottom: HANDLE_INSET, right: HANDLE_INSET, width: CORNER_SIZE, height: CORNER_SIZE }
} as const;

const EDGE_CURSORS: Record<ResizeEdge, string> = {
    "top": "ns-resize", "bottom": "ns-resize", "left": "ew-resize", "right": "ew-resize",
    "top-left": "nwse-resize", "bottom-right": "nwse-resize",
    "top-right": "nesw-resize", "bottom-left": "nesw-resize"
} as const;

const initPaperStyle = (bounds: DialogBounds | null, viewport: Viewport) => {
    // Paper 既定の overflow: auto は、枠線をまたぐリサイズハンドルの外側半分を切り落としてしまう。
    // scroll="paper" では DialogContent 側がスクロールを担うため、Paper 自身の切り抜きは不要。
    const baseStyle = {
        overflow: "visible",
        [`& .${dialogTitleClasses.root}`]: { cursor: "move", touchAction: "none" }
    };

    // 未操作 (bounds が null) の間は Dialog 既定のレイアウト (中央寄せ・maxWidth 依存) を保ち、開いた直後の見え方を変えない。
    // 操作後は translate + 明示 px へ切り替わる。
    if (bounds == null) {
        return baseStyle;
    }

    const rect = toRect(bounds, viewport);
    const translate = toTranslate(rect, viewport);

    return {
        ...baseStyle,
        transform: `translate(${translate.offsetX}px, ${translate.offsetY}px)`,
        width: `${rect.width}px`, height: `${rect.height}px`,
        maxWidth: "none", maxHeight: "none"
    };
};

/** Reverse-computes assuming the Paper is centered by its container. */
const toTranslate = (rect: DialogRect, viewport: Viewport): { offsetX: number, offsetY: number } => {
    return {
        offsetX: rect.left + rect.width / 2 - viewport.width / 2,
        offsetY: rect.top + rect.height / 2 - viewport.height / 2
    };
};

const toBounds = (rect: DialogRect, viewport: Viewport): DialogBounds => {
    return {
        leftRatio: rect.left / viewport.width, topRatio: rect.top / viewport.height,
        widthRatio: rect.width / viewport.width, heightRatio: rect.height / viewport.height
    };
};

export default DraggableDialog;
