import { Box, ButtonGroup, FormControl, IconButton, MenuItem, Select, SelectChangeEvent } from "@mui/material";
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ZoomInIcon from '@mui/icons-material/ZoomIn';

type DisplayScalePanelProps = {
    scale: number,
    onChangeScale: (updating: number) => void
};

const findNearestPresetIndex = (scale: number): number => {
    let best = 0;
    let bestDist = Math.abs(DISPLAY_SCALES[0] - scale);
    for (let i = 1; i < DISPLAY_SCALES.length; i++) {
        const dist = Math.abs(DISPLAY_SCALES[i] - scale);
        if (dist < bestDist) {
            best = i;
            bestDist = dist;
        }
    }
    return best;
};

const DisplayScalePanel = ({ scale, onChangeScale }: DisplayScalePanelProps) => {

    const handleChangeScale = (event: SelectChangeEvent<number>) => {
        const nextValue = event.target.value as number;
        if (scale === nextValue) {
            return;
        }

        onChangeScale(nextValue);
    };

    const exactIndex = DISPLAY_SCALES.indexOf(scale as typeof DISPLAY_SCALES[number]);
    const nearestIndex = exactIndex >= 0 ? exactIndex : findNearestPresetIndex(scale);

    const handleZoomOut = () => {
        const targetIndex = exactIndex >= 0 ? exactIndex - 1 : Math.max(nearestIndex - 1, 0);
        if (targetIndex < 0) return;
        onChangeScale(DISPLAY_SCALES[targetIndex]);
    };

    const handleZoomIn = () => {
        const targetIndex = exactIndex >= 0 ? exactIndex + 1 : Math.min(nearestIndex + 1, DISPLAY_SCALES.length - 1);
        if (targetIndex >= DISPLAY_SCALES.length) return;
        onChangeScale(DISPLAY_SCALES[targetIndex]);
    };

    const customLabel = `${(scale * 100).toFixed(0)} %`;

    const panelStyle = {
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

    const buttonStyle = { display: 'flex', flexDirection: 'row', height: '100%', width: '100%' };

    return (
        <Box sx={panelStyle}>
            <ButtonGroup orientation="horizontal" aria-label="horizontal button group" sx={buttonStyle}>
                <IconButton aria-label="zoom out" size="small"
                    disabled={nearestIndex <= 0 && exactIndex === 0} onClick={handleZoomOut}>
                    <ZoomOutIcon />
                </IconButton>
                <FormControl size="small" sx={{ width: "100px" }}>
                    <Select id="select-display-scale" value={scale}
                        renderValue={() => customLabel}
                        onChange={handleChangeScale}>
                        {DISPLAY_SCALES
                            .map(s => initScaleInfo(s))
                            .map(s => <MenuItem key={`select-scale-${s.label}`} value={s.value}>
                                {s.label}
                            </MenuItem>)}
                    </Select>
                </FormControl>
                <IconButton aria-label="zoom in" size="small"
                    disabled={nearestIndex >= DISPLAY_SCALES.length - 1 && exactIndex === DISPLAY_SCALES.length - 1} onClick={handleZoomIn}>
                    <ZoomInIcon />
                </IconButton>
            </ButtonGroup>
        </Box>
    );
};

const initScaleInfo = (scale: number) => {
    return {
        label: `${(scale * 100).toFixed(0)} %`,
        value: scale
    };
};

const DISPLAY_SCALES = [0.05, 0.1, 0.25, 0.5, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

export default DisplayScalePanel;
