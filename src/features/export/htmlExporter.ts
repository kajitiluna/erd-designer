import download from "~/components/file-downloader";
import ErdDocument from "~/models/ErdDocument";
import { calculateImageArea } from "~/features/canvas/canvasArea";
import { escapeCdata, serializePerspective } from "~/features/export/support";
import { ERD_TABLE_VIEW_CLASS_NAME } from "~/features/canvas/ErdTableView";
import { ERD_MEMO_VIEW_CLASS_NAME } from "~/features/canvas/StickyMemoView";

export const downloadHtml = (erdDocument: ErdDocument, erdCanvas: HTMLElement) => {
  const portableHtml = initPotableHtml(erdDocument, erdCanvas);
  const blob = new Blob([portableHtml], { type: "text/html" });
  const fileName = `${erdDocument.documentName}.html`;

  download(fileName, blob);
};

const initPotableHtml = (erdDocument: ErdDocument, erdCanvas: HTMLElement) => {
  const clonedCanvas = cloneCanvas(erdCanvas);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(erdDocument.documentName)}</title>
<meta name="export-id" content="${crypto.randomUUID()}">
<style>${initPortableCss()}</style>
</head>
<body>
<div id="toolbar">
  <span class="title">${escapeHtml(erdDocument.documentName)}</span>
  <label for="perspective-select">Perspective:</label>
  <select id="perspective-select">
    <option value="all" selected>All</option>
  </select>
  <input id="search-box" type="text" placeholder="Search tables...">
  <div class="zoom-controls">
    <button id="zoom-out">−</button>
    <span id="zoom-display">100%</span>
    <button id="zoom-in">+</button>
    <button id="zoom-fit">Fit</button>
  </div>
</div>
<div id="viewport"><div id="canvas-wrapper">${clonedCanvas.outerHTML}</div></div>
<script>${initPortableFunction(erdDocument, erdCanvas)}();</script>
</body>
</html>`;
};

const cloneCanvas = (erdCanvas: HTMLElement) => {

  const clonedCanvas = erdCanvas.cloneNode(true) as HTMLElement;

  clonedCanvas.style.transform = "scale(1)";
  clonedCanvas.removeAttribute("id");
  clonedCanvas.style.transform = "none";
  clonedCanvas.style.position = "absolute";
  clonedCanvas.style.left = "0";
  clonedCanvas.style.top = "0";

  clonedCanvas.querySelectorAll("[id='toolbar-portal'], [id='relation-toolbar-container']").forEach(el => el.remove());
  clonedCanvas.querySelectorAll(".MuiPopover-root, .MuiPopper-root").forEach(el => el.remove());

  clonedCanvas.querySelectorAll(`.${ERD_TABLE_VIEW_CLASS_NAME}, .${ERD_MEMO_VIEW_CLASS_NAME}`).forEach(el => {
    const wrapper = (el as HTMLElement).parentElement;
    if (wrapper) {
      wrapper.style.opacity = '';
      wrapper.style.pointerEvents = '';
      wrapper.setAttribute('data-model-id', (el as HTMLElement).id);
    }
  });
  clonedCanvas.querySelectorAll(`.${ERD_MEMO_VIEW_CLASS_NAME}`).forEach(el => {
    const wrapper = (el as HTMLElement).parentElement;
    if (wrapper) {
      wrapper.style.zIndex = '0';
    }
  });

  return clonedCanvas;
};

const initPortableCss = () => {
  const sheets = Array.from(document.styleSheets);
  let inlinedCss = "";
  for (const sheet of sheets) {
    try {
      const rules = sheet.cssRules || sheet.rules;
      for (const rule of Array.from(rules)) {
        inlinedCss += rule.cssText + "\n";
      }
    } catch {
      /* cross-origin sheets */
    }
  }

  return `
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
    #toolbar select {
      padding: 4px 8px !important;
      border-radius: 4px !important;
      border: 1px solid #ccc !important;
      font-size: 13px !important;
      max-width: 340px !important;
      background: #fff !important;
      color: #333 !important;
    }
    #toolbar .zoom-controls {
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
      margin-left: auto !important;
    }
    #toolbar button {
      padding: 4px 10px !important;
      border: 1px solid #ccc !important;
      border-radius: 4px !important;
      background: #fff !important;
      cursor: pointer !important;
      font-size: 13px !important;
      color: #333 !important;
    }
    #toolbar button:hover { background: #f0f0f0 !important; }
    #zoom-display { min-width: 44px !important; text-align: center !important; color: #333 !important; }
    #toolbar .title { font-weight: 700 !important; color: #333 !important; font-size: 14px !important; }
    #search-box {
      padding: 4px 8px !important;
      border-radius: 4px !important;
      border: 1px solid #ccc !important;
      font-size: 13px !important;
      width: 180px !important;
      background: #fff !important;
      color: #333 !important;
    }
    #viewport { position: absolute; top: 42px; left: 0; right: 0; bottom: 0; overflow: hidden; cursor: grab; }
    #viewport.grabbing { cursor: grabbing; }
    #canvas-wrapper { position: absolute; transform-origin: 0 0; }
    .search-highlight { outline: 3px solid #ff6b00 !important; outline-offset: 2px; z-index: 10000 !important; }
    `;
};

const initPortableFunction = (erdDocument: ErdDocument, erdCanvas: HTMLElement) => {
  const { leftEdge, topEdge, rightEdge, bottomEdge } = calculateImageArea(erdCanvas);
  const padding = 100;

  const serializedPerspectives = serializePerspective(erdDocument);

  return `
  (function() {
    const viewport = document.getElementById('viewport');
    const wrapper = document.getElementById('canvas-wrapper');
    const perspectiveSelect = document.getElementById('perspective-select');
    const searchBox = document.getElementById('search-box');
    const zoomDisplay = document.getElementById('zoom-display');
    const cropX = ${leftEdge - padding}, cropY = ${topEdge - padding};
    const contentW = ${rightEdge - leftEdge + padding * 2}, contentH = ${bottomEdge - topEdge + padding * 2};
    const PERSPECTIVES = ${escapeCdata(JSON.stringify(serializedPerspectives))};

    PERSPECTIVES.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      perspectiveSelect.appendChild(opt);
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
        const wx = (el.offsetLeft !== undefined ? el.offsetLeft : r.left);
        const wy = (el.offsetTop !== undefined ? el.offsetTop : r.top);
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
      const relElements = wrapper.querySelectorAll('[data-erd-relation-parent-table-id]');
      const ids = pid === 'all' ? null : idSet.get(pid);
      modelWrappers.forEach(el => {
        const mid = el.getAttribute('data-model-id');
        const show = !ids || ids.has(mid);
        el.style.opacity = show ? '' : '0';
        el.style.pointerEvents = show ? '' : 'none';
      });
      relElements.forEach(el => {
        const p = el.getAttribute('data-erd-relation-parent-table-id');
        const c = el.getAttribute('data-erd-relation-child-table-id');
        const show = !ids || (ids.has(p) && ids.has(c));
        el.style.display = show ? '' : 'none';
        el.setAttribute('visibility', show ? 'visible' : 'hidden');
      });
    }

    perspectiveSelect.addEventListener('change', () => { applyPerspective(perspectiveSelect.value); fitAll(); });

    searchBox.addEventListener('input', () => {
      const q = searchBox.value.toLowerCase().trim();
      wrapper.querySelectorAll('.search-highlight').forEach(el => el.classList.remove('search-highlight'));
      if (!q) return;
      wrapper.querySelectorAll('.${ERD_TABLE_VIEW_CLASS_NAME}').forEach(el => {
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
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement !== perspectiveSelect && document.activeElement !== searchBox) {
        e.preventDefault();
        const opts = perspectiveSelect.options;
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const next = perspectiveSelect.selectedIndex + dir;
        if (next >= 0 && next < opts.length) { perspectiveSelect.selectedIndex = next; perspectiveSelect.dispatchEvent(new Event('change')); }
      }
    });
  })`;
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
