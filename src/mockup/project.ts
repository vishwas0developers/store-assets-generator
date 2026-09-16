import fs from "fs";
import path from "path";

/**
 * Studio Mockup tab storage — a devices x pages matrix project, modeled
 * on studio.app-mockup.com's normalized store (verified against its bundle):
 *
 *   - devices[]  = ROWS  (a device/size class the whole project previews at)
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
 *   output/mockups/<id>/project.json
 *   output/mockups/<id>/sources/     uploaded screenshot images
 *   output/mockups/<id>/exports/     Export section output (zips)
 */

export interface MockupSourceImage {
  id: string;
  name: string;
  file: string; // relative to project dir, e.g. "sources/img_1.png"
  width: number;
  height: number;
  resolution?: string;   // e.g. "1242x2688"
  deviceLabel?: string;  // e.g. "Phone – 6.5\" Display"
}

export interface MockupDeviceRow {
  id: string;
  /** config/devices.json id. */
  deviceId: string;
  variant?: string;
  /** Free label shown in the row header, e.g. "6.5 Inch". */
  label: string;
  previewsVisible: boolean;
  isBase: boolean;
}

export interface TextStyle {
  text: string;
  color: string;
  size: number; // px at a 1080-wide reference canvas
  align: "left" | "center" | "right";
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
   *  extraDevices -- unset for every existing project until a user links
   *  two pages together. See syncLinkedDeviceLayer(). */
  linkedTo?: { pageId: string; layerKey: string };
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
  shadow?: { color: string; blur: number; x: number; y: number };
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
  project: MockupProject,
  pageAId: string,
  layerAKey: string,
  pageBId: string,
  layerBKey: string,
): void {
  const pageA = project.columns.find((c) => c.id === pageAId);
  const pageB = project.columns.find((c) => c.id === pageBId);
  const layerA = pageA && getDeviceLayer(pageA.style, layerAKey);
  const layerB = pageB && getDeviceLayer(pageB.style, layerBKey);
  if (!layerA || !layerB) throw new Error("Both linked layers must exist.");
  layerA.linkedTo = { pageId: pageBId, layerKey: layerBKey };
  layerB.linkedTo = { pageId: pageAId, layerKey: layerAKey };
}

export function unlinkDeviceLayer(project: MockupProject, pageId: string, layerKey: string): void {
  const page = project.columns.find((c) => c.id === pageId);
  const layer = page && getDeviceLayer(page.style, layerKey);
  if (!layer?.linkedTo) return;
  const partnerPage = project.columns.find((c) => c.id === layer.linkedTo!.pageId);
  const partnerLayer = partnerPage && getDeviceLayer(partnerPage.style, layer.linkedTo!.layerKey);
  if (partnerLayer) partnerLayer.linkedTo = undefined;
  layer.linkedTo = undefined;
}

/** Call after committing a transform change to a device layer -- if it's
 *  linked, copies its transform fields onto the linked counterpart (on
 *  whichever page that is) so the two stay in sync. No-op if unlinked. */
export function syncLinkedDeviceLayer(project: MockupProject, pageId: string, layerKey: string): void {
  const page = project.columns.find((c) => c.id === pageId);
  const layer = page && getDeviceLayer(page.style, layerKey);
  if (!layer?.linkedTo) return;
  const partnerPage = project.columns.find((c) => c.id === layer.linkedTo!.pageId);
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
}

/** Preferred vocabulary going forward: a "Page" (Template -> Page -> Layer),
 *  not a "Screen" or "Column" -- those names are used interchangeably
 *  throughout this file/module and the client for the same concept, which
 *  is exactly the confusion this alias exists to start resolving. The
 *  underlying field name (`MockupProject.columns`) and `MockupColumn` type
 *  are NOT renamed yet -- that's a much larger, riskier sweep (400+
 *  references across server.ts and every client module) deferred until
 *  the terminology has proven itself at the edges (types, primary function
 *  names, UI labels) first. New code should prefer `MockupPage`. */
export type MockupPage = MockupColumn;

/** An asset that can span more than one page, positioned once in a shared
 *  "panorama space" (column 0's left edge, by `order`, is x=0) rather than
 *  inside any single column's local 1080-wide box. Separate from
 *  `ColumnStyle.assetLayers` (page-local, untouched) rather than a migration
 *  of it -- additive, same pattern as `extraDevices`/`linkedTo`/`cells`.
 *  Only X is absolute px: every page is the same 1920 tall, so Y/height stay
 *  pct-of-1920 (unambiguous); X spans an open-ended multi-page width, where
 *  "%" has no single fixed denominator, so it must be absolute pixels. */
export interface PanoramaAssetLayer {
  id: string;
  assetId: string; // same convention as MockupAssetLayer.assetId
  name?: string;
  xPx: number;
  widthPx: number;
  yPct: number;
  heightPct?: number;
  rotation: number;
  opacity: number;
  flipH?: boolean;
  flipV?: boolean;
  visible?: boolean;
  locked?: boolean;
  zIndex: number;
}

export interface MockupProject {
  id: string;
  createdAt: string;
  name: string;
  appCategory: string;
  sources: MockupSourceImage[];
  devices: MockupDeviceRow[];
  columns: MockupColumn[];
  /** key = `${deviceId}:${columnId}` */
  cells: Record<string, Partial<ColumnStyle>>;
  globalPanoramic: { file?: string; flip: boolean };
  /** Assets that span across page boundaries -- additive/optional, old
   *  projects without any simply have none. See PanoramaAssetLayer. */
  panoramaAssets?: PanoramaAssetLayer[];
  settings: { inspectorPosition: "left" | "right"; screenshotSizeLabel: string; palette: string[] };
}

import { loadProject, saveProject, listProjects } from "../project/projectStore.js";

const ROOT = path.join(process.cwd(), "output", "projects");

export function mockupDir(id: string): string {
  const dir = path.join(ROOT, id, "mockup");
  // Containment guard
  const rel = path.relative(ROOT, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Invalid mockup project id '${id}'.`);
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
  };
}

export function createMockupProject(init: { name: string; appCategory?: string }): MockupProject {
  const id = `mockup-${Date.now()}`;
  throw new Error("Deprecated: Use createProject from projectStore instead");
}

export function saveMockupProject(project: MockupProject): void {
  const unified = loadProject(project.id);
  unified.mockup = project;
  saveProject(unified);
}

export function loadMockupProject(id: string): MockupProject {
  const unified = loadProject(id);
  return unified.mockup;
}

export function listMockupProjects(): Array<{ id: string; createdAt: string; name: string; columns: number; devices: number }> {
  return listProjects().map((p) => {
    const m = p.mockup;
    return { id: p.id, createdAt: p.createdAt, name: p.name, columns: m.columns?.length ?? 0, devices: m.devices?.length ?? 0 };
  });
}

/** Column edit: applies to the column, so every device row picks it up --
 *  this IS the "propagate across all devices" behaviour; cell overrides
 *  (below) are the explicit per-row exception. */
export function updateColumnStyle(project: MockupProject, columnId: string, style: ColumnStyle): void {
  const idx = project.columns.findIndex((c) => c.id === columnId);
  if (idx === -1) throw new Error(`Column '${columnId}' not found.`);
  project.columns[idx] = { ...project.columns[idx], style };
}

export function cellKey(deviceRowId: string, columnId: string): string {
  return `${deviceRowId}:${columnId}`;
}

export function setCellOverride(project: MockupProject, deviceRowId: string, columnId: string, override: Partial<ColumnStyle> | null): void {
  const key = cellKey(deviceRowId, columnId);
  if (override === null) delete project.cells[key];
  else project.cells[key] = override;
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
export function setCellOverridePath(project: MockupProject, deviceRowId: string, columnId: string, path: string, value: unknown): void {
  const key = cellKey(deviceRowId, columnId);
  const existing = project.cells[key] ?? {};
  const paths = { ...((existing as any)[PATCH_KEY] ?? {}) };
  if (value === undefined) delete paths[path];
  else paths[path] = value;
  const nextOverride: any = { ...existing, [PATCH_KEY]: paths };
  const hasLegacyKeys = Object.keys(nextOverride).some((k) => k !== PATCH_KEY);
  if (Object.keys(paths).length === 0 && !hasLegacyKeys) delete project.cells[key];
  else project.cells[key] = nextOverride;
}

export function clearCellOverridePath(project: MockupProject, deviceRowId: string, columnId: string, path: string): void {
  setCellOverridePath(project, deviceRowId, columnId, path, undefined);
}

/** Effective style for one (device row, column) cell = column style with
 *  any cell-level fields shadowing it. Legacy whole-sub-object override
 *  keys (title/background/deviceOne/etc.) are replaced wholesale, applied
 *  first; sparse per-field path patches (the reserved `__paths` key) are
 *  applied on top and can override a single field without resending its
 *  containing sub-object. */
export function effectiveCellStyle(project: MockupProject, deviceRowId: string, columnId: string): ColumnStyle {
  const column = project.columns.find((c) => c.id === columnId);
  if (!column) throw new Error(`Column '${columnId}' not found.`);
  const override = project.cells[cellKey(deviceRowId, columnId)];
  if (!override) return column.style;
  const { [PATCH_KEY]: paths, ...legacy } = override as any;
  const merged: ColumnStyle = { ...column.style, ...legacy };
  if (paths) {
    const cloned: ColumnStyle = JSON.parse(JSON.stringify(merged));
    for (const [path, value] of Object.entries(paths)) setPath(cloned, path, value);
    return cloned;
  }
  return merged;
}

/** Adding a device row clones every existing column's style into that row
 *  implicitly (there is nothing to clone into -- cells are sparse and a
 *  missing cell just falls back to the column style), matching the
 *  reference's "new device row starts from the base device's screenshots". */
export function addDeviceRow(project: MockupProject, row: Omit<MockupDeviceRow, "id">): MockupDeviceRow {
  const created: MockupDeviceRow = { ...row, id: `dev_${Date.now()}_${Math.round(Math.random() * 1e4)}` };
  project.devices.push(created);
  return created;
}

export function addColumn(project: MockupProject, style: ColumnStyle): MockupColumn {
  const created: MockupColumn = { id: `col_${Date.now()}_${Math.round(Math.random() * 1e4)}`, order: project.columns.length, style };
  project.columns.push(created);
  return created;
}
