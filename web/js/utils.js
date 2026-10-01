// Utility module — pure helpers reused across the app.
// No DOM manipulation or fabric calls here.

import { BG_GRADIENTS, BG_RADIAL, BG_SOLIDS, BG_PATTERN_APPROX, TEXT_POSITIONS } from './constants.js';

/**
 * Mirrors src/mockup/layouts.ts getLayoutPreset()/presentationTransform() exactly.
 * Slug grammar is `[snapshot-]<presentation>-<textPosition>`.
 * @param {string} slug
 * @returns {{presentation:string,textPosition:string,frameless:boolean,twoDevices:boolean}}
 */
export function getLayoutPresetClient(slug) {
  const s = slug || 'single-title-above';
  const frameless = s.startsWith('snapshot-');
  const rest = frameless ? s.slice('snapshot-'.length) : s;
  const textPosition = TEXT_POSITIONS.find((tp) => rest.endsWith(`-${tp}`)) || 'title-above';
  const presentation = rest.slice(0, rest.length - textPosition.length - 1) || 'single';
  const twoDevices = presentation.startsWith('two-devices') || presentation.startsWith('the-airbnb');
  return { presentation, textPosition, frameless, twoDevices };
}

/**
 * Mirrors src/mockup/layouts.ts presentationTransform().
 * @param {string} presentation
 * @returns {{d1:object,d2?:object}}
 */
export function presentationTransformClient(presentation) {
  switch (presentation) {
    case 'tilted-left': return { d1: { xPct: 0, rotate: -10 } };
    case 'tilted-right': return { d1: { xPct: 0, rotate: 10 } };
    case 'rotated-left-1': return { d1: { xPct: 0, rotate: -18 } };
    case 'rotated-left-2': return { d1: { xPct: 0, rotate: -32 } };
    case 'rotated-right-1': return { d1: { xPct: 0, rotate: 18 } };
    case 'rotated-right-2': return { d1: { xPct: 0, rotate: 32 } };
    case 'left-side': return { d1: { xPct: -28, rotate: 0 } };
    case 'right-side': return { d1: { xPct: 28, rotate: 0 } };
    case 'two-devices': return { d1: { xPct: -16, rotate: 0 }, d2: { xPct: 52, yPct: 5, rotate: 0 } };
    case 'two-devices-connected-left': return { d1: { xPct: -16, rotate: -4 }, d2: { xPct: 50, yPct: 6, rotate: 4 } };
    case 'two-devices-connected-right': return { d1: { xPct: 16, rotate: 4 }, d2: { xPct: -50, yPct: 6, rotate: -4 } };
    case 'the-airbnb-left-1': return { d1: { xPct: -10, rotate: -4 }, d2: { xPct: 14, yPct: 10, rotate: 4 } };
    case 'the-airbnb-left-2': return { d1: { xPct: -18, rotate: -8 }, d2: { xPct: 20, yPct: 14, rotate: 8 } };
    case 'the-airbnb-right-1': return { d1: { xPct: 10, rotate: 4 }, d2: { xPct: -14, yPct: 10, rotate: -4 } };
    case 'the-airbnb-right-2': return { d1: { xPct: 18, rotate: 8 }, d2: { xPct: -20, yPct: 14, rotate: -8 } };
    case 'single':
    default: return { d1: { xPct: 0, rotate: 0 } };
  }
}

/**
 * Resolves per-device geometry. Prefers the real server-side device catalog
 * (fetched via /api/devices into templates.js's mockupDevicesCatalog -- the
 * actual data src/devices/registry.ts::resolveGeometry() uses, tens of real
 * devices, e.g. "apple-iphone-16-pro-max"), falling back to a tiny built-in
 * stub only when the catalog hasn't loaded yet or the id truly isn't found --
 * NOT as the everyday path. (Previously this WAS the everyday path: nothing
 * ever passed a real device id in, and the stub doesn't contain any of the
 * actual catalog's device ids, so every editor render silently fell back to
 * a generic "phone" entry regardless of which device the application actually used.)
 * @param {string} id - real device catalog id (e.g. "apple-iphone-16-pro-max"), or a stub fallback key.
 * @param {Array<{id:string,geometry:object,variants?:Array<{id:string,geometry:object}>}>} [catalog] - mockupDevicesCatalog from templates.js.
 * @param {string} [variantId]
 * @returns {{width:number,height:number,screenInset:{top:number,left:number,width:number,height:number},cornerRadius?:number}}
 */
export function resolveDeviceGeometry(id, catalog, variantId) {
  const entry = catalog && catalog.find((d) => d.id === id);
  if (entry) {
    if (variantId) {
      const variant = entry.variants?.find((v) => v.id === variantId);
      if (variant?.geometry) return variant.geometry;
    }
    if (entry.geometry) return entry.geometry;
  }
  const stub = {
    phone: { width: 1080, height: 2400, screenInset: { top: 30, left: 30, width: 1020, height: 2340 }, cornerRadius: 30 },
    'google-pixel-9': { width: 1080, height: 2424, screenInset: { top: 26, left: 26, width: 1028, height: 2372 }, cornerRadius: 48 },
    'samsung-galaxy-s24': { width: 1080, height: 2340, screenInset: { top: 22, left: 22, width: 1036, height: 2296 }, cornerRadius: 52 },
    'samsung-galaxy-s25': { width: 1080, height: 2340, screenInset: { top: 18, left: 18, width: 1044, height: 2304 }, cornerRadius: 56 },
  };
  return stub[id] || { width: 1080, height: 1920, screenInset: { top: 0, left: 0, width: 1080, height: 1920 }, cornerRadius: 36 };
}

/**
 * Returns the device's `frame` traits (cutout/bezelWidth/body/accent) from
 * the same `/api/devices` catalog entries `resolveDeviceGeometry` already
 * reads -- used by `buildDeviceGroup` to draw the real camera cutout on the
 * live editor canvas instead of a bare rounded rect. Returns null when the
 * device isn't in the catalog (e.g. the generic "phone" stub, which has no
 * cutout data) -- callers must treat that as "no cutout to draw".
 */
export function resolveDeviceFrame(id, catalog) {
  const entry = catalog && catalog.find((d) => d.id === id);
  return entry?.frame || null;
}

/**
 * Returns a Fabric fill (hex string or fabric.Gradient) for a ColumnStyle.background.
 * @param {{type:string,value:string}|undefined} bg
 * @returns {string|fabric.Gradient}
 */
export function resolveFabricBackgroundFill(bg) {
  const fabric = window.fabric;
  if (!bg) bg = { type: 'gradient', value: 'ocean' };
  if (bg.type === 'solid') {
    if (BG_SOLIDS[bg.value]) return BG_SOLIDS[bg.value];
    if (bg.value && (bg.value.startsWith('#') || bg.value.startsWith('rgb') || bg.value.startsWith('hsl'))) {
      return bg.value;
    }
    return BG_SOLIDS['solid-navy'];
  }
  if (bg.type === 'pattern') {
    const val = bg.value;
    try {
      if (val === 'dots') {
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#1e3c72';
        ctx.fillRect(0, 0, 32, 32);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath(); ctx.arc(16, 16, 3, 0, Math.PI * 2); ctx.fill();
        return new fabric.Pattern({ source: c, repeat: 'repeat' });
      }
      if (val === 'grid' || val === 'blueprint-hud') {
        const c = document.createElement('canvas');
        c.width = 40; c.height = 40;
        const ctx = c.getContext('2d');
        ctx.fillStyle = val === 'blueprint-hud' ? '#0a1118' : '#232526';
        ctx.fillRect(0, 0, 40, 40);
        ctx.strokeStyle = val === 'blueprint-hud' ? 'rgba(0,198,184,0.15)' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, 40, 40);
        return new fabric.Pattern({ source: c, repeat: 'repeat' });
      }
      if (val === 'diagonal') {
        const c = document.createElement('canvas');
        c.width = 24; c.height = 24;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#0f2027';
        ctx.fillRect(0, 0, 24, 24);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-6, 6); ctx.moveTo(18, -18);
        ctx.lineTo(30, 6); ctx.lineTo(6, 30); ctx.stroke();
        return new fabric.Pattern({ source: c, repeat: 'repeat' });
      }
    } catch (_) {}
    return BG_PATTERN_APPROX[val] || '#14161c';
  }
  if (BG_RADIAL[bg.value]) {
    const [c0, c1] = BG_RADIAL[bg.value];
    return new fabric.Gradient({
      type: 'radial',
      coords: { x1: 540, y1: 960, r1: 0, x2: 540, y2: 960, r2: 1100 },
      colorStops: [{ offset: 0, color: c0 }, { offset: 1, color: c1 }],
    });
  }
  if (BG_GRADIENTS[bg.value]) {
    const colors = BG_GRADIENTS[bg.value];
    const stops = colors.map((color, i) => ({ offset: colors.length > 1 ? i / (colors.length - 1) : 0, color }));
    return new fabric.Gradient({ type: 'linear', coords: { x1: 0, y1: 0, x2: 1080, y2: 1920 }, colorStops: stops });
  }
  // Try parsing hex colors or inline gradient values
  if (typeof bg.value === 'string') {
    const hexes = bg.value.match(/#(?:[0-9a-fA-F]{3,8})/g);
    if (hexes && hexes.length >= 2) {
      const stops = hexes.map((c, i) => ({ offset: i / (hexes.length - 1), color: c }));
      return new fabric.Gradient({ type: 'linear', coords: { x1: 0, y1: 0, x2: 1080, y2: 1920 }, colorStops: stops });
    } else if (hexes && hexes.length === 1) {
      return hexes[0];
    }
  }
  const colors = BG_GRADIENTS.ocean;
  const stops = colors.map((color, i) => ({ offset: colors.length > 1 ? i / (colors.length - 1) : 0, color }));
  return new fabric.Gradient({ type: 'linear', coords: { x1: 0, y1: 0, x2: 1080, y2: 1920 }, colorStops: stops });
}

/**
 * Convert fabric fill color to hex string
 * @param {string|object} color
 * @returns {string}
 */
export function rgbToHex(color) {
  if (!color) return '#ffffff';
  if (typeof color === 'string') return color;
  try {
    const c = color.toObject ? color.toObject() : color;
    const r = Math.round(c.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(c.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(c.b * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  } catch (_) {
    return '#ffffff';
  }
}

/**
 * HTML text escaping - prevents ReferenceError in any buildHtmlLayerElements
 * @param {any} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getSwalColors() {
  const isLight = typeof document !== "undefined" && document.documentElement.classList.contains("light");
  return {
    background: isLight ? "#ffffff" : "#14161c",
    color: isLight ? "#0f172a" : "#e6e6e6",
    cancelButtonColor: isLight ? "#cbd5e1" : "#374151"
  };
}

/**
 * SweetAlert helpers — wrap Swal with theme-aware defaults.
 */
export function showAlert(message, type = "warning", title = "Alert") {
  if (typeof window === "undefined" || !window.Swal) {
    window.alert(message);
    return Promise.resolve();
  }
  let icon = "warning";
  if (type === "error") icon = "error";
  if (type === "success") icon = "success";
  if (type === "info") icon = "info";
  const colors = getSwalColors();
  return window.Swal.fire({
    title,
    text: message,
    icon,
    confirmButtonText: "OK",
    background: colors.background,
    color: colors.color,
    confirmButtonColor: "#3b82f6",
  });
}

export function showConfirm(message, title = "Confirm Action", danger = false, confirmText) {
  if (typeof window === "undefined" || !window.Swal) {
    return Promise.resolve(window.confirm(message));
  }
  const colors = getSwalColors();
  return window.Swal.fire({
    title,
    text: message,
    icon: danger ? "warning" : "question",
    showCancelButton: true,
    confirmButtonText: confirmText || (danger ? "Delete" : "Confirm"),
    cancelButtonText: "Cancel",
    background: colors.background,
    color: colors.color,
    confirmButtonColor: danger ? "#dc2626" : "#3b82f6",
    cancelButtonColor: colors.cancelButtonColor,
  }).then((result) => !!result.isConfirmed);
}

export function showPrompt(message, defaultValue = "", title = "Input Required") {
  if (typeof window === "undefined" || !window.Swal) {
    return Promise.resolve(window.prompt(message, defaultValue));
  }
  const colors = getSwalColors();
  return window.Swal.fire({
    title,
    text: message,
    input: "text",
    inputValue: defaultValue,
    showCancelButton: true,
    confirmButtonText: "Submit",
    cancelButtonText: "Cancel",
    background: colors.background,
    color: colors.color,
    confirmButtonColor: "#3b82f6",
    cancelButtonColor: colors.cancelButtonColor,
  }).then((result) => (result.value !== undefined ? result.value : null));
}

function escHtml(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** "save" | "discard" | "cancel" -- three-way unsaved-changes prompt. */
export function showUnsavedDialog(message, saveText = "Save", discardText = "Discard") {
  const colors = getSwalColors();
  return window.Swal.fire({
    title: "Unsaved changes",
    text: message,
    icon: "warning",
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: saveText,
    denyButtonText: discardText,
    cancelButtonText: "Cancel",
    background: colors.background,
    color: colors.color,
    confirmButtonColor: "#16a34a",
    denyButtonColor: "#dc2626",
    cancelButtonColor: colors.cancelButtonColor,
  }).then((r) => (r.isConfirmed ? "save" : r.isDenied ? "discard" : "cancel"));
}

/** Toggles a studio's Editing section between the empty "no template loaded" state and the live editor. */
export function setEditingEmpty(sectionId, empty) {
  document.getElementById(sectionId)?.classList.toggle("editing-empty", !!empty);
}

/** Save As: always creates a NEW Saved Template. Resolves the trimmed name, or null if cancelled.
 *  Saved Templates only carry a name (id/snapshot/savedAt are generated), so no other metadata is collected. */
export function showSaveAsDialog({ suggestedName, existingNames = [], note = "" }) {
  const colors = getSwalColors();
  const taken = new Set(existingNames.map((n) => String(n).trim().toLowerCase()));
  return window.Swal.fire({
    title: "Save as New Template",
    html: `
      <div style="text-align:left; display:flex; flex-direction:column; gap:0.5rem;">
        ${note ? `<small>${escHtml(note)}</small>` : ""}
        <small>Template name</small>
        <input id="sv-name" class="swal2-input" style="margin:0; width:100%;" value="${escHtml(suggestedName)}" maxlength="60">
      </div>`,
    showCancelButton: true,
    confirmButtonText: "Save",
    cancelButtonText: "Cancel",
    background: colors.background,
    color: colors.color,
    confirmButtonColor: "#16a34a",
    cancelButtonColor: colors.cancelButtonColor,
    didOpen: () => window.Swal.getPopup().querySelector("#sv-name")?.select(),
    preConfirm: () => {
      const name = window.Swal.getPopup().querySelector("#sv-name").value.trim();
      if (name.length < 2 || name.length > 60) { window.Swal.showValidationMessage("Name must be 2-60 characters."); return false; }
      if (taken.has(name.toLowerCase())) { window.Swal.showValidationMessage("A saved template with this name already exists."); return false; }
      return name;
    },
  }).then((r) => (r.isConfirmed ? r.value : null));
}

/** Update Template (default/system templates only). `loaded` = the currently loaded DEFAULT template
 *  ({id,name}) or null. "Update Existing" is bound to that exact template -- there is no target picker.
 *  Resolves { action: "update" } | { action: "create", name, category?, description } | null.
 *  `categories`: pass an array to require a category on Create New (Mockup); omit for studios without categories (Video). */
export function showUpdateTemplateDialog({ loaded, categories, existingNames = [], suggestedName = "" }) {
  const colors = getSwalColors();
  const taken = new Set(existingNames.map((n) => String(n).trim().toLowerCase()));
  const canUpdate = !!loaded;
  const catOptions = (categories || []).map((c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join("");
  const html = `
    <div style="text-align:left; display:flex; flex-direction:column; gap:0.7rem;">
      <label style="display:flex; gap:0.5rem; align-items:flex-start; ${canUpdate ? "cursor:pointer;" : "opacity:0.55;"}">
        <input type="radio" name="ut-mode" value="update" ${canUpdate ? "checked" : "disabled"} style="margin-top:0.25rem;">
        <span><strong>Update Existing${canUpdate ? `: "${escHtml(loaded.name)}"` : ""}</strong><br>
          <small>${canUpdate
            ? "Overwrites this exact default template (the one you loaded) for every application. A .bak copy of the original is kept."
            : "Unavailable: the editor does not currently hold a default template. Load one from the Templates section first."}</small></span>
      </label>
      <label style="display:flex; gap:0.5rem; align-items:flex-start; cursor:pointer;">
        <input type="radio" name="ut-mode" value="create" ${canUpdate ? "" : "checked"} style="margin-top:0.25rem;">
        <span><strong>Create New</strong><br><small>Adds a new default template to the Templates section. Nothing existing is changed.</small></span>
      </label>
      <div id="ut-create" style="display:${canUpdate ? "none" : "flex"}; flex-direction:column; gap:0.4rem; padding-left:1.4rem;">
        <small>Template name (required)</small>
        <input id="ut-name" class="swal2-input" style="margin:0; width:100%;" value="${escHtml(suggestedName)}" maxlength="60">
        ${categories ? `
        <small>Category (required)</small>
        <select id="ut-cat" class="swal2-select" style="margin:0; width:100%;">${catOptions}<option value="__new__">New category…</option></select>
        <input id="ut-newcat" class="swal2-input" style="margin:0; width:100%; display:none;" placeholder="New category name" maxlength="40">` : ""}
        <small>Description (optional)</small>
        <textarea id="ut-desc" class="swal2-textarea" style="margin:0; width:100%;" rows="2"></textarea>
      </div>
    </div>`;
  return window.Swal.fire({
    title: "Update Template",
    html,
    showCancelButton: true,
    confirmButtonText: canUpdate ? "Overwrite Default Template" : "Create Default Template",
    cancelButtonText: "Cancel",
    background: colors.background,
    color: colors.color,
    confirmButtonColor: "#dc2626",
    cancelButtonColor: colors.cancelButtonColor,
    didOpen: () => {
      const pop = window.Swal.getPopup();
      const modeNow = () => pop.querySelector('input[name="ut-mode"]:checked')?.value;
      const sync = () => {
        const create = modeNow() === "create";
        pop.querySelector("#ut-create").style.display = create ? "flex" : "none";
        window.Swal.getConfirmButton().textContent = create ? "Create Default Template" : "Overwrite Default Template";
        const nc = pop.querySelector("#ut-newcat");
        if (nc) nc.style.display = pop.querySelector("#ut-cat").value === "__new__" ? "block" : "none";
      };
      pop.querySelectorAll('input[name="ut-mode"]').forEach((r) => r.addEventListener("change", sync));
      pop.querySelector("#ut-cat")?.addEventListener("change", sync);
      sync();
    },
    preConfirm: () => {
      const pop = window.Swal.getPopup();
      if (pop.querySelector('input[name="ut-mode"]:checked')?.value !== "create") return { action: "update" };
      const name = pop.querySelector("#ut-name").value.trim();
      if (name.length < 2 || name.length > 60) { window.Swal.showValidationMessage("Name must be 2-60 characters."); return false; }
      if (taken.has(name.toLowerCase())) { window.Swal.showValidationMessage("A default template with this name already exists."); return false; }
      let category;
      if (categories) {
        const sel = pop.querySelector("#ut-cat").value;
        category = (sel === "__new__" ? pop.querySelector("#ut-newcat").value : sel).trim();
        if (!category) { window.Swal.showValidationMessage("A category is required."); return false; }
      }
      return { action: "create", name, category, description: pop.querySelector("#ut-desc").value.trim() };
    },
  }).then((r) => (r.isConfirmed ? r.value : null));
}

/** options: { "Group": { value: "label" } } or { value: "label" }. Resolves to the chosen value or null. */
export function showSelect(message, options, title = "Choose", confirmText = "Continue") {
  const colors = getSwalColors();
  return window.Swal.fire({
    title,
    text: message,
    input: "select",
    inputOptions: options,
    inputPlaceholder: "Select a template…",
    inputValidator: (v) => (v ? undefined : "Please choose one."),
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancel",
    background: colors.background,
    color: colors.color,
    confirmButtonColor: "#dc2626",
    cancelButtonColor: colors.cancelButtonColor,
  }).then((result) => (result.isConfirmed ? result.value : null));
}

export function showToast(message, type = "info") {
  const container = document.getElementById("custom-toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `custom-toast ${type}`;
  let icon = "&#8505;";
  if (type === "success") icon = "&#9989;";
  if (type === "error") icon = "&#10060;";
  if (type === "warning") icon = "&#9888;";
  toast.innerHTML = `<span style="font-size:1.1rem;">${icon}</span><span style="flex:1;">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "fadeOut 0.3s ease-in forwards";
    toast.addEventListener("animationend", () => toast.remove());
  }, 3500);
}

/**
 * Async loader for fabric image from URL.
 * Returns a fabric Image or null on failure.
 * @param {string|null} url
 * @returns {Promise<object|null>}
 */
export function loadFabricImageAsync(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const fabric = window.fabric;
    if (!fabric) return resolve(null);
    const imgCtor = fabric.FabricImage || fabric.Image;
    if (!imgCtor || !imgCtor.fromURL) return resolve(null);
    try {
      const result = imgCtor.fromURL(url, { crossOrigin: 'anonymous' });
      if (result && typeof result.then === 'function') {
        result.then((img) => resolve(img || null)).catch(() => resolve(null));
      } else {
        imgCtor.fromURL(url, (img) => resolve(img || null), { crossOrigin: 'anonymous' });
      }
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * Generic API helper. JSON in / JSON out. Throws Error on non-2xx responses.
 * @param {string} path
 * @param {{method?:string,body?:any}} [options]
 * @returns {Promise<any>}
 */
export async function api(path, options) {
  const resp = await fetch(path, {
    method: options?.method ?? "GET",
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
}

/**
 * File upload helper — POST raw body with content-type from the file.
 * @param {string} path
 * @param {File} file
 * @returns {Promise<any>}
 */
export async function uploadFile(path, file) {
  const resp = await fetch(path, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
}

/**
 * Extract device position/size percentages from a Fabric object.
 * Inverts the placement math in loadColumnIntoFabric so dragging a device
 * writes back the same x/y the renderer would reproduce.
 *
 * `stageCenter` ({cx,cy}) and `deviceGeo` ({width,height}, the device's REAL
 * natural/unscaled dimensions from the device catalog) must be the exact
 * same values loadColumnIntoFabric used to place this object -- this used
 * to recompute both internally with its own approximations (a hand-rolled
 * copy-block-height formula matching canvas.js's now-fixed
 * measureCopyBlock() bug, and a hardcoded 960 "reference height" instead of
 * the real device's height), which meant a dragged device would not
 * land back where it was actually dropped once written back to the model.
 * Also reads the object's real *rendered* (scaled) size via
 * getScaledWidth()/getScaledHeight() -- `obj.width`/`obj.height` on a
 * Fabric Group are its natural pre-scale dimensions, not what's on screen.
 * @param {object} obj
 * @param {object} column
 * @param {string} layerId
 * @param {{cx:number,cy:number}} stageCenter
 * @param {{width:number,height:number}} deviceGeo
 * @returns {{xPct:number,yPct:number,size:number}|null}
 */
export function getDeviceCoordsFromFabricObject(obj, column, layerId, stageCenter, deviceGeo) {
  if (!obj || !stageCenter || !deviceGeo) return null;
  const left = obj.left ?? 0;
  const top = obj.top ?? 0;
  const width = typeof obj.getScaledWidth === 'function' ? obj.getScaledWidth() : (obj.width ?? deviceGeo.width);
  const height = typeof obj.getScaledHeight === 'function' ? obj.getScaledHeight() : (obj.height ?? deviceGeo.height);

  const style = column ? column.style : null;
  const preset = getLayoutPresetClient(style ? style.layout : undefined);
  const transform = presentationTransformClient(preset.presentation);

  const t1 = layerId === 'deviceTwo' ? transform.d2 : transform.d1;
  const presetXPct = t1 ? t1.xPct : 0;
  const presetYPct = layerId === 'deviceTwo' && t1 ? t1.yPct : 0;

  const cx = left + width / 2;
  const cy = top + height / 2;
  const xPct = Math.round(((cx - stageCenter.cx) / width) * 100 - presetXPct);
  const yPct = Math.round(((cy - stageCenter.cy) / height) * 100 - presetYPct);
  const size = Math.round((height / deviceGeo.height) * 90);
  return { xPct, yPct, size };
}