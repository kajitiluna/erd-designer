import React, { MouseEvent, useState } from "react";
import {
    Box, Button, ButtonGroup, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    FormControl, IconButton, MenuItem, Select, SelectChangeEvent, Stack, ToggleButton, Tooltip
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import FormatAlignJustifyIcon from "@mui/icons-material/FormatAlignJustify";
import FlipToBackIcon from "@mui/icons-material/FlipToBack";
import FlipToFrontIcon from "@mui/icons-material/FlipToFront";
import VerticalAlignTopIcon from "@mui/icons-material/VerticalAlignTop";
import VerticalAlignCenterIcon from "@mui/icons-material/VerticalAlignCenter";
import VerticalAlignBottomIcon from "@mui/icons-material/VerticalAlignBottom";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";

import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { DRAWABLE_AREA, handlePreventMouseEvent, withMultiSelectKey } from "~/features/canvas/support";
import MemoViewModel, { AlignType } from "~/models/MemoViewModel";
import RectangleViewModel from "~/models/RectangleViewModel";
import { EditModeType } from "~/models/EditMode";
import { SelectEntityContext } from "~/context/SelectEntityContext";
import { DragActionContext } from "~/context/DragActionContext";

import styleClasses from "./ErdCanvas.module.css";
import ColorValue from "~/models/ColorValue";
import ColorSelector from "~/components/ColorSelector";

export const ERD_MEMO_VIEW_CLASS_NAME = "erdMemoView";

type StickyNoteViewProps = {
    memoViewModel: MemoViewModel
};

const StickyMemoView = ({ memoViewModel }: StickyNoteViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);

    const [memo, setMemo] = useState(memoViewModel.memo);
    const [isTextEdit, setTextEdit] = useState(false);

    const rectangle: RectangleViewModel = memoViewModel.rectangleViewModel;

    const handleClick = (event: MouseEvent) => {
        if (editMode !== EditModeType.SELECT) {
            return;
        }

        event.stopPropagation();

        const withMultiSelection = withMultiSelectKey(event);
        dispatchSelectAction({
            type: "memo", memoId: memoViewModel.memoId, withMultiSelection
        });
    };

    const handleDoubleClickPanel = (event: MouseEvent) => {
        event.stopPropagation();

        setTextEdit(true);
    };

    const handleFocusOut = () => {
        setTextEdit(false);

        const nextMemo = memoViewModel.updateMemo(memo);
        if (memoViewModel === nextMemo) {
            return;
        }

        documentsHolder.updateMemo(nextMemo);
    };

    const selected = selectState.memoIds.has(memoViewModel.memoId);
    const moving = (selected && (dragState.status === "on_dragging")) ? dragState.delta() : { x: 0, y: 0 }

    const textAreaElement = isTextEdit ? (
        <textarea style={{
            width: "100%", height: "100%",
            color: memoViewModel.foregroundColor.toHex(),
            fontSize: `${memoViewModel.fontSize / 10}em`, lineHeight: "1.0",
            border: "none", background: "transparent", resize: "none", fontFamily: "inherit",
            overflow: "hidden", outline: "none", WebkitAppearance: "none"
        }} value={memo}
            onChange={(event) => setMemo(event.target.value)} />
    ) : (
        <Box sx={{
            width: "100%", height: "100%",
            color: memoViewModel.foregroundColor.toHex(),
            fontSize: `${memoViewModel.fontSize / 10}em`, lineHeight: "1.0",
            border: "none", background: "transparent", resize: "none", fontFamily: "inherit",
            display: "flex", flexDirection: "column",
            justifyContent: memoViewModel.verticalAlign,
            overflow: "hidden",
            userSelect: "none"
        }} onClick={handleClick} onDoubleClick={handleDoubleClickPanel}>
            {memo.split("\n").map((line, index) => (
                <span key={`memo-text_${memoViewModel.memoId}-${index}`}
                    style={{
                        textAlign: memoViewModel.horizontalAlign,
                    }}>
                    {line}<br />
                </span>
            ))}
        </Box>
    );

    return (
        <Box style={{
            position: "absolute", overflow: "auto",
            left: `${rectangle.left + moving.x + DRAWABLE_AREA.height / 2}px`,
            top: `${rectangle.top + moving.y + DRAWABLE_AREA.width / 2}px`,
            display: "flex", flexDirection: "column", justifyContent: "flex-start",
            boxShadow: selected ? "" : "0px 0px 7px 0px #bebebe",
            // "&::-webkit-scrollbar": { display: "none" },
            msOverflowStyle: "none", scrollbarWidth: "none"
        }} className={selected ? styleClasses.selectedBox : ""}>
            <Box id={memoViewModel.memoId} sx={{
                width: `${rectangle.width - STICKY_PADDING * 2}px`,
                height: `${rectangle.height - STICKY_PADDING * 2}px`,
                backgroundColor: memoViewModel.backgroundColor.toHex(),
                boxShadow: "0px 0px 7px 0px #bebebe",
                // "&::-webkit-scrollbar": { display: "none" },
                msOverflowStyle: "none", scrollbarWidth: "none"
            }} style={{ padding: `${STICKY_PADDING}px` }}
                className={ERD_MEMO_VIEW_CLASS_NAME} onBlur={handleFocusOut}>
                {textAreaElement}
            </Box>
            {selected && (!isTextEdit) && (dragState.status !== "on_dragging")
                && <StickyControlPane memoViewModel={memoViewModel} />}
        </Box>
    );
};

const STICKY_PADDING = 10;

type StickyControlPaneProps = {
    memoViewModel: MemoViewModel
};

const StickyControlPane = ({ memoViewModel }: StickyControlPaneProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);

    const [showAlignPanel, setShowAlignPanel] = useState<boolean>(false);
    const [isOpenDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false);

    const handleSetColor = (background: ColorValue, foreground: ColorValue) => {
        const nextMemoViewModel = memoViewModel.updateColor(background, foreground);
        if (nextMemoViewModel === memoViewModel) {
            return;
        }

        documentsHolder.updateMemo(nextMemoViewModel);
    }

    const handleChangeFontSize = (event: SelectChangeEvent<number>) => {
        const nextFontSize = Number(event.target.value);
        const nextMemoViewModel = memoViewModel.updateFontSize(nextFontSize);
        if (nextMemoViewModel === memoViewModel) {
            return;
        }

        documentsHolder.updateMemo(nextMemoViewModel);
    };

    const handleBackPosition = () => documentsHolder.arrangeMemo(memoViewModel.memoId, "back");
    const handleFrontPosition = () => documentsHolder.arrangeMemo(memoViewModel.memoId, "front");

    const colorForVerticalAlign = (target: AlignType) =>
        (memoViewModel.verticalAlign === target) ? "primary" : "default";
    const colorForHorizontalAlign = (target: AlignType) =>
        (memoViewModel.horizontalAlign === target) ? "primary" : "default"

    const initHandleVerticalAlign = (verticalAlign: AlignType) => {
        return () => {
            const nextMemoViewModel = memoViewModel.updateVerticalAlign(verticalAlign);
            if (nextMemoViewModel === memoViewModel) {
                return;
            }

            documentsHolder.updateMemo(nextMemoViewModel);
        };
    };

    const initHandleHorizontalAlign = (horizontalAlign: AlignType) => {
        return () => {
            const nextMemoViewModel = memoViewModel.updateHorizontalAlign(horizontalAlign);
            if (nextMemoViewModel === memoViewModel) {
                return;
            }

            documentsHolder.updateMemo(nextMemoViewModel);
        };
    };

    const alignPanel = !showAlignPanel ? null : (
        <Stack direction="row" justifyContent="center">
            <ButtonGroup variant="outlined">
                <IconButton color={colorForVerticalAlign("start")} onClick={initHandleVerticalAlign("start")}>
                    <VerticalAlignTopIcon />
                </IconButton>
                <IconButton color={colorForVerticalAlign("center")} onClick={initHandleVerticalAlign("center")}>
                    <VerticalAlignCenterIcon />
                </IconButton>
                <IconButton color={colorForVerticalAlign("end")} onClick={initHandleVerticalAlign("end")}>
                    <VerticalAlignBottomIcon />
                </IconButton>
            </ButtonGroup>
            <ButtonGroup variant="outlined">
                <IconButton color={colorForHorizontalAlign("start")} onClick={initHandleHorizontalAlign("start")}>
                    <FormatAlignLeftIcon />
                </IconButton>
                <IconButton color={colorForHorizontalAlign("center")} onClick={initHandleHorizontalAlign("center")}>
                    <FormatAlignCenterIcon />
                </IconButton>
                <IconButton color={colorForHorizontalAlign("end")} onClick={initHandleHorizontalAlign("end")}>
                    <FormatAlignRightIcon />
                </IconButton>
            </ButtonGroup>
        </Stack>
    );

    const handleCloseComfirmationDialog = (event: MouseEvent) => {
        event.stopPropagation();

        setOpenDeleteDialog(false)
    };
    const handleDeleteMemo = (event: MouseEvent) => {
        event.stopPropagation();

        documentsHolder.deleteMemo(memoViewModel.memoId)
    };

    const deleteDialog = (
        <Dialog open={isOpenDeleteDialog} onClose={handleCloseComfirmationDialog}>
            <DialogTitle>Delete table?</DialogTitle>
            <DialogContent>
                <DialogContentText>Are you sure to delete the memo ?</DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCloseComfirmationDialog}>Cancel</Button>
                <Button variant="contained" color="error" onClick={handleDeleteMemo}>Delete</Button>
            </DialogActions>
        </Dialog>
    );

    return (
        <>
            <Stack direction="column" justifyContent="flex-start"
                onClick={handlePreventMouseEvent} onMouseDown={handlePreventMouseEvent}>
                <Stack direction="row" justifyContent="flex-end">
                    <ColorSelector key={`memo-color-selector_${memoViewModel.memoId}`}
                        color={memoViewModel.backgroundColor} callback={handleSetColor} />
                    <FormControl size="small">
                        <Select value={memoViewModel.fontSize} label="size" defaultValue={9}
                            onChange={handleChangeFontSize}>
                            {FONT_SIZES.map(fontSize => <MenuItem
                                key={`select-fontsize_${memoViewModel.memoId}_${fontSize}`}
                                value={fontSize}>
                                {fontSize}
                            </MenuItem>)}
                        </Select>
                    </FormControl>
                    <Tooltip title="Set align" placement="top-end">
                        <ToggleButton size="small" selected={showAlignPanel} value="check"
                            onChange={() => setShowAlignPanel(!showAlignPanel)}>
                            <FormatAlignJustifyIcon />
                        </ToggleButton>
                    </Tooltip>
                    <Tooltip title="To back" placement="top-end">
                        <IconButton onClick={handleBackPosition}><FlipToBackIcon /></IconButton>
                    </Tooltip>
                    <Tooltip title="To front" placement="top-end">
                        <IconButton onClick={handleFrontPosition}><FlipToFrontIcon /></IconButton>
                    </Tooltip>
                    <Tooltip title="Delete" placement="top-end">
                        <IconButton onMouseDown={() => setOpenDeleteDialog(true)}>
                            <DeleteIcon />
                        </IconButton>
                    </Tooltip>
                </Stack>
                {alignPanel}
            </Stack>
            {deleteDialog}
        </>
    );
};

const FONT_SIZES = [7, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 54] as const;

export default StickyMemoView;
