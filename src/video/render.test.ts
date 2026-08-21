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
  // two templates *of the same orientation* share the same (device, variant)
  // pair -- the "all templates look the same" bug was exactly this being
  // uniform. Portrait and landscape are different enough contexts that
  // reusing a device across the two groups is fine (they never sit side by
  // side), so uniqueness is checked within each orientation, not globally.
  const seenByOrientation: Record<string, Set<string>> = { "9:16": new Set(), "16:9": new Set() };
  for (const t of VIDEO_TEMPLATES) {
    assert.ok(DEVICE_REGISTRY[t.device], `template '${t.id}' references unknown device '${t.device}'`);
    assert.ok(typeof t.deviceFraction === "number" && t.deviceFraction > 0, `template '${t.id}' must declare deviceFraction`);
    const orientation = t.aspectRatio === "16:9" ? "16:9" : "9:16";
    const seen = seenByOrientation[orientation];
    const key = `${t.device}::${t.variant ?? ""}`;
    assert.ok(!seen.has(key), `template '${t.id}' duplicates device+variant '${key}' within ${orientation} -- templates in the same orientation must be visually distinct`);
    seen.add(key);
  }
  assert.ok(seenByOrientation["16:9"].size >= 4, "at least 4 landscape templates expected");

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

  // Mixed-orientation support: at least one template is landscape (16:9) and
  // at least one is portrait (9:16), and each renders at the canvas its own
  // aspectRatio implies -- not a single hardcoded shape for every template.
  assert.ok(VIDEO_TEMPLATES.some((t) => t.aspectRatio === "16:9"), "at least one template must be landscape (16:9)");
  assert.ok(VIDEO_TEMPLATES.some((t) => t.aspectRatio !== "16:9"), "at least one template must stay portrait (9:16)");

  const landscapeTemplate = VIDEO_TEMPLATES.find((t) => t.aspectRatio === "16:9")!;
  const landscapeProject = scratchVideoProject(landscapeTemplate.id);
  assert.strictEqual(landscapeProject.scenes[0].aspectRatio, "16:9");
  const landscapeHtml = sceneHtml(landscapeProject.scenes[0], [], false);
  assert.ok(landscapeHtml.includes("width: 1920px; height: 1080px"), "a 16:9 scene must render at a 1920x1080 canvas");
  assert.ok(landscapeHtml.includes('flex-direction: row'), "a 16:9 scene must lay out device+text side by side, not stacked");

  const portraitTemplate = VIDEO_TEMPLATES.find((t) => t.aspectRatio !== "16:9")!;
  const portraitProject = scratchVideoProject(portraitTemplate.id);
  const portraitHtml = sceneHtml(portraitProject.scenes[0], [], false);
  assert.ok(portraitHtml.includes("width: 1080px; height: 1920px"), "a 9:16 scene must keep the app-store-standard 1080x1920 canvas");

  // Text contrast: every scene using a pale background (light/candy/citrus)
  // across every template must render dark text, not the default white --
  // white-on-pale was previously unreadable.
  const PALE_BACKGROUNDS = new Set(["light", "candy", "citrus"]);
  for (const t of VIDEO_TEMPLATES) {
    for (const s of t.scenes) {
      if (!PALE_BACKGROUNDS.has(s.background)) continue;
      const scene = { ...sampleScene(), background: s.background, text: "Sample", subtext: "Sub" };
      const html = sceneHtml(scene, [], false);
      assert.ok(html.includes('class="copy" style="color:#141821'), `template '${t.id}' scene on '${s.background}' must use dark text for contrast`);
    }
  }

  console.log("render.test.ts: all checks passed");
}

demo();
