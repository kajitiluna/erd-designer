import { Box, ButtonGroup, FormControl, IconButton, MenuItem, Select, SelectChangeEvent } from "@mui/material";
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ZoomInIcon from '@mui/icons-material/ZoomIn';

type DisplayScalePanelProps = {
    scale: number,
    onChangeScale: (updating: number) => void
};

const DisplayScalePanel = ({ scale, onChangeScale }: DisplayScalePanelProps) => {

    const handleChangeScale = (event: SelectChangeEvent<number>) => {
        const nextValue = event.target.value as number;
        if (scale === nextValue) {
            return;
        }

        onChangeScale(nextValue);
    };

    const scaleIndex = DISPLAY_SCALES.indexOf(scale as typeof DISPLAY_SCALES[number]);
    if (scaleIndex < 0) {
        onChangeScale(1);
        return (<></>);
    }

    const handleZoomOut = () => {
        if (scaleIndex <= 0) {
            return;
        }

        const nextScale = DISPLAY_SCALES[scaleIndex - 1];
        onChangeScale(nextScale);
    };

    const handleZoomIn = () => {
        if (scaleIndex >= DISPLAY_SCALES.length - 1) {
            return;
        }

        const nextScale = DISPLAY_SCALES[scaleIndex + 1];
        onChangeScale(nextScale);
    };

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
                    disabled={scaleIndex <= 0} onClick={handleZoomOut}>
                    <ZoomOutIcon />
                </IconButton>
                <FormControl size="small" sx={{ width: "100px" }}>
                    <Select id="select-display-scale" value={scale} onChange={handleChangeScale}>
                        {DISPLAY_SCALES
                            .map(scale => initScaleInfo(scale))
                            .map(scale => <MenuItem key={`select-scale-${scale.label}`} value={scale.value}>
                                {scale.label}
                            </MenuItem>)}
                    </Select>
                </FormControl>
                <IconButton aria-label="zoom in" size="small"
                    disabled={scaleIndex >= DISPLAY_SCALES.length - 1} onClick={handleZoomIn}>
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
