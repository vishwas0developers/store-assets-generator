// Icons module -- a small set of standard, professional-editor-style SVG
// icons (Lucide/Feather-style: 24x24 viewBox, stroke-based, currentColor),
// applied to the object toolbar (top bar, icon-only) and its twin controls
// in the right-side Transform panel (icon + label) so both use the exact
// same glyphs, just presented differently. See applyStandardIcons() below.

function svg(inner, viewBox = "0 0 24 24") {
  return `<svg viewBox="${viewBox}" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;">${inner}</svg>`;
}

export const ICONS = {
  bringFront: svg('<polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/>'),
  bringForward: svg('<polyline points="18 15 12 9 6 15"/>'),
  sendBackward: svg('<polyline points="6 9 12 15 18 9"/>'),
  sendToBack: svg('<polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/>'),

  alignLeft: svg('<line x1="4" y1="3" x2="4" y2="21"/><rect x="7" y="6" width="11" height="5" rx="1"/><rect x="7" y="14" width="7" height="5" rx="1"/>'),
  alignCenterX: svg('<line x1="12" y1="3" x2="12" y2="21"/><rect x="6.5" y="6" width="11" height="5" rx="1"/><rect x="8.5" y="14" width="7" height="5" rx="1"/>'),
  alignRight: svg('<line x1="20" y1="3" x2="20" y2="21"/><rect x="6" y="6" width="11" height="5" rx="1"/><rect x="10" y="14" width="7" height="5" rx="1"/>'),
  alignTop: svg('<line x1="3" y1="4" x2="21" y2="4"/><rect x="6" y="7" width="5" height="11" rx="1"/><rect x="14" y="7" width="5" height="7" rx="1"/>'),
  alignMiddleY: svg('<line x1="3" y1="12" x2="21" y2="12"/><rect x="6" y="6.5" width="5" height="11" rx="1"/><rect x="14" y="8.5" width="5" height="7" rx="1"/>'),
  alignBottom: svg('<line x1="3" y1="20" x2="21" y2="20"/><rect x="6" y="6" width="5" height="11" rx="1"/><rect x="14" y="10" width="5" height="7" rx="1"/>'),

  flipH: svg('<path d="m3 7 5 5-5 5V7"/><path d="m21 7-5 5 5 5V7"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>'),
  flipV: `<span style="display:inline-block; transform:rotate(90deg);">${svg('<path d="m3 7 5 5-5 5V7"/><path d="m21 7-5 5 5 5V7"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>')}</span>`,

  rotate: svg('<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>'),
  opacity: svg('<circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12v12z" fill="currentColor" stroke="none"/>'),

  duplicate: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  delete: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>'),

  lock: svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  unlock: svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'),
};

/** Applies the standard icon set to the object toolbar (icon-only) and the
 *  matching right-sidebar controls (icon + kept label). Called once at
 *  bootstrap -- pure DOM content swap, no behavior change (click handlers
 *  are wired separately in editor.js). */
export function applyStandardIcons() {
  // Top toolbar: icon-only.
  const iconOnly = {
    "mk-obj-bring-front": ICONS.bringFront,
    "mk-obj-bring-fwd": ICONS.bringForward,
    "mk-obj-send-bwd": ICONS.sendBackward,
    "mk-obj-send-back": ICONS.sendToBack,
    "mk-obj-align-left": ICONS.alignLeft,
    "mk-obj-align-center": ICONS.alignCenterX,
    "mk-obj-align-right": ICONS.alignRight,
    "mk-obj-align-top": ICONS.alignTop,
    "mk-obj-align-middle": ICONS.alignMiddleY,
    "mk-obj-align-bottom": ICONS.alignBottom,
    "mk-obj-flip-h": ICONS.flipH,
    "mk-obj-flip-v": ICONS.flipV,
    "mk-obj-rotate-btn": ICONS.rotate,
    "mk-rot-apply-btn": ICONS.rotate,
    "android-rotate-btn": ICONS.rotate,
    "mk-obj-opacity-icon": ICONS.opacity,
    "mk-obj-duplicate": ICONS.duplicate,
    "mk-obj-delete": ICONS.delete,
  };
  for (const [id, icon] of Object.entries(iconOnly)) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = icon;
  }

  // Right sidebar: icon + kept text label.
  const iconPlusLabel = {
    "mk-layer-bring-front": [ICONS.bringFront, "Front"],
    "mk-layer-bring-fwd": [ICONS.bringForward, "Fwd"],
    "mk-layer-send-bwd": [ICONS.sendBackward, "Bwd"],
    "mk-layer-send-back": [ICONS.sendToBack, "Back"],
    "mk-align-left": [ICONS.alignLeft, "Left"],
    "mk-align-center": [ICONS.alignCenterX, "Center"],
    "mk-align-right": [ICONS.alignRight, "Right"],
    "mk-align-top": [ICONS.alignTop, "Top"],
    "mk-align-middle": [ICONS.alignMiddleY, "Middle"],
    "mk-align-bottom": [ICONS.alignBottom, "Bottom"],
    "mk-bring-forward": [ICONS.bringForward, "Fwd"],
    "mk-send-backward": [ICONS.sendBackward, "Bwd"],
    "mk-bring-front": [ICONS.bringFront, "Front"],
    "mk-send-back": [ICONS.sendToBack, "Back"],
    "mk-duplicate-layer": [ICONS.duplicate, "Duplicate"],
    "mk-delete-layer": [ICONS.delete, "Delete"],
    "mk-pos-flip-h": [ICONS.flipH, "Flip H"],
    "mk-pos-flip-v": [ICONS.flipV, "Flip V"],
  };
  for (const [id, [icon, label]] of Object.entries(iconPlusLabel)) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `${icon} <span>${label}</span>`;
  }

  const lockLabel = document.getElementById("mk-pos-aspect-lock")?.closest("label");
  if (lockLabel) lockLabel.innerHTML = lockLabel.innerHTML.replace(/🔒\s*/, ICONS.lock + " ");
}
