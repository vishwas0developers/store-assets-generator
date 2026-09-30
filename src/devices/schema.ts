/** Source-of-truth device schema. A `DeviceDefinition` is authored as JSON
 *  (`devices/catalogue.json`) and compiled to a self-contained GLB by
 *  `build-glb.ts` (procedural path) or supplied directly as an imported GLB
 *  whose `extras` are read back into this same shape (override path) — see
 *  docs/DEVICE-FRAMES.md "Source of truth". */

export interface DeviceGeometry {
  width: number;
  height: number;
  thickness: number;
  cornerRadius: number;
}

/** Same shape/units as the pre-GLB `DeviceGeometry.screenInset` so the flat
 *  2D App Store screenshot path (`build-frame-svg.ts`, `deviceMarkup`) needs
 *  zero new concept. */
export interface ScreenInset {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type CutoutType = "none" | "notch" | "punch-hole" | "dynamic-island" | "pill";

export interface Cutout {
  type: CutoutType;
  size?: { width: number; height: number };
  offset?: { x: number; y: number };
}

export type CameraIslandStyle = "none" | "square-island" | "vertical-bar" | "circle-ring" | "pill-bar";

export interface CameraLens {
  xPct: number;
  yPct: number;
  diameterPct: number;
  ring?: boolean;
}

export interface CameraIsland {
  style: CameraIslandStyle;
  position: { xPct: number; yPct: number };
  size: { widthPct: number; heightPct: number };
  cornerRadius: number;
  lenses: CameraLens[];
}

export type ButtonKind = "power" | "volume-up" | "volume-down" | "action" | "camera-shutter" | "s-pen-slot";
export type EdgeFace = "left" | "right" | "top" | "bottom";

export interface DeviceButton {
  face: EdgeFace;
  kind: ButtonKind;
  offsetPct: number;
  lengthPct: number;
}

export type PortKind = "usb-c" | "sim-tray" | "speaker-grille" | "mic";

export interface DevicePort {
  face: "top" | "bottom";
  kind: PortKind;
  offsetPct: number;
}

export type EdgeProfile = "flat" | "curved" | "chamfered";
export type RailMaterial = "titanium" | "aluminum" | "polished-steel" | "matte-glass";

export interface FoldVariantState {
  axis: "vertical" | "horizontal";
  state: "folded" | "unfolded";
  hingeAngleDeg: number;
}

export interface DeviceVariant {
  id: string;
  name: string;
  geometry: DeviceGeometry;
  screenInset: ScreenInset;
  fold: FoldVariantState;
}

export const CURRENT_SCHEMA_VERSION = 2;

export interface DeviceDefinition {
  id: string;
  name: string;
  vendor: string;
  releaseYear?: number;
  platforms: ("google-play" | "apple-app-store")[];
  formFactor: "phone" | "tablet" | "foldable";
  geometry: DeviceGeometry;
  screenInset: ScreenInset;
  /** Stroke width of the flat 2D bezel outline (`build-frame-svg.ts`) —
   *  independent of the 3D body's edge geometry. */
  bezelWidth: number;
  edgeProfile: EdgeProfile;
  cutout: Cutout;
  cameraIsland: CameraIsland;
  buttons: DeviceButton[];
  ports: DevicePort[];
  body: string;
  accent: string;
  railMaterial: RailMaterial;
  variants?: DeviceVariant[];
  /** Only present when the device is on the override/import path — points
   *  at a hand-modeled GLB instead of the procedural builder's output. */
  overrideGlbPath?: string;
  /** Set by `archiveDevice()` — drops out of `listDevices()`'s default
   *  results but stays resolvable by id so existing projects don't break.
   *  See plan "Device lifecycle (CRUD)". */
  archived?: boolean;
  /** Optional custom SVG string for uploaded SVG device templates */
  customSvg?: string;
  /** File name in devices/2d/ holding a custom uploaded 2D SVG frame. */
  customSvgFile?: string;
  /** Which render path the UI should show first for this device (2D flat
   *  SVG vs 3D GLB/rig). Defaults to "3d" when absent — see
   *  `resolveDeviceMode()` in registry.ts. */
  defaultMode?: "2d" | "3d";
  schemaVersion: number;
}
