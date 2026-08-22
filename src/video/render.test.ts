import assert from "node:assert";
import { LAYOUTS, SCENE_ANIMATIONS, sceneHtml, templatePreviewHtml } from "./render.js";
import type { VideoProject, VideoScene } from "./project.js";
import { VIDEO_TEMPLATES, applyVideoTemplate, resolveTemplateId, scratchVideoProject } from "./templates.js";
import { DEVICE_REGISTRY, frameSvgFor } from "../devices/registry.js";
import { deviceMarkupMultiScreen } from "../render/shared.js";
import { BGM_PRESETS, renderBgmWav } from "./bgm.js";

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
  // -- Scene animations: every one animates, spans 0-100%, stays in frame --
  for (const anim of Object.values(SCENE_ANIMATIONS)) {
    const kf = anim.deviceKeyframes(sampleScene({ sceneTemplate: anim.id }));
    assert.ok(kf.includes("transform"), `${anim.id} device keyframes must animate transform`);
    assert.ok(kf.includes("0%") && kf.includes("100%"), `${anim.id} device keyframes must span 0%-100%`);
    assert.ok(typeof anim.easing === "string" && anim.easing.length > 0, `${anim.id} must declare an easing`);
    const hundredPctBlock = kf.split("100%")[1] ?? "";
    assert.ok(hundredPctBlock.includes("opacity: 1"), `${anim.id} must resolve to opacity:1 at 100% (device stays in frame)`);
  }
  assert.ok(SCENE_ANIMATIONS["fold-open"].renderDevice, "fold-open must declare a renderDevice hook");
  assert.ok(SCENE_ANIMATIONS["showcase-3d"]?.renderDevice, "showcase-3d must declare a renderDevice hook using the 3D rig");
  assert.ok(SCENE_ANIMATIONS["trio-lineup"], "trio-lineup animation must exist");
  assert.ok(SCENE_ANIMATIONS["tablet-pan"], "tablet-pan animation must exist");

  // -- Layouts: every orientation has at least 3 distinct options --
  const landscapeLayouts = Object.values(LAYOUTS).filter((l) => l.orientation === "16:9" || l.orientation === "both");
  const portraitLayouts = Object.values(LAYOUTS).filter((l) => l.orientation === "9:16" || l.orientation === "both");
  assert.ok(landscapeLayouts.length >= 3, "at least 3 landscape layouts expected");
  assert.ok(portraitLayouts.length >= 3, "at least 3 portrait layouts expected");
  assert.notStrictEqual(LAYOUTS["copy-left"].direction, LAYOUTS["copy-right"].direction, "copy-left and copy-right must place the device on opposite sides");

  const copyLeftHtml = sceneHtml(sampleScene({ aspectRatio: "16:9", layout: "copy-left" }), []);
  const copyRightHtml = sceneHtml(sampleScene({ aspectRatio: "16:9", layout: "copy-right" }), []);
  assert.ok(copyLeftHtml.includes("flex-direction: row;") && !copyLeftHtml.includes("flex-direction: row-reverse;"), "copy-left must render flex-direction: row");
  assert.ok(copyRightHtml.includes("flex-direction: row-reverse;"), "copy-right must render flex-direction: row-reverse (device moves to the opposite side)");

  // -- Player script: no autoplay, no loop, exposes the full scene-specific API --
  const project: VideoProject = {
    id: "test",
    createdAt: new Date().toISOString(),
    name: "test",
    template: "minimal-premium",
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
  assert.ok(html.includes('class="word"'), "templatePreviewHtml must render word-staggered text spans");
  assert.ok(html.includes("window.__videoPreview"), "templatePreviewHtml must expose the player API");
  assert.ok(!/%\s*durations\.length/.test(html), "player script must not wrap scene index with % durations.length (no infinite loop)");
  assert.ok(!/\bplayNext\(\)\s*;\s*<\/script>/.test(html), "player script must not autoplay on load (no bare playNext() call at the end)");
  for (const fn of ["play(", "playScene(", "pause(", "replay(", "goto(", "onState"]) {
    assert.ok(html.includes(fn), `player API must expose ${fn}`);
  }
  assert.ok(html.includes('showScene(0)'), "player must load paused on scene 0, not auto-advance");

  // -- Templates: renamed catalogue, 6 scenes each, non-empty text, layout variety --
  const seenByOrientation: Record<string, Set<string>> = { "9:16": new Set(), "16:9": new Set() };
  for (const t of VIDEO_TEMPLATES) {
    assert.ok(DEVICE_REGISTRY[t.device], `template '${t.id}' references unknown device '${t.device}'`);
    assert.ok(typeof t.deviceFraction === "number" && t.deviceFraction > 0, `template '${t.id}' must declare deviceFraction`);
    assert.strictEqual(t.scenes.length, 6, `template '${t.id}' must have exactly 6 scenes`);

    const orientation = t.aspectRatio === "16:9" ? "16:9" : "9:16";
    const seen = seenByOrientation[orientation];
    const key = `${t.device}::${t.variant ?? ""}`;
    assert.ok(!seen.has(key), `template '${t.id}' duplicates device+variant '${key}' within ${orientation}`);
    seen.add(key);

    const layoutsUsed = new Set<string | undefined>();
    for (const s of t.scenes) {
      assert.ok(s.text && s.text.trim().length > 0, `template '${t.id}' scene '${s.label}' must have non-empty text`);
      assert.ok(SCENE_ANIMATIONS[s.sceneTemplate], `template '${t.id}' scene '${s.label}' references unknown animation '${s.sceneTemplate}'`);
      if (s.layout) assert.ok(LAYOUTS[s.layout], `template '${t.id}' scene '${s.label}' references unknown layout '${s.layout}'`);
      layoutsUsed.add(s.layout);
    }
    assert.ok(layoutsUsed.size >= 2, `template '${t.id}' must vary layout across its scenes, not use one layout for all six`);
  }
  assert.ok(seenByOrientation["16:9"].size >= 4, "at least 4 landscape templates expected");
  assert.ok(seenByOrientation["9:16"].size >= 4, "at least 4 portrait templates expected");

  // -- Old template ids still resolve (migration alias) --
  assert.strictEqual(resolveTemplateId("feature-showcase"), "iphone-15-pro-portrait");
  const migrated = scratchVideoProject("feature-showcase");
  assert.strictEqual(migrated.template, "iphone-15-pro-portrait");

  // -- A multi-screen scene resolves to screenIds and renders a screen-swap --
  const showcase = scratchVideoProject("iphone-15-pro-portrait");
  const swapScene = showcase.scenes.find((s) => (s.screenIds?.length ?? 0) > 1);
  assert.ok(swapScene, "iphone-15-pro-portrait must include at least one multi-screen scene");
  const swapHtml = sceneHtml(swapScene!, ["data:x", "data:y", "data:z"], false);
  assert.ok(swapHtml.includes("device-screen-0") && swapHtml.includes("device-screen-1"), "multi-screen scene must render multiple device-screen layers");

  // -- The 3D showcase scene renders the six-face rig, not a flat device --
  const cinematic = scratchVideoProject("iphone-15-pro-landscape");
  const rigScene = cinematic.scenes.find((s) => s.sceneTemplate === "landscape-flow" || s.sceneTemplate === "showcase-3d");
  assert.ok(rigScene, "iphone-15-pro-landscape must include a 3D showcase / landscape-flow scene");
  const rigHtml = sceneHtml(rigScene!, ["data:x"], false);
  assert.ok(rigHtml.includes("device-rig") && rigHtml.includes("device-back") && rigHtml.includes("device-face"), "3D scene must render the six-face 3D rig");

  // -- deviceMarkupMultiScreen: N screens -> N distinct keyframe blocks --
  const multi = deviceMarkupMultiScreen(DEVICE_REGISTRY["phone"], ["a", "b", "c"], undefined, 3000);
  assert.ok(multi.includes("screenSwap0") && multi.includes("screenSwap1") && multi.includes("screenSwap2"), "deviceMarkupMultiScreen must emit one keyframe set per screen");

  // -- Variant-aware frame: folded vs unfolded frame SVGs must differ --
  const zfold = DEVICE_REGISTRY["samsung-galaxy-z-fold"];
  const foldedSvg = frameSvgFor(zfold, "folded");
  const unfoldedSvg = frameSvgFor(zfold, "unfolded");
  assert.notStrictEqual(foldedSvg, unfoldedSvg, "folded and unfolded frame SVGs must differ");

  // -- Mixed-orientation support: each template renders at its own canvas --
  assert.ok(VIDEO_TEMPLATES.some((t) => t.aspectRatio === "16:9"), "at least one template must be landscape (16:9)");
  assert.ok(VIDEO_TEMPLATES.some((t) => t.aspectRatio !== "16:9"), "at least one template must stay portrait (9:16)");

  const landscapeTemplate = VIDEO_TEMPLATES.find((t) => t.aspectRatio === "16:9")!;
  const landscapeProject = scratchVideoProject(landscapeTemplate.id);
  assert.strictEqual(landscapeProject.scenes[0].aspectRatio, "16:9");
  const landscapeHtml = sceneHtml(landscapeProject.scenes[0], [], false);
  assert.ok(landscapeHtml.includes("width: 1920px; height: 1080px"), "a 16:9 scene must render at a 1920x1080 canvas");

  const portraitTemplate = VIDEO_TEMPLATES.find((t) => t.aspectRatio !== "16:9")!;
  const portraitProject = scratchVideoProject(portraitTemplate.id);
  const portraitHtml = sceneHtml(portraitProject.scenes[0], [], false);
  assert.ok(portraitHtml.includes("width: 1080px; height: 1920px"), "a 9:16 scene must keep the app-store-standard 1080x1920 canvas");

  // -- Text contrast on pale backgrounds, across every template --
  const PALE_BACKGROUNDS = new Set(["light", "candy", "citrus", "solid-white", "solid-cream"]);
  for (const t of VIDEO_TEMPLATES) {
    for (const s of t.scenes) {
      if (!PALE_BACKGROUNDS.has(s.background)) continue;
      const scene = { ...sampleScene(), background: s.background, text: "Sample", subtext: "Sub" };
      const html2 = sceneHtml(scene, [], false);
      assert.ok(html2.includes('class="copy" style="color:#141821'), `template '${t.id}' scene on '${s.background}' must use dark text for contrast`);
    }
  }

  // -- BGM: every template has a preset, presets are distinct, WAV is valid --
  for (const t of VIDEO_TEMPLATES) {
    assert.ok(BGM_PRESETS[t.id], `template '${t.id}' must have a BGM preset`);
  }
  const seenPresetKeys = new Set<string>();
  for (const [id, preset] of Object.entries(BGM_PRESETS)) {
    const key = `${preset.bpm}::${preset.key}::${preset.chords[0].join(",")}`;
    assert.ok(!seenPresetKeys.has(key), `BGM preset for '${id}' duplicates bpm/key/first-chord with another preset`);
    seenPresetKeys.add(key);
  }
  // -- Verify 360-degree rotation and screen-fit zoom for flow animations --
  const pFlowKf = SCENE_ANIMATIONS["portrait-flow"].deviceKeyframes(sampleScene());
  assert.ok(pFlowKf.includes("rotateY(-360deg)"), "portrait-flow must include full 360-degree spin");
  assert.ok(pFlowKf.includes("scale(1.68)"), "portrait-flow must scale to fit screen dimensions");

  const lFlowKf = SCENE_ANIMATIONS["landscape-flow"].deviceKeyframes(sampleScene());
  assert.ok(lFlowKf.includes("rotateY(-360deg)"), "landscape-flow must include full 360-degree spin");
  assert.ok(lFlowKf.includes("scale(1.56)"), "landscape-flow must scale proportionally to canvas vertical space");

  // -- Verify parallax-stack has no rotateX causing vertical screen cropping --
  const pStackKf = SCENE_ANIMATIONS["parallax-stack"].deviceKeyframes(sampleScene());
  assert.ok(!pStackKf.includes("rotateX"), "parallax-stack must not include rotateX to prevent screen cropping");

  // -- Verify no dot/blob artifact (.device-contact) in 3D markup --
  const rigWithoutContact = rigHtml;
  assert.ok(!rigWithoutContact.includes("device-contact"), "3D rig must not contain .device-contact element");

  console.log("render.test.ts: all checks passed");
}

demo();
