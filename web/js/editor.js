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
import { escapeHtml, api, uploadFile, showAlert, showToast, showConfirm } from './utils.js';
import { loadColumnIntoFabric, renderMockupCanvas, setActivePage } from './canvas.js';
import { renderMockupMatrix, getSelectedCellStyle } from './matrix.js';

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
  else if (layerId?.startsWith('asset:') || layerId?.startsWith('decoration:')) switchInspectorTab('asset');
  else switchInspectorTab('col');
}

export function buildScreenLayersModel(column) {
  if (!column || !column.style) return [];
  const style = getSelectedCellStyle() || column.style;
  const layers = [];

  if (style.deviceOne) {
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
  if (style.deviceTwo) {
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
  if (style.title) {
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
  if (style.subtitle) {
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
  // Cross-page panorama assets that intersect this page -- same
  // order-sorted column-index math as canvas.js/render.ts's projection, so
  // "does this asset appear on this page" always agrees everywhere.
  if (mockupProject?.panoramaAssets?.length) {
    const orderedCols = [...mockupProject.columns].sort((a, b) => a.order - b.order);
    const colIdx = orderedCols.findIndex((c) => c.id === column.id);
    mockupProject.panoramaAssets.forEach((pa) => {
      const localXPx = pa.xPx - colIdx * 1080;
      const intersects = localXPx + pa.widthPx > 0 && localXPx < 1080;
      if (!intersects) return;
      layers.push({
        id: `panorama:${pa.id}`,
        type: "panorama",
        icon: "↔️",
        name: pa.name || "Panorama Asset (spans pages)",
        visible: pa.visible !== false,
        locked: !!pa.locked,
        zIndex: pa.zIndex ?? 15,
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
        // A panorama asset can appear on more than one open canvas --
        // rebuild all of them (setActivePage), not just this one.
        if (lid.startsWith("panorama:")) setActivePage(column.id);
        else loadColumnIntoFabric(column);
      };
    }

    const visBtn = item.querySelector(".mk-layer-vis-btn");
    if (visBtn) {
      visBtn.onclick = (e) => {
        e.stopPropagation();
        toggleLayerVisibilityInModel(column, lid);
        setMockupDirty(true);
        renderMockupLayersPanel(column);
        if (lid.startsWith("panorama:")) setActivePage(column.id);
        else loadColumnIntoFabric(column);
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

/** A panorama-tagged layer id ("panorama:<id>") lives in
 *  mockupProject.panoramaAssets, not any column's style -- resolve it there
 *  instead of the getSelectedCellStyle()-based lookups every other layer
 *  type uses. */
function resolvePanoramaAsset(layerId) {
  if (!layerId?.startsWith("panorama:")) return null;
  const id = layerId.slice("panorama:".length);
  return mockupProject?.panoramaAssets?.find((p) => p.id === id) ?? null;
}

export function setCustomLayerName(column, layerId, name) {
  const pa = resolvePanoramaAsset(layerId);
  if (pa) { pa.name = name; return; }
  const style = getSelectedCellStyle() || column.style;
  if (!style) return;
  if (layerId === "title" && style.title) style.title.customName = name;
  else if (layerId === "subtitle" && style.subtitle) style.subtitle.customName = name;
  else if (layerId === "background" && style.background) style.background.customName = name;
  else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.assetLayers?.[idx]) style.assetLayers[idx].customName = name;
  } else {
    const dev = resolveDeviceLayer(style, layerId);
    if (dev) dev.customName = name;
  }
}

export function toggleLayerVisibilityInModel(column, layerId) {
  const pa = resolvePanoramaAsset(layerId);
  if (pa) { pa.visible = pa.visible === false; return; }
  const style = getSelectedCellStyle() || column.style;
  if (!style) return;
  if (layerId === "title" && style.title) style.title.visible = style.title.visible === false;
  else if (layerId === "subtitle" && style.subtitle) style.subtitle.visible = style.subtitle.visible === false;
  else if (layerId === "background" && style.background) style.background.visible = style.background.visible === false;
  else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.assetLayers?.[idx]) style.assetLayers[idx].visible = style.assetLayers[idx].visible === false;
  } else {
    const dev = resolveDeviceLayer(style, layerId);
    if (dev) dev.visible = dev.visible === false;
  }
}

export function toggleLayerLockInModel(column, layerId) {
  const pa = resolvePanoramaAsset(layerId);
  if (pa) { pa.locked = !pa.locked; return; }
  const style = getSelectedCellStyle() || column.style;
  if (!style) return;
  if (layerId === "title" && style.title) style.title.locked = !style.title.locked;
  else if (layerId === "subtitle" && style.subtitle) style.subtitle.locked = !style.subtitle.locked;
  else if (layerId === "background" && style.background) style.background.locked = !style.background.locked;
  else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.assetLayers?.[idx]) style.assetLayers[idx].locked = !style.assetLayers[idx].locked;
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
  const pa = resolvePanoramaAsset(layerId);
  if (pa) { pa.zIndex = zIndex; return; }
  const style = getSelectedCellStyle() || column.style;
  if (!style) return;
  if (layerId === "title" && style.title) style.title.zIndex = zIndex;
  else if (layerId === "subtitle" && style.subtitle) style.subtitle.zIndex = zIndex;
  else if (layerId === "background" && style.background) style.background.zIndex = zIndex;
  else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.assetLayers?.[idx]) style.assetLayers[idx].zIndex = zIndex;
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
    const sources = mockupProject?.sources || [];
    sourceEl.innerHTML = sources.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
    if (activeDevice.sourceId) sourceEl.value = activeDevice.sourceId;
  }

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

  renderMkDecorations(style.decorations || []);
  renderMkAssetLayers(style.assetLayers || []);
  syncTransformPanelInputs(style, lid);

  const badge = document.getElementById("mockup-active-layer-badge");
  if (badge) {
    const m = lid && /^extra:(\d+)$/.exec(lid);
    badge.textContent = lid === "title" ? "Title Text" : lid === "subtitle" ? "Subtitle Text" : lid === "deviceOne" ? "Device Frame 1" : lid === "deviceTwo" ? "Device Frame 2" : m ? `Device Frame ${Number(m[1]) + 3}` : lid?.startsWith("asset:") ? "Asset Layer" : lid === "background" ? "Background" : "Page";
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
function syncObjectToolbar(style, layerId) {
  const hasSelection = !!layerId;
  const box = hasSelection ? getLayerBox(style, layerId) : null;
  const rot = document.getElementById("mk-obj-rotation");
  if (rot) rot.value = box ? Math.round(box.rotation ?? 0) : "";
  const op = document.getElementById("mk-obj-opacity");
  if (op) op.value = box ? Math.round((box.opacity ?? 1) * 100) : "";
  ["mk-obj-bring-front", "mk-obj-bring-fwd", "mk-obj-send-bwd", "mk-obj-send-back",
   "mk-obj-align-left", "mk-obj-align-center", "mk-obj-align-right",
   "mk-obj-align-top", "mk-obj-align-middle", "mk-obj-align-bottom",
   "mk-obj-flip-h", "mk-obj-flip-v", "mk-obj-rotation", "mk-obj-opacity",
   "mk-obj-duplicate", "mk-obj-delete"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !hasSelection;
  });
}

/** Wires the icon-only object toolbar -- every button proxies straight to
 *  its already-wired Transform-panel twin (setupInspectorEvents/
 *  setupTransformPanelEvents, both called at the same bootstrap point) via a
 *  plain .click()/change-event forward, so this is the exact same action
 *  and underlying function as the right sidebar, never a second
 *  implementation of the same behavior. Called once at bootstrap, same as
 *  setupTextToolbarEvents. */
export function setupObjectToolbarEvents() {
  const proxyClick = (fromId, toId) => {
    const from = document.getElementById(fromId);
    const to = document.getElementById(toId);
    if (from && to) from.onclick = () => to.click();
  };
  proxyClick("mk-obj-bring-front", "mk-bring-front");
  proxyClick("mk-obj-bring-fwd", "mk-bring-forward");
  proxyClick("mk-obj-send-bwd", "mk-send-backward");
  proxyClick("mk-obj-send-back", "mk-send-back");
  proxyClick("mk-obj-align-left", "mk-align-left");
  proxyClick("mk-obj-align-center", "mk-align-center");
  proxyClick("mk-obj-align-right", "mk-align-right");
  proxyClick("mk-obj-align-top", "mk-align-top");
  proxyClick("mk-obj-align-middle", "mk-align-middle");
  proxyClick("mk-obj-align-bottom", "mk-align-bottom");
  proxyClick("mk-obj-duplicate", "mk-duplicate-layer");
  proxyClick("mk-obj-delete", "mk-delete-layer");

  const proxyCheckbox = (fromId, toId) => {
    const from = document.getElementById(fromId);
    const to = document.getElementById(toId);
    if (from && to) from.onclick = () => { to.checked = !to.checked; to.dispatchEvent(new Event("change", { bubbles: true })); };
  };
  proxyCheckbox("mk-obj-flip-h", "mk-pos-flip-h");
  proxyCheckbox("mk-obj-flip-v", "mk-pos-flip-v");

  const proxyNumber = (fromId, toId) => {
    const from = document.getElementById(fromId);
    const to = document.getElementById(toId);
    if (!from || !to) return;
    from.addEventListener("change", () => { to.value = from.value; to.dispatchEvent(new Event("change", { bubbles: true })); });
  };
  proxyNumber("mk-obj-rotation", "mk-pos-rot");
  proxyNumber("mk-obj-opacity", "mk-pos-opacity");

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

  // Cell override checkbox
  const cellOverrideEl = document.getElementById("mk-cell-override");
  if (cellOverrideEl) {
    cellOverrideEl.onchange = async () => {
      if (!mockupProject || !selectedColumn) return;
      const { selectedCell } = await import('./matrix.js');
      if (!selectedCell || !selectedCell.deviceRowId) return;
      const key = `${selectedCell.deviceRowId}:${selectedCell.columnId}`;
      if (!mockupProject.cells) mockupProject.cells = {};
      if (cellOverrideEl.checked) {
        // Deep clone -- a shallow spread aliases nested sub-objects (deviceOne, title, ...)
        // with the base column style, so editing the "override" would silently mutate
        // every other device row's style too.
        mockupProject.cells[key] = JSON.parse(JSON.stringify(selectedColumn.style));
      } else {
        delete mockupProject.cells[key];
      }
      setMockupDirty(true);
      renderMockupMatrix();
      loadColumnIntoFabric(selectedColumn);
    };
  }

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
      if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, selectedLayerId);
      setMockupDirty(true);
      loadColumnIntoFabric(selectedColumn);
    };
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
  if (bringFront) {
    bringFront.onclick = () => { if (!selectedColumn) return; setLayerZIndex(selectedColumn, selectedLayerId, 100); renderMockupLayersPanel(selectedColumn); loadColumnIntoFabric(selectedColumn); };
  }
  if (bringFwd) {
    bringFwd.onclick = () => { if (!selectedColumn) return; const layers = buildScreenLayersModel(selectedColumn); const cur = layers.find(l => l.id === selectedLayerId); if (cur) setLayerZIndex(selectedColumn, selectedLayerId, (cur.zIndex || 10) + 1); renderMockupLayersPanel(selectedColumn); loadColumnIntoFabric(selectedColumn); };
  }
  if (sendBwd) {
    sendBwd.onclick = () => { if (!selectedColumn) return; const layers = buildScreenLayersModel(selectedColumn); const cur = layers.find(l => l.id === selectedLayerId); if (cur) setLayerZIndex(selectedColumn, selectedLayerId, Math.max(0, (cur.zIndex || 10) - 1)); renderMockupLayersPanel(selectedColumn); loadColumnIntoFabric(selectedColumn); };
  }
  if (sendBack) {
    sendBack.onclick = () => { if (!selectedColumn) return; setLayerZIndex(selectedColumn, selectedLayerId, 0); renderMockupLayersPanel(selectedColumn); loadColumnIntoFabric(selectedColumn); };
  }

  // Transform-panel z-order buttons (Section 2) -- same operations, separate button set.
  const tBringForward = document.getElementById("mk-bring-forward");
  const tSendBackward = document.getElementById("mk-send-backward");
  const tBringFront = document.getElementById("mk-bring-front");
  const tSendBack = document.getElementById("mk-send-back");
  if (tBringForward) tBringForward.onclick = () => bringFwd?.onclick();
  if (tSendBackward) tSendBackward.onclick = () => sendBwd?.onclick();
  if (tBringFront) tBringFront.onclick = () => bringFront?.onclick();
  if (tSendBack) tSendBack.onclick = () => sendBack?.onclick();

  // Duplicate / Delete layer (Section 2)
  const duplicateLayerBtn = document.getElementById("mk-duplicate-layer");
  if (duplicateLayerBtn) duplicateLayerBtn.onclick = () => duplicateSelectedLayer();
  const deleteLayerBtn = document.getElementById("mk-delete-layer");
  if (deleteLayerBtn) deleteLayerBtn.onclick = () => deleteSelectedLayer();

  // Position/Transform numeric fields + align buttons (Section 2, universal across layer types)
  setupTransformPanelEvents();

  // Add Asset Layer button & Add Sticker button
  const addAssetBtn = document.getElementById("mk-add-asset-layer-btn");
  if (addAssetBtn) {
    addAssetBtn.onclick = () => {
      const style = getSelectedCellStyle() || selectedColumn?.style;
      if (!style) return;
      if (!style.assetLayers) style.assetLayers = [];
      style.assetLayers.push({ xPct: 50, yPct: 50, widthPct: 30, heightPct: 40, rotation: 0, opacity: 1, customName: `Asset ${style.assetLayers.length + 1}` });
      setMockupDirty(true);
      renderMkAssetLayers(style.assetLayers);
      renderMockupLayersPanel(selectedColumn);
      loadColumnIntoFabric(selectedColumn);
    };
  }

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
const ARTBOARD_H = 1920;
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
export function getLayerBox(style, layerId) {
  if (layerId === "title" || layerId === "subtitle") {
    const t = style[layerId];
    if (!t) return null;
    // opacity was previously hardcoded to 1 here -- the universal Transform
    // panel's opacity field silently did nothing for text layers. Now reads
    // the same TextStyle.opacity field the text toolbar's slider writes.
    return { x: t.x ?? 54, y: t.y ?? (layerId === "title" ? 80 : 200), width: 972, height: layerId === "title" ? 120 : 80, rotation: t.rotation ?? 0, opacity: t.opacity ?? (layerId === "subtitle" ? 0.8 : 1) };
  }
  if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    const ast = style.assetLayers?.[idx];
    if (!ast) return null;
    const width = (ast.widthPct / 100) * ARTBOARD_W;
    const height = ast.heightPct ? (ast.heightPct / 100) * ARTBOARD_H : width * 1.4;
    // Top-left anchored, matching src/render/shared.ts's assetLayersMarkup()
    // (`left:${xPct}%; top:${yPct}%`) -- not centered.
    return {
      x: (ast.xPct / 100) * ARTBOARD_W,
      y: (ast.yPct / 100) * ARTBOARD_H,
      width, height,
      rotation: ast.rotation || 0,
      opacity: ast.opacity ?? 1,
    };
  }
  const dev = resolveDeviceLayer(style, layerId);
  if (dev) {
    const width = 480 * (dev.size / 90);
    const height = 960 * (dev.size / 90);
    const cx = ARTBOARD_W / 2 + (dev.x / 100) * ARTBOARD_W;
    const cy = deviceCenterYBase(layerId) + (dev.y / 100) * ARTBOARD_H;
    return { x: cx - width / 2, y: cy - height / 2, width, height, rotation: dev.rotation || 0, opacity: 1 };
  }
  return null;
}

/** Inverse of getLayerBox() -- writes a uniform artboard-px box back into
 *  whatever unit convention that layer type stores, mutating the style
 *  object in place (caller is responsible for persisting/re-rendering). */
export function setLayerBox(style, layerId, box) {
  if (layerId === "title" || layerId === "subtitle") {
    const t = style[layerId];
    if (!t) return;
    t.x = Math.round(box.x);
    t.y = Math.round(box.y);
    t.rotation = Math.round(box.rotation ?? 0);
    if (box.opacity != null) t.opacity = box.opacity;
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
    return;
  }
  const dev = resolveDeviceLayer(style, layerId);
  if (dev) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    dev.size = Math.round((box.width / 480) * 90);
    dev.x = Math.round(((cx - ARTBOARD_W / 2) / ARTBOARD_W) * 100);
    dev.y = Math.round(((cy - deviceCenterYBase(layerId)) / ARTBOARD_H) * 100);
    dev.rotation = Math.round(box.rotation ?? 0);
  }
}

/** Duplicates the selected layer within its own kind (assets get a sibling
 *  entry; device layers get appended to extraDevices, since deviceOne is
 *  mandatory and deviceTwo is layout-preset-controlled). Title/subtitle/
 *  background are singletons per screen and aren't duplicable. */
export function duplicateSelectedLayer() {
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
  loadColumnIntoFabric(selectedColumn);
}

/** Deletes the selected layer, when its kind supports removal (assets and
 *  extra device layers; deviceOne/deviceTwo/title/subtitle/background are
 *  structural singletons the schema always expects to exist).
 *
 *  Verifies against the LIVE Fabric selection at the exact moment this
 *  runs, not just the module's selectedLayerId variable -- a real bug:
 *  selectedLayerId is only ever written when something becomes selected,
 *  never cleared when the user deselects (clicks empty canvas), so it can
 *  go stale and still point at a layer that's no longer actually selected.
 *  Clicking Delete after deselecting would silently delete that stale
 *  previous layer -- exactly the "deletes something other than what's
 *  currently selected" failure mode this guards against. */
export async function deleteSelectedLayer() {
  if (!selectedColumn) return;
  const activeObj = mockupFabricCanvas?.getActiveObject?.();
  if (!activeObj || activeObj.layerId !== selectedLayerId) {
    showToast("No layer is currently selected.", "info");
    return;
  }
  const pa = resolvePanoramaAsset(selectedLayerId);
  const style0 = getSelectedCellStyle() || selectedColumn.style;
  const isAsset = selectedLayerId.startsWith("asset:");
  const isExtraDevice = /^extra:\d+$/.test(selectedLayerId);
  const isText = selectedLayerId === "title" || selectedLayerId === "subtitle";
  const isDeviceTwo = selectedLayerId === "deviceTwo";
  // deviceOne and background are the two truly structural, always-required
  // pieces of a page (ColumnStyle.deviceOne/background aren't optional
  // fields, and every layout preset assumes both exist) -- there's no
  // schema-safe meaning of "delete" for them without a much larger data
  // model change. Everything else genuinely CAN be removed: title/subtitle
  // via a soft-delete (hidden + cleared, since they're also required
  // fields, just ones a hidden/empty state can stand in for); assets,
  // extra devices, deviceTwo, and panorama assets via real removal from
  // their (optional) arrays/fields.
  if (!pa && !isAsset && !isExtraDevice && !isText && !isDeviceTwo) {
    showToast("This is the page's base device or background and can't be removed -- try the visibility toggle in the Layers panel instead.", "error");
    return;
  }
  const layers = buildScreenLayersModel(selectedColumn);
  const layerName = layers.find((l) => l.id === selectedLayerId)?.name || "this layer";
  const ok = await showConfirm(`This permanently removes "${layerName}" and cannot be undone.`, "Delete this layer?", true);
  if (!ok) return;

  if (pa) {
    const idx = mockupProject.panoramaAssets.indexOf(pa);
    if (idx !== -1) mockupProject.panoramaAssets.splice(idx, 1);
    setMockupDirty(true);
    setSelectedLayerId("deviceOne");
    renderMockupLayersPanel(selectedColumn);
    syncSection2Inputs(selectedColumn);
    // A panorama asset can show on more than one open canvas -- rebuild all
    // of them (setActivePage does this), not just the active page.
    setActivePage(selectedColumn.id);
    return;
  }
  const style = style0;
  if (!style) return;
  if (isAsset) {
    const idx = parseInt(selectedLayerId.split(":")[1], 10);
    if (!style.assetLayers?.[idx]) return;
    style.assetLayers.splice(idx, 1);
  } else if (isExtraDevice) {
    const idx = parseInt(selectedLayerId.split(":")[1], 10);
    if (!style.extraDevices?.[idx]) return;
    style.extraDevices.splice(idx, 1);
  } else if (isDeviceTwo) {
    style.deviceTwo = undefined;
  } else if (isText) {
    // Soft-delete: title/subtitle are required fields (every layout preset
    // reads style.title/style.subtitle unconditionally), so "removed" means
    // hidden and cleared rather than the field itself vanishing -- visually
    // and functionally equivalent to deletion (nothing renders, nothing
    // exports) without risking every render/canvas code path that assumes
    // these two always exist.
    const t = style[selectedLayerId];
    t.text = "";
    t.visible = false;
  }
  setMockupDirty(true);
  setSelectedLayerId("deviceOne");
  renderMockupLayersPanel(selectedColumn);
  syncSection2Inputs(selectedColumn);
  loadColumnIntoFabric(selectedColumn);
  showToast(`"${layerName}" deleted.`, "success");
}

/** Wires the universal Position & Transform card (Section 2): numeric
 *  X/Y/W/H/rotation/opacity fields, flip checkboxes (asset layers only),
 *  and align-to-artboard buttons. Fields read/write via getLayerBox/
 *  setLayerBox so one code path covers every transformable layer kind. */
export function setupTransformPanelEvents() {
  const $id = (id) => document.getElementById(id);
  const fields = ["mk-pos-x", "mk-pos-y", "mk-pos-w", "mk-pos-h", "mk-pos-rot", "mk-pos-opacity"];

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
      else if (id === "mk-pos-rot") commit({ rotation: v });
      else if (id === "mk-pos-opacity") commit({ opacity: v / 100 });
    };
  }

  const flipH = $id("mk-pos-flip-h");
  const flipV = $id("mk-pos-flip-v");
  if (flipH) flipH.onchange = () => { const ctx = currentBox(); const idx = selectedLayerId.startsWith("asset:") ? parseInt(selectedLayerId.split(":")[1], 10) : -1; const ast = ctx?.style.assetLayers?.[idx]; if (!ast) return; ast.flipH = flipH.checked; setMockupDirty(true); loadColumnIntoFabric(selectedColumn); };
  if (flipV) flipV.onchange = () => { const ctx = currentBox(); const idx = selectedLayerId.startsWith("asset:") ? parseInt(selectedLayerId.split(":")[1], 10) : -1; const ast = ctx?.style.assetLayers?.[idx]; if (!ast) return; ast.flipV = flipV.checked; setMockupDirty(true); loadColumnIntoFabric(selectedColumn); };

  const align = (fn) => () => { const ctx = currentBox(); if (!ctx || !ctx.box) return; commit(fn(ctx.box)); syncSection2Inputs(selectedColumn); };
  if ($id("mk-align-left")) $id("mk-align-left").onclick = align((b) => ({ x: 0 }));
  if ($id("mk-align-center")) $id("mk-align-center").onclick = align((b) => ({ x: (ARTBOARD_W - b.width) / 2 }));
  if ($id("mk-align-right")) $id("mk-align-right").onclick = align((b) => ({ x: ARTBOARD_W - b.width }));
  if ($id("mk-align-top")) $id("mk-align-top").onclick = align((b) => ({ y: 0 }));
  if ($id("mk-align-middle")) $id("mk-align-middle").onclick = align((b) => ({ y: (ARTBOARD_H - b.height) / 2 }));
  if ($id("mk-align-bottom")) $id("mk-align-bottom").onclick = align((b) => ({ y: ARTBOARD_H - b.height }));

  const addDeviceLayerBtn = $id("mk-add-device-layer-btn");
  if (addDeviceLayerBtn) {
    addDeviceLayerBtn.onclick = () => {
      if (!selectedColumn) return;
      const style = getSelectedCellStyle() || selectedColumn.style;
      if (!style) return;
      if (!style.extraDevices) style.extraDevices = [];
      style.extraDevices.push({ size: 70, x: 0, y: 0, rotation: 0, brightness: 100, frameless: false, customName: `Device Frame ${style.extraDevices.length + 3}` });
      setMockupDirty(true);
      setSelectedLayerId(`extra:${style.extraDevices.length - 1}`);
      renderMockupLayersPanel(selectedColumn);
      syncSection2Inputs(selectedColumn);
      loadColumnIntoFabric(selectedColumn);
    };
  }

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
  set("mk-pos-rot", Math.round(box.rotation));
  set("mk-pos-opacity", Math.round((box.opacity ?? 1) * 100));
  if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    const ast = style.assetLayers?.[idx];
    const flipH = document.getElementById("mk-pos-flip-h");
    const flipV = document.getElementById("mk-pos-flip-v");
    if (flipH) flipH.checked = !!ast?.flipH;
    if (flipV) flipV.checked = !!ast?.flipV;
  }

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

export async function renderMockupDevicesSection() {
  const list = document.getElementById("mockup-device-list");
  if (list) list.innerHTML = "";
  if (!mockupProject) return;
  const selectEl = document.getElementById("mockup-preview-device");
  if (selectEl) selectEl.innerHTML = (mockupProject.devices || []).map((d) => `<option value="${d.id}">${d.label}</option>`).join("");

  if (list && Array.isArray(mockupProject.devices)) {
    for (const row of mockupProject.devices) {
      const el = document.createElement("div");
      el.className = "provider-row";
      el.innerHTML = `
        <span class="provider-name">${row.label}</span>
        <span class="provider-meta">${row.deviceId}${row.isBase ? " (base)" : ""}</span>
        <label class="checkbox-row" style="margin:0"><input type="checkbox" ${row.previewsVisible ? "checked" : ""} class="row-visible" /> Visible</label>
        <button class="small danger" type="button">Remove</button>
      `;
      el.querySelector(".row-visible").onchange = async (e) => {
        await api(`/api/mockups/${mockupId}/devices/${row.id}`, { method: "PATCH", body: { previewsVisible: e.target.checked } });
        const updated = await api(`/api/mockups/${mockupId}`);
        setMockupProject(updated);
      };
      el.querySelector("button.danger").onclick = async () => {
        await api(`/api/mockups/${mockupId}/devices/${row.id}`, { method: "DELETE" });
        const updated = await api(`/api/mockups/${mockupId}`);
        setMockupProject(updated);
        renderMockupDevicesSection();
        renderMockupMatrix();
      };
      list.appendChild(el);
    }
  }

  // Populate 2D SVG Device Frame Library Grid
  const grid = document.getElementById("mockup-device-library-grid");
  if (grid) {
    grid.innerHTML = '<div style="color:var(--text-secondary)">Loading device frame catalog…</div>';
    try {
      const { devices } = await api("/api/mockups/devices-library");
      grid.innerHTML = "";
      for (const dev of devices) {
        const card = document.createElement("div");
        card.className = "device-lib-card";
        card.innerHTML = `
          <div class="device-lib-title">${dev.name}</div>
          <div class="device-lib-meta">${dev.category.toUpperCase()} &bull; ${dev.aspectRatio}</div>
          <div style="font-size:12px; color:var(--text-tertiary); margin-top:4px;">${dev.width} &times; ${dev.height} px</div>
          <button class="small secondary" type="button" style="margin-top:12px; width:100%">Replace Base Frame</button>
        `;
        card.querySelector("button").onclick = async () => {
          if (!mockupProject) return;
          const baseDevice = (mockupProject.devices || []).find((d) => d.isBase) || mockupProject.devices?.[0];
          if (baseDevice) {
            baseDevice.deviceId = dev.id;
            baseDevice.label = dev.name;
            await saveCurrentMockupProject();
            renderMockupCanvas();
            renderMockupMatrix();
            renderMockupDevicesSection();
            await showAlert(`Updated base device frame to ${dev.name}.`);
          }
        };
        grid.appendChild(card);
      }
    } catch (err) {
      grid.innerHTML = `<div style="color:var(--danger)">Failed to load device library: ${err.message}</div>`;
    }
  }
}

