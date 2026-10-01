// Matrix module — devices × pages iframe grid, selection + per-cell overrides.
import {
  mockupApplication,
  selectedColumn,
  mockupId,
  selectedPages,
  setSelectedColumn,
  setMockupDirty,
  saveCurrentMockupApplication,
  pushMockupHistory,
  togglePageSelection,
  clearPageSelection,
} from "./state.js";
import { escapeHtml, showToast } from "./utils.js";
import { centerArtboardInViewport, loadColumnIntoFabric, createPageCanvas, destroyPageCanvas, setActivePage, pageCanvases, reorderStageArtboards } from "./canvas.js";
import { renderMockupLayersPanel, syncSection2Inputs } from "./editor.js";
import { designSizeFor, findSizeTarget, sizeTargetsFor } from "/dist/mockup/sizeTargets.js";

// Per spec: selectedCell = { deviceRowId, columnId }. Null until matrix interaction.
export let selectedCell = null;
export function setSelectedCell(v) { selectedCell = v; }

// Matrix cell preview thumbnail size -- computed per render from the actual
// available space in .mockup-page-previews-scroll (see computeCellDims), not
// a hardcoded constant, so previews fill the container's real height instead
// of leaving it looking oversized around small fixed-size thumbnails. There
// is deliberately no low height cap: the container's own height is never
// shrunk to fit the content, so previews must grow to fill *it* -- if that
// makes the table wider than the container, that's fine, the container
// scrolls horizontally (overflow-x:auto) rather than the cells staying
// small to avoid a scrollbar.
const MATRIX_CELL_MIN_HEIGHT = 280;
const MATRIX_CELL_MAX_HEIGHT = 1600; // sanity ceiling only, not a practical limit on normal screens
// Measured against the real rendered thead (checkbox + "#N", wraps to two
// lines -> ~49px) and tfoot (delete button row -> ~33px), plus a few px of
// safety margin so rounding/font-metric differences across browsers can
// never push the table taller than the container.
const MATRIX_HEADER_ROW_H = 54;
const MATRIX_FOOTER_ROW_H = 38;
const MATRIX_ROW_OVERHEAD_H = 12; // each body row's own td padding + border-bottom

/** Reads the scroll container's own height (set by flex layout, independent
 *  of its content -- see app.css's `.mockup-page-previews-scroll { flex:1 1
 *  auto; height:0; overflow-y:hidden; }`) so it can be measured *before* the
 *  table is (re)built, and sizes cell previews to fill it exactly -- floored
 *  (never rounded up) and with header/footer/row chrome budgeted in, so the
 *  table can never exceed the container's real height and vertically
 *  overflow. Only horizontal scrolling (for extra pages) is ever allowed. */
function computeCellDims(scrollEl, rowCount, designH = 1920) {
  const container = scrollEl?.parentElement || (typeof document !== "undefined" ? document.querySelector(".mockup-matrix-container") : null);
  const containerH = container?.clientHeight || 440;
  // If scrollEl.clientHeight is not yet measured (0 or collapsed), fallback to container height budget
  const availH = Math.max(scrollEl?.clientHeight || 0, containerH - 56, 370);
  const usable = availH - MATRIX_HEADER_ROW_H - MATRIX_FOOTER_ROW_H - rowCount * MATRIX_ROW_OVERHEAD_H;
  const perRow = rowCount > 0 ? usable / rowCount : usable;
  const height = Math.floor(Math.max(MATRIX_CELL_MIN_HEIGHT, Math.min(MATRIX_CELL_MAX_HEIGHT, perRow || MATRIX_CELL_MIN_HEIGHT)));
  const scale = height / designH;
  const width = Math.round(1080 * scale);
  return { height, width, scale };
}

let matrixResizeObserver = null;
function setupMatrixResizeObserver(scrollEl) {
  if (matrixResizeObserver || !scrollEl || typeof ResizeObserver === "undefined") return;
  let rafId = null;
  matrixResizeObserver = new ResizeObserver(() => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (document.getElementById("mockup-matrix")) renderMockupMatrix();
    });
  });
  const container = scrollEl.parentElement || scrollEl;
  matrixResizeObserver.observe(container);
}

let matrixRenderVersion = 0;

// Mirrors src/mockup/application.ts's effectiveCellStyle(): legacy whole-sub-object
// override keys apply first, then sparse "__paths" per-field patches on top.
const PATCH_KEY = "__paths";

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

// Resolved style for current cell (overrides spread, falls back to base).
function resolvedStyleFor(application, deviceRowId, columnId) {
  const col = application?.columns?.find((c) => c.id === columnId);
  if (!col) return null;
  return col.style; // page style is the only editable style; cell overrides ignored (matches server)
}

export function getSelectedCellStyle() {
  return selectedColumn?.style ?? null;
}

export function renderMockupMatrix() {
  // Cache-busting for the cell-preview iframes below: without this, a saved
  // edit can update the server's rendered HTML while the iframe (same src
  // string as before) keeps showing a browser-cached response -- the preview
  // silently goes stale relative to the canvas. Bumped once per render call,
  // not per cell, so every iframe in this render shares one fresh version.
  matrixRenderVersion += 1;

  // One real id: #mockup-matrix. Keep compat ids as fallbacks.
  const table =
    document.getElementById("mockup-matrix") ||
    document.getElementById("mockup-matrix-container") ||
    document.getElementById("mockup-matrix-grid");
  if (!table || !mockupApplication) return;

  const columns = mockupApplication.columns || [];
  const devices = mockupApplication.devices || [];

  if (columns.length === 0) {
    table.innerHTML = `<tr><td class="hint" style="padding:1.5rem; text-align:center;">No pages yet.</td></tr>`;
    return;
  }

  const rowSources = devices.length ? devices : [{ id: "__base", label: "Base screen" }];
  const scrollEl = table.parentElement;
  if (scrollEl) {
    setupMatrixResizeObserver(scrollEl);
    if (!scrollEl.dataset.wheelBound) {
      scrollEl.dataset.wheelBound = "true";
      scrollEl.addEventListener("wheel", (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && scrollEl.scrollWidth > scrollEl.clientWidth) {
          scrollEl.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }, { passive: false });
    }
  }

  // Saved-only grid: each row renders at its size target's design height (legacy rows without a sizeKey: 1920).
  const rowDesignH = (dev) => { const t = findSizeTarget(dev.sizeKey)?.target; return t ? designSizeFor(t).height : 1920; };
  const cellDimsByRow = new Map(rowSources.map((d) => [d.id, computeCellDims(scrollEl, rowSources.length, rowDesignH(d))]));

  // Header: corner + one th per screen
  let html = "<thead><tr>";
  html += `<th style="font-size:.75rem; color:var(--text-secondary); font-weight:600; padding:.35rem .5rem; text-align:left;">Row / Page</th>`;
  for (let j = 0; j < columns.length; j++) {
    const cid = columns[j].id;
    const isSelCol = !!selectedColumn && selectedColumn.id === cid;
    const selIdx = selectedPages.indexOf(cid);
    // Every selected page is equally "selected" -- one consistent accent
    // color (the app's existing blue) regardless of how many are checked or
    // which one is the currently-active editing page.
    const isSelected = isSelCol || selIdx !== -1;
    const selStyle = isSelected ? `background:rgba(59,130,246,.10); border-bottom:2px solid #3b82f6;` : "";
    const selBadge = selIdx !== -1 ? ` <span title="Selected -- shown in the editing canvas" style="color:#60a5fa;">🔗${selIdx + 1}</span>` : "";
    html += `<th data-col-id="${escapeHtml(cid)}" style="font-size:.75rem; padding:.35rem .5rem; text-align:center; ${selStyle}">
      <input type="checkbox" class="matrix-pair-checkbox" data-col-id="${escapeHtml(cid)}" title="Select this page for panorama editing" ${selIdx !== -1 ? "checked" : ""} style="vertical-align:middle; margin-right:2px; cursor:pointer;" />
      #${j + 1}${selBadge}
    </th>`;
  }
  html += "</tr></thead>";

  const deviceIdsFrag = encodeURIComponent((devices.map((d) => d.id).join(",")) );

  // Body: one row per device row, one cell per (deviceRowId, columnId). First row also used when devices empty (single synthetic row).
  html += "<tbody>";
  for (const dev of rowSources) {
    const cellDims = cellDimsByRow.get(dev.id);
    const dh = rowDesignH(dev);
    html += `<tr data-device-row="${escapeHtml(dev.id)}">`;
    html += `<td style="font-size:.78rem; font-weight:600; color:var(--text-primary); padding:.4rem .5rem; white-space:nowrap;">${escapeHtml(dev.label || dev.id)}</td>`;
    for (const col of columns) {
      const key = `${dev.id}:${col.id}`;
      const isActive =
        !!selectedCell && selectedCell.deviceRowId === dev.id && selectedCell.columnId === col.id;
      // Any selected page must show as selected across every device row for
      // that column, not just the one exact (deviceRow, column) cell
      // selectedCell points at -- previously only the single active cell
      // got any highlight, so with multiple pages selected only one ever
      // visibly looked selected in the preview grid.
      const isPairedCol = !isActive && selectedPages.includes(col.id);
      const style = resolvedStyleFor(mockupApplication, dev.id === "__base" ? null : dev.id, col.id);
      const title = style?.title?.text || col.style?.title?.text || `Page ${columns.indexOf(col) + 1}`;
      // Prefer real server iframe preview; fall back to mini card if unavailable.
      const useIframe = !!mockupId && !!mockupApplication?.columns?.length;
      const cellPreview = useIframe
        ? `<div class="matrix-preview-box" data-design-h="${dh}" style="width:${cellDims.width}px; height:${cellDims.height}px; overflow:hidden; border-radius:6px; background:#0f172a;">
             <iframe class="matrix-preview-frame" title="${escapeHtml(title)}" loading="lazy" src="/api/mockups/${encodeURIComponent(mockupId)}/cell-preview/${encodeURIComponent(dev.id === "__base" ? (devices[0]?.id || dev.id) : dev.id)}/${encodeURIComponent(col.id)}?v=${matrixRenderVersion}" style="width:1080px; height:${dh}px; border:0; display:block; transform:scale(${cellDims.scale}); transform-origin:top left; pointer-events:none;"></iframe>
           </div>`
        : `<div style="height:96px; border-radius:6px; background: #0f172a; border:1px solid #334155; display:flex; flex-direction:column; justify-content:space-between; padding:.6rem;">
             <div style="font-size:.7rem; font-weight:700; color:#fff; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(title)}</div>
             <div style="width:70%; height:60%; margin:0 auto; background:#1e293b; border-radius:6px; border:1px solid #475569;"></div>
           </div>`;

      // Same accent color (blue) whether this cell is the exact active one
      // or the other half of a pair -- both are equally "selected", so they
      // must never read as two different selection states.
      const cellSelectStyle = isActive || isPairedCol
        ? "outline:2px solid #3b82f6; outline-offset:-2px; background:rgba(59,130,246,.08);"
        : "";
      html += `<td data-device-row="${escapeHtml(dev.id)}" data-col-id="${escapeHtml(col.id)}" data-cell-key="${escapeHtml(key)}" style="padding:.3rem; cursor:default; ${cellSelectStyle}">
        ${cellPreview}
      </td>`;
    }
    html += "</tr>";
  }
  html += "</tbody>";
  html += `<tfoot><tr><td></td>${columns
    .map(
      (c) =>
        `<td style="text-align:center; padding:.3rem;"><button class="small danger matrix-del-btn" data-column-id="${escapeHtml(c.id)}" title="Delete Page" style="padding:2px 6px;">🗑️</button></td>`
    )
    .join("")}</tr></tfoot>`;

  table.innerHTML = html;

  // Self-correcting safety net: only trigger shrink if scrollElNow has a real height (>150px)
  // to avoid shrinking on initial render when height hasn't laid out yet.
  const scrollElNow = table.parentElement;
  const realScrollH = scrollElNow?.clientHeight || 0;
  if (realScrollH > 150) {
    const overflowPx = table.offsetHeight - realScrollH;
    if (overflowPx > 5 && rowSources.length > 0) {
      const shrinkPerRow = Math.ceil(overflowPx / rowSources.length);
      for (const box of table.querySelectorAll(".matrix-preview-box")) {
        const fixedHeight = Math.max(MATRIX_CELL_MIN_HEIGHT, parseFloat(box.style.height) - shrinkPerRow);
        const fixedScale = fixedHeight / Number(box.dataset.designH || 1920);
        box.style.width = `${Math.round(1080 * fixedScale)}px`;
        box.style.height = `${fixedHeight}px`;
        const frame = box.querySelector(".matrix-preview-frame");
        if (frame) frame.style.transform = `scale(${fixedScale})`;
      }
    }
  }

  // Preview cells are display-only -- selection happens exclusively through
  // the per-page checkbox below, never by clicking a preview (or its header).
  for (const b of table.querySelectorAll(".matrix-del-btn")) {
    b.onclick = (e) => {
      e.stopPropagation();
      deleteMockupPage(b.getAttribute("data-column-id"));
    };
  }
  for (const cb of table.querySelectorAll(".matrix-pair-checkbox")) {
    cb.onclick = (e) => e.stopPropagation();
    cb.onchange = () => {
      const cid = cb.getAttribute("data-col-id");
      togglePageSelection(cid); // unbounded now -- always succeeds
      syncEditingAreaToSelectedPages();
      renderMockupMatrix();
    };
  }
}

/** Drives the editing area from selectedPages (the checkboxes are the only
 *  way pages get selected now -- see renderMockupMatrix above): destroys
 *  canvases for pages no longer selected, creates canvases for newly
 *  selected ones, and activates whichever page was already active (if it's
 *  still selected) or defaults to the first selected page -- so any number
 *  of selected pages show together as one continuous panorama, with
 *  exactly one active/fully-editable at a time (see canvas.js's
 *  setActivePage). 0 selected is a no-op (nothing to show); 1 selected
 *  degenerates to exactly the original single-canvas editing behavior. */
export async function syncEditingAreaToSelectedPages() {
  for (const pageId of [...pageCanvases.keys()]) {
    if (!selectedPages.includes(pageId)) destroyPageCanvas(pageId);
  }
  for (const pageId of selectedPages) {
    if (!pageCanvases.has(pageId)) createPageCanvas(pageId);
  }
  // Must run regardless of selection order: createPageCanvas appends new
  // artboards in whatever order this loop iterated selectedPages
  // (selection order), but the panorama must always display in document
  // order (Page 1 -> 2 -> 3 -> ...) -- see reorderStageArtboards's doc
  // comment for the bug this fixes.
  reorderStageArtboards();
  if (selectedPages.length === 0) return;
  const activeId = selectedColumn && selectedPages.includes(selectedColumn.id) ? selectedColumn.id : selectedPages[0];
  await setActivePage(activeId);
  const col = mockupApplication?.columns?.find((c) => c.id === activeId);
  if (col) {
    const deviceRowId = (mockupApplication.devices && mockupApplication.devices[0]?.id) || "__base";
    selectedCell = { deviceRowId, columnId: activeId };
    renderMockupLayersPanel(col);
    syncSection2Inputs(col, null);
  }
}

/** Mirrors app.js:4812 selectCell (devices × screens). */
export function selectCell(deviceRowId, columnId) {
  if (!mockupApplication) return;
  const col = mockupApplication.columns.find((c) => c.id === columnId);
  if (!col) return;
  selectedCell = { deviceRowId, columnId };
  setSelectedColumn(col);
  renderMockupMatrix();
  try { centerArtboardInViewport(); } catch (_) {}
  // Inspector: only visible if in editor section
  const isEditorActive = document.getElementById("mockup-section-mockup-editing")?.classList.contains("active");
  const inspector = document.getElementById("mockup-inspector");
  if (inspector) inspector.style.display = isEditorActive ? "block" : "none";
  const row = mockupApplication.devices?.find((d) => d.id === deviceRowId);
  const colIndex = mockupApplication.columns.findIndex((c) => c.id === columnId) + 1;
  const targetEl = document.getElementById("mockup-inspector-target");
  if (targetEl) targetEl.textContent = `${row ? row.label : "Device"} — Page ${colIndex}`;
  renderMockupLayersPanel(col);
  syncSection2Inputs(col, null);
}

/** Switches to viewing/editing just this one page, replacing whatever
 *  selection was active (used by template load, "+ Add Page", and
 *  delete-then-select-next -- all "establish a fresh single-page view"
 *  cases, never meant to preserve an existing multi-page panorama
 *  selection). Delegates canvas creation/activation to
 *  syncEditingAreaToSelectedPages, same as the checkbox path. */
export async function selectMockupPage(columnId) {
  if (!mockupApplication) return;
  const col = mockupApplication.columns.find((c) => c.id === columnId);
  if (!col) return;
  clearPageSelection();
  togglePageSelection(columnId);
  await syncEditingAreaToSelectedPages();
  renderMockupMatrix();
  const isEditorActive2 = document.getElementById("mockup-section-mockup-editing")?.classList.contains("active");
  const insp = document.getElementById("mockup-inspector");
  if (insp) insp.style.display = isEditorActive2 ? "block" : "none";
}

export async function deleteMockupPage(columnId) {
  if (!mockupApplication || mockupApplication.columns.length <= 1) {
    if (window.alert) window.alert("Cannot delete the only page.");
    return;
  }
  const idx = mockupApplication.columns.findIndex((c) => c.id === columnId);
  if (idx === -1) return;

  mockupApplication.columns.splice(idx, 1);
  mockupApplication.columns.forEach((c, i) => (c.order = i));

  if (typeof saveCurrentMockupApplication === "function") await saveCurrentMockupApplication();
  if (typeof pushMockupHistory === "function") pushMockupHistory();

  const next = mockupApplication.columns[Math.min(idx, mockupApplication.columns.length - 1)];
  if (next) selectMockupPage(next.id);
  else renderMockupMatrix();
  refreshLiveIfVisible();
}

export function defaultColumnStyle(title) {
  return {
    layout: "single-title-above",
    background: { type: "gradient", value: "ocean" },
    title: { text: title, color: "#ffffff", size: 58, align: "center" },
    subtitle: { text: "Add your description here", color: "#94a3b8", size: 36, align: "center" },
    deviceOne: { size: 90, x: 0, y: 0, rotation: 0, brightness: 100, visible: true },
    assetLayers: [],
  };
}

export async function addMockupPage() {
  if (!mockupApplication) return;
  const newCol = {
    id: `col_${Date.now()}`,
    order: mockupApplication.columns.length,
    style: defaultColumnStyle(`New Page ${mockupApplication.columns.length + 1}`),
  };

  mockupApplication.columns.push(newCol);
  if (typeof saveCurrentMockupApplication === "function") await saveCurrentMockupApplication();
  if (typeof pushMockupHistory === "function") pushMockupHistory();
  selectMockupPage(newCol.id);
  refreshLiveIfVisible();
}

// ---------------------------------------------------------------------------
// Live Preview / Panoramic sections: render the CURRENT in-memory application via
// POST /cell-preview-live (render-only, never saves). Editor's grid stays saved-only.
// ---------------------------------------------------------------------------

let liveVersion = 0;
let panoramicSizeKey = null; // null = primary

/** Re-renders whichever live section (Preview or Panoramic) is currently visible. */
export function refreshLiveIfVisible() {
  if (document.getElementById("mockup-section-preview")?.classList.contains("active")) renderLivePreviews();
  if (document.getElementById("mockup-section-panoramic")?.classList.contains("active")) renderLivePanoramic();
}

async function fetchLiveHtml(rowId, colId) {
  const p = mockupApplication;
  const res = await fetch(`/api/mockups/${encodeURIComponent(mockupId)}/cell-preview-live`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      application: { columns: p.columns, devices: p.devices, sources: p.sources, settings: p.settings, globalPanoramic: p.globalPanoramic },
      deviceRowId: rowId,
      columnId: colId,
    }),
  });
  if (!res.ok) throw new Error(`live preview failed (${res.status})`);
  return res.text();
}

/** Fills each `iframe[data-row][data-col]` under `root` with live srcdoc; drops results if a newer render started. */
async function fillLiveFrames(root, version) {
  await Promise.all([...root.querySelectorAll("iframe[data-row]")].map(async (f) => {
    try {
      const html = await fetchLiveHtml(f.dataset.row, f.dataset.col);
      if (version === liveVersion) f.srcdoc = html;
    } catch (e) { console.warn(e); }
  }));
}

function sortedColumns() {
  return [...(mockupApplication?.columns || [])].sort((a, b) => a.order - b.order);
}

function rowsByTarget() {
  return (mockupApplication?.devices || []).filter((d) => findSizeTarget(d.sizeKey));
}

export async function renderLivePreviews() {
  const host = document.getElementById("mockup-preview-table");
  if (!host || !mockupApplication || !mockupId) return;
  const version = ++liveVersion;
  const rows = rowsByTarget();
  const cols = sortedColumns();
  if (!rows.length || !cols.length) { host.innerHTML = `<div class="hint">No pages yet.</div>`; return; }
  // Shared cell height (computeCellDims); each row's width follows its own design aspect.
  const h = computeCellDims(host, rows.length).height;
  let html = "<table class='matrix'><thead><tr><th></th>" + cols.map((_, i) => `<th style="font-size:.75rem;text-align:center;">#${i + 1}</th>`).join("") + "</tr></thead><tbody>";
  for (const r of rows) {
    const dh = designSizeFor(findSizeTarget(r.sizeKey).target).height;
    const scale = h / dh;
    html += `<tr><td style="font-size:.78rem;font-weight:600;white-space:nowrap;padding:.4rem .5rem;">${escapeHtml(r.label)}</td>`;
    for (const c of cols) {
      html += `<td style="padding:.3rem;"><div style="width:${Math.round(1080 * scale)}px;height:${h}px;overflow:hidden;border-radius:6px;background:#0f172a;">` +
        `<iframe data-row="${escapeHtml(r.id)}" data-col="${escapeHtml(c.id)}" style="width:1080px;height:${dh}px;border:0;display:block;transform:scale(${scale});transform-origin:top left;pointer-events:none;"></iframe></div></td>`;
    }
    html += "</tr>";
  }
  host.innerHTML = html + "</tbody></table>";
  await fillLiveFrames(host, version);
}

export async function renderLivePanoramic() {
  const host = document.getElementById("mockup-panoramic-banner");
  const sel = document.getElementById("mockup-panoramic-size");
  if (!host || !sel || !mockupApplication || !mockupId) return;
  const version = ++liveVersion;
  const rows = rowsByTarget();
  const cols = sortedColumns();
  if (!rows.length || !cols.length) { host.innerHTML = ""; return; }
  const targets = sizeTargetsFor(mockupApplication.platform);
  sel.innerHTML = targets.map((t) => `<option value="${t.key}">${escapeHtml(t.label)} (${t.width}&times;${t.height})</option>`).join("");
  if (!targets.some((t) => t.key === panoramicSizeKey)) panoramicSizeKey = targets[0].key;
  sel.value = panoramicSizeKey;
  const row = rows.find((r) => r.sizeKey === panoramicSizeKey) || rows[0];
  const dh = designSizeFor(findSizeTarget(row.sizeKey).target).height;
  // One flush strip of all pages, scaled together to fit the section width.
  const availW = Math.max(300, (document.getElementById("mockup-panoramic-viewport")?.clientWidth || 900) - 48);
  const scale = Math.min(availW / (1080 * cols.length), 640 / dh);
  host.style.cssText = `position:relative;display:flex;gap:0;overflow:hidden;width:${Math.round(1080 * cols.length * scale)}px;height:${Math.round(dh * scale)}px;`;
  host.innerHTML = cols.map((c) =>
    `<div style="flex:0 0 ${1080 * scale}px;height:${dh * scale}px;overflow:hidden;"><iframe data-row="${escapeHtml(row.id)}" data-col="${escapeHtml(c.id)}" style="width:1080px;height:${dh}px;border:0;display:block;transform:scale(${scale});transform-origin:top left;pointer-events:none;"></iframe></div>`
  ).join("");
  await fillLiveFrames(host, version);
}

export function getPanoramicSizeKey() { return panoramicSizeKey; }
export function setPanoramicSizeKey(k) { panoramicSizeKey = k; }
