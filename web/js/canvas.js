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
  setSelectedLayerIds,
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
  escapeHtml,
} from './utils.js';
import { syncSection2Inputs, syncLinkedDeviceLayer } from './editor.js';
import { saveCurrentMockupProject, pushMockupHistory, mockupProject } from './state.js';
// mockupDevicesCatalog: templates.js already fetches the real /api/devices
// catalog (dozens of real devices) for the "add device row" picker; canvas.js
// reuses that same live array instead of the tiny 4-entry stub previously
// baked into resolveDeviceGeometry(), which didn't contain any device this
// project actually uses. (templates.js also imports from canvas.js --
// editor.js/matrix.js already have the same mutual-import shape in this
// codebase and it works fine, since both sides only read the live binding
// inside function bodies, never at module-evaluation time.)
import { mockupDevicesCatalog } from './templates.js';

// Selection-control styling, applied explicitly to every constructed object
// (not trusted to a `fabric.Object.prototype` patch -- Fabric v7's classes
// merge their own `ownDefaults` in the constructor rather than reading the
// prototype chain the old way, the same reason the origin-bug fix above had
// to be applied per-construction instead of via a single prototype patch;
// verified the same way here rather than assumed). Fabric's own defaults are
// a pale, mostly-transparent blue with tiny corners -- near-invisible against
// this app's light-mode canvas background (#fff). Uses the app's existing
// accent blue with opaque, larger corners and a visible border so handles
// read clearly on both light and dark canvases.
const CONTROL_STYLE = {
  borderColor: '#3b82f6',
  cornerColor: '#3b82f6',
  cornerStrokeColor: '#ffffff',
  transparentCorners: false,
  cornerStyle: 'circle',
  cornerSize: 12,
  borderScaleFactor: 2,
  padding: 4,
};

/**
 * By default only the top-center handle (mtr) rotates -- the four corner
 * handles only resize. Rewires tl/tr/bl/br to rotate too (same action Fabric
 * already uses for mtr: fabric.controlsUtils.rotationWithSnapping, with its
 * matching cursor handler), so any corner can be dragged to rotate. Applied
 * per-instance (not via a single prototype patch) for the same reason the
 * origin-default fix above is: Fabric v7 classes merge their own control
 * defaults in the constructor, so a `fabric.Object.prototype.controls` patch
 * doesn't reliably reach already-typed classes (Rect/Textbox/Group/Image).
 */
function applyCornerRotationControls(obj) {
  const fabric = window.fabric;
  if (!obj?.controls || !fabric?.controlsUtils) return;
  for (const key of ['tl', 'tr', 'bl', 'br']) {
    const base = obj.controls[key];
    if (!base) continue;
    base.actionName = 'rotate';
    base.actionHandler = fabric.controlsUtils.rotationWithSnapping;
    base.cursorStyleHandler = fabric.controlsUtils.rotationStyleHandler;
  }
}

/**
 * Position + origin for a rotatable object, given its unrotated top-left box
 * (L, T, W, H) and rotation angle. With origin 'left'/'top' (needed so every
 * upstream anchor formula in this file -- all of which compute L/T as a
 * top-left corner -- keeps working unchanged), Fabric rotates around that
 * corner, not the object's visual center. Converting to center coordinates
 * ONLY when actually rotating (angle !== 0) makes Fabric pivot around the
 * true center instead, without touching any of the L/T/W/H math itself.
 */
function positionForRotation(L, T, W, H, angle) {
  if (!angle) return { left: L, top: T, originX: 'left', originY: 'top' };
  return { left: L + W / 2, top: T + H / 2, originX: 'center', originY: 'center' };
}

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
  if (!obj) return;
  // A multi-select drag/rotate/scale fires with an ActiveSelection as the
  // target (no layerId of its own) -- without this, group-transforming
  // several layers together would silently fail to persist any of them.
  if (Array.isArray(obj._objects)) {
    for (const member of obj._objects) {
      if (member?.layerId) syncFabricObjectToModel(member, obj);
    }
    return;
  }
  if (!obj.layerId) return;
  syncFabricObjectToModel(obj);
}

// Fabric's own multi-select (shift-click / marquee) already produces e.selected
// with every selected object -- previously only [0] was ever used, silently
// discarding multi-select. setSelectedLayerIds keeps the full set (for group
// operations); setSelectedLayerId keeps the first as the "primary" selection
// the single-object inspector panel edits, same as before for a single pick.
function handleFabricSelection(e) {
  const objs = (e.selected || []).filter((o) => o.layerId);
  if (!objs.length) return;
  setSelectedLayerIds(objs.map((o) => o.layerId));
  setSelectedLayerId(objs[0].layerId);
  if (selectedColumn) {
    if (typeof window.renderMockupLayersPanel === 'function') window.renderMockupLayersPanel(selectedColumn);
    if (typeof window.syncSection2Inputs === 'function') window.syncSection2Inputs(selectedColumn, objs[0].layerId);
    if (typeof window.routeInspectorForLayer === 'function') window.routeInspectorForLayer(objs[0].layerId);
  }
}

function onFabricSelectionCreated(e) { handleFabricSelection(e); }
function onFabricSelectionUpdated(e) { handleFabricSelection(e); }

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
 * @param {object} [group] - when `obj` is a member of a multi-select ActiveSelection,
 *   its left/top/angle are group-local, not canvas-absolute. Pass the group so we can
 *   resolve absolute canvas coordinates instead (best-effort: uses the axis-aligned
 *   bounding box for position/size, which is exact for non-rotated members and a
 *   close approximation once the group itself is also rotated -- ponytail: full
 *   corner-accurate math for a rotated group of rotated members needs matrix
 *   decomposition; add if group-rotate-then-edit drift is ever reported).
 */
export async function syncFabricObjectToModel(obj, group) {
  if (!obj || !obj.layerId || !selectedColumn) return;
  const style = selectedColumn.style;

  // Same device-row resolution as loadColumnIntoFabric, needed so the
  // inverse (drag -> model) math uses the device's real dimensions instead
  // of a hardcoded 480x960/960 reference the model was never actually built at.
  const { selectedCell } = await import('./matrix.js');
  const activeDeviceRow =
    mockupProject?.devices?.find((d) => d.id === selectedCell?.deviceRowId) ||
    mockupProject?.devices?.[0];
  const deviceGeo = resolveDeviceGeometry(activeDeviceRow?.deviceId || 'phone', mockupDevicesCatalog, activeDeviceRow?.variant);
  const stageCenter = fabricStageCenter(selectedColumn);

  if (group) {
    const rect = obj.getBoundingRect(true, true);
    const angle = typeof obj.getTotalAngle === 'function' ? obj.getTotalAngle() : (obj.angle || 0) + (group.angle || 0);
    obj = Object.assign(Object.create(Object.getPrototypeOf(obj)), obj, {
      left: rect.left, top: rect.top, width: rect.width, height: rect.height, angle,
    });
  } else if (obj.originX === 'center') {
    // Rotated objects (positionForRotation in loadColumnIntoFabric) are
    // constructed with center origin so Fabric pivots around their true
    // center -- obj.left/top are therefore already the CENTER here, not the
    // top-left corner every branch below assumes. Normalize back to top-left
    // once, up front, so nothing downstream needs to know which origin
    // convention was in effect (getBoundingRect(true,true) already does the
    // equivalent normalization for the multi-select `group` branch above).
    const w = typeof obj.getScaledWidth === 'function' ? obj.getScaledWidth() : obj.width;
    const h = typeof obj.getScaledHeight === 'function' ? obj.getScaledHeight() : obj.height;
    obj = Object.assign(Object.create(Object.getPrototypeOf(obj)), obj, {
      left: obj.left - w / 2, top: obj.top - h / 2,
    });
  }

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
      const coords = getDeviceCoordsFromFabricObject(obj, selectedColumn, 'deviceOne', stageCenter, deviceGeo);
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
      const coords = getDeviceCoordsFromFabricObject(obj, selectedColumn, 'deviceTwo', stageCenter, deviceGeo);
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
      if (obj.layerId?.startsWith('extra:')) {
        // Free-form device layers have no presentation-recipe rotate/offset to
        // subtract (unlike deviceOne/deviceTwo) -- inline the same stageCx/stageCy
        // anchor deviceOne uses in loadColumnIntoFabric below, with zero preset offset.
        const idx = parseInt(obj.layerId.split(':')[1], 10);
        const dev = style.extraDevices?.[idx];
        const objW = typeof obj.getScaledWidth === 'function' ? obj.getScaledWidth() : obj.width;
        const objH = typeof obj.getScaledHeight === 'function' ? obj.getScaledHeight() : obj.height;
        if (dev && objW && objH) {
          const cx = obj.left + objW / 2;
          const cy = obj.top + objH / 2;
          dev.x = Math.round(((cx - stageCenter.cx) / objW) * 100);
          dev.y = Math.round(((cy - stageCenter.cy) / objH) * 100);
          dev.size = Math.round((objH / deviceGeo.height) * 90);
          dev.rotation = obj.angle ?? 0;
        }
      } else if (obj.layerId?.startsWith('asset:')) {
        const idx = parseInt(obj.layerId.split(':')[1], 10);
        const ast = style.assetLayers && style.assetLayers[idx];
        if (ast) {
          // Top-left anchored -- see the matching note in loadColumnIntoFabric's asset loop.
          if (obj.left !== undefined) ast.xPct = Math.round((obj.left / 1080) * 100);
          if (obj.top !== undefined) ast.yPct = Math.round((obj.top / 1920) * 100);
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
  if (selectedColumn) syncLinkedDeviceLayer(mockupProject, selectedColumn.id, obj.layerId);
  setMockupDirty(true);
  if (typeof window.syncSection2Inputs === 'function') window.syncSection2Inputs(selectedColumn, obj.layerId);
  if (typeof window.renderMockupMatrix === 'function') window.renderMockupMatrix();
}

// Offscreen element reused across measurements -- real browser flex/text-wrap
// layout instead of a hand-rolled approximation, so the editor's "copy block"
// geometry can never drift from src/mockup/render.ts's actual CSS again (that
// drift -- particularly a width/height axis mix-up in the margin term, and a
// hardcoded constant that disagreed with itself elsewhere in this file -- was
// the root cause of the editor canvas not matching a template's real design).
let _measureEl = null;
function getMeasureEl() {
  if (_measureEl && document.body.contains(_measureEl)) return _measureEl;
  _measureEl = document.createElement('div');
  _measureEl.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; pointer-events:none;';
  document.body.appendChild(_measureEl);
  return _measureEl;
}

/** Measures the real rendered height (content + the margin that pushes the
 *  device stage away from it) of the title+subtitle "copy" block, using the
 *  *exact* CSS src/mockup/render.ts's textBlock()/.canvas/.copy/.title/
 *  .subtitle rules use (render.ts:45-56,142-154) -- title line-height 1.15,
 *  subtitle font-size at half of style.subtitle.size (render.ts's textBlock
 *  literally halves it -- canvas.js previously rendered it at full size, a
 *  second real bug), subtitle's own 0.5em margin-top, and the copy block's
 *  4% margin against the *padded flex container's* width, all resolved by
 *  the real browser layout engine instead of guessed constants. */
function measureCopyBlock(style, preset) {
  const textBelow = preset.textPosition.endsWith('below');
  const isCaption = preset.textPosition.startsWith('caption');
  const t = style.title || { text: '', size: 58 };
  const s = style.subtitle || { text: '', size: 36 };
  const titleSize = isCaption ? Math.round((t.size || 58) * 0.72) : (t.size || 58);
  const subtitleSize = Math.round((s.size || 36) * 0.5);
  const showTitle = t.visible !== false && !!t.text;
  const showSubtitle = s.visible !== false && !!s.text;
  if (!showTitle && !showSubtitle) return { height: 0, titleHeight: 0 };

  const PAD = 1080 * 0.06;
  const el = getMeasureEl();
  el.innerHTML = `<div style="box-sizing:border-box; width:1080px; display:flex; flex-direction:${textBelow ? 'column-reverse' : 'column'}; align-items:center; padding:${PAD}px;">
    <div class="mk-measure-copy" style="width:100%; margin:${textBelow ? '4% 0 0' : '0 0 4%'}; font-family:'Segoe UI', Roboto, -apple-system, sans-serif;">
      ${showTitle ? `<div class="mk-measure-title" style="font-weight:800; line-height:1.15; font-size:${titleSize}px;">${escapeHtml(t.text)}</div>` : ''}
      ${showSubtitle ? `<div style="opacity:.8; margin-top:.5em; font-weight:500; font-size:${subtitleSize}px;">${escapeHtml(s.text)}</div>` : ''}
    </div>
  </div>`;
  const copyEl = el.firstElementChild.firstElementChild;
  const titleEl = copyEl.querySelector('.mk-measure-title');
  const rect = copyEl.getBoundingClientRect();
  const cs = getComputedStyle(copyEl);
  const marginPx = parseFloat(textBelow ? cs.marginTop : cs.marginBottom) || 0;
  return { height: rect.height + marginPx, titleHeight: titleEl ? titleEl.getBoundingClientRect().height : 0 };
}

/** Stage center (cx, cy) devices are positioned around -- accounts for the
 *  title/subtitle copy block's real measured height like loadColumnIntoFabric
 *  does, so extra-device coordinate math (read in syncFabricObjectToModel,
 *  written here) uses the exact same anchor as deviceOne/deviceTwo. */
function fabricStageCenter(column) {
  const style = column.style;
  const preset = getLayoutPresetClient(style.layout);
  const PAD = 1080 * 0.06;
  const showText = preset.textPosition !== 'no-text';
  const textBelow = preset.textPosition.endsWith('below');
  const copyH = showText ? measureCopyBlock(style, preset).height : 0;
  const stageTop = showText && !textBelow ? PAD + copyH : PAD;
  const stageBottom = showText && textBelow ? 1920 - PAD - copyH : 1920 - PAD;
  return { cx: 540, cy: (stageTop + stageBottom) / 2 };
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

  // Real z-order: every layer is built first (not added to the canvas yet),
  // tagged with its resolved zIndex, then all added in ascending zIndex order
  // at the end -- Fabric's paint order IS its object add-order, there's no
  // native z-index concept to lean on instead. Previously this function
  // added objects in a fixed hardcoded sequence regardless of zIndex, so
  // bring-forward/send-backward/drag-reorder only ever changed the Layers
  // panel's own sort (buildScreenLayersModel), never the actual canvas --
  // these defaults must match that function's exactly so a layer's position
  // in the panel always matches its stacking on the canvas.
  const pendingObjects = [];
  const queueObject = (obj, zIndex) => {
    if (!obj) return;
    applyCornerRotationControls(obj);
    pendingObjects.push({ obj, zIndex });
  };

  // Which physical device model (e.g. "apple-iphone-16-pro-max") this
  // composition renders with -- matches render.ts's layerMarkup(), which
  // uses the selected device ROW's deviceId/variant for every device layer
  // on the screen (the model is per-row, not per-layer).
  const { selectedCell } = await import('./matrix.js');
  const activeDeviceRow =
    mockupProject?.devices?.find((d) => d.id === selectedCell?.deviceRowId) ||
    mockupProject?.devices?.[0];
  const activeDeviceId = activeDeviceRow?.deviceId || 'phone';
  const activeDeviceVariant = activeDeviceRow?.variant;

  // Screenshot source fallback -- matches render.ts's cellHtml() exactly:
  // explicit sourceId, else the source at this column's index, else the
  // first source. Without this, any column/device that hasn't had a
  // screenshot manually mapped yet (true for every freshly-applied
  // template) renders blank in the editor while the real server-rendered
  // preview/export already shows a screenshot via this same fallback.
  const columnIndex = Math.max(0, mockupProject?.columns?.findIndex((c) => c.id === column.id) ?? 0);
  const sources = mockupProject?.sources || [];
  const resolveSourceFor = (sourceId) => sources.find((s) => s.id === sourceId) ?? sources[columnIndex] ?? sources[0];

  // 1. Background Layer -- mirrors src/render/shared.ts resolveBackground()
  const bg = style.background || { type: 'gradient', value: 'ocean' };
  let bgObj = null;
  if (bg.type === 'image' && bg.imageFile && mockupId) {
    const imgUrl = `/api/mockups/${mockupId}/file?p=${encodeURIComponent(bg.imageFile)}`;
    const img = await loadFabricImageAsync(imgUrl);
    if (img) {
      img.set({ left: 0, top: 0, originX: 'left', originY: 'top', selectable: false, evented: false, name: 'background', layerId: 'background' });
      const scale = Math.max(1080 / img.width, 1920 / img.height);
      img.scaleX = scale;
      img.scaleY = scale;
      bgObj = img;
    }
  }
  if (!bgObj) {
    bgObj = new fabric.Rect({
      left: 0, top: 0, originX: 'left', originY: 'top', width: 1080, height: 1920,
      fill: resolveFabricBackgroundFill(bg),
      objectCaching: false,
      selectable: false,
      evented: false,
      name: 'background',
      layerId: 'background'
    });
  }
  queueObject(bgObj, style.background?.zIndex ?? 0);

  const PAD = 1080 * 0.06;
  const showText = preset.textPosition !== 'no-text';
  const textBelow = preset.textPosition.endsWith('below');
  const isCaption = preset.textPosition.startsWith('caption');

  // 2. Title + 3. Subtitle Layers -- positioned/sized from a real measured
  // layout (measureCopyBlock, using render.ts's actual CSS) instead of guessed
  // constants, so text-below placement and the title/subtitle gap match the
  // real server-rendered design instead of drifting from it.
  const t = style.title || { text: '', color: '#ffffff', size: 58, align: 'center', rotation: 0 };
  const s = style.subtitle || { text: '', color: '#94a3b8', size: 36, align: 'center', rotation: 0 };
  const titleSize = isCaption ? Math.round((t.size || 58) * 0.72) : (t.size || 58);
  // render.ts's textBlock() renders the subtitle at HALF style.subtitle.size
  // (render.ts:154) -- canvas.js previously used the raw size, rendering
  // subtitles roughly 2x too large versus the real export/preview.
  const subtitleSize = Math.round((s.size || 36) * 0.5);
  const copyMeasure = showText ? measureCopyBlock(style, preset) : { height: 0, titleHeight: 0 };
  const titleY = t.y ?? (showText ? (textBelow ? 1920 - PAD - copyMeasure.height : PAD) : PAD);
  // render.ts applies text-align once to the whole .copy block via
  // style.title.align -- style.subtitle.align is never read for alignment
  // (render.ts:52), so the subtitle here follows the title's align, not its own.
  const copyAlign = t.align || 'center';

  const titleX = t.x ?? PAD;
  const titleText = new fabric.Textbox(t.text || '', {
    left: titleX,
    top: titleY,
    originX: 'left',
    originY: 'top',
    width: 1080 - PAD * 2,
    fontSize: titleSize,
    lineHeight: 1.15,
    fill: t.color || '#ffffff',
    textAlign: copyAlign,
    fontWeight: 'bold',
    name: 'title',
    layerId: 'title',
    visible: showText && t.visible !== false,
    selectable: !t.locked,
    evented: !t.locked,
    ...CONTROL_STYLE,
  });
  // Textbox height is only known after construction (auto-computed from
  // wrapped text) -- rotate-around-center needs it, so reposition+rotate as
  // a second step instead of trying to precompute height like the other
  // (already-sized) layer types below.
  if (t.rotation) {
    titleText.set({ ...positionForRotation(titleX, titleY, titleText.width, titleText.height, t.rotation), angle: t.rotation });
    titleText.setCoords();
  }
  queueObject(titleText, t.zIndex ?? 20);

  // Subtitle sits titleHeight + its own 0.5em margin-top below the title,
  // exactly matching render.ts's `.subtitle { margin-top: .5em }` (em is
  // relative to the subtitle's OWN font-size, not the title's).
  const subtitleY = s.y ?? (titleY + copyMeasure.titleHeight + subtitleSize * 0.5);
  const subtitleX = s.x ?? PAD;
  const subtitleText = new fabric.Textbox(s.text || '', {
    left: subtitleX,
    top: subtitleY,
    originX: 'left',
    originY: 'top',
    width: 1080 - PAD * 2,
    fontSize: subtitleSize,
    fill: s.color || '#94a3b8',
    textAlign: copyAlign,
    fontWeight: 'normal',
    opacity: 0.8,
    name: 'subtitle',
    layerId: 'subtitle',
    visible: showText && s.visible !== false,
    selectable: !s.locked,
    evented: !s.locked,
    ...CONTROL_STYLE,
  });
  if (s.rotation) {
    subtitleText.set({ ...positionForRotation(subtitleX, subtitleY, subtitleText.width, subtitleText.height, s.rotation), angle: s.rotation });
    subtitleText.setCoords();
  }
  queueObject(subtitleText, s.zIndex ?? 19);

  // Stage dimensions & centering offsets
  const { cx: stageCx, cy: stageCy } = fabricStageCenter(column);

  // 4. Device One
  const d1 = style.deviceOne || { size: 90, x: 0, y: 0, rotation: 0, brightness: 100 };
  // Use the real device aspect ratio from the registry rather than a fixed 480x960
  // so the editor canvas matches the server-rendered template (real corner
  // radius, screen inset, dimensions per device model).
  const d1Geo = resolveDeviceGeometry(activeDeviceId, mockupDevicesCatalog, activeDeviceVariant);
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

  const d1Source = resolveSourceFor(d1.sourceId);
  const deviceOne = await buildDeviceGroup(d1, 'deviceOne', d1Left, d1Top, d1W, d1H, d1Rotation, activeDeviceId, activeDeviceVariant, d1Source);
  queueObject(deviceOne, d1.zIndex ?? 10);

  // 5. Device Two (if exists)
  const d2 = style.deviceTwo;
  if (d2 && preset.twoDevices && transform.d2) {
    const d2Geo = resolveDeviceGeometry(activeDeviceId, mockupDevicesCatalog, activeDeviceVariant);
    const d2Scale = d2.size / 90;
    const d2W = d2Geo.width * d2Scale;
    const d2H = d2Geo.height * d2Scale;
    const d2Cx = stageCx + ((transform.d2.xPct + d2.x) / 100) * d2W;
    const d2Cy = stageCy + ((transform.d2.yPct + d2.y) / 100) * d2H;
    const d2Left = d2Cx - d2W / 2;
    const d2Top = d2Cy - d2H / 2;
    const d2Rotation = (transform.d2.rotate || 0) + (d2.rotation || 0);
    // render.ts falls back deviceTwo's source to deviceOne's resolved source
    // (not sources[columnIndex+1]) when d2 has no explicit sourceId.
    const d2Source = sources.find((s) => s.id === d2.sourceId) ?? d1Source;
    const deviceTwo = await buildDeviceGroup(d2, 'deviceTwo', d2Left, d2Top, d2W, d2H, d2Rotation, activeDeviceId, activeDeviceVariant, d2Source);
    queueObject(deviceTwo, d2.zIndex ?? 9);
  }

  // 5b. Extra device layers (free-form, beyond the two preset slots -- no
  //     presentation-recipe offset, positioned purely by their own x/y/size/rotation).
  for (let i = 0; i < (style.extraDevices || []).length; i++) {
    const dx = style.extraDevices[i];
    const dxGeo = resolveDeviceGeometry(activeDeviceId, mockupDevicesCatalog, activeDeviceVariant);
    const dxScale = dx.size / 90;
    const dxW = dxGeo.width * dxScale;
    const dxH = dxGeo.height * dxScale;
    const dxCx = stageCx + (dx.x / 100) * dxW;
    const dxCy = stageCy + (dx.y / 100) * dxH;
    const dxSource = sources.find((s) => s.id === dx.sourceId) ?? d1Source;
    const extraGroup = await buildDeviceGroup(dx, `extra:${i}`, dxCx - dxW / 2, dxCy - dxH / 2, dxW, dxH, dx.rotation || 0, activeDeviceId, activeDeviceVariant, dxSource);
    queueObject(extraGroup, dx.zIndex ?? (8 - i));
  }

  // 6. Asset Layers
  if (style.assetLayers) {
    for (let i = 0; i < style.assetLayers.length; i++) {
      const ast = style.assetLayers[i];
      if (ast.visible === false) continue;
      const w = (ast.widthPct / 100) * 1080;
      const h = ast.heightPct ? (ast.heightPct / 100) * 1920 : w * 1.4;
      // Top-left anchored, matching src/render/shared.ts's assetLayersMarkup()
      // (`left:${xPct}%; top:${yPct}%` on a plain position:absolute div, no
      // centering transform) -- canvas.js previously treated xPct/yPct as the
      // asset's CENTER, a real divergence from the actual exported/previewed position.
      const left = (ast.xPct / 100) * 1080;
      const top = (ast.yPct / 100) * 1920;
      const srcUrl = ast.assetId.startsWith('sources/')
        ? `/api/mockups/${mockupId}/file?p=${encodeURIComponent(ast.assetId)}`
        : `/api/mockups/${mockupId}/file?p=sources/${ast.assetId}.png`;

      const assetImg = await loadFabricImageAsync(srcUrl);
      if (assetImg) {
        assetImg.set({
          ...positionForRotation(left, top, w, h, ast.rotation || 0),
          angle: ast.rotation || 0,
          opacity: ast.opacity ?? 1,
          flipX: !!ast.flipH,
          flipY: !!ast.flipV,
          name: `asset:${i}`,
          layerId: `asset:${i}`,
          zIndex: ast.zIndex || 15,
          selectable: !ast.locked,
          evented: !ast.locked,
          ...CONTROL_STYLE,
        });
        assetImg.scaleX = w / assetImg.width;
        assetImg.scaleY = h / assetImg.height;
        queueObject(assetImg, ast.zIndex ?? (15 + i));
      }
    }
  }

  // Real z-order: sort ascending (lowest painted first = furthest back) and
  // add in that order -- see the comment where pendingObjects is declared above.
  pendingObjects.sort((a, b) => a.zIndex - b.zIndex);
  for (const { obj } of pendingObjects) mockupFabricCanvas.add(obj);

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
 * @param {string} [deviceId] - real device catalog id (the device ROW's
 *   deviceId, e.g. "apple-iphone-16-pro-max") -- DeviceLayerStyle itself has
 *   no model id field; the model applies per device ROW, not per layer.
 * @param {string} [variantId]
 * @param {{id:string,file:string}} [resolvedSource] - the source image to
 *   show, already resolved by the caller with the same fallback render.ts's
 *   cellHtml() uses (explicit device.sourceId, else sources[columnIndex],
 *   else sources[0]) -- previously this function only used device.sourceId
 *   with no fallback at all, so a freshly-applied template (which never sets
 *   sourceId) rendered a blank device here while the real server-rendered
 *   preview/export correctly showed a screenshot.
 */
export async function buildDeviceGroup(device, layerId, left, top, width, height, rotation, deviceId, variantId, resolvedSource) {
  const fabric = window.fabric;
  if (!fabric) return null;

  const items = [];
  const isFrameless = device.frameless;

  // Resolve real device geometry from the actual server-backed catalog
  // (previously a 4-entry hardcoded stub, keyed off a `device.id` field that
  // DeviceLayerStyle doesn't even have -- so this always silently fell back
  // to a generic "phone" stub regardless of the project's real device).
  const geo = resolveDeviceGeometry(deviceId || 'phone', mockupDevicesCatalog, variantId);
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

  // Screenshot image -- resolvedSource.file is the real project-relative path
  // (e.g. "captures/1.png"), matching how render.ts resolves it server-side;
  // previously this guessed a `sources/<id>.png` path that didn't match how
  // sources are actually stored (e.g. live-capture sources live under captures/).
  if (resolvedSource?.file && mockupId) {
    const imgUrl = `/api/mockups/${mockupId}/file?p=${encodeURIComponent(resolvedSource.file)}`;
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
      // Round the screenshot's corners to match the device bezel's screen cutout --
      // the editor previously scaled the image into the inset with no clipping at
      // all, so screenshots visibly overflowed the rounded corners (a real fidelity
      // gap vs. the server-rendered export, which already clips via CSS clip-path).
      // clipPath geometry is defined in the object's own unscaled local space and
      // centered on it, so it must be sized to the image's natural (pre-scale)
      // width/height with the corner radius scaled back up to compensate.
      // Matches src/render/shared.ts's deviceMarkup(): same cornerRadius, no separate
      // "screen" radius exists in the device registry.
      const screenCorner = isFrameless ? 0 : devCorner;
      if (screenCorner > 0) {
        screen.clipPath = new fabric.Rect({
          width: screen.width,
          height: screen.height,
          rx: screenCorner / screen.scaleX,
          ry: screenCorner / screen.scaleY,
          originX: 'center',
          originY: 'center',
        });
      }
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
    ...positionForRotation(left, top, width, height, rotation),
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
    }) : null,
    ...CONTROL_STYLE,
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

/** Zoom step anchored at the viewport's own center (not the artboard's),
 *  so a manual +/- click preserves wherever the user was already looking
 *  instead of re-centering on the artboard like Fit/50%/100% do. */
export function setStageZoomAtViewportCenter(newRatio) {
  const vp = document.getElementById("mockup-canvas-viewport");
  if (!vp) return;
  const cx = vp.clientWidth / 2;
  const cy = vp.clientHeight / 2;
  const oldRatio = stageZoomRatio;
  newRatio = Math.max(0.08, Math.min(3.0, newRatio));
  if (newRatio === oldRatio) return;
  canvasPan.x = cx - (cx - canvasPan.x) * (newRatio / oldRatio);
  canvasPan.y = cy - (cy - canvasPan.y) * (newRatio / oldRatio);
  stageZoomRatio = newRatio;
  applyCanvasTransform();
}

export let isHandToolActive = false;
export function setHandToolActive(active) {
  isHandToolActive = active;
  const viewport = document.getElementById("mockup-canvas-viewport");
  if (viewport) viewport.classList.toggle("hand-tool-active", active);
  if (mockupFabricCanvas) {
    mockupFabricCanvas.selection = !active;
    mockupFabricCanvas.skipTargetFind = active;
  }
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
    if (e.button === 1 || (e.button === 0 && (isSpacePressed || isHandToolActive))) {
      e.preventDefault();
      isPanning = true;
      viewport.classList.add("panning");
      panStart = { x: e.clientX - canvasPan.x, y: e.clientY - canvasPan.y };
    }
  });

  window.addEventListener("mouseup", () => {
    if (isPanning) {
      isPanning = false;
      if (!isSpacePressed && !isHandToolActive) viewport.classList.remove("panning");
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    canvasPan = { x: e.clientX - panStart.x, y: e.clientY - panStart.y };
    applyCanvasTransform();
  });

  viewport.addEventListener("wheel", (e) => {
    // By default the canvas must not intercept scrolling at all -- an
    // un-prevented wheel event bubbles up and scrolls the outer page
    // (`.content`) normally, exactly like scrolling anywhere else. Only an
    // explicit Ctrl/Cmd+wheel (the universal trackpad-pinch-zoom gesture)
    // zooms outside Hand mode; plain wheel only pans once Hand mode is on.
    const wantsZoom = e.ctrlKey || e.metaKey;
    if (!wantsZoom && !isHandToolActive) return;

    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (wantsZoom) {
      const zoomFactor = 0.95;
      const oldRatio = stageZoomRatio;
      const newRatio = Math.max(0.08, Math.min(3.0, stageZoomRatio * (e.deltaY < 0 ? 1 / zoomFactor : zoomFactor)));
      if (newRatio === oldRatio) return;
      canvasPan.x = mouseX - (mouseX - canvasPan.x) * (newRatio / oldRatio);
      canvasPan.y = mouseY - (mouseY - canvasPan.y) * (newRatio / oldRatio);
      stageZoomRatio = newRatio;
      applyCanvasTransform();
      return;
    }

    // Hand mode, plain wheel: pan the viewport instead of zooming.
    canvasPan = { x: canvasPan.x - e.deltaX, y: canvasPan.y - e.deltaY };
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
      // Top-left anchored -- see the matching note in loadColumnIntoFabric's asset loop.
      ast.xPct = Math.round((relLeft / 1080) * 100);
      ast.yPct = Math.round((relTop / 1920) * 100);
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
      // Top-left anchored -- see the matching note in loadColumnIntoFabric's asset loop.
      const left = (ast.xPct / 100) * 1080;
      const top = (ast.yPct / 100) * 1920;
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
