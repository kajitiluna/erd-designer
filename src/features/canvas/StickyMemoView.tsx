import React from "react";
import ReactDOM from "react-dom";
import {
    Box, Button, ButtonGroup, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    Divider, FormControl, IconButton, MenuItem, Select, SelectChangeEvent, Stack, ToggleButton, Tooltip
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
import VisibilityIcon from '@mui/icons-material/Visibility';

import ColorSelector from "~/components/ColorSelector";
import ToolbarPortalContext from "~/context/ToolbarPortalContext";
import DisplayScaleContext from "~/context/DisplayScaleContext";
import { DragAction, DragActionContext } from "~/context/DragActionContext";
import EditModeContext from "~/context/EditModeContext";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { LocalSettingContext } from "~/context/LocalSettingContext";
import { RELEASE_ACTION, SelectEntityContext, SelectState } from "~/context/SelectEntityContext";
import CanvasPositionContext from "~/context/CanvasPositionContext";
import { DRAWABLE_AREA, handlePreventMouseEvent, withMultiSelectKey } from "~/features/canvas/support";
import MemoViewModel, { AlignType } from "~/models/MemoViewModel";
import RectangleViewModel from "~/models/RectangleViewModel";
import { EditModeType } from "~/models/EditMode";
import ColorValue from "~/models/ColorValue";

import styleClasses from "./ErdCanvas.module.css";

export const ERD_MEMO_VIEW_CLASS_NAME = "erdMemoView";

type StickyNoteViewProps = {
    memoViewModel: MemoViewModel,
    visible?: boolean,
    onSettingAction: () => void,
    onDragAction: (dragAction: DragAction) => void,
    foreground?: boolean
};

const StickyMemoView = ({
    memoViewModel, visible = true, onSettingAction, onDragAction, foreground = true
}: StickyNoteViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { selectState, dispatchSelectAction } = React.useContext(SelectEntityContext);
    const dragState = React.useContext(DragActionContext);
    const { dispatchLocalSetting } = React.useContext(LocalSettingContext);
    const { scale: displayScale } = React.useContext(DisplayScaleContext);
    const positionResolver = React.useContext(CanvasPositionContext);

    const stickyMemoRef = React.useRef<HTMLDivElement>(null);
    const textAreaRef = React.useRef<HTMLTextAreaElement>(null);
    const [isTextEdit, setTextEdit] = React.useState<boolean>(false);
    const [mouseCursorStyle, setMouseCursorStyle] = React.useState<string>("pointer");
    const [resizingDirection, setResizingDirection] = React.useState<ResizingDirection>(ResizingDirection.NO_RESIZING);

    const selected = selectState.memoIds.has(memoViewModel.memoId);

    const handleDoubleClickPanel = (event: React.MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        event.stopPropagation();

        setTextEdit(true);
        // テキスト編集モードの場合は選択状態を解除する
        // (選択状態でテキスト編集した際に backspace/delete キー押下すると、選択されたものが削除されるため)
        dispatchSelectAction({ type: "none" });
    };

    const currentRectangle = (
        (dragState.status !== "on_dragging") || !selected || !resizingDirection.isResizing()
    ) ? memoViewModel.rectangleViewModel
        : initCurrentRectangle(memoViewModel.rectangleViewModel, dragState.delta(), resizingDirection);

    const handleDragStart = (event: React.MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        if (editMode !== EditModeType.SELECT) {
            return;
        }

        event.stopPropagation();

        const mousePosition = positionResolver.getLogicalPosition(event, displayScale);
        onDragAction({ type: "start_dragging", start: mousePosition });

        if (!selected) {
            const withMultiSelection = withMultiSelectKey(event);
            dispatchSelectAction({
                type: "memo", memoId: memoViewModel.memoId, withMultiSelection
            });
        }

        if (selectState.tableIds.size > 0) {
            setMouseCursorStyle("pointer");
            return;
        }

        const direction = getResizingDirection(currentRectangle, mousePosition, selectState);

        setResizingDirection(direction);
    };

    const handleMouseMove = (event: React.MouseEvent) => {
        if ((editMode !== EditModeType.SELECT) || (dragState.status === "on_dragging")) {
            return;
        }

        const mousePosition = positionResolver.getLogicalPosition(event, displayScale);
        const direction = getResizingDirection(currentRectangle, mousePosition, selectState);
        const nextStyle = initMouseCursorStyle(direction);
        setMouseCursorStyle(nextStyle);
    };

    const handleDragEnd = (event: React.MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        if ((dragState.status !== "on_dragging") || !selected) {
            return;
        }

        if (!resizingDirection.isResizing()) {
            const delta = dragState.delta();
            if ((delta.x !== 0) || (delta.y !== 0)) {
                return;
            }

            if ((selectState.status === "on_selecting")
                && (selectState.memoIds.has(memoViewModel.memoId))) {
                dispatchSelectAction({ type: "completed" });
                return;
            }

            const withMultiSelection = withMultiSelectKey(event);
            dispatchSelectAction({
                type: "memo", memoId: memoViewModel.memoId, withMultiSelection
            });

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

        const loggingMessage = `Update memo size. ${JSON.stringify({
            memoId: memoViewModel.memoId, before: memoViewModel.rectangleViewModel, after: nextRectangle
        })}`;
        documentsHolder.updateMemo(nextMemo, loggingMessage);

        setTextEdit(false);
        setResizingDirection(ResizingDirection.NO_RESIZING);
        setMouseCursorStyle("pointer");

        onDragAction({ type: "clear" });
    };

    const handleClick = (event: React.MouseEvent) => {
        // 左クリック以外は無視
        if (event.button !== 0) {
            return;
        }

        event.stopPropagation();
    };

    const handleFocusOut = () => {
        setTextEdit(false);
        setResizingDirection(ResizingDirection.NO_RESIZING);
        setMouseCursorStyle("pointer");

        if (!textAreaRef.current) {
            return;
        }

        const nextMemo = memoViewModel.updateMemo(textAreaRef.current.value);
        if (memoViewModel === nextMemo) {
            return;
        }

        const loggingMessage = `Update memo text. ${JSON.stringify({
            memoId: memoViewModel.memoId, before: memoViewModel.memo, after: nextMemo.memo
        })}`;
        documentsHolder.updateMemo(nextMemo, loggingMessage);
    };

    const moving = (
        selected && (dragState.status === "on_dragging") && !resizingDirection.isResizing()
    ) ? dragState.delta() : { x: 0, y: 0 };

    const initTextAreaElement = () => {
        if (isTextEdit) {
            const textAreaStyle: React.CSSProperties = {
                width: `${currentRectangle.width - STICKY_PADDING * 2}px`,
                height: `${currentRectangle.height - STICKY_PADDING * 2}px`,
                color: memoViewModel.foregroundColor.toRgba(),
                fontSize: `${memoViewModel.fontSize / 10}em`, lineHeight: "1.0",
                border: "none", background: "transparent", resize: "none", fontFamily: "inherit",
                textAlign: memoViewModel.horizontalAlign,
                overflow: "hidden", outline: "none", WebkitAppearance: "none",
                margin: `${STICKY_PADDING}px`
            };

            return (
                <textarea ref={textAreaRef} style={textAreaStyle} defaultValue={memoViewModel.memo} />
            );
        }

        const memoLines = memoViewModel.memo.split("\n");
        const baseStyle: React.CSSProperties = {
            width: "100%", height: "100%",
            color: memoViewModel.foregroundColor.toRgba(),
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
                onMouseDown={handleDragStart} onMouseMove={handleMouseMove} onMouseUp={handleDragEnd}
                onClick={handleClick} onDoubleClick={handleDoubleClickPanel}>
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
    React.useEffect(() => {
        if (isTextEdit) {
            textAreaRef.current?.focus();
        }
    }, [isTextEdit]);

    const zIndex = (selected: boolean) => {
        if (foreground) {
            return selected ? 100 : "auto";
        }

        return selected ? -10 : -100;
    };

    const wrapperStyle: React.CSSProperties = {
        position: "absolute", overflow: "visible", zIndex: zIndex(selected),
        left: `${currentRectangle.left + moving.x + DRAWABLE_AREA.height / 2}px`,
        top: `${currentRectangle.top + moving.y + DRAWABLE_AREA.width / 2}px`,
        display: "flex", flexDirection: "column", justifyContent: "flex-start",
        boxShadow: selected ? "" : "0px 0px 7px 0px #bebebe",
        // "&::-webkit-scrollbar": { display: "none" },
        msOverflowStyle: "none", scrollbarWidth: "none",
        ...(!visible && { opacity: 0, pointerEvents: 'none', userSelect: "none" })
    };
    const stickyStyle: React.CSSProperties = {
        width: `${currentRectangle.width}px`,
        height: `${currentRectangle.height}px`,
        backgroundColor: memoViewModel.backgroundColor.toRgba(),
        // "&::-webkit-scrollbar": { display: "none" },
        msOverflowStyle: "none", scrollbarWidth: "none"
    };
    const stickyClassName = selected
        ? `${styleClasses.selectedBox} ${ERD_MEMO_VIEW_CLASS_NAME}`
        : ERD_MEMO_VIEW_CLASS_NAME;

    return (
        <Box style={wrapperStyle}>
            <Box id={memoViewModel.memoId} ref={stickyMemoRef} sx={stickyStyle}
                className={stickyClassName} onBlur={handleFocusOut}>
                {initTextAreaElement()}
            </Box>
            {stickyMemoRef.current && selected && (!isTextEdit) && (dragState.status !== "on_dragging")
                && (selectState.tableIds.size + selectState.memoIds.size === 1)
                && <StickyControlPane
                    memoViewModel={memoViewModel}
                    stickyDom={stickyMemoRef.current}
                    onSettingAction={onSettingAction} />}
        </Box>
    );
};

const STICKY_PADDING = 10;

type Horizontal = "none" | "left" | "right";
type Vertical = "none" | "top" | "bottom";

class ResizingDirection {

    static readonly NO_RESIZING: ResizingDirection = new ResizingDirection("none", "none");

    private static readonly MAPPING = ResizingDirection.initMapping();

    private constructor(
        public readonly horizontal: Horizontal, public readonly vertical: Vertical
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

    static getInstance(horizontal: Horizontal, vertical: Vertical): ResizingDirection {
        return ResizingDirection.MAPPING.get(`${horizontal}:${vertical}`)
            || ResizingDirection.NO_RESIZING;
    }

    isResizing(): boolean {
        return (this.horizontal !== "none") || (this.vertical !== "none");
    }
}

const getResizingDirection = (
    rectangle: RectangleViewModel,
    mousePosition: { x: number, y: number },
    selectState: SelectState
): ResizingDirection => {

    if (selectState.tableIds.size + selectState.memoIds.size > 1) {
        return ResizingDirection.NO_RESIZING;
    }

    let horizontal: Horizontal = "none";
    if ((rectangle.left <= mousePosition.x) && (mousePosition.x <= rectangle.left + 10)) {
        horizontal = "left";
    } else if ((rectangle.right - 10 <= mousePosition.x) && (mousePosition.x <= rectangle.right)) {
        horizontal = "right";
    }

    let vertical: Vertical = "none";
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

const MINIMUM_SIZE = 30;

const initCurrentRectangle = (
    base: RectangleViewModel, delta: { x: number, y: number }, direction: ResizingDirection
) => {
    let left = base.left;
    let right = base.right;
    let top = base.top;
    let bottom = base.bottom;

    // 横幅および縦幅が 100 未満になる場合は、幅を 100 にする
    if (direction.horizontal === "left") {
        left = (base.width - delta.x < MINIMUM_SIZE) ? base.right - MINIMUM_SIZE : base.left + delta.x;
    }
    if (direction.horizontal === "right") {
        right = (base.width + delta.x < MINIMUM_SIZE) ? base.left + MINIMUM_SIZE : base.right + delta.x;
    }
    if (direction.vertical === "top") {
        top = (base.height - delta.y < MINIMUM_SIZE) ? base.bottom - MINIMUM_SIZE : base.top + delta.y;
    }
    if (direction.vertical === "bottom") {
        bottom = (base.height + delta.y < MINIMUM_SIZE) ? base.top + MINIMUM_SIZE : base.bottom + delta.y;
    }

    return RectangleViewModel.createFromEdges({ left, top, right, bottom });
};

type StickyControlPaneProps = {
    memoViewModel: MemoViewModel,
    stickyDom: HTMLDivElement,
    onSettingAction: () => void
};

const StickyControlPane = ({ memoViewModel, stickyDom, onSettingAction }: StickyControlPaneProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { editMode } = React.useContext(EditModeContext);
    const { dispatchSelectAction } = React.useContext(SelectEntityContext);
    const toolbarPortalRef = React.useContext(ToolbarPortalContext);
    const { dispatchLocalSetting } = React.useContext(LocalSettingContext);

    const [showAlignPanel, setShowAlignPanel] = React.useState<boolean>(false);
    const [isOpenDeleteDialog, setOpenDeleteDialog] = React.useState<boolean>(false);

    const erdDocument = documentsHolder.current();
    const erdSetting = erdDocument.erdSettingModel;
    const perspectives = erdSetting.getPerspectiveModels();

    const handleSetColor = (background: ColorValue, foreground: ColorValue) => {
        dispatchLocalSetting({ type: "defaultColor", color: { background, foreground } });

        const nextMemoViewModel = memoViewModel.updateColor(background, foreground);
        if (nextMemoViewModel === memoViewModel) {
            return;
        }

        const loggingMessage = "Update memo color: " + JSON.stringify({
            memoId: memoViewModel.memoId,
            before: {
                background: memoViewModel.backgroundColor.toHex(),
                foreground: memoViewModel.foregroundColor.toHex()
            },
            after: { background: background.toHex(), foreground: foreground.toHex() }
        });
        documentsHolder.updateMemo(nextMemoViewModel, loggingMessage);
    }

    const handleChangeFontSize = (event: SelectChangeEvent<number>) => {
        const nextFontSize = Number(event.target.value);
        dispatchLocalSetting({ type: "stickyFontSize", fontSize: nextFontSize });

        const nextMemoViewModel = memoViewModel.updateFontSize(nextFontSize);
        if (nextMemoViewModel === memoViewModel) {
            return;
        }

        const loggingMessage = `Update memo font size: ${JSON.stringify({
            memoId: memoViewModel.memoId,
            before: memoViewModel.fontSize,
            after: nextFontSize
        })}`;
        documentsHolder.updateMemo(nextMemoViewModel, loggingMessage);
    };


    const handleSettingPerspectiveDialog = (event: React.MouseEvent) => {
        if (editMode != EditModeType.SELECT) {
            return;
        }

        event.stopPropagation();

        onSettingAction();
        dispatchSelectAction(RELEASE_ACTION);
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

            const loggingMessage = `Update memo vertical align: ${JSON.stringify({
                memoId: memoViewModel.memoId,
                before: memoViewModel.verticalAlign,
                after: verticalAlign
            })}`;
            documentsHolder.updateMemo(nextMemoViewModel, loggingMessage);
        };
    };

    const initHandleHorizontalAlign = (horizontalAlign: AlignType) => {
        return () => {
            const nextMemoViewModel = memoViewModel.updateHorizontalAlign(horizontalAlign);
            if (nextMemoViewModel === memoViewModel) {
                return;
            }

            const loggingMessage = `Update memo horizontal align: ${JSON.stringify({
                memoId: memoViewModel.memoId,
                before: memoViewModel.horizontalAlign,
                after: horizontalAlign
            })}`;
            documentsHolder.updateMemo(nextMemoViewModel, loggingMessage);
        };
    };

    const controlStyle: React.CSSProperties = {
        backgroundColor: "rgba(255, 255, 255, 0.9)", borderRadius: "10px"
    };

    const alignPanel = !showAlignPanel ? null : (
        <div style={{
            position: "absolute", top: "100%", left: "50%",
            transform: "translateX(-50%)", marginTop: "5px"
        }}>
            <div style={controlStyle}>
                <Stack direction="row">
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
                </Stack>
                <Divider />
                <Stack direction="row">
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
            </div>
        </div>
    );

    const handleCloseConfirmationDialog = (event: React.MouseEvent) => {
        event.stopPropagation();

        setOpenDeleteDialog(false)
    };
    const handleDeleteMemo = (event: React.MouseEvent) => {
        event.stopPropagation();

        const loggingMessage = `Delete memo: ${JSON.stringify(memoViewModel)}`;
        documentsHolder.deleteMemo(memoViewModel.memoId, loggingMessage);
    };

    const deleteDialog = (
        <div onMouseDown={handlePreventMouseEvent} onMouseUp={handlePreventMouseEvent}>
            <Dialog open={isOpenDeleteDialog} onClose={handleCloseConfirmationDialog}>
                <DialogTitle>Delete table?</DialogTitle>
                <DialogContent>
                    <DialogContentText>Are you sure to delete the memo ?</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseConfirmationDialog}>Cancel</Button>
                    <Button variant="contained" color="error" onClick={handleDeleteMemo}>Delete</Button>
                </DialogActions>
            </Dialog>
        </div>
    );

    const portalContainer = toolbarPortalRef.current;
    if (!portalContainer) {
        return deleteDialog;
    };

    const portalRect = portalContainer.getBoundingClientRect();
    const memoRect = stickyDom.getBoundingClientRect();
    const menuStyle: React.CSSProperties = {
        position: "absolute",
        left: memoRect.right - portalRect.left,
        top: memoRect.bottom - portalRect.top,
        transform: `translateX(-100%)`,
        marginTop: "10px",
        pointerEvents: "auto",
    };

    const controlMenu = (
        <Stack direction="row" sx={menuStyle} onClick={handlePreventMouseEvent} onMouseDown={handlePreventMouseEvent}>
            <div style={controlStyle}>
                <ColorSelector key={`memo-color-selector_${memoViewModel.memoId}`}
                    color={memoViewModel.backgroundColor} callback={handleSetColor} />
                <FormControl size="small">
                    <Select value={memoViewModel.fontSize} defaultValue={9}
                        onChange={handleChangeFontSize}>
                        {FONT_SIZES.map(fontSize => <MenuItem
                            key={`select-fontsize_${memoViewModel.memoId}_${fontSize}`}
                            value={fontSize}>
                            {fontSize}
                        </MenuItem>)}
                    </Select>
                </FormControl>
                <div style={{ position: "relative", display: "inline-block" }}>
                    <Tooltip title="Set align" placement="top-end">
                        <ToggleButton size="small" selected={showAlignPanel} value="check"
                            onChange={() => setShowAlignPanel(!showAlignPanel)}>
                            <FormatAlignJustifyIcon />
                        </ToggleButton>
                    </Tooltip>
                    {alignPanel}
                </div>
                {(perspectives.length > 0) && (
                    <Tooltip title="Perspective" placement="top-end">
                        <IconButton onClick={handleSettingPerspectiveDialog}>
                            <VisibilityIcon />
                        </IconButton>
                    </Tooltip>
                )}
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
    );

    return (<>
        {ReactDOM.createPortal(controlMenu, portalContainer)}
        {deleteDialog}
    </>);
};

const FONT_SIZES = [7, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 54] as const;

export default StickyMemoView;
