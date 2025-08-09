import React from "react";
import {
    Box, Button, ButtonGroup, Divider, Menu, MenuItem,
    ToggleButton, ToggleButtonGroup, Tooltip
} from "@mui/material";
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import PanToolIcon from '@mui/icons-material/PanTool';
import TableChartIcon from '@mui/icons-material/TableChart';
import PolylineIcon from '@mui/icons-material/Polyline';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import html2canvas from "html2canvas";

import EditMode, { EditModeType } from "~/models/EditMode";
import EditModeContext from "~/context/EditModeContext";
import ErdDocument from "~/models/ErdDocument";
import ColorValue from "~/models/ColorValue";
import ColorSelector from "~/components/ColorSelector";
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ExportDdlView from "~/features/editor/ExportDdlView";
import download from "~/components/file-downloader";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { ERD_TABLE_VIEW_CLASS_NAME } from "~/features/canvas/ErdTableView";
import { RELEASE_ACTION, SelectEntityContext } from "~/context/SelectEntityContext";
import { LocalSettingContext } from "~/context/LocalSettingContext";
import { ERD_MEMO_VIEW_CLASS_NAME } from "~/features/canvas/StickyMemoView";
import ExportSpecificationContext, { ImageContent } from "~/context/ExportSpecificationContext";

type ControlPanelProps = {
    erdExportable: boolean
};

const ControlPanel = ({ erdExportable }: ControlPanelProps) => {
    return (
        <Box sx={PANEL_STYLE}>
            <EditModePanel />
            <ActionPanel />
            <SubMenuButton erdExportable={erdExportable} />
        </Box>
    );
};

const PANEL_STYLE = {
    display: "flex",
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

const ActionPanel = () => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { localSetting, dispatchLocalSetting } = React.useContext(LocalSettingContext);

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

const ACTION_BUTTON_STYLE = { display: 'flex', flexDirection: 'column', height: '100%', width: '100%' };

type SubMenuButtonProps = {
    erdExportable: boolean
};

const SubMenuButton = ({ erdExportable }: SubMenuButtonProps) => {
    const { dispatchSelectAction } = React.useContext(SelectEntityContext);
    const [configureElement, setConfigureElement] = React.useState<HTMLElement | null>();
    const [selectedMenu, setSelectedMenu] = React.useState<"export_ddl" | "">("");
    const { exportSpecification } = React.useContext(ExportSpecificationContext);

    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>) => setConfigureElement(event.currentTarget);

    const handleSaveAsImage = () => {
        // 出力画像に一部のエンティティが選択状態で描画されないよう、選択状態を解除する
        dispatchSelectAction(RELEASE_ACTION);

        downloadImage(erdDocument);
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
    };

    const isConfigureOpen = Boolean(configureElement);

    const handleLeavingMenu = () => {
        if (selectedMenu !== "") {
            return;
        }

        handleCloseMenu();
    };

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
                slotProps={{
                    paper: { 'aria-labelledby': 'basic-button', },
                    list: { onMouseLeave: handleLeavingMenu }
                }}>
                <MenuItem onClick={() => setSelectedMenu("export_ddl")}>Export DDL</MenuItem>
                <MenuItem onClick={handleSaveAsImage}>Save as image</MenuItem>
                <MenuItem onClick={handleExportSpecification}>Export specification</MenuItem>
                {erdExportable && <MenuItem onClick={handleSaveToJson}>Save to ERD file</MenuItem>}
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

    exportDiagramImage(erdCanvas, (contents: ImageContent) => {
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

    exportDiagramImage(erdCanvas, doDownloadSpec);
};

const exportDiagramImage = (erdCanvas: HTMLElement, exportImage: (contents: ImageContent) => void) => {
    const orgScale = erdCanvas.style.transform;
    erdCanvas.style.transform = "scale(1)";

    const { leftEdge, topEdge, rightEdge, bottomEdge } = doCalculateImageArea(erdCanvas);

    const options = {
        windowWidth: erdCanvas.scrollWidth,
        windowHeight: erdCanvas.scrollHeight,
        x: leftEdge - 10,
        y: topEdge - 10,
        width: rightEdge - leftEdge + 20,
        height: bottomEdge - topEdge + 20,
    };

    html2canvas(erdCanvas, options).then(drawCanvas => {
        const width = drawCanvas.width;
        const height = drawCanvas.height;

        erdCanvas.style.transform = orgScale;
        const contents = drawCanvas.toDataURL("image/png");

        exportImage({ base64Value: contents, width, height });
    });
};

const doCalculateImageArea = (erdCanvas: HTMLElement) => {
    let leftEdge = Number.MAX_SAFE_INTEGER;
    let topEdge = Number.MAX_SAFE_INTEGER;
    let rightEdge = 0;
    let bottomEdge = 0;

    Array.from(erdCanvas.children).forEach(element => {
        if (element.tagName === "svg") {
            return;
        }

        const tableViewElements = element.getElementsByClassName(ERD_TABLE_VIEW_CLASS_NAME);
        if ((tableViewElements != null) && (tableViewElements.length > 0)) {
            const rectangle = tableViewElements[0].getBoundingClientRect()
            leftEdge = Math.min(leftEdge, rectangle.left + window.scrollX);
            topEdge = Math.min(topEdge, rectangle.top + window.scrollY);
            rightEdge = Math.max(rightEdge, rectangle.left + rectangle.width + window.scrollX);
            bottomEdge = Math.max(bottomEdge, rectangle.top + rectangle.height + window.scrollY);
        }

        const memoElements = element.getElementsByClassName(ERD_MEMO_VIEW_CLASS_NAME);
        if ((memoElements != null) && (memoElements.length > 0)) {
            const rectangle = memoElements[0].getBoundingClientRect()
            leftEdge = Math.min(leftEdge, rectangle.left + window.scrollX);
            topEdge = Math.min(topEdge, rectangle.top + window.scrollY);
            rightEdge = Math.max(rightEdge, rectangle.left + rectangle.width + window.scrollX);
            bottomEdge = Math.max(bottomEdge, rectangle.top + rectangle.height + window.scrollY);
        }
    });

    return { leftEdge, topEdge, rightEdge, bottomEdge };
};

const downloadJson = (erdDocument: ErdDocument) => {
    const fileName = `${erdDocument.documentName}.erd`;
    const jsonContent = JSON.stringify(erdDocument.toJSON(), null, 4);
    const downloadContent = new Blob([jsonContent], { type: "application/json" });

    download(fileName, downloadContent);
};

export default ControlPanel;
