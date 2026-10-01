import fs from "fs";
import path from "path";
import type { Page } from "playwright";
import { getDeviceGlbPath } from "../devices/device-manager.js";
import { DEVICE_REGISTRY } from "../devices/registry.js";

/** Wires the real GLB/three.js device rig into a Playwright-rendered page,
 *  for scenes using `device3dMarkup` (the 3D rig, `<canvas class="device-rig-canvas">`).
 *  Always pinned to WebGL (never WebGPU) per plan "Backend policy" — this is
 *  the automated/CI capture context, not interactive UI.
 *
 *  SCOPE: this wires the *video export/render* path (Playwright, via
 *  `installThreeJsRoutes` + `page.route` intercepting the fake
 *  `https://device-bridge.local` origin below) end to end. The *live
 *  interactive browser preview* (`web/server.ts`'s `scenePreviewHtml`/
 *  `templatePreviewHtml`, served to a real user's browser) reuses the same
 *  `sceneHtml()`/bridge script but has no route-interception layer — a real
 *  browser can't resolve `device-bridge.local`, so 3D-rig scenes in that
 *  live preview currently fall back to the plain placeholder styling on
 *  `.device-rig-canvas` (see DEVICE_CSS) instead of a rendered device.
 *  Fixing that needs real static routes added to `web/server.ts` (serving
 *  `node_modules/three` and cached device GLBs same-origin) — a scoped,
 *  separate follow-up, not done here. */

const ORIGIN = "https://device-bridge.local";
const THREE_ROOT = path.join(process.cwd(), "node_modules", "three");

const MIME: Record<string, string> = { ".js": "application/javascript", ".glb": "model/gltf-binary" };

/** Registers routes serving three.js core/addons and this render's device
 *  GLBs from disk, so the page's `<script type="module">` bridge can
 *  `import`/`fetch` them despite having no real origin (`page.setContent`).
 *  Must be called before `page.setContent`. */
export async function installThreeJsRoutes(page: Page, deviceIds: string[]): Promise<void> {
  await page.route(`${ORIGIN}/three/**`, async (route) => {
    const url = new URL(route.request().url());
    const rel = url.pathname.replace("/three/", "");
    const filePath = path.join(THREE_ROOT, rel);
    if (!fs.existsSync(filePath)) return route.fulfill({ status: 404, body: "not found" });
    const body = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    await route.fulfill({ status: 200, contentType: MIME[ext] ?? "application/octet-stream", body });
  });

  const glbById = new Map<string, Buffer>();
  for (const id of new Set(deviceIds)) {
    const device = DEVICE_REGISTRY[id];
    if (!device) continue;
    const glbPath = await getDeviceGlbPath(device.definition);
    glbById.set(id, fs.readFileSync(glbPath));
  }
  await page.route(`${ORIGIN}/devices/*.glb`, async (route) => {
    const url = new URL(route.request().url());
    const id = path.basename(url.pathname, ".glb");
    const buf = glbById.get(id);
    if (!buf) return route.fulfill({ status: 404, body: "device not found" });
    await route.fulfill({ status: 200, contentType: "model/gltf-binary", body: buf });
  });
}

/** The bridge itself — a static, self-contained ES module injected into the
 *  page. It finds every `canvas.device-rig-canvas` (emitted by
 *  `device3dMarkup`), loads that device's real GLB, textures its screen
 *  mesh from `data-screen-src`, and wraps `window.seek` so that on every
 *  frame it: (1) lets the existing CSS-keyframe seek run first — CSS stays
 *  the single source of truth for every scene animation's timing/easing,
 *  nothing here reimplements that math; (2) reads the *resolved* CSS
 *  transform matrix off the animated ancestor (`.stage-inner`) via
 *  `getComputedStyle`; (3) decomposes it (three.js's own `Matrix4.decompose`
 *  — CSS `matrix3d()` and three.js `Matrix4.elements` are both column-major,
 *  so the 16 numbers drop in directly) into position/rotation/scale and
 *  applies that to the device's Object3D; (4) renders and flushes
 *  (1x1 readPixels — the WebGL determinism contract from the Phase 0 spike)
 *  before resolving. This makes the 3D device rig mirror whatever motion
 *  the scene's CSS animation already computes, instead of re-deriving it. */
export const THREE_BRIDGE_SCRIPT = `
<script>
// The bare "three" import (used by GLTFLoader) must resolve to a reachable URL: the virtual bridge host only exists
// inside the Playwright renderer; live preview iframes load from the app server's /vendor route instead.
document.head.appendChild(Object.assign(document.createElement("script"), {
  type: "importmap",
  textContent: JSON.stringify({ imports: { three: location.origin.includes("device-bridge.local") ? "${ORIGIN}/three/build/three.module.js" : "/vendor/three/build/three.module.js" } }),
}));
</script>
<script type="module">
const isLocalBridge = location.origin.includes("device-bridge.local");
const threeBase = isLocalBridge ? "${ORIGIN}/three" : "/vendor/three";
const deviceApiBase = isLocalBridge ? "${ORIGIN}/devices" : "/api/devices";

const THREE = await import(threeBase + "/build/three.module.js");
const { GLTFLoader } = await import(threeBase + "/examples/jsm/loaders/GLTFLoader.js");

const PX_TO_M = 1 / 12000;
const PERSPECTIVE_PX = 1800; // matches ".stage { perspective: 1800px }"
const rigs = [];

// Product-shot 3-point rig: key (upper-right-front, the dominant light),
// fill (opposite side, low intensity, softens shadows), rim (behind/above,
// catches the curved bevel edge -- this is what actually sells "metal" on
// the clearcoat body material, not raw intensity). Paired with
// ACESFilmicToneMapping on the renderer for filmic falloff instead of
// flat/clipped highlights.
function addStudioLighting(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 1.8));
  const key = new THREE.DirectionalLight(0xfff4e6, 3.5);
  key.position.set(3, 4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd6e4ff, 2.0);
  fill.position.set(-4, 2, 4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 2.2);
  rim.position.set(-1.5, 3, -4);
  scene.add(rim);
}

// Mirrors deviceMarkupMultiScreen's CSS keyframe timing exactly (same
// holdPct/fadeMs/fadePct math) so the canvas crossfade matches the DOM
// path's crossfade -- see src/render/shared.ts::deviceMarkupMultiScreen.
function crossfadeStops(index, count, durationMs) {
  const holdPct = 100 / count;
  const fadeMs = 260;
  const fadePct = Math.min(holdPct * 0.35, (fadeMs / durationMs) * 100);
  const inPct = index === 0 ? 0 : index * holdPct;
  const outPct = (index + 1) * holdPct;
  const isLast = index === count - 1;
  if (index === 0) {
    return [
      [0, 1], [Math.max(0, outPct - fadePct), 1], [outPct, 0], [100, 0],
    ];
  }
  return [
    [0, 0], [inPct, 0], [inPct + fadePct, 1],
    [Math.max(inPct + fadePct, outPct - fadePct), 1],
    [outPct, isLast ? 1 : 0], [100, isLast ? 1 : 0],
  ];
}

// CSS "ease-in-out" == cubic-bezier(.42,0,.58,1); approximated by easing
// the local progress between two adjacent stops rather than solving the
// bezier exactly -- close enough for a crossfade, not claimed frame-exact.
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function opacityAtPct(stops, pct) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, v0] = stops[i], [p1, v1] = stops[i + 1];
    if (pct >= p0 && pct <= p1) {
      if (p1 === p0) return v1;
      const local = easeInOut((pct - p0) / (p1 - p0));
      return v0 + (v1 - v0) * local;
    }
  }
  return stops[stops.length - 1][1];
}

async function initCanvas(canvas) {
  const deviceId = canvas.dataset.deviceId;
  const shellOnly = canvas.dataset.shellOnly === "1";
  const screens = shellOnly ? [] : JSON.parse(canvas.dataset.screens || "[]");
  const durationMs = Number(canvas.dataset.durationMs) || 1;
  const w = canvas.width, h = canvas.height;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const gl = renderer.getContext();

  const scene = new THREE.Scene();
  const fov = 2 * Math.atan((h / 2) / PERSPECTIVE_PX) * (180 / Math.PI);
  const camera = new THREE.PerspectiveCamera(fov, w / h, 0.001, 100);
  camera.position.set(0, 0, PERSPECTIVE_PX * PX_TO_M);
  camera.lookAt(0, 0, 0);

  addStudioLighting(scene);

  let root;
  const screenLayers = [];
  try {
    const url = isLocalBridge ? \`\${ORIGIN}/devices/\${deviceId}.glb\` : \`/api/devices/\${encodeURIComponent(deviceId)}/glb\`;
    const buf = await fetch(url).then((r) => r.arrayBuffer());
    const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buf, "", resolve, reject));
    root = gltf.scene.children.find((n) => n.userData && n.userData.role === "device-root") || gltf.scene.children[0];
    scene.add(root);

    const screenNode = (() => {
      let found = null;
      root.traverse((n) => { if (!found && n.userData && n.userData.role === "screen") found = n; });
      return found;
    })();

    if (shellOnly && screenNode) {
      // Leave the screen aperture fully transparent -- the standalone
      // templates library (templates/video/*.html) layers its own,
      // untouched <img id="slot-N"> screenshot element in that same screen
      // rect behind this canvas; see deviceShellMarkup's doc comment.
      screenNode.visible = false;
    }

    if (screenNode && screens.length > 0) {
      const count = screens.length;
      screens.forEach((s, i) => {
        const stops = crossfadeStops(i, count, durationMs);
        const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: count === 1 ? 1 : stops[0][1], depthWrite: i === 0 });
        let mesh;
        if (i === 0) {
          mesh = screenNode;
          mesh.material = mat;
        } else {
          mesh = screenNode.clone();
          mesh.material = mat;
          // Tiny normal offset per layer avoids z-fighting between coplanar crossfade layers.
          mesh.position.z += i * 0.00002;
          screenNode.parent.add(mesh);
        }
        if (s.kind === "video") {
          const video = document.createElement("video");
          video.src = s.src; video.muted = true; video.loop = true; video.playsInline = true;
          video.play().catch(() => {});
          mat.map = new THREE.VideoTexture(video);
        } else {
          const tex = new THREE.TextureLoader().load(s.src);
          if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
          mat.map = tex;
        }
        mat.needsUpdate = true;
        screenLayers.push({ mesh, material: mat, stops });
      });
    }
  } catch (e) {
    console.error("device-rig-canvas init failed for " + deviceId, e);
  }

  renderer.render(scene, camera);
  const px1 = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);

  // ".phone-3d-rig" is templates/video/*.html's own animated element (its
  // own JS timeline applies rotateX/rotateY directly to it, unrelated to
  // the code-generated path's ".stage-inner") -- both conventions decompose
  // the same way via getComputedStyle, so no other bridge logic needs to
  // know which template family produced this canvas.
  const rigEl = canvas.closest(".stage-inner") || canvas.closest(".phone-3d-rig") || canvas.parentElement;
  rigs.push({ canvas, renderer, scene, camera, root, rigEl, gl, screenLayers, durationMs });
}

function decomposeCssTransform(el) {
  const t = getComputedStyle(el).transform;
  const m = new THREE.Matrix4();
  if (t && t !== "none") {
    const nums = t.replace(/matrix3d\\(|matrix\\(|\\)/g, "").split(",").map(Number);
    if (nums.length === 16) {
      m.fromArray(nums);
    } else if (nums.length === 6) {
      m.set(
        nums[0], nums[2], 0, nums[4],
        nums[1], nums[3], 0, nums[5],
        0, 0, 1, 0,
        0, 0, 0, 1,
      );
    }
  }
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  return { pos, quat, scale };
}

const canvases = Array.from(document.querySelectorAll("canvas.device-rig-canvas, canvas.device-shell-canvas"));
window.__deviceRigsReady = Promise.all(canvases.map(initCanvas));

const prevSeek = window.seek;
window.seek = async (ms) => {
  let result;
  if (typeof prevSeek === "function") result = await prevSeek(ms);
  if (rigs.length === 0 && canvases.length > 0) await window.__deviceRigsReady;
  for (const rig of rigs) {
    if (rig.root && rig.rigEl) {
      const { pos, quat, scale } = decomposeCssTransform(rig.rigEl);
      // CSS Y grows downward, three.js Y grows upward -- flip the Y
      // translation component; the rotation itself is applied as-is
      // (an approximation for animations combining rotateX/rotateY/rotateZ
      // -- verify direction visually per new scene animation).
      rig.root.position.set(pos.x * PX_TO_M, -pos.y * PX_TO_M, pos.z * PX_TO_M);
      rig.root.quaternion.copy(quat);
      rig.root.scale.copy(scale);
    }
    if (rig.screenLayers && rig.screenLayers.length > 1) {
      const pct = Math.max(0, Math.min(100, (ms / rig.durationMs) * 100));
      for (const layer of rig.screenLayers) {
        layer.material.opacity = opacityAtPct(layer.stops, pct);
      }
    }
    if (rig.root) {
      rig.renderer.render(rig.scene, rig.camera);
      const px = new Uint8Array(4);
      rig.gl.readPixels(0, 0, 1, 1, rig.gl.RGBA, rig.gl.UNSIGNED_BYTE, px);
    }
  }
  return result;
};
</script>
`;
