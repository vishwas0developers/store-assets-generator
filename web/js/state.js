// State module — single source of truth for the Studio Mockup editor & Studio ecosystem.
// All other modules import from here; never write to these variables directly from outside.

export let activeProjectId = localStorage.getItem("activeProjectId") || null;
export let activeProject = null;

export let mockupId = null;
export let mockupProject = null;
export let mockupFabricCanvas = null;
export let selectedColumn = null;
export let selectedLayerId = "deviceOne";
/** Full multi-select set (Fabric shift-click/marquee); selectedLayerId is
 *  always selectedLayerIds[0] -- the "primary" selection the single-object
 *  inspector panel edits. Group operations (align/delete/etc.) should use
 *  this instead of assuming a single selection. */
export let selectedLayerIds = ["deviceOne"];
export let mockupIsDirty = false;

/** Multi-page selection (unbounded -- checkbox per page in the Page Previews
 *  grid). All selected pages are shown together as one continuous panorama
 *  in the editing canvas (see canvas.js's pageCanvases/setActivePage); one
 *  of them is "active"/fully editable at a time, the rest show real synced
 *  content but are locked, except cross-page panorama assets which stay
 *  draggable across all of them.
 *  Also still used by editor.js's linkDeviceLayers/syncLinkedDeviceLayer,
 *  which stays scoped to exactly-2-selected (a genuinely pairwise feature,
 *  unrelated to and unchanged by the panorama work). */
export let selectedPages = [];

export let mockupTemplates = [];
export let mockupTemplateCategory = "all";
export let mockupTemplateDetailId = null;

export let mockupHistory = [];
export let mockupHistoryIdx = -1;
/** Snapshot (same {columns,cells,settings,globalPanoramic} shape as a
 *  history entry) of what's currently saved to disk -- compared against the
 *  live history entry after Undo/Redo to decide whether the dirty badge
 *  should show (an Undo that lands back exactly on the saved state is not
 *  "unsaved"). Set on load and on Save; never touched by Undo/Redo itself. */
export let savedSnapshot = null;
/** True while an Undo/Redo restore is in flight -- blocks a new Undo/Redo
 *  press from overlapping an in-progress one, and stops setMockupDirty's
 *  own debounced history hook from recording the restore itself as a new
 *  edit. */
let restoringHistory = false;
/** Debounce handle for the setMockupDirty(true) -> pushMockupHistory hook
 *  below -- see its own doc comment. */
let historyDebounceTimer = null;
const HISTORY_DEBOUNCE_MS = 400; // ponytail: edits <400ms apart merge into one undo step; shorten if that's ever reported as a problem.

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

/** Re-points selectedColumn at the same-id column of the CURRENT mockupProject
 *  (first column, else null, if it no longer exists). Call after any
 *  setMockupProject() that isn't followed by selectMockupPage(), so edits and
 *  deletes never land on a stale column object from the replaced project. */
export function rebindSelectedColumn() {
  const cols = mockupProject?.columns ?? [];
  selectedColumn = cols.find((c) => c.id === selectedColumn?.id) ?? cols[0] ?? null;
}

/** Toggles a page into/out of the selection set. No cap -- any number of
 *  pages can be selected simultaneously. */
export function togglePageSelection(pageId) {
  if (selectedPages.includes(pageId)) {
    selectedPages = selectedPages.filter((id) => id !== pageId);
    return true;
  }
  selectedPages = [...selectedPages, pageId];
  return true;
}

export function clearPageSelection() {
  selectedPages = [];
}

/** Page whose canvas owns the active selection (null = nothing selected).
 *  Layer ids repeat on every page, so the id alone is ambiguous. */
export let selectionPageId = selectedColumn?.id ?? null;

export function setSelectedLayerId(layerId, pageId = selectedColumn?.id ?? null) {
  selectedLayerId = layerId;
  selectionPageId = layerId ? pageId : null;
  if (!layerId) selectedLayerIds = [];
  else if (!selectedLayerIds.includes(layerId)) selectedLayerIds = [layerId];
}

export function setSelectedLayerIds(layerIds) {
  selectedLayerIds = layerIds && layerIds.length ? layerIds : (selectedLayerId ? [selectedLayerId] : []);
}

export function clearSelection() {
  selectedLayerId = null;
  selectedLayerIds = [];
  selectionPageId = null;
}

/** The only fields a history step stores -- editable content, never the
 *  server-owned `devices`/`sources` rows (dropping a device/screenshot on
 *  Undo was a real bug this excludes by construction). */
export function snapshotOfMockupProject(project) {
  if (!project) return null;
  return JSON.stringify({
    columns: project.columns,
    cells: project.cells,
    settings: project.settings,
    globalPanoramic: project.globalPanoramic,
  });
}

export function setSavedSnapshot(snap) {
  savedSnapshot = snap;
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
  // The one place history gets recorded: every edit path in this app already
  // calls setMockupDirty(true) (55+ call sites -- inspector controls,
  // canvas drags, delete, opacity, the layers panel, ...), so hooking history
  // here means every one of those becomes a real undo step, debounced so a
  // slider drag or a burst of keystrokes collapses into one. Never schedules
  // while a restore (Undo/Redo) is actually applying the dirty(true) it
  // itself may trigger indirectly.
  if (dirty && !restoringHistory) {
    clearTimeout(historyDebounceTimer);
    historyDebounceTimer = setTimeout(() => pushMockupHistory(), HISTORY_DEBOUNCE_MS);
    // Live Preview/Panoramic refresh -- registered by main.js (state.js must not import matrix.js).
    clearTimeout(liveRefreshTimer);
    liveRefreshTimer = setTimeout(() => liveRefreshHook?.(), HISTORY_DEBOUNCE_MS);
  }
}

let liveRefreshTimer = null;
let liveRefreshHook = null;
/** Registers the callback fired 400 ms after the last setMockupDirty(true). */
export function setLiveRefreshHook(fn) {
  liveRefreshHook = fn;
}

/** Forces any edit still waiting on the debounce timer to be recorded right
 *  now -- called before Undo/Redo step, so an edit made just before pressing
 *  Undo is never silently skipped/lost. */
function flushHistory() {
  if (historyDebounceTimer) {
    clearTimeout(historyDebounceTimer);
    historyDebounceTimer = null;
    pushMockupHistory();
  }
}

export async function undoMockupState() {
  if (restoringHistory) return;
  flushHistory();
  if (mockupHistoryIdx <= 0) return;
  restoringHistory = true;
  try {
    mockupHistoryIdx--;
    await restoreHistorySnapshot(mockupHistory[mockupHistoryIdx]);
  } finally {
    restoringHistory = false;
  }
}

export async function redoMockupState() {
  if (restoringHistory) return;
  flushHistory();
  if (mockupHistoryIdx >= mockupHistory.length - 1) return;
  restoringHistory = true;
  try {
    mockupHistoryIdx++;
    await restoreHistorySnapshot(mockupHistory[mockupHistoryIdx]);
  } finally {
    restoringHistory = false;
  }
}

/** Restores a history snapshot IN PLACE (Object.assign onto the existing
 *  mockupProject object, never reassigning the binding) -- reassigning it
 *  left every other live reference (selectedColumn, etc.) pointing at the
 *  stale old object, so edits made right after an Undo were silently lost.
 *  Never writes to disk -- Undo/Redo are purely in-memory/history
 *  operations; only Save persists. */
async function restoreHistorySnapshot(snapshot) {
  if (!mockupProject || snapshot == null) return;
  Object.assign(mockupProject, JSON.parse(snapshot));
  const currentId = selectedColumn?.id;
  selectedColumn = mockupProject.columns?.find((c) => c.id === currentId) || mockupProject.columns?.[0] || null;
  mockupIsDirty = snapshot !== savedSnapshot;
  const badge = document.getElementById("mockup-dirty-badge") || document.getElementById("mockup-save-indicator");
  if (badge) {
    if (badge.id === "mockup-dirty-badge") {
      badge.style.display = mockupIsDirty ? "inline-block" : "none";
    } else {
      badge.textContent = mockupIsDirty ? "● Unsaved Changes" : "✓ Saved";
      badge.style.color = mockupIsDirty ? "#f59e0b" : "#10b981";
    }
  }
  updateUndoRedoButtons();
  if (typeof window.selectMockupPage === "function" && selectedColumn) {
    await window.selectMockupPage(selectedColumn.id);
  }
}

export function pushMockupHistory() {
  clearTimeout(historyDebounceTimer);
  historyDebounceTimer = null;
  if (restoringHistory) return;
  if (!mockupProject) return;
  const snapshot = snapshotOfMockupProject(mockupProject);
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
