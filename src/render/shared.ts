import fs from "fs";
import { resolveGeometry, type DeviceModel } from "../devices/registry.js";

/** Inline the screenshot so rendered HTML is self-contained (no file:// or
 *  http fetches to race with the screenshot call). */
export function dataUri(absPath: string): string {
  return `data:image/png;base64,${fs.readFileSync(absPath, "base64")}`;
}

export function escapeHtml(value: string): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** The device-in-frame block, shared by the mockup step and the video step
 *  so a screenshot looks identical in the store package and in the promo.
 *  `variantId` selects a foldable's folded/unfolded geometry. */
export function deviceMarkup(device: DeviceModel, screenshotUri: string, variantId?: string): string {
  const g = resolveGeometry(device, variantId);
  return `<div class="device" style="width:${g.width}px;height:${g.height}px">
      <img class="device-screen" src="${screenshotUri}"
           style="top:${g.screenInset.top}px;left:${g.screenInset.left}px;width:${g.screenInset.width}px;height:${g.screenInset.height}px;border-radius:${g.cornerRadius ?? 0}px" />
      <div class="device-frame">${device.svgFrame}</div>
    </div>`;
}

export const DEVICE_CSS = `
  .device { position: relative; }
  .device-screen { position: absolute; object-fit: cover; object-position: top; z-index: 1; }
  .device-frame { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
  .device-frame svg { width: 100%; height: 100%; display: block; }
`;

/** Solid colours — a flat swatch, distinct from a gradient preset. */
export const SOLID_COLORS: Record<string, string> = {
  "solid-navy": "#0f1115",
  "solid-charcoal": "#1c1c1c",
  "solid-white": "#f8fafc",
  "solid-cream": "#f5f0e6",
  "solid-indigo": "#2a2a72",
  "solid-forest": "#0b3d2e",
};

export const BACKGROUNDS: Record<string, string> = {
  ocean: "linear-gradient(135deg,#0f2027 0%,#203a43 50%,#2c5364 100%)",
  royal: "linear-gradient(135deg,#1e3c72 0%,#2a5298 100%)",
  sunset: "linear-gradient(135deg,#ff512f 0%,#dd2476 100%)",
  mint: "linear-gradient(135deg,#134e5e 0%,#71b280 100%)",
  graphite: "linear-gradient(135deg,#232526 0%,#414345 100%)",
  light: "linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%)",
  candy: "linear-gradient(135deg,#ee9ca7 0%,#ffdde1 100%)",
  aurora: "linear-gradient(135deg,#00c6ff 0%,#0072ff 100%)",
  citrus: "linear-gradient(135deg,#f7971e 0%,#ffd200 100%)",
  violet: "linear-gradient(135deg,#654ea3 0%,#eaafc8 100%)",
};

/** Repeating-gradient / radial-gradient CSS patterns — the "mesh/pattern"
 *  style backgrounds Studio offers alongside flat gradients, built from
 *  pure CSS (no image assets to source or license). */
export const PATTERNS: Record<string, string> = {
  dots: "radial-gradient(circle, rgba(255,255,255,.18) 3px, transparent 3px) 0 0/28px 28px, linear-gradient(135deg,#1e3c72 0%,#2a5298 100%)",
  grid:
    "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px) 0 0/40px 40px, linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px) 0 0/40px 40px, linear-gradient(135deg,#232526 0%,#414345 100%)",
  diagonal:
    "repeating-linear-gradient(45deg, rgba(255,255,255,.08) 0 12px, transparent 12px 24px), linear-gradient(135deg,#0f2027 0%,#2c5364 100%)",
  mesh:
    "radial-gradient(at 20% 20%, rgba(255,100,150,.35) 0, transparent 50%), radial-gradient(at 80% 0%, rgba(100,150,255,.35) 0, transparent 50%), radial-gradient(at 50% 100%, rgba(150,255,200,.3) 0, transparent 50%), #14161c",
  waves:
    "repeating-radial-gradient(circle at 50% 120%, rgba(255,255,255,.10) 0 6px, transparent 6px 40px), linear-gradient(135deg,#134e5e 0%,#71b280 100%)",
};

export function backgroundCss(name: string): string {
  return BACKGROUNDS[name] ?? BACKGROUNDS["ocean"];
}

export interface ResolvableBackground {
  type: "solid" | "gradient" | "pattern" | "image" | "panoramic";
  value: string;
  imageFile?: string;
  panoramaFile?: string;
}

/** Resolves any background type to a CSS `background` shorthand value, plus
 *  (for panoramic) the position needed so consecutive screens in the set
 *  read as slices of one continuous wide image. `resolveUri` turns a
 *  session-relative file into a usable src (a data: URI for a render, or
 *  an /api/sessions/:id/file URL for a live preview). */
export function resolveBackground(
  bg: ResolvableBackground,
  resolveUri: (relativePath: string) => string,
  panoramaIndex = 0,
  panoramaCount = 1,
): { background: string; backgroundSize?: string; backgroundPosition?: string } {
  switch (bg.type) {
    case "solid":
      return { background: SOLID_COLORS[bg.value] ?? SOLID_COLORS["solid-navy"] };
    case "pattern":
      return { background: PATTERNS[bg.value] ?? PATTERNS["dots"] };
    case "image":
      if (bg.imageFile) {
        return { background: `center/cover no-repeat url(${resolveUri(bg.imageFile)})` };
      }
      return { background: backgroundCss(bg.value) };
    case "panoramic": {
      if (!bg.panoramaFile) return { background: backgroundCss(bg.value) };
      // Evenly slice one wide image across the whole screenshot set —
      // screen i shows the i/(count-1) fraction of the image horizontally.
      const pct = panoramaCount > 1 ? (panoramaIndex / (panoramaCount - 1)) * 100 : 0;
      return {
        background: `url(${resolveUri(bg.panoramaFile)})`,
        backgroundSize: `${panoramaCount * 100}% 100%`,
        backgroundPosition: `${pct}% center`,
      };
    }
    case "gradient":
    default:
      return { background: backgroundCss(bg.value) };
  }
}

/** Device deck for a canvas: scales the device to a target fraction of
 *  canvas height, given the resolved (variant-aware) geometry. */
export function deviceScaleFor(device: DeviceModel, canvasHeight: number, variantId?: string, fraction = 0.62): number {
  const g = resolveGeometry(device, variantId);
  return (canvasHeight * fraction) / g.height;
}

export interface DecorationLike {
  kind: "icon" | "badge" | "shape";
  content: string;
  xPct: number;
  yPct: number;
  sizePct: number;
  rotate: number;
  color: string;
}

const SHAPE_MARKUP: Record<string, (color: string) => string> = {
  circle: (c) => `<div style="width:100%;height:100%;border-radius:50%;background:${c}"></div>`,
  ribbon: (c) => `<div style="width:100%;height:38%;margin-top:31%;background:${c};clip-path:polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)"></div>`,
  star: (c) => `<div style="width:100%;height:100%;background:${c};clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)"></div>`,
};

/** Decorative stickers/badges/shapes, absolutely positioned in percent so
 *  they land the same place regardless of the canvas's actual pixel size. */
export function decorationsMarkup(decorations: DecorationLike[], canvas: { width: number; height: number }): string {
  return decorations
    .map((d) => {
      const sizePx = Math.round((canvas.width * d.sizePct) / 100);
      const style = `position:absolute;left:${d.xPct}%;top:${d.yPct}%;width:${sizePx}px;height:${sizePx}px;transform:translate(-50%,-50%) rotate(${d.rotate}deg);z-index:6;display:flex;align-items:center;justify-content:center;`;
      if (d.kind === "shape") {
        const shape = SHAPE_MARKUP[d.content] ?? SHAPE_MARKUP["circle"];
        return `<div style="${style}">${shape(d.color)}</div>`;
      }
      const fontSize = Math.round(sizePx * 0.8);
      return `<div style="${style}font-size:${fontSize}px;line-height:1;color:${d.color};text-shadow:0 2px 8px rgba(0,0,0,.4);">${escapeHtml(d.content)}</div>`;
    })
    .join("\n");
}
