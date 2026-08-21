import { type DeviceCatalogueEntry, type DeviceGeometry } from "./registry.js";

type DeviceModel = DeviceCatalogueEntry;

/**
 * Parametric SVG bezel generator — draws a device frame from its geometry
 * and a handful of named traits instead of a hand-authored SVG string per
 * model. This is what lets `config/devices.json` add a new phone/tablet/
 * foldable as a data entry, with no art and no code change.
 * See docs/DEVICE-FRAMES.md.
 *
 * `geometry` is taken as a separate parameter (not read off `device.geometry`)
 * so a foldable's folded/unfolded variant geometry draws its own correctly
 * proportioned frame instead of stretching the base geometry's frame.
 */

function cutoutMarkup(device: DeviceModel, width: number): string {
  const { frame } = device;
  const cx = width / 2;
  const size = frame.cutoutSize ?? { width: 120, height: 36 };

  switch (frame.cutout) {
    case "notch": {
      const w = size.width;
      const h = size.height;
      return `<rect x="${cx - w / 2}" y="0" width="${w}" height="${h}" rx="${h / 2}" fill="#000" />`;
    }
    case "punch-hole": {
      const r = size.width / 2;
      return `<circle cx="${cx}" cy="${r + 26}" r="${r}" fill="#000" stroke="${frame.accent}" stroke-width="2" />`;
    }
    case "dynamic-island": {
      const w = size.width;
      const h = size.height;
      return `<rect x="${cx - w / 2}" y="30" width="${w}" height="${h}" rx="${h / 2}" fill="#000" />`;
    }
    case "pill": {
      const w = size.width;
      const h = size.height;
      return `<rect x="${cx - w / 2}" y="16" width="${w}" height="${h}" rx="${h / 2}" fill="#000" />`;
    }
    case "none":
    default:
      return "";
  }
}

function buttonsMarkup(device: DeviceModel, geometry: DeviceGeometry): string {
  if (!device.frame.buttons) return "";
  const { width, height } = geometry;
  const { accent, bezelWidth } = device.frame;
  // Short rails on the right edge (power) and left edge (volume) —
  // decorative only, positioned proportionally so any geometry works.
  return `
    <rect x="${width - bezelWidth / 2}" y="${height * 0.18}" width="${bezelWidth}" height="${height * 0.08}" rx="4" fill="${accent}" />
    <rect x="${-bezelWidth / 2}" y="${height * 0.22}" width="${bezelWidth}" height="${height * 0.06}" rx="4" fill="${accent}" />
    <rect x="${-bezelWidth / 2}" y="${height * 0.30}" width="${bezelWidth}" height="${height * 0.06}" rx="4" fill="${accent}" />
  `;
}

function foldSeamMarkup(device: DeviceModel, geometry: DeviceGeometry): string {
  const fold = device.frame.fold;
  if (!fold) return "";
  const { width, height } = geometry;
  if (fold.axis === "horizontal") {
    return `<line x1="0" y1="${fold.seamOffset}" x2="${width}" y2="${fold.seamOffset}" stroke="${device.frame.accent}" stroke-width="3" stroke-dasharray="10 8" opacity="0.6" />`;
  }
  return `<line x1="${fold.seamOffset}" y1="0" x2="${fold.seamOffset}" y2="${height}" stroke="${device.frame.accent}" stroke-width="3" stroke-dasharray="10 8" opacity="0.6" />`;
}

/** Renders the full frame SVG for a device at the given geometry — outer
 *  bezel, screen aperture outline, cutout, side buttons, and (for foldables)
 *  the fold seam. Pass a variant's geometry (via `resolveGeometry`) to get a
 *  correctly proportioned frame for that variant, not the base device. */
export function buildFrameSvg(device: DeviceModel, colorway: "light" | "dark" = "dark", geometry: DeviceGeometry = device.geometry): string {
  const { width, height, screenInset, cornerRadius } = geometry;
  const { bezelWidth, outerRadius, body, accent } = device.frame;
  const bodyFill = colorway === "light" ? "#e8e8e8" : body;
  const strokeColor = colorway === "light" ? "#c9c9c9" : accent;

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${bezelWidth / 2}" y="${bezelWidth / 2}" width="${width - bezelWidth}" height="${height - bezelWidth}"
          rx="${outerRadius}" fill="none" stroke="${bodyFill}" stroke-width="${bezelWidth}" />
    <rect x="${screenInset.left}" y="${screenInset.top}" width="${screenInset.width}" height="${screenInset.height}"
          rx="${cornerRadius ?? 0}" fill="none" stroke="${strokeColor}" stroke-width="4" />
    ${cutoutMarkup(device, width)}
    ${buttonsMarkup(device, geometry)}
    ${foldSeamMarkup(device, geometry)}
  </svg>`;
}
