/**
 * Shared, pure layout-resolution helpers for one Studio Mockup page (column).
 *
 * This module exists to close a real, previously-documented drift bug: the
 * server-side HTML renderer (`src/mockup/render.ts`'s `cellHtml`) and the
 * browser Fabric.js editor (`web/js/canvas.js`'s `loadColumnIntoFabric`) each
 * hand-derived the same handful of small-but-critical numbers -- layer
 * z-order defaults and title/subtitle resolved font sizes -- independently,
 * and had already drifted once (subtitle rendering ~2x too large in the
 * editor vs. the real preview, because render.ts halves `style.subtitle.size`
 * and canvas.js used to not). Both call sites now import these functions
 * instead of re-deriving the formulas, so they are structurally guaranteed
 * to agree.
 *
 * Deliberately dependency-free (no DOM, no Fabric, no Node built-ins) so it
 * can be imported both from Node (via render.ts, compiled by the normal
 * `npm run build` tsc step) and, once compiled to `dist/src/mockup/
 * layerLayout.js`, from the browser as a plain ES module (see canvas.js's
 * import and web/server.ts's static route for `/dist/mockup/layerLayout.js`).
 *
 * Full per-pixel geometry (device/asset x/y/rotation/scale transforms) is
 * NOT resolved here yet -- render.ts and canvas.js each still compute that
 * themselves, since canvas.js's geometry math is deeply entangled with live
 * Fabric object construction, drag/rotate gizmo math, and cross-page
 * panorama live-sync, which would need its own dedicated, carefully
 * Playwright-verified pass to migrate safely. This module intentionally
 * starts with the two smaller, self-contained formulas that have already
 * drifted once in production, as the first slice of that larger migration.
 */

import type { ColumnStyle, DeviceLayerStyle, MockupAssetLayer, TextStyle } from "./project.js";

/** Resolved device transform, in the abstract percent/degree units both
 *  callers already agreed on before this module existed:
 *   - `xPct`/`yPct`: horizontal/vertical offset of the device's CENTER from
 *     the stage's own center, expressed as a percentage of the device's OWN
 *     rendered width/height (matches render.ts's `translate(X%, Y%)` on a
 *     device whose CSS transform-origin is its own center, and canvas.js's
 *     `stageCx/stageCy + (pct/100) * ownWidthOrHeight` math).
 *   - `scale`: multiplier already folded in (device.size / 90).
 *   - `rotationDeg`: total rotation (preset rotation + layer's own rotation).
 *   - `skip`: true only for a panorama-spanning deviceOne that has been
 *     dragged fully off this page -- caller must not render it at all. */
export interface ResolvedDeviceTransform {
  xPct: number;
  yPct: number;
  scale: number;
  rotationDeg: number;
  flipH: boolean;
  flipV: boolean;
  skip: boolean;
}

/** deviceOne's transform, including the panorama-boundary-crossing case
 *  (`d1.panoramaXPx` set): X becomes an absolute panorama-space pixel
 *  coordinate instead of the normal preset-offset percentage -- Y/size/
 *  rotation are unaffected. `deviceWidthPx` is the device's BASE (unscaled,
 *  size=90) rendered width in the 1080-wide stage, used only to test/convert
 *  the panorama pixel math -- both render.ts and canvas.js already resolve
 *  this the same way via their own device-geometry lookups before calling in.
 *  `panoramaColumnIndex` is the page's index in the project's own column
 *  order (NOT any renderer-local index -- see render.ts's cellHtml and
 *  canvas.js's loadColumnIntoFabric for why that distinction matters). */
export function resolveDeviceOneTransform(
  d1: Pick<DeviceLayerStyle, "x" | "y" | "size" | "rotation" | "flipH" | "flipV" | "panoramaXPx">,
  presetXPct: number,
  presetRotateDeg: number,
  deviceWidthPx: number,
  panoramaColumnIndex: number
): ResolvedDeviceTransform {
  const scale = (d1.size ?? 90) / 90;
  const widthPx = deviceWidthPx * scale;
  let xPct = presetXPct + (d1.x ?? 0);
  let skip = false;
  if (d1.panoramaXPx != null) {
    const localCenterXPx = d1.panoramaXPx - panoramaColumnIndex * 1080;
    if (localCenterXPx + widthPx / 2 <= 0 || localCenterXPx - widthPx / 2 >= 1080) {
      skip = true;
    } else {
      xPct = ((localCenterXPx - 540) / widthPx) * 100;
    }
  }
  return {
    xPct,
    yPct: d1.y ?? 0,
    scale,
    rotationDeg: (presetRotateDeg || 0) + (d1.rotation || 0),
    flipH: !!d1.flipH,
    flipV: !!d1.flipV,
    skip,
  };
}

/** deviceTwo's transform: both X and Y carry a preset offset (unlike
 *  deviceOne/extraDevices), and it never crosses pages (no panorama field). */
export function resolveDeviceTwoTransform(
  d2: Pick<DeviceLayerStyle, "x" | "y" | "size" | "rotation" | "flipH" | "flipV">,
  presetXPct: number,
  presetYPct: number,
  presetRotateDeg: number
): ResolvedDeviceTransform {
  return {
    xPct: presetXPct + (d2.x ?? 0),
    yPct: presetYPct + (d2.y ?? 0),
    scale: (d2.size ?? 90) / 90,
    rotationDeg: (presetRotateDeg || 0) + (d2.rotation || 0),
    flipH: !!d2.flipH,
    flipV: !!d2.flipV,
    skip: false,
  };
}

/** extraDevices entries: free-form, no presentation-recipe offset at all --
 *  positioned purely by their own x/y/size/rotation, same shape as the
 *  above so callers can treat all three device kinds uniformly downstream. */
export function resolveExtraDeviceTransform(
  extra: Pick<DeviceLayerStyle, "x" | "y" | "size" | "rotation" | "flipH" | "flipV">
): ResolvedDeviceTransform {
  return {
    xPct: extra.x ?? 0,
    yPct: extra.y ?? 0,
    scale: (extra.size ?? 90) / 90,
    rotationDeg: extra.rotation || 0,
    flipH: !!extra.flipH,
    flipV: !!extra.flipV,
    skip: false,
  };
}

/** Resolved asset-layer box, in the abstract units both callers already
 *  agreed on: `xPct`/`yPct` are the box's TOP-LEFT as a percentage of the
 *  1080x1920 stage (not center-relative, unlike device transforms above --
 *  matches render.ts's plain `left/top: X%` and canvas.js's
 *  `(pct/100) * 1080|1920` top-left math). `heightPct` is `null` when unset,
 *  meaning "let the renderer derive height from the image" -- render.ts uses
 *  CSS `height:auto` for this case, canvas.js falls back to `width * 1.4`
 *  since Fabric has no CSS auto-height equivalent; that divergence is
 *  intentionally NOT unified here since it depends on renderer capabilities,
 *  not the model, and only ever applies to layers with no explicit height. */
export interface ResolvedAssetBox {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number | null;
  rotationDeg: number;
  opacity: number;
  flipH: boolean;
  flipV: boolean;
}

export function resolveAssetLayerBox(
  layer: Pick<MockupAssetLayer, "xPct" | "yPct" | "widthPct" | "heightPct" | "rotation" | "opacity" | "flipH" | "flipV">
): ResolvedAssetBox {
  return {
    xPct: layer.xPct,
    yPct: layer.yPct,
    widthPct: layer.widthPct,
    heightPct: layer.heightPct ?? null,
    rotationDeg: layer.rotation || 0,
    opacity: layer.opacity ?? 1,
    flipH: !!layer.flipH,
    flipV: !!layer.flipV,
  };
}

export interface ResolvedTextLayout {
  /** Final, already-resolved font-size in px -- NOT style.title/subtitle.size
   *  itself; callers must use this instead of re-deriving it. */
  fontSizePx: number;
  align: TextStyle["align"];
}

/** Title's real rendered font-size: caption presentations shrink it to 72%,
 *  matching render.ts's `textBlock()` and canvas.js's `loadColumnIntoFabric`/
 *  `measureCopyBlock` (all three previously computed this same expression
 *  independently). */
export function resolveTitleTextLayout(style: Pick<ColumnStyle, "title">, textPosition: string): ResolvedTextLayout {
  const t = style.title;
  const isCaption = textPosition.startsWith("caption");
  const fontSizePx = isCaption ? Math.round((t.size || 58) * 0.72) : (t.size || 58);
  return { fontSizePx, align: t.align || "center" };
}

/** Subtitle's real rendered font-size: always HALF of `style.subtitle.size`
 *  -- render.ts's `textBlock()` literally halves it (a deliberate, if
 *  confusingly named, existing convention: `size` is stored larger than it
 *  ever visually renders). canvas.js's `loadColumnIntoFabric` used to render
 *  the raw, unhalved size, causing subtitles to appear ~2x too large in the
 *  editor versus the real server-rendered preview/export -- this function is
 *  the single place that formula now lives, so that bug class can't recur.
 *  Subtitle alignment always follows the TITLE's align (render.ts never
 *  reads style.subtitle.align for alignment), not its own -- intentional,
 *  matching existing behavior. */
export function resolveSubtitleTextLayout(style: Pick<ColumnStyle, "title" | "subtitle">): ResolvedTextLayout {
  const s = style.subtitle;
  const fontSizePx = Math.round((s.size || 36) * 0.5);
  return { fontSizePx, align: style.title.align || "center" };
}

/** Resolved z-index for every layer kind in a column, in one place. Every
 *  default here must match exactly across `render.ts` (HTML/CSS stacking)
 *  and `canvas.js` (Fabric add-order, which IS its paint order) -- previously
 *  each file hardcoded its own copy of these same numbers with a "mirrors X
 *  exactly, see line Y" comment instead of a shared source of truth. */
export const LAYER_Z_INDEX_DEFAULTS = {
  background: 0,
  title: 20,
  subtitle: 19,
  deviceOne: 10,
  deviceTwo: 9,
  /** extraDevices are stacked just behind deviceTwo, descending by index. */
  extraDevice: (index: number): number => 8 - index,
  /** Regular page-local asset layers, ascending by index (later-added asset
   *  layers paint above earlier ones by default, before any manual reorder). */
  assetLayer: (index: number): number => 15 + index,
  /** Cross-page panorama assets share the first asset layer's default slot
   *  unless given an explicit zIndex. */
  panoramaAsset: 15,
} as const;

export function resolveBackgroundZIndex(style: Pick<ColumnStyle, "background">): number {
  return style.background?.zIndex ?? LAYER_Z_INDEX_DEFAULTS.background;
}

export function resolveTitleZIndex(style: Pick<ColumnStyle, "title">): number {
  return style.title.zIndex ?? LAYER_Z_INDEX_DEFAULTS.title;
}

export function resolveSubtitleZIndex(style: Pick<ColumnStyle, "subtitle">): number {
  return style.subtitle.zIndex ?? LAYER_Z_INDEX_DEFAULTS.subtitle;
}

export function resolveDeviceOneZIndex(style: Pick<ColumnStyle, "deviceOne">): number {
  return style.deviceOne.zIndex ?? LAYER_Z_INDEX_DEFAULTS.deviceOne;
}

export function resolveDeviceTwoZIndex(style: Pick<ColumnStyle, "deviceTwo">): number {
  return style.deviceTwo?.zIndex ?? LAYER_Z_INDEX_DEFAULTS.deviceTwo;
}

export function resolveExtraDeviceZIndex(zIndex: number | undefined, index: number): number {
  return zIndex ?? LAYER_Z_INDEX_DEFAULTS.extraDevice(index);
}

export function resolveAssetLayerZIndex(zIndex: number | undefined, index: number): number {
  return zIndex ?? LAYER_Z_INDEX_DEFAULTS.assetLayer(index);
}

export function resolvePanoramaAssetZIndex(zIndex: number | undefined): number {
  return zIndex ?? LAYER_Z_INDEX_DEFAULTS.panoramaAsset;
}
