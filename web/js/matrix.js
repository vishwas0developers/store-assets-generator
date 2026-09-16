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

// Matrix cell preview thumbnail size -- fixed pixel box (not `%`) so the
// scale factor applied to the real 1080x1920 iframe document is exact.
const MATRIX_CELL_HEIGHT = 200;
const MATRIX_CELL_SCALE = MATRIX_CELL_HEIGHT / 1920;
const MATRIX_CELL_WIDTH = Math.round(1080 * MATRIX_CELL_SCALE);

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

  // Header: corner + one th per screen
  let html = "<thead><tr>";
  html += `<th style="font-size:.75rem; color:#94a3b8; font-weight:600; padding:.35rem .5rem; text-align:left;">Row / Page</th>`;
  for (let j = 0; j < columns.length; j++) {
    const cid = columns[j].id;
    const isSelCol = !!selectedColumn && selectedColumn.id === cid;
    const pairIdx = selectedPagePair.indexOf(cid);
    const pairStyle = pairIdx !== -1 ? `background:rgba(168,85,247,.18); border-bottom:2px solid #a855f7;` : "";
    const pairBadge = pairIdx !== -1 ? ` <span title="Paired for two-page editing" style="color:#c084fc;">🔗${pairIdx + 1}</span>` : "";
    html += `<th data-col-id="${escapeHtml(cid)}" title="Ctrl/Shift-click to pair with another page for two-page editing" style="font-size:.75rem; padding:.35rem .5rem; text-align:center; ${isSelCol ? "background:rgba(59,130,246,.10); border-bottom:2px solid #3b82f6;" : pairStyle}">#${j + 1}${pairBadge}</th>`;
  }
  html += "</tr></thead>";

  const deviceIdsFrag = encodeURIComponent((devices.map((d) => d.id).join(",")) );

  // Body: one row per device row, one cell per (deviceRowId, columnId). First row also used when devices empty (single synthetic row).
  html += "<tbody>";
  const rowSources = devices.length ? devices : [{ id: "__base", label: "Base screen" }];
  for (const dev of rowSources) {
    html += `<tr data-device-row="${escapeHtml(dev.id)}">`;
    html += `<td style="font-size:.78rem; font-weight:600; color:#cbd5e1; padding:.4rem .5rem; white-space:nowrap;">${escapeHtml(dev.label || dev.id)}</td>`;
    for (const col of columns) {
      const key = `${dev.id}:${col.id}`;
      const isActive =
        !!selectedCell && selectedCell.deviceRowId === dev.id && selectedCell.columnId === col.id;
      const style = resolvedStyleFor(mockupProject, dev.id === "__base" ? null : dev.id, col.id);
      const title = style?.title?.text || col.style?.title?.text || `Page ${columns.indexOf(col) + 1}`;
      // Prefer real server iframe preview; fall back to mini card if unavailable.
      const useIframe = !!mockupId && !!mockupProject?.columns?.length;
      // The iframe's document is a real fixed 1080x1920px page (src/mockup/render.ts's
      // cellHtml()) -- pointing a small iframe box straight at it with no scaling
      // just shows an unscaled window onto its top-left corner (usually a solid
      // background sliver). Fix: keep the iframe at its real full size and shrink
      // it visually with a CSS transform, exactly like the working template-thumbnail
      // technique in src/mockup/render.ts's templateThumbHtmlSized().
      const cellPreview = useIframe
        ? `<div style="width:${MATRIX_CELL_WIDTH}px; height:${MATRIX_CELL_HEIGHT}px; margin:0 auto; overflow:hidden; border-radius:6px; background:#0f172a;">
             <iframe title="${escapeHtml(title)}" loading="lazy" src="/api/mockups/${encodeURIComponent(mockupId)}/cell-preview/${encodeURIComponent(dev.id === "__base" ? (devices[0]?.id || dev.id) : dev.id)}/${encodeURIComponent(col.id)}" style="width:1080px; height:1920px; border:0; display:block; transform:scale(${MATRIX_CELL_SCALE}); transform-origin:top left; pointer-events:none;"></iframe>
           </div>`
        : `<div style="height:96px; border-radius:6px; background: #0f172a; border:1px solid #334155; display:flex; flex-direction:column; justify-content:space-between; padding:.6rem;">
             <div style="font-size:.7rem; font-weight:700; color:#fff; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(title)}</div>
             <div style="width:70%; height:60%; margin:0 auto; background:#1e293b; border-radius:6px; border:1px solid #475569;"></div>
           </div>`;

      html += `<td data-device-row="${escapeHtml(dev.id)}" data-col-id="${escapeHtml(col.id)}" data-cell-key="${escapeHtml(key)}" style="padding:.3rem; cursor:pointer; ${isActive ? "outline:2px solid #3b82f6; outline-offset:-2px; background:rgba(59,130,246,.08);" : ""}">
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
      const cid = th.getAttribute("data-col-id");
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        togglePagePair(cid);
        if (selectedPagePair.length === 2) showToast("Pages linked for two-page editing -- select a device and use \"Link to Paired Page\" to sync it.", "info");
        renderMockupMatrix();
        return;
      }
      selectMockupPage(cid);
    };
    th.style.cursor = "pointer";
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
