import React from "react";
import {
    Box, Button, ButtonGroup, Divider, FormControl, FormControlLabel, InputLabel, Menu, MenuItem,
    Select, SelectChangeEvent, Switch, ToggleButton, ToggleButtonGroup, Tooltip
} from "@mui/material";
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import PanToolIcon from '@mui/icons-material/PanTool';
import TableChartIcon from '@mui/icons-material/TableChart';
import PolylineIcon from '@mui/icons-material/Polyline';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';

import EditMode, { EditModeType } from "~/models/EditMode";
import EditModeContext from "~/context/EditModeContext";
import ErdDocument from "~/models/ErdDocument";
import ColorValue from "~/models/ColorValue";
import ColorSelector from "~/components/ColorSelector";
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ExportDdlView from "~/features/editor/ExportDdlView";
import download from "~/components/file-downloader";
import PerspectiveModel from "~/models/PerspectiveModel";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { RELEASE_ACTION, SelectEntityContext } from "~/context/SelectEntityContext";
import { LocalSettingContext } from "~/context/LocalSettingContext";
import ExportSpecificationContext, { ImageContent } from "~/context/ExportSpecificationContext";
import DescriptionTooltip from "~/features/canvas/DescriptionTooltip";
import { downloadHtml } from "~/features/export/htmlExporter";
import { downloadPng } from "~/features/export/pngExporter";
import { downloadSvg } from "~/features/export/svgExporter";

type CanvasArea = { width: number, height: number };

type ControlPanelProps = {
    erdExportable: boolean,
    drawableArea: CanvasArea
};

const ControlPanel = ({ erdExportable, drawableArea }: ControlPanelProps) => {
    return (
        <Box sx={PANEL_STYLE}>
            <EditModePanel />
            <ActionPanel />
            <SubMenuPanel erdExportable={erdExportable} drawableArea={drawableArea} />
        </Box>
    );
};

const PANEL_STYLE = {
    display: "flex",
    minWidth: "120px",
    maxWidth: "120px",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid white",
    borderRadius: "15px",
    boxShadow: "5px 5px 30px 0px #bebebe",
    paddingTop: "15px",
    paddingBottom: "15px",
    backgroundColor: "#FFFFFF"
};

const EditModePanel = () => {
    const { editMode, dispatchEditMode } = React.useContext(EditModeContext);

    const handleChange = (_event: React.MouseEvent<HTMLElement>, newValue: EditMode) => {
        if (newValue == null) {
            newValue = EditModeType.SELECT;
        }

        dispatchEditMode(newValue);
    };

    const buttonStyle = { display: 'flex', flexDirection: 'column', height: '100%', width: '100%' };

    return (
        <ToggleButtonGroup color="primary" orientation="vertical" sx={buttonStyle}
            exclusive value={editMode} onChange={handleChange} >
            <ToggleButton value={EditModeType.SELECT}>
                <Tooltip title={<h2>Select</h2>} placement="top">
                    <HighlightAltIcon />
                </Tooltip>
                Select
            </ToggleButton>
            <ToggleButton value={EditModeType.GRAB}>
                <Tooltip title={<h2>Grab</h2>} placement="top">
                    <PanToolIcon />
                </Tooltip>
                Grab
            </ToggleButton>
            <ToggleButton value={EditModeType.CREATE_TABLE}>
                <Tooltip title={<h2>Create table</h2>} placement="top">
                    <TableChartIcon />
                </Tooltip>
                Table
            </ToggleButton>
            <ToggleButton value={EditModeType.CREATE_RELATION}>
                <Tooltip title={<h2>Create relation</h2>} placement="top">
                    <PolylineIcon />
                </Tooltip>
                Relation
            </ToggleButton>
            <ToggleButton value={EditModeType.CREATE_MEMO}>
                <Tooltip title={<h2>Create memo</h2>} placement="top">
                    <StickyNote2Icon />
                </Tooltip>
                Memo
            </ToggleButton>
        </ToggleButtonGroup>
    );
};

const DEFAULT_PERSPECTIVE_ID = "__default_perspective_id__";

const ActionPanel = () => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { localSetting, dispatchLocalSetting } = React.useContext(LocalSettingContext);

    const erdDocument = documentsHolder.current();
    const erdSetting = erdDocument.erdSettingModel;
    const perspectiveModels = erdSetting.getPerspectiveModels();

    const perspectiveId = (localSetting.perspectiveId != "") ? localSetting.perspectiveId : DEFAULT_PERSPECTIVE_ID;

    const handleChangePerspective = (event: SelectChangeEvent<string>) => {
        const selectedValue = event.target.value;
        const nextPerspectiveId = (selectedValue !== DEFAULT_PERSPECTIVE_ID) ? selectedValue : "";
        dispatchLocalSetting({ type: "perspective", perspectiveId: nextPerspectiveId });
    };

    const perspectiveSelector = (
        <FormControl size="small" sx={{ padding: "0 6px", margin: "5px -1px 10px" }}>
            <InputLabel id="label-display-style">Perspective</InputLabel>
            <Select labelId="label-display-style" label="Perspective"
                sx={(perspectiveId !== DEFAULT_PERSPECTIVE_ID) ? { backgroundColor: "#fff59d" } : {}}
                value={perspectiveId} onChange={handleChangePerspective}>
                <MenuItem key={DEFAULT_PERSPECTIVE_ID} value={DEFAULT_PERSPECTIVE_ID}>(Default)</MenuItem>
                {perspectiveModels.map(perspective => (
                    <MenuItem key={perspective.perspectiveId} value={perspective.perspectiveId}>
                        {perspective.perspectiveName}
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );

    const handleChangeVisibleStyle = (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked;
        const visibleStyle = checked ? "half-bounded" : "both-bounded";

        dispatchLocalSetting({ type: "showLine", visibleStyle });
    };

    const lineVisibleSwitcher = (
        <FormControl sx={{ padding: "0 6px 6px 12px" }}>
            <DescriptionTooltip placement="right-end"
                title={"When the switch is active, show relations\neven if one table is hidden."}>
                <FormControlLabel sx={SWITCH_FORM_STYLE}
                    label="Show half-bounded line" control={
                        <Switch size="small" disabled={localSetting.perspectiveId === ""}
                            onChange={handleChangeVisibleStyle} />
                    } />
            </DescriptionTooltip>
        </FormControl>
    );

    const handleSetDefaultColor = (background: ColorValue, foreground: ColorValue) => {
        dispatchLocalSetting({
            type: "defaultColor",
            color: { background, foreground }
        });
    };

    return (
        <ButtonGroup orientation="vertical" aria-label="vertical button group" sx={ACTION_BUTTON_STYLE}>
            <ColorSelector color={localSetting.defaultColor.background}
                shape="rectangle" callback={handleSetDefaultColor} />

            {perspectiveSelector}
            {lineVisibleSwitcher}
            <Divider />

            <Button variant="text" startIcon={<UndoIcon />}
                disabled={!documentsHolder.canUndo()} onClick={() => documentsHolder.undo()}>
                Undo
            </Button>
            <Button variant="text" startIcon={<RedoIcon />}
                disabled={!documentsHolder.canRedo()} onClick={() => documentsHolder.redo()}>
                Redo
            </Button>
        </ButtonGroup>
    );
};

const SWITCH_FORM_STYLE = {
    marginRight: "6px",
    userSelect: "none",
    "& .MuiFormControlLabel-label": {
        fontSize: "0.7rem",
        color: "rgba(0, 0, 0, 0.6)"
    }
};

const ACTION_BUTTON_STYLE = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%'
};

type SubMenuButtonProps = {
    erdExportable: boolean,
    drawableArea: CanvasArea
};

const SubMenuPanel = ({ erdExportable, drawableArea }: SubMenuButtonProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { dispatchSelectAction } = React.useContext(SelectEntityContext);
    const { localSetting, dispatchLocalSetting } = React.useContext(LocalSettingContext);
    const [configureElement, setConfigureElement] = React.useState<HTMLElement | null>();
    const [selectedMenu, setSelectedMenu] = React.useState<"export_ddl" | "">("");
    const [exportImageElement, setExportImageElement] = React.useState<HTMLElement | null>(null);
    const [batchExportQueue, setBatchExportQueue] = React.useState<PerspectiveModel[]>([]);
    const [htmlExportPendingRestore, setHtmlExportPendingRestore] = React.useState<string | null>(null);
    const { exportSpecification } = React.useContext(ExportSpecificationContext);

    const erdDocument: ErdDocument = documentsHolder.current();

    React.useEffect(() => {
        if (batchExportQueue.length === 0) {
            return;
        }

        const timer = setTimeout(() => {
            const erdCanvas = document.getElementById("erd-canvas");
            if (erdCanvas == null) {
                setBatchExportQueue([]);
                return;
            }

            const current = batchExportQueue[0];
            const remaining = batchExportQueue.slice(1);

            downloadPng(erdCanvas, (contents: ImageContent) => {
                const fileName = `${erdDocument.documentName} - ${current.perspectiveName}.png`;
                download(fileName, contents.base64Value);

                if (remaining.length > 0) {
                    dispatchLocalSetting({ type: "perspective", perspectiveId: remaining[0].perspectiveId });
                    setBatchExportQueue(remaining);
                } else {
                    dispatchLocalSetting({ type: "perspective", perspectiveId: "" });
                    setBatchExportQueue([]);
                }
            });
        }, 500);

        return () => clearTimeout(timer);
    }, [batchExportQueue, erdDocument, dispatchLocalSetting]);

    React.useEffect(() => {
        if (htmlExportPendingRestore == null) return;

        const timer = setTimeout(() => {
            downloadHtml(erdDocument, drawableArea);
            dispatchLocalSetting({ type: "perspective", perspectiveId: htmlExportPendingRestore });
            setHtmlExportPendingRestore(null);
        }, 500);

        return () => clearTimeout(timer);
    }, [htmlExportPendingRestore, erdDocument, dispatchLocalSetting]);

    const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>) => setConfigureElement(event.currentTarget);

    const handleExportAsImage = () => {
        dispatchSelectAction(RELEASE_ACTION);

        downloadImage(erdDocument);
        handleCloseMenu();
    };

    const handleBatchExportPerspectives = () => {
        dispatchSelectAction(RELEASE_ACTION);

        const perspectives = erdDocument.erdSettingModel.getPerspectiveModels();
        if (perspectives.length === 0) {
            handleCloseMenu();
            return;
        }

        dispatchLocalSetting({ type: "perspective", perspectiveId: perspectives[0].perspectiveId });
        setBatchExportQueue(perspectives);
        handleCloseMenu();
    };

    const handleSaveAsHtml = () => {
        dispatchSelectAction(RELEASE_ACTION);
        handleCloseMenu();

        if (localSetting.perspectiveId !== "") {
            dispatchLocalSetting({ type: "perspective", perspectiveId: "" });
            setHtmlExportPendingRestore(localSetting.perspectiveId);
        } else {
            downloadHtml(erdDocument, drawableArea);
        }
    };

    const handleSaveAsSvg = () => {
        dispatchSelectAction(RELEASE_ACTION);

        downloadSvg(erdDocument, drawableArea);
        handleCloseMenu();
    };

    const handleExportSpecification = () => {
        downloadSpecification(erdDocument, exportSpecification);
        handleCloseMenu();
    };

    const handleSaveToJson = () => {
        downloadJson(erdDocument);
        handleCloseMenu();
    };

    const handleCloseMenu = () => {
        setSelectedMenu("");
        setConfigureElement(null);
        setExportImageElement(null);
    };

    const perspectives = erdDocument.erdSettingModel.getPerspectiveModels();
    const pngMenuItems = (perspectives.length === 0)
        ? (<MenuItem onClick={handleExportAsImage}>PNG</MenuItem>)
        : [
            <MenuItem onClick={handleExportAsImage}>PNG (Current canvas)</MenuItem>,
            <MenuItem onClick={handleBatchExportPerspectives}>PNG (All perspectives)</MenuItem>
        ];

    const isConfigureOpen = Boolean(configureElement);

    return (
        <>
            <Box sx={SUBMENU_BUTTON_STYLE}>
                <Button key="submenu-button" variant="text"
                    aria-expanded={isConfigureOpen} aria-haspopup="true"
                    endIcon={isConfigureOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    onClick={handleOpenMenu}>
                    Export
                </Button>
            </Box>

            <Menu anchorEl={configureElement} open={isConfigureOpen} onClose={handleCloseMenu}
                slotProps={{ paper: { 'aria-labelledby': 'basic-button', } }}>
                <MenuItem onClick={() => setSelectedMenu("export_ddl")}>Export DDL</MenuItem>
                <MenuItem onClick={(event) => setExportImageElement(event.currentTarget)}>
                    Export image as<ArrowRightIcon />
                </MenuItem>
                <MenuItem onClick={handleExportSpecification}>Export specification</MenuItem>
                {erdExportable && <MenuItem onClick={handleSaveToJson}>Save to ERD file</MenuItem>}
            </Menu>

            <Menu anchorEl={exportImageElement} open={Boolean(exportImageElement)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                onClose={() => setExportImageElement(null)}>
                {pngMenuItems}
                <MenuItem onClick={handleSaveAsHtml}>interactive HTML</MenuItem>
                <MenuItem onClick={handleSaveAsSvg}>interactive SVG</MenuItem>
            </Menu>

            {(selectedMenu === "export_ddl") && (
                <ExportDdlView documentsHolder={documentsHolder}
                    isViewOpen={selectedMenu === "export_ddl"}
                    onClose={handleCloseMenu} />
            )}
        </>
    );
};

const SUBMENU_BUTTON_STYLE = { display: 'flex', flexDirection: 'column', height: '100%', width: '100%' };

const downloadImage = (erdDocument: ErdDocument) => {
    const erdCanvas = document.getElementById("erd-canvas");
    if (erdCanvas == null) {
        return;
    }

    downloadPng(erdCanvas, (contents: ImageContent) => {
        const fileName = `${erdDocument.documentName}.png`;

        download(fileName, contents.base64Value);
    });
};

const downloadSpecification = (
    erdDocument: ErdDocument,
    exportSpecification: (erdDocument: ErdDocument, contents: ImageContent) => void
) => {
    const erdCanvas = document.getElementById("erd-canvas");
    if (erdCanvas == null) {
        return;
    }

    const doDownloadSpec = (contents: ImageContent) => exportSpecification(erdDocument, contents);

    downloadPng(erdCanvas, doDownloadSpec);
};

const downloadJson = (erdDocument: ErdDocument) => {
    const fileName = `${erdDocument.documentName}.erd`;
    const jsonContent = JSON.stringify(erdDocument.toJSON(), null, 4);
    const downloadContent = new Blob([jsonContent], { type: "application/json" });

    download(fileName, downloadContent);
};

export default ControlPanel;
