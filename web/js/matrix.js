// Matrix module — devices × pages iframe grid, selection + per-cell overrides.
import {
  mockupProject,
  selectedColumn,
  mockupId,
  selectedPagePair,
  setSelectedColumn,
  setMockupDirty,
  saveCurrentMockupProject,
  pushMockupHistory,
  togglePagePair,
} from "./state.js";
import { escapeHtml, showToast } from "./utils.js";
import { centerArtboardInViewport, loadColumnIntoFabric } from "./canvas.js";
import { renderMockupLayersPanel, syncSection2Inputs } from "./editor.js";

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
function computeCellDims(scrollEl, rowCount) {
  const container = scrollEl?.parentElement || (typeof document !== "undefined" ? document.querySelector(".mockup-matrix-container") : null);
  const containerH = container?.clientHeight || 440;
  // If scrollEl.clientHeight is not yet measured (0 or collapsed), fallback to container height budget
  const availH = Math.max(scrollEl?.clientHeight || 0, containerH - 56, 370);
  const usable = availH - MATRIX_HEADER_ROW_H - MATRIX_FOOTER_ROW_H - rowCount * MATRIX_ROW_OVERHEAD_H;
  const perRow = rowCount > 0 ? usable / rowCount : usable;
  const height = Math.floor(Math.max(MATRIX_CELL_MIN_HEIGHT, Math.min(MATRIX_CELL_MAX_HEIGHT, perRow || MATRIX_CELL_MIN_HEIGHT)));
  const scale = height / 1920;
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

// Mirrors src/mockup/project.ts's effectiveCellStyle(): legacy whole-sub-object
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
function resolvedStyleFor(project, deviceRowId, columnId) {
  const col = project?.columns?.find((c) => c.id === columnId);
  if (!col) return null;
  const override = deviceRowId ? project.cells?.[`${deviceRowId}:${columnId}`] : null;
  if (!override) return col.style;
  const { [PATCH_KEY]: paths, ...legacy } = override;
  const merged = { ...col.style, ...legacy };
  if (paths) {
    const cloned = JSON.parse(JSON.stringify(merged));
    for (const [path, value] of Object.entries(paths)) setPath(cloned, path, value);
    return cloned;
  }
  return merged;
}

export function getSelectedCellStyle() {
  if (!selectedCell || !mockupProject) return selectedColumn?.style ?? null;
  return resolvedStyleFor(mockupProject, selectedCell.deviceRowId, selectedCell.columnId);
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
  if (!table || !mockupProject) return;

  const columns = mockupProject.columns || [];
  const devices = mockupProject.devices || [];

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

  const cellDims = computeCellDims(scrollEl, rowSources.length);

  // Header: corner + one th per screen
  let html = "<thead><tr>";
  html += `<th style="font-size:.75rem; color:var(--text-secondary); font-weight:600; padding:.35rem .5rem; text-align:left;">Row / Page</th>`;
  for (let j = 0; j < columns.length; j++) {
    const cid = columns[j].id;
    const isSelCol = !!selectedColumn && selectedColumn.id === cid;
    const pairIdx = selectedPagePair.indexOf(cid);
    const pairStyle = pairIdx !== -1 ? `background:rgba(168,85,247,.18); border-bottom:2px solid #a855f7;` : "";
    const pairBadge = pairIdx !== -1 ? ` <span title="Paired for two-page editing" style="color:#c084fc;">🔗${pairIdx + 1}</span>` : "";
    html += `<th data-col-id="${escapeHtml(cid)}" style="font-size:.75rem; padding:.35rem .5rem; text-align:center; ${isSelCol ? "background:rgba(59,130,246,.10); border-bottom:2px solid #3b82f6;" : pairStyle}">
      <input type="checkbox" class="matrix-pair-checkbox" data-col-id="${escapeHtml(cid)}" title="Pair with another page for two-page editing" ${pairIdx !== -1 ? "checked" : ""} style="vertical-align:middle; margin-right:2px; cursor:pointer;" />
      #${j + 1}${pairBadge}
    </th>`;
  }
  html += "</tr></thead>";

  const deviceIdsFrag = encodeURIComponent((devices.map((d) => d.id).join(",")) );

  // Body: one row per device row, one cell per (deviceRowId, columnId). First row also used when devices empty (single synthetic row).
  html += "<tbody>";
  for (const dev of rowSources) {
    html += `<tr data-device-row="${escapeHtml(dev.id)}">`;
    html += `<td style="font-size:.78rem; font-weight:600; color:var(--text-primary); padding:.4rem .5rem; white-space:nowrap;">${escapeHtml(dev.label || dev.id)}</td>`;
    for (const col of columns) {
      const key = `${dev.id}:${col.id}`;
      const isActive =
        !!selectedCell && selectedCell.deviceRowId === dev.id && selectedCell.columnId === col.id;
      // A page paired for two-page editing (selectedPagePair) must show as
      // selected across every device row for that column, not just the one
      // exact (deviceRow, column) cell selectedCell points at -- previously
      // only the single active cell got any highlight, so with two pages
      // paired only one ever visibly looked selected in the preview grid.
      const isPairedCol = !isActive && selectedPagePair.includes(col.id);
      const style = resolvedStyleFor(mockupProject, dev.id === "__base" ? null : dev.id, col.id);
      const title = style?.title?.text || col.style?.title?.text || `Page ${columns.indexOf(col) + 1}`;
      // Prefer real server iframe preview; fall back to mini card if unavailable.
      const useIframe = !!mockupId && !!mockupProject?.columns?.length;
      const cellPreview = useIframe
        ? `<div class="matrix-preview-box" style="width:${cellDims.width}px; height:${cellDims.height}px; overflow:hidden; border-radius:6px; background:#0f172a;">
             <iframe class="matrix-preview-frame" title="${escapeHtml(title)}" loading="lazy" src="/api/mockups/${encodeURIComponent(mockupId)}/cell-preview/${encodeURIComponent(dev.id === "__base" ? (devices[0]?.id || dev.id) : dev.id)}/${encodeURIComponent(col.id)}?v=${matrixRenderVersion}" style="width:1080px; height:1920px; border:0; display:block; transform:scale(${cellDims.scale}); transform-origin:top left; pointer-events:none;"></iframe>
           </div>`
        : `<div style="height:96px; border-radius:6px; background: #0f172a; border:1px solid #334155; display:flex; flex-direction:column; justify-content:space-between; padding:.6rem;">
             <div style="font-size:.7rem; font-weight:700; color:#fff; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(title)}</div>
             <div style="width:70%; height:60%; margin:0 auto; background:#1e293b; border-radius:6px; border:1px solid #475569;"></div>
           </div>`;

      const cellSelectStyle = isActive
        ? "outline:2px solid #3b82f6; outline-offset:-2px; background:rgba(59,130,246,.08);"
        : isPairedCol
        ? "outline:2px solid #a855f7; outline-offset:-2px; background:rgba(168,85,247,.08);"
        : "";
      html += `<td data-device-row="${escapeHtml(dev.id)}" data-col-id="${escapeHtml(col.id)}" data-cell-key="${escapeHtml(key)}" style="padding:.3rem; cursor:pointer; ${cellSelectStyle}">
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
      const fixedHeight = Math.max(MATRIX_CELL_MIN_HEIGHT, cellDims.height - shrinkPerRow);
      const fixedScale = fixedHeight / 1920;
      const fixedWidth = Math.round(1080 * fixedScale);
      for (const box of table.querySelectorAll(".matrix-preview-box")) {
        box.style.width = `${fixedWidth}px`;
        box.style.height = `${fixedHeight}px`;
      }
      for (const frame of table.querySelectorAll(".matrix-preview-frame")) {
        frame.style.transform = `scale(${fixedScale})`;
      }
    }
  }

  // Cell clicks: select cell + update inspector + canvas
  for (const td of table.querySelectorAll("td[data-cell-key]")) {
    td.onclick = (e) => {
      // Avoid hijacking iframe nav inside cell.
      if (e.target.closest("iframe")) return;
      const d = td.getAttribute("data-device-row");
      const c = td.getAttribute("data-col-id");
      selectCell(d, c);
    };
  }
  for (const b of table.querySelectorAll(".matrix-del-btn")) {
    b.onclick = (e) => {
      e.stopPropagation();
      deleteMockupPage(b.getAttribute("data-column-id"));
    };
  }
  for (const th of table.querySelectorAll("th[data-col-id]")) {
    th.onclick = (e) => {
      if (e.target.closest(".matrix-pair-checkbox")) return;
      const cid = th.getAttribute("data-col-id");
      selectMockupPage(cid);
    };
    th.style.cursor = "pointer";
  }
  for (const cb of table.querySelectorAll(".matrix-pair-checkbox")) {
    cb.onclick = (e) => e.stopPropagation();
    cb.onchange = (e) => {
      const cid = cb.getAttribute("data-col-id");
      const ok = togglePagePair(cid);
      if (!ok) {
        e.target.checked = false;
        showToast("Deselect a page first -- only two pages can be paired at once.", "info");
        return;
      }
      if (selectedPagePair.length === 2) showToast("Pages linked for two-page editing -- select a device and use \"Link to Paired Page\" to sync it.", "info");
      renderMockupMatrix();
    };
  }
}

/** Mirrors app.js:4812 selectCell (devices × screens). */
export function selectCell(deviceRowId, columnId) {
  if (!mockupProject) return;
  const col = mockupProject.columns.find((c) => c.id === columnId);
  if (!col) return;
  selectedCell = { deviceRowId, columnId };
  setSelectedColumn(col);
  renderMockupMatrix();
  try { centerArtboardInViewport(); } catch (_) {}
  // Inspector: only visible if in editor section
  const isEditorActive = document.getElementById("mockup-section-editor")?.classList.contains("active");
  const inspector = document.getElementById("mockup-inspector");
  if (inspector) inspector.style.display = isEditorActive ? "block" : "none";
  const row = mockupProject.devices?.find((d) => d.id === deviceRowId);
  const colIndex = mockupProject.columns.findIndex((c) => c.id === columnId) + 1;
  const targetEl = document.getElementById("mockup-inspector-target");
  if (targetEl) targetEl.textContent = `${row ? row.label : "Device"} — Page ${colIndex}`;
  const hasOverride = !!(deviceRowId && mockupProject.cells?.[`${deviceRowId}:${columnId}`]);
  const overrideEl = document.getElementById("mk-cell-override");
  if (overrideEl) overrideEl.checked = hasOverride;
  renderMockupLayersPanel(col);
  syncSection2Inputs(col, null);
}

export function selectMockupPage(columnId) {
  if (!mockupProject) return;
  const col = mockupProject.columns.find((c) => c.id === columnId);
  if (!col) return;
  // Backward compat: columnId alone → first device row
  const deviceRowId = (mockupProject.devices && mockupProject.devices[0]?.id) || (mockupProject.cells ? Object.keys(mockupProject.cells)[0]?.split(":")[0] : null) || "__base";
  selectedCell = { deviceRowId, columnId };
  setSelectedColumn(col);
  renderMockupMatrix();
  renderMockupLayersPanel(col);
  syncSection2Inputs(col, null);
  loadColumnIntoFabric(col);
  try { centerArtboardInViewport(); } catch (_) {}
  const isEditorActive2 = document.getElementById("mockup-section-editor")?.classList.contains("active");
  const insp = document.getElementById("mockup-inspector");
  if (insp) insp.style.display = isEditorActive2 ? "block" : "none";
}

export async function deleteMockupPage(columnId) {
  if (!mockupProject || mockupProject.columns.length <= 1) {
    if (window.alert) window.alert("Cannot delete the only page.");
    return;
  }
  const idx = mockupProject.columns.findIndex((c) => c.id === columnId);
  if (idx === -1) return;

  mockupProject.columns.splice(idx, 1);
  mockupProject.columns.forEach((c, i) => (c.order = i));

  if (typeof saveCurrentMockupProject === "function") await saveCurrentMockupProject();
  if (typeof pushMockupHistory === "function") pushMockupHistory();

  const next = mockupProject.columns[Math.min(idx, mockupProject.columns.length - 1)];
  if (next) selectMockupPage(next.id);
  else renderMockupMatrix();
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
  if (!mockupProject) return;
  const newCol = {
    id: `col_${Date.now()}`,
    order: mockupProject.columns.length,
    style: defaultColumnStyle(`New Page ${mockupProject.columns.length + 1}`),
  };

  mockupProject.columns.push(newCol);
  if (typeof saveCurrentMockupProject === "function") await saveCurrentMockupProject();
  if (typeof pushMockupHistory === "function") pushMockupHistory();
  selectMockupPage(newCol.id);
}
