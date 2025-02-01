import React, { MouseEvent, useEffect, useState } from "react";
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
import {
    DRAWABLE_AREA, getLogicalMousePosition,
    handlePreventMouseEvent, withMultiSelectKey
} from "~/features/canvas/support";
import MemoViewModel, { AlignType } from "~/models/MemoViewModel";
import RectangleViewModel from "~/models/RectangleViewModel";
import { EditModeType } from "~/models/EditMode";
import { SelectEntityContext } from "~/context/SelectEntityContext";
import { DragAction, DragActionContext } from "~/context/DragActionContext";
import ColorValue from "~/models/ColorValue";
import ColorSelector from "~/components/ColorSelector";
import DisplayScaleContext from "~/context/DisplayScaleContext";

import styleClasses from "./ErdCanvas.module.css";
import { LocalSettingContext } from "~/context/LocalSettingContext";

export const ERD_MEMO_VIEW_CLASS_NAME = "erdMemoView";

type StickyNoteViewProps = {
    memoViewModel: MemoViewModel,
    onDragAction: (dragAction: DragAction) => void,
};

const StickyMemoView = ({ memoViewModel, onDragAction }: StickyNoteViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);
    const { dispatchLocalSetting } = React.useContext(LocalSettingContext);
    const displayScale = React.useContext(DisplayScaleContext);

    const textAreaRef = React.useRef<HTMLTextAreaElement>(null);
    const [memo, setMemo] = useState<string>(memoViewModel.memo);
    const [isTextEdit, setTextEdit] = useState<boolean>(false);
    const [mouseCursorStyle, setMouseCursorStyle] = useState<string>("pointer");
    const [resizingDirection, setResizingDirection] = useState<ResizingDirection>(ResizingDirection.NO_RESIZING);

    const selected = selectState.memoIds.has(memoViewModel.memoId);

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

    const handleDragStart = (event: MouseEvent) => {
        if ((editMode !== EditModeType.SELECT) || !selected) {
            return;
        }

        if (selectState.tableIds.size > 0) {
            setMouseCursorStyle("pointer");
            return;
        }

        const mousePosition = getLogicalMousePosition(event, displayScale);
        const direction = getResizingDirection(memoViewModel.rectangleViewModel, mousePosition);

        setResizingDirection(direction);
    };

    const handleMouseMove = (event: MouseEvent) => {
        if ((editMode !== EditModeType.SELECT) || (dragState.status === "on_dragging")) {
            return;
        }

        const selected = selectState.memoIds.has(memoViewModel.memoId);
        if (!selected) {
            return;
        }

        const mousePosition = getLogicalMousePosition(event, displayScale);
        const direction = getResizingDirection(memoViewModel.rectangleViewModel, mousePosition);
        const nextStyle = initMouseCursorStyle(direction);
        setMouseCursorStyle(nextStyle);
    };

    const handleDragEnd = (event: MouseEvent) => {
        if ((dragState.status !== "on_dragging") || !selected || !resizingDirection.isResizing()) {
            return;
        }

        event.stopPropagation();

        const nextRectangle = initCurrentRectangle(
            memoViewModel.rectangleViewModel, dragState.delta(), resizingDirection);

        dispatchLocalSetting({
            type: "stickySize",
            size: { width: nextRectangle.width, height: nextRectangle.height }
        });
        const nextMemo = memoViewModel.updateRectangle(nextRectangle)
        documentsHolder.updateMemo(nextMemo);

        setTextEdit(false);
        setResizingDirection(ResizingDirection.NO_RESIZING);
        setMouseCursorStyle("pointer");

        onDragAction({ type: "clear" });
    };

    const handleFocusOut = () => {
        setTextEdit(false);
        setResizingDirection(ResizingDirection.NO_RESIZING);
        setMouseCursorStyle("pointer");

        const nextMemo = memoViewModel.updateMemo(memo);
        if (memoViewModel === nextMemo) {
            return;
        }

        documentsHolder.updateMemo(nextMemo);
    };

    const moving = (selected && (dragState.status === "on_dragging") && !resizingDirection.isResizing())
        ? dragState.delta() : { x: 0, y: 0 }

    const rectangle = (
        (dragState.status !== "on_dragging") || !selected || !resizingDirection.isResizing()
    ) ? memoViewModel.rectangleViewModel
        : initCurrentRectangle(memoViewModel.rectangleViewModel, dragState.delta(), resizingDirection);

    const initTextAreaElement = () => {
        if (isTextEdit) {
            const textAreaStyle: React.CSSProperties = {
                width: `${rectangle.width - STICKY_PADDING * 2}px`,
                height: `${rectangle.height - STICKY_PADDING * 2}px`,
                color: memoViewModel.foregroundColor.toHex(),
                fontSize: `${memoViewModel.fontSize / 10}em`, lineHeight: "1.0",
                border: "none", background: "transparent", resize: "none", fontFamily: "inherit",
                textAlign: memoViewModel.horizontalAlign,
                // verticalAlign: (memoViewModel.verticalAlign === "start") ? "top" :
                //     ((memoViewModel.verticalAlign === "end") ? "bottom" : "center"),
                overflow: "hidden", outline: "none", WebkitAppearance: "none",
                margin: `${STICKY_PADDING}px`
            };

            return (
                <textarea ref={textAreaRef}
                    style={textAreaStyle} value={memo}
                    onChange={(event) => setMemo(event.target.value)} />
            );
        }

        const memoLines = memo.split("\n");
        const baseStyle: React.CSSProperties = {
            width: "100%", height: "100%",
            color: memoViewModel.foregroundColor.toHex(),
            fontSize: `${memoViewModel.fontSize / 10}em`, lineHeight: "1.0",
            border: "none", background: "transparent", resize: "none", fontFamily: "inherit",
            display: "flex", flexDirection: "column",
            justifyContent: memoViewModel.verticalAlign,
            overflow: "hidden", cursor: mouseCursorStyle,
            userSelect: "none"
        };

        const initTextStyle = (index: number): React.CSSProperties => {
            return {
                textAlign: memoViewModel.horizontalAlign,
                marginLeft: `${STICKY_PADDING}px`,
                marginRight: `${STICKY_PADDING}px`,
                marginTop: (index === 0) ? `${STICKY_PADDING}px` : "0px",
                marginBottom: (index === memoLines.length - 1) ? `${STICKY_PADDING}px` : "0px"
            };
        };

        return (
            <Box sx={baseStyle}
                onClick={handleClick} onDoubleClick={handleDoubleClickPanel}
                onMouseDown={handleDragStart} onMouseMove={handleMouseMove} onMouseUp={handleDragEnd}>
                {memoLines.map((line, index) => (
                    <span key={`memo-text_${memoViewModel.memoId}-${index}`}
                        style={initTextStyle(index)}>
                        {line}<br />
                    </span>
                ))}
            </Box>
        );
    };

    // メモを編集可能にした際に、必ず textarea にフォーカスを当てる
    useEffect(() => {
        if (isTextEdit) {
            textAreaRef.current?.focus();
        }
    }, [isTextEdit]);

    const wrapperStyle: React.CSSProperties = {
        position: "absolute", overflow: "auto", zIndex: selected ? 100 : "auto",
        left: `${rectangle.left + moving.x + DRAWABLE_AREA.height / 2}px`,
        top: `${rectangle.top + moving.y + DRAWABLE_AREA.width / 2}px`,
        display: "flex", flexDirection: "column", justifyContent: "flex-start",
        boxShadow: selected ? "" : "0px 0px 7px 0px #bebebe",
        // "&::-webkit-scrollbar": { display: "none" },
        msOverflowStyle: "none", scrollbarWidth: "none"
    };
    const stickyStyle: React.CSSProperties = {
        width: `${rectangle.width}px`,
        height: `${rectangle.height}px`,
        backgroundColor: memoViewModel.backgroundColor.toHex(),
        // "&::-webkit-scrollbar": { display: "none" },
        msOverflowStyle: "none", scrollbarWidth: "none"
    };
    const stickyClassName = selected
        ? `${styleClasses.selectedBox} ${ERD_MEMO_VIEW_CLASS_NAME}`
        : ERD_MEMO_VIEW_CLASS_NAME

    return (
        <Box style={wrapperStyle}>
            <Box id={memoViewModel.memoId} sx={stickyStyle}
                className={stickyClassName} onBlur={handleFocusOut}>
                {initTextAreaElement()}
            </Box>
            {selected && (!isTextEdit) && (dragState.status !== "on_dragging")
                && <StickyControlPane memoViewModel={memoViewModel} />}
        </Box>
    );
};

const STICKY_PADDING = 10;

class ResizingDirection {

    static readonly NO_RESIZING: ResizingDirection = new ResizingDirection("none", "none");

    private static readonly MAPPING = ResizingDirection.initMapping();

    private constructor(
        public readonly horizontal: "none" | "left" | "right",
        public readonly vertical: "none" | "top" | "bottom"
    ) {
        // do nothing
    }

    private static initMapping(): Map<string, ResizingDirection> {
        return new Map([
            ["none:none", ResizingDirection.NO_RESIZING],
            ["none:top", new ResizingDirection("none", "top")],
            ["none:bottom", new ResizingDirection("none", "bottom")],
            ["left:none", new ResizingDirection("left", "none")],
            ["left:top", new ResizingDirection("left", "top")],
            ["left:bottom", new ResizingDirection("left", "bottom")],
            ["right:none", new ResizingDirection("right", "none")],
            ["right:top", new ResizingDirection("right", "top")],
            ["right:bottom", new ResizingDirection("right", "bottom")]
        ]);
    }

    static getInstance(
        horizontal: "none" | "left" | "right",
        vertical: "none" | "top" | "bottom"
    ): ResizingDirection {
        return ResizingDirection.MAPPING.get(`${horizontal}:${vertical}`)
            || ResizingDirection.NO_RESIZING;
    }

    isResizing(): boolean {
        return (this.horizontal !== "none") || (this.vertical !== "none");
    }
}

const getResizingDirection = (rectangle: RectangleViewModel, mousePosition: { x: number, y: number }): ResizingDirection => {
    let horizontal: "none" | "left" | "right" = "none";
    if ((rectangle.left <= mousePosition.x) && (mousePosition.x <= rectangle.left + 10)) {
        horizontal = "left";
    } else if ((rectangle.right - 10 <= mousePosition.x) && (mousePosition.x <= rectangle.right)) {
        horizontal = "right";
    }

    let vertical: "none" | "top" | "bottom" = "none";
    if ((rectangle.top <= mousePosition.y) && (mousePosition.y <= rectangle.top + 10)) {
        vertical = "top";
    } else if ((rectangle.bottom - 10 <= mousePosition.y) && (mousePosition.y <= rectangle.bottom)) {
        vertical = "bottom";
    }

    return ResizingDirection.getInstance(horizontal, vertical);
};

const initMouseCursorStyle = (direction: ResizingDirection) => {
    if (direction === ResizingDirection.NO_RESIZING) {
        return "pointer";
    }

    const horizontalPrefix = (direction.horizontal === "left") ? "w" : ((direction.horizontal === "right") ? "e" : "");
    const verticalPrefix = (direction.vertical === "top") ? "n" : ((direction.vertical === "bottom") ? "s" : "");

    return `${verticalPrefix}${horizontalPrefix}-resize`;
};

const MINMUM_SIZE = 30;

const initCurrentRectangle = (
    base: RectangleViewModel, delta: { x: number, y: number }, direction: ResizingDirection
) => {
    let left = base.left;
    let right = base.right;
    let top = base.top;
    let bottom = base.bottom;

    // 横幅および縦幅が 100 未満になる場合は、幅を 100 にする
    if (direction.horizontal === "left") {
        left = (base.width - delta.x < MINMUM_SIZE) ? base.right - MINMUM_SIZE : base.left + delta.x;
    }
    if (direction.horizontal === "right") {
        right = (base.width + delta.x < MINMUM_SIZE) ? base.left + MINMUM_SIZE : base.right + delta.x;
    }
    if (direction.vertical === "top") {
        top = (base.height - delta.y < MINMUM_SIZE) ? base.bottom - MINMUM_SIZE : base.top + delta.y;
    }
    if (direction.vertical === "bottom") {
        bottom = (base.height + delta.y < MINMUM_SIZE) ? base.top + MINMUM_SIZE : base.bottom + delta.y;
    }

    return RectangleViewModel.createFromEdges({ left, top, right, bottom });
};

type StickyControlPaneProps = {
    memoViewModel: MemoViewModel
};

const StickyControlPane = ({ memoViewModel }: StickyControlPaneProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { dispatchLocalSetting } = React.useContext(LocalSettingContext);

    const [showAlignPanel, setShowAlignPanel] = useState<boolean>(false);
    const [isOpenDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false);

    const handleSetColor = (background: ColorValue, foreground: ColorValue) => {
        dispatchLocalSetting({ type: "defaultColor", color: { background, foreground } });

        const nextMemoViewModel = memoViewModel.updateColor(background, foreground);
        if (nextMemoViewModel === memoViewModel) {
            return;
        }

        documentsHolder.updateMemo(nextMemoViewModel);
    }

    const handleChangeFontSize = (event: SelectChangeEvent<number>) => {
        const nextFontSize = Number(event.target.value);
        dispatchLocalSetting({ type: "stickyFontSize", fontSize: nextFontSize });

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

    const controlStyle: React.CSSProperties = {
        backgroundColor: "rgba(255, 255, 255, 0.9)", borderRadius: "10px"
    };

    const alignPanel = !showAlignPanel ? null : (
        <Stack direction="row" justifyContent="flex-end">
            <div style={controlStyle}>
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
            </div>
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
            <Stack direction="column" justifyContent="flex-start" sx={{ marginTop: "10px" }}
                onClick={handlePreventMouseEvent} onMouseDown={handlePreventMouseEvent}>
                <Stack direction="row" justifyContent="flex-end">
                    <div style={controlStyle}>
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
                    </div>
                </Stack>
                {alignPanel}
            </Stack>
            {deleteDialog}
        </>
    );
};

const FONT_SIZES = [7, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 54] as const;

export default StickyMemoView;
