// Matrix module — multi-screen matrix grid view, screen selection,
// column CRUD, and synchronization between matrix thumbnails and main canvas.

import {
  mockupProject,
  selectedColumn,
  setSelectedColumn,
  setMockupDirty,
  saveCurrentMockupProject,
  pushMockupHistory
} from './state.js';
import { escapeHtml } from './utils.js';
import { loadColumnIntoFabric } from './canvas.js';
import { renderMockupLayersPanel, syncSection2Inputs } from './editor.js';

export function renderMockupMatrix() {
  const container = document.getElementById("mockup-matrix-container") || document.getElementById("mockup-matrix-grid");
  if (!container || !mockupProject) return;

  const columns = mockupProject.columns || [];
  if (columns.length === 0) {
    container.innerHTML = `<div class="hint" style="grid-column: 1 / -1; text-align: center; padding: 2rem 0;">No screens in this project yet.</div>`;
    return;
  }

  container.innerHTML = columns.map((col, idx) => {
    const isSelected = selectedColumn && selectedColumn.id === col.id;
    const style = col.style || {};
    const title = style.title?.text || `Screen ${idx + 1}`;
    const bg = style.background || { type: 'gradient', value: 'ocean' };

    let bgCss = 'background: #0f172a;';
    if (bg.type === 'gradient') {
      bgCss = `background: linear-gradient(135deg, #0f2027, #2c5364);`;
    } else if (bg.type === 'solid') {
      bgCss = `background: ${bg.value || '#0f1115'};`;
    }

    return `
      <div class="mockup-matrix-card ${isSelected ? 'selected' : ''}" data-column-id="${col.id}" style="cursor: pointer; position: relative;">
        <div class="matrix-card-preview" style="${bgCss}; aspect-ratio: 9/16; border-radius: 8px; border: ${isSelected ? '2px solid #3b82f6' : '1px solid #334155'}; overflow: hidden; padding: 0.75rem; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between;">
          <div style="font-size: 0.75rem; font-weight: 700; color: #fff; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(title)}
          </div>
          <div style="width: 70%; height: 60%; margin: 0 auto; background: #1e293b; border-radius: 6px; border: 1px solid #475569;"></div>
        </div>
        <div class="matrix-card-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.4rem;">
          <span style="font-size: 0.75rem; font-weight: 600; color: #94a3b8;">#${idx + 1}</span>
          <div style="display: flex; gap: 0.25rem;">
            <button class="small danger matrix-del-btn" data-column-id="${col.id}" title="Delete Screen" style="padding: 2px 6px;">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll(".mockup-matrix-card").forEach(card => {
    const colId = card.dataset.columnId;
    card.onclick = (e) => {
      if (e.target.closest(".matrix-del-btn")) {
        e.stopPropagation();
        deleteMockupScreen(colId);
      } else {
        selectMockupScreen(colId);
      }
    };
  });
}

export function selectMockupScreen(columnId) {
  if (!mockupProject) return;
  const col = mockupProject.columns.find(c => c.id === columnId);
  if (!col) return;

  setSelectedColumn(col);
  renderMockupMatrix();
  renderMockupLayersPanel(col);
  syncSection2Inputs(col);
  loadColumnIntoFabric(col);
}

export async function deleteMockupScreen(columnId) {
  if (!mockupProject || mockupProject.columns.length <= 1) {
    if (window.alert) window.alert("Cannot delete the only screen.");
    return;
  }
  const idx = mockupProject.columns.findIndex(c => c.id === columnId);
  if (idx === -1) return;

  mockupProject.columns.splice(idx, 1);
  mockupProject.columns.forEach((c, i) => c.order = i);

  if (typeof saveCurrentMockupProject === 'function') await saveCurrentMockupProject();
  if (typeof pushMockupHistory === 'function') pushMockupHistory();

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
      layout: 'single-title-above',
      background: { type: 'gradient', value: 'ocean' },
      title: { text: `New Screen ${mockupProject.columns.length + 1}`, color: '#ffffff', size: 58, align: 'center' },
      subtitle: { text: 'Add your description here', color: '#94a3b8', size: 36, align: 'center' },
      deviceOne: { size: 90, x: 0, y: 0, rotation: 0, brightness: 100, visible: true },
      assetLayers: []
    }
  };

  mockupProject.columns.push(newCol);
  if (typeof saveCurrentMockupProject === 'function') await saveCurrentMockupProject();
  if (typeof pushMockupHistory === 'function') pushMockupHistory();
  selectMockupScreen(newCol.id);
}
