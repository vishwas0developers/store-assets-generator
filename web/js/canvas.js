// Canvas module — Fabric.js stage lifecycle, object rendering, and coordinate sync.
// Handles single-artboard canvas initialization, template loading into Fabric,
// device presentation transforms, and background gradient/solid/pattern fills.

import {
  mockupFabricCanvas,
  selectedColumn,
  selectedLayerId,
  mockupId,
  setMockupDirty,
  setSelectedLayerId,
  setMockupFabricCanvas,
} from './state.js';
import {
  resolveFabricBackgroundFill,
  resolveDeviceGeometry,
  getLayoutPresetClient,
  presentationTransformClient,
  rgbToHex,
  getDeviceCoordsFromFabricObject,
  loadFabricImageAsync,
} from './utils.js';
import { syncSection2Inputs } from './editor.js';
import { saveCurrentMockupProject, pushMockupHistory, mockupProject } from './state.js';

/**
 * Initializes the primary interactive Fabric.js canvas (1080×1920 reference resolution).
 * Re-disposes old instance if canvas already exists.
 */
export function initMockupFabricCanvas() {
  const canvasEl = document.getElementById("mockup-fabric-canvas");
  if (!canvasEl) return;

  const fabric = window.fabric;
  if (!fabric) return;

  if (mockupFabricCanvas) {
    mockupFabricCanvas.dispose();
    setMockupFabricCanvas(null);
  }

  const canvas = new fabric.Canvas('mockup-fabric-canvas', {
    width: 1080,
    height: 1920,
    preserveObjectStacking: true,
    selection: true,
    renderOnAddRemove: true,
    backgroundColor: '#0f172a'
  });

  canvas.on('object:modified', onFabricObjectModified);
  canvas.on('selection:created', onFabricSelectionCreated);
  canvas.on('selection:updated', onFabricSelectionUpdated);
  canvas.on('text:changed', onFabricTextChanged);

  setMockupFabricCanvas(canvas);
}

function onFabricObjectModified(e) {
  const obj = e.target;
  if (!obj || !obj.layerId) return;
  syncFabricObjectToModel(obj);
}

function onFabricSelectionCreated(e) {
  const obj = e.selected?.[0];
  if (!obj || !obj.layerId) return;
  setSelectedLayerId(obj.layerId);
  if (selectedColumn) {
    if (typeof window.renderMockupLayersPanel === 'function') window.renderMockupLayersPanel(selectedColumn);
    if (typeof window.syncSection2Inputs === 'function') window.syncSection2Inputs(selectedColumn, obj.layerId);
    if (typeof window.routeInspectorForLayer === 'function') window.routeInspectorForLayer(obj.layerId);
  }
}

function onFabricSelectionUpdated(e) {
  const obj = e.selected?.[0];
  if (!obj || !obj.layerId) return;
  setSelectedLayerId(obj.layerId);
  if (selectedColumn) {
    if (typeof window.renderMockupLayersPanel === 'function') window.renderMockupLayersPanel(selectedColumn);
    if (typeof window.syncSection2Inputs === 'function') window.syncSection2Inputs(selectedColumn, obj.layerId);
    if (typeof window.routeInspectorForLayer === 'function') window.routeInspectorForLayer(obj.layerId);
  }
}

function onFabricTextChanged(e) {
  const obj = e.target;
  if (!obj || !obj.layerId || !selectedColumn) return;
  if (obj.layerId === 'title') {
    selectedColumn.style.title.text = obj.text;
  } else if (obj.layerId === 'subtitle') {
    selectedColumn.style.subtitle.text = obj.text;
  }
  setMockupDirty(true);
  if (typeof window.syncSection2Inputs === 'function') window.syncSection2Inputs(selectedColumn, obj.layerId);
}

/**
 * Synchronizes modifications made directly on Fabric stage objects back into column style data model.
 * @param {object} obj
 */
export function syncFabricObjectToModel(obj) {
  if (!obj || !obj.layerId || !selectedColumn) return;
  const style = selectedColumn.style;

  switch (obj.layerId) {
    case 'title':
      if (obj.text !== undefined) style.title.text = obj.text;
      if (obj.fill !== undefined) style.title.color = rgbToHex(obj.fill);
      if (obj.fontSize !== undefined) style.title.size = obj.fontSize;
      if (obj.textAlign !== undefined) style.title.align = obj.textAlign;
      if (obj.angle !== undefined) style.title.rotation = obj.angle;
      break;

    case 'subtitle':
      if (obj.text !== undefined) style.subtitle.text = obj.text;
      if (obj.fill !== undefined) style.subtitle.color = rgbToHex(obj.fill);
      if (obj.fontSize !== undefined) style.subtitle.size = obj.fontSize;
      if (obj.textAlign !== undefined) style.subtitle.align = obj.textAlign;
      if (obj.angle !== undefined) style.subtitle.rotation = obj.angle;
      break;

    case 'deviceOne': {
      const coords = getDeviceCoordsFromFabricObject(obj, selectedColumn, 'deviceOne');
      if (coords) {
        const preset = getLayoutPresetClient(style.layout);
        const transform = presentationTransformClient(preset.presentation);
        style.deviceOne.x = coords.xPct;
        style.deviceOne.y = coords.yPct;
        style.deviceOne.size = coords.size;
        style.deviceOne.rotation = (obj.angle ?? 0) - (transform.d1.rotate || 0);
      }
      break;
    }

    case 'deviceTwo': {
      const coords = getDeviceCoordsFromFabricObject(obj, selectedColumn, 'deviceTwo');
      if (coords) {
        const preset = getLayoutPresetClient(style.layout);
        const transform = presentationTransformClient(preset.presentation);
        if (style.deviceTwo) {
          style.deviceTwo.x = coords.xPct;
          style.deviceTwo.y = coords.yPct;
          style.deviceTwo.size = coords.size;
          style.deviceTwo.rotation = (obj.angle ?? 0) - (transform.d2 ? transform.d2.rotate || 0 : 0);
        }
      }
      break;
    }

    default: {
      if (obj.layerId?.startsWith('asset:')) {
        const idx = parseInt(obj.layerId.split(':')[1], 10);
        const ast = style.assetLayers && style.assetLayers[idx];
        if (ast) {
          if (obj.left !== undefined) ast.xPct = Math.round(((obj.left + (obj.width || 0) / 2) / 1080) * 100);
          if (obj.top !== undefined) ast.yPct = Math.round(((obj.top + (obj.height || 0) / 2) / 1920) * 100);
          if (obj.width !== undefined) ast.widthPct = Math.round((obj.width / 1080) * 100);
          if (obj.height !== undefined) ast.heightPct = Math.round((obj.height / 1920) * 100);
          if (obj.angle !== undefined) ast.rotation = obj.angle;
          if (obj.opacity !== undefined) ast.opacity = obj.opacity;
          if (obj.flipX !== undefined) ast.flipH = obj.flipX;
          if (obj.flipY !== undefined) ast.flipV = obj.flipY;
        }
      }
      break;
    }
  }
  setMockupDirty(true);
  if (typeof window.syncSection2Inputs === 'function') window.syncSection2Inputs(selectedColumn, obj.layerId);
  if (typeof window.renderMockupMatrix === 'function') window.renderMockupMatrix();
}

/**
 * Loads a column's style, presentation transform, device models, and asset layers into Fabric stage.
 * @param {object} column
 */
export async function loadColumnIntoFabric(column) {
  if (!mockupFabricCanvas) initMockupFabricCanvas();
  if (!mockupFabricCanvas || !column) return;

  const fabric = window.fabric;
  if (!fabric) return;

  mockupFabricCanvas.clear();
  const style = column.style;
  const preset = getLayoutPresetClient(style.layout);
  const transform = presentationTransformClient(preset.presentation);

  // 1. Background Layer -- mirrors src/render/shared.ts resolveBackground()
  const bg = style.background || { type: 'gradient', value: 'ocean' };
  let bgObj = null;
  if (bg.type === 'image' && bg.imageFile && mockupId) {
    const imgUrl = `/api/mockups/${mockupId}/file?p=${encodeURIComponent(bg.imageFile)}`;
    const img = await loadFabricImageAsync(imgUrl);
    if (img) {
      img.set({ left: 0, top: 0, selectable: false, evented: false, name: 'background', layerId: 'background' });
      const scale = Math.max(1080 / img.width, 1920 / img.height);
      img.scaleX = scale;
      img.scaleY = scale;
      bgObj = img;
    }
  }
  if (!bgObj) {
    bgObj = new fabric.Rect({
      left: 0, top: 0, width: 1080, height: 1920,
      fill: resolveFabricBackgroundFill(bg),
      selectable: false,
      evented: false,
      name: 'background',
      layerId: 'background'
    });
  }
  mockupFabricCanvas.add(bgObj);
  mockupFabricCanvas.sendObjectToBack(bgObj);

  const PAD = 1080 * 0.06;
  const showText = preset.textPosition !== 'no-text';
  const textBelow = preset.textPosition.endsWith('below');
  const isCaption = preset.textPosition.startsWith('caption');

  // 2. Title Layer
  const t = style.title || { text: '', color: '#ffffff', size: 58, align: 'center', rotation: 0 };
  const titleSize = isCaption ? Math.round((t.size || 58) * 0.72) : (t.size || 58);
  const titleY = t.y ?? (showText ? (textBelow ? 1920 - PAD - 160 : PAD) : PAD);
  const titleText = new fabric.Textbox(t.text || '', {
    left: t.x ?? PAD,
    top: titleY,
    width: 1080 - PAD * 2,
    fontSize: titleSize,
    fill: t.color || '#ffffff',
    textAlign: t.align || 'center',
    angle: t.rotation || 0,
    fontWeight: 'bold',
    name: 'title',
    layerId: 'title',
    visible: showText && t.visible !== false,
    selectable: !t.locked,
    evented: !t.locked
  });
  mockupFabricCanvas.add(titleText);

  // 3. Subtitle Layer
  const s = style.subtitle || { text: '', color: '#94a3b8', size: 36, align: 'center', rotation: 0 };
  const subtitleY = s.y ?? (titleY + titleSize * 1.6);
  const subtitleText = new fabric.Textbox(s.text || '', {
    left: s.x ?? PAD,
    top: subtitleY,
    width: 1080 - PAD * 2,
    fontSize: s.size || 36,
    fill: s.color || '#94a3b8',
    textAlign: s.align || 'center',
    angle: s.rotation || 0,
    fontWeight: 'normal',
    name: 'subtitle',
    layerId: 'subtitle',
    visible: showText && s.visible !== false,
    selectable: !s.locked,
    evented: !s.locked
  });
  mockupFabricCanvas.add(subtitleText);

  // Stage dimensions & centering offsets
  const copyH = showText ? titleSize * 1.6 + (s.size || 36) * 1.2 + 1920 * 0.04 : 0;
  const stageTop = showText && !textBelow ? PAD + copyH : PAD;
  const stageBottom = showText && textBelow ? 1920 - PAD - copyH : 1920 - PAD;
  const stageCx = 540;
  const stageCy = (stageTop + stageBottom) / 2;

  // 4. Device One
  const d1 = style.deviceOne || { size: 90, x: 0, y: 0, rotation: 0, brightness: 100 };
  // Use the real device aspect ratio from the registry rather than a fixed 480x960
  // so the editor canvas matches the server-rendered template (real corner
  // radius, screen inset, dimensions per device model).
  const d1Geo = resolveDeviceGeometry(d1.id || 'phone');
  const d1BaseW = d1Geo.width;
  const d1BaseH = d1Geo.height;
  const d1Scale = d1.size / 90;
  const d1W = d1BaseW * d1Scale;
  const d1H = d1BaseH * d1Scale;
  const d1Cx = stageCx + ((transform.d1.xPct + d1.x) / 100) * d1W;
  const d1Cy = stageCy + (d1.y / 100) * d1H;
  const d1Left = d1Cx - d1W / 2;
  const d1Top = d1Cy - d1H / 2;
  const d1Rotation = (transform.d1.rotate || 0) + (d1.rotation || 0);

  const deviceOne = await buildDeviceGroup(d1, 'deviceOne', d1Left, d1Top, d1W, d1H, d1Rotation);
  if (deviceOne) {
    mockupFabricCanvas.add(deviceOne);
  }

  // 5. Device Two (if exists)
  const d2 = style.deviceTwo;
  if (d2 && preset.twoDevices && transform.d2) {
    const d2Geo = resolveDeviceGeometry(d2.id || 'phone');
    const d2Scale = d2.size / 90;
    const d2W = d2Geo.width * d2Scale;
    const d2H = d2Geo.height * d2Scale;
    const d2Cx = stageCx + ((transform.d2.xPct + d2.x) / 100) * d2W;
    const d2Cy = stageCy + ((transform.d2.yPct + d2.y) / 100) * d2H;
    const d2Left = d2Cx - d2W / 2;
    const d2Top = d2Cy - d2H / 2;
    const d2Rotation = (transform.d2.rotate || 0) + (d2.rotation || 0);
    const deviceTwo = await buildDeviceGroup(d2, 'deviceTwo', d2Left, d2Top, d2W, d2H, d2Rotation);
    if (deviceTwo) {
      mockupFabricCanvas.add(deviceTwo);
    }
  }

  // 6. Asset Layers
  if (style.assetLayers) {
    for (let i = 0; i < style.assetLayers.length; i++) {
      const ast = style.assetLayers[i];
      if (ast.visible === false) continue;
      const w = (ast.widthPct / 100) * 1080;
      const h = ast.heightPct ? (ast.heightPct / 100) * 1920 : w * 1.4;
      const left = (ast.xPct / 100) * 1080 - w / 2;
      const top = (ast.yPct / 100) * 1920 - h / 2;
      const srcUrl = ast.assetId.startsWith('sources/')
        ? `/api/mockups/${mockupId}/file?p=${encodeURIComponent(ast.assetId)}`
        : `/api/mockups/${mockupId}/file?p=sources/${ast.assetId}.png`;

      const assetImg = await loadFabricImageAsync(srcUrl);
      if (assetImg) {
        assetImg.set({
          left,
          top,
          angle: ast.rotation || 0,
          opacity: ast.opacity ?? 1,
          flipX: !!ast.flipH,
          flipY: !!ast.flipV,
          name: `asset:${i}`,
          layerId: `asset:${i}`,
          zIndex: ast.zIndex || 15,
          selectable: !ast.locked,
          evented: !ast.locked
        });
        assetImg.scaleX = w / assetImg.width;
        assetImg.scaleY = h / assetImg.height;
        mockupFabricCanvas.add(assetImg);
        if (ast.zIndex && mockupFabricCanvas.moveObjectTo) mockupFabricCanvas.moveObjectTo(assetImg, ast.zIndex);
      }
    }
  }

  mockupFabricCanvas.requestRenderAll();

  // Restore selected layer selection
  if (selectedLayerId) {
    const target = mockupFabricCanvas.getObjects().find((o) => o.layerId === selectedLayerId);
    if (target) {
      mockupFabricCanvas.setActiveObject(target);
      mockupFabricCanvas.requestRenderAll();
    }
  }
}

/**
 * Builds a Fabric Group containing bezel frame and screenshot image.
 */
export async function buildDeviceGroup(device, layerId, left, top, width, height, rotation) {
  const fabric = window.fabric;
  if (!fabric) return null;

  const items = [];
  const isFrameless = device.frameless;

  // Resolve real device geometry from the inline registry instead of
  // the hardcoded 480×960 aspect ratio. This ensures device frames
  // match real per-device dimensions (width/height/cornerRadius/screenInset).
  const geo = resolveDeviceGeometry(device.id || 'phone');
  const devW = geo.width;
  const devH = geo.height;
  const devCorner = geo.cornerRadius ?? 36;
  const screenInset = geo.screenInset;

  // Bezel frame (rounded rect) using real device dimensions
  if (!isFrameless) {
    const bezel = new fabric.Rect({
      left: 0,
      top: 0,
      width: devW,
      height: devH,
      rx: devCorner,
      ry: devCorner,
      fill: '#1e293b',
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false
    });
    items.push(bezel);
  }

  // Screenshot image
  if (device.sourceId && mockupId) {
    const imgUrl = `/api/mockups/${mockupId}/file?p=sources/${device.sourceId}.png`;
    const screen = await loadFabricImageAsync(imgUrl);
    if (screen) {
      const sLeft = isFrameless ? 0 : (screenInset?.left ?? 30);
      const sTop = isFrameless ? 0 : (screenInset?.top ?? 30);
      const sWidth = isFrameless ? devW : (screenInset?.width ?? (devW - 60));
      const sHeight = isFrameless ? devH : (screenInset?.height ?? (devH - 60));
      screen.set({
        left: sLeft,
        top: sTop,
        originX: 'left',
        originY: 'top',
        selectable: false,
        evented: false
      });
      screen.scaleX = sWidth / screen.width;
      screen.scaleY = sHeight / screen.height;
      items.push(screen);
    }
  } else {
    // Placeholder text box
    const placeholder = new fabric.Textbox('No Screenshot', {
      left: 0,
      top: 0,
      width: devW,
      height: devH,
      textAlign: 'center',
      originX: 'left',
      originY: 'top',
      fill: '#64748b',
      fontSize: 24,
      fontFamily: 'sans-serif',
      selectable: false,
      evented: false
    });
    items.push(placeholder);
  }

  if (items.length === 0) return null;

  const group = new fabric.Group(items, {
    left,
    top,
    angle: rotation,
    name: layerId,
    layerId,
    visible: device.visible !== false,
    selectable: !device.locked,
    evented: !device.locked,
    shadow: !isFrameless ? new fabric.Shadow({
      color: 'rgba(0,0,0,0.5)',
      blur: 30,
      offsetX: 0,
      offsetY: 25
    }) : null
  });

  // Scale group so its dimensions match the requested width and height
  if (devW > 0 && devH > 0) {
    group.scaleX = width / devW;
    group.scaleY = height / devH;
  }

  return group;
}

// Zoom, Pan & Viewport State
export let stageZoomRatio = 0.2;
export let canvasPan = { x: 0, y: 0 };
let panStart = { x: 0, y: 0 };
let isSpacePressed = false;
let isPanning = false;

export function _fitZoomForViewport() {
  const vp = document.getElementById("mockup-canvas-viewport");
  if (!vp) return 0.2;
  const pad = 24;
  const availW = vp.clientWidth - pad * 2;
  const availH = vp.clientHeight - pad * 2;
  if (availW <= 0 || availH <= 0) return 0.2;
  return Math.max(0.08, Math.min(availW / 1080, availH / 1920));
}

export function applyCanvasTransform() {
  const stage = document.getElementById("mockup-canvas-stage");
  if (!stage) return;
  stage.style.transform = `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${stageZoomRatio})`;
  stage.style.transformOrigin = "top left";
  const badge = document.getElementById("mockup-zoom-level");
  if (badge) badge.textContent = `${Math.round(stageZoomRatio * 100)}%`;
}

export function setStageZoomAndCenter(zoom) {
  const vp = document.getElementById("mockup-canvas-viewport");
  if (!vp) return;
  stageZoomRatio = zoom;
  const availW = vp.clientWidth;
  const availH = vp.clientHeight;
  canvasPan = {
    x: Math.round((availW - 1080 * zoom) / 2),
    y: Math.max(20, Math.round((availH - 1920 * zoom) / 2))
  };
  applyCanvasTransform();
  if (typeof moveableInstance !== "undefined" && moveableInstance) {
    try { moveableInstance.updateRect(); } catch (_) {}
  }
}

export function centerArtboardInViewport() {
  const zoom = _fitZoomForViewport();
  setStageZoomAndCenter(zoom);
}

export function initCanvasPanZoomEvents() {
  const viewport = document.getElementById("mockup-canvas-viewport");
  if (!viewport || viewport._panZoomInitialized) return;
  viewport._panZoomInitialized = true;

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
      if (!isSpacePressed) {
        isSpacePressed = true;
        viewport.classList.add("panning");
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      isSpacePressed = false;
      if (!isPanning) viewport.classList.remove("panning");
    }
  });

  viewport.addEventListener("mousedown", (e) => {
    if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
      e.preventDefault();
      isPanning = true;
      viewport.classList.add("panning");
      panStart = { x: e.clientX - canvasPan.x, y: e.clientY - canvasPan.y };
    }
  });

  window.addEventListener("mouseup", () => {
    if (isPanning) {
      isPanning = false;
      if (!isSpacePressed) viewport.classList.remove("panning");
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    canvasPan = { x: e.clientX - panStart.x, y: e.clientY - panStart.y };
    applyCanvasTransform();
  });

  viewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.ctrlKey ? 0.95 : 0.92;
    const oldRatio = stageZoomRatio;
    const newRatio = Math.max(0.08, Math.min(3.0, stageZoomRatio * (e.deltaY < 0 ? 1 / zoomFactor : zoomFactor)));

    if (newRatio === oldRatio) return;

    canvasPan.x = mouseX - (mouseX - canvasPan.x) * (newRatio / oldRatio);
    canvasPan.y = mouseY - (mouseY - canvasPan.y) * (newRatio / oldRatio);
    stageZoomRatio = newRatio;

    applyCanvasTransform();
  }, { passive: false });
}

export function renderMockupCanvas() {
  applyCanvasTransform();
  loadColumnIntoFabric(selectedColumn);
}

let moveableInstance = null;

export function initMoveableForCanvas(selectedColumn) {
  const artboard = document.getElementById("mockup-canvas-artboard");
  if (!artboard) return;

  let targetEl = artboard.querySelector(`[data-layer-id="${selectedLayerId}"]`);
  if (!targetEl) {
    targetEl = artboard.querySelector("[data-layer-id]:not([data-layer-id='background'])");
  }
  if (!targetEl) {
    targetEl = artboard.querySelector('.layer-deviceOne');
  }
  if (!targetEl || selectedLayerId === "background") {
    if (moveableInstance) {
      moveableInstance.destroy();
      moveableInstance = null;
    }
    return;
  }

  if (moveableInstance && moveableInstance.target !== targetEl) {
    moveableInstance.destroy();
    moveableInstance = null;
  }

  if (typeof Moveable === "undefined") return;

  if (moveableInstance) {
    moveableInstance.destroy();
  }

  moveableInstance = new Moveable(artboard, {
    target: targetEl,
    draggable: true,
    resizable: true,
    rotatable: true,
    scalable: true,
    keepRatio: false,
    snappable: true
  });

  moveableInstance.on("drag", ({ target, transform }) => {
    target.style.transform = transform;
  }).on("dragEnd", ({ target }) => {
    commitMoveableTransformToModel(selectedColumn, selectedLayerId, target);
  }).on("resize", ({ target, width, height, transform }) => {
    target.style.width = `${width}px`;
    target.style.height = `${height}px`;
    target.style.transform = transform;
  }).on("resizeEnd", ({ target }) => {
    commitMoveableTransformToModel(selectedColumn, selectedLayerId, target);
  }).on("rotate", ({ target, transform }) => {
    target.style.transform = transform;
  }).on("rotateEnd", ({ target }) => {
    commitMoveableTransformToModel(selectedColumn, selectedLayerId, target);
  }).on("scale", ({ target, transform }) => {
    target.style.transform = transform;
  }).on("scaleEnd", ({ target }) => {
    commitMoveableTransformToModel(selectedColumn, selectedLayerId, target);
  });
}

export function commitMoveableTransformToModel(col, layerId, el) {
  const rect = el.getBoundingClientRect();
  const artboard = document.getElementById("mockup-canvas-artboard");
  if (!artboard) return;
  const artRect = artboard.getBoundingClientRect();

  const scale = artRect.width / 1080;
  const relLeft = (rect.left - artRect.left) / scale;
  const relTop = (rect.top - artRect.top) / scale;
  const relWidth = rect.width / scale;
  const relHeight = rect.height / scale;

  if (layerId === "title") {
    col.style.title.x = Math.round(relLeft);
    col.style.title.y = Math.round(relTop);
  } else if (layerId === "subtitle") {
    col.style.subtitle.x = Math.round(relLeft);
    col.style.subtitle.y = Math.round(relTop);
  } else if (layerId === "deviceOne") {
    col.style.deviceOne.size = Math.round((relWidth / 480) * 90);
    col.style.deviceOne.x = Math.round(((relLeft + relWidth/2 - 540) / 1080) * 100);
    col.style.deviceOne.y = Math.round(((relTop + relHeight/2 - 1100) / 1920) * 100);
  } else if (layerId === "deviceTwo" && col.style.deviceTwo) {
    col.style.deviceTwo.size = Math.round((relWidth / 480) * 90);
    col.style.deviceTwo.x = Math.round(((relLeft + relWidth/2 - 540) / 1080) * 100);
    col.style.deviceTwo.y = Math.round(((relTop + relHeight/2 - 1200) / 1920) * 100);
  } else if (layerId.startsWith("asset:")) {
    const idx = parseInt(layerId.split(":")[1], 10);
    if (col.style.assetLayers?.[idx]) {
      const ast = col.style.assetLayers[idx];
      ast.widthPct = Math.round((relWidth / 1080) * 100);
      ast.heightPct = Math.round((relHeight / 1920) * 100);
      ast.xPct = Math.round(((relLeft + relWidth / 2) / 1080) * 100);
      ast.yPct = Math.round(((relTop + relHeight / 2) / 1920) * 100);
    }
  }

  setMockupDirty(true);
  syncSection2Inputs(col, layerId);
  saveCurrentMockupProject();
  pushMockupHistory();
}

export function renderTransformGizmoOverlay(frameEl, col, zoomRatio) {
  let gizmo = frameEl.querySelector(".gizmo-overlay");
  if (!gizmo) {
    gizmo = document.createElement("div");
    gizmo.className = "gizmo-overlay";
    frameEl.appendChild(gizmo);
  }

  const style = col.style;
  let box = { left: 100, top: 400, width: 880, height: 1300, rotation: 0 };

  if (selectedLayerId === "title") {
    box = { left: 54, top: 80, width: 972, height: 120, rotation: 0 };
  } else if (selectedLayerId === "subtitle") {
    box = { left: 54, top: 200, width: 972, height: 80, rotation: 0 };
  } else if (selectedLayerId === "deviceOne") {
    const d1 = style.deviceOne || { size: 90, x: 0, y: 0, rotation: 0 };
    const w = 480 * (d1.size / 90);
    const h = 960 * (d1.size / 90);
    const cx = 540 + (d1.x / 100 * 1080);
    const cy = 1100 + (d1.y / 100 * 1920);
    box = { left: cx - w / 2, top: cy - h / 2, width: w, height: h, rotation: d1.rotation || 0 };
  } else if (selectedLayerId.startsWith("asset:")) {
    const idx = parseInt(selectedLayerId.split(":")[1], 10);
    const ast = style.assetLayers ? style.assetLayers[idx] : null;
    if (ast) {
      const w = (ast.widthPct / 100) * 1080;
      const h = ast.heightPct ? (ast.heightPct / 100) * 1920 : w * 1.4;
      const left = (ast.xPct / 100) * 1080 - w / 2;
      const top = (ast.yPct / 100) * 1920 - h / 2;
      box = { left, top, width: w, height: h, rotation: ast.rotation || 0 };
    }
  }

  const leftPx = box.left * zoomRatio;
  const topPx = box.top * zoomRatio;
  const widthPx = box.width * zoomRatio;
  const heightPx = box.height * zoomRatio;

  gizmo.style.left = `${leftPx}px`;
  gizmo.style.top = `${topPx}px`;
  gizmo.style.width = `${widthPx}px`;
  gizmo.style.height = `${heightPx}px`;
  gizmo.style.transform = `rotate(${box.rotation}deg)`;

  const isCenterX = Math.abs(box.left + box.width / 2 - 540) < 20;
  const isCenterY = Math.abs(box.top + box.height / 2 - 960) < 20;

  gizmo.innerHTML = `
    <div class="gizmo-border"></div>
    <div class="gizmo-handle nw" data-handle="nw" style="top:-5px; left:-5px;"></div>
    <div class="gizmo-handle ne" data-handle="ne" style="top:-5px; right:-5px;"></div>
    <div class="gizmo-handle sw" data-handle="sw" style="bottom:-5px; left:-5px;"></div>
    <div class="gizmo-handle se" data-handle="se" style="bottom:-5px; right:-5px;"></div>
    <div class="gizmo-handle n" data-handle="n" style="top:-5px; left:calc(50% - 5px);"></div>
    <div class="gizmo-handle s" data-handle="s" style="bottom:-5px; left:calc(50% - 5px);"></div>
    <div class="gizmo-handle w" data-handle="w" style="top:calc(50% - 5px); left:-5px;"></div>
    <div class="gizmo-handle e" data-handle="e" style="top:calc(50% - 5px); right:-5px;"></div>
    <div class="gizmo-stem"></div>
    <div class="gizmo-rotate-knob" data-handle="rotate"></div>
    ${isCenterX || isCenterY
      ? `<div class="smart-guides-overlay" style="${isCenterX ? 'border-left: 2px solid #f472b6;' : ''}${isCenterY ? 'border-top: 2px solid #f472b6;' : ''}"></div>`
      : ""}
  `;

  attachGizmoEvents(gizmo, col, zoomRatio);
}

let isDraggingGizmo = false;

export function attachGizmoEvents(gizmoEl, col, zoomRatio) {
  gizmoEl.onpointerdown = (e) => {
    e.stopPropagation();
    const handleType = e.target.dataset.handle;
    const startX = e.clientX;
    const startY = e.clientY;
    const style = col.style;
    const d1 = style.deviceOne;

    const initialSize = d1.size;
    const initialX = d1.x;
    const initialY = d1.y;

    isDraggingGizmo = true;
    gizmoEl.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEv) => {
      if (!isDraggingGizmo) return;
      const dx = (moveEv.clientX - startX) / zoomRatio;
      const dy = (moveEv.clientY - startY) / zoomRatio;

      requestAnimationFrame(() => {
        if (handleType === "rotate") {
          const rect = gizmoEl.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const angleRad = Math.atan2(moveEv.clientY - cy, moveEv.clientX - cx);
          let deg = Math.round((angleRad * 180) / Math.PI) + 90;
          if (deg > 180) deg -= 360;
          if (deg < -180) deg += 360;

          if (selectedLayerId === "deviceOne") d1.rotation = deg;
          else if (selectedLayerId.startsWith("asset:")) {
            const idx = parseInt(selectedLayerId.split(":")[1], 10);
            if (style.assetLayers[idx]) style.assetLayers[idx].rotation = deg;
          }
        } else if (handleType) {
          const delta = Math.round((dx + dy) / 4);
          if (selectedLayerId === "deviceOne") {
            d1.size = Math.max(10, Math.min(200, initialSize + delta));
          } else if (selectedLayerId.startsWith("asset:")) {
            const idx = parseInt(selectedLayerId.split(":")[1], 10);
            if (style.assetLayers[idx]) {
              style.assetLayers[idx].widthPct = Math.max(5, Math.min(100, (style.assetLayers[idx].widthPct || 30) + delta));
            }
          }
        } else {
          const pctX = Math.round((dx / 1080) * 100);
          const pctY = Math.round((dy / 1920) * 100);

          if (selectedLayerId === "deviceOne") {
            d1.x = Math.max(-100, Math.min(100, initialX + pctX));
            d1.y = Math.max(-100, Math.min(100, initialY + pctY));
          } else if (selectedLayerId.startsWith("asset:")) {
            const idx = parseInt(selectedLayerId.split(":")[1], 10);
            if (style.assetLayers[idx]) {
              style.assetLayers[idx].xPct = Math.max(0, Math.min(100, (style.assetLayers[idx].xPct || 50) + pctX));
              style.assetLayers[idx].yPct = Math.max(0, Math.min(100, (style.assetLayers[idx].yPct || 50) + pctY));
            }
          }
        }

        loadColumnIntoFabric(col);
        setMockupDirty(true);
        renderTransformGizmoOverlay(gizmoEl.parentElement, col, zoomRatio);
      });
    };

    const onPointerUp = (upEv) => {
      isDraggingGizmo = false;
      gizmoEl.releasePointerCapture(upEv.pointerId);
      gizmoEl.onpointermove = null;
      gizmoEl.onpointerup = null;
      import('./state.js').then(m => { m.saveCurrentMockupProject?.(); m.pushMockupHistory?.(); });
    };

    gizmoEl.onpointermove = onPointerMove;
    gizmoEl.onpointerup = onPointerUp;
  };
}
