/**
 * The one Video Studio device registry: every device a template scene can use,
 * independent of any template.
 *
 *   deviceType : "2D" | "3D"            what the device renders as (the only thing
 *                                        a scene/template cares about)
 *   sourceType : "SVG" | "GLB" | "CSS"  how it is implemented
 *
 * Sources: devices/catalogue.json (catalogue -> a 2D/SVG and a 3D/GLB device each,
 * exported to devices/2d/*.svg and devices/3d/*.glb) and devices/css/*.json
 * (CSS-built devices extracted from templates; `deviceType` says whether the CSS
 * is a flat frame or a 3D box rig). A device is identified by (id, deviceType).
 * Scenes declare a `deviceMode`; only devices with the same `deviceType` are
 * ever selectable or applied.
 */
import fs from "fs";
import path from "path";
import { DEVICES_2D_DIR, DEVICES_CSS_DIR } from "./paths.js";
import { DEVICE_REGISTRY, frameSvgFor, listDevices, type DeviceModel } from "./registry.js";
import { resolveDeviceFrameGeometry } from "../mockup/layerLayout.js";
import { SCREEN_MARKER, scopeCss, type DeviceMode, type SourceType, type RigDeviceAsset } from "./rig-engine.js";

// ---------------------------------------------------------------------------
// CSS devices (devices/css/*.json)
// ---------------------------------------------------------------------------

let cssCache: Map<string, RigDeviceAsset> | null = null;

export function reloadCssDevices(): void { cssCache = null; }

function loadCss(): Map<string, RigDeviceAsset> {
  if (cssCache) return cssCache;
  const out = new Map<string, RigDeviceAsset>();
  if (fs.existsSync(DEVICES_CSS_DIR)) {
    for (const f of fs.readdirSync(DEVICES_CSS_DIR).filter((x) => x.endsWith(".json")).sort()) {
      try {
        const asset = JSON.parse(fs.readFileSync(path.join(DEVICES_CSS_DIR, f), "utf-8")) as RigDeviceAsset;
        if (asset.id && asset.markup?.front) out.set(asset.id, { ...asset, sourceType: "CSS" });
      } catch (e) {
        console.error(`[devices] failed to load ${f}:`, e);
      }
    }
  }
  return (cssCache = out);
}

export function listCssDevices(): RigDeviceAsset[] { return [...loadCss().values()]; }

// ---------------------------------------------------------------------------
// Generated assets for catalogue (2D SVG / 3D GLB) devices
// ---------------------------------------------------------------------------

const GLB_RIG_CSS = `
.phone-3d-rig.shell-migrated { background: transparent; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
.phone-3d-rig.shell-migrated::before, .phone-3d-rig.shell-migrated::after { display: none; }
.device-shell-canvas { pointer-events: none; }`;

/** Front face = screen box positioned by the device's own screen inset (as
 *  percentages of the device box), so any catalogue device lines up with its
 *  frame / GLB aperture at whatever size the rig is. */
function screenBoxFront(device: DeviceModel, faceClass: string, frameSvg: string | null): string {
  const g = device.geometry;
  const fg = resolveDeviceFrameGeometry({
    width: g.width, height: g.height, cornerRadius: g.cornerRadius, screenInset: g.screenInset,
    catalogBorderWidth: device.definition.bezelWidth,
  });
  const s = fg.screen;
  const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(3)}%`;
  const r = fg.screenRadius;
  const radius = `${((r / g.width) * 100).toFixed(3)}% / ${((r / g.height) * 100).toFixed(3)}%`;
  const svg = frameSvg
    ? `<div class="dev2d-frame" style="position:absolute;inset:0;z-index:2;pointer-events:none;">${frameSvg.replace("<svg ", '<svg style="width:100%;height:100%;display:block;" ')}</div>`
    : "";
  return `<div class="${faceClass}" style="position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:transparent;">
  <div class="dev2d-box" style="position:relative;height:100%;max-width:100%;aspect-ratio:${g.width}/${g.height};${frameSvg ? "filter:drop-shadow(0 20px 35px rgba(0,0,0,.45));" : ""}">
    <div class="screen-scroll-wrap dev2d-screen" style="position:absolute;left:${pct(s.left, g.width)};top:${pct(s.top, g.height)};width:${pct(s.width, g.width)};height:${pct(s.height, g.height)};border-radius:${radius};overflow:hidden;background:#000;z-index:1;">${SCREEN_MARKER}</div>
    ${svg}
  </div>
</div>`;
}

function baseFromModel(device: DeviceModel, deviceType: DeviceMode, sourceType: SourceType): Omit<RigDeviceAsset, "id" | "markup" | "css" | "rigClasses"> {
  return {
    name: device.name,
    vendor: device.vendor,
    deviceType,
    sourceType,
    formFactor: device.formFactor,
    dimensions: { width: device.geometry.width, height: device.geometry.height, depth: device.frame.thickness, radius: device.geometry.cornerRadius },
    screen: { ...device.geometry.screenInset, radius: device.geometry.cornerRadius },
    features: [sourceType === "SVG" ? "svg-frame" : "glb-model", device.frame.cutout, ...(device.frame.buttons ? ["side-buttons"] : [])],
    rigClass: "phone-3d-rig",
    fitRig: true,
  };
}

/** 2D SVG-frame asset for a catalogue device (id `<device>~2d` never collides with its 3D twin). */
export function build2dAsset(device: DeviceModel): RigDeviceAsset {
  return {
    ...baseFromModel(device, "2D", "SVG"),
    id: `${device.id}~2d`,
    rigClasses: [],
    markup: { front: screenBoxFront(device, "phone-face front dev2d", frameSvgFor(device, undefined)), sides: [] },
    css: "",
  };
}

/** 3D GLB-shell asset for a catalogue device (id is the plain device id, as the
 *  GLB-shell templates already carry it as their default). */
export function buildGlbAsset(device: DeviceModel): RigDeviceAsset {
  const g = device.geometry;
  return {
    ...baseFromModel(device, "3D", "GLB"),
    id: device.id,
    rigClasses: ["shell-migrated"],
    markup: {
      shell: `<canvas class="device-shell-canvas" data-device-id="${device.id}" data-shell-only="1" width="${g.width}" height="${g.height}" style="position:absolute;inset:0;width:100%;height:100%;z-index:1;"></canvas>`,
      front: screenBoxFront(device, "phone-face front shell-migrated", null),
      sides: [],
    },
    css: GLB_RIG_CSS,
  };
}

// ---------------------------------------------------------------------------
// Unified lookup / listing
// ---------------------------------------------------------------------------

export interface VideoDeviceEntry {
  id: string;
  name: string;
  vendor: string;
  deviceType: DeviceMode;
  sourceType: SourceType;
  formFactor: "phone" | "tablet" | "foldable";
  platforms: string[];
  features: string[];
  dimensions: RigDeviceAsset["dimensions"];
  /** Template a CSS device was extracted from. */
  sourceTemplate?: string;
}

function entryOf(a: RigDeviceAsset, platforms: string[] = []): VideoDeviceEntry {
  return {
    id: a.id.replace(/~2d$/, ""), name: a.name, vendor: a.vendor ?? "", deviceType: a.deviceType, sourceType: a.sourceType,
    formFactor: a.formFactor, platforms, features: a.features, dimensions: a.dimensions, sourceTemplate: a.sourceTemplate,
  };
}

/** Every device in the registry. A catalogue device appears once as a 2D (SVG)
 *  entry and once as a 3D (GLB) entry -- same `id`, different `deviceType`. */
export function listVideoDevices(): VideoDeviceEntry[] {
  const out: VideoDeviceEntry[] = [];
  for (const d of listDevices()) {
    out.push(entryOf(build2dAsset(d), d.platforms));
    out.push(entryOf(buildGlbAsset(d), d.platforms));
  }
  for (const a of listCssDevices()) out.push(entryOf(a));
  return out;
}

/** Devices a scene of `type` may use. */
export function listDevicesForType(type: DeviceMode): VideoDeviceEntry[] {
  return listVideoDevices().filter((d) => d.deviceType === type);
}

/** Resolve a device id for a scene of the given rendering type. Returns null
 *  when no compatible device exists under that id -- a 3D device is never
 *  returned for a 2D scene or vice versa. */
export function resolveRigAsset(id: string | undefined, type: DeviceMode): RigDeviceAsset | null {
  if (!id) return null;
  const plain = id.replace(/^(2d|3d):/, "");
  const css = loadCss().get(plain);
  if (css) return css.deviceType === type ? css : null;
  const device = DEVICE_REGISTRY[plain];
  if (!device) return null;
  return type === "2D" ? build2dAsset(device) : buildGlbAsset(device);
}

export function isDeviceCompatible(id: string | undefined, type: DeviceMode): boolean {
  return resolveRigAsset(id, type) !== null;
}

/** The device to use when `wanted` isn't valid for `type`: the template's own
 *  default if compatible, else the first compatible catalogue device. */
export function fallbackDevice(type: DeviceMode, templateDefault?: string): string {
  if (isDeviceCompatible(templateDefault, type)) return templateDefault!.replace(/^(2d|3d):/, "");
  return listDevicesForType(type)[0]?.id ?? "";
}

// ---------------------------------------------------------------------------
// On-disk asset files (devices/2d/*.svg, devices/3d/*.glb)
// ---------------------------------------------------------------------------

/** Writes `devices/2d/<id>.svg` for every catalogue device so 2D devices exist
 *  as standalone files (as the Mockup Studio ones do). GLBs are written to
 *  `devices/3d/` by `getDeviceGlbPath` on first use / by `syncDeviceAssetFiles`. */
export function sync2dDeviceFiles(): number {
  fs.mkdirSync(DEVICES_2D_DIR, { recursive: true });
  let n = 0;
  for (const d of listDevices({ includeArchived: true })) {
    if (d.definition.customSvgFile) continue; // an uploaded SVG *is* the asset
    const file = path.join(DEVICES_2D_DIR, `${d.id}.svg`);
    const svg = frameSvgFor(d, undefined);
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf-8") !== svg) { fs.writeFileSync(file, svg); n++; }
  }
  return n;
}

export interface SceneDeviceChoice { device: string; deviceMode: DeviceMode }

/** The one place a scene's (device, deviceMode) is made valid: the mode falls
 *  back to the template's, legacy scenes on a CSS-device template keep that
 *  template's device, and a device that isn't compatible with the mode is
 *  replaced by the template default / first compatible device -- so an
 *  incompatible pair can never be saved or rendered. */
export function sanitizeSceneDevice(
  scene: { device?: string; deviceMode?: DeviceMode },
  tpl: { device?: string; deviceMode?: DeviceMode } | null | undefined,
): SceneDeviceChoice {
  const deviceMode = scene.deviceMode ?? tpl?.deviceMode ?? "3D";
  let device = (scene.device ?? "").replace(/^(2d|3d):/, "");
  const tplIsCss = tpl?.device ? loadCss().has(tpl.device) : false;
  if (!scene.deviceMode && tplIsCss) device = tpl!.device!;
  if (!isDeviceCompatible(device, deviceMode)) device = fallbackDevice(deviceMode, tpl?.device);
  return { device, deviceMode };
}

/** Stand-alone preview page for a device (Device Management cards): the device
 *  rig with a placeholder screen, slowly turning when it is a 3D rig. GLB
 *  devices are previewed client-side with three.js instead. */
export function devicePreviewHtml(asset: RigDeviceAsset): string {
  const rig = asset.rigClass;
  const size = asset.fitRig
    ? { height: 760, width: Math.round((760 * asset.dimensions.width) / asset.dimensions.height) }
    : { width: asset.dimensions.width, height: asset.dimensions.height };
  const screen = `<div style="position:absolute;inset:0;background:linear-gradient(160deg,#6366f1,#22d3ee);"></div>`;
  const m = asset.markup;
  const inner = [m.ambient, m.front.replace(SCREEN_MARKER, screen), m.back, ...m.sides].filter(Boolean).join("\n");
  const spin = asset.deviceType === "3D" ? "animation:spin 9s linear infinite;" : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#0e0f13;overflow:hidden}
.stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;perspective:1600px}
.fit{transform:scale(var(--s,.24));transform-style:preserve-3d}
.${rig}{position:relative;transform-style:preserve-3d;${spin}}
.phone-screen,.phone-screen-img{width:100%;height:100%;object-fit:cover}
@keyframes spin{from{transform:rotateY(-25deg)}50%{transform:rotateY(25deg)}to{transform:rotateY(-25deg)}}
${scopeCss(asset.css, asset.id, asset.rigClass, rig)}
</style></head><body><div class="stage"><div class="fit"><div class="${[rig, ...asset.rigClasses].join(" ")}" data-device="${asset.id}" style="width:${size.width}px;height:${size.height}px;">
${inner}
</div></div></div>
<script>const f=()=>{document.querySelector('.fit').style.setProperty('--s',Math.min(innerWidth/(${size.width}+120),innerHeight/(${size.height}+60)))};f();addEventListener('resize',f)</script>
</body></html>`;
}
