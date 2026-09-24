// Editor module — right-hand inspector sidebar, property forms, layer panel,
// and layer selection routing.

import {
  selectedColumn,
  selectedLayerId,
  setSelectedLayerId,
  setMockupDirty,
  mockupId,
  mockupProject,
  setMockupProject,
  saveCurrentMockupProject,
  mockupFabricCanvas,
  selectedPages,
  pushMockupHistory
} from './state.js';
import { escapeHtml, api, uploadFile, showAlert, showToast, showConfirm, resolveDeviceFrame, resolveDeviceGeometry, getLayoutPresetClient, presentationTransformClient } from './utils.js';
import { resolveDeviceFrameGeometry } from '/dist/mockup/layerLayout.js';
import { mockupDevicesCatalog } from './templates.js';
import { ARTBOARD_H, loadColumnIntoFabric, renderMockupCanvas, setActivePage, syncFabricObjectToModel } from './canvas.js';
import { renderMockupMatrix, getSelectedCellStyle, addMockupPage, syncEditingAreaToSelectedPages } from './matrix.js';
import { loadDeviceCategories, getDeviceCategoriesSync, deviceCategoryLabel } from './deviceCategories.js';

loadDeviceCategories();

export function switchInspectorTab(tabId) {
  const tabs = document.querySelectorAll("#mockup-inspector .tab, #mk-section-object [id^='mk-tab-']");
  const panels = document.querySelectorAll("#mockup-inspector .tab-panel, [id^='mk-panel-']");
  if (["col", "dev", "text", "asset"].includes(tabId)) {
    ["col", "dev", "text", "asset"].forEach((t) => {
      const btn = document.getElementById(`mk-tab-${t}`);
      const panel = document.getElementById(`mk-panel-${t}`);
      if (btn) btn.className = t === tabId ? "primary small" : "secondary small";
      if (panel) panel.style.display = t === tabId ? "block" : "none";
    });
  } else {
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tabId));
  }
}

export function routeInspectorForLayer(layerId) {
  if (layerId === 'title' || layerId === 'subtitle') switchInspectorTab('text');
  else if (layerId === 'deviceOne' || layerId === 'deviceTwo') switchInspectorTab('dev');
  else if (layerId?.startsWith('asset:') || layerId?.startsWith('decoration:') || layerId?.startsWith('text:')) switchInspectorTab('asset');
  else switchInspectorTab('col');
}

// Screenshot Source Mapping select -- shared shape across Studio Mockup and
// Video Studio (project.mockup.sources / project.video.sources both carry
// {id, name, file, width, height, deviceCategory, resolution, deviceLabel},
// written once at capture time in src/capture/liveBrowser.ts and
// androidLive.ts, or backfilled server-side for legacy sources -- see
// projectStore.ts's loadProject). Device size (deviceCategory: "phone" |
// "tablet7" | "tablet10") is the ONLY thing shown next to a screenshot's
// name here -- resolution/pixel dimensions stay in the data as technical
// metadata but are never rendered in the UI (see updateSourceDimsReadout).
export function populateSourceSelect(selectEl, sources, selectedId, options) {
  selectEl.innerHTML = "";
  if (options?.blankLabel) {
    const blankOpt = document.createElement("option");
    blankOpt.value = "";
    blankOpt.textContent = options.blankLabel;
    selectEl.appendChild(blankOpt);
  }
  const categories = getDeviceCategoriesSync();
  const orderedIds = categories.length ? categories.map((c) => c.id) : [...new Set(sources.map((s) => s.deviceCategory))];
  const groups = new Map();
  for (const s of sources) {
    const key = s.deviceCategory || "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const orderedKeys = [...orderedIds.filter((id) => groups.has(id)), ...[...groups.keys()].filter((k) => !orderedIds.includes(k))];
  for (const key of orderedKeys) {
    const group = groups.get(key);
    const parent = groups.size > 1 ? document.createElement("optgroup") : selectEl;
    if (parent !== selectEl) parent.label = deviceCategoryLabel(key);
    for (const s of group) {
      const opt = document.createElement("option");
      opt.value = s.id;
      // "Screenshot Name — Device Size" -- never a resolution/pixel suffix.
      opt.textContent = `${s.name} — ${deviceCategoryLabel(s.deviceCategory)}`;
      parent.appendChild(opt);
    }
    if (parent !== selectEl) selectEl.appendChild(parent);
  }
  if (selectedId) selectEl.value = selectedId;
}

export function updateSourceDimsReadout(sources, sourceId) {
  const el = document.getElementById("mk-source-dims");
  if (!el) return;
  const source = sourceId ? sources.find((s) => s.id === sourceId) : null;
  el.textContent = source ? deviceCategoryLabel(source.deviceCategory) : "";
}

export function buildScreenLayersModel(column) {
  if (!column || !column.style) return [];
  const style = getSelectedCellStyle() || column.style;
  const layers = [];

  if (style.deviceOne && !style.deviceOne.deleted) {
    layers.push({
      id: "deviceOne",
      type: "device",
      icon: "📱",
      name: style.deviceOne.customName || "Device Frame 1",
      visible: style.deviceOne.visible !== false,
      locked: !!style.deviceOne.locked,
      zIndex: style.deviceOne.zIndex ?? 10,
    });
  }
  (style.extraDevices || []).forEach((dev, idx) => {
    if (dev.deleted) return;
    layers.push({
      id: `extra:${idx}`,
      type: "device",
      icon: "📱",
      name: dev.customName || `Device Frame ${idx + 3}`,
      visible: dev.visible !== false,
      locked: !!dev.locked,
      zIndex: dev.zIndex ?? (8 - idx),
    });
  });
  if (style.deviceTwo && !style.deviceTwo.deleted) {
    layers.push({
      id: "deviceTwo",
      type: "device",
      icon: "📱",
      name: style.deviceTwo.customName || "Device Frame 2",
      visible: style.deviceTwo.visible !== false,
      locked: !!style.deviceTwo.locked,
      zIndex: style.deviceTwo.zIndex ?? 9,
    });
  }
  if (style.title && !style.title.deleted) {
    layers.push({
      id: "title",
      type: "title",
      icon: "🔤",
      name: style.title.customName || "Title Text",
      visible: style.title.visible !== false,
      locked: !!style.title.locked,
      zIndex: style.title.zIndex ?? 20,
    });
  }
  if (style.subtitle && !style.subtitle.deleted) {
    layers.push({
      id: "subtitle",
      type: "subtitle",
      icon: "📝",
      name: style.subtitle.customName || "Subtitle Text",
      visible: style.subtitle.visible !== false,
      locked: !!style.subtitle.locked,
      zIndex: style.subtitle.zIndex ?? 19,
    });
  }
  if (style.assetLayers) {
    style.assetLayers.forEach((ast, idx) => {
      layers.push({
        id: `asset:${idx}`,
        type: "asset",
        icon: "📦",
        name: ast.customName || `Asset Layer ${idx + 1}`,
        visible: ast.visible !== false,
        locked: !!ast.locked,
        zIndex: ast.zIndex ?? (15 + idx),
      });
    });
  }
  if (style.textLayers) {
    style.textLayers.forEach((txt, idx) => {
      layers.push({
        id: `text:${idx}`,
        type: "text",
        icon: "🅣",
        name: txt.customName || `Text Layer ${idx + 1}`,
        visible: txt.visible !== false,
        locked: !!txt.locked,
        zIndex: txt.zIndex ?? (30 + idx),
      });
    });
  }
  if (style.decorations) {
    style.decorations.forEach((dec, idx) => {
      layers.push({
        id: `decoration:${idx}`,
        type: "decoration",
        icon: "🎯",
        name: dec.customName || `Sticker / Badge ${idx + 1}`,
        visible: dec.visible !== false,
        locked: !!dec.locked,
        zIndex: dec.zIndex ?? (25 + idx),
      });
    });
  }
  if (style.background) {
    layers.push({
      id: "background",
      type: "background",
      icon: "🎨",
      name: style.background.customName || `Background (${style.background.type || "gradient"})`,
      visible: style.background.visible !== false,
      locked: !!style.background.locked,
      zIndex: style.background.zIndex ?? 0,
    });
  }

  return layers.sort((a, b) => b.zIndex - a.zIndex);
}

export function renderMockupLayersPanel(column) {
  const container = document.getElementById("mk-layers-list") || document.getElementById("mockup-layers-list");
  if (!container) return;
  if (!column) {
    container.innerHTML = `<div class="hint" style="padding:0.5rem;">No screen selected</div>`;
    return;
  }

  const layers = buildScreenLayersModel(column);
  container.innerHTML = layers.map((layer) => {
    const isSelected = selectedLayerId === layer.id;
    const isHidden = !layer.visible;
    const isLocked = !!layer.locked;
    return `
      <div class="mk-layer-item ${isSelected ? "active" : ""} ${isHidden ? "hidden-layer" : ""}" data-layer-id="${layer.id}" draggable="true">
        <span class="mk-layer-drag-handle" title="Drag to reorder layer">⋮⋮</span>
        <span class="mk-layer-type-icon">${layer.icon}</span>
        <span class="mk-layer-name" title="Double-click to rename" data-layer-id="${layer.id}">${escapeHtml(layer.name)}</span>
        <button class="mk-layer-lock-btn" type="button" title="${isLocked ? "Unlock Layer" : "Lock Layer"}" data-lock-id="${layer.id}">
          ${isLocked ? "🔒" : "🔓"}
        </button>
        <button class="mk-layer-vis-btn" type="button" title="${layer.visible ? "Hide Layer" : "Show Layer"}" data-vis-id="${layer.id}">
          ${layer.visible ? "👁" : "⊘"}
        </button>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".mk-layer-item").forEach((item) => {
    const lid = item.dataset.layerId;
    item.onclick = (e) => {
      if (e.target.closest(".mk-layer-vis-btn") || e.target.closest(".mk-layer-lock-btn") || e.target.classList.contains("mk-layer-rename-input")) return;
      setSelectedLayerId(lid);
      renderMockupLayersPanel(column);
      syncSection2Inputs(column, lid);
      routeInspectorForLayer(lid);
      loadColumnIntoFabric(column);
    };

    const nameSpan = item.querySelector(".mk-layer-name");
    if (nameSpan) {
      nameSpan.ondblclick = (e) => {
        e.stopPropagation();
        const currentName = nameSpan.textContent;
        const input = document.createElement("input");
        input.type = "text";
        input.className = "mk-layer-rename-input";
        input.value = currentName;
        nameSpan.replaceWith(input);
        input.focus();
        input.select();

        const saveRename = () => {
          const newName = input.value.trim() || currentName;
          setCustomLayerName(column, lid, newName);
          setMockupDirty(true);
          renderMockupLayersPanel(column);
        };
        input.onblur = saveRename;
        input.onkeydown = (ev) => {
          if (ev.key === "Enter") { ev.preventDefault(); saveRename(); }
          else if (ev.key === "Escape") { renderMockupLayersPanel(column); }
        };
      };
    }

    const lockBtn = item.querySelector(".mk-layer-lock-btn");
    if (lockBtn) {
      lockBtn.onclick = (e) => {
        e.stopPropagation();
        toggleLayerLockInModel(column, lid);
        setMockupDirty(true);
        renderMockupLayersPanel(column);
        loadColumnIntoFabric(column);
      };
    }

    const visBtn = item.querySelector(".mk-layer-vis-btn");
    if (visBtn) {
      visBtn.onclick = (e) => {
        e.stopPropagation();
        toggleLayerVisibilityInModel(column, lid);
        setMockupDirty(true);
        renderMockupLayersPanel(column);
        loadColumnIntoFabric(column);
      };
    }
  });

  attachLayerDragAndDrop(container, column);
}

/** Resolves any device layer ("deviceOne" | "deviceTwo" | "extra:<idx>") to its
 *  DeviceLayerStyle object -- mirrors src/mockup/project.ts's getDeviceLayer(),
 *  the one place that knows how to reach a device regardless of which slot
 *  it lives in, so callers don't hand-enumerate deviceOne/deviceTwo/extraDevices. */
export function resolveDeviceLayer(style, layerId) {
  if (layerId === "deviceOne") return style.deviceOne;
  if (layerId === "deviceTwo") return style.deviceTwo;
  const m = /^extra:(\d+)$/.exec(layerId);
  if (m) return style.extraDevices?.[Number(m[1])];
  return undefined;
}

/** Client mirror of src/mockup/project.ts's allDeviceLayers() -- the one place
 *  that knows how to iterate every device layer on a page (deviceOne,
 *  deviceTwo, all extraDevices[]) regardless of slot, so callers don't
 *  hand-enumerate them (and silently miss deviceTwo/extraDevices as a result). */
export function allDeviceLayers(style) {
  const refs = [{ key: "deviceOne", layer: style.deviceOne }];
  if (style.deviceTwo) refs.push({ key: "deviceTwo", layer: style.deviceTwo });
  (style.extraDevices ?? []).forEach((layer, i) => refs.push({ key: `extra:${i}`, layer }));
  return refs;
}

// Two-page device linking (client mirror of src/mockup/project.ts's
// linkDeviceLayers/unlinkDeviceLayer/syncLinkedDeviceLayer) -- editing a
// linked device's transform on either page propagates to its counterpart,
// for compositions intentionally split/continued across a page boundary.

function findPage(project, pageId) {
  return project?.columns?.find((c) => c.id === pageId);
}

export function linkDeviceLayers(project, pageAId, layerAKey, pageBId, layerBKey) {
  const pageA = findPage(project, pageAId);
  const pageB = findPage(project, pageBId);
  const layerA = pageA && resolveDeviceLayer(pageA.style, layerAKey);
  const layerB = pageB && resolveDeviceLayer(pageB.style, layerBKey);
  if (!layerA || !layerB) return false;
  layerA.linkedTo = { pageId: pageBId, layerKey: layerBKey };
  layerB.linkedTo = { pageId: pageAId, layerKey: layerAKey };
  return true;
}

export function unlinkDeviceLayer(project, pageId, layerKey) {
  const page = findPage(project, pageId);
  const layer = page && resolveDeviceLayer(page.style, layerKey);
  if (!layer?.linkedTo) return;
  const partnerPage = findPage(project, layer.linkedTo.pageId);
  const partnerLayer = partnerPage && resolveDeviceLayer(partnerPage.style, layer.linkedTo.layerKey);
  if (partnerLayer) partnerLayer.linkedTo = undefined;
  layer.linkedTo = undefined;
}

/** Call after committing a transform change to a device layer -- if it's
 *  linked, copies its transform onto the linked counterpart. No-op if unlinked. */
export function syncLinkedDeviceLayer(project, pageId, layerKey) {
  const page = findPage(project, pageId);
  const layer = page && resolveDeviceLayer(page.style, layerKey);
  if (!layer?.linkedTo) return;
  const partnerPage = findPage(project, layer.linkedTo.pageId);
  const partnerLayer = partnerPage && resolveDeviceLayer(partnerPage.style, layer.linkedTo.layerKey);
  if (!partnerLayer) return;
  partnerLayer.size = layer.size;
  partnerLayer.x = layer.x;
  partnerLayer.y = layer.y;
  partnerLayer.rotation = layer.rotation;
  partnerLayer.brightness = layer.brightness;
  partnerLayer.frameless = layer.frameless;
}

/** "Apply Same Color to All Pages" button action -- a distinct, explicit
 *  mechanism from syncLinkedDeviceLayer's two-page link feature above:
 *  invoked directly on click, not gated by any toggle, and propagates the
 *  currently selected device layer's borderColor/bezelColor to EVERY column
 *  of the current mockup project (matched by device-layer slot key, e.g.
 *  "deviceOne"/"deviceTwo"/"extra:0", not by page-specific id), not just
 *  one explicitly linked counterpart. Deliberately does not touch `linkedTo`
 *  or call syncLinkedDeviceLayer -- the two features are independent. */
async function applyDeviceColorToAllPages() {
  if (!mockupProject?.columns || !selectedLayerId) return;
  const style = getSelectedCellStyle() || selectedColumn?.style;
  const sourceDev = style && resolveDeviceLayer(style, selectedLayerId);
  if (!sourceDev) return;
  const { borderColor, bezelColor, borderThickness, bezelThickness } = sourceDev;
  for (const col of mockupProject.columns) {
    for (const { layer: dev } of allDeviceLayers(col.style)) {
      if (dev) {
        dev.borderColor = borderColor;
        dev.bezelColor = bezelColor;
        dev.borderThickness = borderThickness;
        dev.bezelThickness = bezelThickness;
      }
    }
  }
  setMockupDirty(true);
  loadColumnIntoFabric(selectedColumn);
  // Root cause of the "it doesn't work" report: the Preview Page matrix grid's
  // cells are server-rendered <svg> fetched via GET /api/mockups/.../cell-preview/...,
  // and that route always reads the project back off disk (loadMockupProject) --
  // it has no way to see this in-memory, unsaved mutation. Re-fetching the iframe
  // src via renderMockupMatrix() alone therefore kept showing the last-SAVED colors,
  // even though the mutation above was real and correct. Other explicit
  // propagating actions in this file already establish the fix pattern (see
  // "Reset to Template" / asset-add handlers in main.js): persist first, then
  // refresh the matrix, so the server has the new data before it's re-rendered.
  await saveCurrentMockupProject();
  pushMockupHistory();
  setMockupDirty(false);
  // Other pages' Preview Page cells aren't touched by loadColumnIntoFabric
  // (that only reloads the currently-active editing canvas) -- refresh the
  // matrix grid too so the propagated color is visible everywhere at once.
  renderMockupMatrix();
  showToast("Color applied to all frames.", "success");
}

export function setCustomLayerName(column, layerId, name) {
  const style = getSelectedCellStyle() || column.style;
  if (!style) return;
  if (layerId === "title" && style.title) style.title.customName = name;
  else if (layerId === "subtitle" && style.subtitle) style.subtitle.customName = name;
  else if (layerId === "background" && style.background) style.background.customName = name;
  else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.assetLayers?.[idx]) style.assetLayers[idx].customName = name;
  } else if (layerId.startsWith("text:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.textLayers?.[idx]) style.textLayers[idx].customName = name;
  } else {
    const dev = resolveDeviceLayer(style, layerId);
    if (dev) dev.customName = name;
  }
}

export function toggleLayerVisibilityInModel(column, layerId) {
  const style = getSelectedCellStyle() || column.style;
  if (!style) return;
  if (layerId === "title" && style.title) style.title.visible = style.title.visible === false;
  else if (layerId === "subtitle" && style.subtitle) style.subtitle.visible = style.subtitle.visible === false;
  else if (layerId === "background" && style.background) style.background.visible = style.background.visible === false;
  else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.assetLayers?.[idx]) style.assetLayers[idx].visible = style.assetLayers[idx].visible === false;
  } else if (layerId.startsWith("text:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.textLayers?.[idx]) style.textLayers[idx].visible = style.textLayers[idx].visible === false;
  } else {
    const dev = resolveDeviceLayer(style, layerId);
    if (dev) dev.visible = dev.visible === false;
  }
}

export function toggleLayerLockInModel(column, layerId) {
  const style = getSelectedCellStyle() || column.style;
  if (!style) return;
  if (layerId === "title" && style.title) style.title.locked = !style.title.locked;
  else if (layerId === "subtitle" && style.subtitle) style.subtitle.locked = !style.subtitle.locked;
  else if (layerId === "background" && style.background) style.background.locked = !style.background.locked;
  else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.assetLayers?.[idx]) style.assetLayers[idx].locked = !style.assetLayers[idx].locked;
  } else if (layerId.startsWith("text:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.textLayers?.[idx]) style.textLayers[idx].locked = !style.textLayers[idx].locked;
  } else {
    const dev = resolveDeviceLayer(style, layerId);
    if (dev) dev.locked = !dev.locked;
  }
}

export function attachLayerDragAndDrop(container, column) {
  let draggedItem = null;
  container.querySelectorAll(".mk-layer-item").forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      draggedItem = item;
      item.style.opacity = "0.4";
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.dataset.layerId);
    });
    item.addEventListener("dragend", () => {
      if (draggedItem) draggedItem.style.opacity = "1";
      draggedItem = null;
      container.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach((el) => {
        el.classList.remove("drag-over-top", "drag-over-bottom");
      });
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!draggedItem || draggedItem === item) return;
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      item.classList.remove("drag-over-top", "drag-over-bottom");
      if (e.clientY < mid) item.classList.add("drag-over-top");
      else item.classList.add("drag-over-bottom");
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over-top", "drag-over-bottom");
    });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      const insertBefore = item.classList.contains("drag-over-top");
      item.classList.remove("drag-over-top", "drag-over-bottom");
      if (!draggedItem || draggedItem === item) return;
      reorderLayersInModel(column, draggedItem.dataset.layerId, item.dataset.layerId, insertBefore);
      setSelectedLayerId(draggedItem.dataset.layerId);
      setMockupDirty(true);
      renderMockupLayersPanel(column);
      loadColumnIntoFabric(column);
    });
  });
}

/** Moves `fromId` to just before/after `toId` in the actual stacking order
 *  (not a two-value zIndex swap, which ignored where in the list you
 *  actually dropped it and only ever affected the Layers panel's own sort
 *  anyway -- see loadColumnIntoFabric/render.ts, which now both really
 *  consult zIndex). Re-sequences EVERY layer's zIndex from the new order so
 *  there's exactly one source of truth (position in this list) instead of
 *  juggling two, and asset-to-asset drags go through the same path as every
 *  other layer type instead of a separate array-splice that rendering never
 *  actually read. */
export function reorderLayersInModel(column, fromId, toId, insertBefore) {
  const style = getSelectedCellStyle() || column.style;
  if (!style) return;
  // buildScreenLayersModel sorts by zIndex DESCENDING (front-most first) --
  // matches the Layers panel's top-to-bottom = front-to-back convention.
  const layers = buildScreenLayersModel(column);
  const fromIdx = layers.findIndex((l) => l.id === fromId);
  let toIdx = layers.findIndex((l) => l.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
  const [moved] = layers.splice(fromIdx, 1);
  toIdx = layers.findIndex((l) => l.id === toId); // index shifts after removal
  const insertAt = insertBefore ? toIdx : toIdx + 1;
  layers.splice(insertAt, 0, moved);
  // Re-sequence: top of list (front-most) gets the highest zIndex, descending.
  const n = layers.length;
  layers.forEach((layer, i) => setLayerZIndex(column, layer.id, (n - i) * 10));
}

export function setLayerZIndex(column, layerId, zIndex) {
  const style = getSelectedCellStyle() || column.style;
  if (!style) return;
  if (layerId === "title" && style.title) style.title.zIndex = zIndex;
  else if (layerId === "subtitle" && style.subtitle) style.subtitle.zIndex = zIndex;
  else if (layerId === "background" && style.background) style.background.zIndex = zIndex;
  else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.assetLayers?.[idx]) style.assetLayers[idx].zIndex = zIndex;
  } else if (layerId.startsWith("text:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.textLayers?.[idx]) style.textLayers[idx].zIndex = zIndex;
  } else {
    const dev = resolveDeviceLayer(style, layerId);
    if (dev) dev.zIndex = zIndex;
  }
}

export function populateBgValueSelect(type, selectedVal) {
  const select = document.getElementById("mk-bg-value");
  if (!select) return;
  let html = "";
  if (type === "gradient") {
    const gradients = [
      { id: "ocean", name: "Ocean Blue" },
      { id: "sunset", name: "Sunset Coral" },
      { id: "purple", name: "Deep Purple" },
      { id: "emerald", name: "Emerald Mint" },
      { id: "fire", name: "Fire Flame" },
      { id: "midnight", name: "Midnight Dark" },
      { id: "slate", name: "Slate Minimal" }
    ];
    html = gradients.map(g => `<option value="${g.id}">${g.name}</option>`).join("");
  } else if (type === "solid") {
    const solids = [
      { id: "#0f172a", name: "Slate 900 (Dark)" },
      { id: "#ffffff", name: "Pure White" },
      { id: "#111827", name: "Gray 900" },
      { id: "#1e1b4b", name: "Indigo 950" },
      { id: "#450a0a", name: "Red 950" },
      { id: "#064e3b", name: "Emerald 950" }
    ];
    html = solids.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  } else if (type === "pattern") {
    const patterns = [
      { id: "mesh", name: "Mesh Gradient" },
      { id: "neon-rings", name: "Neon Rings" },
      { id: "dots", name: "Subtle Dots" },
      { id: "grid", name: "Developer Grid" },
      { id: "waves", name: "Abstract Waves" }
    ];
    html = patterns.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  } else if (type === "image" || type === "panoramic") {
    html = `<option value="${selectedVal || ''}">${selectedVal ? 'Custom File: ' + selectedVal : 'No file selected (upload via project assets)'}</option>`;
  }
  select.innerHTML = html;
  if (selectedVal) select.value = selectedVal;
}

export function renderMkDecorations(decorations = []) {
  const container = document.getElementById("mk-decorations");
  if (!container) return;
  container.innerHTML = decorations.map((dec, idx) => `
    <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.4rem;">
      <input type="text" value="${escapeHtml(dec.text || '')}" data-dec-idx="${idx}" class="mk-dec-input" style="flex:1; font-size:0.8rem; padding:0.2rem 0.4rem;" placeholder="Sticker text" />
      <button class="small danger mk-dec-del" data-dec-idx="${idx}" type="button">×</button>
    </div>
  `).join("");

  container.querySelectorAll(".mk-dec-input").forEach(input => {
    input.oninput = () => {
      const idx = parseInt(input.dataset.decIdx, 10);
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (style?.decorations?.[idx]) {
        style.decorations[idx].text = input.value;
        setMockupDirty(true);
        loadColumnIntoFabric(selectedColumn);
      }
    };
  });
  container.querySelectorAll(".mk-dec-del").forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.decIdx, 10);
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (style?.decorations) {
        style.decorations.splice(idx, 1);
        setMockupDirty(true);
        renderMkDecorations(style.decorations);
        loadColumnIntoFabric(selectedColumn);
      }
    };
  });
}

export function renderMkAssetLayers(assetLayers = []) {
  const container = document.getElementById("mk-asset-layers-list");
  if (!container) return;
  container.innerHTML = assetLayers.map((ast, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:0.4rem 0.6rem; border-radius:6px; margin-bottom:0.4rem; font-size:0.8rem;">
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;" title="${escapeHtml(ast.file || ast.customName || '')}">${escapeHtml(ast.customName || ast.file || 'Asset ' + (idx+1))}</span>
      <button class="small danger mk-ast-del" data-ast-idx="${idx}" type="button">Remove</button>
    </div>
  `).join("");

  container.querySelectorAll(".mk-ast-del").forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.astIdx, 10);
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (style?.assetLayers) {
        style.assetLayers.splice(idx, 1);
        setMockupDirty(true);
        renderMkAssetLayers(style.assetLayers);
        loadColumnIntoFabric(selectedColumn);
      }
    };
  });
}

export function renderMkTextLayers(textLayers = []) {
  const container = document.getElementById("mk-text-layers-list");
  if (!container) return;
  container.innerHTML = textLayers.map((txt, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:0.4rem 0.6rem; border-radius:6px; margin-bottom:0.4rem; font-size:0.8rem;">
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;" title="${escapeHtml(txt.customName || txt.style?.text || '')}">${escapeHtml(txt.customName || txt.style?.text || 'Text ' + (idx + 1))}</span>
      <button class="small danger mk-txt-del" data-txt-idx="${idx}" type="button">Remove</button>
    </div>
  `).join("");

  container.querySelectorAll(".mk-txt-del").forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.txtIdx, 10);
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (style?.textLayers) {
        style.textLayers.splice(idx, 1);
        setMockupDirty(true);
        renderMkTextLayers(style.textLayers);
        renderMockupLayersPanel(selectedColumn);
        loadColumnIntoFabric(selectedColumn);
      }
    };
  });
}

/** Simple content/color/size/align editing for the currently selected
 *  free-form text layer -- deliberately NOT the TinyMCE rich-text editor
 *  used for title/subtitle (that would be over-building this); a plain
 *  textarea + basic font controls is sufficient per the task's own scope. */
function syncTextLayerEditFields(style, layerId) {
  const wrap = document.getElementById("mk-textlayer-edit");
  if (!wrap) return;
  const m = layerId && /^text:(\d+)$/.exec(layerId);
  const txt = m ? style.textLayers?.[Number(m[1])] : null;
  if (!txt) { wrap.style.display = "none"; return; }
  wrap.style.display = "block";
  const idx = Number(m[1]);

  const contentEl = document.getElementById("mk-textlayer-content");
  const colorEl = document.getElementById("mk-textlayer-color");
  const sizeEl = document.getElementById("mk-textlayer-size");
  const alignEl = document.getElementById("mk-textlayer-align");
  if (contentEl) contentEl.value = txt.style?.text || "";
  if (colorEl) colorEl.value = txt.style?.color || "#ffffff";
  if (sizeEl) sizeEl.value = txt.style?.size ?? 48;
  if (alignEl) alignEl.value = txt.style?.align || "center";

  const commit = (mutate) => {
    const s = getSelectedCellStyle() || selectedColumn?.style;
    const t = s?.textLayers?.[idx];
    if (!t) return;
    if (!t.style) t.style = {};
    mutate(t.style);
    setMockupDirty(true);
    renderMkTextLayers(s.textLayers);
    renderMockupLayersPanel(selectedColumn);
    loadColumnIntoFabric(selectedColumn);
  };
  if (contentEl) contentEl.oninput = () => commit((st) => { st.text = contentEl.value; });
  if (colorEl) colorEl.oninput = () => commit((st) => { st.color = colorEl.value; });
  if (sizeEl) sizeEl.oninput = () => commit((st) => { st.size = Number(sizeEl.value) || 48; });
  if (alignEl) alignEl.onchange = () => commit((st) => { st.align = alignEl.value; });
}

export function syncSection2Inputs(col, layerId) {
  if (!col) return;
  const style = getSelectedCellStyle() || col.style;
  if (!style) return;
  const lid = layerId || selectedLayerId;

  const layoutEl = document.getElementById("mk-layout");
  if (layoutEl && style.layout) layoutEl.value = style.layout;

  const titleEl = document.getElementById("mk-title");
  if (titleEl && style.title) titleEl.value = style.title.text || "";

  const titleColorEl = document.getElementById("mk-title-color");
  if (titleColorEl && style.title) titleColorEl.value = style.title.color || "#ffffff";

  const subtitleEl = document.getElementById("mk-subtitle");
  if (subtitleEl && style.subtitle) subtitleEl.value = style.subtitle.text || "";

  const bgTypeEl = document.getElementById("mk-bg-type");
  if (bgTypeEl && style.background) {
    bgTypeEl.value = style.background.type || "gradient";
    populateBgValueSelect(style.background.type || "gradient", style.background.value);
  }

  // Device Geometry panel edits whichever device layer is actually selected
  // (deviceOne/deviceTwo/extra:N), not always deviceOne -- falls back to
  // deviceOne when the selection isn't a device (e.g. Text tab active).
  const activeDevice = resolveDeviceLayer(style, lid) || style.deviceOne;

  const sourceEl = document.getElementById("mk-source");
  if (sourceEl && activeDevice) {
    populateSourceSelect(sourceEl, mockupProject?.sources || [], activeDevice.sourceId);
  }
  updateSourceDimsReadout(mockupProject?.sources || [], activeDevice?.sourceId);

  const d1SizeEl = document.getElementById("mk-d1-size");
  const d1SizeValEl = document.getElementById("mk-d1-size-val");
  if (d1SizeEl && d1SizeValEl && activeDevice) {
    d1SizeEl.value = activeDevice.size ?? 90;
    d1SizeValEl.textContent = activeDevice.size ?? 90;
  }

  const d1BrightnessEl = document.getElementById("mk-d1-brightness");
  const d1BrightnessValEl = document.getElementById("mk-d1-brightness-val");
  if (d1BrightnessEl && d1BrightnessValEl && activeDevice) {
    d1BrightnessEl.value = activeDevice.brightness ?? 100;
    d1BrightnessValEl.textContent = activeDevice.brightness ?? 100;
  }

  const d1FramelessEl = document.getElementById("mk-d1-frameless");
  if (d1FramelessEl && activeDevice) {
    d1FramelessEl.checked = !!activeDevice.frameless;
  }

  // Corner Radius control (rounds the screenshot's own corners in frameless
  // mode, since there's no device bezel to clip to) -- only ever shown while
  // Frameless is checked, mirroring the mk-d1-camera-row gating pattern above.
  const d1FramelessRadiusRowEl = document.getElementById("mk-d1-frameless-radius-row");
  const d1FramelessRadiusEl = document.getElementById("mk-d1-frameless-radius");
  const d1FramelessRadiusValEl = document.getElementById("mk-d1-frameless-radius-val");
  if (d1FramelessRadiusRowEl) {
    d1FramelessRadiusRowEl.style.display = activeDevice?.frameless ? "" : "none";
  }
  if (d1FramelessRadiusEl && d1FramelessRadiusValEl && activeDevice) {
    d1FramelessRadiusEl.value = activeDevice.framelessCornerRadius ?? 0;
    d1FramelessRadiusValEl.textContent = activeDevice.framelessCornerRadius ?? 0;
  }

  const d1CameraEnabledEl = document.getElementById("mk-d1-camera-enabled");
  const d1CameraRowEl = document.getElementById("mk-d1-camera-row");
  if (d1CameraEnabledEl && activeDevice) {
    d1CameraEnabledEl.checked = activeDevice.cameraEnabled !== false;
    // Only offer the toggle when the project's active device row actually
    // has a camera cutout to show/hide (mirrors buildDeviceGroup's gating).
    const activeDeviceRow = mockupProject?.devices?.[0];
    const frame = resolveDeviceFrame(activeDeviceRow?.deviceId || "phone", mockupDevicesCatalog);
    if (d1CameraRowEl) d1CameraRowEl.style.display = frame && frame.cutout && frame.cutout !== "none" ? "" : "none";
  }

  // Falls back to the real device's catalog default (frame.accent/frame.body,
  // the same source buildDeviceGroup() in canvas.js and buildFrameSvg() on the
  // server use) instead of a generic hardcoded slate color, so the picker
  // shows what the device will actually render with when no per-layer
  // override has been set.
  const activeDeviceRowForColor = mockupProject?.devices?.[0];
  const colorFrame = resolveDeviceFrame(activeDeviceRowForColor?.deviceId || "phone", mockupDevicesCatalog);

  // Border/Bezel Thickness sliders -- undefined means "use the device's own
  // catalog bezelWidth"/real screenInset, so the readout falls back to that
  // real per-device default (like the color pickers above) rather than
  // always showing 0.
  const d1BorderThicknessEl = document.getElementById("mk-d1-border-thickness");
  const d1BorderThicknessValEl = document.getElementById("mk-d1-border-thickness-val");
  if (d1BorderThicknessEl && d1BorderThicknessValEl && activeDevice) {
    const val = activeDevice.borderThickness ?? colorFrame?.bezelWidth ?? 0;
    d1BorderThicknessEl.value = val;
    d1BorderThicknessValEl.textContent = val;
  }
  const d1BezelThicknessEl = document.getElementById("mk-d1-bezel-thickness");
  const d1BezelThicknessValEl = document.getElementById("mk-d1-bezel-thickness-val");
  if (d1BezelThicknessEl && d1BezelThicknessValEl && activeDevice) {
    // Absolute bezel width; unset = the device's native bezel (derived from
    // its real screenInset by the same helper canvas + server render use).
    const g = resolveDeviceGeometry(activeDeviceRowForColor?.deviceId || "phone", mockupDevicesCatalog, activeDeviceRowForColor?.variantId);
    const nativeBezel = resolveDeviceFrameGeometry({ width: g.width, height: g.height, cornerRadius: g.cornerRadius, screenInset: g.screenInset, catalogBorderWidth: colorFrame?.bezelWidth ?? 0 }).nativeBezelThickness;
    const val = activeDevice.bezelThickness ?? nativeBezel;
    d1BezelThicknessEl.value = val;
    d1BezelThicknessValEl.textContent = val;
  }

  const d1BorderColorEl = document.getElementById("mk-d1-border-color");
  if (d1BorderColorEl && activeDevice) {
    d1BorderColorEl.value = activeDevice.borderColor || colorFrame?.accent || "#334155";
  }

  const d1BezelColorEl = document.getElementById("mk-d1-bezel-color");
  if (d1BezelColorEl && activeDevice) {
    d1BezelColorEl.value = activeDevice.bezelColor || colorFrame?.body || "#1e293b";
  }

  renderMkDecorations(style.decorations || []);
  renderMkAssetLayers(style.assetLayers || []);
  renderMkTextLayers(style.textLayers || []);
  syncTextLayerEditFields(style, lid);
  syncTransformPanelInputs(style, lid);

  const badge = document.getElementById("mockup-active-layer-badge");
  if (badge) {
    const m = lid && /^extra:(\d+)$/.exec(lid);
    badge.textContent = lid === "title" ? "Title Text" : lid === "subtitle" ? "Subtitle Text" : lid === "deviceOne" ? "Device Frame 1" : lid === "deviceTwo" ? "Device Frame 2" : m ? `Device Frame ${Number(m[1]) + 3}` : lid?.startsWith("asset:") ? "Asset Layer" : lid?.startsWith("text:") ? "Text Layer" : lid === "background" ? "Background" : "Page";
  }

  syncTextToolbar(style, lid);
}

/** Explicit switch back to the object-tools group, for when the selection is
 *  cleared entirely (clicking empty canvas) -- syncSection2Inputs(col, null)
 *  can't be used for this, since it falls back to the module's own
 *  `selectedLayerId` (the stale PREVIOUS selection) whenever its layerId
 *  argument is falsy. The outer toolbar bar itself is never hidden -- only
 *  which inner group is visible changes, per the "always visible, only swap
 *  controls" requirement. */
export function hideTextToolbar() {
  console.log("[TOOLBAR-TRACE] hideTextToolbar called from:", new Error().stack);
  showObjectToolbarGroup();
  if (mceEditor) mceEditor.getBody().contentEditable = "false";
  syncObjectToolbar(null, null);
}

function showTextToolbarGroup() {
  console.log("[TOOLBAR-TRACE] showTextToolbarGroup called");
  const textGroup = document.getElementById("mk-tinymce-toolbar-host");
  const objGroup = document.getElementById("mk-object-toolbar");
  if (textGroup) textGroup.style.display = "flex";
  if (objGroup) objGroup.style.display = "none";
}

function showObjectToolbarGroup() {
  console.log("[TOOLBAR-TRACE] showObjectToolbarGroup called from:", new Error().stack);
  const textGroup = document.getElementById("mk-tinymce-toolbar-host");
  const objGroup = document.getElementById("mk-object-toolbar");
  if (textGroup) textGroup.style.display = "none";
  if (objGroup) objGroup.style.display = "flex";
}

// render.ts's textBlock()/canvas.js's copyAlign both apply ONE shared
// text-align to the whole title+subtitle "copy" block, always read from
// style.title.align specifically (subtitle.align is never read for
// alignment) -- so alignment commands must always write there too,
// regardless of whether title or subtitle is the one currently selected, or
// picking an align while subtitle is selected would visibly do nothing in
// the real export/preview despite appearing to work in a naive read of
// "whichever text is selected".
const TEXT_ALIGN_FIELD_OWNER = "title";

let mceEditor = null;
let mceReady = null; // Promise, resolves once TinyMCE has initialized
let mceSuppressSync = false; // true while we're writing model->editor, so the
                              // resulting input/NodeChange events don't loop back

function currentTextStyle() {
  const style = getSelectedCellStyle() || selectedColumn?.style;
  if (!style) return null;
  if (selectedLayerId === "title") return style.title;
  if (selectedLayerId === "subtitle") return style.subtitle;
  return null;
}

/** One-time TinyMCE bootstrap: an inline editor bound to the off-screen
 *  #mk-tinymce-target, with its real toolbar (standard icons, not custom
 *  buttons) rendered into #mk-tinymce-toolbar-host, which sits flush above
 *  the canvas viewport. TinyMCE's own contenteditable surface is never
 *  shown to the user -- it exists only so TinyMCE's format commands
 *  (bold/align/font/color/lists/...) have somewhere to apply, and every
 *  resulting format/content change is immediately read back and written
 *  into whichever title/subtitle TextStyle is currently selected, which is
 *  what the Fabric canvas and server-side export actually render from. */
export function setupTextToolbarEvents() {
  if (!window.tinymce || mceReady) return;
  mceReady = new Promise((resolve) => {
    window.tinymce.init({
      target: document.getElementById("mk-tinymce-target"),
      license_key: "gpl",
      inline: true,
      toolbar_persist: true,
      menubar: false,
      statusbar: false,
      branding: false,
      fixed_toolbar_container: "#mk-tinymce-toolbar-host",
      toolbar_mode: "wrap",
      toolbar:
        "bold italic underline strikethrough | forecolor backcolor | " +
        "alignleft aligncenter alignright alignjustify | fontfamily fontsizeinput | " +
        "lineheight | bullist numlist outdent indent | removeformat | undo redo",
      font_family_formats:
        "Segoe UI='Segoe UI',Roboto,sans-serif; Arial=Arial,sans-serif; Helvetica='Helvetica Neue',Helvetica,sans-serif; " +
        "Georgia=Georgia,serif; Times New Roman='Times New Roman',Times,serif; Courier New='Courier New',Courier,monospace; " +
        "Verdana=Verdana,sans-serif; Trebuchet MS='Trebuchet MS',sans-serif",
      font_size_input_default_unit: "px",
      setup(editor) {
        mceEditor = editor;
        editor.on("init", () => resolve(editor));
        editor.on("focus", () => console.log("[TOOLBAR-TRACE] TinyMCE focus"));
        editor.on("blur", () => console.log("[TOOLBAR-TRACE] TinyMCE blur"));
        // Any of these fire for both content edits (typing) and format
        // toolbar clicks (bold/align/font/...) -- one handler covers every
        // control TinyMCE provides instead of one listener per button.
        editor.on("Input NodeChange ExecCommand", () => syncEditorToModel());
      },
    });
  });
}

let mceRebuildTimer = null;
let mceHistoryPending = false;

/** Reads TinyMCE's current content + computed formatting and writes it into
 *  whichever text layer (title/subtitle) is currently selected -- never any
 *  other layer, since it always resolves the target fresh via
 *  currentTextStyle(), and no-ops entirely if nothing text-shaped is
 *  selected or if the change originated from our own model->editor sync.
 *  NodeChange fires on every caret move/click, not just real edits, and
 *  Input fires once per keystroke -- rebuilding the whole Fabric canvas
 *  (loadColumnIntoFabric tears down and recreates every object) on each of
 *  those was the cause of the canvas visibly flickering while typing.
 *  Fixed by (a) skipping the rebuild entirely when nothing in the model
 *  actually changed, and (b) debouncing the rebuild+history-push that does
 *  happen so a burst of keystrokes collapses into one. */
function syncEditorToModel() {
  if (mceSuppressSync || !mceEditor) return;
  const t = currentTextStyle();
  if (!t) return;
  const body = mceEditor.getBody();
  const before = JSON.stringify(t);

  const text = mceEditor.getContent({ format: "text" }).replace(/\r\n/g, "\n");
  if (text !== (t.text || "")) t.text = text;

  // Formatting commands (bold/italic/font/color/...) wrap the selection in
  // a NEW nested element (<strong>, <em>, a span with inline style, ...)
  // rather than restyling the outer div in place -- reading computed style
  // off `body` (or even the outer div) would miss every toggle, since that
  // element's OWN style never changes, only its descendants'. The
  // selection's actual node (innermost element wrapping the selected text)
  // is what the cascade has really been applied to, so read from there.
  const cs = window.getComputedStyle(mceEditor.selection.getNode() || body);
  const weight = parseInt(cs.fontWeight, 10) || 400;
  t.fontWeightNum = weight;
  t.bold = weight >= 600;
  t.italic = cs.fontStyle === "italic";
  t.underline = mceEditor.formatter.match("underline");
  t.strikethrough = mceEditor.formatter.match("strikethrough");
  t.fontFamily = cs.fontFamily || t.fontFamily;
  const size = parseInt(cs.fontSize, 10);
  if (size) t.size = size;
  const color = rgbToHex(cs.color);
  if (color) t.color = color;
  const bg = rgbToHex(cs.backgroundColor);
  t.highlightColor = bg || undefined;
  const lh = parseFloat(cs.lineHeight);
  if (lh && size) t.lineHeightMultiplier = Math.round((lh / size) * 100) / 100;
  const ls = parseFloat(cs.letterSpacing);
  if (!Number.isNaN(ls)) t.charSpacing = Math.round(ls * 62.5); // px -> Fabric's 1/1000-em units at this font size

  const style = getSelectedCellStyle() || selectedColumn?.style;
  const align = ["left", "center", "right", "justify"].find((a) => mceEditor.formatter.match(`align${a}`));
  if (align && style?.[TEXT_ALIGN_FIELD_OWNER]) style[TEXT_ALIGN_FIELD_OWNER].align = align;

  // NodeChange fires constantly just from moving the caret around with no
  // actual formatting/content change -- comparing before/after skips the
  // (expensive) rebuild for those entirely, not just delaying it.
  if (JSON.stringify(t) === before) return;

  setMockupDirty(true);
  mceHistoryPending = true;
  clearTimeout(mceRebuildTimer);
  mceRebuildTimer = setTimeout(() => {
    loadColumnIntoFabric(selectedColumn);
    if (mceHistoryPending) { pushMockupHistory(); mceHistoryPending = false; }
  }, 200);
}

/** Shows/hides the toolbar and loads the currently selected text layer's
 *  content + formatting into TinyMCE's editing surface, so its toolbar
 *  (bold/italic/align/... button active-states, font-family/size fields)
 *  reflects that layer, and further edits apply to it. Called every time
 *  the selection changes (piggybacks on syncSection2Inputs, already wired
 *  to every selection event). */
function syncTextToolbar(style, layerId) {
  const toolbar = document.getElementById("mockup-text-toolbar");
  if (!toolbar) return;
  const targetLayerId = (layerId === "title" || layerId === "subtitle")
    ? layerId
    : (layerId && layerId !== "title" && layerId !== "subtitle")
    ? layerId
    : selectedLayerId;
  const isTextLayer = targetLayerId === "title" || targetLayerId === "subtitle";
  const textStyle = targetLayerId === "title" ? style?.title : targetLayerId === "subtitle" ? style?.subtitle : null;

  if (!isTextLayer || !textStyle) {
    showObjectToolbarGroup();
    if (mceEditor) mceEditor.getBody().contentEditable = "false";
    syncObjectToolbar(style, layerId);
    return;
  }
  showTextToolbarGroup();
  if (!mceReady) setupTextToolbarEvents();
  mceReady?.then((editor) => {
    editor.getBody().contentEditable = "true";
    mceSuppressSync = true;
    const weight = textStyle.fontWeightNum ?? (targetLayerId === "title" ? (textStyle.bold === false ? 400 : 700) : (textStyle.bold ? 700 : 400));
    const align = (style[TEXT_ALIGN_FIELD_OWNER]?.align) || "center";
    const cssParts = [
      `font-weight:${weight}`,
      `font-style:${textStyle.italic ? "italic" : "normal"}`,
      `text-decoration:${[textStyle.underline && "underline", textStyle.strikethrough && "line-through"].filter(Boolean).join(" ") || "none"}`,
      // Multi-word family names (Segoe UI, Times New Roman, ...) MUST be
      // quoted in a style attribute -- an unquoted "font-family: Segoe UI, ..."
      // is invalid CSS, so the browser silently drops the whole declaration
      // and the div falls back to TinyMCE's inherited skin font. The
      // write-back path then reads that inherited font via
      // getComputedStyle and stores it as if the user had chosen it,
      // corrupting fontFamily on every sync cycle -- quoting each family
      // name (already done correctly in font_family_formats above) avoids
      // that entirely.
      `font-family:${quoteFontFamily(textStyle.fontFamily || "Segoe UI, Roboto, sans-serif")}`,
      `font-size:${Math.round(textStyle.size ?? (targetLayerId === "title" ? 58 : 36))}px`,
      `color:${textStyle.color || "#ffffff"}`,
      `line-height:${textStyle.lineHeightMultiplier ?? 1.15}`,
      `letter-spacing:${((textStyle.charSpacing || 0) / 1000) * (textStyle.size ?? 40)}px`,
      `text-align:${align}`,
      textStyle.highlightColor ? `background-color:${textStyle.highlightColor}` : "",
    ].filter(Boolean).join(";");
    editor.setContent(`<div style="${cssParts}">${escapeHtml(textStyle.text || "")}</div>`);
    editor.selection.select(editor.getBody(), true);
    mceSuppressSync = false;
  });
}

/** Populates the icon-only object toolbar's rotation/opacity readouts and
 *  enables/disables its buttons based on whether anything is actually
 *  selected. Every button in this group is wired once (setupObjectToolbarEvents,
 *  called at bootstrap) to just click/dispatch on the identical Transform-panel
 *  control in the right sidebar -- so this function only needs to mirror
 *  displayed values, never duplicate any actual mutation logic. */
export function alignSelectedObject(type) {
  if (!selectedColumn || !selectedLayerId) return;
  const canvas = mockupFabricCanvas;
  let activeObj = canvas?.getActiveObject();
  if (!activeObj || activeObj.layerId !== selectedLayerId) {
    activeObj = canvas?.getObjects().find((o) => o.layerId === selectedLayerId);
  }

  const ARTBOARD_W = 1080;

  if (activeObj) {
    const bbox = activeObj.getBoundingRect(true, true);
    let dx = 0;
    let dy = 0;

    switch (type) {
      case "left":
        dx = 0 - bbox.left;
        break;
      case "center":
      case "center-x":
        dx = (ARTBOARD_W - bbox.width) / 2 - bbox.left;
        break;
      case "right":
        dx = (ARTBOARD_W - bbox.width) - bbox.left;
        break;
      case "top":
        dy = 0 - bbox.top;
        break;
      case "middle":
      case "middle-y":
        dy = (ARTBOARD_H - bbox.height) / 2 - bbox.top;
        break;
      case "bottom":
        dy = (ARTBOARD_H - bbox.height) - bbox.top;
        break;
    }

    activeObj.set({ left: activeObj.left + dx, top: activeObj.top + dy });
    activeObj.setCoords();
    canvas.requestRenderAll();
    syncFabricObjectToModel(activeObj);
    setMockupDirty(true);
    syncSection2Inputs(selectedColumn, selectedLayerId);
    return;
  }

  const style = getSelectedCellStyle() || selectedColumn.style;
  const box = getLayerBox(style, selectedLayerId);
  if (!style || !box) return;

  switch (type) {
    case "left": box.x = 0; break;
    case "center": case "center-x": box.x = (ARTBOARD_W - box.width) / 2; break;
    case "right": box.x = ARTBOARD_W - box.width; break;
    case "top": box.y = 0; break;
    case "middle": case "middle-y": box.y = (ARTBOARD_H - box.height) / 2; break;
    case "bottom": box.y = ARTBOARD_H - box.height; break;
  }
  setLayerBox(style, selectedLayerId, box);
  setMockupDirty(true);
  loadColumnIntoFabric(selectedColumn);
  syncSection2Inputs(selectedColumn, selectedLayerId);
}

export function rotateSelectedObject(targetAngle, isDelta = false) {
  if (!selectedColumn || !selectedLayerId) return;
  const canvas = mockupFabricCanvas;
  let activeObj = canvas?.getActiveObject();
  if (!activeObj || activeObj.layerId !== selectedLayerId) {
    activeObj = canvas?.getObjects().find((o) => o.layerId === selectedLayerId);
  }

  const currentAngle = activeObj ? (activeObj.angle || 0) : (getLayerBox(getSelectedCellStyle() || selectedColumn.style, selectedLayerId)?.rotation || 0);
  let newAngle = isDelta ? currentAngle + targetAngle : targetAngle;
  newAngle = Math.round(((newAngle % 360) + 360) % 360);
  if (newAngle > 180) newAngle -= 360;

  if (activeObj) {
    activeObj.set({ angle: newAngle });
    activeObj.setCoords();
    canvas.requestRenderAll();
    syncFabricObjectToModel(activeObj);
  } else {
    const style = getSelectedCellStyle() || selectedColumn.style;
    const box = getLayerBox(style, selectedLayerId);
    if (box) {
      box.rotation = newAngle;
      setLayerBox(style, selectedLayerId, box);
      loadColumnIntoFabric(selectedColumn);
    }
  }

  setMockupDirty(true);
  syncSection2Inputs(selectedColumn, selectedLayerId);
}

export function flipSelectedObject(direction) {
  if (!selectedColumn || !selectedLayerId) return;
  const canvas = mockupFabricCanvas;
  let activeObj = canvas?.getActiveObject();
  if (!activeObj || activeObj.layerId !== selectedLayerId) {
    activeObj = canvas?.getObjects().find((o) => o.layerId === selectedLayerId);
  }

  if (activeObj) {
    if (direction === "horizontal" || direction === "h") {
      activeObj.set("flipX", !activeObj.flipX);
    } else if (direction === "vertical" || direction === "v") {
      activeObj.set("flipY", !activeObj.flipY);
    }
    activeObj.setCoords();
    canvas.requestRenderAll();
    syncFabricObjectToModel(activeObj);
  } else {
    const style = getSelectedCellStyle() || selectedColumn.style;
    const box = getLayerBox(style, selectedLayerId);
    if (box) {
      if (direction === "horizontal" || direction === "h") box.flipH = !box.flipH;
      if (direction === "vertical" || direction === "v") box.flipV = !box.flipV;
      setLayerBox(style, selectedLayerId, box);
      loadColumnIntoFabric(selectedColumn);
    }
  }

  setMockupDirty(true);
  syncSection2Inputs(selectedColumn, selectedLayerId);
}

export function handleOpacityInput(pctVal) {
  const pct = Math.max(0, Math.min(100, Number(pctVal) || 0));
  const alpha = pct / 100;

  const canvas = mockupFabricCanvas;
  let activeObj = canvas?.getActiveObject();
  if (!activeObj || activeObj.layerId !== selectedLayerId) {
    activeObj = canvas?.getObjects().find((o) => o.layerId === selectedLayerId);
  }
  if (activeObj) {
    activeObj.set({ opacity: alpha });
    canvas.requestRenderAll();
  }

  const objSlider = document.getElementById("mk-obj-opacity-slider");
  if (objSlider && document.activeElement !== objSlider) objSlider.value = pct;
  const posSlider = document.getElementById("mk-pos-opacity-slider");
  if (posSlider && document.activeElement !== posSlider) posSlider.value = pct;

  const objVal = document.getElementById("mk-obj-opacity-val");
  if (objVal) objVal.textContent = `${pct}%`;
  const posInput = document.getElementById("mk-pos-opacity");
  if (posInput && document.activeElement !== posInput) posInput.value = pct;
}

export function commitOpacityChange(pctVal) {
  const pct = Math.max(0, Math.min(100, Number(pctVal) || 0));
  const alpha = pct / 100;
  handleOpacityInput(pct);

  if (!selectedColumn || !selectedLayerId) return;
  const style = getSelectedCellStyle() || selectedColumn.style;
  const box = getLayerBox(style, selectedLayerId);
  if (box) {
    box.opacity = alpha;
    setLayerBox(style, selectedLayerId, box);
    if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
    setMockupDirty(true);
  }
}

function syncObjectToolbar(style, layerId) {
  const hasSelection = !!layerId;
  const box = hasSelection ? getLayerBox(style, layerId) : null;
  const rot = document.getElementById("mk-obj-rotation");
  if (rot && document.activeElement !== rot) rot.value = box ? normalizeRotationDeg(box.rotation ?? 0) : "";

  const pct = box ? Math.round((box.opacity ?? 1) * 100) : 100;
  const objSlider = document.getElementById("mk-obj-opacity-slider");
  if (objSlider && document.activeElement !== objSlider) objSlider.value = pct;
  const objVal = document.getElementById("mk-obj-opacity-val");
  if (objVal) objVal.textContent = `${pct}%`;

  const flipHBtn = document.getElementById("mk-obj-flip-h");
  const flipVBtn = document.getElementById("mk-obj-flip-v");
  if (flipHBtn) flipHBtn.classList.toggle("is-active", !!box?.flipH);
  if (flipVBtn) flipVBtn.classList.toggle("is-active", !!box?.flipV);

  // Device Frame 1 / device layer color controls in the toolbar
  const isDeviceLayer = layerId && (layerId === "deviceOne" || layerId === "deviceTwo" || layerId.startsWith("extra:"));
  const devColorsGroup = document.getElementById("mk-obj-dev-colors-group");
  if (devColorsGroup) {
    devColorsGroup.style.display = isDeviceLayer ? "flex" : "none";
    if (isDeviceLayer) {
      const dev = resolveDeviceLayer(style, layerId) || style?.deviceOne;
      const rimPicker = document.getElementById("mk-obj-dev-border-color");
      const bezelPicker = document.getElementById("mk-obj-dev-bezel-color");
      if (rimPicker && document.activeElement !== rimPicker) {
        rimPicker.value = dev?.borderColor || "#334155";
      }
      if (bezelPicker && document.activeElement !== bezelPicker) {
        bezelPicker.value = dev?.bezelColor || "#1e293b";
      }
    }
  }

  ["mk-obj-bring-front", "mk-obj-bring-fwd", "mk-obj-send-bwd", "mk-obj-send-back",
   "mk-obj-align-left", "mk-obj-align-center", "mk-obj-align-right",
   "mk-obj-align-top", "mk-obj-align-middle", "mk-obj-align-bottom",
   "mk-obj-flip-h", "mk-obj-flip-v", "mk-obj-rotate-btn", "mk-obj-rotation",
   "mk-obj-opacity-slider", "mk-obj-opacity-btn", "mk-obj-duplicate", "mk-obj-delete"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !hasSelection;
  });
}

export function setupObjectToolbarEvents() {
  const objBringFront = document.getElementById("mk-obj-bring-front");
  if (objBringFront) objBringFront.onclick = () => moveSelectedLayerOrder("front");
  const objBringFwd = document.getElementById("mk-obj-bring-fwd");
  if (objBringFwd) objBringFwd.onclick = () => moveSelectedLayerOrder("forward");
  const objSendBwd = document.getElementById("mk-obj-send-bwd");
  if (objSendBwd) objSendBwd.onclick = () => moveSelectedLayerOrder("backward");
  const objSendBack = document.getElementById("mk-obj-send-back");
  if (objSendBack) objSendBack.onclick = () => moveSelectedLayerOrder("back");

  const wireAlign = (fromId, type) => {
    const btn = document.getElementById(fromId);
    if (btn) btn.onclick = () => alignSelectedObject(type);
  };
  wireAlign("mk-obj-align-left", "left");
  wireAlign("mk-obj-align-center", "center-x");
  wireAlign("mk-obj-align-right", "right");
  wireAlign("mk-obj-align-top", "top");
  wireAlign("mk-obj-align-middle", "middle-y");
  wireAlign("mk-obj-align-bottom", "bottom");

  const flipHBtn = document.getElementById("mk-obj-flip-h");
  if (flipHBtn) flipHBtn.onclick = () => flipSelectedObject("horizontal");
  const flipVBtn = document.getElementById("mk-obj-flip-v");
  if (flipVBtn) flipVBtn.onclick = () => flipSelectedObject("vertical");

  const dupBtn = document.getElementById("mk-obj-duplicate");
  if (dupBtn) dupBtn.onclick = () => duplicateSelectedLayer();
  const delBtn = document.getElementById("mk-obj-delete");
  if (delBtn) delBtn.onclick = () => deleteSelectedLayer();

  const rotBtn = document.getElementById("mk-obj-rotate-btn");
  if (rotBtn) {
    rotBtn.onclick = () => {
      const inputVal = Number(document.getElementById("mk-obj-rotation")?.value);
      if (!Number.isNaN(inputVal) && inputVal !== 0) {
        rotateSelectedObject(inputVal, false);
      } else {
        rotateSelectedObject(90, true);
      }
    };
  }

  const rotInput = document.getElementById("mk-obj-rotation");
  if (rotInput) {
    const applyRot = () => rotateSelectedObject(Number(rotInput.value) || 0, false);
    rotInput.onchange = applyRot;
    rotInput.onkeydown = (e) => { if (e.key === "Enter") applyRot(); };
  }

  const opSlider = document.getElementById("mk-obj-opacity-slider");
  if (opSlider) {
    opSlider.oninput = () => handleOpacityInput(opSlider.value);
    opSlider.onchange = () => commitOpacityChange(opSlider.value);
  }
  const opBtn = document.getElementById("mk-obj-opacity-btn");
  if (opBtn) opBtn.onclick = () => opSlider?.focus();

  // Device color controls in toolbar
  const tbRimPicker = document.getElementById("mk-obj-dev-border-color");
  if (tbRimPicker) {
    tbRimPicker.oninput = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      const dev = style && (resolveDeviceLayer(style, selectedLayerId) || style.deviceOne);
      if (!dev) return;
      dev.borderColor = tbRimPicker.value;
      const sideInput = document.getElementById("mk-d1-border-color");
      if (sideInput) sideInput.value = tbRimPicker.value;
      if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  const tbBezelPicker = document.getElementById("mk-obj-dev-bezel-color");
  if (tbBezelPicker) {
    tbBezelPicker.oninput = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      const dev = style && (resolveDeviceLayer(style, selectedLayerId) || style.deviceOne);
      if (!dev) return;
      dev.bezelColor = tbBezelPicker.value;
      const sideInput = document.getElementById("mk-d1-bezel-color");
      if (sideInput) sideInput.value = tbBezelPicker.value;
      if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  syncObjectToolbar(null, null);
}

function quoteFontFamily(stack) {
  return stack
    .split(",")
    .map((name) => {
      const trimmed = name.trim().replace(/^['"]|['"]$/g, "");
      return /\s/.test(trimmed) ? `'${trimmed}'` : trimmed;
    })
    .join(", ");
}

function rgbToHex(rgb) {
  // A transparent/unset background computes to "rgba(0, 0, 0, 0)" (alpha 0)
  // -- matching only r/g/b and ignoring alpha turned "no background at all"
  // into literal black on every read, which is what made merely SELECTING
  // a title/subtitle (selection alone triggers a NodeChange readback, see
  // syncEditorToModel) silently paint a black highlight nobody asked for.
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(rgb || "");
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  if (alpha === 0) return null;
  return "#" + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("");
}

export function setupInspectorEvents() {
  // Tab switching inside inspector Section 1
  ["col", "dev", "text", "asset"].forEach((t) => {
    const btn = document.getElementById(`mk-tab-${t}`);
    if (btn) btn.onclick = () => switchInspectorTab(t);
  });
  ["layers", "objects", "transform"].forEach((t) => {
    const btn = document.getElementById(`mk-tab-${t}`);
    if (btn) btn.onclick = () => switchInspectorTab(t);
  });

  // Layout preset change
  const layoutEl = document.getElementById("mk-layout");
  if (layoutEl) {
    layoutEl.onchange = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (!style) return;
      style.layout = layoutEl.value;
      setMockupDirty(true);
      renderMockupMatrix();
      loadColumnIntoFabric(selectedColumn);
    };
  }

  // Background type change
  const bgTypeEl = document.getElementById("mk-bg-type");
  const bgValEl = document.getElementById("mk-bg-value");
  if (bgTypeEl) {
    bgTypeEl.onchange = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (!style) return;
      if (!style.background) style.background = { type: 'gradient', value: 'ocean' };
      style.background.type = bgTypeEl.value;
      populateBgValueSelect(bgTypeEl.value, style.background.value);
      setMockupDirty(true);
      renderMockupMatrix();
      loadColumnIntoFabric(selectedColumn);
    };
  }
  if (bgValEl) {
    bgValEl.onchange = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (!style) return;
      if (!style.background) style.background = { type: 'gradient', value: 'ocean' };
      style.background.value = bgValEl.value;
      setMockupDirty(true);
      renderMockupMatrix();
      loadColumnIntoFabric(selectedColumn);
    };
  }

  // Title inputs
  const titleEl = document.getElementById("mk-title");
  if (titleEl) {
    titleEl.oninput = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (!style?.title) return;
      style.title.text = titleEl.value;
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
      renderMockupMatrix();
    };
  }

  const titleColorEl = document.getElementById("mk-title-color");
  if (titleColorEl) {
    titleColorEl.oninput = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (!style?.title) return;
      style.title.color = titleColorEl.value;
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  // Subtitle input
  const subEl = document.getElementById("mk-subtitle");
  if (subEl) {
    subEl.oninput = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (!style?.subtitle) return;
      style.subtitle.text = subEl.value;
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  // Screenshot source mapping -- which uploaded source this device shows.
  const sourceSelectEl = document.getElementById("mk-source");
  if (sourceSelectEl) {
    sourceSelectEl.onchange = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      const dev = style && (resolveDeviceLayer(style, selectedLayerId) || style.deviceOne);
      if (!dev) return;
      dev.sourceId = sourceSelectEl.value || undefined;
      updateSourceDimsReadout(mockupProject?.sources || [], dev.sourceId);
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  // Device geometry sliders -- edit whichever device layer is selected
  // (deviceOne/deviceTwo/extra:N), falling back to deviceOne otherwise.
  const d1Size = document.getElementById("mk-d1-size");
  const d1SizeVal = document.getElementById("mk-d1-size-val");
  if (d1Size) {
    d1Size.oninput = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      const dev = style && (resolveDeviceLayer(style, selectedLayerId) || style.deviceOne);
      if (!dev) return;
      dev.size = parseInt(d1Size.value, 10);
      if (d1SizeVal) d1SizeVal.textContent = d1Size.value;
      if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  const d1Brightness = document.getElementById("mk-d1-brightness");
  const d1BrightnessVal = document.getElementById("mk-d1-brightness-val");
  if (d1Brightness) {
    d1Brightness.oninput = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      const dev = style && (resolveDeviceLayer(style, selectedLayerId) || style.deviceOne);
      if (!dev) return;
      dev.brightness = parseInt(d1Brightness.value, 10);
      if (d1BrightnessVal) d1BrightnessVal.textContent = d1Brightness.value;
      if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  const d1Frameless = document.getElementById("mk-d1-frameless");
  if (d1Frameless) {
    d1Frameless.onchange = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      const dev = style && (resolveDeviceLayer(style, selectedLayerId) || style.deviceOne);
      if (!dev) return;
      dev.frameless = d1Frameless.checked;
      const radiusRow = document.getElementById("mk-d1-frameless-radius-row");
      if (radiusRow) radiusRow.style.display = d1Frameless.checked ? "" : "none";
      if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  const d1FramelessRadius = document.getElementById("mk-d1-frameless-radius");
  const d1FramelessRadiusVal = document.getElementById("mk-d1-frameless-radius-val");
  if (d1FramelessRadius) {
    d1FramelessRadius.oninput = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      const dev = style && (resolveDeviceLayer(style, selectedLayerId) || style.deviceOne);
      if (!dev) return;
      dev.framelessCornerRadius = parseInt(d1FramelessRadius.value, 10);
      if (d1FramelessRadiusVal) d1FramelessRadiusVal.textContent = d1FramelessRadius.value;
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  const d1CameraEnabled = document.getElementById("mk-d1-camera-enabled");
  if (d1CameraEnabled) {
    d1CameraEnabled.onchange = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      const dev = style && (resolveDeviceLayer(style, selectedLayerId) || style.deviceOne);
      if (!dev) return;
      // Deliberately NOT synced via syncLinkedDeviceLayer -- cameraEnabled is
      // per-page/per-layer only (see DeviceLayerStyle.cameraEnabled), so
      // toggling it on one page must never affect a linked page.
      dev.cameraEnabled = d1CameraEnabled.checked;
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  const d1BorderThickness = document.getElementById("mk-d1-border-thickness");
  const d1BorderThicknessVal = document.getElementById("mk-d1-border-thickness-val");
  if (d1BorderThickness) {
    d1BorderThickness.oninput = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      const dev = style && (resolveDeviceLayer(style, selectedLayerId) || style.deviceOne);
      if (!dev) return;
      dev.borderThickness = parseInt(d1BorderThickness.value, 10);
      if (d1BorderThicknessVal) d1BorderThicknessVal.textContent = d1BorderThickness.value;
      if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  const d1BezelThickness = document.getElementById("mk-d1-bezel-thickness");
  const d1BezelThicknessVal = document.getElementById("mk-d1-bezel-thickness-val");
  if (d1BezelThickness) {
    d1BezelThickness.oninput = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      const dev = style && (resolveDeviceLayer(style, selectedLayerId) || style.deviceOne);
      if (!dev) return;
      dev.bezelThickness = parseInt(d1BezelThickness.value, 10);
      if (d1BezelThicknessVal) d1BezelThicknessVal.textContent = d1BezelThickness.value;
      if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  const d1BorderColor = document.getElementById("mk-d1-border-color");
  if (d1BorderColor) {
    d1BorderColor.oninput = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      const dev = style && (resolveDeviceLayer(style, selectedLayerId) || style.deviceOne);
      if (!dev) return;
      dev.borderColor = d1BorderColor.value;
      const tbInput = document.getElementById("mk-obj-dev-border-color");
      if (tbInput) tbInput.value = d1BorderColor.value;
      if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  const d1BezelColor = document.getElementById("mk-d1-bezel-color");
  if (d1BezelColor) {
    d1BezelColor.oninput = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      const dev = style && (resolveDeviceLayer(style, selectedLayerId) || style.deviceOne);
      if (!dev) return;
      dev.bezelColor = d1BezelColor.value;
      const tbInput = document.getElementById("mk-obj-dev-bezel-color");
      if (tbInput) tbInput.value = d1BezelColor.value;
      if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  const d1ApplyAllColorsBtn = document.getElementById("mk-d1-apply-all-colors-btn");
  if (d1ApplyAllColorsBtn) {
    d1ApplyAllColorsBtn.onclick = () => applyDeviceColorToAllPages();
  }

  // Z-index layer order buttons
  const bringFront = document.getElementById("mk-layer-bring-front");
  const bringFwd = document.getElementById("mk-layer-bring-fwd");
  const sendBwd = document.getElementById("mk-layer-send-bwd");
  const sendBack = document.getElementById("mk-layer-send-back");

  // NOTE: these must NOT gate assignment on `selectedColumn` at setup time --
  // setupInspectorEvents() runs once at page load, before any project/column is
  // selected, so `selectedColumn` is always null then and the handler would
  // never be attached at all. `selectedColumn` is a live import from state.js;
  // read it fresh inside the click handler instead.
  if (bringFront) bringFront.onclick = () => moveSelectedLayerOrder("front");
  if (bringFwd) bringFwd.onclick = () => moveSelectedLayerOrder("forward");
  if (sendBwd) sendBwd.onclick = () => moveSelectedLayerOrder("backward");
  if (sendBack) sendBack.onclick = () => moveSelectedLayerOrder("back");

  // Transform-panel z-order buttons (Section 2) -- same operations, separate button set.
  const tBringForward = document.getElementById("mk-bring-forward");
  const tSendBackward = document.getElementById("mk-send-backward");
  const tBringFront = document.getElementById("mk-bring-front");
  const tSendBack = document.getElementById("mk-send-back");
  if (tBringForward) tBringForward.onclick = () => moveSelectedLayerOrder("forward");
  if (tSendBackward) tSendBackward.onclick = () => moveSelectedLayerOrder("backward");
  if (tBringFront) tBringFront.onclick = () => moveSelectedLayerOrder("front");
  if (tSendBack) tSendBack.onclick = () => moveSelectedLayerOrder("back");

  // Duplicate / Delete layer (Section 2)
  const duplicateLayerBtn = document.getElementById("mk-duplicate-layer");
  if (duplicateLayerBtn) duplicateLayerBtn.onclick = () => duplicateSelectedLayer();
  const deleteLayerBtn = document.getElementById("mk-delete-layer");
  if (deleteLayerBtn) deleteLayerBtn.onclick = () => deleteSelectedLayer();

  // Position/Transform numeric fields + align buttons (Section 2, universal across layer types)
  setupTransformPanelEvents();

  // Add Asset Layer button & Add Sticker button -- same real-image-upload
  // behavior as every other "+ Add Asset Layer" button (toolbar, Layers card).
  const addAssetBtn = document.getElementById("mk-add-asset-layer-btn");
  if (addAssetBtn) addAssetBtn.onclick = () => openAssetUpload();

  const addTextLayerBtn = document.getElementById("mk-add-text-layer-btn");
  if (addTextLayerBtn) addTextLayerBtn.onclick = () => addTextLayer();

  const addDecBtn = document.getElementById("mk-decoration-add");
  if (addDecBtn) {
    addDecBtn.onclick = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (!style) return;
      if (!style.decorations) style.decorations = [];
      style.decorations.push({ text: "New Sticker", x: 100, y: 100, color: "#ffffff" });
      setMockupDirty(true);
      renderMkDecorations(style.decorations);
      renderMockupLayersPanel(selectedColumn);
      loadColumnIntoFabric(selectedColumn);
    };
  }

  // AI Assist button
  const aiTextBtn = document.getElementById("mk-ai-text");
  if (aiTextBtn) {
    aiTextBtn.onclick = async () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (!style?.title) return;
      try {
        const res = await api("/api/ai/copy", { method: "POST", body: { prompt: style.title.text || "App feature" } });
        if (res && res.title) {
          style.title.text = res.title;
          if (res.subtitle && style.subtitle) style.subtitle.text = res.subtitle;
          syncSection2Inputs(selectedColumn);
          loadColumnIntoFabric(selectedColumn);
          setMockupDirty(true);
          showToast("AI copy generated successfully!", "success");
        }
      } catch (e) {
        showToast("AI assist error: " + (e.message || e), "error");
      }
    };
  }
}

/** Artboard reference (matches CANVAS in src/mockup/render.ts and the Fabric
 *  canvas dimensions in canvas.js -- the one place both agree). */
const ARTBOARD_W = 1080;
/** Vertical center anchor a device's y% offset is measured from -- mirrors
 *  canvas.js's commitMoveableTransformToModel/renderTransformGizmoOverlay
 *  (deviceOne/extra anchor slightly higher than deviceTwo, matching their
 *  typical two-device layout roles; extra devices reuse deviceOne's anchor
 *  since they have no layout-preset role of their own). */
function deviceCenterYBase(layerId) {
  return layerId === "deviceTwo" ? 1200 : 1100;
}

/** Reads any layer's transform as a uniform artboard-px box, converting out
 *  of whatever unit convention that layer type actually stores (device
 *  layers: % of their own scaled box; assets: % of the artboard; text:
 *  absolute px). Returns null for layer types with no editable transform
 *  (background never has a position; decorations aren't wired to the
 *  gizmo/transform system yet, matching canvas.js's existing scope). */
export function moveSelectedLayerOrder(direction) {
  if (!selectedColumn || !selectedLayerId) return;
  const layers = buildScreenLayersModel(selectedColumn);
  const curIdx = layers.findIndex((l) => l.id === selectedLayerId);
  if (curIdx === -1) return;

  if (direction === "forward" || direction === "fwd") {
    if (curIdx === 0) return;
    const targetIdx = curIdx - 1;
    const temp = layers[curIdx];
    layers[curIdx] = layers[targetIdx];
    layers[targetIdx] = temp;
  } else if (direction === "backward" || direction === "bwd") {
    if (curIdx === layers.length - 1) return;
    if (layers[curIdx + 1]?.id === "background") return;
    const targetIdx = curIdx + 1;
    const temp = layers[curIdx];
    layers[curIdx] = layers[targetIdx];
    layers[targetIdx] = temp;
  } else if (direction === "front") {
    if (curIdx === 0) return;
    const [item] = layers.splice(curIdx, 1);
    layers.unshift(item);
  } else if (direction === "back") {
    const [item] = layers.splice(curIdx, 1);
    const bgIdx = layers.findIndex((l) => l.id === "background");
    if (bgIdx !== -1) layers.splice(bgIdx, 0, item);
    else layers.push(item);
  }

  const n = layers.length;
  layers.forEach((layer, i) => {
    if (layer.id === "background") {
      setLayerZIndex(selectedColumn, layer.id, 0);
    } else {
      setLayerZIndex(selectedColumn, layer.id, (n - i) * 10);
    }
  });

  setMockupDirty(true);
  renderMockupLayersPanel(selectedColumn);
  loadColumnIntoFabric(selectedColumn);
}

/** The layout preset's own built-in tilt for a device layer (e.g. the
 *  airbnb-template two-device preset's -4deg/+4deg) -- 0 for every
 *  non-device layer and for device layers the preset doesn't tilt. Matches
 *  exactly what syncFabricObjectToModel already stores (canvas.js's
 *  'deviceOne'/'deviceTwo' branches: `(obj.angle ?? 0) - transform.d1/d2.rotate`),
 *  so getLayerBox/setLayerBox round-trip the SAME rotation value the canvas
 *  itself uses -- without this, a visibly tilted device (from the preset
 *  alone, `dev.rotation` itself still 0) read as 0 in both rotation inputs. */
/** Normalizes a rotation degree value to (-180, 180], matching
 *  rotateSelectedObject's own normalization -- so a displayed rotation
 *  (which can be a preset tilt + stored rotation sum outside that range)
 *  always reads the same short way the toolbar's commit path would store it. */
function normalizeRotationDeg(deg) {
  let n = Math.round(((deg % 360) + 360) % 360);
  if (n > 180) n -= 360;
  return n;
}

export function presetRotate(style, layerId) {
  if (layerId !== "deviceOne" && layerId !== "deviceTwo") return 0;
  const preset = getLayoutPresetClient(style.layout);
  const transform = presentationTransformClient(preset.presentation);
  if (layerId === "deviceOne") return transform.d1?.rotate || 0;
  return transform.d2?.rotate || 0;
}

export function getLayerBox(style, layerId) {
  if (layerId === "title" || layerId === "subtitle") {
    const t = style[layerId];
    if (!t) return null;
    return { x: t.x ?? 54, y: t.y ?? (layerId === "title" ? 80 : 200), width: 972, height: layerId === "title" ? 120 : 80, rotation: t.rotation ?? 0, opacity: t.opacity ?? (layerId === "subtitle" ? 0.8 : 1), flipH: !!t.flipH, flipV: !!t.flipV };
  }
  if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    const ast = style.assetLayers?.[idx];
    if (!ast) return null;
    const width = (ast.widthPct / 100) * ARTBOARD_W;
    const height = ast.heightPct ? (ast.heightPct / 100) * ARTBOARD_H : width * 1.4;
    return {
      x: (ast.xPct / 100) * ARTBOARD_W,
      y: (ast.yPct / 100) * ARTBOARD_H,
      width, height,
      rotation: ast.rotation || 0,
      opacity: ast.opacity ?? 1,
      flipH: !!ast.flipH,
      flipV: !!ast.flipV,
    };
  }
  if (layerId.startsWith("text:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    const txt = style.textLayers?.[idx];
    if (!txt) return null;
    const width = (txt.widthPct / 100) * ARTBOARD_W;
    const height = txt.heightPct ? (txt.heightPct / 100) * ARTBOARD_H : width * 0.5;
    return {
      x: (txt.xPct / 100) * ARTBOARD_W,
      y: (txt.yPct / 100) * ARTBOARD_H,
      width, height,
      rotation: txt.rotation || 0,
      opacity: txt.opacity ?? 1,
      flipH: false,
      flipV: false,
    };
  }
  const dev = resolveDeviceLayer(style, layerId);
  if (dev) {
    const width = 480 * (dev.size / 90);
    const height = 960 * (dev.size / 90);
    const cx = ARTBOARD_W / 2 + (dev.x / 100) * ARTBOARD_W;
    const cy = deviceCenterYBase(layerId) + (dev.y / 100) * ARTBOARD_H;
    return { x: cx - width / 2, y: cy - height / 2, width, height, rotation: presetRotate(style, layerId) + (dev.rotation || 0), opacity: 1, flipH: !!dev.flipH, flipV: !!dev.flipV };
  }
  return null;
}

export function setLayerBox(style, layerId, box) {
  if (layerId === "title" || layerId === "subtitle") {
    const t = style[layerId];
    if (!t) return;
    t.x = Math.round(box.x);
    t.y = Math.round(box.y);
    t.rotation = Math.round(box.rotation ?? 0);
    if (box.opacity != null) t.opacity = box.opacity;
    if (box.flipH !== undefined) t.flipH = !!box.flipH;
    if (box.flipV !== undefined) t.flipV = !!box.flipV;
    return;
  }
  if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    const ast = style.assetLayers?.[idx];
    if (!ast) return;
    ast.widthPct = Math.round((box.width / ARTBOARD_W) * 100);
    ast.heightPct = Math.round((box.height / ARTBOARD_H) * 100);
    ast.xPct = Math.round((box.x / ARTBOARD_W) * 100);
    ast.yPct = Math.round((box.y / ARTBOARD_H) * 100);
    ast.rotation = Math.round(box.rotation ?? 0);
    if (box.opacity !== undefined) ast.opacity = Math.max(0, Math.min(1, box.opacity));
    if (box.flipH !== undefined) ast.flipH = !!box.flipH;
    if (box.flipV !== undefined) ast.flipV = !!box.flipV;
    return;
  }
  if (layerId.startsWith("text:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    const txt = style.textLayers?.[idx];
    if (!txt) return;
    txt.widthPct = Math.round((box.width / ARTBOARD_W) * 100);
    txt.heightPct = Math.round((box.height / ARTBOARD_H) * 100);
    txt.xPct = Math.round((box.x / ARTBOARD_W) * 100);
    txt.yPct = Math.round((box.y / ARTBOARD_H) * 100);
    txt.rotation = Math.round(box.rotation ?? 0);
    if (box.opacity !== undefined) txt.opacity = Math.max(0, Math.min(1, box.opacity));
    return;
  }
  const dev = resolveDeviceLayer(style, layerId);
  if (dev) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    dev.size = Math.round((box.width / 480) * 90);
    dev.x = Math.round(((cx - ARTBOARD_W / 2) / ARTBOARD_W) * 100);
    dev.y = Math.round(((cy - deviceCenterYBase(layerId)) / ARTBOARD_H) * 100);
    dev.rotation = Math.round((box.rotation ?? 0) - presetRotate(style, layerId));
    if (box.flipH !== undefined) dev.flipH = !!box.flipH;
    if (box.flipV !== undefined) dev.flipV = !!box.flipV;
  }
}

export async function duplicateSelectedLayer() {
  if (!selectedColumn) return;
  const style = getSelectedCellStyle() || selectedColumn.style;
  if (!style) return;
  if (selectedLayerId.startsWith("asset:")) {
    const idx = parseInt(selectedLayerId.split(":")[1], 10);
    const ast = style.assetLayers?.[idx];
    if (!ast) return;
    const clone = JSON.parse(JSON.stringify(ast));
    clone.id = `asset_${Date.now()}`;
    clone.customName = (ast.customName || "Asset") + " Copy";
    clone.xPct = Math.min(95, (ast.xPct ?? 50) + 4);
    clone.yPct = Math.min(95, (ast.yPct ?? 50) + 4);
    style.assetLayers.splice(idx + 1, 0, clone);
    setMockupDirty(true);
    setSelectedLayerId(`asset:${idx + 1}`);
  } else if (selectedLayerId.startsWith("text:")) {
    const idx = parseInt(selectedLayerId.split(":")[1], 10);
    const txt = style.textLayers?.[idx];
    if (!txt) return;
    const clone = JSON.parse(JSON.stringify(txt));
    clone.id = `text_${Date.now()}`;
    clone.customName = (txt.customName || "Text") + " Copy";
    clone.xPct = Math.min(95, (txt.xPct ?? 50) + 4);
    clone.yPct = Math.min(95, (txt.yPct ?? 50) + 4);
    style.textLayers.splice(idx + 1, 0, clone);
    setMockupDirty(true);
    setSelectedLayerId(`text:${idx + 1}`);
  } else {
    const dev = resolveDeviceLayer(style, selectedLayerId);
    if (!dev) { showToast("This layer can't be duplicated.", "error"); return; }
    const clone = JSON.parse(JSON.stringify(dev));
    clone.customName = (dev.customName || "Device") + " Copy";
    clone.x = (dev.x || 0) + 6;
    clone.y = (dev.y || 0) + 6;
    if (!style.extraDevices) style.extraDevices = [];
    style.extraDevices.push(clone);
    setMockupDirty(true);
    setSelectedLayerId(`extra:${style.extraDevices.length - 1}`);
  }
  renderMockupLayersPanel(selectedColumn);
  syncSection2Inputs(selectedColumn);
  await syncEditingAreaToSelectedPages();
}

export async function deleteSelectedLayer() {
  if (!selectedColumn || !selectedLayerId) {
    showToast("No layer is currently selected.", "info");
    return;
  }
  if (selectedLayerId === "background") {
    showToast("The page background cannot be deleted.", "error");
    return;
  }
  const layers = buildScreenLayersModel(selectedColumn);
  const layerName = layers.find((l) => l.id === selectedLayerId)?.name || "this layer";
  const ok = await showConfirm(`This permanently removes "${layerName}" and cannot be undone.`, "Delete this layer?", true);
  if (!ok) return;

  const style = getSelectedCellStyle() || selectedColumn.style;

  if (!style) return;
  let removed = false;
  if (selectedLayerId === "deviceOne") {
    if (style.deviceOne) {
      style.deviceOne.deleted = true;
      style.deviceOne.visible = false;
      removed = true;
    }
  } else if (selectedLayerId.startsWith("panoramaDevice:")) {
    // panoramaDevice:<ownerColId>:<key> -- a spanning device mirrored onto this page; delete the owner's device.
    const [, ownerId, key] = selectedLayerId.split(":");
    const ownerDev = mockupProject?.columns?.find((c) => c.id === ownerId)?.style?.[key];
    if (ownerDev) {
      ownerDev.deleted = true;
      ownerDev.visible = false;
      removed = true;
    }
  } else if (selectedLayerId === "deviceTwo") {
    if (style.deviceTwo) {
      style.deviceTwo.deleted = true;
      style.deviceTwo.visible = false;
      removed = true;
    }
  } else if (/^extra:\d+$/.test(selectedLayerId)) {
    const idx = parseInt(selectedLayerId.split(":")[1], 10);
    if (style.extraDevices?.[idx]) {
      style.extraDevices.splice(idx, 1);
      removed = true;
    }
  } else if (selectedLayerId.startsWith("asset:")) {
    const idx = parseInt(selectedLayerId.split(":")[1], 10);
    if (style.assetLayers?.[idx]) {
      style.assetLayers.splice(idx, 1);
      removed = true;
    }
  } else if (selectedLayerId.startsWith("decoration:")) {
    const idx = parseInt(selectedLayerId.split(":")[1], 10);
    if (style.decorations?.[idx]) {
      style.decorations.splice(idx, 1);
      removed = true;
    }
  } else if (selectedLayerId.startsWith("text:")) {
    const idx = parseInt(selectedLayerId.split(":")[1], 10);
    if (style.textLayers?.[idx]) {
      style.textLayers.splice(idx, 1);
      removed = true;
    }
  } else if (selectedLayerId === "title" || selectedLayerId === "subtitle") {
    const t = style[selectedLayerId];
    if (t) {
      t.deleted = true;
      t.text = "";
      t.visible = false;
      removed = true;
    }
  }

  if (!removed) {
    showToast("This layer can't be deleted.", "error");
    return;
  }
  setSelectedLayerId(null);
  setMockupDirty(true);
  renderMockupLayersPanel(selectedColumn);
  syncSection2Inputs(selectedColumn);
  await syncEditingAreaToSelectedPages();
  showToast(`"${layerName}" deleted.`, "success");
}

/** Opens the shared native file picker for adding a real-image asset layer --
 *  the one behavior every "+ Add Asset Layer" button (toolbar, Layers card,
 *  Assets tab) now triggers, via #mockup-asset-upload-input's onchange
 *  handler in main.js (which uploads the file and appends the resulting
 *  asset layer to the selected page). */
export function openAssetUpload() {
  document.getElementById("mockup-asset-upload-input")?.click();
}

/** Adds a device layer to the current page: un-deletes Device Frame 1 if it
 *  was removed, otherwise appends a new free-form extra device layer. Shared
 *  by the toolbar's "+ Add Device Layer" button and the Layers card's own
 *  button of the same name -- one function, one behavior everywhere. */
export function addDeviceLayer() {
  if (!selectedColumn) return;
  const style = getSelectedCellStyle() || selectedColumn.style;
  if (!style) return;
  if (style.deviceOne?.deleted) {
    style.deviceOne.deleted = false;
    style.deviceOne.visible = true;
    setSelectedLayerId("deviceOne");
  } else {
    if (!style.extraDevices) style.extraDevices = [];
    style.extraDevices.push({ size: 70, x: 0, y: 0, rotation: 0, brightness: 100, frameless: false, customName: `Device Frame ${style.extraDevices.length + 3}` });
    setSelectedLayerId(`extra:${style.extraDevices.length - 1}`);
  }
  setMockupDirty(true);
  renderMockupLayersPanel(selectedColumn);
  syncSection2Inputs(selectedColumn);
  loadColumnIntoFabric(selectedColumn);
}

/** Adds a new free-form text layer to the current page -- shared by the
 *  toolbar's "+ Text" button and the Layers card's own button of the same
 *  name, mirroring addDeviceLayer()'s shape exactly. */
export function addTextLayer() {
  if (!selectedColumn) return;
  const style = getSelectedCellStyle() || selectedColumn.style;
  if (!style) return;
  if (!style.textLayers) style.textLayers = [];
  const idx = style.textLayers.length;
  style.textLayers.push({
    id: `text_${Date.now()}`,
    xPct: 50 - 20,
    yPct: 45,
    widthPct: 40,
    rotation: 0,
    opacity: 1,
    customName: `Text Layer ${idx + 1}`,
    style: { text: "New Text", color: "#ffffff", size: 48, align: "center" },
  });
  setSelectedLayerId(`text:${idx}`);
  setMockupDirty(true);
  renderMockupLayersPanel(selectedColumn);
  syncSection2Inputs(selectedColumn);
  routeInspectorForLayer(`text:${idx}`);
  loadColumnIntoFabric(selectedColumn);
}

/** Wires the universal Position & Transform card (Section 2): numeric
 *  X/Y/W/H/rotation/opacity fields, flip checkboxes (asset layers only),
 *  and align-to-artboard buttons. Fields read/write via getLayerBox/
 *  setLayerBox so one code path covers every transformable layer kind. */
export function setupTransformPanelEvents() {
  const $id = (id) => document.getElementById(id);
  // mk-pos-rot is deliberately excluded here -- it commits on change/Enter
  // (see below), matching the toolbar's mk-obj-rotation, not on every
  // keystroke like the other fields.
  const fields = ["mk-pos-x", "mk-pos-y", "mk-pos-w", "mk-pos-h", "mk-pos-opacity"];

  function currentBox() {
    if (!selectedColumn) return null;
    const style = getSelectedCellStyle() || selectedColumn.style;
    if (!style) return null;
    return { style, box: getLayerBox(style, selectedLayerId) };
  }

  function commit(box) {
    const ctx = currentBox();
    if (!ctx || !ctx.box) return;
    setLayerBox(ctx.style, selectedLayerId, { ...ctx.box, ...box });
    if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
    setMockupDirty(true);
    loadColumnIntoFabric(selectedColumn);
  }

  for (const id of fields) {
    const el = $id(id);
    if (!el) continue;
    el.oninput = () => {
      const v = Number(el.value);
      if (Number.isNaN(v)) return;
      if (id === "mk-pos-x") commit({ x: v });
      else if (id === "mk-pos-y") commit({ y: v });
      else if (id === "mk-pos-w") commit({ width: v });
      else if (id === "mk-pos-h") commit({ height: v });
      else if (id === "mk-pos-opacity") commitOpacityChange(v);
    };
  }

  const posRotEl = $id("mk-pos-rot");
  if (posRotEl) {
    const applyPosRot = () => rotateSelectedObject(Number(posRotEl.value) || 0, false);
    posRotEl.onchange = applyPosRot;
    posRotEl.onkeydown = (e) => { if (e.key === "Enter") applyPosRot(); };
  }

  const rotApplyBtn = $id("mk-rot-apply-btn");
  if (rotApplyBtn) {
    rotApplyBtn.onclick = () => {
      const curVal = Number($id("mk-pos-rot")?.value);
      if (!Number.isNaN(curVal) && curVal !== 0) {
        rotateSelectedObject(curVal, false);
      } else {
        rotateSelectedObject(90, true);
      }
    };
  }

  const posOpSlider = $id("mk-pos-opacity-slider");
  if (posOpSlider) {
    posOpSlider.oninput = () => handleOpacityInput(posOpSlider.value);
    posOpSlider.onchange = () => commitOpacityChange(posOpSlider.value);
  }

  const flipH = $id("mk-pos-flip-h");
  const flipV = $id("mk-pos-flip-v");
  if (flipH) flipH.onclick = () => flipSelectedObject("horizontal");
  if (flipV) flipV.onclick = () => flipSelectedObject("vertical");

  if ($id("mk-align-left")) $id("mk-align-left").onclick = () => alignSelectedObject("left");
  if ($id("mk-align-center")) $id("mk-align-center").onclick = () => alignSelectedObject("center-x");
  if ($id("mk-align-right")) $id("mk-align-right").onclick = () => alignSelectedObject("right");
  if ($id("mk-align-top")) $id("mk-align-top").onclick = () => alignSelectedObject("top");
  if ($id("mk-align-middle")) $id("mk-align-middle").onclick = () => alignSelectedObject("middle-y");
  if ($id("mk-align-bottom")) $id("mk-align-bottom").onclick = () => alignSelectedObject("bottom");

  const addDeviceLayerBtn = $id("mk-add-device-layer-btn");
  if (addDeviceLayerBtn) addDeviceLayerBtn.onclick = addDeviceLayer;

  const layersAddPageBtn = $id("mk-layers-add-page-btn");
  if (layersAddPageBtn) layersAddPageBtn.onclick = () => addMockupPage();
  const layersAddAssetBtn = $id("mk-layers-add-asset-btn");
  if (layersAddAssetBtn) layersAddAssetBtn.onclick = () => openAssetUpload();
  const layersAddTextBtn = $id("mk-layers-add-text-btn");
  if (layersAddTextBtn) layersAddTextBtn.onclick = () => addTextLayer();

  const linkPageBtn = $id("mk-link-paired-page");
  if (linkPageBtn) {
    linkPageBtn.onclick = () => {
      if (!selectedColumn || selectedPages.length !== 2) return;
      const style = getSelectedCellStyle() || selectedColumn.style;
      const dev = style && resolveDeviceLayer(style, selectedLayerId);
      if (!dev) return;
      const otherPageId = selectedPages.find((id) => id !== selectedColumn.id);
      if (!otherPageId) return;
      if (dev.linkedTo) {
        unlinkDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
        showToast("Unlinked.", "info");
      } else {
        const ok = linkDeviceLayers(mockupProject, selectedColumn.id, selectedLayerId, otherPageId, selectedLayerId);
        showToast(ok ? "Linked -- editing this device now syncs to the paired page." : "The paired page doesn't have that device layer.", ok ? "success" : "error");
      }
      setMockupDirty(true);
      syncSection2Inputs(selectedColumn);
    };
  }
}

/** Refreshes the Section 2 Transform panel's fields to reflect the
 *  currently selected layer -- called from syncSection2Inputs(). */
function syncTransformPanelInputs(style, layerId) {
  const box = getLayerBox(style, layerId);
  const fieldset = document.getElementById("mk-section-transform");
  if (fieldset) fieldset.style.opacity = box ? "1" : "0.45";
  const set = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; };
  if (!box) return;
  set("mk-pos-x", Math.round(box.x));
  set("mk-pos-y", Math.round(box.y));
  set("mk-pos-w", Math.round(box.width));
  set("mk-pos-h", Math.round(box.height));
  set("mk-pos-rot", normalizeRotationDeg(box.rotation ?? 0));
  const pct = Math.round((box.opacity ?? 1) * 100);
  set("mk-pos-opacity", pct);
  set("mk-pos-opacity-slider", pct);

  const flipH = document.getElementById("mk-pos-flip-h");
  const flipV = document.getElementById("mk-pos-flip-v");
  if (flipH) flipH.classList.toggle("is-active", !!box.flipH);
  if (flipV) flipV.classList.toggle("is-active", !!box.flipV);

  // Two-page device link row -- only for a device layer while exactly two pages are paired.
  const linkRow = document.getElementById("mk-page-link-row");
  const linkBtn = document.getElementById("mk-link-paired-page");
  if (linkRow && linkBtn) {
    const dev = resolveDeviceLayer(style, layerId);
    const showLink = !!dev && selectedColumn && selectedPages.length === 2 && selectedPages.includes(selectedColumn.id);
    linkRow.style.display = showLink ? "block" : "none";
    if (showLink) {
      linkBtn.textContent = dev.linkedTo ? "🔗 Unlink from Paired Page" : "🔗 Link to Paired Page";
      linkBtn.className = dev.linkedTo ? "primary small" : "secondary small";
    }
  }
}

let activeDeviceFilter = "all";
let selectedLibraryDeviceId = null;
let uploadedSvgContent = null;

export function setupDeviceLibraryHandlers() {
  const addBtn = document.getElementById("mockup-device-add-svg-btn");
  const removeBtn = document.getElementById("mockup-device-remove-mode-btn");
  const modal = document.getElementById("modal-add-svg-device");
  const closeBtn = document.getElementById("modal-add-svg-close");
  const cancelBtn = document.getElementById("modal-add-svg-cancel");
  const submitBtn = document.getElementById("modal-add-svg-submit");
  const dropzone = document.getElementById("svg-device-file-dropzone");
  const fileInput = document.getElementById("svg-device-file-input");
  const filePrompt = document.getElementById("svg-device-file-prompt");
  const fileInfo = document.getElementById("svg-device-file-info");

  if (addBtn && !addBtn.dataset.initialized) {
    addBtn.dataset.initialized = "true";
    addBtn.onclick = () => {
      if (modal) {
        modal.style.display = "flex";
        uploadedSvgContent = null;
        if (fileInput) fileInput.value = "";
        const titleInput = document.getElementById("svg-device-title-input");
        if (titleInput) titleInput.value = "";
        if (filePrompt) filePrompt.style.display = "block";
        if (fileInfo) { fileInfo.style.display = "none"; fileInfo.textContent = ""; }
      }
    };
  }

  if (removeBtn && !removeBtn.dataset.initialized) {
    removeBtn.dataset.initialized = "true";
    removeBtn.onclick = async () => {
      if (!selectedLibraryDeviceId) {
        showToast("Please click a device card to select it first before removing.", "warning");
        return;
      }

      try {
        const { devices } = await api("/api/mockups/devices-library");
        const dev = devices.find((d) => d.id === selectedLibraryDeviceId);
        const devName = dev?.name || selectedLibraryDeviceId;

        const confirmed = await showConfirm(`Are you sure you want to remove "${devName}" from the central device library?`);
        if (!confirmed) return;

        await api(`/api/mockups/devices-library/${encodeURIComponent(selectedLibraryDeviceId)}`, { method: "DELETE" });
        showToast(`Removed device "${devName}" from library.`, "success");
        selectedLibraryDeviceId = null;
        renderMockupDevicesSection();
      } catch (err) {
        showAlert("Failed to delete device: " + err.message, "error");
      }
    };
  }

  const closeModal = () => {
    if (modal) modal.style.display = "none";
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;

  if (dropzone && fileInput && !dropzone.dataset.initialized) {
    dropzone.dataset.initialized = "true";
    dropzone.onclick = () => fileInput.click();

    dropzone.ondragover = (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#10b981";
    };

    dropzone.ondragleave = () => {
      dropzone.style.borderColor = "rgba(255,255,255,0.2)";
    };

    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "rgba(255,255,255,0.2)";
      if (e.dataTransfer.files?.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleSvgFileSelect(e.dataTransfer.files[0]);
      }
    };

    fileInput.onchange = (e) => {
      if (e.target.files?.length > 0) {
        handleSvgFileSelect(e.target.files[0]);
      }
    };
  }

  function handleSvgFileSelect(file) {
    if (!file || (!file.name.endsWith(".svg") && file.type !== "image/svg+xml")) {
      showAlert("Please select a valid .svg file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      uploadedSvgContent = evt.target.result;
      if (filePrompt) filePrompt.style.display = "none";
      if (fileInfo) {
        fileInfo.style.display = "block";
        fileInfo.textContent = `✓ ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      }
      const titleInput = document.getElementById("svg-device-title-input");
      if (titleInput && !titleInput.value.trim()) {
        const cleanName = file.name.replace(/\.svg$/i, "").replace(/[-_]+/g, " ");
        titleInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      }
    };
    reader.readAsText(file);
  }

  if (submitBtn && !submitBtn.dataset.initialized) {
    submitBtn.dataset.initialized = "true";
    submitBtn.onclick = async () => {
      const titleInput = document.getElementById("svg-device-title-input");
      const vendorInput = document.getElementById("svg-device-vendor-input");
      const formFactorInput = document.getElementById("svg-device-form-factor-input");

      const name = titleInput?.value.trim();
      if (!name) return showAlert("Please enter a device title.");
      if (!uploadedSvgContent) return showAlert("Please upload an SVG file.");

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";
        await api("/api/mockups/devices-library/add-svg", {
          method: "POST",
          body: {
            name,
            vendor: vendorInput?.value || "generic",
            formFactor: formFactorInput?.value || "phone",
            svgContent: uploadedSvgContent
          }
        });
        showToast(`Successfully added device "${name}" to central library!`, "success");
        closeModal();
        renderMockupDevicesSection();
      } catch (err) {
        showAlert("Failed to add SVG device: " + err.message, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Save & Add Device";
      }
    };
  }
}

export async function renderMockupDevicesSection() {
  setupDeviceLibraryHandlers();

  const selectEl = document.getElementById("mockup-preview-device");
  if (selectEl && mockupProject) {
    selectEl.innerHTML = (mockupProject.devices || []).map((d) => `<option value="${d.id}">${d.label}</option>`).join("");
  }

  // Filter Pills setup
  const pillsContainer = document.getElementById("mockup-device-filter-pills");
  if (pillsContainer && !pillsContainer.dataset.initialized) {
    pillsContainer.dataset.initialized = "true";
    pillsContainer.addEventListener("click", (e) => {
      const btn = e.target.closest(".device-filter-pill");
      if (!btn) return;
      pillsContainer.querySelectorAll(".device-filter-pill").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      activeDeviceFilter = btn.dataset.filter || "all";
      renderMockupDevicesSection();
    });
  }

  // Populate 2D SVG Device Frame Library Grid
  const grid = document.getElementById("mockup-device-library-grid");
  if (grid) {
    grid.innerHTML = '<div style="color:var(--text-secondary); grid-column: 1/-1; padding: 2rem; text-align: center;">Loading 2D device frame catalog…</div>';
    try {
      const { devices } = await api("/api/mockups/devices-library");
      grid.innerHTML = "";

      const filteredDevices = devices.filter((dev) => {
        if (activeDeviceFilter === "all") return true;
        if (activeDeviceFilter === "apple") return dev.id.startsWith("apple") || dev.id.startsWith("ipad");
        if (activeDeviceFilter === "google") return dev.id.startsWith("google");
        if (activeDeviceFilter === "samsung") return dev.id.startsWith("samsung");
        if (activeDeviceFilter === "generic") return !dev.id.startsWith("apple") && !dev.id.startsWith("google") && !dev.id.startsWith("samsung");
        return true;
      });

      for (const dev of filteredDevices) {
        const isSelected = selectedLibraryDeviceId === dev.id;
        const brandLabel = dev.id.startsWith("apple") || dev.id.startsWith("ipad") ? "Apple"
          : dev.id.startsWith("google") ? "Google"
          : dev.id.startsWith("samsung") ? "Samsung" : "Generic";

        const card = document.createElement("div");
        card.className = `device-lib-card ${isSelected ? "is-selected" : ""}`;
        card.innerHTML = `
          <div class="device-lib-preview-box">${dev.svgFrame || '<div style="color:#6b7280; font-size:12px;">Frame Preview</div>'}</div>
          <div class="device-lib-card-info">
            <h5 class="device-lib-card-title">${dev.name}</h5>
            <div class="device-lib-spec-badges">
              <span class="device-lib-badge brand-badge">${brandLabel}</span>
              <span class="device-lib-badge">${dev.width} &times; ${dev.height}</span>
            </div>
          </div>
          <button class="device-lib-card-btn" type="button">Use Device</button>
        `;

        // Card Container Click -> Selects device (displays blue border highlight)
        card.onclick = (e) => {
          if (e.target.closest(".device-lib-card-btn")) return;
          selectedLibraryDeviceId = dev.id;
          grid.querySelectorAll(".device-lib-card").forEach((c) => c.classList.remove("is-selected"));
          card.classList.add("is-selected");
        };

        // "Use Device" Button Click -> Applies device across ALL pages of current template
        const useBtn = card.querySelector(".device-lib-card-btn");
        if (useBtn) {
          useBtn.onclick = async (e) => {
            e.stopPropagation();
            if (!mockupProject) return showAlert("Please select or create a project first from the Projects tab.");

            // Update project device rows
            if (!Array.isArray(mockupProject.devices) || mockupProject.devices.length === 0) {
              mockupProject.devices = [{ id: "row-1", deviceId: dev.id, label: dev.name, previewsVisible: true, isBase: true }];
            } else {
              const base = mockupProject.devices.find((d) => d.isBase) || mockupProject.devices[0];
              base.deviceId = dev.id;
              base.label = dev.name;
            }

            // Dynamically update ALL pages of the active template
            if (Array.isArray(mockupProject.columns)) {
              for (const col of mockupProject.columns) {
                if (col.style) {
                  if (col.style.deviceOne) {
                    const targetW = (col.style.layout || "").includes("two-devices") ? 1080 * 0.72 : 1080 * 0.78;
                    const wScale = targetW / (dev.width || 1080);
                    const hScale = (1920 * 0.82) / (dev.height || 1920);
                    col.style.deviceOne.size = Math.round(90 * Math.min(wScale, hScale));
                  }
                  if (col.style.deviceTwo) {
                    const targetW = 1080 * 0.72;
                    const wScale = targetW / (dev.width || 1080);
                    const hScale = (1920 * 0.82) / (dev.height || 1920);
                    col.style.deviceTwo.size = Math.round(90 * Math.min(wScale, hScale));
                  }
                  if (col.templateDefaultStyle) {
                    if (col.templateDefaultStyle.deviceOne) col.templateDefaultStyle.deviceOne.size = col.style.deviceOne?.size ?? 90;
                    if (col.templateDefaultStyle.deviceTwo) col.templateDefaultStyle.deviceTwo.size = col.style.deviceTwo?.size ?? 90;
                  }
                }
              }
            }

            await saveCurrentMockupProject();
            renderMockupCanvas();
            renderMockupMatrix();
            renderMockupDevicesSection();
            showToast(`Applied "${dev.name}" frame across all ${mockupProject.columns?.length || 0} page(s) of this template.`, "success");
          };
        }

        grid.appendChild(card);
      }
    } catch (err) {
      grid.innerHTML = `<div style="color:var(--danger); grid-column: 1/-1;">Failed to load device library: ${err.message}</div>`;
    }
  }
}

