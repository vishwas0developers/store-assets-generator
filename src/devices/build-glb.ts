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
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, ...bevel, curveSegments: 32 });
  geo.translate(0, 0, -t / 2);
  // Brushed-metal rail: a real product shot's frame reads as metal because
  // of a tight, curved specular highlight (clearcoat) riding the bevel, not
  // just a flat base color -- MeshStandardMaterial alone can't produce that.
  const mat = new THREE.MeshPhysicalMaterial({
    color: def.body, metalness: 0.85, roughness: 0.35, clearcoat: 0.15, clearcoatRoughness: 0.25,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Body";
  mesh.userData = { role: "body", edgeProfile: def.edgeProfile, railMaterial: def.railMaterial };
  return mesh;
}

function buildScreen(def: DeviceDefinition): THREE.Mesh {
  const { width, height, thickness, cornerRadius } = def.geometry;
  const inset = def.screenInset;
  // Rounded to the device's own cornerRadius -- same value the flat 2D path
  // (build-frame-svg.ts) already rounds its screen box to, so the screen
  // mask/screenshot/frame/3D shell all agree on one per-device curvature
  // instead of a plain rectangle inside a rounded frame.
  const shape = roundedRectShape(inset.width, inset.height, cornerRadius);
  const geo = new THREE.ShapeGeometry(shape, 24);
  // ShapeGeometry's default UVs are the raw shape-space (x,y), not
  // normalized to 0-1 -- remap from the actual bounding box so a
  // screenshot/video texture maps onto the rounded screen once, not tiled.
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const uv = geo.attributes.uv;
  const spanX = bb.max.x - bb.min.x || 1;
  const spanY = bb.max.y - bb.min.y || 1;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - bb.min.x) / spanX, (uv.getY(i) - bb.min.y) / spanY);
  }
  uv.needsUpdate = true;
  // Glass-over-OLED look for the idle/no-content state: near-black with a
  // glossy clearcoat so it catches a specular highlight like real display
  // glass, instead of a flat matte gray rectangle.
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x050507, roughness: 0.12, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.1,
  });
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
  const padMat = new THREE.MeshPhysicalMaterial({ color: def.accent, metalness: 0.6, roughness: 0.4, clearcoat: 0.1 });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.set(cx, cy, -t / 2 - (t * 0.18) / 2);
  pad.userData = { role: "camera-island", style: island.style };
  group.add(pad);

  island.lenses.forEach((lens, i) => {
    const diameter = lens.diameterPct * width * PX_TO_M;
    const lensGeo = new THREE.CylinderGeometry(diameter / 2, diameter / 2, t * 0.12, 24);
    lensGeo.rotateX(Math.PI / 2);
    // True glass-black lens: near-total clearcoat + very low roughness is
    // what actually reads as a camera lens rather than a plastic dot.
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: 0x020202, metalness: 0.3, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
    });
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
  const mat = new THREE.MeshPhysicalMaterial({ color: def.accent, metalness: 0.75, roughness: 0.3, clearcoat: 0.1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `${role === "button" ? "Button" : "Port"}_${face}_${kind}`;
  mesh.userData = { role, kind, face };

  const alongOffset = (offsetPct - 0.5) * spanPx * PX_TO_M;
  // left/right run along Y (height): px space is top-down, three.js Y is
  // up-positive -- every other Y placement in this file (screen center,
  // camera lenses) negates for the same reason; this was missing here,
  // which is why a button meant for the top of the edge rendered near the
  // bottom. top/bottom run along X (width), which needs no flip.
  if (face === "left") mesh.position.set(-w / 2, -alongOffset, 0);
  else if (face === "right") mesh.position.set(w / 2, -alongOffset, 0);
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
