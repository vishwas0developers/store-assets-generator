import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildDeviceGlb } from "./build-glb.js";
import { ensureGltfNodeEnv } from "./gltf-node-env.js";
import { CURRENT_SCHEMA_VERSION, type DeviceDefinition } from "./schema.js";
import { DEVICE_REGISTRY, reloadRegistry } from "./registry.js";
import { CATALOGUE_PATH, DEVICES_3D_DIR } from "./paths.js";

/** CPU-only device lifecycle surface (Phase 3 of the plan) — GLB build,
 *  export, import/validation, and CRUD. No renderer/GPU context is created
 *  or required by anything in this file; `createRenderer`/`seek` (the
 *  GPU-touching surface) live separately (Phase 4) and are only ever
 *  called from browser contexts. See plan "GPU/WebGL scope". */

const CONFIG_PATH = CATALOGUE_PATH;
const GLB_CACHE_DIR = DEVICES_3D_DIR;
const APPLICATIONS_ROOT = path.join(process.cwd(), "output", "applications");

// ---------------------------------------------------------------------------
// GLB build cache (procedural path)
// ---------------------------------------------------------------------------

/** Builds (or returns the cached) GLB for a device's *current* definition.
 *  Procedural devices are rebuilt if the cached file is missing or older
 *  than `devices/catalogue.json`; override devices just read their pinned
 *  file directly. CPU-only. */
export async function getDeviceGlbPath(def: DeviceDefinition): Promise<string> {
  if (def.overrideGlbPath) return def.overrideGlbPath;

  fs.mkdirSync(GLB_CACHE_DIR, { recursive: true });
  const cachePath = path.join(GLB_CACHE_DIR, `${def.id}.glb`);
  const configMtime = fs.existsSync(CONFIG_PATH) ? fs.statSync(CONFIG_PATH).mtimeMs : 0;
  // The cached GLB is also stale when the procedural builder that produced it has been rebuilt since.
  const builderFile = fileURLToPath(new URL("./build-glb.js", import.meta.url));
  const builderMtime = fs.existsSync(builderFile) ? fs.statSync(builderFile).mtimeMs : 0;
  const cacheStale = !fs.existsSync(cachePath) || fs.statSync(cachePath).mtimeMs < Math.max(configMtime, builderMtime);
  if (cacheStale) {
    const glb = await buildDeviceGlb(def);
    fs.writeFileSync(cachePath, glb);
  }
  return cachePath;
}

// ---------------------------------------------------------------------------
// Parse / load (CPU-only — GLTFLoader.parse, no renderer)
// ---------------------------------------------------------------------------

export interface ParsedDeviceNode {
  role: string;
  name: string;
  node: any;
}

export interface ParsedDevice {
  scene: any;
  root: any;
  nodesByRole: Map<string, ParsedDeviceNode[]>;
}

/** Parses a GLB buffer's scene graph and indexes nodes by their `extras`
 *  `role` tag (`screen`, `body`, `camera-lens`, `button`, `port`, `hinge`,
 *  `device-root`). Pure CPU parse — no renderer involved. */
export function parseDeviceGlb(buffer: Buffer): Promise<ParsedDevice> {
  ensureGltfNodeEnv();
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    loader.parse(
      arrayBuffer,
      "",
      (gltf: any) => {
        const root = gltf.scene.children.find((n: any) => n.userData?.role === "device-root") ?? gltf.scene.children[0];
        const nodesByRole = new Map<string, ParsedDeviceNode[]>();
        root?.traverse((n: any) => {
          const role = n.userData?.role;
          if (!role) return;
          const list = nodesByRole.get(role) ?? [];
          list.push({ role, name: n.name, node: n });
          nodesByRole.set(role, list);
        });
        resolve({ scene: gltf.scene, root, nodesByRole });
      },
      (err: unknown) => reject(err),
    );
  });
}

export async function loadDevice(def: DeviceDefinition): Promise<ParsedDevice> {
  const glbPath = await getDeviceGlbPath(def);
  const buffer = fs.readFileSync(glbPath);
  return parseDeviceGlb(buffer);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Round-trip export via the procedural builder — binary, embedded
 *  textures/materials, zero external references (see plan
 *  "Self-contained guarantee"). CPU-only. */
export async function exportDeviceGlb(def: DeviceDefinition): Promise<Buffer> {
  return buildDeviceGlb(def);
}

// ---------------------------------------------------------------------------
// Import validation
// ---------------------------------------------------------------------------

export interface ImportValidationError {
  stage: string;
  message: string;
}

export interface ImportValidationResult {
  ok: boolean;
  errors: ImportValidationError[];
  extras?: Record<string, unknown>;
}

const ALLOWED_GLTF_EXTENSIONS = new Set([
  "KHR_materials_unlit",
  "KHR_materials_emissive_strength",
  "KHR_texture_transform",
  "KHR_mesh_quantization",
  "KHR_lights_punctual",
]);

const MAX_TRIANGLES = 500_000;

/** Full import validation checklist from the plan — container/version,
 *  self-containment, schema, required roles, geometry sanity, units,
 *  extensions. Fails fast with a specific error per stage. Does not run
 *  the ID-collision/CRUD check (that needs the caller's target id — see
 *  `importDevice`). CPU-only, no render call. */
export async function validateGlbImport(buffer: Buffer): Promise<ImportValidationResult> {
  const errors: ImportValidationError[] = [];

  // 1. Container/version
  const magic = buffer.toString("ascii", 0, 4);
  if (magic !== "glTF") {
    return { ok: false, errors: [{ stage: "container", message: "Not a valid .glb container (bad magic bytes)." }] };
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    errors.push({ stage: "container", message: `Unsupported glTF version ${version}, expected 2.` });
  }

  // Extract the JSON chunk to check self-containment/extensions without a full parse.
  let json: any;
  try {
    const jsonChunkLength = buffer.readUInt32LE(12);
    const jsonStr = buffer.toString("utf-8", 20, 20 + jsonChunkLength);
    json = JSON.parse(jsonStr);
  } catch (e) {
    return { ok: false, errors: [{ stage: "container", message: `Could not read JSON chunk: ${e instanceof Error ? e.message : String(e)}` }] };
  }

  // 2. Self-containment: no external buffer/image URIs.
  const externalRefs = [...(json.buffers ?? []), ...(json.images ?? [])].filter((r: any) => typeof r.uri === "string");
  if (externalRefs.length > 0) {
    errors.push({ stage: "self-containment", message: `${externalRefs.length} buffer/image reference(s) point outside the file (uri set) — not self-contained.` });
  }

  // 4. Required roles: parse the full scene to check node-level extras.
  // (Ordered before stage 3 — glTF-standard exporters round-trip node-level
  // `extras`, not scene-level `asset.extras`, so schemaVersion is read off
  // the device-root node's extras, which requires a parse first.)
  let parsed: ParsedDevice | null = null;
  try {
    parsed = await parseDeviceGlb(buffer);
  } catch (e) {
    return { ok: false, errors: [...errors, { stage: "parse", message: `GLTFLoader failed to parse: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  if (!parsed.root || parsed.root.userData?.role !== "device-root") {
    errors.push({ stage: "required-roles", message: "No node tagged extras.role=\"device-root\" found." });
  }
  if (!parsed.nodesByRole.has("screen")) {
    errors.push({ stage: "required-roles", message: "No node tagged extras.role=\"screen\" found — required for screenshot/video injection." });
  }
  const rootExtras = parsed.root?.userData ?? {};
  for (const field of ["id", "name", "vendor", "formFactor", "platforms"]) {
    if (rootExtras[field] == null) errors.push({ stage: "required-roles", message: `device-root missing required field "${field}".` });
  }

  // 3. Schema
  const schemaVersion = rootExtras.schemaVersion ?? json.asset?.extras?.schemaVersion;
  if (schemaVersion == null) {
    errors.push({ stage: "schema", message: "device-root node is missing extras.schemaVersion." });
  } else if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    errors.push({ stage: "schema", message: `schemaVersion ${schemaVersion} is newer than this build supports (${CURRENT_SCHEMA_VERSION}).` });
  }

  // 5. Geometry sanity + 6. Units (approximate: bounding box within a plausible range).
  let triangles = 0;
  let hasNaN = false;
  const box = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  parsed.root?.traverse((n: any) => {
    const pos = n.geometry?.attributes?.position;
    if (!pos) return;
    triangles += pos.count / 3;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { hasNaN = true; continue; }
      box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
      box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
      box.minZ = Math.min(box.minZ, z); box.maxZ = Math.max(box.maxZ, z);
    }
  });
  if (hasNaN) errors.push({ stage: "geometry-sanity", message: "Geometry contains NaN/Infinity vertices." });
  if (triangles > MAX_TRIANGLES) errors.push({ stage: "geometry-sanity", message: `Triangle count ${Math.round(triangles)} exceeds ceiling of ${MAX_TRIANGLES}.` });
  const width = box.maxX - box.minX;
  if (!Number.isFinite(width) || width <= 0) {
    errors.push({ stage: "geometry-sanity", message: "Degenerate/zero-size bounding box." });
  } else if (width > 5 || width < 0.001) {
    errors.push({ stage: "units", message: `Bounding box width ${width.toFixed(4)}m is outside the plausible device range (0.001-5m) — check for a units/scale mistake.` });
  }

  // 8. Extensions
  const usedExtensions: string[] = json.extensionsUsed ?? [];
  const unknown = usedExtensions.filter((e) => !ALLOWED_GLTF_EXTENSIONS.has(e) && !e.startsWith("KHR_materials_") /* allow the common materials family loosely */);
  if (unknown.length > 0) {
    errors.push({ stage: "extensions", message: `Unsupported glTF extension(s): ${unknown.join(", ")}.` });
  }

  return { ok: errors.length === 0, errors, extras: rootExtras };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

function writeCatalogue(devices: DeviceDefinition[]): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ devices }, null, 2) + "\n");
  reloadRegistry();
}

function readCatalogueRaw(): DeviceDefinition[] {
  const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as { devices: DeviceDefinition[] };
  return parsed.devices;
}

export class DeviceIdCollisionError extends Error {
  constructor(id: string) {
    super(`A device with id "${id}" already exists — rename or edit the existing entry instead of overwriting it.`);
  }
}

/** Create: register a new procedurally-sourced device. Rejects id collisions. */
export function createDevice(def: DeviceDefinition): void {
  const devices = readCatalogueRaw();
  if (devices.some((d) => d.id === def.id)) throw new DeviceIdCollisionError(def.id);
  writeCatalogue([...devices, { ...def, schemaVersion: CURRENT_SCHEMA_VERSION }]);
}

/** Import: validate a GLB, extract its extras as a `DeviceDefinition`
 *  snapshot (source-of-truth stays JSON per plan), register it with
 *  `overrideGlbPath` pointing at the imported file. Rejects id collisions
 *  unless `replaceId` matches an existing device (re-import/edit flow). */
export async function importDevice(buffer: Buffer, storedGlbPath: string, opts: { replaceId?: string } = {}): Promise<DeviceDefinition> {
  const result = await validateGlbImport(buffer);
  if (!result.ok) {
    throw new Error(`Import rejected:\n${result.errors.map((e) => `[${e.stage}] ${e.message}`).join("\n")}`);
  }
  const extras = result.extras!;
  const id = (extras.id as string) ?? path.basename(storedGlbPath, ".glb");

  const devices = readCatalogueRaw();
  const collision = devices.find((d) => d.id === id);
  if (collision && collision.id !== opts.replaceId) throw new DeviceIdCollisionError(id);

  fs.mkdirSync(path.dirname(storedGlbPath), { recursive: true });
  fs.writeFileSync(storedGlbPath, buffer);

  const parsed = await parseDeviceGlb(buffer);
  const screenNode = parsed.nodesByRole.get("screen")?.[0]?.node;

  const minimalDef: DeviceDefinition = {
    id,
    name: (extras.name as string) ?? id,
    vendor: (extras.vendor as string) ?? "Imported",
    platforms: (extras.platforms as DeviceDefinition["platforms"]) ?? ["google-play"],
    formFactor: (extras.formFactor as DeviceDefinition["formFactor"]) ?? "phone",
    // Geometry/screenInset/bezel/cutout/buttons for an imported device are
    // whatever the existing entry already had (edit-in-place re-import) or
    // sane phone defaults (brand-new import) — the GLB itself remains the
    // rendering source of truth via `overrideGlbPath`; this JSON snapshot
    // exists so catalogue tooling that reads devices.json as JSON has
    // something consistent to show, per plan "Source of truth".
    geometry: collision?.geometry ?? { width: 1080, height: 2400, thickness: 80, cornerRadius: 40 },
    screenInset: collision?.screenInset ?? { top: 30, left: 30, width: 1020, height: 2340 },
    bezelWidth: collision?.bezelWidth ?? 16,
    edgeProfile: collision?.edgeProfile ?? "curved",
    cutout: collision?.cutout ?? { type: "punch-hole" },
    cameraIsland: collision?.cameraIsland ?? { style: "none", position: { xPct: 0, yPct: 0 }, size: { widthPct: 0, heightPct: 0 }, cornerRadius: 0, lenses: [] },
    buttons: collision?.buttons ?? [],
    ports: collision?.ports ?? [],
    body: collision?.body ?? "#1a1a1a",
    accent: collision?.accent ?? "#3a3a3a",
    railMaterial: collision?.railMaterial ?? "aluminum",
    variants: collision?.variants,
    overrideGlbPath: storedGlbPath,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  if (!screenNode) {
    // Already caught by validation, but keep the invariant explicit here too.
    throw new Error("Imported GLB has no screen node after parse — this should not happen post-validation.");
  }

  const next = collision ? devices.map((d) => (d.id === id ? minimalDef : d)) : [...devices, minimalDef];
  writeCatalogue(next);
  return minimalDef;
}

/** Scans stored application JSON (`output/applications/<id>/application.json`) for any
 *  reference to `deviceId` (Mockup Studio) or `device` (Video Studio) equal
 *  to the given device id. Best-effort text/JSON scan, not schema-typed
 *  against every application shape — see plan CRUD "reverse-reference scan". */
export function findDeviceReferences(deviceId: string): string[] {
  if (!fs.existsSync(APPLICATIONS_ROOT)) return [];
  const referencing: string[] = [];
  for (const entry of fs.readdirSync(APPLICATIONS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const applicationFile = path.join(APPLICATIONS_ROOT, entry.name, "application.json");
    if (!fs.existsSync(applicationFile)) continue;
    try {
      const raw = fs.readFileSync(applicationFile, "utf-8");
      const doc = JSON.parse(raw);
      const json = JSON.stringify(doc);
      // Cheap, deliberately loose check: any "deviceId":"<id>" or
      // "device":"<id>" occurrence anywhere in the document.
      if (json.includes(`"deviceId":"${deviceId}"`) || json.includes(`"device":"${deviceId}"`)) {
        referencing.push(entry.name);
      }
    } catch {
      // Unreadable/corrupt application file — skip rather than block the scan.
    }
  }
  return referencing;
}

export interface ArchivedDeviceEntry extends DeviceDefinition {
  archived: true;
}

/** Archive: drop out of default `listDevices()` results but keep resolvable
 *  by id (existing applications keep working). Used when a device has
 *  references; hard delete is reserved for zero-reference devices. */
export function archiveDevice(id: string): void {
  const devices = readCatalogueRaw();
  const next = devices.map((d) => (d.id === id ? { ...d, archived: true } : d));
  writeCatalogue(next as DeviceDefinition[]);
}

export function unarchiveDevice(id: string): void {
  const devices = readCatalogueRaw();
  const next = devices.map((d) => {
    if (d.id !== id) return d;
    const { archived, ...rest } = d as DeviceDefinition & { archived?: boolean };
    return rest as DeviceDefinition;
  });
  writeCatalogue(next);
}

export class DeviceInUseError extends Error {
  constructor(id: string, refs: string[]) {
    super(`Cannot delete device "${id}" — referenced by ${refs.length} application(s): ${refs.join(", ")}. Archive it instead.`);
  }
}

/** Hard delete — permitted only for devices with zero application references
 *  (reverse-reference scan runs first). */
export function deleteDevice(id: string): void {
  const refs = findDeviceReferences(id);
  if (refs.length > 0) throw new DeviceInUseError(id, refs);
  const devices = readCatalogueRaw();
  writeCatalogue(devices.filter((d) => d.id !== id));
  const cachePath = path.join(GLB_CACHE_DIR, `${id}.glb`);
  if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
}

/** Duplicate: clone under a new id, `"<name> copy"` — never mutates the
 *  source entry. */
export function duplicateDevice(sourceId: string, newId: string): DeviceDefinition {
  const devices = readCatalogueRaw();
  const source = devices.find((d) => d.id === sourceId);
  if (!source) throw new Error(`Device "${sourceId}" not found.`);
  if (devices.some((d) => d.id === newId)) throw new DeviceIdCollisionError(newId);
  const clone: DeviceDefinition = { ...source, id: newId, name: `${source.name} copy` };
  writeCatalogue([...devices, clone]);
  return clone;
}

export function getRawDeviceDefinition(id: string): DeviceDefinition | undefined {
  return DEVICE_REGISTRY[id]?.definition;
}
