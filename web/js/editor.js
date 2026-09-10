// Editor module — right-hand inspector sidebar, property forms, layer panel,
// and layer selection routing.

import {
  selectedColumn,
  selectedLayerId,
  setSelectedLayerId,
  setMockupDirty,
  mockupProject,
  mockupFabricCanvas
} from './state.js';
import { escapeHtml } from './utils.js';
import { loadColumnIntoFabric } from './canvas.js';

export function switchInspectorTab(tabId) {
  const tabs = document.querySelectorAll("#mockup-inspector .tab");
  const panels = document.querySelectorAll("#mockup-inspector .tab-panel");
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tabId));
  panels.forEach(p => p.classList.toggle("active", p.id === `tab-inspect-${tabId}`));
}

export function routeInspectorForLayer(layerId) {
  if (layerId === 'title' || layerId === 'subtitle') switchInspectorTab('text');
  else if (layerId === 'deviceOne' || layerId === 'deviceTwo') switchInspectorTab('dev');
  else if (layerId?.startsWith('asset:') || layerId?.startsWith('decoration:')) switchInspectorTab('asset');
  else switchInspectorTab('col');
}

export function buildScreenLayersModel(column) {
  if (!column || !column.style) return [];
  const style = column.style;
  const layers = [];

  // Device 1
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

  // Device 2
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

  // Title
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

  // Subtitle
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

  // Asset layers
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

  // Decorations / Badges / Stickers
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

  // Background
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

  // Sort descending by zIndex for Layers List display (topmost layer on top)
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

export function setCustomLayerName(column, layerId, name) {
  if (!column || !column.style) return;
  const style = column.style;
  if (layerId === "title" && style.title) style.title.customName = name;
  else if (layerId === "subtitle" && style.subtitle) style.subtitle.customName = name;
  else if (layerId === "deviceOne" && style.deviceOne) style.deviceOne.customName = name;
  else if (layerId === "deviceTwo" && style.deviceTwo) style.deviceTwo.customName = name;
  else if (layerId === "background" && style.background) style.background.customName = name;
  else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.assetLayers && style.assetLayers[idx]) style.assetLayers[idx].customName = name;
  } else if (layerId.startsWith("decoration:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.decorations && style.decorations[idx]) style.decorations[idx].customName = name;
  }
}

export function toggleLayerVisibilityInModel(column, layerId) {
  if (!column || !column.style) return;
  const style = column.style;
  if (layerId === "title" && style.title) style.title.visible = style.title.visible === false;
  else if (layerId === "subtitle" && style.subtitle) style.subtitle.visible = style.subtitle.visible === false;
  else if (layerId === "deviceOne" && style.deviceOne) style.deviceOne.visible = style.deviceOne.visible === false;
  else if (layerId === "deviceTwo" && style.deviceTwo) style.deviceTwo.visible = style.deviceTwo.visible === false;
  else if (layerId === "background" && style.background) style.background.visible = style.background.visible === false;
  else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.assetLayers?.[idx]) style.assetLayers[idx].visible = style.assetLayers[idx].visible === false;
  } else if (layerId.startsWith("decoration:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.decorations?.[idx]) style.decorations[idx].visible = style.decorations[idx].visible === false;
  }
}

export function toggleLayerLockInModel(column, layerId) {
  if (!column || !column.style) return;
  const style = column.style;
  if (layerId === "title" && style.title) style.title.locked = !style.title.locked;
  else if (layerId === "subtitle" && style.subtitle) style.subtitle.locked = !style.subtitle.locked;
  else if (layerId === "deviceOne" && style.deviceOne) style.deviceOne.locked = !style.deviceOne.locked;
  else if (layerId === "deviceTwo" && style.deviceTwo) style.deviceTwo.locked = !style.deviceTwo.locked;
  else if (layerId === "background" && style.background) style.background.locked = !style.background.locked;
  else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.assetLayers?.[idx]) style.assetLayers[idx].locked = !style.assetLayers[idx].locked;
  } else if (layerId.startsWith("decoration:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.decorations?.[idx]) style.decorations[idx].locked = !style.decorations[idx].locked;
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
      item.classList.remove("drag-over-top", "drag-over-bottom");
      if (!draggedItem || draggedItem === item) return;
      const fromId = draggedItem.dataset.layerId;
      const toId = item.dataset.layerId;

      reorderLayersInModel(column, fromId, toId);
      setSelectedLayerId(fromId);
      setMockupDirty(true);
      renderMockupLayersPanel(column);
      loadColumnIntoFabric(column);
    });
  });
}

export function reorderLayersInModel(column, fromId, toId) {
  if (!column || !column.style) return;

  if (fromId.startsWith("asset:") && toId.startsWith("asset:")) {
    const fromIdx = parseInt(fromId.split(":")[1], 10);
    const toIdx = parseInt(toId.split(":")[1], 10);
    const assets = column.style.assetLayers;
    if (assets && fromIdx >= 0 && toIdx >= 0 && fromIdx < assets.length && toIdx < assets.length) {
      const [moved] = assets.splice(fromIdx, 1);
      assets.splice(toIdx, 0, moved);
      return;
    }
  }

  const layers = buildScreenLayersModel(column);
  const fromLayer = layers.find((l) => l.id === fromId);
  const toLayer = layers.find((l) => l.id === toId);

  if (fromLayer && toLayer) {
    const tempZ = fromLayer.zIndex || 10;
    setLayerZIndex(column, fromId, toLayer.zIndex || 10);
    setLayerZIndex(column, toId, tempZ);
  }
}

export function setLayerZIndex(column, layerId, zIndex) {
  const style = column.style;
  if (layerId === "title" && style.title) style.title.zIndex = zIndex;
  else if (layerId === "subtitle" && style.subtitle) style.subtitle.zIndex = zIndex;
  else if (layerId === "deviceOne" && style.deviceOne) style.deviceOne.zIndex = zIndex;
  else if (layerId === "deviceTwo" && style.deviceTwo) style.deviceTwo.zIndex = zIndex;
  else if (layerId === "background" && style.background) style.background.zIndex = zIndex;
  else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (style.assetLayers?.[idx]) style.assetLayers[idx].zIndex = zIndex;
  }
}

export function syncSection2Inputs(col, layerId) {
  if (!col || !col.style) return;
  const lid = layerId || selectedLayerId;
  const style = col.style;

  const titleInput = document.getElementById("mk-title-text");
  if (titleInput && style.title) titleInput.value = style.title.text || "";

  const subtitleInput = document.getElementById("mk-subtitle-text");
  if (subtitleInput && style.subtitle) subtitleInput.value = style.subtitle.text || "";

  const badge = document.getElementById("mockup-active-layer-badge");
  if (badge) {
    badge.textContent = lid === "title" ? "Title Text" : lid === "subtitle" ? "Subtitle Text" : lid === "deviceOne" ? "Device Frame 1" : lid === "deviceTwo" ? "Device Frame 2" : lid?.startsWith("asset:") ? "Asset Layer" : lid === "background" ? "Background" : "Screen";
  }
}

