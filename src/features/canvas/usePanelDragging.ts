import React from "react";

import useStateRef from "~/components/useStateRef";

type PanelPositionStyle = { top: string, left: string, transform?: string };

/**
 * Moves a fixed-position panel by dragging a handle inside it.
 * The position lives only in component state, so a reload restores `defaultPosition`.
 */
const usePanelDragging = (defaultPosition: PanelPositionStyle) => {
    const [panelElement, panelRef] = useStateRef<HTMLDivElement>();
    const [placement, setPlacement] = React.useState<PanelPlacement | null>(null);
    const [session, setSession] = React.useState<DragSession>(IDLE_SESSION);
    const [viewport, setViewport] = React.useState<Viewport>(currentViewport);

    // 保存値はリサイズ前のウィンドウ基準なので、描画時に現在のウィンドウで再クランプする
    React.useEffect(() => {
        const handleViewportResize = () => {
            const resizedViewport = currentViewport();
            setViewport(resizedViewport);
        };

        window.addEventListener("resize", handleViewportResize);
        return () => window.removeEventListener("resize", handleViewportResize);
    }, []);

    const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
        if ((event.button !== 0) || (panelElement == null)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);

        // 既定配置は transform を含み得るため、style の値ではなく実測した矩形を起点にする
        const base = rectOf(panelElement);
        const origin = { x: event.clientX, y: event.clientY };
        setSession({ status: "moving", pointerId: event.pointerId, origin, base });
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
        if ((session.status === "idle") || (session.pointerId !== event.pointerId)) {
            return;
        }

        const movedPlacement = {
            left: session.base.left + event.clientX - session.origin.x,
            top: session.base.top + event.clientY - session.origin.y,
            width: session.base.width
        };
        const nextPlacement = clampPlacement(movedPlacement, viewport);
        setPlacement(nextPlacement);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
        if ((session.status === "idle") || (session.pointerId !== event.pointerId)) {
            return;
        }

        setSession(IDLE_SESSION);
    };

    const resetPlacement = () => {
        setPlacement(null);
        setSession(IDLE_SESSION);
    };

    const positionStyle = initPositionStyle(placement, viewport, defaultPosition);
    const handleProps = {
        onPointerDown: handlePointerDown, onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp, onPointerCancel: handlePointerUp
    };

    return { panelRef, positionStyle, handleProps, dragStatus: session.status, resetPlacement };
};

const currentViewport = (): Viewport => {
    return { width: window.innerWidth, height: window.innerHeight };
};

const rectOf = (panelElement: HTMLDivElement): PanelPlacement => {
    const rectangle = panelElement.getBoundingClientRect();

    return { left: rectangle.left, top: rectangle.top, width: rectangle.width };
};

// パネルはウィンドウより縦に長くなり得るため、縦は全体でなく上端の掴み帯だけを収める
const clampPlacement = (placement: PanelPlacement, viewport: Viewport): PanelPlacement => {
    const maximumLeft = Math.max(0, viewport.width - placement.width);
    const maximumTop = Math.max(0, viewport.height - VISIBLE_HANDLE_HEIGHT);
    const left = clamp(placement.left, 0, maximumLeft);
    const top = clamp(placement.top, 0, maximumTop);

    return { left, top, width: placement.width };
};

/** Height of the top strip always kept inside the viewport so the handle can be grabbed again */
const VISIBLE_HANDLE_HEIGHT = 24;

const clamp = (value: number, minimum: number, maximum: number): number => {
    return Math.min(Math.max(value, minimum), maximum);
};

// 未操作 (placement が null) の間は呼び出し側の既定配置を保つ
const initPositionStyle = (
    placement: PanelPlacement | null, viewport: Viewport, defaultPosition: PanelPositionStyle
): PanelPositionStyle => {
    if (placement == null) {
        return defaultPosition;
    }

    const clamped = clampPlacement(placement, viewport);
    return { top: `${clamped.top}px`, left: `${clamped.left}px` };
};

type Viewport = { width: number, height: number };

/** A px position with its origin at the viewport's top-left. */
type PanelPlacement = { left: number, top: number, width: number };

type DragSession =
    { status: "idle" }
    | { status: "moving", pointerId: number, origin: { x: number, y: number }, base: PanelPlacement };

const IDLE_SESSION: DragSession = { status: "idle" } as const;

export default usePanelDragging;
