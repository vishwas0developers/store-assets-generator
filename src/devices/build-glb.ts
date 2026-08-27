import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { ensureGltfNodeEnv } from "./gltf-node-env.js";
import type { DeviceDefinition, DeviceButton, DevicePort, EdgeFace } from "./schema.js";

/** Single fixed px->three.js-meters scale, defined once — nothing outside
 *  this file needs to know the conversion factor exists (per plan "Units").
 *  1080px (a typical phone's geometry.width) -> ~0.09m, a plausible
 *  real-world phone width at this scale. */
const PX_TO_M = 1 / 12000;

function roundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const w = width * PX_TO_M;
  const h = height * PX_TO_M;
  const r = Math.min(radius * PX_TO_M, w / 2, h / 2);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return shape;
}

function buildBody(def: DeviceDefinition): THREE.Mesh {
  const { width, height, cornerRadius, thickness } = def.geometry;
  const shape = roundedRectShape(width, height, cornerRadius);
  const t = thickness * PX_TO_M;
  const bevel = def.edgeProfile === "flat" ? { bevelEnabled: false } : def.edgeProfile === "chamfered"
    ? { bevelEnabled: true, bevelThickness: t * 0.15, bevelSize: t * 0.1, bevelSegments: 1 }
    : { bevelEnabled: true, bevelThickness: t * 0.25, bevelSize: t * 0.18, bevelSegments: 6 };
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, ...bevel, curveSegments: 24 });
  geo.translate(0, 0, -t / 2);
  const mat = new THREE.MeshStandardMaterial({ color: def.body, metalness: 0.4, roughness: 0.35 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Body";
  mesh.userData = { role: "body", edgeProfile: def.edgeProfile, railMaterial: def.railMaterial };
  return mesh;
}

function buildScreen(def: DeviceDefinition): THREE.Mesh {
  const { width, height, thickness } = def.geometry;
  const inset = def.screenInset;
  const w = inset.width * PX_TO_M;
  const h = inset.height * PX_TO_M;
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Screen";
  // Center offset from device center, in the same px coordinate space as geometry.
  const cx = (inset.left + inset.width / 2 - width / 2) * PX_TO_M;
  const cy = -(inset.top + inset.height / 2 - height / 2) * PX_TO_M;
  mesh.position.set(cx, cy, (thickness * PX_TO_M) / 2 + 0.0001);
  mesh.userData = {
    role: "screen",
    insetPx: inset,
    uvRect: { u: inset.left / width, v: inset.top / height, w: inset.width / width, h: inset.height / height },
  };
  return mesh;
}

function buildCameraIsland(def: DeviceDefinition): THREE.Group | null {
  const island = def.cameraIsland;
  if (island.style === "none" || island.lenses.length === 0) return null;
  const { width, height, thickness } = def.geometry;
  const group = new THREE.Group();
  group.name = "CameraIsland";
  const t = thickness * PX_TO_M;
  const islandW = island.size.widthPct * width * PX_TO_M;
  const islandH = island.size.heightPct * height * PX_TO_M;
  const cx = (island.position.xPct * width - width / 2) * PX_TO_M + islandW / 2;
  const cy = -(island.position.yPct * height - height / 2) * PX_TO_M - islandH / 2;

  const padGeo = new THREE.BoxGeometry(islandW, islandH, t * 0.18);
  const padMat = new THREE.MeshStandardMaterial({ color: def.accent, metalness: 0.5, roughness: 0.4 });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.set(cx, cy, -t / 2 - (t * 0.18) / 2);
  pad.userData = { role: "camera-island", style: island.style };
  group.add(pad);

  island.lenses.forEach((lens, i) => {
    const diameter = lens.diameterPct * width * PX_TO_M;
    const lensGeo = new THREE.CylinderGeometry(diameter / 2, diameter / 2, t * 0.12, 24);
    lensGeo.rotateX(Math.PI / 2);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.8, roughness: 0.15 });
    const lensMesh = new THREE.Mesh(lensGeo, lensMat);
    const lx = (lens.xPct * width - width / 2) * PX_TO_M;
    const ly = -(lens.yPct * height - height / 2) * PX_TO_M;
    lensMesh.position.set(lx, ly, -t / 2 - t * 0.18 - (t * 0.12) / 2);
    lensMesh.name = `Lens${i}`;
    lensMesh.userData = { role: "camera-lens", index: i, ring: !!lens.ring };
    group.add(lensMesh);
  });

  return group;
}

const FACE_AXIS: Record<EdgeFace, { along: "width" | "height"; normal: THREE.Vector3 }> = {
  left: { along: "height", normal: new THREE.Vector3(-1, 0, 0) },
  right: { along: "height", normal: new THREE.Vector3(1, 0, 0) },
  top: { along: "width", normal: new THREE.Vector3(0, 1, 0) },
  bottom: { along: "width", normal: new THREE.Vector3(0, -1, 0) },
};

function buildEdgeItem(
  def: DeviceDefinition,
  face: EdgeFace,
  offsetPct: number,
  lengthPct: number,
  role: "button" | "port",
  kind: string,
): THREE.Mesh {
  const { width, height, thickness } = def.geometry;
  const t = thickness * PX_TO_M;
  const w = width * PX_TO_M;
  const h = height * PX_TO_M;
  const axis = FACE_AXIS[face];
  const spanPx = axis.along === "width" ? width : height;
  const lenM = lengthPct * spanPx * PX_TO_M;
  const thick = t * 0.6;
  const geo = new THREE.BoxGeometry(
    axis.along === "width" ? lenM : thick,
    axis.along === "height" ? lenM : thick,
    thick,
  );
  const mat = new THREE.MeshStandardMaterial({ color: def.accent, metalness: 0.7, roughness: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `${role === "button" ? "Button" : "Port"}_${face}_${kind}`;
  mesh.userData = { role, kind, face };

  const alongOffset = (offsetPct - 0.5) * spanPx * PX_TO_M;
  if (face === "left") mesh.position.set(-w / 2, alongOffset, 0);
  else if (face === "right") mesh.position.set(w / 2, alongOffset, 0);
  else if (face === "top") mesh.position.set(alongOffset, h / 2, 0);
  else mesh.position.set(alongOffset, -h / 2, 0);

  return mesh;
}

function buildHinge(def: DeviceDefinition): THREE.Object3D | null {
  if (def.formFactor !== "foldable" || !def.variants?.length) return null;
  const hinge = new THREE.Object3D();
  hinge.name = "Hinge";
  hinge.userData = {
    role: "hinge",
    variants: def.variants.map((v) => ({ id: v.id, axis: v.fold.axis, state: v.fold.state, hingeAngleDeg: v.fold.hingeAngleDeg })),
  };
  return hinge;
}

/** Constructs a full device rig from a `DeviceDefinition` and returns the
 *  THREE.Group ready for export or direct scene use. CPU-only — no
 *  renderer/GPU context involved (see plan "GPU/WebGL scope"). */
export function buildDeviceScene(def: DeviceDefinition): THREE.Group {
  const root = new THREE.Group();
  root.name = "Device";
  root.userData = {
    role: "device-root",
    id: def.id,
    name: def.name,
    vendor: def.vendor,
    formFactor: def.formFactor,
    platforms: def.platforms,
    schemaVersion: def.schemaVersion,
  };

  root.add(buildBody(def));
  root.add(buildScreen(def));

  const island = buildCameraIsland(def);
  if (island) root.add(island);

  for (const btn of def.buttons as DeviceButton[]) {
    root.add(buildEdgeItem(def, btn.face, btn.offsetPct, btn.lengthPct, "button", btn.kind));
  }
  for (const port of def.ports as DevicePort[]) {
    root.add(buildEdgeItem(def, port.face, port.offsetPct, 0.12, "port", port.kind));
  }

  const hinge = buildHinge(def);
  if (hinge) root.add(hinge);

  return root;
}

/** Exports a device rig to a self-contained `.glb` buffer — binary
 *  container, embedded textures/materials (none needed here — solid
 *  colors only), zero external references. CPU-only (see plan). */
export async function buildDeviceGlb(def: DeviceDefinition): Promise<Buffer> {
  ensureGltfNodeEnv();
  const scene = buildDeviceScene(def);
  const exporter = new GLTFExporter();
  const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => resolve(result as ArrayBuffer),
      (err) => reject(err),
      { binary: true, includeCustomExtensions: true, embedImages: true },
    );
  });
  return Buffer.from(glb);
}
