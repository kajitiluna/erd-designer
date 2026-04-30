import ErdDocument from "~/models/ErdDocument";
import download from "~/components/file-downloader";
import { overrideColumnName } from "~/models/database/support";

type CanvasArea = { width: number, height: number };

const escSvg = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escCdata = (s: string) => s.replace(/]]>/g, "]]\\u003E");

export const downloadSvg = (erdDocument: ErdDocument, drawableArea: CanvasArea) => {
    const erdCanvas = document.getElementById("erd-canvas");
    if (erdCanvas == null) return;

    const displayStyle = erdDocument.getDisplayStyle();
    const tableViewModels = erdDocument.getTableViewModels();
    const relationViewModels = erdDocument.getRelationViewModels();
    const { frontMemos, backMemos } = erdDocument.getMemoViewModels();
    const allMemos = [...backMemos, ...frontMemos];

    const perspectives = erdDocument.erdSettingModel.getPerspectiveModels();
    const perspJson = escCdata(JSON.stringify(perspectives.map(p => ({
        id: p.perspectiveId,
        name: p.perspectiveName,
        ids: p.getContainIds()
    }))));

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

        const x = tvm.corner.left + drawableArea.width / 2;
        const y = tvm.corner.top + drawableArea.height / 2;
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
                rows += `<line x1="1" y1="${cumulY}" x2="${tableW - 1}" y2="${cumulY}" stroke="#e0e0e0" stroke-width="0.5"/>`;
            }
            rows += pkIcon + fkIcon + nameEl + typeEl + optEl;
            cumulY += rh;
        }

        svgTables.push(`<g data-model-id="${tvm.tableId}" transform="translate(${x}, ${y})">
  <rect width="${tableW}" height="${tableH}" rx="${BORDER_RADIUS}" fill="#FDFDFD"/>
  <clipPath id="clip-hdr-${tvm.tableId}"><rect width="${tableW}" height="${headerH}" rx="${BORDER_RADIUS}"/></clipPath>
  <rect width="${tableW}" height="${headerH}" fill="${bgHex}" clip-path="url(#clip-hdr-${tvm.tableId})"/>
  <rect x="0" y="${headerH - BORDER_RADIUS}" width="${tableW}" height="${BORDER_RADIUS}" fill="${bgHex}"/>
  <text x="${COL_PAD}" y="${headerH * 0.68}" fill="${fgHex}" font-size="${HEADER_FONT}" font-weight="600" font-family="sans-serif">${escSvg(tableName)}</text>
  <line x1="0" y1="${headerH}" x2="${tableW}" y2="${headerH}" stroke="#000" stroke-width="0.5"/>
  ${rows}
  <rect width="${tableW}" height="${tableH}" rx="${BORDER_RADIUS}" fill="none" stroke="#000" stroke-width="1.5"/>
</g>`);
    }

    const svgMemos: string[] = [];
    for (const memo of allMemos) {
        const rect = memo.rectangleViewModel;
        const mx = rect.positionX + drawableArea.width / 2;
        const my = rect.positionY + drawableArea.height / 2;
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

        const connOffset = { x: drawableArea.width / 2, y: drawableArea.height / 2 };
        renderedSvg.querySelectorAll("g[data-erd-relation-parent-table-id]").forEach(g => {
            const clone = g.cloneNode(true) as SVGGElement;
            clone.setAttribute("transform", `translate(${connOffset.x}, ${connOffset.y})`);
            connectionGroups += clone.outerHTML + "\n";
        });
    }

    erdCanvas.querySelectorAll("div[data-erd-relation-parent-table-id]").forEach(el => {
        const htmlEl = el as HTMLElement;
        const parent = htmlEl.getAttribute("data-erd-relation-parent-table-id") ?? "";
        const child = htmlEl.getAttribute("data-erd-relation-child-table-id") ?? "";
        const text = htmlEl.textContent ?? "";
        if (!text) return;
        const style = htmlEl.style;
        const lx = (parseFloat(style.left) || 0) + drawableArea.width / 2;
        const ly = (parseFloat(style.top) || 0) + drawableArea.height / 2;
        const fs = parseFloat(window.getComputedStyle(htmlEl).fontSize) || 13;
        const color = style.color || "rgba(60,60,60,0.95)";
        const fw = style.fontWeight || "400";
        const fst = style.fontStyle === "italic" ? "italic" : "normal";
        const dec = style.textDecoration?.includes("line-through") ? "line-through" : "none";

        labelGroups += `<text data-erd-relation-parent-table-id="${escSvg(parent)}" data-erd-relation-child-table-id="${escSvg(child)}" x="${lx}" y="${ly + fs}" fill="${color}" font-size="${fs}" font-weight="${fw}" font-style="${fst}" text-decoration="${dec}" font-family="sans-serif">${escSvg(text)}</text>\n`;
    });

    const memoTableMap: Record<string, string[]> = {};
    for (const memo of allMemos) {
        const r = memo.rectangleViewModel;
        const mx = r.positionX + drawableArea.width / 2;
        const my = r.positionY + drawableArea.height / 2;
        const contained = tableRects
            .filter(t => t.x >= mx && t.y >= my && t.x + t.w <= mx + r.width && t.y + t.h <= my + r.height)
            .map(t => t.id);
        if (contained.length > 0) memoTableMap[memo.memoId] = contained;
    }
    const memoTableJson = escCdata(JSON.stringify(memoTableMap));

    const pad = 100;
    const vbX = minX - pad;
    const vbY = minY - pad;
    const vbW = maxX - minX + pad * 2;
    const vbH = maxY - minY + pad * 2;

    const perspOptions = perspectives.map(p => `<option value="${escSvg(p.perspectiveId)}">${escSvg(p.perspectiveName)}</option>`).join("");

    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${vbX} ${vbY} ${vbW} ${vbH}" preserveAspectRatio="none" style="background:#fff;width:100vw;height:100vh;display:block">
<defs>
${defsContent}
<pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
  <rect width="1.25" height="25" fill="#e8e8e8"/>
  <rect width="25" height="1.25" fill="#e8e8e8"/>
</pattern>
<style>
  .search-highlight rect:first-child { stroke: #ff6b00 !important; stroke-width: 3 !important; }
</style>
</defs>
<rect x="-50000" y="-50000" width="150000" height="150000" fill="url(#grid)"/>
<g id="erd-content">
  <g id="memo-layer">${svgMemos.join("\n")}</g>
  <g id="connection-layer">${connectionGroups}</g>
  <g id="label-layer">${labelGroups}</g>
  <g id="table-layer">${svgTables.join("\n")}</g>
</g>
<foreignObject id="ui-overlay" x="0" y="0" width="100%" height="50">
  <div xmlns="http://www.w3.org/1999/xhtml" id="toolbar" style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:#fff;border-bottom:1px solid #ddd;font-family:sans-serif;font-size:13px;color:#333;box-sizing:border-box;overflow:hidden">
    <style>
      #toolbar button:active { background: #e0e0e0 !important; }
      #toolbar button:hover { background: #f5f5f5 !important; }
      #toolbar select:focus, #toolbar input:focus { outline: 1px solid #999; }
    </style>
    <span style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex-shrink:1">${escSvg(erdDocument.documentName)}</span>
    <span style="font-weight:600;white-space:nowrap;flex-shrink:0">Perspective:</span>
    <select id="persp-select" style="padding:4px 8px;border-radius:4px;border:1px solid #ccc;font-size:13px;max-width:340px;background:#fff;color:#333;flex-shrink:0">
      <option value="all" selected="selected">All</option>
      ${perspOptions}
    </select>
    <input id="search-box" type="text" placeholder="Search tables..." style="padding:4px 8px;border-radius:4px;border:1px solid #ccc;font-size:13px;width:180px;background:#fff;color:#333;flex-shrink:1;min-width:80px"/>
    <span style="flex:1"></span>
    <span style="display:flex;align-items:center;gap:4px;flex-shrink:0;white-space:nowrap">
      <button id="zoom-out-btn" style="padding:4px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;color:#333">−</button>
      <span id="zoom-display" style="min-width:40px;text-align:center">100%</span>
      <button id="zoom-in-btn" style="padding:4px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;color:#333">+</button>
      <button id="zoom-fit-btn" style="padding:4px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;color:#333">Fit</button>
    </span>
  </div>
</foreignObject>
<script type="text/ecmascript"><![CDATA[
(function() {
  var svg = document.documentElement;
  var content = document.getElementById('erd-content');
  var overlay = document.getElementById('ui-overlay');
  var perspSelect = document.getElementById('persp-select');
  var zoomDisp = document.getElementById('zoom-display');
  var PERSPECTIVES = ${perspJson};
  var MEMO_TABLES = ${memoTableJson};

  var vbX = ${vbX}, vbY = ${vbY}, vbW = ${vbW}, vbH = ${vbH};
  var curVbX = vbX, curVbY = vbY, curVbW = vbW, curVbH = vbH;

  var idSets = {};
  PERSPECTIVES.forEach(function(p) {
    var s = {}; p.ids.forEach(function(id) { s[id] = true; }); idSets[p.id] = s;
  });

  function updateViewBox() {
    svg.setAttribute('viewBox', curVbX + ' ' + curVbY + ' ' + curVbW + ' ' + curVbH);
    var sw = window.innerWidth || 800;
    var pct = Math.round((sw / curVbW) * 100);
    zoomDisp.textContent = pct + '%';
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
    var tbScreenH = 50;
    overlay.setAttribute('x', curVbX);
    overlay.setAttribute('y', curVbY);
    overlay.setAttribute('width', curVbW);
    overlay.setAttribute('height', tbScreenH * s);
    var tb = document.getElementById('toolbar');
    if (tb) {
      tb.style.transform = 'scale(' + s + ')';
      tb.style.transformOrigin = 'top left';
      tb.style.width = sw + 'px';
    }
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
    curVbW = bb.w / 0.95; curVbH = bb.h / 0.95;
    curVbX = bb.x - (curVbW - bb.w) / 2;
    curVbY = bb.y - (curVbH - bb.h) / 2;
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
    var sw = window.innerWidth || 800;
    var minVbW = sw / 50;
    var newW = Math.max(minVbW, curVbW * factor);
    factor = newW / curVbW;
    var newH = curVbH * factor;
    curVbX = svgPt.x - (svgPt.x - curVbX) * factor;
    curVbY = svgPt.y - (svgPt.y - curVbY) * factor;
    curVbW = newW; curVbH = newH;
    updateViewBox();
  }, {passive: false});

  function zoom(factor) {
    var sw = window.innerWidth || 800;
    var minVbW = sw / 50;
    var cx = curVbX + curVbW / 2, cy = curVbY + curVbH / 2;
    curVbW = Math.max(minVbW, curVbW * factor);
    curVbH = Math.max(minVbW, curVbH * factor);
    curVbX = cx - curVbW / 2; curVbY = cy - curVbH / 2;
    updateViewBox();
  }

  document.getElementById('zoom-in-btn').addEventListener('click', function() { zoom(0.8); });
  document.getElementById('zoom-out-btn').addEventListener('click', function() { zoom(1.25); });
  document.getElementById('zoom-fit-btn').addEventListener('click', fitAll);

  function applyPerspective(pid) {
    var ids = pid === 'all' ? null : idSets[pid];
    var models = content.querySelectorAll('[data-model-id]');
    var rels = content.querySelectorAll('[data-erd-relation-parent-table-id]');
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
      var p = rels[j].getAttribute('data-erd-relation-parent-table-id');
      var c = rels[j].getAttribute('data-erd-relation-child-table-id');
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

  var searchBox = document.getElementById('search-box');
  searchBox.addEventListener('input', function() {
    var q = searchBox.value.toLowerCase().trim();
    var tables = document.getElementById('table-layer').querySelectorAll('[data-model-id]');
    for (var i = 0; i < tables.length; i++) {
      var cls = tables[i].getAttribute('class') || '';
      tables[i].setAttribute('class', cls.replace(/\\s*search-highlight/g, ''));
    }
    if (!q) return;
    for (var j = 0; j < tables.length; j++) {
      var hdr = tables[j].querySelector('text');
      if (hdr && hdr.textContent.toLowerCase().indexOf(q) >= 0) {
        var c2 = tables[j].getAttribute('class') || '';
        tables[j].setAttribute('class', c2 + ' search-highlight');
      }
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === '0' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fitAll(); }
    if (e.key === '=' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); zoom(0.8); }
    if (e.key === '-' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); zoom(1.25); }
    if (e.key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); searchBox.focus(); }
    if (e.key === 'Escape') { searchBox.blur(); searchBox.value = ''; searchBox.dispatchEvent(new Event('input')); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      if (document.activeElement === perspSelect || document.activeElement === searchBox) return;
      e.preventDefault(); perspStep(1);
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      if (document.activeElement === perspSelect || document.activeElement === searchBox) return;
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
