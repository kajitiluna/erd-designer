import React from "react";
import {
    Box, Button, ButtonGroup, Divider, FormControl, FormControlLabel, IconButton, InputLabel, Menu,
    MenuItem, Select, SelectChangeEvent, Switch, ToggleButton, ToggleButtonGroup, Tooltip
} from "@mui/material";
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import KeyboardIcon from '@mui/icons-material/Keyboard';
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
import type { PanelLayoutType } from "~/components/user-preference/PanelLayout";
import download from "~/components/file-downloader";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ExportSpecificationContext, { ImageContent } from "~/context/ExportSpecificationContext";
import { LocalSettingContext } from "~/context/LocalSettingContext";
import PanelLayoutContext from "~/context/PanelLayoutContext";
import ThemePreferenceContext, { ThemePreferenceHolder } from "~/context/ThemePreferenceContext";
import { RELEASE_ACTION, SelectEntityContext } from "~/context/SelectEntityContext";
import DescriptionTooltip from "~/features/canvas/DescriptionTooltip";
import usePanelDragging from "~/features/canvas/usePanelDragging";
import ExportDdlView from "~/features/editor/ExportDdlView";
import { downloadHtml } from "~/features/export/htmlExporter";
import { downloadPng } from "~/features/export/pngExporter";
import { downloadSvg } from "~/features/export/svgExporter";
import { ERD_CANVAS_ID } from "~/features/canvas/ErdCanvas";

type ControlPanelProps = {
    erdExportable: boolean
};

type DragHandleProps = React.HTMLAttributes<HTMLElement>;

const ControlPanel = ({ erdExportable }: ControlPanelProps) => {
    const { panelLayout, updatePanelLayout } = React.useContext(PanelLayoutContext);
    const defaultPosition = (panelLayout === "normal") ? DEFAULT_PANEL_POSITION : COMPACT_PANEL_POSITION;
    const { panelRef, positionStyle, handleProps, dragStatus, resetPlacement } = usePanelDragging(defaultPosition);

    const layoutStyle = (panelLayout === "normal") ? NORMAL_PANEL_STYLE : COMPACT_PANEL_STYLE;
    const panelStyle = { ...PANEL_STYLE, ...layoutStyle, ...positionStyle };

    // 表示ごとに初期位置が異なるため、切替時はドラッグ位置を引き継がず初期位置へ戻す
    const handleToggleLayout = (event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();

        const nextLayout: PanelLayoutType = (panelLayout === "normal") ? "compact" : "normal";
        updatePanelLayout(nextLayout);
        resetPlacement();
    };
    const dragHandleProps: DragHandleProps = { ...handleProps, onDoubleClick: handleToggleLayout };
    const dragHandle = (
        <PanelDragHandle layout={panelLayout} handleProps={dragHandleProps} dragging={dragStatus === "moving"} />
    );

    const panelBody = (panelLayout === "normal")
        ? <NormalPanelBody erdExportable={erdExportable} dragHandle={dragHandle} />
        : <CompactPanelBody erdExportable={erdExportable} dragHandle={dragHandle} />;

    return (
        <Box ref={panelRef} sx={panelStyle}>
            {panelBody}
        </Box>
    );
};

const DEFAULT_PANEL_POSITION = { top: "50%", left: "50px", transform: "translateY(-50%)" } as const;

// 右下の DisplayScalePanel (bottom: 30px) と下端を揃える
const COMPACT_PANEL_POSITION = { top: "calc(100% - 30px)", left: "30px", transform: "translateY(-100%)" } as const;

// 右上のテーマ切替・検索ボタン (MainView の zIndex: 10) と重なっても、移動したパネルを手前に表示する
const PANEL_Z_INDEX = 11;

const PANEL_STYLE = {
    position: "fixed", zIndex: PANEL_Z_INDEX, display: "flex", borderRadius: "15px",
    border: "1px solid var(--mui-palette-erd-panelBorder)",
    boxShadow: "5px 5px 30px 0px var(--mui-palette-erd-panelShadow)",
    backgroundColor: "var(--mui-palette-erd-panelBackground)"
} as const;

const NORMAL_PANEL_STYLE = {
    minWidth: "120px", maxWidth: "120px",
    flexDirection: "column", alignItems: "center", justifyContent: "center",
    paddingTop: "4px", paddingBottom: "15px"
} as const;

const COMPACT_PANEL_STYLE = {
    flexDirection: "row", alignItems: "stretch", padding: "6px 8px 6px 0"
} as const;

type PanelDragHandleProps = {
    layout: PanelLayoutType,
    handleProps: DragHandleProps,
    dragging: boolean
};

const PanelDragHandle = ({ layout, handleProps, dragging }: PanelDragHandleProps) => {
    const [tooltipOpen, setTooltipOpen] = React.useState(false);

    const handleOpenTooltip = () => { setTooltipOpen(true); };
    const handleCloseTooltip = () => { setTooltipOpen(false); };

    // ドラッグを始めたら案内は不要なので、ドラッグ処理へ渡す前に閉じる
    const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
        setTooltipOpen(false);
        handleProps.onPointerDown?.(event);
    };

    const isNormal = (layout === "normal");
    const handleStyle = isNormal ? DRAG_HANDLE_STYLE : COMPACT_DRAG_HANDLE_STYLE;
    const handleIcon = isNormal ? <DragHandleIcon fontSize="small" /> : <DragIndicatorIcon fontSize="small" />;

    // 画面左端に寄るコンパクト表示でも切れないよう、案内は常にハンドルの上へ出す
    return (
        <DescriptionTooltip placement="top" title={"Drag to move\nDouble-click to switch layout"}
            enterDelay={500} open={tooltipOpen && (dragging === false)}
            onOpen={handleOpenTooltip} onClose={handleCloseTooltip}>
            <Box sx={handleStyle} {...handleProps} onPointerDown={handlePointerDown}>
                {handleIcon}
            </Box>
        </DescriptionTooltip>
    );
};

const DRAG_HANDLE_STYLE = {
    width: "100%", height: "5px", marginBottom: "6px",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "move", touchAction: "none", userSelect: "none",
    color: "text.secondary"
} as const;

const COMPACT_DRAG_HANDLE_STYLE = {
    width: "16px", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "move", touchAction: "none", userSelect: "none",
    color: "text.secondary"
} as const;

type PanelBodyProps = {
    erdExportable: boolean,
    dragHandle: React.ReactNode
};

const NormalPanelBody = ({ erdExportable, dragHandle }: PanelBodyProps) => {
    return (<>
        {dragHandle}
        <EditModePanel layout="normal" />
        <ActionPanel />
        <SubMenuPanel erdExportable={erdExportable} />
    </>);
};

const CompactPanelBody = ({ erdExportable, dragHandle }: PanelBodyProps) => {
    return (<>
        {dragHandle}
        <Box sx={COMPACT_ROWS_STYLE}>
            <EditModePanel layout="compact" />
            <Box sx={COMPACT_ROW_STYLE}>
                <Box sx={COMPACT_COLOR_SELECTOR_STYLE}>
                    <DefaultColorSelector layout="compact" />
                </Box>
                <PerspectiveSelector layout="compact" />
                <LineVisibleSwitch layout="compact" />
            </Box>
            <Box sx={COMPACT_ROW_STYLE}>
                <KeyboardShortcutHelpButton />
                <UndoButton layout="compact" />
                <RedoButton layout="compact" />
                <Box sx={COMPACT_SUBMENU_STYLE}>
                    <SubMenuPanel erdExportable={erdExportable} />
                </Box>
            </Box>
        </Box>
    </>);
};

// 各行をパネル幅いっぱいに広げ、最も幅の広い行に他の行を揃える
const COMPACT_ROWS_STYLE = {
    flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "stretch", gap: "4px"
} as const;

const COMPACT_ROW_STYLE = {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px"
} as const;

// モード切替・Undo/Redo・ヘルプなどのアイコンボタンを同じ大きさにそろえる
const COMPACT_ICON_BUTTON_SIZE = "32px";

const COMPACT_ICON_BUTTON_STYLE = {
    width: COMPACT_ICON_BUTTON_SIZE, height: COMPACT_ICON_BUTTON_SIZE, padding: 0
} as const;

// ColorSelector は寸法を外から受け取れないため、内側の IconButton を上書きして大きさをそろえる
const COMPACT_COLOR_SELECTOR_STYLE = {
    display: "flex",
    "& .MuiIconButton-root": COMPACT_ICON_BUTTON_STYLE
} as const;

// SubMenuPanel は幅 100% 前提のため、行内では内容幅の入れ物に収めて縮まないようにする
const COMPACT_SUBMENU_STYLE = { display: "flex", flexShrink: 0 } as const;

type LayoutProps = {
    layout: PanelLayoutType
};

type EditModeItem = { value: EditMode, tooltip: string, label: string, icon: React.ReactElement };

const EditModePanel = ({ layout }: LayoutProps) => {
    const { editMode, dispatchEditMode } = React.useContext(EditModeContext);

    const handleChange = (_event: React.MouseEvent<HTMLElement>, newValue: EditMode) => {
        if (newValue == null) {
            newValue = EditModeType.SELECT;
        }

        dispatchEditMode(newValue);
    };

    const isNormal = (layout === "normal");

    const toggleButtons = EDIT_MODE_ITEMS.map(item => {
        return (
            <ToggleButton key={item.value} value={item.value}>
                <Tooltip title={item.tooltip} placement="top">
                    {item.icon}
                </Tooltip>
                {isNormal ? item.label : null}
            </ToggleButton>
        );
    });

    return (
        <ToggleButtonGroup color="primary" orientation={isNormal ? "vertical" : "horizontal"}
            size={isNormal ? "medium" : "small"} sx={isNormal ? NORMAL_EDIT_MODE_STYLE : COMPACT_EDIT_MODE_STYLE}
            exclusive value={editMode} onChange={handleChange} >
            {toggleButtons}
        </ToggleButtonGroup>
    );
};

const NORMAL_EDIT_MODE_STYLE = { display: 'flex', flexDirection: 'column', height: '100%', width: '100%' } as const;

// 枠線は隣接ボタンとの重なり用の指定ごと外し、選択中は背景色だけで示す
const COMPACT_EDIT_MODE_STYLE = {
    width: "100%", justifyContent: "space-between", gap: "2px",
    "& .MuiToggleButtonGroup-grouped, & .MuiToggleButtonGroup-grouped:not(:first-of-type), & .MuiToggleButtonGroup-grouped:not(:last-of-type)": {
        ...COMPACT_ICON_BUTTON_STYLE, margin: 0, border: 0, borderRadius: "6px"
    }
} as const;

const EDIT_MODE_ITEMS: readonly EditModeItem[] = [
    { value: EditModeType.SELECT, tooltip: "Select (Esc)", label: "Select", icon: <HighlightAltIcon /> },
    { value: EditModeType.GRAB, tooltip: "Grab (G)", label: "Grab", icon: <PanToolIcon /> },
    { value: EditModeType.CREATE_TABLE, tooltip: "Create table (T)", label: "Table", icon: <TableChartIcon /> },
    { value: EditModeType.CREATE_RELATION, tooltip: "Create relation (R)", label: "Relation", icon: <PolylineIcon /> },
    { value: EditModeType.CREATE_MEMO, tooltip: "Create memo (M)", label: "Memo", icon: <StickyNote2Icon /> }
];

const ActionPanel = () => {
    return (
        <ButtonGroup orientation="vertical" aria-label="vertical button group"
            sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            <DefaultColorSelector layout="normal" />
            <PerspectiveSelector layout="normal" />
            <LineVisibleSwitch layout="normal" />
            <Divider />
            <UndoButton layout="normal" />
            <RedoButton layout="normal" />
        </ButtonGroup>
    );
};

const DefaultColorSelector = ({ layout }: LayoutProps) => {
    const { localSetting, dispatchLocalSetting } = React.useContext(LocalSettingContext);

    const handleSetDefaultColor = (background: ColorValue, foreground: ColorValue) => {
        dispatchLocalSetting({
            type: "defaultColor",
            color: { background, foreground }
        });
    };

    return (
        <ColorSelector color={localSetting.defaultColor.background}
            shape={(layout === "normal") ? "rectangle" : "circle"} callback={handleSetDefaultColor} />
    );
};

const DEFAULT_PERSPECTIVE_ID = "__default_perspective_id__";

const PerspectiveSelector = ({ layout }: LayoutProps) => {
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

    const activeStyle = (perspectiveId !== DEFAULT_PERSPECTIVE_ID)
        ? { backgroundColor: "var(--mui-palette-erd-perspectiveActive)" } : {};
    const formStyle = (layout === "normal") ? PERSPECTIVE_NORMAL_STYLE : PERSPECTIVE_COMPACT_STYLE;
    const selectorStyle = (layout === "normal") ? activeStyle : { ...PERSPECTIVE_COMPACT_SELECT_STYLE, ...activeStyle };

    return (
        <FormControl size="small" sx={formStyle}>
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
};

const PERSPECTIVE_NORMAL_STYLE = { padding: "0 6px", margin: "5px -1px 10px" } as const;

// 行内の余り幅を吸収して他の行と幅をそろえる。長い名前は Select 内で省略させる
const PERSPECTIVE_COMPACT_STYLE = { flex: 1, minWidth: "96px" } as const;

// 値は常に入っておりラベルは枠上に浮いたままなので、縦 padding を削っても配置は崩れない
const PERSPECTIVE_COMPACT_SELECT_STYLE = {
    fontSize: "0.8rem",
    "& .MuiOutlinedInput-input.MuiSelect-select": { paddingTop: "4px", paddingBottom: "4px" }
} as const;

const LineVisibleSwitch = ({ layout }: LayoutProps) => {
    const { localSetting, dispatchLocalSetting } = React.useContext(LocalSettingContext);

    const handleChangeVisibleStyle = (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked;
        const visibleStyle = checked ? "half-bounded" : "both-bounded";

        dispatchLocalSetting({ type: "showLine", visibleStyle });
    };

    const description = "When the switch is active, show relations\neven if one table is hidden.";
    const switchDisabled = (localSetting.perspectiveId === "");
    // 表示切替で再マウントされても状態を失わないよう、スイッチは localSetting から制御する
    const switchChecked = localSetting.visibleLineStyle === "half-bounded";

    if (layout === "compact") {
        // disabled な Switch を Tooltip の直接の子にしないよう span で包む
        return (
            <DescriptionTooltip placement="top" title={description}>
                <Box component="span" sx={{ display: "inline-flex" }}>
                    <Switch size="small" checked={switchChecked} disabled={switchDisabled}
                        onChange={handleChangeVisibleStyle}
                        slotProps={{ input: { "aria-label": "Show half-bounded line" } }} />
                </Box>
            </DescriptionTooltip>
        );
    }

    return (
        <FormControl sx={{ padding: "0 6px 6px 12px" }}>
            <DescriptionTooltip placement="right-end" title={description}>
                <FormControlLabel label="Show half-bounded line" sx={SWITCH_FORM_STYLE}
                    control={
                        <Switch size="small" checked={switchChecked} disabled={switchDisabled}
                            onChange={handleChangeVisibleStyle} />
                    } />
            </DescriptionTooltip>
        </FormControl>
    );
};

const SWITCH_FORM_STYLE = {
    marginRight: "6px",
    userSelect: "none",
    "& .MuiFormControlLabel-label": {
        fontSize: "0.7rem",
        color: "text.secondary"
    }
} as const;

const UndoButton = ({ layout }: LayoutProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);

    const handleUndo = () => { documentsHolder.undo(); };
    const undoDisabled = documentsHolder.canUndo() === false;

    if (layout === "compact") {
        return (
            <Tooltip title="Undo" placement="top">
                <span>
                    <IconButton aria-label="Undo" sx={COMPACT_ICON_BUTTON_STYLE}
                        disabled={undoDisabled} onClick={handleUndo}>
                        <UndoIcon />
                    </IconButton>
                </span>
            </Tooltip>
        );
    }

    return (
        <Button variant="text" startIcon={<UndoIcon />} disabled={undoDisabled} onClick={handleUndo}>
            Undo
        </Button>
    );
};

const RedoButton = ({ layout }: LayoutProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);

    const handleRedo = () => { documentsHolder.redo(); };
    const redoDisabled = (documentsHolder.canRedo() === false);

    if (layout === "compact") {
        return (
            <Tooltip title="Redo" placement="top">
                <span>
                    <IconButton aria-label="Redo" sx={COMPACT_ICON_BUTTON_STYLE}
                        disabled={redoDisabled} onClick={handleRedo}>
                        <RedoIcon />
                    </IconButton>
                </span>
            </Tooltip>
        );
    }

    return (
        <Button variant="text" startIcon={<RedoIcon />} disabled={redoDisabled} onClick={handleRedo}>
            Redo
        </Button>
    );
};

const KeyboardShortcutHelpButton = () => {
    return (
        <Tooltip title="Keyboard shortcuts" placement="top">
            <IconButton aria-label="Keyboard shortcuts" sx={COMPACT_ICON_BUTTON_STYLE}>
                <KeyboardIcon />
            </IconButton>
        </Tooltip>
    );
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
