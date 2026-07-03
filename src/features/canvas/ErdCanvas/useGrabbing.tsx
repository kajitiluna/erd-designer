import React from "react";

import { CanvasViewport } from "~/context/ViewportContext";
import EditMode, { EditModeType } from "~/models/EditMode";

type Point = { x: number, y: number };

/**
 * ErdCanvas 内部専用モジュール。外部からの import は禁止 (ESLint no-restricted-imports で検査)。
 *
 * Canvas の grab 操作 (右/中クリックや GRAB モードでの視点移動) を提供するフック。
 * grab 用の透明パネルと、Canvas 側から grab を開始するための関数を返す。
 */
export const useGrabbing = (viewport: CanvasViewport, editMode: EditMode) => {
    const grabbingPanelRef = React.useRef<HTMLDivElement>(null);
    const [availableGrabbing, setAvailableGrabbing] = React.useState<boolean>(false);

    // grabbing 操作による Canvas 移動の起点となる位置を保持する
    const [isGrabbing, setGrabbing] = React.useState<boolean>(false);
    const grabbingAnimationRef = React.useRef<number | null>(null);

    const handleGrabMouseDown = React.useCallback((event: React.MouseEvent) => {
        if (grabbingPanelRef.current == null) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const startPosition = viewport.getLogicalPosition(event);
        setGrabbing(true);

        const onGrabEndFromPanel = () => setGrabbing(false);
        performGrabbing({
            viewport,
            grabbingPanelRef, grabbingAnimationRef, startPosition,
            onGrabEnd: onGrabEndFromPanel
        });
    }, [viewport]);

    const grabPanelStyle = React.useMemo<React.CSSProperties>(() => {
        return {
            position: "absolute", top: 0, left: 0,
            width: ((editMode === EditModeType.GRAB) || availableGrabbing) ? "100%" : "0px",
            height: ((editMode === EditModeType.GRAB) || availableGrabbing) ? "100%" : "0px",
            cursor: isGrabbing ? "grabbing" : "grab"
        };
    }, [editMode, availableGrabbing, isGrabbing]);

    const grabbingPanel = (<div ref={grabbingPanelRef} style={grabPanelStyle} onMouseDown={handleGrabMouseDown} />);

    const startGrabbing = (position: Point) => {
        if (editMode === EditModeType.GRAB) {
            return;
        }

        setGrabbing(true);
        setAvailableGrabbing(true);

        const onGrabEndFromCanvas = () => {
            setGrabbing(false);
            setAvailableGrabbing(false);
        };

        performGrabbing({
            viewport, grabbingPanelRef, grabbingAnimationRef, startPosition: position,
            onGrabEnd: onGrabEndFromCanvas
        });
    };

    return { grabbingPanel, startGrabbing };
};

type PerformGrabbingArgs = {
    viewport: CanvasViewport;
    grabbingPanelRef: React.RefObject<HTMLDivElement | null>;
    grabbingAnimationRef: React.RefObject<number | null>;
    startPosition: Point;
    onGrabEnd: () => void;
};

const performGrabbing = ({
    viewport, grabbingPanelRef, grabbingAnimationRef, startPosition, onGrabEnd
}: PerformGrabbingArgs) => {

    if (grabbingPanelRef.current == null) {
        return;
    }

    const handleMouseMove = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        if (grabbingAnimationRef.current) {
            cancelAnimationFrame(grabbingAnimationRef.current);
        }

        const clientX = event.clientX;
        const clientY = event.clientY;

        grabbingAnimationRef.current = requestAnimationFrame(() => {
            if (viewport.isMounted() === false) {
                grabbingAnimationRef.current = null;
                return;
            }

            const { viewportPosition, screenCenter, scale: currentScale } = viewport.getViewInfo();

            const newCenterX = startPosition.x - (clientX - screenCenter.x) / currentScale;
            const newCenterY = startPosition.y - (clientY - screenCenter.y) / currentScale;

            const deltaX = Math.abs(newCenterX - viewportPosition.centerX);
            const deltaY = Math.abs(newCenterY - viewportPosition.centerY);
            if (deltaX + deltaY < 0.5) {
                grabbingAnimationRef.current = null;
                return;
            }

            viewport.updateViewportPosition(newCenterX, newCenterY);
            grabbingAnimationRef.current = null;
        });
    };

    const handleDragEnd = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        onGrabEnd();

        if (grabbingPanelRef.current == null) {
            return;
        }

        grabbingPanelRef.current.removeEventListener("mousemove", handleMouseMove);
        grabbingPanelRef.current.removeEventListener("mouseup", handleDragEnd);
    };

    grabbingPanelRef.current.addEventListener("mouseup", handleDragEnd);
    grabbingPanelRef.current.addEventListener("mousemove", handleMouseMove);
};
