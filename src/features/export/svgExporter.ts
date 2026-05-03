import ErdDocument from "~/models/ErdDocument";
import download from "~/components/file-downloader";
import { overrideColumnName } from "~/models/database/support";
import { escapeCdata, serializeMemo, serializePerspective } from "~/features/export/support";

export const downloadSvg = (erdDocument: ErdDocument, erdCanvas: HTMLElement) => {
  const svgContent = initPortableSvg(erdDocument, erdCanvas);

  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const fileName = `${erdDocument.documentName}.svg`;

  download(fileName, blob);
};

const initPortableSvg = (erdDocument: ErdDocument, erdCanvas: HTMLElement) => {
  const { svgTables, location: tableLocation } = initTableSvg(erdDocument, erdCanvas);
  const { svgMemos, location: memoLocation } = initMemoSvg(erdDocument, erdCanvas);
  const { svgRelationLines, edgeDefinition } = initRelationLineSvg(erdCanvas);
  const svgRelationLabels = initRelationLabelSvg(erdCanvas);

  const minX = Math.min(tableLocation.minX, memoLocation.minX);
  const minY = Math.min(tableLocation.minY, memoLocation.minY);
  const maxX = Math.max(tableLocation.maxX, memoLocation.maxX);
  const maxY = Math.max(tableLocation.maxY, memoLocation.maxY);

  const padding = 100;
  const viewBox = {
    x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2
  };

  const perspectives = erdDocument.erdSettingModel.getPerspectiveModels();
  const perspectiveOptions = perspectives.map(perspective =>
    `<option value="${escapeSvg(perspective.perspectiveId)}">${escapeSvg(perspective.perspectiveName)}</option>`
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}"
      preserveAspectRatio="none" style="background:#fff;width:100vw;height:100vh;display:block">
    <defs>
    ${edgeDefinition}
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
      <g id="connection-layer">${svgRelationLines.join("")}</g>
      <g id="label-layer">${svgRelationLabels.join("")}</g>
      <g id="table-layer">${svgTables.join("\n")}</g>
    </g>
    <foreignObject id="ui-overlay" x="0" y="0" width="100%" height="50">
      <div xmlns="http://www.w3.org/1999/xhtml" id="toolbar"
        style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:#fff;border-bottom:1px solid #ddd;font-family:sans-serif;font-size:13px;color:#333;box-sizing:border-box;overflow:hidden">
        <style>
          #toolbar button:active { background: #e0e0e0 !important; }
          #toolbar button:hover { background: #f5f5f5 !important; }
          #toolbar select:focus, #toolbar input:focus { outline: 1px solid #999; }
        </style>
        <span style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex-shrink:1">${escapeSvg(erdDocument.documentName)}</span>
        <span style="font-weight:600;white-space:nowrap;flex-shrink:0">Perspective:</span>
        <select id="persp-select" style="padding:4px 8px;border-radius:4px;border:1px solid #ccc;font-size:13px;max-width:340px;background:#fff;color:#333;flex-shrink:0">
          <option value="all" selected="selected">All</option>
          ${perspectiveOptions}
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
    <script type="text/ecmascript"><![CDATA[(${initPortableFunction(erdDocument, erdCanvas, viewBox)})();]]></script>
  </svg>`;
};

const COL_PAD = 8;
const FONT_SIZE = 12;
const HEADER_FONT = 13;
const BORDER_RADIUS = 10;
const FALLBACK_HEADER_H = 28;
const FALLBACK_ROW_H = 24;

const initTableSvg = (erdDocument: ErdDocument, erdCanvas: HTMLElement) => {
  const tableViewModels = erdDocument.getTableViewModels();
  const displayStyle = erdDocument.getDisplayStyle();

  const tableElements = tableViewModels.map(tableView => {
    const tableModel = tableView.tableModel;
    const allColumns = erdDocument.toAllColumnModels(tableModel);
    const tableName = displayStyle.displayName(tableModel.physicalName, tableModel.logicalName);

    const tableDom = document.getElementById(tableView.tableId);
    if (tableDom == null) {
      return null;
    }

    const tableX = tableView.corner.left + erdCanvas.offsetWidth / 2;
    const tableY = tableView.corner.top + erdCanvas.offsetHeight / 2;
    const tableWidth = tableDom.offsetWidth;
    const tableHeight = tableDom.offsetHeight;
    const tableLocation = { minX: tableX, minY: tableY, maxX: tableX + tableWidth, maxY: tableY + tableHeight };

    const { childRelations } = erdDocument.findRelatedRelations(tableView.tableId);
    const fkColumnIds = new Set(childRelations.flatMap(relation =>
      relation.relationModel.relationPairs.map(pair => pair.childColumnModelId)
    ));

    const tableHeaderDom = tableDom.querySelector("table")?.parentElement?.previousElementSibling as HTMLElement | null;
    const headerHeight = tableHeaderDom ? tableHeaderDom.offsetHeight : FALLBACK_HEADER_H;

    const tableTrDom = tableDom.querySelectorAll("tr");
    const rowHeights: number[] = (tableTrDom.length > 0)
      ? Array.from(tableTrDom).map(rowDom => rowDom.offsetHeight)
      : Array(allColumns.length).fill(FALLBACK_ROW_H);

    const cellDoms = (tableTrDom.length > 0) ? tableTrDom[0].querySelectorAll("td") : null;
    const pkColumnWidth = (cellDoms && cellDoms.length >= 1) ? cellDoms[0].offsetWidth : 20;
    const fkColumnWidth = (cellDoms && cellDoms.length >= 2) ? cellDoms[1].offsetWidth : 20;
    const nameColumnWidth = (cellDoms && cellDoms.length >= 3) ? cellDoms[2].offsetWidth : 100;
    const typeColumnWidth = (cellDoms && cellDoms.length >= 4) ? cellDoms[3].offsetWidth : 80;

    const { svgText: svgColumns } = allColumns.reduce((acc, columnModel, indexColumn) => {
      const shareModel = erdDocument.findColumnShareModel(columnModel.columnShareModelId);
      if (shareModel == null) {
        return acc;
      }

      const { physicalName, logicalName } = overrideColumnName(columnModel, shareModel);
      const columnName = displayStyle.displayName(physicalName, logicalName);
      const inRelation = erdDocument.inChildRelation(tableModel.tableModelId, columnModel.columnModelId);
      const columnType = shareModel.specifiedColumnType(inRelation);

      const columnRowHeight = rowHeights[indexColumn] ?? FALLBACK_ROW_H;
      const textY = acc.heigth + columnRowHeight * 0.68;

      let xOffset = COL_PAD;
      const pkIcon = (columnModel.primaryKey === false) ? ""
        : `<text x="${xOffset + 2}" y="${textY}" fill="#90292F" font-size="10" font-family="monospace">PK</text>`;
      xOffset += pkColumnWidth;

      const fkIcon = (fkColumnIds.has(columnModel.columnModelId) === false) ? ""
        : `<text x="${xOffset + 2}" y="${textY}" fill="#212490" font-size="10" font-family="monospace">FK</text>`;
      xOffset += fkColumnWidth;

      const nameColor = columnModel.primaryKey ? "#90292F" : (
        (fkColumnIds.has(columnModel.columnModelId) ? "#212490" : "#333")
      );
      const nameEl = `<text x="${xOffset}" y="${textY}" fill="${nameColor}" font-size="${FONT_SIZE}" ` +
        `font-family="sans-serif">${escapeSvg(columnName)}</text>`;
      xOffset += nameColumnWidth;

      const typeEl = `<text x="${xOffset}" y="${textY}" fill="#666" font-size="11" ` +
        `font-family="sans-serif">${escapeSvg(columnType)}</text>`;
      xOffset += typeColumnWidth;

      const options = [(columnModel.notNull ? "NN" : null), (columnModel.unique ? "U" : null)]
        .filter(option => option !== null);
      const optEl = (options.length === 0) ? ""
        : `<text x="${xOffset}" y="${textY}" fill="#888" font-size="11" font-family="sans-serif">` +
        `${escapeSvg(options.join(", "))}</text>`;

      const separator = (indexColumn === 0) ? ""
        : `<line x1="1" y1="${acc.heigth}" x2="${tableWidth - 1}" y2="${acc.heigth}" stroke="#e0e0e0" stroke-width="0.5"/>`;

      const nextRow = separator + pkIcon + fkIcon + nameEl + typeEl + optEl;

      return { svgText: acc.svgText + nextRow, heigth: acc.heigth + columnRowHeight };
    }, { svgText: "", heigth: headerHeight });

    const bgHex = tableView.headerColor.background.toHex();
    const fgHex = tableView.headerColor.foreground.toHex();

    const svgTable = [
      `<g data-model-id="${tableView.tableId}" transform="translate(${tableX}, ${tableY})">`,
      `<rect width="${tableWidth}" height="${tableHeight}" rx="${BORDER_RADIUS}" fill="#FDFDFD"/>`,
      `<clipPath id="clip-hdr-${tableView.tableId}">`,
      `<rect width="${tableWidth}" height="${headerHeight}" rx="${BORDER_RADIUS}"/>`,
      `</clipPath>`,
      `<rect width="${tableWidth}" height="${headerHeight}" fill="${bgHex}" clip-path="url(#clip-hdr-${tableView.tableId})"/>`,
      `<rect x="0" y="${headerHeight - BORDER_RADIUS}" width="${tableWidth}" height="${BORDER_RADIUS}" fill="${bgHex}"/>`,
      `<text x="${COL_PAD}" y="${headerHeight * 0.68}" fill="${fgHex}" `,
      `font-size="${HEADER_FONT}" font-weight="600" font-family="sans-serif">${escapeSvg(tableName)}</text>`,
      `<line x1="0" y1="${headerHeight}" x2="${tableWidth}" y2="${headerHeight}" stroke="#000" stroke-width="0.5"/>`,
      svgColumns,
      `<rect width="${tableWidth}" height="${tableHeight}" rx="${BORDER_RADIUS}" fill="none" stroke="#000" stroke-width="1.5"/>`,
      `</g>`
    ].join("");

    return { svgTable, tableLocation };
  }).filter(item => item != null);

  return tableElements.reduce((acc, { svgTable, tableLocation }) => {
    const nextLocation = {
      minX: Math.min(acc.location.minX, tableLocation.minX),
      minY: Math.min(acc.location.minY, tableLocation.minY),
      maxX: Math.max(acc.location.maxX, tableLocation.maxX),
      maxY: Math.max(acc.location.maxY, tableLocation.maxY)
    };

    return { svgTables: [...acc.svgTables, svgTable], location: nextLocation };
  }, { svgTables: [] as string[], location: INIT_LOCATION });
};

const initMemoSvg = (erdDocument: ErdDocument, erdCanvas: HTMLElement) => {
  const { frontMemos, backMemos } = erdDocument.getMemoViewModels();

  const memoElements = [...backMemos, ...frontMemos].map(memoView => {
    const rect = memoView.rectangleViewModel;
    const memoX = rect.positionX + erdCanvas.offsetWidth / 2;
    const memoY = rect.positionY + erdCanvas.offsetHeight / 2;

    const horizontalAlign = memoView.horizontalAlign;
    const { textAnchor, textX } = (horizontalAlign === "center") ? { textAnchor: "middle", textX: rect.width / 2 } : (
      (horizontalAlign === "end") ? { textAnchor: "end", textX: rect.width - 10 } : { textAnchor: "start", textX: 10 }
    );

    const memoLines = memoView.memo.split("\n");
    const fontSize = memoView.fontSize;
    const lineHeight = fontSize * 1.4;
    const totalTextH = memoLines.length * lineHeight;
    const verticalAlign = memoView.verticalAlign;
    const startY = (verticalAlign === "center") ? ((rect.height - totalTextH) / 2 + lineHeight) : (
      (verticalAlign === "start") ? lineHeight : (rect.height - totalTextH + lineHeight)
    );

    const bgHex = memoView.backgroundColor.toHex();
    const fgHex = memoView.foregroundColor.toHex();

    const textElements = memoLines.map((memoLine, index) => {
      const attributes = [
        `x="${textX}"`,
        `y="${startY + index * lineHeight}"`,
        `fill="${fgHex}"`,
        `font-size="${fontSize}"`,
        `font-family="sans-serif"`,
        `text-anchor="${textAnchor}"`
      ];

      return `<text ${attributes.join(" ")}>${escapeSvg(memoLine)}</text>`;
    });

    const memoSvg = [
      `<g data-model-id="${memoView.memoId}" transform="translate(${memoX}, ${memoY})">`,
      `<rect width="${rect.width}" height="${rect.height}" fill="${bgHex}" rx="2"/>`,
      textElements.join("\n"),
      `</g>`
    ].join("");

    const memoLocation = {
      minX: memoX, minY: memoY, maxX: memoX + rect.width, maxY: memoY + rect.height
    };

    return { memoSvg, memoLocation }
  });

  return memoElements.reduce((acc, { memoSvg, memoLocation }) => {
    const nextLocation = {
      minX: Math.min(acc.location.minX, memoLocation.minX),
      minY: Math.min(acc.location.minY, memoLocation.minY),
      maxX: Math.max(acc.location.maxX, memoLocation.maxX),
      maxY: Math.max(acc.location.maxY, memoLocation.maxY)
    };

    return { svgMemos: [...acc.svgMemos, memoSvg], location: nextLocation };
  }, { svgMemos: [] as string[], location: INIT_LOCATION });
};

const INIT_LOCATION = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

const initRelationLineSvg = (erdCanvas: HTMLElement) => {
  const renderedSvg = erdCanvas.querySelector("svg");
  if (renderedSvg == null) {
    return { svgRelationLines: [], edgeDefinition: "" };
  }

  const defs = renderedSvg.querySelector("defs");
  const edgeDefinition = defs ? defs.innerHTML : "";

  const connOffset = { x: erdCanvas.offsetWidth / 2, y: erdCanvas.offsetHeight / 2 };
  const relatoinElements = Array.from(renderedSvg.querySelectorAll("g[data-erd-relation-parent-table-id]"));
  const relations = relatoinElements.map(element => {
    const clonedElement = element.cloneNode(true) as SVGGElement;
    clonedElement.setAttribute("transform", `translate(${connOffset.x}, ${connOffset.y})`);

    return clonedElement.outerHTML + "\n";
  })

  return { svgRelationLines: relations, edgeDefinition };
};

const initRelationLabelSvg = (erdCanvas: HTMLElement) => {
  const labelElements = Array.from(erdCanvas.querySelectorAll("div[data-erd-relation-parent-table-id]"));

  return labelElements.map(element => {
    const htmlElement = element as HTMLElement;
    const parent = htmlElement.getAttribute("data-erd-relation-parent-table-id") ?? "";
    const child = htmlElement.getAttribute("data-erd-relation-child-table-id") ?? "";
    const text = htmlElement.textContent;
    if (!text) {
      return "";
    }

    const style = htmlElement.style;
    const labelX = (parseFloat(style.left) || 0) + erdCanvas.offsetWidth / 2;
    const labelY = (parseFloat(style.top) || 0) + erdCanvas.offsetHeight / 2;
    const fontSize = parseFloat(window.getComputedStyle(htmlElement).fontSize) || 13;
    const color = style.color || "rgba(60,60,60,0.95)";
    const fontWeight = style.fontWeight || "400";
    const fontStyle = style.fontStyle === "italic" ? "italic" : "normal";
    const decoration = style.textDecoration?.includes("line-through") ? "line-through" : "none";

    const attributes = [
      `data-erd-relation-parent-table-id="${escapeSvg(parent)}"`,
      `data-erd-relation-child-table-id="${escapeSvg(child)}"`,
      `x="${labelX}"`,
      `y="${labelY + fontSize}"`,
      `fill="${color}"`,
      `font-size="${fontSize}"`,
      `font-weight="${fontWeight}"`,
      `font-style="${fontStyle}"`,
      `font-family="sans-serif"`,
      `text-decoration="${decoration}"`
    ];

    return `<text ${attributes.join(" ")}>${escapeSvg(text)}</text>`;
  });
};

const initPortableFunction = (
  erdDocument: ErdDocument, erdCanvas: HTMLElement, viewBox: { x: number, y: number, width: number, height: number }
) => {

  const serializedPerspectives = serializePerspective(erdDocument);
  // FIXME: テーブルを囲っているメモも描画するための設定のようだが、perspective の設定と異なる表示になっている。
  const memoTableMap = serializeMemo(erdDocument, erdCanvas);

  return `
  function() {
    var svg = document.documentElement;
    var content = document.getElementById('erd-content');
    var overlay = document.getElementById('ui-overlay');
    var perspSelect = document.getElementById('persp-select');
    var zoomDisp = document.getElementById('zoom-display');
    var PERSPECTIVES = ${escapeCdata(JSON.stringify(serializedPerspectives))};
    var MEMO_TABLES = ${escapeCdata(JSON.stringify(memoTableMap))};

    var vbX = ${viewBox.x}, vbY = ${viewBox.y}, vbW = ${viewBox.width}, vbH = ${viewBox.height};
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
  }`;
};

const escapeSvg = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
