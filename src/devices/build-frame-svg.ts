import type { DeviceDefinition, DeviceButton, DeviceGeometry } from "./schema.js";
import { resolveDeviceFrameGeometry } from "../mockup/layerLayout.js";

/** Flat 2D bezel SVG derived from the same `DeviceDefinition` used by the
 *  procedural GLB builder — successor to the old `frame.ts`. Kept
 *  deliberately DOM/WebGL-free: this drives `still.ts` / Mockup Studio's
 *  bulk screenshot path, which stays on the fast DOM+SVG route (see plan
 *  "Flat 2D App Store screenshot path"). Reads real per-model `cutout`/
 *  `buttons[]` data instead of a hardcoded shape/3-button block. */

function cutoutMarkup(def: DeviceDefinition, geometry: DeviceGeometry): string {
  const cx = geometry.width / 2;
  const size = def.cutout.size ?? { width: 120, height: 36 };
  const offset = def.cutout.offset ?? { x: 0, y: 0 };
  const ox = cx + offset.x;

  switch (def.cutout.type) {
    case "notch": {
      const { width: w, height: h } = size;
      return `<rect x="${ox - w / 2}" y="${offset.y}" width="${w}" height="${h}" rx="${h / 2}" fill="#000" />`;
    }
    case "punch-hole": {
      const r = size.width / 2;
      return `<circle cx="${ox}" cy="${r + 26 + offset.y}" r="${r}" fill="#000" stroke="${def.accent}" stroke-width="2" />`;
    }
    case "dynamic-island": {
      const { width: w, height: h } = size;
      return `<rect x="${ox - w / 2}" y="${30 + offset.y}" width="${w}" height="${h}" rx="${h / 2}" fill="#000" />`;
    }
    case "pill": {
      const { width: w, height: h } = size;
      return `<rect x="${ox - w / 2}" y="${16 + offset.y}" width="${w}" height="${h}" rx="${h / 2}" fill="#000" />`;
    }
    case "none":
    default:
      return "";
  }
}

/** Real per-model button rects, positioned by `face`/`offsetPct`/`lengthPct`
 *  instead of the old fixed 3-rect block — button count/placement now
 *  varies per device. */
function buttonsMarkup(def: DeviceDefinition, geometry: DeviceGeometry, bezelWidth: number): string {
  if (!def.buttons || !def.buttons.length) return "";
  const { width, height } = geometry;
  const rects = (def.buttons as DeviceButton[]).map((btn) => {
    const spanPx = btn.face === "top" || btn.face === "bottom" ? width : height;
    const lenPx = btn.lengthPct * spanPx;
    const alongOffset = btn.offsetPct * spanPx - lenPx / 2;
    if (btn.face === "right") {
      return `<rect x="${width - bezelWidth / 2}" y="${alongOffset}" width="${bezelWidth}" height="${lenPx}" rx="4" fill="${def.accent}" />`;
    }
    if (btn.face === "left") {
      return `<rect x="${-bezelWidth / 2}" y="${alongOffset}" width="${bezelWidth}" height="${lenPx}" rx="4" fill="${def.accent}" />`;
    }
    if (btn.face === "top") {
      return `<rect x="${alongOffset}" y="${-bezelWidth / 2}" width="${lenPx}" height="${bezelWidth}" rx="4" fill="${def.accent}" />`;
    }
    return `<rect x="${alongOffset}" y="${height - bezelWidth / 2}" width="${lenPx}" height="${bezelWidth}" rx="4" fill="${def.accent}" />`;
  });
  return rects.join("\n    ");
}

function foldSeamMarkup(def: DeviceDefinition, geometry: DeviceGeometry): string {
  if (def.formFactor !== "foldable" || !def.variants?.length) return "";
  const variant = def.variants.find((v) => v.fold.state === "unfolded") ?? def.variants[0];
  const { width, height } = geometry;
  if (variant.fold.axis === "horizontal") {
    const y = height / 2;
    return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${def.accent}" stroke-width="3" stroke-dasharray="10 8" opacity="0.6" />`;
  }
  const x = width / 2;
  return `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${def.accent}" stroke-width="3" stroke-dasharray="10 8" opacity="0.6" />`;
}

/** Renders the full flat frame SVG for a device at the given geometry —
 *  same call shape as the pre-GLB `buildFrameSvg(device, colorway,
 *  geometry)` so `still.ts`/`deviceMarkup` need no signature changes. */
export function buildFrameSvg(
  def: DeviceDefinition,
  colorway: "light" | "dark" = "dark",
  geometry: DeviceGeometry = def.geometry,
  overrides?: { borderColor?: string; bezelColor?: string; showCamera?: boolean; borderThickness?: number; bezelThickness?: number },
): string {
  const { width, height } = geometry;
  // "Border Thickness" (panel) = the outer screen-edge stroke -- previously
  // hardcoded to the device's fixed catalog `bezelWidth`, now a per-page
  // override (undefined = unchanged default behavior).
  // Shared with src/render/shared.ts and web/js/canvas.js -- see
  // resolveDeviceFrameGeometry (bezelThickness is absolute + symmetric).
  const fg = resolveDeviceFrameGeometry({
    width, height, cornerRadius: geometry.cornerRadius, screenInset: def.screenInset,
    catalogBorderWidth: def.bezelWidth, borderThickness: overrides?.borderThickness, bezelThickness: overrides?.bezelThickness,
  });
  const bezelWidth = fg.borderWidth;
  const inset = fg.screen;
  const body = fg.bodyRect;
  const bodyFill = overrides?.bezelColor || (colorway === "light" ? "#e8e8e8" : def.body);
  const strokeColor = overrides?.borderColor || (colorway === "light" ? "#c9c9c9" : def.accent);
  const maskId = `bezel-hole-${def.id}`;

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <mask id="${maskId}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#fff" />
      <rect x="${inset.left}" y="${inset.top}" width="${inset.width}" height="${inset.height}" rx="${fg.screenRadius}" fill="#000" />
    </mask>
    <rect x="${body.x}" y="${body.y}" width="${body.width}" height="${body.height}"
          rx="${body.rx}" fill="${bodyFill}" stroke="${strokeColor}" stroke-width="${bezelWidth}" mask="url(#${maskId})" />
    ${overrides?.showCamera === false ? "" : `<g id="camera-cutout">${cutoutMarkup(def, geometry)}</g>`}
    ${buttonsMarkup(def, geometry, bezelWidth)}
    ${foldSeamMarkup(def, geometry)}
  </svg>`;
}
