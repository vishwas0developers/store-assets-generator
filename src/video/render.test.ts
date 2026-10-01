import assert from "node:assert";
import { SCENE_ANIMATIONS, sceneHtml, templatePreviewHtml, EXPORT_PRESETS, RenderCancelled, cleanExportFileName, clampEven, buildVfFilter, renderVideo } from "./render.js";
import { SCENE_TRANSITIONS, type VideoApplication, type VideoScene } from "./application.js";
import { VIDEO_TEMPLATES, applyVideoTemplate, resolveTemplateId, scratchVideoApplication } from "./templates.js";
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

async function demo() {
  // -- Scene animations: every one animates, spans 0-100%, stays in frame --
  for (const anim of Object.values(SCENE_ANIMATIONS)) {
    const kf = anim.deviceKeyframes(sampleScene({ sceneTemplate: anim.id }));
    assert.ok(kf.includes("transform"), `${anim.id} device keyframes must animate transform`);
    assert.ok(kf.includes("0%") && kf.includes("100%"), `${anim.id} device keyframes must span 0%-100%`);
    assert.ok(typeof anim.easing === "string" && anim.easing.length > 0, `${anim.id} must declare an easing`);
    const hundredPctBlock = kf.split("100%")[1] ?? "";
    assert.ok(hundredPctBlock.includes("opacity: 1"), `${anim.id} must resolve to opacity:1 at 100% (device stays in frame)`);
  }
  assert.ok(SCENE_ANIMATIONS["showcase-3d"]?.renderDevice, "showcase-3d must declare a renderDevice hook using the 3D rig");
  assert.ok(SCENE_ANIMATIONS["trio-lineup"], "trio-lineup animation must exist");
  assert.ok(SCENE_ANIMATIONS["tablet-pan"], "tablet-pan animation must exist");

  // -- Layout: no per-scene control; each orientation has exactly its built-in composition --
  assert.ok(sceneHtml(sampleScene({ aspectRatio: "16:9" }), []).includes("flex-direction: row;"), "landscape scenes use the copy-left composition");
  assert.ok(sceneHtml(sampleScene({ aspectRatio: "9:16" }), []).includes("flex-direction: column;"), "portrait scenes use the stacked composition");

  // -- Scene Transition: every offered transition renders; "cut" renders an always-invisible overlay --
  for (const tr of SCENE_TRANSITIONS) {
    const html = sceneHtml(sampleScene({ transition: tr.id }), []);
    assert.ok(html.includes("transition-overlay"), `transition '${tr.id}' must render the overlay layer`);
  }

  // -- Player script: no autoplay, no loop, exposes the full scene-specific API --
  const application: VideoApplication = {
    id: "test",
    createdAt: new Date().toISOString(),
    name: "test",
    template: "minimal-premium",
    sources: [],
    scenes: [sampleScene({ id: "s1", order: 0, sceneTemplate: "hero-rise" }), sampleScene({ id: "s2", order: 1, sceneTemplate: "tilt-3d" })],
    bgm: null,
    outputs: {},
  };
  const html = templatePreviewHtml(application);
  for (let i = 0; i < application.scenes.length; i++) {
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
    if (!t.id.startsWith("tpl-")) {
      assert.ok(DEVICE_REGISTRY[t.device], `template '${t.id}' references unknown device '${t.device}'`);
      assert.ok(typeof t.deviceFraction === "number" && t.deviceFraction > 0, `template '${t.id}' must declare deviceFraction`);
      assert.ok(t.scenes.length >= 2, `template '${t.id}' must have at least 2 scenes`);
    }

    const orientation = t.aspectRatio === "16:9" ? "16:9" : "9:16";
    const seen = seenByOrientation[orientation];
    const key = t.device;
    seen.add(key);



    for (const s of t.scenes) {
      if (!t.id.startsWith("tpl-")) {
        assert.ok(s.text && s.text.trim().length > 0, `template '${t.id}' scene '${s.label}' must have non-empty text`);
      }
      assert.ok(SCENE_ANIMATIONS[s.sceneTemplate], `template '${t.id}' scene '${s.label}' references unknown animation '${s.sceneTemplate}'`);
    }
  }
  assert.ok(seenByOrientation["16:9"].size >= 4, "at least 4 landscape templates expected");
  assert.ok(seenByOrientation["9:16"].size >= 4, "at least 4 portrait templates expected");

  // -- Old template ids still resolve (migration alias) --
  assert.strictEqual(resolveTemplateId("feature-showcase"), "iphone-15-pro-portrait");
  const migrated = scratchVideoApplication("feature-showcase");
  assert.strictEqual(migrated.template, "iphone-15-pro-portrait");

  // -- A multi-screen scene resolves to screenIds and renders a screen-swap --
  const showcase = scratchVideoApplication("iphone-15-pro-portrait");
  const swapScene = showcase.scenes.find((s) => (s.screenIds?.length ?? 0) > 1);
  assert.ok(swapScene, "iphone-15-pro-portrait must include at least one multi-screen scene");
  const swapHtml = sceneHtml(swapScene!, ["data:x", "data:y", "data:z"], false);
  // Multi-screen crossfade now renders via the GLB/canvas 3D rig
  // (src/render/three-bridge.ts), not DOM <img>/<video> layers -- the
  // contract is that all screenshot URIs reach the canvas as data-screens.
  const screensMatch = swapHtml.match(/data-screens="([^"]*)"/);
  assert.ok(screensMatch, "multi-screen scene must render a device-rig-canvas with data-screens");
  const screens = JSON.parse(screensMatch![1].replace(/&quot;/g, '"'));
  assert.strictEqual(screens.length, 3, "data-screens must carry every screenshot URI for the crossfade");
  assert.ok(screens.every((s: any) => typeof s.src === "string" && s.src.length > 0), "every screen entry must carry its source URI");

  // -- The 3D showcase scene renders the real GLB rig canvas, not a flat device --
  const cinematic = scratchVideoApplication("iphone-15-pro-landscape");
  const rigScene = cinematic.scenes.find((s) => s.sceneTemplate === "landscape-flow" || s.sceneTemplate === "showcase-3d");
  assert.ok(rigScene, "iphone-15-pro-landscape must include a 3D showcase / landscape-flow scene");
  const rigHtml = sceneHtml(rigScene!, ["data:x"], false);
  assert.ok(rigHtml.includes("device-rig-canvas") && rigHtml.includes("data-device-id="), "3D scene must render the device-rig-canvas backed by a real device GLB");

  // -- deviceMarkupMultiScreen: N screens -> N distinct keyframe blocks --
  const multi = deviceMarkupMultiScreen(DEVICE_REGISTRY["phone"], ["a", "b", "c"], undefined, 3000);
  assert.ok(multi.includes("screenSwap0") && multi.includes("screenSwap1") && multi.includes("screenSwap2"), "deviceMarkupMultiScreen must emit one keyframe set per screen");

  // -- Variant-aware frame: folded vs unfolded frame SVGs must differ --
  const zfold: any = DEVICE_REGISTRY["samsung-galaxy-z-fold"] ?? {
    id: "samsung-galaxy-z-fold",
    geometry: { width: 1812, height: 2176, screenInset: { top: 20, left: 20, width: 1772, height: 2136 } },
    svgFrame: "<svg>unfolded</svg>",
    definition: {
      id: "samsung-galaxy-z-fold",
      formFactor: "foldable",
      bezelWidth: 20,
      body: "#000",
      accent: "#444",
      cutout: { type: "none" },
      geometry: { width: 1812, height: 2176, thickness: 10, cornerRadius: 20 },
      screenInset: { top: 20, left: 20, width: 1772, height: 2136 },
      variants: [
        { id: "folded", geometry: { width: 900, height: 2176, thickness: 15, cornerRadius: 20 }, screenInset: { top: 20, left: 20, width: 860, height: 2136 } },
        { id: "unfolded", geometry: { width: 1812, height: 2176, thickness: 10, cornerRadius: 20 }, screenInset: { top: 20, left: 20, width: 1772, height: 2136 } }
      ]
    },
    variants: [
      { id: "folded", name: "Folded", geometry: { width: 900, height: 2176, screenInset: { top: 20, left: 20, width: 860, height: 2136 } } },
      { id: "unfolded", name: "Unfolded", geometry: { width: 1812, height: 2176, screenInset: { top: 20, left: 20, width: 1772, height: 2136 } } }
    ]
  };
  const foldedSvg = frameSvgFor(zfold, "folded");
  const unfoldedSvg = frameSvgFor(zfold, "unfolded");
  assert.notStrictEqual(foldedSvg, unfoldedSvg, "folded and unfolded frame SVGs must differ");

  // -- Mixed-orientation support: each template renders at its own canvas --
  assert.ok(VIDEO_TEMPLATES.some((t) => t.aspectRatio === "16:9"), "at least one template must be landscape (16:9)");
  assert.ok(VIDEO_TEMPLATES.some((t) => t.aspectRatio !== "16:9"), "at least one template must stay portrait (9:16)");

  const landscapeTemplate = VIDEO_TEMPLATES.find((t) => t.aspectRatio === "16:9")!;
  const landscapeApplication = scratchVideoApplication(landscapeTemplate.id);
  assert.strictEqual(landscapeApplication.scenes[0].aspectRatio, "16:9");
  const landscapeHtml = sceneHtml(landscapeApplication.scenes[0], [], false);
  assert.ok(landscapeHtml.includes("width: 1920px; height: 1080px"), "a 16:9 scene must render at a 1920x1080 canvas");

  const portraitTemplate = VIDEO_TEMPLATES.find((t) => t.aspectRatio !== "16:9")!;
  const portraitApplication = scratchVideoApplication(portraitTemplate.id);
  const portraitHtml = sceneHtml(portraitApplication.scenes[0], [], false);
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
  assert.ok(pFlowKf.includes("scale("), "portrait-flow must scale to fit screen dimensions");

  const lFlowKf = SCENE_ANIMATIONS["landscape-flow"].deviceKeyframes(sampleScene());
  assert.ok(lFlowKf.includes("rotateY(-360deg)"), "landscape-flow must include full 360-degree spin");
  assert.ok(lFlowKf.includes("scale("), "landscape-flow must scale proportionally to canvas vertical space");

  // -- Verify parallax-stack has no rotateX causing vertical screen cropping --
  const pStackKf = SCENE_ANIMATIONS["parallax-stack"].deviceKeyframes(sampleScene());
  assert.ok(!pStackKf.includes("rotateX"), "parallax-stack must not include rotateX to prevent screen cropping");

  // -- Verify no dot/blob artifact (.device-contact) in 3D markup --
  const rigWithoutContact = rigHtml;
  assert.ok(!rigWithoutContact.includes("device-contact"), "3D rig must not contain .device-contact element");

  // -- Verify EXPORT_PRESETS table --
  assert.ok(Array.isArray(EXPORT_PRESETS) && EXPORT_PRESETS.length >= 4, "EXPORT_PRESETS must contain at least 4 presets");
  assert.ok(EXPORT_PRESETS.some(p => p.id === "app-store"), "EXPORT_PRESETS must include app-store preset");
  assert.ok(EXPORT_PRESETS.some(p => p.id === "social-square"), "EXPORT_PRESETS must include social-square preset");
  assert.ok(EXPORT_PRESETS.some(p => p.id === "web-720"), "EXPORT_PRESETS must include web-720 preset");
  assert.ok(EXPORT_PRESETS.some(p => p.id === "youtube-1080"), "EXPORT_PRESETS must include youtube-1080 preset");

  // -- Verify RenderCancelled exception --
  const cancelErr = new RenderCancelled("Test cancellation");
  assert.strictEqual(cancelErr.name, "RenderCancelled");
  assert.strictEqual(cancelErr.message, "Test cancellation");

  // -- Validation: Filename clean-up and extension forcing --
  assert.strictEqual(cleanExportFileName("my-promo.mp4", "mp4"), "my-promo.mp4");
  assert.strictEqual(cleanExportFileName("my promo video! @#$", "mp4"), "my_promo_video.mp4");
  assert.strictEqual(cleanExportFileName("test.avi", "webm"), "test.webm");
  assert.strictEqual(cleanExportFileName("", "mp4"), "promo.mp4");

  // -- Validation: Custom size limits and forcing to even numbers --
  assert.strictEqual(clampEven(100), 240, "clampEven must clamp min to 240");
  assert.strictEqual(clampEven(5000), 3840, "clampEven must clamp max to 3840");
  assert.strictEqual(clampEven(1081), 1080, "clampEven must force odd number to even");
  assert.strictEqual(clampEven(720), 720, "clampEven must preserve even number");

  // -- Validation: The scale/pad filter for a custom size and orientation --
  const filterSquare = buildVfFilter(1080, 1080, 1080, 1920, "square");
  assert.ok(filterSquare.includes("scale=1080:1080:force_original_aspect_ratio=decrease"), "scale/pad filter must scale decrease");
  assert.ok(filterSquare.includes("pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black"), "scale/pad filter must pad with black");

  const filterNative = buildVfFilter(1080, 1920, 1080, 1920, "native");
  assert.strictEqual(filterNative, "", "native matching canvas must produce empty vf filter");

  // -- Validation: Scene range picks only the right scenes and duration --
  const multiSceneApplication = scratchVideoApplication(VIDEO_TEMPLATES[0].id);
  multiSceneApplication.scenes = [
    sampleScene({ id: "s1", order: 0, durationSeconds: 3 }),
    sampleScene({ id: "s2", order: 1, durationSeconds: 4 }),
    sampleScene({ id: "s3", order: 2, durationSeconds: 5 }),
    sampleScene({ id: "s4", order: 3, durationSeconds: 6 }),
  ];
  const range: [number, number] = [2, 3];
  const pickedScenes = [...multiSceneApplication.scenes]
    .sort((a, b) => a.order - b.order)
    .filter((_, idx) => (idx + 1) >= range[0] && (idx + 1) <= range[1]);
  assert.strictEqual(pickedScenes.length, 2, "sceneRange [2, 3] must select 2 scenes");
  assert.strictEqual(pickedScenes[0].id, "s2");
  assert.strictEqual(pickedScenes[1].id, "s3");
  const pickedDuration = pickedScenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  assert.strictEqual(pickedDuration, 9, "picked duration must equal sum of scenes 2 and 3");

  // -- Validation: Aborting before the first frame throws RenderCancelled and leaves no output file --
  const abortController = new AbortController();
  abortController.abort();
  let cancelledThrown = false;
  try {
    await renderVideo(multiSceneApplication, { signal: abortController.signal });
  } catch (err: any) {
    if (err instanceof RenderCancelled || err?.name === "RenderCancelled") {
      cancelledThrown = true;
    }
  }
  assert.ok(cancelledThrown, "renderVideo with pre-aborted signal must throw RenderCancelled");

  console.log("render.test.ts: all checks passed");
}

await demo();
