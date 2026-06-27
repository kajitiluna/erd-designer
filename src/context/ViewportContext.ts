import React from "react";

import { inOpenControlPanel } from "~/components/support";

type ViewportPosition = { centerX: number; centerY: number };
type ViewportScaleState = { scale: number; phase: "idle" | "scaling" };
type Point = { x: number; y: number };

export interface CanvasViewport {

    isMounted(): boolean;

    /**
     * 論理座標をキャンバス上の物理座標に変換する。
     * 無限キャンバスでは論理座標 = 物理座標なので恒等変換となる。
     */
    toPhysicalPosition(logicalPosition: Point): Point;

    /**
     * displayScale の表示拡大率を無視した、論理的な点座標を取得する。
     * 論理的な点座標とは、キャンバス中央を (0, 0) とした無制限の座標を指す。
     */
    getLogicalPosition(event: React.MouseEvent | MouseEvent): Point;

    getViewInfo(): { viewportPosition: ViewportPosition; screenCenter: Point; scale: number };

    zoomTo(newScale: number): void;

    updateViewportPosition(centerX: number, centerY: number): void;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 2;
const ZOOM_SENSITIVITY = 0.002;
const ZOOM_DEBOUNCE_MS = 100;
const GRID_SIZE = 25;
const GRID_VISIBLE_THRESHOLD = 0.5;

class CanvasViewportImpl implements CanvasViewport {

    private readonly viewportRef: React.RefObject<HTMLDivElement | null>;
    private readonly canvasRef: React.RefObject<HTMLDivElement | null>;
    private readonly viewportPositionRef: React.RefObject<ViewportPosition>;
    private readonly scaleRef: React.RefObject<number>;
    private readonly setScaleState: React.Dispatch<React.SetStateAction<ViewportScaleState>>;

    constructor(
        viewportRef: React.RefObject<HTMLDivElement | null>,
        canvasRef: React.RefObject<HTMLDivElement | null>,
        viewportPositionRef: React.RefObject<ViewportPosition>,
        scaleRef: React.RefObject<number>,
        setScaleState: React.Dispatch<React.SetStateAction<ViewportScaleState>>
    ) {
        this.viewportRef = viewportRef;
        this.canvasRef = canvasRef;
        this.viewportPositionRef = viewportPositionRef;
        this.scaleRef = scaleRef;
        this.setScaleState = setScaleState;
    }

    public applyTransform(): void {
        const canvas = this.canvasRef.current;
        const viewport = this.viewportRef.current;
        if (!canvas || !viewport) {
            return;
        }

        const centerX = this.viewportPositionRef.current.centerX;
        const centerY = this.viewportPositionRef.current.centerY;
        const currentScale = this.scaleRef.current;
        const screenCenterX = viewport.clientWidth / 2;
        const screenCenterY = viewport.clientHeight / 2;

        const translateX = screenCenterX - centerX * currentScale;
        const translateY = screenCenterY - centerY * currentScale;

        canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
        this.updateGridBackground(viewport, translateX, translateY, currentScale);
    }

    private updateGridBackground(
        viewport: HTMLElement, translateX: number, translateY: number, currentScale: number
    ): void {
        if (currentScale < GRID_VISIBLE_THRESHOLD) {
            viewport.style.backgroundImage = "none";
            return;
        }

        const gridSpacing = GRID_SIZE * currentScale;
        const gridOffsetX = ((translateX % gridSpacing) + gridSpacing) % gridSpacing;
        const gridOffsetY = ((translateY % gridSpacing) + gridSpacing) % gridSpacing;

        viewport.style.backgroundImage = buildLinearGradient([0, 90]);
        viewport.style.backgroundSize = `${gridSpacing}px ${gridSpacing}px`;
        viewport.style.backgroundPosition = `${gridOffsetX}px ${gridOffsetY}px`;
        viewport.style.backgroundAttachment = "local";
    }

    public isMounted(): boolean {
        return (this.viewportRef.current != null);
    }

    public toPhysicalPosition(logicalPosition: Point): Point {
        return { x: logicalPosition.x, y: logicalPosition.y };
    }

    public getLogicalPosition(event: React.MouseEvent | MouseEvent): Point {
        const screenCenter = this.getScreenCenter();
        const viewport = this.viewportPositionRef.current;
        const currentScale = this.scaleRef.current;

        const logicalX = (viewport?.centerX ?? 0) + (event.clientX - screenCenter.x) / (currentScale ?? 1);
        const logicalY = (viewport?.centerY ?? 0) + (event.clientY - screenCenter.y) / (currentScale ?? 1);

        return {
            x: Math.floor(logicalX * 100) / 100,
            y: Math.floor(logicalY * 100) / 100
        };
    }

    public getViewInfo(): { viewportPosition: ViewportPosition; screenCenter: Point; scale: number } {
        return {
            viewportPosition: this.viewportPositionRef.current ?? { centerX: 0, centerY: 0 },
            screenCenter: this.getScreenCenter(),
            scale: this.scaleRef.current ?? 1,
        };
    }

    private getScreenCenter(): Point {
        const viewportRect = this.viewportRef.current?.getBoundingClientRect();
        const viewportLeft = viewportRect?.left ?? 0;
        const viewportWidth = viewportRect?.width ?? window.innerWidth;
        const viewportTop = viewportRect?.top ?? 0;
        const viewportHeight = viewportRect?.height ?? window.innerHeight;

        return {
            x: viewportLeft + viewportWidth / 2,
            y: viewportTop + viewportHeight / 2
        };
    }

    public updateViewportPosition(centerX: number, centerY: number): void {
        if (!this.viewportPositionRef.current) {
            return;
        }

        this.viewportPositionRef.current.centerX = centerX;
        this.viewportPositionRef.current.centerY = centerY;
        this.applyTransform();
    }

    public zoomTo(newScale: number): void {
        this.scaleRef.current = newScale;
        this.applyTransform();
        this.setScaleState({ scale: newScale, phase: "idle" });
    }

    public panBy(screenDeltaX: number, screenDeltaY: number): void {
        const currentScale = this.scaleRef.current;
        this.viewportPositionRef.current.centerX += screenDeltaX / currentScale;
        this.viewportPositionRef.current.centerY += screenDeltaY / currentScale;
        this.applyTransform();
    }

    public zoomWheel(deltaY: number): boolean {
        const oldScale = this.scaleRef.current;
        const factor = Math.pow(2, -deltaY * ZOOM_SENSITIVITY);
        const clampedScale = Math.max(MIN_SCALE, oldScale * factor);
        const newScale = Math.min(MAX_SCALE, clampedScale);
        if (newScale === oldScale) {
            return false;
        }

        this.scaleRef.current = newScale;
        this.applyTransform();
        this.setScaleState(toScalingPhase);

        return true;
    }

    public finalizeZoom(): void {
        this.setScaleState({ scale: this.scaleRef.current, phase: "idle" });
    }
}

type ViewportContextValue = {
    viewport: CanvasViewport;
    scaleState: ViewportScaleState;
};

const ViewportContext = React.createContext<ViewportContextValue>({} as ViewportContextValue);

export default ViewportContext;

type UseViewportArgs = {
    viewportRef: React.RefObject<HTMLDivElement | null>;
    canvasRef: React.RefObject<HTMLDivElement | null>;
    isDraggingRef: React.RefObject<boolean>;
};

export const useViewport = ({
    viewportRef, canvasRef, isDraggingRef
}: UseViewportArgs): { viewport: CanvasViewport; scaleState: ViewportScaleState } => {

    const positionRef = React.useRef<ViewportPosition>({ centerX: 0, centerY: 0 });
    const scaleRef = React.useRef<number>(1);
    const zoomTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const [scaleState, setScaleState] = React.useState<ViewportScaleState>({ scale: 1, phase: "idle" });

    const viewport = React.useMemo(
        () => new CanvasViewportImpl(viewportRef, canvasRef, positionRef, scaleRef, setScaleState),
        [viewportRef, canvasRef]
    );

    React.useLayoutEffect(() => {
        viewport.applyTransform();
    }, [viewport]);

    React.useEffect(() => {
        const wheelHandler = initWheelHandler({ isDraggingRef, zoomTimerRef, viewport });
        window.addEventListener("wheel", wheelHandler, { passive: false, capture: true });

        return () => {
            window.removeEventListener("wheel", wheelHandler, { capture: true });

            if (zoomTimerRef.current) {
                clearTimeout(zoomTimerRef.current);
                zoomTimerRef.current = null;
            }
        };
    }, [isDraggingRef, viewport]);

    return { viewport, scaleState };
};

type WheelHandlerArgs = {
    isDraggingRef: React.RefObject<boolean>;
    zoomTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
    viewport: CanvasViewportImpl;
};

const initWheelHandler = ({ isDraggingRef, zoomTimerRef, viewport }: WheelHandlerArgs) => {
    return (event: WheelEvent) => {
        if (inOpenControlPanel()) {
            return;
        }

        if (isDraggingRef.current) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (event.ctrlKey || event.metaKey) {
            const changed = viewport.zoomWheel(event.deltaY);
            if (!changed) {
                return;
            }

            if (zoomTimerRef.current) {
                clearTimeout(zoomTimerRef.current);
            }

            const syncScaleAfterZoom = () => {
                viewport.finalizeZoom();
                zoomTimerRef.current = null;
            };

            zoomTimerRef.current = setTimeout(syncScaleAfterZoom, ZOOM_DEBOUNCE_MS);
            return;
        }

        viewport.panBy(event.deltaX, event.deltaY);
    };
};

const toScalingPhase = (previous: ViewportScaleState): ViewportScaleState => {
    if (previous.phase === "scaling") {
        return previous;
    }

    return { ...previous, phase: "scaling" };
};

const buildLinearGradient = (degrees: number[]) =>
    degrees.map(degree =>
        `linear-gradient(${degree}deg, #EFEFEF 0%, #EFEFEF 5%, rgba(255,255,255,0) 5%, rgba(255,255,255,0) 100%)`
    ).join(", ");
