import fs from "fs";
import path from "path";
import { buildFrameSvg } from "./frame.js";

export interface DeviceGeometry {
  width: number;
  height: number;
  screenInset: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  cornerRadius?: number;
}

export interface DeviceFrameTraits {
  bezelWidth: number;
  outerRadius: number;
  body: string;
  accent: string;
  cutout: "none" | "notch" | "punch-hole" | "dynamic-island" | "pill";
  cutoutSize?: { width: number; height: number };
  fold?: { axis: "vertical" | "horizontal"; seamOffset: number };
  buttons?: boolean;
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

/** Backward-compatible shape: existing callers (still.ts, MCP
 *  list_device_profiles) read `svgFrame` + `styles`/`colorways` off a
 *  resolved model, same as the original two-device hardcoded registry. */
export interface DeviceModel extends DeviceCatalogueEntry {
  styles: ("default" | "clay")[];
  colorways: ("light" | "dark")[];
  svgFrame: string;
}

const CONFIG_PATH = path.join(process.cwd(), "config", "devices.json");

function loadCatalogue(): DeviceCatalogueEntry[] {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Device catalogue not found at ${CONFIG_PATH}. Reinstall or restore config/devices.json.`);
  }
  const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as { devices: DeviceCatalogueEntry[] };
  return parsed.devices;
}

function resolveModel(entry: DeviceCatalogueEntry): DeviceModel {
  return {
    ...entry,
    styles: ["default"],
    colorways: ["light", "dark"],
    svgFrame: buildFrameSvg(entry, "dark"),
  };
}

/** Catalogue-backed registry, id -> resolved DeviceModel (frame drawn from
 *  config/devices.json geometry/traits — see src/devices/frame.ts and
 *  docs/DEVICE-FRAMES.md). Adding a device is a JSON entry, no code. */
export const DEVICE_REGISTRY: Record<string, DeviceModel> = Object.fromEntries(
  loadCatalogue().map((entry) => [entry.id, resolveModel(entry)]),
);

export interface ListDevicesFilter {
  platform?: "google-play" | "apple-app-store";
  formFactor?: "phone" | "tablet" | "foldable";
}

/** Powers the device dropdowns in Studio Mockups (Step 2) and Animation
 *  Video (Step 4) — grouped by vendor, filterable by platform/form factor. */
export function listDevices(filter: ListDevicesFilter = {}): DeviceModel[] {
  return Object.values(DEVICE_REGISTRY).filter((d) => {
    if (filter.platform && !d.platforms.includes(filter.platform)) return false;
    if (filter.formFactor && d.formFactor !== filter.formFactor) return false;
    return true;
  });
}

/** Resolve a device + optional variant id to the geometry that should
 *  actually be rendered (foldables select folded/unfolded here). */
export function resolveGeometry(device: DeviceModel, variantId?: string): DeviceGeometry {
  if (!variantId) return device.geometry;
  const variant = device.variants?.find((v) => v.id === variantId);
  return variant?.geometry ?? device.geometry;
}

/** Frame SVG for a device at a specific variant's geometry -- `device.svgFrame`
 *  is built once from the *base* geometry, so a foldable's folded/unfolded
 *  variant needs its own frame or the bezel stretches to fit the wrong shape. */
export function frameSvgFor(device: DeviceModel, variantId?: string): string {
  if (!variantId) return device.svgFrame;
  const geometry = resolveGeometry(device, variantId);
  if (geometry === device.geometry) return device.svgFrame;
  return buildFrameSvg(device, "dark", geometry);
}
