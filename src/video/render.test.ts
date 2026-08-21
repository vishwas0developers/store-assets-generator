import assert from "node:assert";
import { SCENE_ANIMATIONS, sceneHtml, templatePreviewHtml } from "./render.js";
import type { VideoProject, VideoScene } from "./project.js";
import { VIDEO_TEMPLATES, applyVideoTemplate, scratchVideoProject } from "./templates.js";
import { DEVICE_REGISTRY, frameSvgFor } from "../devices/registry.js";
import { deviceMarkupMultiScreen } from "../render/shared.js";

function sampleScene(overrides: Partial<VideoScene> = {}): VideoScene {
  return {
    id: "s1",
    order: 0,
    sceneTemplate: "hero-rise",
    device: "phone",
    background: "ocean",
    text: "Hello World",
    subtext: "A short subtitle",
    durationSeconds: 6,
    rotate: 10,
    zoom: 10,
    move: 30,
    ...overrides,
  };
}

function demo() {
  for (const anim of Object.values(SCENE_ANIMATIONS)) {
    const kf = anim.deviceKeyframes(sampleScene({ sceneTemplate: anim.id }));
    assert.ok(kf.includes("transform"), `${anim.id} device keyframes must animate transform`);
    assert.ok(kf.includes("0%") && kf.includes("100%"), `${anim.id} device keyframes must span 0%-100%`);
    assert.ok(typeof anim.easing === "string" && anim.easing.length > 0, `${anim.id} must declare an easing`);

    // Every animation must end in-frame: opacity 1 at 100% (no exit that
    // fades/flies the device away -- see the "stay inside the frame" fix).
    const hundredPctBlock = kf.split("100%")[1] ?? "";
    assert.ok(hundredPctBlock.includes("opacity: 1"), `${anim.id} must resolve to opacity:1 at 100% (device stays in frame)`);
  }

  assert.ok(SCENE_ANIMATIONS["fold-open"].renderDevice, "fold-open must declare a renderDevice hook");
  assert.ok(SCENE_ANIMATIONS["tablet-pan"], "tablet-pan animation must exist");

  const project: VideoProject = {
    id: "test",
    createdAt: new Date().toISOString(),
    name: "test",
    template: "feature-showcase",
    sources: [],
    scenes: [sampleScene({ id: "s1", order: 0, sceneTemplate: "hero-rise" }), sampleScene({ id: "s2", order: 1, sceneTemplate: "tilt-3d" })],
    bgm: null,
    outputs: {},
  };
  const html = templatePreviewHtml(project);
  for (let i = 0; i < project.scenes.length; i++) {
    assert.ok(html.includes(`@keyframes play-${i}`), `templatePreviewHtml must emit @keyframes play-${i}`);
    assert.ok(html.includes(`id="scene-${i}"`), `templatePreviewHtml must emit scene-${i} element`);
  }
  assert.ok(html.includes("class=\"word\""), "templatePreviewHtml must render word-staggered text spans");
  assert.ok(html.includes("window.__videoPreview"), "templatePreviewHtml must expose the player API");

  // Every template declares its own device/variant/deviceFraction, and no
  // two templates share the same (device, variant) pair -- the "all
  // templates look the same" bug was exactly this being uniform.
  const seen = new Set<string>();
  for (const t of VIDEO_TEMPLATES) {
    assert.ok(DEVICE_REGISTRY[t.device], `template '${t.id}' references unknown device '${t.device}'`);
    assert.ok(typeof t.deviceFraction === "number" && t.deviceFraction > 0, `template '${t.id}' must declare deviceFraction`);
    const key = `${t.device}::${t.variant ?? ""}`;
    assert.ok(!seen.has(key), `template '${t.id}' duplicates device+variant '${key}' -- templates must be visually distinct`);
    seen.add(key);
  }

  // The foldable template applies with its base device and produces a scene
  // whose sceneHtml render includes the hinge-cross-fade rig, not a plain
  // single device.
  const fold = scratchVideoProject("foldable-unfold");
  assert.strictEqual(fold.scenes[0].device, "samsung-galaxy-z-fold");
  const foldHtml = sceneHtml(fold.scenes[0], [], false);
  assert.ok(foldHtml.includes("fold-rig") && foldHtml.includes("fold-folded") && foldHtml.includes("fold-unfolded"), "fold-open scene must render both fold layers");

  // A multi-screen scene (screenCount > 1 in the template) must resolve to
  // screenIds and render a screen-swap, even with no real sources uploaded.
  const showcase = scratchVideoProject("feature-showcase");
  const swapScene = showcase.scenes.find((s) => (s.screenIds?.length ?? 0) > 1);
  assert.ok(swapScene, "feature-showcase must include at least one multi-screen scene");
  const swapHtml = sceneHtml(swapScene!, ["data:x", "data:y", "data:z"], false);
  assert.ok(swapHtml.includes("device-screen-0") && swapHtml.includes("device-screen-1"), "multi-screen scene must render multiple device-screen layers");

  // deviceMarkupMultiScreen itself: N screens -> N distinct keyframe blocks.
  const multi = deviceMarkupMultiScreen(DEVICE_REGISTRY["phone"], ["a", "b", "c"], undefined, 3000);
  assert.ok(multi.includes("screenSwap0") && multi.includes("screenSwap1") && multi.includes("screenSwap2"), "deviceMarkupMultiScreen must emit one keyframe set per screen");

  // Variant-aware frame: the z-fold's folded vs unfolded frame SVGs must
  // differ (this is the root-cause fix -- svgFrame was previously built
  // once from the base geometry and stretched for every variant).
  const zfold = DEVICE_REGISTRY["samsung-galaxy-z-fold"];
  const foldedSvg = frameSvgFor(zfold, "folded");
  const unfoldedSvg = frameSvgFor(zfold, "unfolded");
  assert.notStrictEqual(foldedSvg, unfoldedSvg, "folded and unfolded frame SVGs must differ");

  console.log("render.test.ts: all checks passed");
}

demo();
