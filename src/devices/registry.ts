import fs from "fs";
import path from "path";
import { buildFrameSvg } from "./build-frame-svg.js";
import { CURRENT_SCHEMA_VERSION, type DeviceDefinition, type DeviceVariant as SchemaVariant } from "./schema.js";

/** Compat shape: identical to the pre-GLB `DeviceGeometry` so `still.ts`,
 *  `src/render/shared.ts`, `mockup/render.ts`, `video/render.ts` etc. need
 *  no changes — derived from `DeviceDefinition.geometry` +
 *  `DeviceDefinition.screenInset` at resolve time. */
export interface DeviceGeometry {
  width: number;
  height: number;
  screenInset: { top: number; left: number; width: number; height: number };
  cornerRadius?: number;
}

/** Compat shape for the flat-path frame styling — derived from the new
 *  `DeviceDefinition`, still read by `src/render/shared.ts::device3dMarkup`
 *  until Phase 5 replaces it with the real GLB rig. */
export interface DeviceFrameTraits {
  bezelWidth: number;
  outerRadius: number;
  body: string;
  accent: string;
  cutout: "none" | "notch" | "punch-hole" | "dynamic-island" | "pill";
  cutoutSize?: { width: number; height: number };
  fold?: { axis: "vertical" | "horizontal"; seamOffset: number };
  buttons?: boolean;
  thickness?: number;
}

export interface DeviceVariant {
  id: string;
  name: string;
  geometry: DeviceGeometry;
}

export interface DeviceCatalogueEntry {
  id: string;
  name: string;
  vendor: string;
  releaseYear?: number;
  platforms: ("google-play" | "apple-app-store")[];
  formFactor: "phone" | "tablet" | "foldable";
  geometry: DeviceGeometry;
  frame: DeviceFrameTraits;
  variants?: DeviceVariant[];
}

/** Resolved device: the compat surface above (unchanged shape) plus the
 *  full `definition` for anything that wants the richer GLB-era schema
 *  (`device-manager.ts`, the GLB builder, CRUD). */
export interface DeviceModel extends DeviceCatalogueEntry {
  styles: ("default" | "clay")[];
  colorways: ("light" | "dark")[];
  svgFrame: string;
  definition: DeviceDefinition;
}

const CONFIG_PATH = path.join(process.cwd(), "config", "devices.json");

/** Schema migration chain, keyed on `schemaVersion` — a no-op today since
 *  only v2 (the GLB-era schema) exists, but this is the seam future
 *  breaking changes to `DeviceDefinition` hook into (see plan "Schema
 *  versioning"). Unknown/future versions pass through unchanged; only a
 *  version *below* current would need an actual migration step once one
 *  exists. */
function migrateDeviceDefinition(raw: DeviceDefinition): DeviceDefinition {
  if (raw.schemaVersion == null) {
    throw new Error(`Device "${raw.id}" is missing schemaVersion — cannot load without it.`);
  }
  if (raw.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Device "${raw.id}" has schemaVersion ${raw.schemaVersion}, newer than this build supports (${CURRENT_SCHEMA_VERSION}).`);
  }
  // No migrations registered yet — v2 is both the floor and the ceiling.
  return raw;
}

function loadCatalogue(): DeviceDefinition[] {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Device catalogue not found at ${CONFIG_PATH}. Reinstall or restore config/devices.json.`);
  }
  const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as { devices: DeviceDefinition[] };
  return parsed.devices.map(migrateDeviceDefinition);
}

function compatGeometry(def: DeviceDefinition): DeviceGeometry {
  return {
    width: def.geometry.width,
    height: def.geometry.height,
    screenInset: { ...def.screenInset },
    cornerRadius: def.geometry.cornerRadius,
  };
}

function compatFrame(def: DeviceDefinition): DeviceFrameTraits {
  const unfoldedVariant = def.variants?.find((v) => v.fold.state === "unfolded");
  return {
    bezelWidth: def.bezelWidth,
    outerRadius: def.geometry.cornerRadius,
    body: def.body,
    accent: def.accent,
    cutout: def.cutout.type,
    cutoutSize: def.cutout.size,
    fold: unfoldedVariant ? { axis: unfoldedVariant.fold.axis, seamOffset: unfoldedVariant.fold.axis === "horizontal" ? unfoldedVariant.geometry.height / 2 : unfoldedVariant.geometry.width / 2 } : undefined,
    buttons: Boolean(def.buttons && def.buttons.length > 0),
    thickness: def.geometry.thickness,
  };
}

function compatVariant(v: SchemaVariant): DeviceVariant {
  return {
    id: v.id,
    name: v.name,
    geometry: { width: v.geometry.width, height: v.geometry.height, screenInset: { ...v.screenInset }, cornerRadius: v.geometry.cornerRadius },
  };
}

function resolveModel(def: DeviceDefinition): DeviceModel {
  return {
    id: def.id,
    name: def.name,
    vendor: def.vendor,
    releaseYear: def.releaseYear,
    platforms: def.platforms,
    formFactor: def.formFactor,
    geometry: compatGeometry(def),
    frame: compatFrame(def),
    variants: def.variants?.map(compatVariant),
    styles: ["default"],
    colorways: ["light", "dark"],
    svgFrame: def.customSvg || buildFrameSvg(def, "dark"),
    definition: def,
  };
}

/** Catalogue-backed registry, id -> resolved DeviceModel. `frame`/`geometry`
 *  are compat views derived from `config/devices.json`'s `DeviceDefinition`
 *  entries (see `src/devices/schema.ts`); `definition` carries the full
 *  richer shape. Adding a device is a JSON entry, no code. */
export let DEVICE_REGISTRY: Record<string, DeviceModel> = Object.fromEntries(
  loadCatalogue().map((def) => [def.id, resolveModel(def)]),
);

export function reloadRegistry(): void {
  DEVICE_REGISTRY = Object.fromEntries(
    loadCatalogue().map((def) => [def.id, resolveModel(def)]),
  );
}

export interface ListDevicesFilter {
  platform?: "google-play" | "apple-app-store";
  formFactor?: "phone" | "tablet" | "foldable";
  /** Include archived devices (default false) — see plan "Archive/Delete". */
  includeArchived?: boolean;
}

/** Powers the device dropdowns in Studio Mockups (Step 2) and Animation
 *  Video (Step 4) — grouped by vendor, filterable by platform/form factor.
 *  Archived devices are excluded by default so they stop appearing for new
 *  selections while staying resolvable by id for existing projects. */
export function listDevices(filter: ListDevicesFilter = {}): DeviceModel[] {
  return Object.values(DEVICE_REGISTRY).filter((d) => {
    if (!filter.includeArchived && d.definition.archived) return false;
    if (filter.platform && !d.platforms.includes(filter.platform)) return false;
    if (filter.formFactor && d.formFactor !== filter.formFactor) return false;
    return true;
  });
}

/** Resolve a device + optional variant id to the geometry that should
 *  actually be rendered (foldables select folded/unfolded here). */
export function resolveGeometry(device: DeviceModel, variantId?: string): DeviceGeometry {
  if (!device) return { width: 1080, height: 1920, screenInset: { top: 0, left: 0, width: 1080, height: 1920 } };
  if (!variantId) return device.geometry;
  const variant = device.variants?.find((v) => v.id === variantId);
  return variant?.geometry ?? device.geometry;
}

/** The full `DeviceDefinition` for a variant (folded/unfolded geometry +
 *  screenInset + fold metadata) — used by the GLB/3D path where the compat
 *  `DeviceGeometry` isn't enough. Falls back to the base definition. */
export function resolveVariantDefinition(device: DeviceModel, variantId?: string): { geometry: DeviceDefinition["geometry"]; screenInset: DeviceDefinition["screenInset"] } {
  if (!device) return { geometry: { width: 1080, height: 1920, thickness: 10, cornerRadius: 0 }, screenInset: { top: 0, left: 0, width: 1080, height: 1920 } };
  if (!variantId) return { geometry: device.definition.geometry, screenInset: device.definition.screenInset };
  const variant = device.definition.variants?.find((v) => v.id === variantId);
  return variant ? { geometry: variant.geometry, screenInset: variant.screenInset } : { geometry: device.definition.geometry, screenInset: device.definition.screenInset };
}

/** Frame SVG for a device at a specific variant's geometry -- `device.svgFrame`
 *  is built once from the *base* geometry, so a foldable's folded/unfolded
 *  variant needs its own frame or the bezel stretches to fit the wrong shape. */
export function frameSvgFor(device: DeviceModel, variantId?: string, overrides?: { borderColor?: string; bezelColor?: string; showCamera?: boolean; borderThickness?: number; bezelThickness?: number }): string {
  if (!device) return "";
  if (overrides?.borderColor || overrides?.bezelColor || overrides?.showCamera === false || overrides?.borderThickness != null || overrides?.bezelThickness != null) {
    const geometry = resolveGeometry(device, variantId);
    const geom = { width: geometry.width, height: geometry.height, thickness: device.definition.geometry.thickness, cornerRadius: geometry.cornerRadius ?? 0 };
    return buildFrameSvg(device.definition, "dark", geom, overrides);
  }
  if (!variantId) return device.svgFrame;
  const geometry = resolveGeometry(device, variantId);
  if (geometry === device.geometry) return device.svgFrame;
  const variantGeom = { width: geometry.width, height: geometry.height, thickness: device.definition.geometry.thickness, cornerRadius: geometry.cornerRadius ?? 0 };
  return buildFrameSvg(device.definition, "dark", variantGeom);
}
