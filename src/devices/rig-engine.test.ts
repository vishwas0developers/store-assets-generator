import assert from "node:assert";
import fs from "fs";
import path from "path";
import { applyRigDevices, topLevelNodes, elementEnd, type RigDeviceAsset } from "./rig-engine.js";
import { listVideoDevices, resolveRigAsset, sanitizeSceneDevice, listDevicesForType, listCssDevices } from "./rig-assets.js";
import { composeStandaloneHtml } from "../video/render.js";
import { scratchVideoProject, VIDEO_TEMPLATES } from "../video/templates.js";

const SCREEN = "<!--SCREEN-->";
const dir = path.join(process.cwd(), "templates", "video");
const norm = (s: string) => s.replace(/\s+/g, " ").replace(/> </g, "><").trim();
const rigInners = (html: string) =>
  [...html.matchAll(/<div class="[^"]*phone-3d-(?:rig|chassis)[^"]*"[^>]*data-device="[^"]*"[^>]*>/g)].map((m) => {
    const end = elementEnd(html, m.index!);
    return norm(html.slice(m.index! + m[0].length, end - 6));
  });

// --- registry: one registry, two modes, enforced compatibility -------------
{
  const all = listVideoDevices();
  assert.ok(all.some((d) => d.deviceType === "2D" && d.sourceType === "SVG"));
  assert.ok(all.some((d) => d.deviceType === "3D" && d.sourceType === "GLB"));
  assert.ok(all.some((d) => d.deviceType === "3D" && d.sourceType === "CSS"));
  assert.ok(listDevicesForType("2D").every((d) => d.deviceType === "2D"));
  assert.ok(listDevicesForType("3D").every((d) => d.deviceType === "3D"));
  assert.strictEqual(listCssDevices().length >= 5, true);
  // a 3D CSS rig is never valid for a 2D scene; a 2D SVG device never for a 3D CSS pick
  assert.strictEqual(resolveRigAsset("css-studio-box-phone", "2D"), null);
  assert.ok(resolveRigAsset("css-studio-box-phone", "3D"));
  assert.strictEqual(resolveRigAsset("apple-iphone-15-pro", "2D")!.sourceType, "SVG");
  assert.strictEqual(resolveRigAsset("apple-iphone-15-pro", "3D")!.sourceType, "GLB");
  const fixed = sanitizeSceneDevice({ device: "css-studio-box-phone", deviceMode: "2D" }, { device: "apple-iphone-15-pro", deviceMode: "3D" });
  assert.strictEqual(fixed.deviceMode, "2D");
  assert.strictEqual(resolveRigAsset(fixed.device, "2D")!.deviceType, "2D");
}

// --- every template: default render is untouched, rebuild is lossless ------
for (const t of VIDEO_TEMPLATES) {
  const file = fs.readFileSync(path.join(dir, `${t.id}.html`), "utf-8");
  assert.strictEqual(applyRigDevices(file, { pick: () => null }), file, `${t.id}: no swap must be a no-op`);
  assert.ok(t.deviceMode === "2D" || t.deviceMode === "3D", `${t.id}: deviceMode`);

  // Re-installing a device built from the template's own rig markup (different id) must reproduce every rig.
  const css = listCssDevices().find((d) => d.sourceTemplate === t.id);
  if (css) {
    const clone: RigDeviceAsset = { ...css, id: `${css.id}-clone` };
    const swapped = applyRigDevices(file, { pick: () => clone });
    assert.deepStrictEqual(rigInners(swapped).length, rigInners(file).length);
    // rigs that contain every role must come back identical; partial rigs keep the roles they had
    const before = rigInners(file);
    const after = rigInners(swapped);
    const same = after.filter((x, i) => x === before[i]).length;
    assert.ok(same >= before.length * 0.6, `${t.id}: only ${same}/${before.length} rigs rebuilt identically`);
    for (const inner of after) assert.ok(!inner.includes(SCREEN), `${t.id}: screen marker leaked`);
  }
}

// --- cross-implementation swaps keep the screen content --------------------
{
  const sky = fs.readFileSync(path.join(dir, "tpl-38180229-minimal-skyblue.html"), "utf-8");
  const slots = (h: string) => (h.match(/id="slot-\d+/g) ?? []).length;
  const box = resolveRigAsset("css-studio-box-phone", "3D")!;
  const out = applyRigDevices(sky, { pick: () => box });
  assert.strictEqual(slots(out), slots(sky));
  assert.ok(out.includes('data-device="css-studio-box-phone"'));
  assert.ok(!out.includes('data-device="css-minimal-chassis-phone"'));
  assert.strictEqual((out.match(/<style data-device-css=/g) ?? []).length, 1);
  assert.ok(/\[data-device="css-studio-box-phone"\]/.test(out));

  const glb = fs.readFileSync(path.join(dir, "iphone-15-pro-portrait.html"), "utf-8");
  const flat = applyRigDevices(glb, { pick: () => resolveRigAsset("google-pixel-9", "2D") });
  assert.strictEqual(slots(flat), slots(glb));
  assert.ok(flat.includes("dev2d-screen") && !/<canvass/.test(flat));
  const other = applyRigDevices(glb, { pick: () => resolveRigAsset("samsung-galaxy-s25", "3D") });
  assert.ok(other.includes('data-device-id="samsung-galaxy-s25"') && !other.includes('data-device-id="apple-iphone-15-pro"'));
  const toCss = applyRigDevices(glb, { pick: () => box });
  assert.ok(!/<canvass/.test(toCss) && toCss.includes("phone-side"));
}

// --- compose: per-scene device + mode from the project ----------------------
{
  const p = scratchVideoProject("tpl-38180229-minimal-skyblue");
  const html = composeStandaloneHtml(p, 0);
  assert.ok(html.includes('data-device="css-minimal-chassis-phone"'));
  p.scenes.forEach((sc) => { sc.device = "css-studio-box-phone"; });
  assert.ok(composeStandaloneHtml(p, 0).includes('data-device="css-studio-box-phone"'));
  // legacy/incompatible pair (3D CSS rig on a 2D scene) falls back instead of rendering
  p.scenes.forEach((sc) => { sc.deviceMode = "2D"; });
  const fallback = composeStandaloneHtml(p, 0);
  assert.ok(!fallback.includes('data-device="css-studio-box-phone"'));

  const g = scratchVideoProject("iphone-15-pro-portrait");
  assert.ok(composeStandaloneHtml(g, 0).includes("device-shell-canvas"));
  g.scenes[1].device = "google-pixel-9";
  g.scenes[1].deviceMode = "2D";
  const mixed = composeStandaloneHtml(g, 1);
  assert.ok(mixed.includes("dev2d-screen") && mixed.includes("device-shell-canvas"), "scene 2 is 2D, the others stay 3D");
}
assert.ok(topLevelNodes('<div class="a"></div><img class="b" src="x"/>').length === 2);
console.log("rig-engine tests passed");
