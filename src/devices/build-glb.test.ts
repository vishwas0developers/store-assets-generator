import assert from "node:assert";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildDeviceGlb } from "./build-glb.js";
import { buildFrameSvg } from "./build-frame-svg.js";
import { ensureGltfNodeEnv } from "./gltf-node-env.js";
import type { DeviceDefinition } from "./schema.js";

const phoneDef: DeviceDefinition = {
  id: "test-phone",
  name: "Test Phone",
  vendor: "Test",
  platforms: ["google-play"],
  formFactor: "phone",
  geometry: { width: 1080, height: 2400, thickness: 80, cornerRadius: 30 },
  screenInset: { top: 30, left: 30, width: 1020, height: 2340 },
  bezelWidth: 16,
  edgeProfile: "curved",
  cutout: { type: "punch-hole", size: { width: 36, height: 36 } },
  cameraIsland: {
    style: "square-island",
    position: { xPct: 0.05, yPct: 0.03 },
    size: { widthPct: 0.32, heightPct: 0.16 },
    cornerRadius: 24,
    lenses: [
      { xPct: 0.12, yPct: 0.07, diameterPct: 0.08 },
      { xPct: 0.24, yPct: 0.07, diameterPct: 0.08 },
      { xPct: 0.18, yPct: 0.14, diameterPct: 0.08 },
    ],
  },
  buttons: [
    { face: "right", kind: "power", offsetPct: 0.22, lengthPct: 0.06 },
    { face: "left", kind: "volume-up", offsetPct: 0.26, lengthPct: 0.05 },
    { face: "left", kind: "volume-down", offsetPct: 0.33, lengthPct: 0.05 },
  ],
  ports: [{ face: "bottom", kind: "usb-c", offsetPct: 0.5 }],
  body: "#1b1b1b",
  accent: "#3a3a3a",
  railMaterial: "aluminum",
  schemaVersion: 2,
};

const foldableDef: DeviceDefinition = {
  ...phoneDef,
  id: "test-foldable",
  formFactor: "foldable",
  variants: [
    {
      id: "folded", name: "Folded",
      geometry: { width: 720, height: 900, thickness: 140, cornerRadius: 32 },
      screenInset: { top: 16, left: 16, width: 688, height: 868 },
      fold: { axis: "horizontal", state: "folded", hingeAngleDeg: 0 },
    },
    {
      id: "unfolded", name: "Unfolded",
      geometry: { width: 1400, height: 1600, thickness: 70, cornerRadius: 24 },
      screenInset: { top: 20, left: 20, width: 1360, height: 1560 },
      fold: { axis: "horizontal", state: "unfolded", hingeAngleDeg: 180 },
    },
  ],
};

async function demo() {
  for (const def of [phoneDef, foldableDef]) {
    const glb = await buildDeviceGlb(def);
    assert.ok(glb.byteLength > 100, `${def.id}: GLB should be non-trivial size`);

    ensureGltfNodeEnv();
    const loader = new GLTFLoader();
    const parsed: any = await new Promise((resolve, reject) =>
      loader.parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer, "", resolve, reject),
    );
    const root = parsed.scene.children[0];
    assert.strictEqual(root?.userData?.role, "device-root", `${def.id}: root node must be tagged device-root`);
    assert.strictEqual(root?.userData?.id, def.id, `${def.id}: root userData.id must round-trip`);
    assert.strictEqual(root?.userData?.schemaVersion, def.schemaVersion, `${def.id}: schemaVersion must round-trip`);

    const roles: string[] = [];
    root.traverse((n: any) => { if (n.userData?.role) roles.push(n.userData.role); });
    assert.ok(roles.includes("body"), `${def.id}: must have a body node`);
    assert.ok(roles.includes("screen"), `${def.id}: must have a screen node`);
    assert.strictEqual(roles.filter((r) => r === "camera-lens").length, def.cameraIsland.lenses.length, `${def.id}: lens count must match definition`);
    assert.strictEqual(roles.filter((r) => r === "button").length, def.buttons.length, `${def.id}: button count must match definition`);
    assert.strictEqual(roles.filter((r) => r === "port").length, def.ports.length, `${def.id}: port count must match definition`);
    if (def.formFactor === "foldable") {
      assert.ok(roles.includes("hinge"), `${def.id}: foldable must have a hinge node`);
    }

    let hasNaN = false;
    root.traverse((n: any) => {
      const arr = n.geometry?.attributes?.position?.array;
      if (arr) for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) hasNaN = true;
    });
    assert.ok(!hasNaN, `${def.id}: geometry must not contain NaN/Infinity vertices`);

    const svg = buildFrameSvg(def);
    assert.ok(svg.startsWith("<svg"), `${def.id}: flat SVG must be well-formed`);
    assert.ok(svg.includes(`viewBox="0 0 ${def.geometry.width} ${def.geometry.height}"`), `${def.id}: SVG viewBox must match geometry`);
  }

  console.log("build-glb.test.ts: all checks passed");
}

demo();
