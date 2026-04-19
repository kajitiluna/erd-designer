import React from "react";
import {
    Box, Button, ButtonGroup, Divider, FormControl, FormControlLabel, InputLabel, Menu, MenuItem,
    Select, SelectChangeEvent, Switch, ToggleButton, ToggleButtonGroup, Tooltip
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
import PerspectiveModel from "~/models/PerspectiveModel";
import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { ERD_TABLE_VIEW_CLASS_NAME } from "~/features/canvas/ErdTableView";
import { RELEASE_ACTION, SelectEntityContext } from "~/context/SelectEntityContext";
import { LocalSettingContext } from "~/context/LocalSettingContext";
import { ERD_MEMO_VIEW_CLASS_NAME } from "~/features/canvas/StickyMemoView";
import ExportSpecificationContext, { ImageContent } from "~/context/ExportSpecificationContext";
import DescriptionTooltip from "~/features/canvas/DescriptionTooltip";
import { DRAWABLE_AREA, getScroll } from "~/features/canvas/support";
import { overrideColumnName } from "~/models/database/support";

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

    const handleChangeShowRelationNames = (event: React.ChangeEvent<HTMLInputElement>) => {
        const show = event.target.checked;
        dispatchLocalSetting({ type: "showRelationNames", show });
        const nextSetting = erdDocument.erdSettingModel.update({ showRelationNames: show });
        documentsHolder.updateErdSetting(nextSetting, `Update show relation names: ${show}`);
    };

    const relationNameSwitcher = (
        <FormControl sx={{ padding: "0 6px 6px 12px" }}>
            <DescriptionTooltip placement="right-end"
                title={"Show relation names as labels\non connection lines."}>
                <FormControlLabel sx={SWITCH_FORM_STYLE}
                    label="Show relation names" control={
                        <Switch size="small" checked={localSetting.showRelationNames}
                            onChange={handleChangeShowRelationNames} />
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
            {relationNameSwitcher}
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
    erdExportable: boolean
};

const SubMenuPanel = ({ erdExportable }: SubMenuButtonProps) => {
    const { dispatchSelectAction } = React.useContext(SelectEntityContext);
    const { dispatchLocalSetting } = React.useContext(LocalSettingContext);
    const [configureElement, setConfigureElement] = React.useState<HTMLElement | null>();
    const [selectedMenu, setSelectedMenu] = React.useState<"export_ddl" | "">("");
    const [batchExportQueue, setBatchExportQueue] = React.useState<PerspectiveModel[]>([]);
    const { exportSpecification } = React.useContext(ExportSpecificationContext);

    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
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

            exportDiagramImage(erdCanvas, (contents: ImageContent) => {
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

    const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>) => setConfigureElement(event.currentTarget);

    const handleSaveAsImage = () => {
        dispatchSelectAction(RELEASE_ACTION);

        downloadImage(erdDocument);
        handleCloseMenu();
    };

    const handleSaveAsHtml = () => {
        dispatchSelectAction(RELEASE_ACTION);

        downloadHtml(erdDocument);
        handleCloseMenu();
    };

    const handleSaveAsSvg = () => {
        dispatchSelectAction(RELEASE_ACTION);

        downloadSvg(erdDocument);
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
                <MenuItem onClick={handleSaveAsImage}>Save as image</MenuItem>
                <MenuItem onClick={handleSaveAsHtml}>Save as interactive HTML</MenuItem>
                <MenuItem onClick={handleSaveAsSvg}>Save as interactive SVG</MenuItem>
                <MenuItem onClick={handleBatchExportPerspectives}
                    disabled={erdDocument.erdSettingModel.getPerspectiveModels().length === 0}>
                    Export all perspectives as images
                </MenuItem>
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

const downloadHtml = (erdDocument: ErdDocument) => {
    const erdCanvas = document.getElementById("erd-canvas");
    if (erdCanvas == null) return;

    const orgScale = erdCanvas.style.transform;
    erdCanvas.style.transform = "scale(1)";

    const { leftEdge, topEdge, rightEdge, bottomEdge } = doCalculateImageArea(erdCanvas);
    const pad = 100;
    const cropX = leftEdge - pad;
    const cropY = topEdge - pad;
    const contentW = rightEdge - leftEdge + pad * 2;
    const contentH = bottomEdge - topEdge + pad * 2;

    const clone = erdCanvas.cloneNode(true) as HTMLElement;

    clone.removeAttribute("id");
    clone.style.transform = "none";
    clone.style.position = "absolute";
    clone.style.left = "0";
    clone.style.top = "0";

    clone.querySelectorAll("[id='toolbar-portal'], [id='relation-toolbar-container']").forEach(el => el.remove());
    clone.querySelectorAll(".MuiPopover-root, .MuiPopper-root").forEach(el => el.remove());

    // Reset perspective-hidden elements and propagate model IDs to wrappers for JS filtering.
    // The editor sets opacity/pointerEvents on the PARENT wrapper, not the .erdTableView/.erdMemoView itself.
    // Also copy the id to a data-model-id on the wrapper so JS can filter by wrapper directly.
    clone.querySelectorAll('.erdTableView, .erdMemoView').forEach(el => {
        const wrapper = (el as HTMLElement).parentElement;
        if (wrapper) {
            wrapper.style.opacity = '';
            wrapper.style.pointerEvents = '';
            wrapper.setAttribute('data-model-id', (el as HTMLElement).id);
        }
    });
    // Memo wrappers have z-index:-100 which puts them behind the white canvas background.
    // Raise them to z-index:0 so they're visible but still behind tables.
    clone.querySelectorAll('.erdMemoView').forEach(el => {
        const wrapper = (el as HTMLElement).parentElement;
        if (wrapper) {
            wrapper.style.zIndex = '0';
        }
    });

    // SVG <g> groups and label divs already have data-parent/data-child from React render.

    const sheets = Array.from(document.styleSheets);
    let inlinedCss = "";
    for (const sheet of sheets) {
        try {
            const rules = sheet.cssRules || sheet.rules;
            for (const rule of Array.from(rules)) {
                inlinedCss += rule.cssText + "\n";
            }
        } catch { /* cross-origin sheets */ }
    }

    const perspectives = erdDocument.erdSettingModel.getPerspectiveModels();
    const perspJson = JSON.stringify(perspectives.map(p => ({
        id: p.perspectiveId,
        name: p.perspectiveName,
        ids: p.getContainIds()
    })));

    const { frontMemos: htmlFrontMemos, backMemos: htmlBackMemos } = erdDocument.getMemoViewModels();
    const htmlAllMemos = [...htmlBackMemos, ...htmlFrontMemos];
    const htmlTableViewModels = erdDocument.getTableViewModels();
    const htmlMemoTableMap: Record<string, string[]> = {};
    for (const memo of htmlAllMemos) {
        const r = memo.rectangleViewModel;
        const mx = r.positionX + DRAWABLE_AREA.width / 2;
        const my = r.positionY + DRAWABLE_AREA.height / 2;
        const contained = htmlTableViewModels
            .filter(t => {
                const tx = t.corner.left + DRAWABLE_AREA.width / 2;
                const ty = t.corner.top + DRAWABLE_AREA.height / 2;
                const el = document.getElementById(t.tableId);
                const tw = el ? el.offsetWidth : 220;
                const th = el ? el.offsetHeight : 100;
                return tx >= mx && ty >= my && tx + tw <= mx + r.width && ty + th <= my + r.height;
            })
            .map(t => t.tableId);
        if (contained.length > 0) htmlMemoTableMap[memo.memoId] = contained;
    }
    const htmlMemoTableJson = JSON.stringify(htmlMemoTableMap);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${erdDocument.documentName}</title>
<meta name="export-id" content="${crypto.randomUUID()}">
<style>
${inlinedCss}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #f5f5f5; }
#toolbar {
  position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; z-index: 10000 !important;
  display: flex !important; align-items: center !important; gap: 12px !important;
  padding: 8px 16px !important; background: #fff !important; border-bottom: 1px solid #ddd !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important; font-size: 13px !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
  color: #333 !important; visibility: visible !important; opacity: 1 !important;
}
#toolbar * { visibility: visible !important; opacity: 1 !important; color: inherit !important; }
#toolbar label { font-weight: 600 !important; color: #444 !important; }
#toolbar select { padding: 4px 8px !important; border-radius: 4px !important; border: 1px solid #ccc !important; font-size: 13px !important; max-width: 340px !important; background: #fff !important; color: #333 !important; }
#toolbar .zoom-controls { display: flex !important; align-items: center !important; gap: 4px !important; margin-left: auto !important; }
#toolbar button { padding: 4px 10px !important; border: 1px solid #ccc !important; border-radius: 4px !important; background: #fff !important; cursor: pointer !important; font-size: 13px !important; color: #333 !important; }
#toolbar button:hover { background: #f0f0f0 !important; }
#zoom-display { min-width: 44px !important; text-align: center !important; color: #333 !important; }
#toolbar .title { font-weight: 700 !important; color: #333 !important; font-size: 14px !important; }
#search-box { padding: 4px 8px !important; border-radius: 4px !important; border: 1px solid #ccc !important; font-size: 13px !important; width: 180px !important; background: #fff !important; color: #333 !important; }
#viewport { position: absolute; top: 42px; left: 0; right: 0; bottom: 0; overflow: hidden; cursor: grab; }
#viewport.grabbing { cursor: grabbing; }
#canvas-wrapper { position: absolute; transform-origin: 0 0; }
.search-highlight { outline: 3px solid #ff6b00 !important; outline-offset: 2px; z-index: 10000 !important; }
</style>
</head>
<body>
<div id="toolbar">
  <span class="title">${erdDocument.documentName}</span>
  <label for="perspective-select">Perspective:</label>
  <select id="perspective-select">
    <option value="all" selected>All</option>
  </select>
  <input id="search-box" type="text" placeholder="Search tables...">
  <div class="zoom-controls">
    <button id="zoom-out">\u2212</button>
    <span id="zoom-display">100%</span>
    <button id="zoom-in">+</button>
    <button id="zoom-fit">Fit</button>
  </div>
</div>
<div id="viewport">
  <div id="canvas-wrapper">
    ${clone.outerHTML}
  </div>
</div>
<script>
(function() {
  const viewport = document.getElementById('viewport');
  const wrapper = document.getElementById('canvas-wrapper');
  const perspSelect = document.getElementById('perspective-select');
  const searchBox = document.getElementById('search-box');
  const zoomDisplay = document.getElementById('zoom-display');
  const cropX = ${cropX}, cropY = ${cropY};
  const contentW = ${contentW}, contentH = ${contentH};
  const PERSPECTIVES = ${perspJson};
  const MEMO_TABLES = ${htmlMemoTableJson};

  PERSPECTIVES.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    perspSelect.appendChild(opt);
  });

  const idSet = new Map();
  PERSPECTIVES.forEach(p => idSet.set(p.id, new Set(p.ids)));

  let scale = 1, panX = 0, panY = 0;
  let isPanning = false, startX = 0, startY = 0, startPanX = 0, startPanY = 0;

  function applyTransform() {
    wrapper.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
    zoomDisplay.textContent = Math.round(scale * 100) + '%';
  }

  function visibleBounds() {
    const models = wrapper.querySelectorAll('[data-model-id]');
    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    models.forEach(el => {
      if (el.style.opacity === '0') return;
      const r = el.getBoundingClientRect();
      const wx = (el.offsetLeft || r.left);
      const wy = (el.offsetTop || r.top);
      mnX = Math.min(mnX, wx); mnY = Math.min(mnY, wy);
      mxX = Math.max(mxX, wx + r.width / scale); mxY = Math.max(mxY, wy + r.height / scale);
    });
    if (mnX === Infinity) return { cx: cropX, cy: cropY, cw: contentW, ch: contentH };
    const pad = 100;
    return { cx: mnX - pad, cy: mnY - pad, cw: mxX - mnX + pad * 2, ch: mxY - mnY + pad * 2 };
  }

  function fitAll() {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const { cx, cy, cw, ch } = visibleBounds();
    scale = Math.min(vw / cw, vh / ch, 2) * 0.95;
    panX = (vw - cw * scale) / 2 - cx * scale;
    panY = (vh - ch * scale) / 2 - cy * scale;
    applyTransform();
  }

  fitAll();

  viewport.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    isPanning = true; startX = e.clientX; startY = e.clientY;
    startPanX = panX; startPanY = panY;
    viewport.classList.add('grabbing');
  });
  window.addEventListener('mousemove', e => {
    if (!isPanning) return;
    panX = startPanX + e.clientX - startX;
    panY = startPanY + e.clientY - startY;
    applyTransform();
  });
  window.addEventListener('mouseup', () => { isPanning = false; viewport.classList.remove('grabbing'); });

  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const wx = (mx - panX) / scale, wy = (my - panY) / scale;
    const d = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.05, Math.min(50, scale * d));
    panX = mx - wx * scale; panY = my - wy * scale;
    applyTransform();
  }, { passive: false });

  document.getElementById('zoom-in').addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    const cx = rect.width/2, cy = rect.height/2;
    const wx = (cx-panX)/scale, wy = (cy-panY)/scale;
    scale = Math.min(50, scale*1.25); panX = cx-wx*scale; panY = cy-wy*scale; applyTransform();
  });
  document.getElementById('zoom-out').addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    const cx = rect.width/2, cy = rect.height/2;
    const wx = (cx-panX)/scale, wy = (cy-panY)/scale;
    scale = Math.max(0.05, scale/1.25); panX = cx-wx*scale; panY = cy-wy*scale; applyTransform();
  });
  document.getElementById('zoom-fit').addEventListener('click', fitAll);

  function applyPerspective(pid) {
    const modelWrappers = wrapper.querySelectorAll('[data-model-id]');
    const relElements = wrapper.querySelectorAll('[data-parent]');
    const ids = pid === 'all' ? null : idSet.get(pid);
    modelWrappers.forEach(el => {
      const mid = el.getAttribute('data-model-id');
      let show;
      if (!ids) { show = true; }
      else if (ids.has(mid)) { show = true; }
      else if (MEMO_TABLES[mid]) {
        show = MEMO_TABLES[mid].some(tid => ids.has(tid));
      } else { show = false; }
      el.style.opacity = show ? '' : '0';
      el.style.pointerEvents = show ? '' : 'none';
    });
    relElements.forEach(el => {
      const p = el.getAttribute('data-parent');
      const c = el.getAttribute('data-child');
      const show = !ids || (ids.has(p) && ids.has(c));
      el.style.display = show ? '' : 'none';
      el.setAttribute('visibility', show ? 'visible' : 'hidden');
    });
  }

  perspSelect.addEventListener('change', () => applyPerspective(perspSelect.value));

  searchBox.addEventListener('input', () => {
    const q = searchBox.value.toLowerCase().trim();
    wrapper.querySelectorAll('.search-highlight').forEach(el => el.classList.remove('search-highlight'));
    if (!q) return;
    wrapper.querySelectorAll('.erdTableView').forEach(el => {
      const header = el.querySelector('[class*="header"], div:first-child');
      if (header && header.textContent.toLowerCase().includes(q)) el.classList.add('search-highlight');
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key === '0' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fitAll(); }
    if (e.key === '=' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); document.getElementById('zoom-in').click(); }
    if (e.key === '-' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); document.getElementById('zoom-out').click(); }
    if (e.key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); searchBox.focus(); }
    if (e.key === 'Escape') { searchBox.blur(); searchBox.value = ''; searchBox.dispatchEvent(new Event('input')); }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement !== searchBox) {
      e.preventDefault();
      const opts = perspSelect.options;
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const next = perspSelect.selectedIndex + dir;
      if (next >= 0 && next < opts.length) { perspSelect.selectedIndex = next; perspSelect.dispatchEvent(new Event('change')); }
    }
  });
})();
</script>
</body>
</html>`;

    erdCanvas.style.transform = orgScale;

    const blob = new Blob([html], { type: "text/html" });
    const fileName = `${erdDocument.documentName}.html`;
    download(fileName, blob);
};

const escSvg = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const downloadSvg = (erdDocument: ErdDocument) => {
    const erdCanvas = document.getElementById("erd-canvas");
    if (erdCanvas == null) return;

    const displayStyle = erdDocument.getDisplayStyle();
    const tableViewModels = erdDocument.getTableViewModels();
    const relationViewModels = erdDocument.getRelationViewModels();
    const { frontMemos, backMemos } = erdDocument.getMemoViewModels();
    const allMemos = [...backMemos, ...frontMemos];

    const perspectives = erdDocument.erdSettingModel.getPerspectiveModels();
    const perspJson = JSON.stringify(perspectives.map(p => ({
        id: p.perspectiveId,
        name: p.perspectiveName,
        ids: p.getContainIds()
    })));

    const COL_PAD = 8;
    const FONT_SIZE = 12;
    const HEADER_FONT = 13;
    const BORDER_RADIUS = 10;
    const FALLBACK_HEADER_H = 28;
    const FALLBACK_ROW_H = 24;

    const svgTables: string[] = [];
    const tableRects: { id: string, x: number, y: number, w: number, h: number }[] = [];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const tvm of tableViewModels) {
        const tm = tvm.tableModel;
        const allColumns = erdDocument.toAllColumnModels(tm);
        const tableName = displayStyle.displayName(tm.physicalName, tm.logicalName);
        const bgHex = tvm.headerColor.background.toHex();
        const fgHex = tvm.headerColor.foreground.toHex();

        const domEl = document.getElementById(tvm.tableId);
        const tableW = domEl ? domEl.offsetWidth : 220;
        const tableH = domEl ? domEl.offsetHeight : FALLBACK_HEADER_H + allColumns.length * FALLBACK_ROW_H + 4;

        const domTrs = domEl ? domEl.querySelectorAll("tr") : null;
        const headerH = (() => {
            if (!domEl) return FALLBACK_HEADER_H;
            const hdrEl = domEl.querySelector("table")?.parentElement?.previousElementSibling as HTMLElement | null;
            return hdrEl ? hdrEl.offsetHeight : FALLBACK_HEADER_H;
        })();

        const rowHeights: number[] = [];
        if (domTrs && domTrs.length > 0) {
            domTrs.forEach(tr => rowHeights.push((tr as HTMLElement).offsetHeight));
        } else {
            for (let i = 0; i < allColumns.length; i++) rowHeights.push(FALLBACK_ROW_H);
        }

        const x = tvm.corner.left + DRAWABLE_AREA.width / 2;
        const y = tvm.corner.top + DRAWABLE_AREA.height / 2;
        tableRects.push({ id: tvm.tableId, x, y, w: tableW, h: tableH });
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + tableW); maxY = Math.max(maxY, y + tableH);

        const fkColumnIds = new Set<string>();
        for (const rv of relationViewModels) {
            if (rv.childTableModelId === tm.tableModelId) {
                for (const pair of rv.relationModel.relationPairs) {
                    fkColumnIds.add(pair.childColumnModelId);
                }
            }
        }

        let colWidths = { pk: 20, fk: 20, name: 100, type: 80, opt: 40 };
        if (domTrs && domTrs.length > 0) {
            const cells = domTrs[0].querySelectorAll("td");
            if (cells.length >= 5) {
                colWidths = {
                    pk: (cells[0] as HTMLElement).offsetWidth,
                    fk: (cells[1] as HTMLElement).offsetWidth,
                    name: (cells[2] as HTMLElement).offsetWidth,
                    type: (cells[3] as HTMLElement).offsetWidth,
                    opt: (cells[4] as HTMLElement).offsetWidth
                };
            }
        }

        let rows = "";
        let cumulY = headerH;
        for (let ci = 0; ci < allColumns.length; ci++) {
            const col = allColumns[ci];
            const shareModel = erdDocument.findColumnShareModel(col.columnShareModelId);
            if (!shareModel) continue;
            const names = overrideColumnName(col, shareModel);
            const colName = displayStyle.displayName(names.physicalName, names.logicalName);
            const colType = shareModel.specifiedColumnType(
                erdDocument.inChildRelation(tm.tableModelId, col.columnModelId)
            );
            const opts: string[] = [];
            if (col.notNull) opts.push("NN");
            if (col.unique) opts.push("U");
            const optStr = opts.length > 0 ? `(${opts.join(",")})` : "";

            const rh = rowHeights[ci] ?? FALLBACK_ROW_H;
            const textY = cumulY + rh * 0.68;

            let xOff = COL_PAD;
            let pkIcon = "";
            if (col.primaryKey) {
                pkIcon = `<text x="${xOff + 2}" y="${textY}" fill="#90292F" font-size="10" font-family="monospace">PK</text>`;
            }
            xOff += colWidths.pk;

            let fkIcon = "";
            if (fkColumnIds.has(col.columnModelId)) {
                fkIcon = `<text x="${xOff + 2}" y="${textY}" fill="#212490" font-size="10" font-family="monospace">FK</text>`;
            }
            xOff += colWidths.fk;

            const nameColor = col.primaryKey ? "#90292F" : (fkColumnIds.has(col.columnModelId) ? "#212490" : "#333");
            const nameEl = `<text x="${xOff}" y="${textY}" fill="${nameColor}" font-size="${FONT_SIZE}" font-family="sans-serif">${escSvg(colName)}</text>`;
            xOff += colWidths.name;

            const typeEl = `<text x="${xOff}" y="${textY}" fill="#666" font-size="11" font-family="sans-serif">${escSvg(colType)}</text>`;
            xOff += colWidths.type;

            const optEl = optStr ? `<text x="${xOff}" y="${textY}" fill="#888" font-size="11" font-family="sans-serif">${escSvg(optStr)}</text>` : "";

            if (ci > 0) {
                rows += `<line x1="0" y1="${cumulY}" x2="${tableW}" y2="${cumulY}" stroke="#e0e0e0" stroke-width="0.5"/>`;
            }
            rows += pkIcon + fkIcon + nameEl + typeEl + optEl;
            cumulY += rh;
        }

        svgTables.push(`<g data-model-id="${tvm.tableId}" transform="translate(${x}, ${y})">
  <rect width="${tableW}" height="${tableH}" rx="${BORDER_RADIUS}" fill="#FDFDFD" stroke="#bbb" stroke-width="1.5"/>
  <clipPath id="clip-hdr-${tvm.tableId}"><rect width="${tableW}" height="${headerH}" rx="${BORDER_RADIUS}"/></clipPath>
  <rect width="${tableW}" height="${headerH}" fill="${bgHex}" clip-path="url(#clip-hdr-${tvm.tableId})"/>
  <rect x="0" y="${headerH - BORDER_RADIUS}" width="${tableW}" height="${BORDER_RADIUS}" fill="${bgHex}"/>
  <text x="${COL_PAD}" y="${headerH * 0.68}" fill="${fgHex}" font-size="${HEADER_FONT}" font-weight="600" font-family="sans-serif">${escSvg(tableName)}</text>
  <line x1="0" y1="${headerH}" x2="${tableW}" y2="${headerH}" stroke="#999" stroke-width="1"/>
  ${rows}
</g>`);
    }

    const svgMemos: string[] = [];
    for (const memo of allMemos) {
        const rect = memo.rectangleViewModel;
        const mx = rect.positionX + DRAWABLE_AREA.width / 2;
        const my = rect.positionY + DRAWABLE_AREA.height / 2;
        minX = Math.min(minX, mx); minY = Math.min(minY, my);
        maxX = Math.max(maxX, mx + rect.width); maxY = Math.max(maxY, my + rect.height);

        const bgHex = memo.backgroundColor.toHex();
        const fgHex = memo.foregroundColor.toHex();
        const fontSize = memo.fontSize;

        const lines = memo.memo.split("\n");
        const lineHeight = fontSize * 1.4;
        let textAnchor = "start";
        let textX = 10;
        if (memo.horizontalAlign === "center") { textAnchor = "middle"; textX = rect.width / 2; }
        else if (memo.horizontalAlign === "end") { textAnchor = "end"; textX = rect.width - 10; }

        let startY: number;
        const totalTextH = lines.length * lineHeight;
        if (memo.verticalAlign === "start") startY = lineHeight;
        else if (memo.verticalAlign === "end") startY = rect.height - totalTextH + lineHeight;
        else startY = (rect.height - totalTextH) / 2 + lineHeight;

        const textEls = lines.map((line, i) =>
            `<text x="${textX}" y="${startY + i * lineHeight}" fill="${fgHex}" font-size="${fontSize}" font-family="sans-serif" text-anchor="${textAnchor}">${escSvg(line)}</text>`
        ).join("\n  ");

        svgMemos.push(`<g data-model-id="${memo.memoId}" transform="translate(${mx}, ${my})">
  <rect width="${rect.width}" height="${rect.height}" fill="${bgHex}" rx="2"/>
  ${textEls}
</g>`);
    }

    const renderedSvg = erdCanvas.querySelector("svg");
    let defsContent = "";
    let connectionGroups = "";
    let labelGroups = "";

    if (renderedSvg) {
        const defs = renderedSvg.querySelector("defs");
        if (defs) defsContent = defs.innerHTML;

        renderedSvg.querySelectorAll("g[data-parent]").forEach(g => {
            connectionGroups += g.outerHTML + "\n";
        });
    }

    erdCanvas.querySelectorAll("div[data-parent]").forEach(el => {
        const htmlEl = el as HTMLElement;
        const parent = htmlEl.getAttribute("data-parent") ?? "";
        const child = htmlEl.getAttribute("data-child") ?? "";
        const text = htmlEl.textContent ?? "";
        if (!text) return;
        const style = htmlEl.style;
        const lx = parseFloat(style.left) || 0;
        const ly = parseFloat(style.top) || 0;
        const fs = parseFloat(style.fontSize) || 13;
        const color = style.color || "rgba(60,60,60,0.95)";
        const fw = style.fontWeight || "400";
        const fst = style.fontStyle === "italic" ? "italic" : "normal";
        const dec = style.textDecoration?.includes("line-through") ? "line-through" : "none";

        labelGroups += `<text data-parent="${escSvg(parent)}" data-child="${escSvg(child)}" x="${lx}" y="${ly + fs}" fill="${color}" font-size="${fs}" font-weight="${fw}" font-style="${fst}" text-decoration="${dec}" font-family="sans-serif">${escSvg(text)}</text>\n`;
    });

    const memoTableMap: Record<string, string[]> = {};
    for (const memo of allMemos) {
        const r = memo.rectangleViewModel;
        const mx = r.positionX + DRAWABLE_AREA.width / 2;
        const my = r.positionY + DRAWABLE_AREA.height / 2;
        const contained = tableRects
            .filter(t => t.x >= mx && t.y >= my && t.x + t.w <= mx + r.width && t.y + t.h <= my + r.height)
            .map(t => t.id);
        if (contained.length > 0) memoTableMap[memo.memoId] = contained;
    }
    const memoTableJson = JSON.stringify(memoTableMap);

    const pad = 100;
    const vbX = minX - pad;
    const vbY = minY - pad;
    const vbW = maxX - minX + pad * 2;
    const vbH = maxY - minY + pad * 2;

    const perspOptions = perspectives.map(p => `<option value="${escSvg(p.perspectiveId)}">${escSvg(p.perspectiveName)}</option>`).join("");

    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${vbX} ${vbY} ${vbW} ${vbH}" preserveAspectRatio="none" style="background:#f5f5f5;width:100vw;height:100vh;display:block">
<defs>
${defsContent}
<style>
  .search-highlight rect:first-child { stroke: #ff6b00 !important; stroke-width: 3 !important; }
</style>
</defs>
<g id="erd-content">
  <g id="memo-layer">${svgMemos.join("\n")}</g>
  <g id="connection-layer">${connectionGroups}</g>
  <g id="label-layer">${labelGroups}</g>
  <g id="table-layer">${svgTables.join("\n")}</g>
</g>
<g id="ui-overlay">
  <rect id="toolbar-bg" x="0" y="0" width="714" height="42" fill="#fff" stroke="#ddd" stroke-width="1" rx="6"/>
  <text id="title-text" x="14" y="27" font-size="16" font-weight="700" fill="#333" font-family="sans-serif">${escSvg(erdDocument.documentName)}</text>
  <text x="250" y="27" font-size="14" fill="#444" font-weight="600" font-family="sans-serif">Perspective:</text>
  <foreignObject x="338" y="6" width="220" height="32">
    <div xmlns="http://www.w3.org/1999/xhtml">
      <select id="persp-select" style="width:210px;height:28px;font-size:14px;border:1px solid #ccc;border-radius:4px;padding:2px 6px;background:#fff;color:#333;font-family:sans-serif">
        <option value="all" selected="selected">All</option>
        ${perspOptions}
      </select>
    </div>
  </foreignObject>
  <g id="zoom-out-btn" cursor="pointer"><rect x="570" y="7" width="28" height="28" fill="#fff" stroke="#ccc" rx="4"/><text x="579" y="27" font-size="18" fill="#333" font-family="sans-serif">\u2212</text></g>
  <text id="zoom-display" x="604" y="27" font-size="14" fill="#333" font-family="sans-serif">100%</text>
  <g id="zoom-in-btn" cursor="pointer"><rect width="28" height="28" fill="#fff" stroke="#ccc" rx="4"/><text x="8" y="20" font-size="18" fill="#333" font-family="sans-serif">+</text></g>
  <g id="zoom-fit-btn" cursor="pointer"><rect width="34" height="28" fill="#fff" stroke="#ccc" rx="4"/><text x="7" y="20" font-size="14" fill="#333" font-family="sans-serif">Fit</text></g>
</g>
<script type="text/ecmascript"><![CDATA[
(function() {
  var svg = document.documentElement;
  var content = document.getElementById('erd-content');
  var overlay = document.getElementById('ui-overlay');
  var perspSelect = document.getElementById('persp-select');
  var zoomDisp = document.getElementById('zoom-display');
  var zoomInBtn = document.getElementById('zoom-in-btn');
  var zoomFitBtn = document.getElementById('zoom-fit-btn');
  var toolbarBg = document.getElementById('toolbar-bg');
  var PERSPECTIVES = ${perspJson};
  var MEMO_TABLES = ${memoTableJson};

  var vbX = ${vbX}, vbY = ${vbY}, vbW = ${vbW}, vbH = ${vbH};
  var curVbX = vbX, curVbY = vbY, curVbW = vbW, curVbH = vbH;

  var idSets = {};
  PERSPECTIVES.forEach(function(p) {
    var s = {}; p.ids.forEach(function(id) { s[id] = true; }); idSets[p.id] = s;
  });

  function layoutZoomControls() {
    var bbox = zoomDisp.getBBox();
    var afterText = bbox.x + bbox.width + 6;
    zoomInBtn.setAttribute('transform', 'translate(' + afterText + ',7)');
    var fitX = afterText + 36;
    zoomFitBtn.setAttribute('transform', 'translate(' + fitX + ',7)');
    toolbarBg.setAttribute('width', String(fitX + 42));
  }

  function updateViewBox() {
    svg.setAttribute('viewBox', curVbX + ' ' + curVbY + ' ' + curVbW + ' ' + curVbH);
    var pct = Math.round((vbW / curVbW) * 100);
    zoomDisp.textContent = pct + '%';
    layoutZoomControls();
    positionOverlay();
  }

  function matchAspect() {
    var sw = window.innerWidth || 800;
    var sh = window.innerHeight || 600;
    var viewportRatio = sw / sh;
    var vbRatio = curVbW / curVbH;
    if (viewportRatio > vbRatio) {
      var newW = curVbH * viewportRatio;
      curVbX -= (newW - curVbW) / 2;
      curVbW = newW;
    } else {
      var newH = curVbW / viewportRatio;
      curVbY -= (newH - curVbH) / 2;
      curVbH = newH;
    }
  }

  function positionOverlay() {
    var sw = window.innerWidth || 800;
    var s = curVbW / sw;
    var tbW = parseFloat(toolbarBg.getAttribute('width')) || 714;
    var toolbarW = tbW * s;
    var offsetX = curVbX + (curVbW - toolbarW) / 2;
    overlay.setAttribute('transform', 'translate(' + offsetX + ',' + curVbY + ') scale(' + s + ')');
  }
  window.addEventListener('resize', function() { matchAspect(); updateViewBox(); });

  function visibleBBox() {
    var models = content.querySelectorAll('[data-model-id]');
    var mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    for (var i = 0; i < models.length; i++) {
      if (models[i].getAttribute('visibility') === 'hidden') continue;
      var tr = models[i].getAttribute('transform') || '';
      var m = tr.match(/translate\\(([\\d.\\-]+),\\s*([\\d.\\-]+)\\)/);
      if (!m) continue;
      var tx = parseFloat(m[1]), ty = parseFloat(m[2]);
      try { var b = models[i].getBBox(); } catch(e) { continue; }
      if (b.width === 0 && b.height === 0) continue;
      mnX = Math.min(mnX, tx + b.x); mnY = Math.min(mnY, ty + b.y);
      mxX = Math.max(mxX, tx + b.x + b.width); mxY = Math.max(mxY, ty + b.y + b.height);
    }
    if (mnX === Infinity) return { x: vbX, y: vbY, w: vbW, h: vbH };
    var pad = 100;
    return { x: mnX - pad, y: mnY - pad, w: mxX - mnX + pad * 2, h: mxY - mnY + pad * 2 };
  }

  function fitAll() {
    var bb = visibleBBox();
    curVbX = bb.x; curVbY = bb.y; curVbW = bb.w; curVbH = bb.h;
    matchAspect();
    var tbH = 42 * (curVbW / (window.innerWidth || 800));
    curVbY -= tbH / 2;
    updateViewBox();
  }

  fitAll();

  var isPanning = false, panClientX, panClientY, panVbX, panVbY;

  svg.addEventListener('mousedown', function(e) {
    if (e.target.closest('#ui-overlay')) return;
    if (e.button !== 0) return;
    e.preventDefault();
    isPanning = true;
    panClientX = e.clientX; panClientY = e.clientY;
    panVbX = curVbX; panVbY = curVbY;
    svg.style.cursor = 'grabbing';
  });

  svg.addEventListener('mousemove', function(e) {
    if (!isPanning) return;
    e.preventDefault();
    var svgRect = svg.getBoundingClientRect();
    var scaleX = curVbW / svgRect.width;
    var scaleY = curVbH / svgRect.height;
    curVbX = panVbX - (e.clientX - panClientX) * scaleX;
    curVbY = panVbY - (e.clientY - panClientY) * scaleY;
    updateViewBox();
  });

  svg.addEventListener('mouseup', function() { isPanning = false; svg.style.cursor = 'default'; });
  svg.addEventListener('mouseleave', function() { isPanning = false; svg.style.cursor = 'default'; });

  svg.addEventListener('wheel', function(e) {
    e.preventDefault();
    var pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    var ctm = svg.getScreenCTM().inverse();
    var svgPt = pt.matrixTransform(ctm);
    var factor = e.deltaY > 0 ? 1.1 : 0.9;
    var newW = curVbW * factor;
    var newH = curVbH * factor;
    curVbX = svgPt.x - (svgPt.x - curVbX) * factor;
    curVbY = svgPt.y - (svgPt.y - curVbY) * factor;
    curVbW = newW; curVbH = newH;
    updateViewBox();
  }, {passive: false});

  function zoom(factor) {
    var cx = curVbX + curVbW / 2, cy = curVbY + curVbH / 2;
    curVbW *= factor; curVbH *= factor;
    curVbX = cx - curVbW / 2; curVbY = cy - curVbH / 2;
    updateViewBox();
  }

  document.getElementById('zoom-in-btn').addEventListener('click', function() { zoom(0.8); });
  document.getElementById('zoom-out-btn').addEventListener('click', function() { zoom(1.25); });
  document.getElementById('zoom-fit-btn').addEventListener('click', fitAll);

  function applyPerspective(pid) {
    var ids = pid === 'all' ? null : idSets[pid];
    var models = content.querySelectorAll('[data-model-id]');
    var rels = content.querySelectorAll('[data-parent]');
    for (var i = 0; i < models.length; i++) {
      var mid = models[i].getAttribute('data-model-id');
      var show;
      if (!ids) { show = true; }
      else if (ids[mid]) { show = true; }
      else if (MEMO_TABLES[mid]) {
        show = MEMO_TABLES[mid].some(function(tid) { return ids[tid]; });
      } else { show = false; }
      models[i].setAttribute('visibility', show ? 'visible' : 'hidden');
    }
    for (var j = 0; j < rels.length; j++) {
      var p = rels[j].getAttribute('data-parent');
      var c = rels[j].getAttribute('data-child');
      var showR = !ids || (ids[p] && ids[c]);
      rels[j].setAttribute('visibility', showR ? 'visible' : 'hidden');
    }
  }

  perspSelect.addEventListener('change', function() { applyPerspective(perspSelect.value); });

  function perspStep(delta) {
    var idx = perspSelect.selectedIndex + delta;
    if (idx < 0 || idx >= perspSelect.options.length) return;
    perspSelect.selectedIndex = idx;
    applyPerspective(perspSelect.value);
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === '0' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fitAll(); }
    if (e.key === '=' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); zoom(0.8); }
    if (e.key === '-' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); zoom(1.25); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      if (document.activeElement === perspSelect) return;
      e.preventDefault(); perspStep(1);
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      if (document.activeElement === perspSelect) return;
      e.preventDefault(); perspStep(-1);
    }
  });
})();
]]></script>
</svg>`;

    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const fileName = `${erdDocument.documentName}.svg`;
    download(fileName, blob);
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
    const { scrollX, scrollY } = getScroll();

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
            leftEdge = Math.min(leftEdge, rectangle.left + scrollX);
            topEdge = Math.min(topEdge, rectangle.top + scrollY);
            rightEdge = Math.max(rightEdge, rectangle.left + rectangle.width + scrollX);
            bottomEdge = Math.max(bottomEdge, rectangle.top + rectangle.height + scrollY);
        }

        const memoElements = element.getElementsByClassName(ERD_MEMO_VIEW_CLASS_NAME);
        if ((memoElements != null) && (memoElements.length > 0)) {
            const rectangle = memoElements[0].getBoundingClientRect()
            leftEdge = Math.min(leftEdge, rectangle.left + scrollX);
            topEdge = Math.min(topEdge, rectangle.top + scrollY);
            rightEdge = Math.max(rightEdge, rectangle.left + rectangle.width + scrollX);
            bottomEdge = Math.max(bottomEdge, rectangle.top + rectangle.height + scrollY);
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
