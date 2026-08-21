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

export const BACKGROUNDS: Record<string, string> = {
  ocean: "linear-gradient(135deg,#0f2027 0%,#203a43 50%,#2c5364 100%)",
  royal: "linear-gradient(135deg,#1e3c72 0%,#2a5298 100%)",
  sunset: "linear-gradient(135deg,#ff512f 0%,#dd2476 100%)",
  mint: "linear-gradient(135deg,#134e5e 0%,#71b280 100%)",
  graphite: "linear-gradient(135deg,#232526 0%,#414345 100%)",
  light: "linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%)",
};

export function backgroundCss(name: string): string {
  return BACKGROUNDS[name] ?? BACKGROUNDS["ocean"];
}

/** Device deck for a canvas: scales the device to a target fraction of
 *  canvas height, given the resolved (variant-aware) geometry. */
export function deviceScaleFor(device: DeviceModel, canvasHeight: number, variantId?: string, fraction = 0.62): number {
  const g = resolveGeometry(device, variantId);
  return (canvasHeight * fraction) / g.height;
}
