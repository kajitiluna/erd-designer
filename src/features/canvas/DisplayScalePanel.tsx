import React from "react";
import { Box, ButtonGroup, FormControl, IconButton, MenuItem, Select, SelectChangeEvent } from "@mui/material";
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import { inOpenControlPanel } from "~/features/canvas/support";
import { ScaleState } from "~/context/DisplayScaleContext";
import { DragActionContext } from "~/context/DragActionContext";

type DisplayScalePanelProps = {
    scaleStatus: ScaleState,
    onChangeScale: React.Dispatch<React.SetStateAction<ScaleState>>,
    canvasArea: { width: number; height: number }
};

const DisplayScalePanel = ({ scaleStatus, onChangeScale, canvasArea }: DisplayScalePanelProps) => {

    const scaleRef = React.useRef<number>(1);
    const zoomTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const dragState = React.useContext(DragActionContext);
    const isDraggingRef = React.useRef<boolean>(false);

    const handleChangeScale = (event: SelectChangeEvent<number>) => {
        const nextValue = event.target.value as number;
        if (scaleStatus.scale === nextValue) {
            return;
        }

        onChangeScale({ ...scaleStatus, scale: nextValue });
    };

    const nearestIndex = findNearestPresetIndex(scaleStatus.scale);

    const handleZoomOut = () => {
        // ドラッグ中はズーム操作を無視する
        if (isDraggingRef.current) {
            return;
        }

        const targetIndex = Math.max(nearestIndex - 1, 0);
        if (targetIndex < 0) {
            return;
        }

        onChangeScale({ ...scaleStatus, scale: DISPLAY_SCALES[targetIndex] });
    };

    const handleZoomIn = () => {
        // ドラッグ中はズーム操作を無視する
        if (isDraggingRef.current) {
            return;
        }

        const targetIndex = Math.min(nearestIndex + 1, DISPLAY_SCALES.length - 1);
        if (targetIndex >= DISPLAY_SCALES.length) {
            return;
        }

        onChangeScale({ ...scaleStatus, scale: DISPLAY_SCALES[targetIndex] });
    };
    React.useEffect(() => {
        scaleRef.current = scaleStatus.scale;
    }, [scaleStatus]);

    React.useEffect(() => {
        isDraggingRef.current = (dragState.status === "on_dragging");
    }, [dragState]);

    React.useEffect(() => {
        const handleWheel = initHandleWheel(scaleRef, zoomTimerRef, isDraggingRef, onChangeScale, canvasArea);
        window.addEventListener("wheel", handleWheel, { passive: false, capture: true });

        return () => {
            window.removeEventListener("wheel", handleWheel, { capture: true });

            if (zoomTimerRef.current) {
                clearTimeout(zoomTimerRef.current);
                zoomTimerRef.current = null;
            }
        }
    }, []);

    return (
        <Box sx={PANEL_STYLE}>
            <ButtonGroup orientation="horizontal" aria-label="horizontal button group" sx={BUTTON_STYLE}>
                <IconButton aria-label="zoom out" size="small"
                    disabled={nearestIndex <= 0} onClick={handleZoomOut}>
                    <ZoomOutIcon />
                </IconButton>
                <FormControl size="small" sx={{ width: "100px" }}>
                    <Select id="select-display-scale" value={scaleStatus.scale} onChange={handleChangeScale}>
                        {DISPLAY_SCALES
                            .map(scale => initScaleInfo(scale))
                            .map(scale => <MenuItem key={`select-scale-${scale.label}`} value={scale.value}>
                                {scale.label}
                            </MenuItem>)}
                        {!DISPLAY_SCALES.includes(scaleStatus.scale) && (
                            <MenuItem value={scaleStatus.scale} sx={{ display: "none" }}>
                                {`${(scaleStatus.scale * 100).toFixed(0)} %`}
                            </MenuItem>
                        )}
                    </Select>
                </FormControl>
                <IconButton aria-label="zoom in" size="small"
                    disabled={nearestIndex >= DISPLAY_SCALES.length - 1} onClick={handleZoomIn}>
                    <ZoomInIcon />
                </IconButton>
            </ButtonGroup>
        </Box>
    );
};

const findNearestPresetIndex = (scale: number): number => {
    const exactIndex = DISPLAY_SCALES.indexOf(scale);
    if (exactIndex >= 0) {
        return exactIndex;
    }

    let best = 1;
    let bestDist = Math.abs(DISPLAY_SCALES[1] - scale);
    for (let index = 2; index < DISPLAY_SCALES.length - 1; index++) {
        const dist = Math.abs(DISPLAY_SCALES[index] - scale);
        if (dist < bestDist) {
            best = index;
            bestDist = dist;
        }
    }

    return best;
};

const initHandleWheel = (
    scaleRef: React.RefObject<number>, zoomTimerRef: React.RefObject<NodeJS.Timeout | null>,
    isDraggingRef: React.RefObject<boolean>,
    onChangeScale: React.Dispatch<React.SetStateAction<ScaleState>>,
    canvasArea: { width: number; height: number }
) => {
    return (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) {
            return;
        }

        // ドラッグ操作中はズームを無視する
        if (isDraggingRef.current) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        // ダイアログが表示されているときはキー操作を無視する
        const inOpenControlPane = inOpenControlPanel();
        if (inOpenControlPane) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const oldScale = scaleRef.current;
        const factor = Math.pow(2, -event.deltaY * ZOOM_SENSITIVITY);
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * factor));
        if (newScale === oldScale) {
            return;
        }

        scaleRef.current = newScale;

        onChangeScale(previous => {
            if (previous.phase === "scaling") {
                return previous;
            }

            return { ...previous, phase: "scaling" };
        });

        const canvas = document.getElementById("erd-canvas");
        if (canvas) {
            canvas.style.transform = `scale(${newScale})`;
        }

        // スケールの原点
        const originX = canvasArea.width;
        const originY = canvasArea.height;
        // 現在のビューポートの中央
        const screenCenterCanvasX = window.scrollX + window.innerWidth / 2;
        const screenCenterCanvasY = window.scrollY + window.innerHeight / 2;
        // ビューポート中央の論理座標
        const canvasPointX = (screenCenterCanvasX - originX * (1 - oldScale)) / oldScale;
        const canvasPointY = (screenCenterCanvasY - originY * (1 - oldScale)) / oldScale;
        // スケール変更後に中央を同一に保つためのスクロール量
        const newScreenX = canvasPointX * newScale + originX * (1 - newScale) - window.innerWidth / 2;
        const newScreenY = canvasPointY * newScale + originY * (1 - newScale) - window.innerHeight / 2;

        window.scrollTo(newScreenX, newScreenY);

        if (zoomTimerRef.current) {
            clearTimeout(zoomTimerRef.current);
        }

        zoomTimerRef.current = setTimeout(() => {
            onChangeScale({ scale: scaleRef.current, phase: "idle" });
            zoomTimerRef.current = null;
        }, 100);
    };
};

const PANEL_STYLE = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid white",
    borderRadius: "15px",
    boxShadow: "5px 5px 30px 0px #bebebe",
    paddingTop: "5px",
    paddingBottom: "5px",
    backgroundColor: "#FFFFFF"
};

const BUTTON_STYLE = { display: 'flex', flexDirection: 'row', height: '100%', width: '100%' };

const initScaleInfo = (scale: number) => {
    return {
        label: `${(scale * 100).toFixed(0)} %`,
        value: scale
    };
};

const DISPLAY_SCALES = [0.05, 0.1, 0.25, 0.5, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const MIN_SCALE = DISPLAY_SCALES[0];
const MAX_SCALE = DISPLAY_SCALES[DISPLAY_SCALES.length - 1];

const ZOOM_SENSITIVITY = 0.002;

export default DisplayScalePanel;
