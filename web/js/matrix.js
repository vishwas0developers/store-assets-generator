// Matrix module — devices × screens iframe grid, selection + per-cell overrides.
import {
  mockupProject,
  selectedColumn,
  mockupId,
  setSelectedColumn,
  setMockupDirty,
  saveCurrentMockupProject,
  pushMockupHistory,
} from "./state.js";
import { escapeHtml } from "./utils.js";
import { centerArtboardInViewport, loadColumnIntoFabric } from "./canvas.js";
import { renderMockupLayersPanel, syncSection2Inputs } from "./editor.js";

// Per spec: selectedCell = { deviceRowId, columnId }. Null until matrix interaction.
export let selectedCell = null;
export function setSelectedCell(v) { selectedCell = v; }

// Resolved style for current cell (overrides spread, falls back to base).
function resolvedStyleFor(project, deviceRowId, columnId) {
  const col = project?.columns?.find((c) => c.id === columnId);
  if (!col) return null;
  const override = deviceRowId ? project.cells?.[`${deviceRowId}:${columnId}`] : null;
  return override ? { ...col.style, ...override } : col.style;
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
    table.innerHTML = `<tr><td class="hint" style="padding:1.5rem; text-align:center;">No screens yet.</td></tr>`;
    return;
  }

  // Header: corner + one th per screen
  let html = "<thead><tr>";
  html += `<th style="font-size:.75rem; color:#94a3b8; font-weight:600; padding:.35rem .5rem; text-align:left;">Row / Screen</th>`;
  for (let j = 0; j < columns.length; j++) {
    const cid = columns[j].id;
    const isSelCol = !!selectedColumn && selectedColumn.id === cid;
    html += `<th data-col-id="${escapeHtml(cid)}" style="font-size:.75rem; padding:.35rem .5rem; text-align:center; ${isSelCol ? "background:rgba(59,130,246,.10); border-bottom:2px solid #3b82f6;" : ""}">#${j + 1}</th>`;
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
      const title = style?.title?.text || col.style?.title?.text || `Screen ${columns.indexOf(col) + 1}`;
      // Prefer real server iframe preview; fall back to mini card if unavailable.
      const useIframe = !!mockupId && !!mockupProject?.columns?.length;
      const cellPreview = useIframe
        ? `<iframe title="${escapeHtml(title)}" loading="lazy" src="/api/mockups/${encodeURIComponent(mockupId)}/cell-preview/${encodeURIComponent(dev.id === "__base" ? (devices[0]?.id || dev.id) : dev.id)}/${encodeURIComponent(col.id)}" style="width: 100%; height: 120px; border: 0; display: block; border-radius: 6px; background:#0f172a;"></iframe>`
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
        `<td style="text-align:center; padding:.3rem;"><button class="small danger matrix-del-btn" data-column-id="${escapeHtml(c.id)}" title="Delete Screen" style="padding:2px 6px;">🗑️</button></td>`
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
      deleteMockupScreen(b.getAttribute("data-column-id"));
    };
  }
  for (const th of table.querySelectorAll("th[data-col-id]")) {
    th.onclick = () => selectMockupScreen(th.getAttribute("data-col-id"));
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
  if (targetEl) targetEl.textContent = `${row ? row.label : "Device"} — Screen ${colIndex}`;
  const hasOverride = !!(deviceRowId && mockupProject.cells?.[`${deviceRowId}:${columnId}`]);
  const overrideEl = document.getElementById("mk-cell-override");
  if (overrideEl) overrideEl.checked = hasOverride;
  renderMockupLayersPanel(col);
  syncSection2Inputs(col, null);
}

export function selectMockupScreen(columnId) {
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
  const isEditorActive2 = document.getElementById("mockup-section-editor")?.classList.contains("active");
  const insp = document.getElementById("mockup-inspector");
  if (insp) insp.style.display = isEditorActive2 ? "block" : "none";
}

export async function deleteMockupScreen(columnId) {
  if (!mockupProject || mockupProject.columns.length <= 1) {
    if (window.alert) window.alert("Cannot delete the only screen.");
    return;
  }
  const idx = mockupProject.columns.findIndex((c) => c.id === columnId);
  if (idx === -1) return;

  mockupProject.columns.splice(idx, 1);
  mockupProject.columns.forEach((c, i) => (c.order = i));

  if (typeof saveCurrentMockupProject === "function") await saveCurrentMockupProject();
  if (typeof pushMockupHistory === "function") pushMockupHistory();

  const next = mockupProject.columns[Math.min(idx, mockupProject.columns.length - 1)];
  if (next) selectMockupScreen(next.id);
  else renderMockupMatrix();
}

export async function addMockupScreen() {
  if (!mockupProject) return;
  const newCol = {
    id: `col_${Date.now()}`,
    order: mockupProject.columns.length,
    style: {
      layout: "single-title-above",
      background: { type: "gradient", value: "ocean" },
      title: { text: `New Screen ${mockupProject.columns.length + 1}`, color: "#ffffff", size: 58, align: "center" },
      subtitle: { text: "Add your description here", color: "#94a3b8", size: 36, align: "center" },
      deviceOne: { size: 90, x: 0, y: 0, rotation: 0, brightness: 100, visible: true },
      assetLayers: [],
    },
  };

  mockupProject.columns.push(newCol);
  if (typeof saveCurrentMockupProject === "function") await saveCurrentMockupProject();
  if (typeof pushMockupHistory === "function") pushMockupHistory();
  selectMockupScreen(newCol.id);
}
