// Main module — app bootstrapping, event wiring, and module initialization.
// Binds all core workflows and attaches window helpers for compatibility.

import {
  initMockupFabricCanvas,
  loadColumnIntoFabric,
  initMoveableForCanvas,
  commitMoveableTransformToModel,
  renderMockupCanvas,
  renderTransformGizmoOverlay,
  attachGizmoEvents
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
  addMockupScreen
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

// DOMContentLoaded bootstrapping
document.addEventListener('DOMContentLoaded', async () => {
  initMockupFabricCanvas();
  setupInspectorEvents();
  setupExportHandlers();
  setupProjectsHandlers();
  setupSettingsAndModals();

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
