// Main module — app bootstrapping, event wiring, and module initialization.
// Binds all core workflows and attaches window helpers for compatibility.

import {
  initMockupFabricCanvas,
  loadColumnIntoFabric,
  initMoveableForCanvas,
  commitMoveableTransformToModel,
  renderMockupCanvas,
  renderTransformGizmoOverlay,
  attachGizmoEvents,
  centerArtboardInViewport,
  setStageZoomAndCenter,
  stageZoomRatio
} from './canvas.js';
import {
  ensureMockupTemplates,
  renderMockupTemplateGrid,
  renderMockupTemplateCards,
  openMockupTemplateDetail,
  closeMockupTemplateDetail,
  applyTemplate,
  loadMockupProjectInto
} from './templates.js';
import {
  switchInspectorTab,
  routeInspectorForLayer,
  renderMockupLayersPanel,
  syncSection2Inputs,
  buildScreenLayersModel,
  setCustomLayerName,
  toggleLayerVisibilityInModel,
  toggleLayerLockInModel,
  attachLayerDragAndDrop,
  reorderLayersInModel,
  setLayerZIndex,
  setupInspectorEvents,
  renderMockupDevicesSection
} from './editor.js';
import {
  renderMockupMatrix,
  selectMockupScreen,
  deleteMockupScreen,
  addMockupScreen,
  selectedCell,
  defaultColumnStyle
} from './matrix.js';
import {
  generateStorePackage,
  setupExportHandlers
} from './export.js';
import {
  loadCaptureTab,
  connectLiveBrowser,
  disconnectLiveBrowser,
  triggerScreenshotCapture,
  connectAndroidDevice,
  disconnectAndroidDevice,
  loadAndroidDevices,
  triggerAndroidCapture,
  renderAndroidCaptures
} from './capture.js';
import {
  loadVideoProjectInto,
  renderVideoScenes,
  loadSavedConfigs,
  renderVideoTemplateGrid,
  openVideoTemplateDetail,
  closeVideoTemplateDetail,
  loadVideoTemplateNow
} from './video.js';
import {
  setupSettingsAndModals,
  checkToolchainStatusOnStartup,
  refreshAuthStatus,
  loadDevicesCatalogue,
  openUniversalUploadModal
} from './settings.js';
import {
  activeProjectId,
  activeProject,
  setActiveProjectId,
  setActiveProject,
  mockupId,
  mockupProject,
  setMockupId,
  setMockupProject,
  selectedColumn,
  setSelectedColumn,
  mockupIsDirty,
  setMockupDirty,
  pushMockupHistory,
  undoMockupState,
  redoMockupState,
  saveCurrentMockupProject
} from './state.js';
import { api, uploadFile, showAlert, showConfirm, showPrompt, showToast } from './utils.js';
import {
  setupProjectsHandlers,
  refreshProjectsList,
  selectProject,
  updateTabGating,
  refreshFileExplorer
} from './projects.js';

// Expose globals for window event bindings
window.$ = (id) => document.getElementById(id);
window.api = api;
window.uploadFile = uploadFile;
window.showAlert = showAlert;
window.showConfirm = showConfirm;
window.showPrompt = showPrompt;
window.showToast = showToast;
window.alert = showAlert;
window.confirm = showConfirm;
window.prompt = showPrompt;

window.refreshProjectsList = refreshProjectsList;
window.selectProject = selectProject;
window.updateTabGating = updateTabGating;
window.refreshFileExplorer = refreshFileExplorer;

window.initMockupFabricCanvas = initMockupFabricCanvas;
window.loadColumnIntoFabric = loadColumnIntoFabric;
window.renderMockupTemplateGrid = renderMockupTemplateGrid;
window.renderMockupTemplateCards = renderMockupTemplateCards;
window.openMockupTemplateDetail = openMockupTemplateDetail;
window.closeMockupTemplateDetail = closeMockupTemplateDetail;
window.applyTemplate = applyTemplate;
window.switchInspectorTab = switchInspectorTab;
window.routeInspectorForLayer = routeInspectorForLayer;
window.renderMockupLayersPanel = renderMockupLayersPanel;
window.syncSection2Inputs = syncSection2Inputs;
window.renderMockupCanvas = renderMockupCanvas;

// Editor internals — Moveable gizmo + layers panel
window.initMoveableForCanvas = initMoveableForCanvas;
window.commitMoveableTransformToModel = commitMoveableTransformToModel;
window.renderTransformGizmoOverlay = renderTransformGizmoOverlay;
window.attachGizmoEvents = attachGizmoEvents;

// Layers panel internals
window.buildScreenLayersModel = buildScreenLayersModel;
window.setCustomLayerName = setCustomLayerName;
window.toggleLayerVisibilityInModel = toggleLayerVisibilityInModel;
window.toggleLayerLockInModel = toggleLayerLockInModel;
window.attachLayerDragAndDrop = attachLayerDragAndDrop;
window.reorderLayersInModel = reorderLayersInModel;
window.setLayerZIndex = setLayerZIndex;
window.selectMockupScreen = selectMockupScreen;
window.deleteMockupScreen = deleteMockupScreen;
window.addMockupScreen = addMockupScreen;
window.generateStorePackage = generateStorePackage;
window.loadCaptureTab = loadCaptureTab;
window.connectLiveBrowser = connectLiveBrowser;
window.disconnectLiveBrowser = disconnectLiveBrowser;
window.triggerScreenshotCapture = triggerScreenshotCapture;
window.connectAndroidDevice = connectAndroidDevice;
window.disconnectAndroidDevice = disconnectAndroidDevice;
window.loadAndroidDevices = loadAndroidDevices;
window.triggerAndroidCapture = triggerAndroidCapture;
window.renderAndroidCaptures = renderAndroidCaptures;
window.loadVideoProjectInto = loadVideoProjectInto;
window.renderVideoScenes = renderVideoScenes;
window.renderMockupDevicesSection = renderMockupDevicesSection;
window.loadDevicesCatalogue = loadDevicesCatalogue;
window.openUniversalUploadModal = openUniversalUploadModal;

window.pushMockupHistory = pushMockupHistory;
window.undoMockupState = undoMockupState;
window.redoMockupState = redoMockupState;
window.saveCurrentMockupProject = saveCurrentMockupProject;

// Keyboard shortcuts (Undo / Redo)
document.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    if (e.shiftKey) {
      e.preventDefault();
      redoMockupState();
    } else {
      e.preventDefault();
      undoMockupState();
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redoMockupState();
  }
});

// Real-Time Stage Controls Toolbar — undo/redo, screen/asset management, zoom, save, export.
function setupMockupToolbar() {
  const $id = (id) => document.getElementById(id);

  if ($id("mockup-undo-btn")) $id("mockup-undo-btn").onclick = undoMockupState;
  if ($id("mockup-redo-btn")) $id("mockup-redo-btn").onclick = redoMockupState;
  if ($id("mockup-add-column")) $id("mockup-add-column").onclick = addMockupScreen;

  if ($id("mockup-zoom-fit")) $id("mockup-zoom-fit").onclick = () => centerArtboardInViewport();
  if ($id("mockup-zoom-50")) $id("mockup-zoom-50").onclick = () => setStageZoomAndCenter(0.5);
  if ($id("mockup-zoom-100")) $id("mockup-zoom-100").onclick = () => setStageZoomAndCenter(1.0);
  if ($id("mockup-zoom-in")) $id("mockup-zoom-in").onclick = () => setStageZoomAndCenter(Math.min(stageZoomRatio * 1.25, 3.0));
  if ($id("mockup-zoom-out")) $id("mockup-zoom-out").onclick = () => setStageZoomAndCenter(Math.max(stageZoomRatio * 0.8, 0.1));

  if ($id("mockup-add-asset-btn")) {
    $id("mockup-add-asset-btn").onclick = () => {
      if ($id("mockup-asset-upload-input")) $id("mockup-asset-upload-input").click();
    };
  }
  if ($id("mockup-asset-upload-input")) {
    $id("mockup-asset-upload-input").onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file || !mockupId || !selectedCell) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const { source } = await api(`/api/mockups/${mockupId}/upload-asset`, {
            method: "POST",
            body: { name: file.name, data: evt.target.result }
          });
          const col = mockupProject.columns.find((c) => c.id === selectedCell.columnId);
          if (!col) return;
          col.style.assetLayers = col.style.assetLayers || [];
          col.style.assetLayers.push({
            id: `asset_${Date.now()}`,
            assetId: source.id,
            name: source.name,
            xPct: 50, yPct: 50, widthPct: 35, rotation: 0, opacity: 1, zIndex: 10
          });
          await saveCurrentMockupProject();
          pushMockupHistory();
          loadColumnIntoFabric(col);
          renderMockupMatrix();
          showToast(`Asset "${file.name}" added to screen layer.`, "success");
        } catch (err) {
          await showAlert("Asset upload failed: " + err.message);
        }
      };
      reader.readAsDataURL(file);
    };
  }

  if ($id("mockup-reset-template-btn")) {
    $id("mockup-reset-template-btn").onclick = async () => {
      if (!selectedCell || !mockupProject) return;
      const ok = await showConfirm("Reset active screen style to defaults?");
      if (!ok) return;
      const col = mockupProject.columns.find((c) => c.id === selectedCell.columnId);
      if (!col) return;
      col.style = defaultColumnStyle("Screen");
      if (mockupProject.cells) delete mockupProject.cells[`${selectedCell.deviceRowId}:${selectedCell.columnId}`];
      await saveCurrentMockupProject();
      pushMockupHistory();
      loadColumnIntoFabric(col);
      renderMockupMatrix();
    };
  }

  if ($id("mk-save")) {
    $id("mk-save").onclick = async () => {
      if (!selectedCell) return;
      await saveCurrentMockupProject();
      pushMockupHistory();
      setMockupDirty(false);
      renderMockupMatrix();
      showToast("Changes saved.", "success");
    };
  }

  if ($id("mk-copy-style")) {
    $id("mk-copy-style").onclick = async () => {
      if (!selectedCell || !mockupProject) return;
      const col = mockupProject.columns.find((c) => c.id === selectedCell.columnId);
      if (!col) return;
      if (mockupProject.cells) {
        for (const row of mockupProject.devices || []) {
          delete mockupProject.cells[`${row.id}:${col.id}`];
        }
      }
      await saveCurrentMockupProject();
      pushMockupHistory();
      renderMockupMatrix();
      await showAlert("Style copied across all device rows for this screen.");
    };
  }

  if ($id("mockup-export-single-btn")) {
    $id("mockup-export-single-btn").onclick = async () => {
      if (!mockupProject || !mockupId) return showAlert("No active mockup project loaded.");
      const btn = $id("mockup-export-single-btn");
      btn.disabled = true;
      btn.textContent = "Exporting PNG…";
      try {
        const colId = selectedCell ? selectedCell.columnId : (mockupProject.columns[0]?.id || "");
        const res = await api(`/api/mockups/${mockupId}/export/single`, { method: "POST", body: { columnId: colId } });
        await showAlert(`Single Screen exported successfully to:\n${res.path}`);
      } catch (e) {
        await showAlert("Single screen export failed: " + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Export Screen (PNG)";
      }
    };
  }

  // Keep the artboard centered when the viewport is resized (panel toggles, window resize).
  window.addEventListener("resize", () => {
    if (document.getElementById("mockup-section-editor")?.classList.contains("active")) {
      try { centerArtboardInViewport(); } catch (_) {}
    }
  });
}

// DOMContentLoaded bootstrapping
document.addEventListener('DOMContentLoaded', async () => {
  initMockupFabricCanvas();
  setupInspectorEvents();
  setupExportHandlers();
  setupProjectsHandlers();
  setupSettingsAndModals();
  setupMockupToolbar();

  // Theme init
  const savedTheme = localStorage.getItem("sag-theme") || "dark";
  window.applyTheme(savedTheme);

  // Initial load — restore active project and sync all gating right away
  if (activeProjectId) {
    try {
      const proj = await api(`/api/projects/${activeProjectId}`);
      setActiveProject(proj);
    } catch (_) {
      setActiveProjectId(null);
      setActiveProject(null);
    }
  }
  updateTabGating();

  if (typeof window.refreshProjectsList === 'function') {
    window.refreshProjectsList();
  }

  // Bind rail navigation buttons (Templates / Editor / Devices / etc.)
  for (const railBtn of document.querySelectorAll(".rail-btn")) {
    railBtn.onclick = () => {
      const rail = railBtn.closest(".rail");
      const tabPage = railBtn.closest(".tab-page");
      if (!rail || !tabPage) return;

      for (const b of rail.querySelectorAll(".rail-btn")) b.classList.remove("active");
      for (const s of tabPage.querySelectorAll(".section-page")) s.classList.remove("active");
      railBtn.classList.add("active");
      const prefix = tabPage.id === "tab-capture" ? "capture" : tabPage.id === "tab-mockup" ? "mockup" : "video";
      const targetSec = document.getElementById(prefix + "-section-" + railBtn.dataset.section);
      if (targetSec) targetSec.classList.add("active");

      if (prefix === "mockup") {
        const inspector = document.getElementById("mockup-inspector");
        if (inspector) inspector.style.display = railBtn.dataset.section === "editor" ? "block" : "none";
        if (railBtn.dataset.section === "devices") renderMockupDevicesSection();
        // Viewport was hidden (0 width) while off-screen — re-center now that it's visible.
        if (railBtn.dataset.section === "editor") { try { centerArtboardInViewport(); } catch (_) {} }
      }
      if (prefix === "video") {
        if (railBtn.dataset.section === "scenes") renderVideoScenes();
        if (railBtn.dataset.section === "devices") loadDevicesCatalogue();
        if (railBtn.dataset.section === "saved-configs") loadSavedConfigs();
      }
    };
  }

  // Bind topbar tabs
  for (const tab of document.querySelectorAll(".topbar-tab")) {
    tab.addEventListener("click", async () => {
      const targetTab = tab.dataset.tab;
      if (targetTab === "capture" && !activeProjectId) {
        await showAlert("Please select or create a project first from the Projects List.");
        return;
      }
      for (const t of document.querySelectorAll(".topbar-tab")) t.classList.remove("active");
      for (const p of document.querySelectorAll(".tab-page")) p.classList.remove("active");
      tab.classList.add("active");
      const pageEl = document.getElementById("tab-" + targetTab);
      if (pageEl) pageEl.classList.add("active");

      if (targetTab === "projects") {
        if (typeof window.refreshProjectsList === "function") window.refreshProjectsList();
      } else if (targetTab === "capture") {
        loadCaptureTab();
      } else if (targetTab === "mockup") {
        loadMockupProjectInto(activeProjectId);
      } else if (targetTab === "video") {
        loadVideoProjectInto(activeProjectId);
      }
    });
  }

  // Check auth and toolchain on startup
  refreshAuthStatus();
  checkToolchainStatusOnStartup();
});

window.applyTheme = (theme) => {
  document.documentElement.classList.remove("dark", "light");
  if (theme === "light") document.documentElement.classList.add("light");
  else document.documentElement.classList.add("dark");
  localStorage.setItem("sag-theme", theme);
};

export { activeProjectId, activeProject, setActiveProjectId, setActiveProject, mockupId, mockupProject, setMockupId, setMockupProject, selectedColumn, setSelectedColumn, mockupIsDirty, setMockupDirty };
