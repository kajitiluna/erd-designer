import React from "react";
import { Box, ButtonGroup, FormControl, IconButton, MenuItem, Select, SelectChangeEvent } from "@mui/material";
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ZoomInIcon from '@mui/icons-material/ZoomIn';

import ViewportContext from "~/context/ViewportContext";

const DISPLAY_SCALES = [0.05, 0.1, 0.25, 0.5, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as readonly number[];

const DisplayScalePanel = () => {
    const { scaleState, viewport } = React.useContext(ViewportContext);
    const nearestIndex = findNearestPresetIndex(scaleState.scale);

    const handleChangeScale = (event: SelectChangeEvent<number>) => {
        const nextValue = event.target.value as number;
        if (scaleState.scale === nextValue) {
            return;
        }
        viewport.zoomTo(nextValue);
    };

    const handleZoomOut = () => {
        const targetIndex = Math.max(nearestIndex - 1, 0);
        viewport.zoomTo(DISPLAY_SCALES[targetIndex]);
    };

    const handleZoomIn = () => {
        const targetIndex = Math.min(nearestIndex + 1, DISPLAY_SCALES.length - 1);
        viewport.zoomTo(DISPLAY_SCALES[targetIndex]);
    };

    return (
        <Box sx={PANEL_STYLE}>
            <ButtonGroup orientation="horizontal" aria-label="horizontal button group" sx={BUTTON_STYLE}>
                <IconButton aria-label="zoom out" size="small"
                    disabled={nearestIndex <= 0} onClick={handleZoomOut}>
                    <ZoomOutIcon />
                </IconButton>
                <FormControl size="small" sx={{ width: "100px" }}>
                    <Select id="select-display-scale" value={scaleState.scale} onChange={handleChangeScale}>
                        {DISPLAY_SCALES.map(scale => {
                            const label = `${(scale * 100).toFixed(0)} %`;
                            return (
                                <MenuItem key={`select-scale-${label}`} value={scale}>{label}</MenuItem>
                            );
                        })}
                        {!DISPLAY_SCALES.includes(scaleState.scale) && (
                            <MenuItem value={scaleState.scale} sx={{ display: "none" }}>
                                {`${(scaleState.scale * 100).toFixed(0)} %`}
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

    let best = 0;
    let bestDist = Math.abs(DISPLAY_SCALES[0] - scale);
    for (let index = 1; index < DISPLAY_SCALES.length; index++) {
        const dist = Math.abs(DISPLAY_SCALES[index] - scale);
        if (dist < bestDist) {
            best = index;
            bestDist = dist;
        }
    }

    return best;
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

export default DisplayScalePanel;
