import React, { useState } from "react";
import {
    Box, Button, ButtonGroup, FormControl, InputLabel,
    Menu, MenuItem, Select, SelectChangeEvent, ToggleButton, ToggleButtonGroup, Tooltip
} from "@mui/material";
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import TableChartIcon from '@mui/icons-material/TableChart';
import PolylineIcon from '@mui/icons-material/Polyline';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';

import EditMode, { EditModeType } from "~/models/EditMode";
import EditModeContext from "~/context/EditModeContext";
import ErdDocument from "~/models/ErdDocument";
import ErdSettingModel from "~/models/ErdSettingModel";
import ColorValue from "~/models/ColorValue";
import ColorSelector from "~/components/ColorSelector";
import DisplayStyle from "~/models/database/DisplayStyle";
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ExportDdlView from "~/features/editor/ExportDdlView";
import html2canvas from "html2canvas";
import download from "~/components/file-downloader";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { ERD_TABLE_VIEW_CLASS_NAME } from "~/features/canvas/ErdTableView";
import { RELEASE_ACTION, SelectEntityContext } from "~/context/SelectEntityContext";
import { LocalSettingContext } from "~/context/LocalSettingContext";
import { ERD_MEMO_VIEW_CLASS_NAME } from "~/features/canvas/StickyMemoView";

const ControlPanel = () => {
    const panelStyle = {
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

    return (
        <Box sx={panelStyle}>
            <EditModePanel />
            <ActionPanel />
            <ConfigureButton />
        </Box>
    );
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

    const erdDocument: ErdDocument = documentsHolder.current();
    const erdSetting: ErdSettingModel = erdDocument.erdSettingModel;

    const handleSetDefaultColor = (background: ColorValue, foreground: ColorValue) => {
        dispatchLocalSetting({
            type: "defaultColor",
            color: { background, foreground }
        });
    };

    const handleChangeDisplayStyle = (event: SelectChangeEvent<string>) => {
        const nextValue = event.target.value;
        if (erdSetting.displayStyle.name === nextValue) {
            return;
        }

        for (const displayStyle of DisplayStyle.values()) {
            if (displayStyle.name !== nextValue) {
                continue;
            }

            const nextErdSetting = erdSetting.update({ displayStyle: displayStyle });
            documentsHolder.updateErdSetting(nextErdSetting);
        }
    };

    const buttonStyle = { display: 'flex', flexDirection: 'column', height: '100%', width: '100%' };

    return (
        <ButtonGroup orientation="vertical" aria-label="vertical button group" sx={buttonStyle}>
            <ColorSelector key='color-selector-default' color={localSetting.defaultColor.background}
                shape="rectangle" callback={handleSetDefaultColor} />
            <FormControl size="small">
                <InputLabel id="label-display-style">Display Style</InputLabel>
                <Select labelId="label-display-style" id="select-display-style" label="Display Style"
                    value={erdSetting.displayStyle.name} onChange={handleChangeDisplayStyle}>
                    {DisplayStyle.values().map(displayStyle => (
                        <MenuItem key={displayStyle.name} value={displayStyle.name}>
                            {displayStyle.name}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
            <Button key="undo" variant="text" startIcon={<UndoIcon />}
                disabled={!documentsHolder.undoable()} onClick={() => documentsHolder.undo()}>
                Undo
            </Button>
            <Button key="undo" variant="text" startIcon={<RedoIcon />}
                disabled={!documentsHolder.redoable()} onClick={() => documentsHolder.redo()}>
                Redo
            </Button>
        </ButtonGroup>
    );
};

const ConfigureButton = () => {
    const { dispatchSelectAction } = React.useContext(SelectEntityContext);
    const [configureElement, setConfigureElement] = useState<HTMLElement | null>();
    const [selectedMenu, setSelectedMenu] = useState<"export_ddl" | "">("");

    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>) => setConfigureElement(event.currentTarget);

    const handleSaveAsImage = () => {
        // 出力画像に一部のエンティティが選択状態で描画されないよう、選択状態を解除する
        dispatchSelectAction(RELEASE_ACTION);

        downloadImage(erdDocument);
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
    const buttonStyle = { display: 'flex', flexDirection: 'column', height: '100%', width: '100%' };

    return (
        <>
            <Box sx={buttonStyle}>
                <Button key="configure-button" variant="text"
                    aria-controls={isConfigureOpen ? 'basic-menu' : undefined}
                    aria-expanded={isConfigureOpen ? 'true' : undefined}
                    aria-haspopup="true" endIcon={<KeyboardArrowDownIcon />}
                    onClick={handleOpenMenu}>
                    Others
                </Button>
                <Menu anchorEl={configureElement} open={isConfigureOpen} onClose={handleCloseMenu}
                    MenuListProps={{ 'aria-labelledby': 'basic-button', }}>
                    <MenuItem onClick={() => setSelectedMenu("export_ddl")}>Export DDL</MenuItem>
                    <MenuItem onClick={handleSaveAsImage}>Save as image</MenuItem>
                    <MenuItem onClick={handleSaveToJson}>Save to ERD file</MenuItem>
                </Menu>
            </Box>

            {(selectedMenu === "export_ddl") && (
                <ExportDdlView documentsHolder={documentsHolder}
                    isViewOpen={selectedMenu === "export_ddl"}
                    onClose={handleCloseMenu} />
            )}
        </>
    );
};

const downloadImage = (erdDocument: ErdDocument) => {
    const erdCanvas = document.getElementById("erd-canvas");
    if (erdCanvas == null) {
        return;
    }

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
        erdCanvas.style.transform = orgScale;

        const fileName = `${erdDocument.documentName}.png`;
        const contents = drawCanvas.toDataURL("image/png");

        download(fileName, contents);
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
