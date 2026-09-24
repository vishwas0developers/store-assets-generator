// Main module — app bootstrapping, event wiring, and module initialization.
// Binds all core workflows and attaches window helpers for compatibility.

import { applyStandardIcons } from './icons.js';
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
  setStageZoomAtViewportCenter,
  stageZoomRatio,
  isHandToolActive,
  setHandToolActive,
  initCanvasPanZoomEvents,
  setActivePage
} from './canvas.js';
import {
  ensureMockupTemplates,
  renderMockupTemplateGrid,
  renderMockupTemplateCards,
  openMockupTemplateDetail,
  closeMockupTemplateDetail,
  applyTemplate,
  loadMockupProjectInto,
  mockupDevicesCatalog
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
  renderMockupDevicesSection,
  deleteSelectedLayer,
  setupTextToolbarEvents,
  setupObjectToolbarEvents,
  hideTextToolbar,
  addDeviceLayer,
  addTextLayer,
  openAssetUpload
} from './editor.js';
import {
  renderMockupMatrix,
  selectMockupPage,
  deleteMockupPage,
  addMockupPage,
  selectedCell,
  defaultColumnStyle,
  syncEditingAreaToSelectedPages,
  renderLivePreviews,
  renderLivePanoramic,
  refreshLiveIfVisible,
  getPanoramicSizeKey,
  setPanoramicSizeKey
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
  setupCaptureHandlers,
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
  rebindSelectedColumn,
  selectedColumn,
  setSelectedColumn,
  selectedPages,
  mockupIsDirty,
  setMockupDirty,
  setLiveRefreshHook,
  pushMockupHistory,
  undoMockupState,
  redoMockupState,
  saveCurrentMockupProject,
  snapshotOfMockupProject,
  setSavedSnapshot,
  mockupHistory,
  mockupHistoryIdx
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
window.hideTextToolbar = hideTextToolbar;
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
window.selectMockupPage = selectMockupPage;
window.deleteMockupPage = deleteMockupPage;
window.addMockupPage = addMockupPage;
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

// Keyboard shortcuts (Undo / Redo / Delete) -- must ignore contenteditable
// (covers inline TinyMCE, which has no tagName of INPUT/TEXTAREA/SELECT but
// still needs its own native undo/typing keys), and Ctrl+Z/Y only fire while
// the Studio Mockup editor section is actually the active one on screen.
document.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable)) return;
  const editorActive = document.getElementById("mockup-section-editor")?.classList.contains("active");
  if (!editorActive) return;
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
  } else if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteSelectedLayer();
  }
});

// Real-Time Stage Controls Toolbar — undo/redo, screen/asset management, zoom, save, export.
function setupMockupToolbar() {
  const $id = (id) => document.getElementById(id);

  if ($id("mockup-undo-btn")) $id("mockup-undo-btn").onclick = undoMockupState;
  if ($id("mockup-redo-btn")) $id("mockup-redo-btn").onclick = redoMockupState;
  if ($id("mockup-add-page")) $id("mockup-add-page").onclick = addMockupPage;

  if ($id("mockup-zoom-fit")) $id("mockup-zoom-fit").onclick = () => centerArtboardInViewport();
  if ($id("mockup-zoom-50")) $id("mockup-zoom-50").onclick = () => setStageZoomAndCenter(0.5);
  if ($id("mockup-zoom-100")) $id("mockup-zoom-100").onclick = () => setStageZoomAndCenter(1.0);
  if ($id("mockup-zoom-in")) $id("mockup-zoom-in").onclick = () => setStageZoomAtViewportCenter(Math.min(stageZoomRatio * 1.25, 3.0));
  if ($id("mockup-zoom-out")) $id("mockup-zoom-out").onclick = () => setStageZoomAtViewportCenter(Math.max(stageZoomRatio * 0.8, 0.1));

  if ($id("mockup-hand-tool-btn")) {
    $id("mockup-hand-tool-btn").onclick = () => {
      const btn = $id("mockup-hand-tool-btn");
      const next = !isHandToolActive;
      setHandToolActive(next);
      btn.classList.toggle("active", next);
    };
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isHandToolActive) {
      setHandToolActive(false);
      if ($id("mockup-hand-tool-btn")) $id("mockup-hand-tool-btn").classList.remove("active");
    }
  });

  if ($id("mockup-add-asset-btn")) $id("mockup-add-asset-btn").onclick = () => openAssetUpload();
  if ($id("mockup-add-device-layer-btn")) $id("mockup-add-device-layer-btn").onclick = () => addDeviceLayer();
  if ($id("mockup-add-text-btn")) $id("mockup-add-text-btn").onclick = () => addTextLayer();
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
            // assetId must be the file's relative path (what canvas.js and
            // src/mockup/render.ts's resolveUri() both expect) -- not the
            // source's id, which doesn't map to any real file on disk.
            assetId: source.file,
            name: source.name,
            xPct: 50, yPct: 50, widthPct: 35, rotation: 0, opacity: 1, zIndex: 10
          });
          // The image file itself is uploaded to disk right away above; the
          // layer that points to it is just an in-memory edit like any
          // other, recorded via the same debounced setMockupDirty->history
          // hook as everything else -- only Save actually writes it to disk.
          setMockupDirty(true);
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
      const col = mockupProject.columns.find((c) => c.id === selectedCell.columnId);
      if (!col) return;
      const pageLabel = col.style?.title?.text || "this page";
      const ok = await showConfirm(`This discards every change made to "${pageLabel}" and cannot be undone. Other pages are not affected.`, "Reset this page to the original template?", true);
      if (!ok) return;
      // Restore the EXACT style the template generated for this page (a
      // snapshot taken once at template-apply time, see
      // applyMockupTemplate's templateDefaultStyle) -- not a generic blank
      // default, which was the previous (wrong) behavior: it discarded the
      // template's real layout/background/title/device recipe entirely
      // instead of returning to it. Deep-cloned so re-editing after a reset
      // can't mutate the stored snapshot itself. Falls back to the old
      // generic-defaults behavior only for a project saved before this
      // snapshot existed.
      col.style = col.templateDefaultStyle
        ? JSON.parse(JSON.stringify(col.templateDefaultStyle))
        : defaultColumnStyle("Page");
      // Only THIS page's cell overrides, for THIS page's own device rows --
      // never touches any other column's overrides.
      if (mockupProject.cells) {
        for (const key of Object.keys(mockupProject.cells)) {
          if (key.endsWith(`:${col.id}`)) delete mockupProject.cells[key];
        }
      }
      await saveCurrentMockupProject();
      pushMockupHistory();
      await setActivePage(col.id);
      renderMockupMatrix();
      showToast(`"${pageLabel}" reset to the original template design.`, "success");
    };
  }

  if ($id("mk-save")) {
    $id("mk-save").onclick = async () => {
      if (!mockupId || !mockupProject) return;
      await saveCurrentMockupProject();
      setSavedSnapshot(snapshotOfMockupProject(mockupProject));
      setMockupDirty(false);
      renderMockupMatrix();
      showToast("Changes saved.", "success");
    };
  }

  const downloadFrom = (url) => { if (!url) return; const a = document.createElement("a"); a.href = url; a.download = ""; document.body.appendChild(a); a.click(); a.remove(); };

  if ($id("mockup-export-single-btn")) {
    $id("mockup-export-single-btn").onclick = async () => {
      if (!mockupProject || !mockupId) return showAlert("No active mockup project loaded.");
      const btn = $id("mockup-export-single-btn");
      btn.disabled = true;
      btn.textContent = "Exporting PNG…";
      try {
        const colId = selectedCell ? selectedCell.columnId : (mockupProject.columns[0]?.id || "");
        const res = await api(`/api/mockups/${mockupId}/export/single`, { method: "POST", body: { columnId: colId } });
        downloadFrom(res.downloadUrl);
        showToast("Page exported (PNG download started).", "success");
      } catch (e) {
        await showAlert("Page export failed: " + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Export Page (PNG)";
      }
    };
  }

  if ($id("mockup-export-panoramic-btn")) {
    $id("mockup-export-panoramic-btn").onclick = async () => {
      if (!mockupProject || !mockupId) return showAlert("No active mockup project loaded.");
      const btn = $id("mockup-export-panoramic-btn");
      btn.disabled = true;
      btn.textContent = "Exporting Banner…";
      try {
        const res = await api(`/api/mockups/${mockupId}/export/panoramic`, { method: "POST", body: { sizeKey: getPanoramicSizeKey() || undefined } });
        downloadFrom(res.downloadUrl);
        showToast("Panoramic banner exported (PNG download started).", "success");
      } catch (e) {
        await showAlert("Panoramic banner export failed: " + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Export Panoramic Banner (PNG)";
      }
    };
  }

  if ($id("mockup-export-store-btn")) {
    $id("mockup-export-store-btn").onclick = async () => {
      if (!mockupProject || !mockupId) return showAlert("No active mockup project loaded.");
      const btn = $id("mockup-export-store-btn");
      btn.disabled = true;
      btn.textContent = "Generating ZIP Package…";
      try {
        // Server shape: { ok, result: { zipPath, bytes, entries }, downloadUrl }.
        const { result, downloadUrl } = await api(`/api/mockups/${mockupId}/export`, { method: "POST" });
        const kb = (result.bytes / 1024).toFixed(1);
        downloadFrom(downloadUrl);
        showToast(`Store package ready (${kb} KB): ` + result.entries.map((e) => `${e.label} ${e.width}x${e.height} (${e.files})`).join(", "), "success");
      } catch (e) {
        await showAlert("Store Package export failed: " + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Export Store Package (ZIP)";
      }
    };
  }

  if ($id("mockup-add-device-select")) {
    $id("mockup-add-device-select").onchange = () => {
      const device = mockupDevicesCatalog.find((d) => d.id === $id("mockup-add-device-select").value);
      const select = $id("mockup-add-device-variant");
      if (!select) return;
      select.innerHTML = '<option value="">default</option>';
      if (device?.variants) for (const v of device.variants) select.innerHTML += `<option value="${v.id}">${v.name}</option>`;
    };
  }
  if ($id("mockup-add-device-btn")) {
    $id("mockup-add-device-btn").onclick = async () => {
      if (!mockupId) return showAlert("Start a project first.");
      const deviceId = $id("mockup-add-device-select")?.value;
      const label = $id("mockup-add-device-label")?.value.trim() || deviceId;
      const { project } = await api(`/api/mockups/${mockupId}/devices`, { method: "POST", body: { deviceId, variant: $id("mockup-add-device-variant")?.value || undefined, label } });
      setMockupProject(project);
      rebindSelectedColumn();
      if ($id("mockup-add-device-label")) $id("mockup-add-device-label").value = "";
      renderMockupDevicesSection();
      renderMockupMatrix();
      await syncEditingAreaToSelectedPages();
    };
  }

  if ($id("mockup-panoramic-size")) {
    $id("mockup-panoramic-size").onchange = () => {
      setPanoramicSizeKey($id("mockup-panoramic-size").value);
      renderLivePanoramic();
    };
  }
  // Live Preview/Panoramic refresh 400 ms after any edit while one of those sections is visible.
  setLiveRefreshHook(refreshLiveIfVisible);

  if ($id("mockup-export-template-btn")) {
    $id("mockup-export-template-btn").onclick = () => {
      if (!mockupProject) return showAlert("No active mockup project loaded.");
      const data = JSON.stringify({ devices: mockupProject.devices, columns: mockupProject.columns, cells: mockupProject.cells }, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(mockupProject.name || "mockup-template").replace(/[^a-z0-9-_]+/gi, "_")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    };
  }
  if ($id("mockup-import-template-btn")) {
    $id("mockup-import-template-btn").onclick = () => $id("mockup-import-file-input")?.click();
  }
  if ($id("mockup-import-file-input")) {
    $id("mockup-import-file-input").onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file || !mockupId) return;
      try {
        const data = JSON.parse(await file.text());
        const updated = await api(`/api/mockups/${mockupId}`, { method: "PUT", body: { devices: data.devices, columns: data.columns, cells: data.cells } });
        setMockupProject(updated);
        rebindSelectedColumn();
        pushMockupHistory();
        renderMockupMatrix();
        if (updated.columns?.[0]) selectMockupPage(updated.columns[0].id);
        showToast("Template imported.", "success");
      } catch (err) {
        await showAlert("Import failed: " + err.message);
      }
    };
  }

  if ($id("mk-source-upload")) {
    $id("mk-source-upload").onclick = () => {
      if (!activeProjectId) return showAlert("Select a project first.");
      openUniversalUploadModal((selectedPath) => {
        setTimeout(async () => {
          const updated = await api(`/api/mockups/${activeProjectId}`);
          setMockupProject(updated);
          rebindSelectedColumn();
          await syncEditingAreaToSelectedPages();
          const sourceEl = $id("mk-source");
          if (!sourceEl) return;
          sourceEl.innerHTML = (updated.sources || []).map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
          const src = updated.sources?.find((s) => s.file === selectedPath);
          if (src) sourceEl.value = src.id;
        }, 200);
      });
    };
  }

  if ($id("mockup-unsaved-save")) {
    $id("mockup-unsaved-save").onclick = async () => {
      await saveCurrentMockupProject();
      setMockupDirty(false);
      $id("mockup-unsaved-modal").style.display = "none";
    };
  }
  if ($id("mockup-unsaved-discard")) {
    $id("mockup-unsaved-discard").onclick = async () => {
      if (mockupHistoryIdx >= 0) setMockupProject(JSON.parse(mockupHistory[mockupHistoryIdx]));
      rebindSelectedColumn();
      setMockupDirty(false);
      $id("mockup-unsaved-modal").style.display = "none";
      renderMockupMatrix();
      await syncEditingAreaToSelectedPages();
    };
  }
  if ($id("mockup-unsaved-cancel")) {
    $id("mockup-unsaved-cancel").onclick = () => { $id("mockup-unsaved-modal").style.display = "none"; };
  }

  // Keep the artboard centered when the viewport is resized (panel toggles, window resize).
  window.addEventListener("resize", () => {
    if (document.getElementById("mockup-section-editor")?.classList.contains("active")) {
      try { centerArtboardInViewport(); } catch (_) {}
      try { renderMockupMatrix(); } catch (_) {}
    }
  });
}

// DOMContentLoaded bootstrapping
document.addEventListener('DOMContentLoaded', async () => {
  initMockupFabricCanvas();
  initCanvasPanZoomEvents();
  setupInspectorEvents();
  setupTextToolbarEvents();
  setupObjectToolbarEvents();
  applyStandardIcons();
  setupExportHandlers();
  setupProjectsHandlers();
  setupSettingsAndModals();
  setupMockupToolbar();
  setupCaptureHandlers();

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
        if (railBtn.dataset.section === "preview") renderLivePreviews();
        if (railBtn.dataset.section === "panoramic") renderLivePanoramic();
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
  document.documentElement.classList.add(theme === "light" ? "light" : "dark");
  localStorage.setItem("sag-theme", theme);
  const icon = document.getElementById("theme-icon");
  if (icon) icon.innerHTML = theme === "light" ? "&#9790;" : "&#9788;";
};

if (document.getElementById("theme-toggle-btn")) {
  document.getElementById("theme-toggle-btn").onclick = () => {
    const current = localStorage.getItem("sag-theme") || "dark";
    window.applyTheme(current === "dark" ? "light" : "dark");
  };
}

export { activeProjectId, activeProject, setActiveProjectId, setActiveProject, mockupId, mockupProject, setMockupId, setMockupProject, selectedColumn, setSelectedColumn, mockupIsDirty, setMockupDirty };
