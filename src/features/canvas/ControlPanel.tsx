import React from "react";
import {
    Box, Button, ButtonGroup, Divider, FormControl, FormControlLabel, InputLabel, Menu,
    MenuItem, Select, SelectChangeEvent, Switch, ToggleButton, ToggleButtonGroup, Tooltip
} from "@mui/material";
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import PanToolIcon from '@mui/icons-material/PanTool';
import PolylineIcon from '@mui/icons-material/Polyline';
import TableChartIcon from '@mui/icons-material/TableChart';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';

import EditMode, { EditModeType } from "~/models/EditMode";
import EditModeContext from "~/context/EditModeContext";
import ErdDocument from "~/models/ErdDocument";
import ColorValue from "~/models/ColorValue";
import PerspectiveModel from "~/models/PerspectiveModel";
import ColorSelector from "~/components/ColorSelector";
import download from "~/components/file-downloader";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ExportSpecificationContext, { ImageContent } from "~/context/ExportSpecificationContext";
import { LocalSettingContext } from "~/context/LocalSettingContext";
import ThemePreferenceContext, { ThemePreferenceHolder } from "~/context/ThemePreferenceContext";
import { RELEASE_ACTION, SelectEntityContext } from "~/context/SelectEntityContext";
import DescriptionTooltip from "~/features/canvas/DescriptionTooltip";
import ExportDdlView from "~/features/editor/ExportDdlView";
import { downloadHtml } from "~/features/export/htmlExporter";
import { downloadPng } from "~/features/export/pngExporter";
import { downloadSvg } from "~/features/export/svgExporter";
import { ERD_CANVAS_ID } from "~/features/canvas/ErdCanvas";

type ControlPanelProps = {
    erdExportable: boolean
};

const ControlPanel = ({ erdExportable }: ControlPanelProps) => {
    return (
        <Box sx={PANEL_STYLE}>
            <EditModePanel />
            <ActionPanel />
            <SubMenuPanel erdExportable={erdExportable} />
        </Box>
    );
};

const PANEL_STYLE = {
    minWidth: "120px", maxWidth: "120px",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    paddingTop: "15px", paddingBottom: "15px", borderRadius: "15px",
    border: "1px solid var(--mui-palette-erd-panelBorder)",
    boxShadow: "5px 5px 30px 0px var(--mui-palette-erd-panelShadow)",
    backgroundColor: "var(--mui-palette-erd-panelBackground)"
} as const;

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

    const selectorStyle = (perspectiveId !== DEFAULT_PERSPECTIVE_ID)
        ? { backgroundColor: "var(--mui-palette-erd-perspectiveActive)" } : {};
    const perspectiveSelector = (
        <FormControl size="small" sx={{ padding: "0 6px", margin: "5px -1px 10px" }}>
            <InputLabel id="label-display-style">Perspective</InputLabel>
            <Select labelId="label-display-style" label="Perspective" sx={selectorStyle}
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
        color: "text.secondary"
    }
};

const ACTION_BUTTON_STYLE = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%'
};

type SubMenuButtonProps = {
    erdExportable: boolean
};

const SubMenuPanel = ({ erdExportable }: SubMenuButtonProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { localSetting } = React.useContext(LocalSettingContext);
    const { exportSpecification } = React.useContext(ExportSpecificationContext);
    const { withLightMode } = React.useContext(ThemePreferenceContext);

    const [configureElement, setConfigureElement] = React.useState<HTMLElement | null>();
    const [selectedMenu, setSelectedMenu] = React.useState<"export_ddl" | "">("");

    const erdDocument: ErdDocument = documentsHolder.current();

    const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>) => setConfigureElement(event.currentTarget);

    const handleExportSpecification = () => {
        downloadSpecification(erdDocument, exportSpecification, withLightMode);
        handleCloseMenu();
    };

    const handleSaveToJson = () => {
        downloadJson(erdDocument);
        handleCloseMenu();
    };

    const handleCloseMenu = () => {
        setSelectedMenu("");
        setConfigureElement(null);
    };

    const exportImageMenu = useExportImageMenu(erdDocument, handleCloseMenu);

    if (localSetting.perspectiveId !== "") {
        return (
            <Box sx={SUBMENU_BUTTON_STYLE}>
                <Tooltip placement="right" arrow title="Export is only available in the default perspective.">
                    <span style={{ display: 'flex', width: '100%' }}>
                        <Button key="submenu-button" variant="text" disabled={true} sx={{ width: '100%' }}
                            aria-expanded={false} aria-haspopup="true" endIcon={<KeyboardArrowDownIcon />}>
                            Export
                        </Button>
                    </span>
                </Tooltip>
            </Box>
        );
    }

    const isConfigureOpen = Boolean(configureElement);

    return (<>
        <Box sx={SUBMENU_BUTTON_STYLE}>
            <Button id="submenu-export-button" key="submenu-button" variant="text"
                aria-expanded={isConfigureOpen} aria-haspopup="true"
                endIcon={isConfigureOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                onClick={handleOpenMenu}>
                Export
            </Button>
        </Box>

        <Menu anchorEl={configureElement} open={isConfigureOpen} onClose={handleCloseMenu}
            slotProps={{ paper: { 'aria-labelledby': 'submenu-export-button', } }}>
            <MenuItem onClick={() => setSelectedMenu("export_ddl")}>Export DDL</MenuItem>
            {exportImageMenu}
            <MenuItem onClick={handleExportSpecification}>Export specification</MenuItem>
            {erdExportable && <MenuItem onClick={handleSaveToJson}>Save to ERD file</MenuItem>}
        </Menu>

        {(selectedMenu === "export_ddl") && (
            <ExportDdlView documentsHolder={documentsHolder}
                isViewOpen={selectedMenu === "export_ddl"}
                onClose={handleCloseMenu} />
        )}
    </>);
};

const SUBMENU_BUTTON_STYLE = { display: 'flex', flexDirection: 'column', height: '100%', width: '100%' };

const useExportImageMenu = (erdDocument: ErdDocument, onCloseMenu: () => void) => {
    const { dispatchSelectAction } = React.useContext(SelectEntityContext);
    const { dispatchLocalSetting } = React.useContext(LocalSettingContext);

    const { withLightMode } = React.useContext(ThemePreferenceContext);

    const exportImageCloseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const [exportImageElement, setExportImageElement] = React.useState<HTMLElement | null>(null);
    const [batchExportQueue, setBatchExportQueue] = React.useState<PerspectiveModel[]>([]);
    // バッチ全体を 1 回の withLightMode で包むため、キューが空になった時点でその task を完了させる
    const batchCompletionRef = React.useRef<(() => void) | null>(null);

    React.useEffect(() => {
        if (batchExportQueue.length === 0) {
            batchCompletionRef.current?.();
            batchCompletionRef.current = null;
            return;
        }

        const timer = setTimeout(() => {
            const erdCanvas = document.getElementById(ERD_CANVAS_ID);
            if (erdCanvas == null) {
                setBatchExportQueue([]);
                return;
            }

            const current = batchExportQueue[0];
            const remaining = batchExportQueue.slice(1);

            const exportCurrent = (contents: ImageContent) => {
                const fileName = `${erdDocument.documentName} - ${current.perspectiveName}.png`;
                download(fileName, contents.base64Value);

                const nextPerspectiveId = (remaining.length > 0) ? remaining[0].perspectiveId : "";
                dispatchLocalSetting({ type: "perspective", perspectiveId: nextPerspectiveId });
                setBatchExportQueue(remaining);
            };

            downloadPng(erdCanvas, exportCurrent).catch((error: unknown) => {
                console.error("Failed to export PNG.", error);
                dispatchLocalSetting({ type: "perspective", perspectiveId: "" });
                setBatchExportQueue([]);
            });
        }, 500);

        return () => clearTimeout(timer);
    }, [batchExportQueue, erdDocument, dispatchLocalSetting]);

    const handleClose = () => {
        setExportImageElement(null);
        onCloseMenu();
    };

    const handleExportAsImage = () => {
        dispatchSelectAction(RELEASE_ACTION);

        downloadImage(erdDocument, withLightMode);
        handleClose();
    };

    const handleBatchExportPerspectives = () => {
        dispatchSelectAction(RELEASE_ACTION);

        const perspectives = erdDocument.erdSettingModel.getPerspectiveModels();
        if (perspectives.length === 0) {
            handleClose();
            return;
        }

        const startBatch = (): Promise<void> => {
            return new Promise<void>(resolve => {
                batchCompletionRef.current = resolve;
                dispatchLocalSetting({ type: "perspective", perspectiveId: perspectives[0].perspectiveId });
                setBatchExportQueue(perspectives);
            });
        };
        withLightMode(startBatch);

        handleClose();
    };

    const perspectives = erdDocument.erdSettingModel.getPerspectiveModels();
    const pngMenuItems = (perspectives.length === 0)
        ? (<MenuItem onClick={handleExportAsImage}>PNG</MenuItem>)
        : [
            <MenuItem key="png-current" onClick={handleExportAsImage}>PNG (Current canvas)</MenuItem>,
            <MenuItem key="png-all" onClick={handleBatchExportPerspectives}>PNG (All perspectives)</MenuItem>
        ];

    const handleExportImageEnter = (event: React.MouseEvent<HTMLElement>) => {
        if (exportImageCloseTimerRef.current != null) {
            clearTimeout(exportImageCloseTimerRef.current);
            exportImageCloseTimerRef.current = null;
        }
        setExportImageElement(event.currentTarget);
    };

    const handleExportImageLeave = () => {
        exportImageCloseTimerRef.current = setTimeout(() => {
            setExportImageElement(null);
        }, 100);
    };

    const handleSaveAsHtml = () => {
        dispatchSelectAction(RELEASE_ACTION);
        handleClose();

        const erdCanvas = document.getElementById(ERD_CANVAS_ID);
        if (erdCanvas == null) {
            return;
        }

        // HTML / SVG は表示中の DOM (インライン style、CSS) から生成するため、ライト表示で出力する
        const exportHtml = async () => { downloadHtml(erdDocument, erdCanvas); };
        withLightMode(exportHtml);
    };

    const handleSaveAsSvg = () => {
        dispatchSelectAction(RELEASE_ACTION);
        handleClose();

        const erdCanvas = document.getElementById(ERD_CANVAS_ID);
        if (erdCanvas == null) {
            return;
        }

        const exportSvg = async () => { downloadSvg(erdDocument, erdCanvas); };
        withLightMode(exportSvg);
    };

    // バッチ中にパネルが破棄されても、アプリ階層に残る light 強制を解除できるようにする
    React.useEffect(() => {
        return () => {
            batchCompletionRef.current?.();
            batchCompletionRef.current = null;
        };
    }, []);

    return [
        <MenuItem key="export-menu-item" onMouseEnter={handleExportImageEnter} onMouseLeave={handleExportImageLeave}>
            Export image as<ArrowRightIcon />
        </MenuItem>,
        <Menu key="export-image-menu" anchorEl={exportImageElement} open={Boolean(exportImageElement)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            onClose={() => setExportImageElement(null)}
            sx={{ pointerEvents: 'none' }}
            slotProps={{
                list: {
                    sx: { pointerEvents: 'auto' },
                    onMouseEnter: () => {
                        if (exportImageCloseTimerRef.current != null) {
                            clearTimeout(exportImageCloseTimerRef.current);
                            exportImageCloseTimerRef.current = null;
                        }
                    },
                    onMouseLeave: handleExportImageLeave
                }
            }}>
            {pngMenuItems}
            <MenuItem onClick={handleSaveAsHtml}>interactive HTML</MenuItem>
            <MenuItem onClick={handleSaveAsSvg}>interactive SVG</MenuItem>
        </Menu>
    ];
};

const downloadImage = (erdDocument: ErdDocument, withLightMode: ThemePreferenceHolder["withLightMode"]) => {
    const exportImage = (contents: ImageContent) => {
        const fileName = `${erdDocument.documentName}.png`;

        download(fileName, contents.base64Value);
    };

    return withLightMode(() => {
        const erdCanvas = document.getElementById(ERD_CANVAS_ID);
        if (erdCanvas == null) {
            return Promise.resolve();
        }

        return downloadPng(erdCanvas, exportImage);
    });
};

const downloadSpecification = (
    erdDocument: ErdDocument,
    exportSpecification: (erdDocument: ErdDocument, contents: ImageContent) => void,
    withLightMode: ThemePreferenceHolder["withLightMode"]
) => {
    const doDownloadSpec = (contents: ImageContent) => exportSpecification(erdDocument, contents);

    return withLightMode(() => {
        const erdCanvas = document.getElementById(ERD_CANVAS_ID);
        if (erdCanvas == null) {
            return Promise.resolve();
        }

        return downloadPng(erdCanvas, doDownloadSpec);
    });
};

const downloadJson = (erdDocument: ErdDocument) => {
    const fileName = `${erdDocument.documentName}.erd`;
    const jsonContent = JSON.stringify(erdDocument.toJSON(), null, 4);
    const downloadContent = new Blob([jsonContent], { type: "application/json" });

    download(fileName, downloadContent);
};

export default ControlPanel;
