// State module — single source of truth for the Studio Mockup editor & Studio ecosystem.
// All other modules import from here; never write to these variables directly from outside.

export let activeProjectId = localStorage.getItem("activeProjectId") || null;
export let activeProject = null;

export let mockupId = null;
export let mockupProject = null;
export let mockupFabricCanvas = null;
export let selectedColumn = null;
export let selectedLayerId = "deviceOne";
export let mockupIsDirty = false;

export let mockupTemplates = [];
export let mockupTemplateCategory = "all";
export let mockupTemplateDetailId = null;

export let mockupHistory = [];
export let mockupHistoryIdx = -1;

export let videoId = null;
export let videoProject = null;
export let selectedSceneId = null;
export let videoTemplates = [];
export let videoDevices = [];

export function setVideoDevices(devs) {
  videoDevices = devs;
}

export function setActiveProjectId(id) {
  activeProjectId = id;
  if (id) localStorage.setItem("activeProjectId", id);
  else localStorage.removeItem("activeProjectId");
}

export function setActiveProject(proj) {
  activeProject = proj;
}

export function setMockupId(id) {
  mockupId = id;
}

export function setMockupProject(proj) {
  mockupProject = proj;
}

export function setMockupFabricCanvas(canvas) {
  mockupFabricCanvas = canvas;
}

export function setSelectedColumn(col) {
  selectedColumn = col;
}

export function setSelectedLayerId(layerId) {
  selectedLayerId = layerId;
}

export function setMockupDirty(dirty = true) {
  mockupIsDirty = dirty;
  const badge = document.getElementById("mockup-dirty-badge") || document.getElementById("mockup-save-indicator");
  if (badge) {
    if (badge.id === "mockup-dirty-badge") {
      badge.style.display = dirty ? "inline-block" : "none";
    } else {
      badge.textContent = dirty ? "● Unsaved Changes" : "✓ Saved";
      badge.style.color = dirty ? "#f59e0b" : "#10b981";
    }
  }
}

export async function undoMockupState() {
  if (mockupHistoryIdx <= 0) return;
  mockupHistoryIdx--;
  mockupProject = JSON.parse(mockupHistory[mockupHistoryIdx]);
  await saveCurrentMockupProject();
  updateUndoRedoButtons();
  if (typeof window.selectMockupScreen === "function" && mockupProject.columns?.[0]) {
    window.selectMockupScreen(mockupProject.columns[0].id);
  }
}

export async function redoMockupState() {
  if (mockupHistoryIdx >= mockupHistory.length - 1) return;
  mockupHistoryIdx++;
  mockupProject = JSON.parse(mockupHistory[mockupHistoryIdx]);
  await saveCurrentMockupProject();
  updateUndoRedoButtons();
  if (typeof window.selectMockupScreen === "function" && mockupProject.columns?.[0]) {
    window.selectMockupScreen(mockupProject.columns[0].id);
  }
}

export function pushMockupHistory() {
  if (!mockupProject) return;
  const snapshot = JSON.stringify(mockupProject);
  if (mockupHistoryIdx >= 0 && mockupHistory[mockupHistoryIdx] === snapshot) return;
  mockupHistory = mockupHistory.slice(0, mockupHistoryIdx + 1);
  mockupHistory.push(snapshot);
  if (mockupHistory.length > 50) mockupHistory.shift();
  else mockupHistoryIdx++;
  updateUndoRedoButtons();
}

export function setMockupTemplates(templates) {
  mockupTemplates = templates;
}

export function setMockupTemplateCategory(cat) {
  mockupTemplateCategory = cat;
}

export function setMockupTemplateDetailId(id) {
  mockupTemplateDetailId = id;
}

export function setMockupHistory(hist, idx) {
  mockupHistory = hist;
  mockupHistoryIdx = idx;
}

export function setVideoId(id) {
  videoId = id;
}

export function setVideoProject(proj) {
  videoProject = proj;
}

export function setSelectedSceneId(id) {
  selectedSceneId = id;
}

export function setVideoTemplates(templates) {
  videoTemplates = templates;
}

export function updateUndoRedoButtons() {
  const undoBtn = document.getElementById("mockup-undo-btn");
  const redoBtn = document.getElementById("mockup-redo-btn");
  if (undoBtn) undoBtn.disabled = mockupHistoryIdx <= 0;
  if (redoBtn) redoBtn.disabled = mockupHistoryIdx >= mockupHistory.length - 1;
}

export async function saveCurrentMockupProject() {
  if (!mockupId || !mockupProject) return;
  const { api } = await import('./utils.js');
  await api(`/api/mockups/${mockupId}`, {
    method: "PUT",
    body: {
      devices: mockupProject.devices,
      columns: mockupProject.columns,
      cells: mockupProject.cells,
      sources: mockupProject.sources,
      globalPanoramic: mockupProject.globalPanoramic,
      settings: mockupProject.settings
    }
  });
}
