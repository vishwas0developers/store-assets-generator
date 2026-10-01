import fs from "fs";
import path from "path";

/**
 * Studio Mockup tab storage — a devices x pages matrix application, modeled
 * on studio.app-mockup.com's normalized store (verified against its bundle):
 *
 *   - devices[]  = ROWS  (a device/size class the whole application previews at)
 *   - columns[]  = PAGES (one logical page -- content, not a device; a page
 *                  can hold multiple devices/layers -- see MockupPage/
 *                  ColumnStyle). Field name is still `columns` on the wire
 *                  and in most of this codebase (see the MockupPage note
 *                  below) -- "Page" is the preferred term going forward,
 *                  not "Screen"/"Column"/"Screenshot", which have been used
 *                  interchangeably and confusingly for this same concept.
 *   - cells      = optional per (device,page) overrides
 *
 * Editing a page's style applies to that page across every device row
 * by default (reference behaviour: updateDeviceSize(value, column.screenshots)
 * writes every row). A "cell" override lets one row diverge for one page.
 *
 * Independent of the Screen Capture and Video tabs -- its own root, its own
 * uploaded source images, no shared state.
 *
 *   output/mockups/<id>/application.json
 *   output/mockups/<id>/sources/     uploaded screenshot images
 *   output/mockups/<id>/exports/     Export section output (zips)
 */

export interface MockupSourceImage {
  id: string;
  name: string;
  file: string; // relative to application dir, e.g. "sources/img_1.png"
  width: number;
  height: number;
  /** Primary, user-facing categorization -- "phone" | "tablet7" | "tablet10". */
  deviceCategory?: import("../capture/deviceCategories.js").DeviceCategory;
  resolution?: string;   // secondary technical metadata, e.g. "1242x2688"
  deviceLabel?: string;  // e.g. "Phone – 6.5\" Display"
}

export interface MockupDeviceRow {
  id: string;
  /** devices/catalogue.json id. */
  deviceId: string;
  variant?: string;
  /** Platform size target key (see sizeTargets.ts); unset on legacy rows until ensureSizeRows runs. */
  sizeKey?: string;
  /** Free label shown in the row header, e.g. "6.5 Inch". */
  label: string;
  previewsVisible: boolean;
  isBase: boolean;
}

export interface TextStyle {
  text: string;
  color: string;
  size: number; // px at a 1080-wide reference canvas
  align: "left" | "center" | "right" | "justify";
  /** True = text visible on canvas and export; False = hidden */
  visible?: boolean;
  /** True = layer locked from canvas movement/editing */
  locked?: boolean;
  /** Custom human-readable name for this text layer */
  customName?: string;
  /** Z-index stacking order (higher = on top of other elements) */
  zIndex?: number;
  /** Custom X/Y position overrides (px from top-left) */
  x?: number;
  y?: number;
  rotation?: number;
  /** Additive formatting fields for the text-editing toolbar -- unset means
   *  the existing defaults (normal weight/style, no underline). */
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  /** CSS font-family stack, e.g. "Georgia, serif". Unset = the app default
   *  (Segoe UI/Roboto/system stack already used everywhere). */
  fontFamily?: string;
  /** Numeric weight (400-900) from the toolbar's weight dropdown -- takes
   *  precedence over `bold` when set (bold just toggles this between
   *  400/700); read as `fontWeightNum ?? (bold ? 700 : 400)` so older
   *  applications that only ever set `bold` keep rendering correctly. */
  fontWeightNum?: number;
  /** Solid highlight/background color drawn behind the text (Fabric's
   *  textBackgroundColor / CSS background-color on the text element) --
   *  unset = no highlight. */
  highlightColor?: string;
  /** 0-1, same convention as MockupAssetLayer.opacity. Unset = 1 (opaque) --
   *  previously hardcoded to 1 for text layers everywhere (getLayerBox),
   *  a real gap this field closes. */
  opacity?: number;
  /** Multiplier, e.g. 1.15 -- unset = the built-in per-layer default
   *  (1.15 for title, matching render.ts's CSS; subtitle has no explicit
   *  line-height today, effectively browser default ~1.2). */
  lineHeightMultiplier?: number;
  /** Fabric's charSpacing units (1/1000 em) -- unset = 0 (no extra tracking). */
  charSpacing?: number;
  flipH?: boolean;
  flipV?: boolean;
  deleted?: boolean;
}

export type MockupBackgroundType = "solid" | "gradient" | "pattern" | "image" | "panoramic";
export interface MockupBackground {
  type: MockupBackgroundType;
  value: string;
  imageFile?: string;
  panoramaFile?: string;
  visible?: boolean;
  locked?: boolean;
  /** Custom human-readable name for the background layer */
  customName?: string;
  zIndex?: number;
}

export interface DeviceLayerStyle {
  sourceId?: string; // MockupSourceImage id
  /** 0-200, default 90 -- mirrors the reference's device-size slider exactly. */
  size: number;
  x: number;
  y: number;
  rotation: number;
  brightness: number; // 0-200, 100 = unchanged
  frameless: boolean; // "snapshot-" layouts skip the device frame
  /** Corner radius (px, screenshot-image space) applied to the screenshot's
   *  own rounded corners when `frameless` is true -- frameless mode has no
   *  device bezel to clip the screenshot to, so this lets a frameless
   *  screenshot still read as a rounded phone screen. Additive/optional;
   *  undefined/0 = no rounding (unchanged behavior for every existing
   *  application). No effect when `frameless` is false. */
  framelessCornerRadius?: number;
  borderColor?: string; // Device frame outer rim / stroke color
  bezelColor?: string; // Device frame body / bezel fill color
  /** Per-page override for the outer border/rim stroke width (px, in the
   *  device's own geometry units) drawn by build-frame-svg.ts's main bezel
   *  rect. Undefined = use the device's fixed catalog default (`bezelWidth`
   *  in devices/catalogue.json) -- zero behavior change until a user adjusts
   *  the "Border Thickness" slider. */
  borderThickness?: number;
  /** Per-page ABSOLUTE bezel width (px, device units) between the border
   *  and the screen, uniform on all four sides: screen inset = border +
   *  bezelThickness (0 = screen fills everything inside the border).
   *  Undefined = the device's native `screenInset`. See layerLayout.ts's
   *  `resolveDeviceFrameGeometry`, shared by server render and canvas. */
  bezelThickness?: number;
  /** Undefined/true = camera cutout (notch/dynamic-island/punch-hole/pill)
   *  renders as normal per the device's real geometry; false = hide it.
   *  No effect on devices whose `cutout.type` is "none". */
  cameraEnabled?: boolean;
  flipH?: boolean;
  flipV?: boolean;
  deleted?: boolean;
  /** True = layer visible on canvas and export; False = hidden */
  visible?: boolean;
  locked?: boolean;
  /** Custom human-readable name for this layer */
  customName?: string;
  /** Z-index stacking order (higher = on top of other elements) */
  zIndex?: number;
  /** Two-page pairing: when set, this device's size/x/y/rotation/brightness/
   *  frameless are kept in sync with the same-named layer on another page --
   *  editing either side propagates to the other. Used for a device
   *  composition intentionally split/continued across two pages (e.g. a
   *  panoramic banner). Additive/optional, same lazy-compat pattern as
   *  extraDevices -- unset for every existing application until a user links
   *  two pages together. See syncLinkedDeviceLayer(). */
  linkedTo?: { pageId: string; layerKey: string };
  /** True cross-page panorama positioning (distinct from `linkedTo`'s
   *  mirror-two-copies mechanic): when set, this is the device's absolute
   *  horizontal center in application-wide panorama space (column 0's left edge,
   *  by `order`, is x=0), and it REPLACES the normal x/preset-offset
   *  positioning for the X axis only -- Y/size/rotation/brightness/frameless
   *  stay exactly as governed by this column's own fields, unaffected. The
   *  device then renders (and is projected onto) every page its box
   *  intersects, as ONE continuous object rather than a duplicated copy per
   *  page. Unset (the default) means "normal single-page device, positioned
   *  as always" -- additive/optional, zero behavior change for any existing
   *  application until a user drags a device far enough to cross a page boundary. */
  panoramaXPx?: number;
}

export interface Decoration {
  id: string;
  kind: "icon" | "badge" | "shape";
  content: string;
  xPct: number;
  yPct: number;
  sizePct: number;
  rotate: number;
  color: string;
  visible?: boolean;
  locked?: boolean;
  /** Custom human-readable name for this layer */
  customName?: string;
  zIndex?: number;
}

export interface MockupAssetLayer {
  id: string;
  assetId: string; // Refers to MockupSourceImage or uploaded asset path
  name: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct?: number;
  rotation: number;
  opacity: number;
  flipH?: boolean;
  flipV?: boolean;
  visible?: boolean;
  locked?: boolean;
  /** Custom human-readable name for this layer */
  customName?: string;
  zIndex: number;
  cropFit?: "contain" | "cover" | "stretch";
  /** Code-drawn graphic (see shapeSvg.ts) -- when set it replaces the image file: `assetId` is then just a label. */
  shape?: import("./shapeSvg.js").ShapeSpec;
  shadow?: { color: string; blur: number; x: number; y: number };
}

/** A free-form, multi-instance text layer -- unlike `ColumnStyle.title`/
 *  `.subtitle` (each a single fixed TextStyle slot per page), a page can
 *  hold any number of these, each independently positioned/sized/rotated,
 *  same percentage convention as `MockupAssetLayer` (xPct/yPct/widthPct/
 *  heightPct, top-left anchored, matching render.ts's plain `left/top: X%`
 *  and canvas.js's `(pct/100) * 1080|1920` top-left math). Text content and
 *  formatting reuse `TextStyle`'s existing shape (`style.text`, color, size,
 *  align, bold/italic/underline/fontFamily/etc) instead of duplicating a
 *  parallel set of font fields -- `TextStyle`'s own x/y/rotation/opacity/
 *  visible/locked/customName/zIndex fields (designed for the single
 *  px-positioned title/subtitle slot) are simply unused here; THIS
 *  interface's own xPct/yPct/rotation/opacity/visible/locked/customName/
 *  zIndex fields are authoritative for a TextLayer. */
export interface TextLayer {
  id: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct?: number;
  rotation: number;
  opacity: number;
  visible?: boolean;
  locked?: boolean;
  /** Custom human-readable name for this layer */
  customName?: string;
  zIndex?: number;
  /** Text content + all styling/formatting -- see interface doc comment. */
  style: TextStyle;
}

export interface ColumnStyle {
  layout: string; // preset slug, see mockup/layouts.ts
  title: TextStyle;
  subtitle: TextStyle;
  background: MockupBackground;
  deviceOne: DeviceLayerStyle;
  deviceTwo?: DeviceLayerStyle;
  /** Devices beyond the two preset-driven slots -- free-form, user-added,
   *  positioned entirely by their own x/y/size/rotation (no presentation-
   *  recipe offset applied). Lets a screen hold an arbitrary number of
   *  devices instead of the historical hard cap of two. */
  extraDevices?: DeviceLayerStyle[];
  decorations: Decoration[];
  assetLayers?: MockupAssetLayer[];
  /** Free-form, multi-instance text layers -- distinct from the single
   *  fixed title/subtitle slots above. Additive/optional, same lazy-compat
   *  pattern as assetLayers -- unset for every existing application until a
   *  user adds one via "+ Add Text". */
  textLayers?: TextLayer[];
}

/** A device layer plus a stable key identifying its slot within the column
 *  style ("deviceOne" | "deviceTwo" | "extra:<index>") -- the one place that
 *  knows how to iterate all devices on a screen regardless of which slot
 *  they live in, so callers don't hand-enumerate deviceOne/deviceTwo. */
export interface DeviceLayerRef {
  key: string;
  layer: DeviceLayerStyle;
}

export function allDeviceLayers(style: ColumnStyle): DeviceLayerRef[] {
  const refs: DeviceLayerRef[] = [{ key: "deviceOne", layer: style.deviceOne }];
  if (style.deviceTwo) refs.push({ key: "deviceTwo", layer: style.deviceTwo });
  (style.extraDevices ?? []).forEach((layer, i) => refs.push({ key: `extra:${i}`, layer }));
  return refs;
}

export function getDeviceLayer(style: ColumnStyle, key: string): DeviceLayerStyle | undefined {
  if (key === "deviceOne") return style.deviceOne;
  if (key === "deviceTwo") return style.deviceTwo;
  const m = key.match(/^extra:(\d+)$/);
  if (m) return style.extraDevices?.[Number(m[1])];
  return undefined;
}

export function addExtraDeviceLayer(style: ColumnStyle): DeviceLayerStyle {
  const layer = defaultDeviceLayerStyle();
  if (!style.extraDevices) style.extraDevices = [];
  style.extraDevices.push(layer);
  return layer;
}

/** Links two device layers (on possibly-different pages) so editing either
 *  one's transform propagates to the other -- bidirectional, one partner
 *  each. Overwrites any prior link either side had (a device can only be
 *  linked to one counterpart at a time in this v1). */
export function linkDeviceLayers(
  application: MockupApplication,
  pageAId: string,
  layerAKey: string,
  pageBId: string,
  layerBKey: string,
): void {
  const pageA = application.columns.find((c) => c.id === pageAId);
  const pageB = application.columns.find((c) => c.id === pageBId);
  const layerA = pageA && getDeviceLayer(pageA.style, layerAKey);
  const layerB = pageB && getDeviceLayer(pageB.style, layerBKey);
  if (!layerA || !layerB) throw new Error("Both linked layers must exist.");
  layerA.linkedTo = { pageId: pageBId, layerKey: layerBKey };
  layerB.linkedTo = { pageId: pageAId, layerKey: layerAKey };
}

export function unlinkDeviceLayer(application: MockupApplication, pageId: string, layerKey: string): void {
  const page = application.columns.find((c) => c.id === pageId);
  const layer = page && getDeviceLayer(page.style, layerKey);
  if (!layer?.linkedTo) return;
  const partnerPage = application.columns.find((c) => c.id === layer.linkedTo!.pageId);
  const partnerLayer = partnerPage && getDeviceLayer(partnerPage.style, layer.linkedTo!.layerKey);
  if (partnerLayer) partnerLayer.linkedTo = undefined;
  layer.linkedTo = undefined;
}

/** Call after committing a transform change to a device layer -- if it's
 *  linked, copies its transform fields onto the linked counterpart (on
 *  whichever page that is) so the two stay in sync. No-op if unlinked. */
export function syncLinkedDeviceLayer(application: MockupApplication, pageId: string, layerKey: string): void {
  const page = application.columns.find((c) => c.id === pageId);
  const layer = page && getDeviceLayer(page.style, layerKey);
  if (!layer?.linkedTo) return;
  const partnerPage = application.columns.find((c) => c.id === layer.linkedTo!.pageId);
  const partnerLayer = partnerPage && getDeviceLayer(partnerPage.style, layer.linkedTo!.layerKey);
  if (!partnerLayer) return;
  partnerLayer.size = layer.size;
  partnerLayer.x = layer.x;
  partnerLayer.y = layer.y;
  partnerLayer.rotation = layer.rotation;
  partnerLayer.brightness = layer.brightness;
  partnerLayer.frameless = layer.frameless;
}

export function removeDeviceLayer(style: ColumnStyle, key: string): boolean {
  const m = key.match(/^extra:(\d+)$/);
  if (!m) return false; // deviceOne/deviceTwo are not removable this way
  const idx = Number(m[1]);
  if (!style.extraDevices || idx < 0 || idx >= style.extraDevices.length) return false;
  style.extraDevices.splice(idx, 1);
  return true;
}

export interface EditorObject {
  id: string;
  type: "background" | "title" | "subtitle" | "device" | "asset" | "decoration";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  parentId?: string | null;
  data?: any;
}

export interface MockupColumn {
  id: string;
  order: number;
  style: ColumnStyle;
  /** A snapshot of this page's style exactly as the template generated it,
   *  taken once at template-apply time -- lets "Reset to Template" restore
   *  THIS page's original state precisely, without guessing at generic
   *  defaults and without touching any other page. Additive/optional: a
   *  application created before this field existed simply has none, and the
   *  reset falls back to the old generic-defaults behavior for it. */
  templateDefaultStyle?: ColumnStyle;
}

/** Preferred vocabulary going forward: a "Page" (Template -> Page -> Layer),
 *  not a "Screen" or "Column" -- those names are used interchangeably
 *  throughout this file/module and the client for the same concept, which
 *  is exactly the confusion this alias exists to start resolving. The
 *  underlying field name (`MockupApplication.columns`) and `MockupColumn` type
 *  are NOT renamed yet -- that's a much larger, riskier sweep (400+
 *  references across server.ts and every client module) deferred until
 *  the terminology has proven itself at the edges (types, primary function
 *  names, UI labels) first. New code should prefer `MockupPage`. */
export type MockupPage = MockupColumn;

/** A user-saved template: an isolated snapshot of the editing state, owned by one Application. */
export interface MockupSavedConfig {
  id: string;
  name: string;
  sourceTemplateId?: string;
  snapshot: {
    devices: MockupDeviceRow[];
    columns: MockupColumn[];
    cells: Record<string, Partial<ColumnStyle>>;
    globalPanoramic: { file?: string; flip: boolean };
    settings: MockupApplication["settings"];
  };
  savedAt: string;
}

export interface MockupApplication {
  id: string;
  savedConfigs?: MockupSavedConfig[];
  createdAt: string;
  name: string;
  appCategory: string;
  sources: MockupSourceImage[];
  devices: MockupDeviceRow[];
  columns: MockupColumn[];
  /** key = `${deviceId}:${columnId}` */
  cells: Record<string, Partial<ColumnStyle>>;
  globalPanoramic: { file?: string; flip: boolean };
  settings: { inspectorPosition: "left" | "right"; screenshotSizeLabel: string; palette: string[] };
}

import { loadApplication, saveApplication, listApplications } from "../application/applicationStore.js";
import { sizeTargetsFor } from "./sizeTargets.js";

const ROOT = path.join(process.cwd(), "output", "applications");

export function mockupDir(id: string): string {
  const dir = path.join(ROOT, id, "mockup");
  // Containment guard
  const rel = path.relative(ROOT, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Invalid mockup application id '${id}'.`);
  return dir;
}

export function mockupFile(id: string, relative: string): string {
  const dir = mockupDir(id);
  const full = path.join(dir, relative);
  const rel = path.relative(dir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Invalid path '${relative}'.`);
  return full;
}

export function defaultTextStyle(text = ""): TextStyle {
  return { text, color: "#ffffff", size: 58, align: "center" };
}

export function defaultDeviceLayerStyle(): DeviceLayerStyle {
  return { size: 90, x: 0, y: 0, rotation: 0, brightness: 100, frameless: false };
}

export function defaultColumnStyle(title = ""): ColumnStyle {
  return {
    layout: "single-title-above",
    title: defaultTextStyle(title),
    subtitle: defaultTextStyle(""),
    background: { type: "gradient", value: "ocean" },
    deviceOne: defaultDeviceLayerStyle(),
    decorations: [],
    assetLayers: [],
    textLayers: [],
  };
}

export function createMockupApplication(init: { name: string; appCategory?: string }): MockupApplication {
  const id = `mockup-${Date.now()}`;
  throw new Error("Deprecated: Use createApplication from applicationStore instead");
}

export function saveMockupApplication(application: MockupApplication): void {
  const unified = loadApplication(application.id);
  unified.mockup = application;
  saveApplication(unified);
}

export function loadMockupApplication(id: string): MockupApplication {
  const unified = loadApplication(id);
  ensureSizeRows(unified.mockup, unified.platform);
  return unified.mockup;
}

export function listMockupApplications(): Array<{ id: string; createdAt: string; name: string; columns: number; devices: number }> {
  return listApplications().map((p) => {
    const m = p.mockup;
    return { id: p.id, createdAt: p.createdAt, name: p.name, columns: m.columns?.length ?? 0, devices: m.devices?.length ?? 0 };
  });
}

/** Column edit: applies to the column, so every device row picks it up --
 *  this IS the "propagate across all devices" behaviour; cell overrides
 *  (below) are the explicit per-row exception. */
export function updateColumnStyle(application: MockupApplication, columnId: string, style: ColumnStyle): void {
  const idx = application.columns.findIndex((c) => c.id === columnId);
  if (idx === -1) throw new Error(`Column '${columnId}' not found.`);
  application.columns[idx] = { ...application.columns[idx], style };
}

export function cellKey(deviceRowId: string, columnId: string): string {
  return `${deviceRowId}:${columnId}`;
}

export function setCellOverride(application: MockupApplication, deviceRowId: string, columnId: string, override: Partial<ColumnStyle> | null): void {
  const key = cellKey(deviceRowId, columnId);
  if (override === null) delete application.cells[key];
  else application.cells[key] = override;
}

/** Reserved key inside a cell-override object holding sparse per-field
 *  patches, e.g. `{ "deviceOne.rotation": 12, "title.color": "#fff" }`,
 *  applied by dotted path onto a clone of the column's base style. This is
 *  the "Instance Screenshots" pattern (base template + sparse per-instance
 *  overrides) -- unlike the legacy whole-sub-object override keys below
 *  (still supported for back-compat), a path patch can change one field of
 *  deviceOne without resending the rest of deviceOne. */
const PATCH_KEY = "__paths";

function setPath(obj: any, path: string, value: any): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

/** Sets (or, with value === undefined, clears) one sparse per-field override
 *  path for a cell, e.g. setCellOverridePath(p, row, col, "deviceOne.rotation", 12). */
export function setCellOverridePath(application: MockupApplication, deviceRowId: string, columnId: string, path: string, value: unknown): void {
  const key = cellKey(deviceRowId, columnId);
  const existing = application.cells[key] ?? {};
  const paths = { ...((existing as any)[PATCH_KEY] ?? {}) };
  if (value === undefined) delete paths[path];
  else paths[path] = value;
  const nextOverride: any = { ...existing, [PATCH_KEY]: paths };
  const hasLegacyKeys = Object.keys(nextOverride).some((k) => k !== PATCH_KEY);
  if (Object.keys(paths).length === 0 && !hasLegacyKeys) delete application.cells[key];
  else application.cells[key] = nextOverride;
}

export function clearCellOverridePath(application: MockupApplication, deviceRowId: string, columnId: string, path: string): void {
  setCellOverridePath(application, deviceRowId, columnId, path, undefined);
}

/** Effective style for one (device row, column) cell = column style with
 *  any cell-level fields shadowing it. Legacy whole-sub-object override
 *  keys (title/background/deviceOne/etc.) are replaced wholesale, applied
 *  first; sparse per-field path patches (the reserved `__paths` key) are
 *  applied on top and can override a single field without resending its
 *  containing sub-object. */
export function effectiveCellStyle(application: MockupApplication, deviceRowId: string, columnId: string): ColumnStyle {
  const column = application.columns.find((c) => c.id === columnId);
  if (!column) throw new Error(`Column '${columnId}' not found.`);
  // ponytail: per-cell overrides (application.cells) are retained only so old files still load; they are no longer applied.
  return column.style;
}

/** Adding a device row clones every existing column's style into that row
 *  implicitly (there is nothing to clone into -- cells are sparse and a
 *  missing cell just falls back to the column style), matching the
 *  reference's "new device row starts from the base device's screenshots". */
export function addDeviceRow(application: MockupApplication, row: Omit<MockupDeviceRow, "id">): MockupDeviceRow {
  const created: MockupDeviceRow = { ...row, id: `dev_${Date.now()}_${Math.round(Math.random() * 1e4)}` };
  application.devices.push(created);
  return created;
}

export function addColumn(application: MockupApplication, style: ColumnStyle): MockupColumn {
  const created: MockupColumn = { id: `col_${Date.now()}_${Math.round(Math.random() * 1e4)}`, order: application.columns.length, style };
  application.columns.push(created);
  return created;
}

/** Makes application.devices match the platform's size targets exactly (order included). The first existing row (the
 *  template's) becomes the primary row and keeps its device/variant; rows already carrying a matching sizeKey keep
 *  their ids so `cells` keys stay valid; anything else is dropped. Idempotent; never touches columns/styles. */
export function ensureSizeRows(mockup: MockupApplication, platform?: string): void {
  const targets = sizeTargetsFor(platform);
  const old = mockup.devices ?? [];
  const templateRow = old[0];
  mockup.devices = [];
  targets.forEach((t, i) => {
    const existing = old.find((r) => r.sizeKey === t.key) ?? (i === 0 ? templateRow : undefined);
    if (existing) {
      mockup.devices.push({ ...existing, sizeKey: t.key, label: t.label, isBase: i === 0, previewsVisible: existing.previewsVisible ?? true });
    } else {
      // Deterministic id: this runs on every load without being saved, so a random id would differ between the
      // client's load and the cell-preview route's own load ("Device row not found").
      mockup.devices.push({ id: `row-${t.key}`, deviceId: t.deviceId, label: t.label, sizeKey: t.key, previewsVisible: true, isBase: false });
    }
  });
}
