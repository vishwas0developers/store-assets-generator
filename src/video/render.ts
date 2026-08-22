import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { BACKGROUNDS, DEVICE_CSS, backgroundCss, dataUri, deviceMarkup, deviceMarkupMultiScreen, deviceScaleFor, escapeHtml } from "../render/shared.js";
import { DEVICE_REGISTRY, resolveGeometry, type DeviceModel } from "../devices/registry.js";
import { videoDir, videoFile, type VideoProject, type VideoScene } from "./project.js";
import { VIDEO_TEMPLATES, type VideoTemplate } from "./templates.js";

/**
 * Video tab renderer -- one scene per animation beat, independent of
 * Screen Capture and Studio Mockup (its own VideoProject/VideoScene,
 * own uploaded sources). HTML/CSS/JS animation only, never an AI video
 * engine (PRD requirement).
 *
 * The single-generator invariant: `sceneHtml()` backs both the live
 * preview (played natively by the browser) and the final render (stepped
 * deterministically via window.seek + document.getAnimations()).
 *
 * Every scene renders THREE independently-animated layers -- device,
 * text, backdrop -- each with its own easing/delay, so a scene reads as
 * a small choreographed sequence rather than one element tweening.
 * `renderVideo` renders one scene per Playwright page (see below), so all
 * motion here is intra-scene: every scene owns its own entrance and exit
 * inside its own duration, never overlapping the next scene.
 */

export interface SceneAnimation {
  id: string;
  name: string;
  /** CSS easing applied to the device layer's entrance/hold/exit. */
  easing: string;
  /** Keyframe body (0%..100% of the scene's full duration) for the device layer. */
  deviceKeyframes: (s: VideoScene) => string;
  /** Optional override for the backdrop drift; falls back to a gentle default. */
  backdropKeyframes?: (s: VideoScene) => string;
  /** Optional override for how the device layer's inner markup is built --
   *  lets one animation (e.g. a foldable hinge sweep) render more than the
   *  plain single-frame deviceMarkup. Falls back to deviceMarkup. */
  renderDevice?: (device: DeviceModel, screenshotUri: string, scene: VideoScene) => string;
}

const DEFAULT_EASING = "cubic-bezier(.22,.9,.32,1)";

/** Every entrance/exit distance is expressed in terms of `move`/`zoom`/`rotate`
 *  but capped so the device settles back in frame instead of flying past the
 *  canvas edge -- an entrance may start from just outside, an exit only ever
 *  fades/settles in place, it never travels off-canvas. */
const MOVE_CAP = 90;
const cappedMove = (move: number) => Math.min(move, MOVE_CAP);

function defaultBackdrop(s: VideoScene): string {
  return `
    0%   { transform: scale(1) translate3d(0,0,0); }
    100% { transform: scale(${1 + Math.min(s.zoom, 40) / 250}) translate3d(${s.move / 40}%, -${s.move / 60}%, 0); }
  `;
}

export const SCENE_ANIMATIONS: Record<string, SceneAnimation> = {
  "hero-rise": {
    id: "hero-rise",
    name: "Hero rise",
    easing: "cubic-bezier(.16,1.1,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: translateY(${100 + cappedMove(s.move)}px) scale(${1 - s.zoom / 180}); opacity: 0; }
      12%  { opacity: 1; }
      55%  { transform: translateY(0) scale(${1 + s.zoom / 100}); opacity: 1; }
      88%  { transform: translateY(0) scale(${1 + s.zoom / 100}); opacity: 1; }
      100% { transform: translateY(0) scale(${1 + s.zoom / 110}); opacity: 1; }
    `,
  },
  "tilt-3d": {
    id: "tilt-3d",
    name: "3D tilt",
    easing: "cubic-bezier(.2,.85,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: rotateY(${-40 - s.rotate}deg) translateY(${cappedMove(s.move) * 0.4}px) scale(${1 - s.zoom / 200}); opacity: 0; }
      15%  { opacity: 1; }
      55%  { transform: rotateY(${s.rotate}deg) translateY(0) scale(${1 + s.zoom / 100}); opacity: 1; }
      88%  { transform: rotateY(${-s.rotate / 4}deg) translateY(0) scale(${1 + s.zoom / 100}); opacity: 1; }
      100% { transform: rotateY(0deg) translateY(0) scale(${1 + s.zoom / 120}); opacity: 1; }
    `,
    backdropKeyframes: (s) => `
      0%   { transform: scale(1.04) translate3d(2%,0,0); }
      100% { transform: scale(${1 + s.zoom / 220}) translate3d(-2%,0,0); }
    `,
  },
  "zoom-focus": {
    id: "zoom-focus",
    name: "Zoom focus",
    easing: "cubic-bezier(.25,.9,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: scale(${0.82 - s.zoom / 320}); opacity: 0; }
      18%  { opacity: 1; }
      60%  { transform: scale(${1 + s.zoom / 100}); opacity: 1; }
      100% { transform: scale(${1 + s.zoom / 90}); opacity: 1; }
    `,
  },
  "slide-pan": {
    id: "slide-pan",
    name: "Slide / pan",
    easing: "cubic-bezier(.22,.9,.28,1)",
    deviceKeyframes: (s) => `
      0%   { transform: translateX(${-1 * (120 + cappedMove(s.move))}px) rotateZ(${-s.rotate / 2}deg); opacity: 0; }
      15%  { opacity: 1; }
      58%  { transform: translateX(0) rotateZ(0deg) scale(${1 + s.zoom / 100}); opacity: 1; }
      100% { transform: translateX(0) rotateZ(0deg) scale(${1 + s.zoom / 100}); opacity: 1; }
    `,
    backdropKeyframes: (s) => `
      0%   { transform: scale(1.1) translate3d(-4%,0,0); }
      100% { transform: scale(1.1) translate3d(4%,0,0); }
    `,
  },
  "mask-reveal": {
    id: "mask-reveal",
    name: "Mask reveal",
    easing: "cubic-bezier(.3,.9,.25,1)",
    deviceKeyframes: (s) => `
      0%   { clip-path: inset(100% 0 0 0); transform: translateY(${20 + cappedMove(s.move) / 3}px) scale(${1 + s.zoom / 130}); opacity: 0; }
      10%  { opacity: 1; }
      45%  { clip-path: inset(0 0 0 0); transform: translateY(0) scale(${1 + s.zoom / 100}); opacity: 1; }
      100% { clip-path: inset(0 0 0 0); transform: translateY(0) scale(${1 + s.zoom / 100}); opacity: 1; }
    `,
  },
  "parallax-stack": {
    id: "parallax-stack",
    name: "Parallax stack",
    easing: "cubic-bezier(.18,.9,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: translateY(${60 + cappedMove(s.move) / 2}px) scale(${0.92 - s.zoom / 260}) rotateX(${10 + s.rotate / 3}deg); opacity: 0; }
      14%  { opacity: 1; }
      50%  { transform: translateY(0) scale(${1 + s.zoom / 100}) rotateX(0deg); opacity: 1; }
      100% { transform: translateY(0) scale(${1 + s.zoom / 100}) rotateX(0deg); opacity: 1; }
    `,
    backdropKeyframes: (s) => `
      0%   { transform: scale(1.15) translate3d(0,4%,0); }
      100% { transform: scale(1.02) translate3d(0,-4%,0); }
    `,
  },
  "kinetic-type": {
    id: "kinetic-type",
    name: "Kinetic type",
    easing: "cubic-bezier(.22,1,.36,1)",
    deviceKeyframes: (s) => `
      0%   { transform: scale(${0.9 - s.zoom / 260}) translateY(${16 + cappedMove(s.move) / 4}px); opacity: 0; }
      22%  { opacity: 1; }
      55%  { transform: scale(${1 + s.zoom / 100}) translateY(0); opacity: 1; }
      100% { transform: scale(${1 + s.zoom / 90}) translateY(0); opacity: 1; }
    `,
  },
  "card-flip": {
    id: "card-flip",
    name: "Card flip",
    easing: "cubic-bezier(.34,.9,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: perspective(1600px) rotateY(${90 + s.rotate}deg) scale(${1 - s.zoom / 220}); opacity: 0; }
      20%  { opacity: 1; }
      52%  { transform: perspective(1600px) rotateY(0deg) scale(${1 + s.zoom / 100}); opacity: 1; }
      100% { transform: perspective(1600px) rotateY(0deg) scale(${1 + s.zoom / 110}); opacity: 1; }
    `,
  },
  "outro-cta": {
    id: "outro-cta",
    name: "Outro CTA",
    easing: "cubic-bezier(.2,.9,.25,1.15)",
    deviceKeyframes: (s) => `
      0%   { transform: scale(${0.88 - s.zoom / 260}) translateY(${20 + cappedMove(s.move) / 5}px); opacity: 0; }
      20%  { opacity: 1; }
      50%  { transform: scale(${1.03 + s.zoom / 140}) translateY(0); opacity: 1; }
      62%  { transform: scale(${1 + s.zoom / 100}) translateY(0); opacity: 1; }
      100% { transform: scale(${1 + s.zoom / 100}) translateY(0); opacity: 1; }
    `,
    backdropKeyframes: () => `
      0%   { transform: scale(1); filter: brightness(1); }
      50%  { transform: scale(1.06); filter: brightness(1.12); }
      100% { transform: scale(1.02); filter: brightness(1.05); }
    `,
  },
  "fold-open": {
    id: "fold-open",
    name: "Fold open",
    easing: "cubic-bezier(.2,.9,.2,1.05)",
    deviceKeyframes: (s) => `
      0%   { transform: perspective(1800px) rotateY(${-10 - s.rotate / 2}deg) scale(${0.94 - s.zoom / 260}); opacity: 0; }
      18%  { opacity: 1; }
      60%  { transform: perspective(1800px) rotateY(${s.rotate / 6}deg) scale(${1 + s.zoom / 100}); opacity: 1; }
      100% { transform: perspective(1800px) rotateY(0deg) scale(${1 + s.zoom / 110}); opacity: 1; }
    `,
    backdropKeyframes: (s) => `
      0%   { transform: scale(1.08) translate3d(0,2%,0); }
      100% { transform: scale(${1 + s.zoom / 240}) translate3d(0,-2%,0); }
    `,
    /** Cross-fades the folded (cover-screen) frame into the unfolded (main-
     *  screen) frame with a hinge-style scaleX pinch at the midpoint, so the
     *  foldable visibly opens instead of just displaying one static state. */
    renderDevice: (device, uri, scene) => {
      const foldedMarkup = deviceMarkup(device, uri, "folded");
      const unfoldedMarkup = deviceMarkup(device, uri, "unfolded");
      return `<div class="fold-rig">
        <div class="fold-layer fold-folded">${foldedMarkup}</div>
        <div class="fold-layer fold-unfolded">${unfoldedMarkup}</div>
      </div>`;
    },
  },
  "tablet-pan": {
    id: "tablet-pan",
    name: "Tablet pan",
    easing: "cubic-bezier(.24,.85,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: translateX(${-1 * (60 + cappedMove(s.move) / 2)}px) rotateY(${-8 - s.rotate / 4}deg) scale(${0.95 - s.zoom / 300}); opacity: 0; }
      18%  { opacity: 1; }
      62%  { transform: translateX(0) rotateY(${s.rotate / 8}deg) scale(${1 + s.zoom / 110}); opacity: 1; }
      100% { transform: translateX(0) rotateY(0deg) scale(${1 + s.zoom / 120}); opacity: 1; }
    `,
    backdropKeyframes: (s) => `
      0%   { transform: scale(1.06) translate3d(-2%,0,0); }
      100% { transform: scale(${1 + s.zoom / 260}) translate3d(2%,0,0); }
    `,
  },
};

export function listSceneAnimations() {
  return Object.values(SCENE_ANIMATIONS).map((a) => ({ id: a.id, name: a.name }));
}
export function listVideoBackgrounds() {
  return Object.keys(BACKGROUNDS);
}

const CANVAS = { width: 1080, height: 1920 };
const CANVAS_LANDSCAPE = { width: 1920, height: 1080 };

/** A scene's canvas is landscape only when its template opted in; every
 *  existing template (and any scene without an explicit aspectRatio)
 *  keeps the original 9:16 portrait canvas app stores require. */
function canvasFor(scene: VideoScene): { width: number; height: number } {
  return scene.aspectRatio === "16:9" ? CANVAS_LANDSCAPE : CANVAS;
}

function sourceUriFor(project: VideoProject, scene: VideoScene, resolveUri: (rel: string) => string): string {
  const source = project.sources.find((s) => s.id === scene.sourceId) ?? project.sources[0];
  return source ? resolveUri(source.file) : "";
}

/** Ordered screenshot URIs for a scene -- `screenIds` (2+) drives an
 *  in-device screen swap; otherwise falls back to the single `sourceId`.
 *  When a multi-screen scene has no real source uploaded yet (e.g.
 *  previewing a template before applying it), each slot still gets its own
 *  distinct placeholder so the swap is visible ahead of real screenshots. */
export function sourceUrisFor(project: VideoProject, scene: VideoScene, resolveUri: (rel: string) => string): string[] {
  if (scene.screenIds && scene.screenIds.length > 1) {
    return scene.screenIds.map((id, i) => {
      const source = project.sources.find((s) => s.id === id);
      return source ? resolveUri(source.file) : placeholderScreenUri(i);
    });
  }
  const uri = sourceUriFor(project, scene, resolveUri);
  return uri ? [uri] : [];
}

/** Synthetic placeholder screens for a scene with no uploaded source yet
 *  (e.g. previewing a template before applying it) -- a handful of visually
 *  distinct generic app-screen layouts so the device reads as populated, and
 *  a multi-screen swap is visible even before real screenshots exist. */
const PLACEHOLDER_LAYOUTS = ["list", "grid", "detail", "profile"] as const;
function placeholderScreenUri(index = 0): string {
  const layout = PLACEHOLDER_LAYOUTS[index % PLACEHOLDER_LAYOUTS.length];
  const header = `<rect width="1020" height="220" fill="#ffffff"/>
    <circle cx="90" cy="110" r="40" fill="#c7d0dc"/>
    <rect x="160" y="86" width="360" height="26" rx="13" fill="#c7d0dc"/>
    <rect x="160" y="128" width="230" height="20" rx="10" fill="#dbe1ea"/>`;
  let body = "";
  if (layout === "list") {
    body = [0, 1, 2, 3]
      .map((i) => `<rect x="60" y="${280 + i * 340}" width="900" height="290" rx="28" fill="#ffffff"/>
      <rect x="100" y="${330 + i * 340}" width="440" height="30" rx="15" fill="#c7d0dc"/>
      <rect x="100" y="${378 + i * 340}" width="600" height="22" rx="11" fill="#dbe1ea"/>
      <rect x="100" y="${418 + i * 340}" width="380" height="22" rx="11" fill="#dbe1ea"/>`)
      .join("");
  } else if (layout === "grid") {
    body = [0, 1, 2, 3, 4, 5]
      .map((i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        return `<rect x="${60 + col * 470}" y="${280 + row * 400}" width="430" height="360" rx="24" fill="#ffffff"/>
      <rect x="${100 + col * 470}" y="${610 + row * 400}" width="330" height="24" rx="12" fill="#c7d0dc"/>`;
      })
      .join("");
  } else if (layout === "detail") {
    body = `<rect x="60" y="280" width="900" height="620" rx="32" fill="#ffffff"/>
      <rect x="100" y="960" width="500" height="40" rx="18" fill="#c7d0dc"/>
      <rect x="100" y="1024" width="820" height="24" rx="11" fill="#dbe1ea"/>
      <rect x="100" y="1064" width="700" height="24" rx="11" fill="#dbe1ea"/>
      <rect x="100" y="1140" width="820" height="120" rx="20" fill="#e1e6ee"/>`;
  } else {
    body = `<circle cx="510" cy="480" r="160" fill="#c7d0dc"/>
      <rect x="260" y="700" width="500" height="34" rx="16" fill="#c7d0dc"/>
      <rect x="330" y="756" width="360" height="22" rx="11" fill="#dbe1ea"/>
      ${[0, 1, 2].map((i) => `<rect x="60" y="${880 + i * 220}" width="900" height="180" rx="24" fill="#ffffff"/>`).join("")}`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1020" height="2340">
    <rect width="1020" height="2340" fill="#eef1f6"/>
    ${header}
    ${body}
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Resolves what to actually draw inside the device box for a scene: a
 *  custom `renderDevice` hook (e.g. fold-open's hinge cross-fade) takes
 *  precedence, then a multi-screen swap when 2+ screens are set, otherwise
 *  a single static screenshot (or a placeholder when none exists yet). */
function deviceInnerMarkup(animation: SceneAnimation, device: DeviceModel, scene: VideoScene, uris: string[], durationMs: number): string {
  const filled = uris.length > 0 ? uris : [placeholderScreenUri(0)];
  if (animation.renderDevice) return animation.renderDevice(device, filled[0], scene);
  if (filled.length > 1) return deviceMarkupMultiScreen(device, filled, scene.variant, durationMs);
  return deviceMarkup(device, filled[0], scene.variant);
}

/** Splits text into word `<span>`s with a per-word entrance delay, so the
 *  title reads as a staggered reveal rather than popping in as one block. */
function wordSpans(text: string, className: string, baseDelayMs: number, stepMs: number): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => `<span class="${className}" style="animation-delay:${baseDelayMs + i * stepMs}ms">${escapeHtml(word)}</span>`)
    .join(" ");
}

/** Shared text-block CSS: word-by-word entrance for title/subtitle plus a
 *  single late exit fade on the wrapping `.copy` element. Used by every
 *  scene animation so text motion is consistent regardless of which device
 *  animation is picked. */
function textBlockStyle(durationMs: number): string {
  const exitDelay = Math.max(0, durationMs - 480);
  return `
    .copy { opacity: 1; animation: copyExit 420ms ${exitDelay}ms cubic-bezier(.4,0,1,1) forwards; }
    @keyframes copyExit { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-14px); } }
    .word { display: inline-block; opacity: 0; transform: translateY(22px); animation: wordIn 560ms cubic-bezier(.16,1,.3,1) forwards; }
    @keyframes wordIn { 0% { opacity: 0; transform: translateY(22px); } 100% { opacity: 1; transform: translateY(0); } }
  `;
}

/** Backgrounds pale/bright enough that white text loses contrast against
 *  them -- text color and its shadow flip to dark on these, keeping every
 *  scene readable regardless of which background a template picks. */
const LIGHT_BACKGROUNDS = new Set(["light", "candy", "citrus"]);
function textColorFor(background: string): string {
  return LIGHT_BACKGROUNDS.has(background) ? "#141821" : "#ffffff";
}
function textShadowFor(background: string): string {
  return LIGHT_BACKGROUNDS.has(background) ? "0 1px 3px rgba(255,255,255,.55)" : "0 2px 12px rgba(0,0,0,.4)";
}

function textBlockHtml(scene: VideoScene): string {
  if (!scene.text) return "";
  const title = `<div class="label">${wordSpans(scene.text, "word", 60, 55)}</div>`;
  const sub = scene.subtext
    ? `<div class="subtext">${wordSpans(scene.subtext, "word", 260 + scene.text.split(/\s+/).length * 55, 45)}</div>`
    : "";
  return `<div class="copy" style="color:${textColorFor(scene.background)};text-shadow:${textShadowFor(scene.background)}">${title}${sub}</div>`;
}

/** CSS for the fold-open device hook -- both variant frames stacked and
 *  flex-centred (their native sizes differ), cross-fading over `durationMs`. */
function foldRigCss(durationMs: number): string {
  return `
    .fold-rig { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
    .fold-layer { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .fold-folded { animation: foldFadeOut ${durationMs}ms ease-in-out forwards; }
    .fold-unfolded { animation: foldFadeIn ${durationMs}ms ease-in-out forwards; opacity: 0; }
    @keyframes foldFadeOut { 0% { opacity: 1; } 45% { opacity: 1; } 65% { opacity: 0; } 100% { opacity: 0; } }
    @keyframes foldFadeIn { 0% { opacity: 0; } 45% { opacity: 0; } 65% { opacity: 1; } 100% { opacity: 1; } }
  `;
}

/** The single generator used by both preview and render. `seekable` embeds
 *  the frame-stepping hook the renderer calls; the browser preview ignores
 *  it and just plays the CSS animations live. */
export function sceneHtml(scene: VideoScene, screenshotUris: string[], seekable = false): string {
  const animation = SCENE_ANIMATIONS[scene.sceneTemplate] ?? SCENE_ANIMATIONS["hero-rise"];
  const device = DEVICE_REGISTRY[scene.device] ?? DEVICE_REGISTRY["phone"];
  if (!device) throw new Error(`Device '${scene.device}' not found in registry`);
  const canvas = canvasFor(scene);
  const isLandscape = scene.aspectRatio === "16:9";
  const deviceScale = deviceScaleFor(device, canvas.height, scene.variant, scene.deviceFraction ?? 0.58);
  const geometry = resolveGeometry(device, scene.variant);
  const stageWidth = Math.round(geometry.width * deviceScale);
  const stageHeight = Math.round(geometry.height * deviceScale);
  const durationMs = Math.max(1, scene.durationSeconds) * 1000;
  const backdropKf = (animation.backdropKeyframes ?? defaultBackdrop)(scene);

  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; }
  .canvas {
    position: relative; width: ${canvas.width}px; height: ${canvas.height}px;
    display: flex; flex-direction: ${isLandscape ? "row" : "column"}; align-items: center; justify-content: center;
    ${isLandscape ? "gap: 4%; padding: 0 6%;" : ""}
    font-family: "Segoe UI", Roboto, -apple-system, sans-serif; color: #fff; overflow: hidden;
  }
  .backdrop { position: absolute; inset: -8%; background: ${backgroundCss(scene.background)}; animation: bgPlay ${durationMs}ms ease-out forwards; }
  .vignette { position: absolute; inset: 0; background: radial-gradient(circle at 50% 42%, rgba(0,0,0,0) 45%, rgba(0,0,0,.35) 100%); }
  .copy { position: relative; text-align: ${isLandscape ? "left" : "center"}; padding: 0 8%; margin-bottom: ${isLandscape ? "0" : "4%"}; z-index: 3; ${isLandscape ? "flex: 1; padding-left: 0;" : ""} }
  .label { font-size: ${isLandscape ? 64 : 58}px; font-weight: 800; line-height: 1.15; }
  .subtext { font-size: ${isLandscape ? 32 : 30}px; opacity: .82; margin-top: .5em; font-weight: 500; }
  .stage { position: relative; width: ${stageWidth}px; height: ${stageHeight}px; perspective: 1600px; z-index: 2; flex-shrink: 0; }
  .stage-scale { position: absolute; inset: 0; transform: scale(${deviceScale}); transform-origin: top left; }
  .stage-inner { width: 100%; height: 100%; animation: play ${durationMs}ms ${animation.easing} forwards; }
  ${DEVICE_CSS}
  ${textBlockStyle(durationMs)}
  ${foldRigCss(durationMs)}
  @keyframes play { ${animation.deviceKeyframes(scene)} }
  @keyframes bgPlay { ${backdropKf} }
</style></head>
<body>
  <div class="canvas">
    <div class="backdrop"></div>
    <div class="vignette"></div>
    ${textBlockHtml(scene)}
    <div class="stage"><div class="stage-scale"><div class="stage-inner">${deviceInnerMarkup(animation, device, scene, screenshotUris, durationMs)}</div></div></div>
  </div>
  ${seekable ? `<script>window.seek = (ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; });</script>` : ""}
</body></html>`;
}

function previewResolveUri(projectId: string) {
  return (rel: string) => `/api/videos/${projectId}/file?p=${encodeURIComponent(rel)}`;
}

export function scenePreviewHtml(project: VideoProject, sceneId: string): string {
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error(`Scene '${sceneId}' not found in project ${project.id}`);
  return sceneHtml(scene, sourceUrisFor(project, scene, previewResolveUri(project.id)), false);
}

/** Concatenated full-template preview: every scene of the project plays
 *  back to back automatically, so opening this page is one continuous
 *  playthrough with no interaction needed. Each scene is its own
 *  absolutely-positioned layer with its own named @keyframes (no name
 *  collisions across scenes); a small script shows exactly one scene at a
 *  time and (re)starts its CSS animations by toggling a class, timed via
 *  setTimeout against each scene's own duration -- plain JS scheduling,
 *  not an AI video engine. */
export function templatePreviewHtml(project: VideoProject): string {
  const resolveUri = previewResolveUri(project.id);
  const scenes = [...project.scenes].sort((a, b) => a.order - b.order);

  const canvas = canvasFor(scenes[0] ?? ({} as VideoScene));

  const scenesCss = scenes
    .map((scene, i) => {
      const animation = SCENE_ANIMATIONS[scene.sceneTemplate] ?? SCENE_ANIMATIONS["hero-rise"];
      const durationMs = Math.max(1, scene.durationSeconds) * 1000;
      const backdropKf = (animation.backdropKeyframes ?? defaultBackdrop)(scene);
      const exitDelay = Math.max(0, durationMs - 480);
      const isLandscape = scene.aspectRatio === "16:9";
      return `
        .scene-${i} { flex-direction: ${isLandscape ? "row" : "column"}; ${isLandscape ? "gap: 4%; padding: 0 6%;" : ""} }
        .scene-${i} .copy { text-align: ${isLandscape ? "left" : "center"}; ${isLandscape ? "flex: 1; margin-bottom: 0;" : ""} }
        .scene-${i} .label { font-size: ${isLandscape ? 64 : 58}px; }
        .scene-${i} .subtext { font-size: ${isLandscape ? 32 : 30}px; }
        .scene-${i} .backdrop { background:${backgroundCss(scene.background)}; }
        .scene-${i}.playing .stage-inner { animation: play-${i} ${durationMs}ms ${animation.easing} forwards; }
        .scene-${i}.playing .backdrop { animation: bg-${i} ${durationMs}ms ease-out forwards; }
        .scene-${i}.playing .copy { animation: copyExit-${i} 420ms ${exitDelay}ms cubic-bezier(.4,0,1,1) forwards; }
        .scene-${i} .fold-folded { animation-duration: ${durationMs}ms; }
        .scene-${i} .fold-unfolded { animation-duration: ${durationMs}ms; }
        @keyframes play-${i} { ${animation.deviceKeyframes(scene)} }
        @keyframes bg-${i} { ${backdropKf} }
        @keyframes copyExit-${i} { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-14px); } }
      `;
    })
    .join("\n");

  const scenesHtml = scenes
    .map((scene, i) => {
      const animation = SCENE_ANIMATIONS[scene.sceneTemplate] ?? SCENE_ANIMATIONS["hero-rise"];
      const device = DEVICE_REGISTRY[scene.device] ?? DEVICE_REGISTRY["phone"];
      const sceneCanvas = canvasFor(scene);
      const deviceScale = deviceScaleFor(device, sceneCanvas.height, scene.variant, scene.deviceFraction ?? 0.58);
      const geometry = resolveGeometry(device, scene.variant);
      const stageWidth = Math.round(geometry.width * deviceScale);
      const stageHeight = Math.round(geometry.height * deviceScale);
      const durationMs = Math.max(1, scene.durationSeconds) * 1000;
      const uris = sourceUrisFor(project, scene, resolveUri);
      return `<div class="scene scene-${i}" id="scene-${i}">
        <div class="backdrop"></div>
        <div class="vignette"></div>
        ${textBlockHtml(scene)}
        <div class="stage" style="width:${stageWidth}px;height:${stageHeight}px;flex-shrink:0;"><div class="stage-scale" style="transform:scale(${deviceScale})"><div class="stage-inner">${deviceInnerMarkup(animation, device, scene, uris, durationMs)}</div></div></div>
      </div>`;
    })
    .join("\n");

  const durationsMs = JSON.stringify(scenes.map((s) => Math.max(1, s.durationSeconds) * 1000));

  return `<!doctype html><html><head><meta charset="utf-8" /><style>
    * { box-sizing: border-box; }
    html, body { margin:0; width:${canvas.width}px; height:${canvas.height}px; overflow:hidden; font-family:"Segoe UI",Roboto,-apple-system,sans-serif; color:#fff; }
    .scene { position:absolute; inset:0; width:${canvas.width}px; height:${canvas.height}px; display:none; align-items:center; justify-content:center; }
    .scene.playing { display:flex; }
    .backdrop { position:absolute; inset:-8%; }
    .vignette { position:absolute; inset:0; background: radial-gradient(circle at 50% 42%, rgba(0,0,0,0) 45%, rgba(0,0,0,.35) 100%); }
    .copy { position:relative; text-align:center; padding:0 8%; margin-bottom:4%; z-index:3; }
    .label { font-size:58px; font-weight:800; line-height:1.15; }
    .subtext { font-size:30px; opacity:.82; margin-top:.5em; font-weight:500; }
    .stage { position:relative; perspective:1600px; z-index:2; }
    .stage-scale { position:absolute; inset:0; transform-origin: top left; }
    .stage-inner { width: 100%; height: 100%; }
    ${DEVICE_CSS}
    ${textBlockStyle(0)}
    ${foldRigCss(0)}
    ${scenesCss}
  </style></head><body>${scenesHtml}
  <script>
    // Player API consumed by the Video tab's preview controls
    // (window.__videoPreview): play/pause the whole sequence, or jump to a
    // single scene and hold it. The scheduler timer and the CSS animations
    // are paused together so a pause freezes the frame exactly.
    const durations = ${durationsMs};
    let i = 0;
    let timer = null;
    let paused = false;
    let holding = false;

    function showScene(index) {
      document.querySelectorAll(".scene.playing").forEach((el) => el.classList.remove("playing"));
      void document.body.offsetWidth;
      const el = document.getElementById("scene-" + index);
      if (el) el.classList.add("playing");
    }
    function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
    function scheduleNext() {
      clearTimer();
      timer = setTimeout(() => { i = (i + 1) % durations.length; playNext(); }, durations[i] || 1000);
    }
    function playNext() {
      if (durations.length === 0) return;
      holding = false;
      showScene(i);
      scheduleNext();
    }
    function setAnimationsPaused(p) {
      document.getAnimations().forEach((a) => { try { p ? a.pause() : a.play(); } catch (e) {} });
    }

    window.__videoPreview = {
      sceneCount: durations.length,
      play() {
        paused = false;
        if (holding) { playNext(); } else { setAnimationsPaused(false); scheduleNext(); }
      },
      pause() { paused = true; clearTimer(); setAnimationsPaused(true); },
      isPaused() { return paused; },
      currentScene() { return i; },
      /** Jump to one scene and hold it (its own animation plays once). */
      goto(index) {
        clearTimer();
        holding = true;
        paused = false;
        i = Math.max(0, Math.min(index, durations.length - 1));
        showScene(i);
        return i;
      },
      next() { return this.goto(i + 1); },
      prev() { return this.goto(i - 1); },
    };

    playNext();
  </script>
  </body></html>`;
}

const FPS = 30;

/** Renders every scene deterministically via frame-stepped seek(), then
 *  encodes with FFmpeg in one call and muxes BGM if present. */
export async function renderVideo(project: VideoProject): Promise<string> {
  if (project.scenes.length === 0) throw new Error("No scenes configured -- pick a template first.");

  const outDir = path.join(videoDir(project.id), "video");
  const framesDir = path.join(outDir, "frames");
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  let frameIndex = 0;
  const resolveUri = (rel: string) => dataUri(videoFile(project.id, rel));

  try {
    const scenes = [...project.scenes].sort((a, b) => a.order - b.order);
    const page = await browser.newPage({ viewport: canvasFor(scenes[0] ?? ({} as VideoScene)) });
    for (const scene of scenes) {
      await page.setViewportSize(canvasFor(scene));
      const html = sceneHtml(scene, sourceUrisFor(project, scene, resolveUri), true);
      await page.setContent(html, { waitUntil: "load" });

      const totalFrames = Math.round(Math.max(1, scene.durationSeconds) * FPS);
      for (let f = 0; f < totalFrames; f++) {
        const ms = (f / FPS) * 1000;
        await page.evaluate((t) => (window as any).seek(t), ms);
        const framePath = path.join(framesDir, `frame_${String(frameIndex).padStart(6, "0")}.png`);
        await page.screenshot({ path: framePath, type: "png" });
        frameIndex++;
      }
    }
  } finally {
    await browser.close();
  }

  const rawVideoPath = path.join(outDir, "promo_raw.mp4");
  execSync(`ffmpeg -y -framerate ${FPS} -i "${framesDir}/frame_%06d.png" -c:v libx264 -pix_fmt yuv420p "${rawVideoPath}"`, { stdio: "ignore" });

  const finalVideoPath = path.join(outDir, "promo.mp4");
  if (project.bgm) {
    const bgmPath = videoFile(project.id, project.bgm);
    execSync(`ffmpeg -y -i "${rawVideoPath}" -i "${bgmPath}" -c:v copy -c:a aac -shortest "${finalVideoPath}"`, { stdio: "ignore" });
    fs.rmSync(rawVideoPath, { force: true });
  } else {
    fs.renameSync(rawVideoPath, finalVideoPath);
  }

  fs.rmSync(framesDir, { recursive: true, force: true });
  return finalVideoPath;
}

const CARD_THUMB_SIZE = { width: 520, height: 360 };

/** A landscape card thumbnail for the template grid -- the template's own
 *  fixed device, tilted in 3D (front + a hint of the side edge) against
 *  its first scene's backdrop, so the card communicates which device and
 *  visual style the template is built around before it's ever applied. */
function videoTemplateThumbHtml(template: VideoTemplate): string {
  const device = DEVICE_REGISTRY[template.device] ?? DEVICE_REGISTRY["phone"];
  const firstScene = template.scenes[0];
  const deviceScale = deviceScaleFor(device, CARD_THUMB_SIZE.height, template.variant, 0.82);

  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${CARD_THUMB_SIZE.width}px; height: ${CARD_THUMB_SIZE.height}px; overflow: hidden; }
  .card { position: relative; width: ${CARD_THUMB_SIZE.width}px; height: ${CARD_THUMB_SIZE.height}px; background: ${backgroundCss(firstScene?.background ?? "graphite")}; display: flex; align-items: center; justify-content: center; perspective: 1400px; overflow: hidden; }
  .vignette { position: absolute; inset: 0; background: radial-gradient(circle at 50% 40%, rgba(0,0,0,0) 40%, rgba(0,0,0,.4) 100%); }
  .rig { position: relative; transform: rotateY(-24deg) rotateX(4deg) scale(${deviceScale}); transform-style: preserve-3d; filter: drop-shadow(24px 30px 40px rgba(0,0,0,.45)); }
  ${DEVICE_CSS}
</style></head>
<body>
  <div class="card">
    <div class="vignette"></div>
    <div class="rig">${deviceMarkup(device, placeholderScreenUri(), template.variant)}</div>
  </div>
</body></html>`;
}

async function renderThumbSet(outDir: string, templates: VideoTemplate[]): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });
  const missing = templates.filter((t) => !fs.existsSync(path.join(outDir, `video-${t.id}.png`)));
  if (missing.length === 0) return;

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: CARD_THUMB_SIZE });
    for (const template of missing) {
      await page.setContent(videoTemplateThumbHtml(template), { waitUntil: "load" });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(outDir, `video-${template.id}.png`), type: "png" });
    }
  } finally {
    await browser.close();
  }
}

/** Renders every video template's card thumbnail once and caches it;
 *  existing files are left untouched (delete the file to force a re-render). */
export async function renderVideoTemplateThumbs(outDir: string, templates: VideoTemplate[] = VIDEO_TEMPLATES): Promise<void> {
  return renderThumbSet(outDir, templates);
}
