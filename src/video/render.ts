import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { BACKGROUNDS, DEVICE_CSS, backgroundCss, dataUri, deviceMarkup, deviceScaleFor, escapeHtml } from "../render/shared.js";
import { DEVICE_REGISTRY } from "../devices/registry.js";
import { videoDir, videoFile, type VideoProject, type VideoScene } from "./project.js";

/**
 * Video tab renderer -- one scene per animation beat, independent of
 * Screen Capture and Studio Mockup (its own VideoProject/VideoScene,
 * own uploaded sources). HTML/CSS/JS animation only, never an AI video
 * engine (PRD requirement).
 *
 * The single-generator invariant: `sceneHtml()` backs both the live
 * preview (played natively by the browser) and the final render (stepped
 * deterministically via window.seek + document.getAnimations()).
 */

export interface SceneAnimation {
  id: string;
  name: string;
  keyframes: (scene: VideoScene) => string;
}

export const SCENE_ANIMATIONS: Record<string, SceneAnimation> = {
  "hero-rise": {
    id: "hero-rise",
    name: "Hero rise",
    keyframes: (s) => `
      0%   { transform: translateY(${120 + s.move}px) scale(${1 - s.zoom / 200}); opacity: 0; }
      25%  { opacity: 1; }
      100% { transform: translateY(0) scale(${1 + s.zoom / 100}); opacity: 1; }
    `,
  },
  "tilt-3d": {
    id: "tilt-3d",
    name: "3D tilt",
    keyframes: (s) => `
      0%   { transform: rotateY(${-35 - s.rotate}deg) translateY(${s.move}px) scale(${1 - s.zoom / 200}); }
      100% { transform: rotateY(${s.rotate}deg) translateY(0) scale(${1 + s.zoom / 100}); }
    `,
  },
  "zoom-focus": {
    id: "zoom-focus",
    name: "Zoom focus",
    keyframes: (s) => `
      0%   { transform: scale(${0.85 - s.zoom / 300}); opacity: 0; }
      20%  { opacity: 1; }
      100% { transform: scale(${1 + s.zoom / 100}); opacity: 1; }
    `,
  },
  "slide-pan": {
    id: "slide-pan",
    name: "Slide / pan",
    keyframes: (s) => `
      0%   { transform: translateX(${-200 - s.move}px) rotateZ(${-s.rotate / 2}deg); opacity: 0; }
      20%  { opacity: 1; }
      100% { transform: translateX(0) rotateZ(0deg) scale(${1 + s.zoom / 100}); opacity: 1; }
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

function sourceUriFor(project: VideoProject, scene: VideoScene, resolveUri: (rel: string) => string): string {
  const source = project.sources.find((s) => s.id === scene.sourceId) ?? project.sources[0];
  return source ? resolveUri(source.file) : "";
}

/** The single generator used by both preview and render. `seekable` embeds
 *  the frame-stepping hook the renderer calls; the browser preview ignores
 *  it and just plays the CSS animation live. */
export function sceneHtml(scene: VideoScene, screenshotUri: string, seekable = false): string {
  const animation = SCENE_ANIMATIONS[scene.sceneTemplate] ?? SCENE_ANIMATIONS["hero-rise"];
  const device = DEVICE_REGISTRY[scene.device] ?? DEVICE_REGISTRY["phone"];
  if (!device) throw new Error(`Device '${scene.device}' not found in registry`);
  const deviceScale = deviceScaleFor(device, CANVAS.height, scene.variant, 0.58);
  const durationMs = Math.max(1, scene.durationSeconds) * 1000;

  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${CANVAS.width}px; height: ${CANVAS.height}px; overflow: hidden; }
  .canvas {
    position: relative; width: ${CANVAS.width}px; height: ${CANVAS.height}px;
    background: ${backgroundCss(scene.background)};
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: "Segoe UI", Roboto, -apple-system, sans-serif; color: #fff; overflow: hidden;
  }
  .copy { text-align: center; padding: 0 8%; margin-bottom: 4%; }
  .label { font-size: 58px; font-weight: 800; line-height: 1.15; }
  .subtext { font-size: 30px; opacity: .82; margin-top: .5em; font-weight: 500; }
  .stage { perspective: 1600px; }
  .stage-inner { transform: scale(${deviceScale}); transform-origin: center; animation: play ${durationMs}ms ease-out forwards; }
  ${DEVICE_CSS}
  @keyframes play { ${animation.keyframes(scene)} }
</style></head>
<body>
  <div class="canvas">
    ${scene.text ? `<div class="copy"><div class="label">${escapeHtml(scene.text)}</div>${scene.subtext ? `<div class="subtext">${escapeHtml(scene.subtext)}</div>` : ""}</div>` : ""}
    <div class="stage"><div class="stage-inner">${deviceMarkup(device, screenshotUri, scene.variant)}</div></div>
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
  return sceneHtml(scene, sourceUriFor(project, scene, previewResolveUri(project.id)), false);
}

/** Concatenated full-template preview: every scene of the project plays
 *  back to back automatically, so opening this page is one continuous
 *  ~60s playthrough with no interaction needed. Each scene is its own
 *  absolutely-positioned layer with its own named @keyframes (no name
 *  collisions across scenes); a small script shows exactly one scene at a
 *  time and (re)starts its CSS animation by toggling a class, timed via
 *  setTimeout against each scene's own duration -- plain JS scheduling,
 *  not an AI video engine. */
export function templatePreviewHtml(project: VideoProject): string {
  const resolveUri = previewResolveUri(project.id);
  const scenes = [...project.scenes].sort((a, b) => a.order - b.order);

  const scenesCss = scenes
    .map((scene, i) => {
      const animation = SCENE_ANIMATIONS[scene.sceneTemplate] ?? SCENE_ANIMATIONS["hero-rise"];
      const durationMs = Math.max(1, scene.durationSeconds) * 1000;
      return `
        .scene-${i} { background:${backgroundCss(scene.background)}; }
        .scene-${i}.playing .stage-inner { animation: play-${i} ${durationMs}ms ease-out forwards; }
        @keyframes play-${i} { ${animation.keyframes(scene)} }
      `;
    })
    .join("\n");

  const scenesHtml = scenes
    .map((scene, i) => {
      const device = DEVICE_REGISTRY[scene.device] ?? DEVICE_REGISTRY["phone"];
      const deviceScale = deviceScaleFor(device, CANVAS.height, scene.variant, 0.58);
      const uri = sourceUriFor(project, scene, resolveUri);
      return `<div class="scene scene-${i}" id="scene-${i}">
        ${scene.text ? `<div class="copy"><div class="label">${escapeHtml(scene.text)}</div>${scene.subtext ? `<div class="subtext">${escapeHtml(scene.subtext)}</div>` : ""}</div>` : ""}
        <div class="stage"><div class="stage-inner" style="transform:scale(${deviceScale})">${deviceMarkup(device, uri, scene.variant)}</div></div>
      </div>`;
    })
    .join("\n");

  const durationsMs = JSON.stringify(scenes.map((s) => Math.max(1, s.durationSeconds) * 1000));

  return `<!doctype html><html><head><meta charset="utf-8" /><style>
    * { box-sizing: border-box; }
    html, body { margin:0; width:${CANVAS.width}px; height:${CANVAS.height}px; overflow:hidden; font-family:"Segoe UI",Roboto,-apple-system,sans-serif; color:#fff; }
    .scene { position:absolute; inset:0; width:${CANVAS.width}px; height:${CANVAS.height}px; display:none; flex-direction:column; align-items:center; justify-content:center; }
    .scene.playing { display:flex; }
    .copy { text-align:center; padding:0 8%; margin-bottom:4%; }
    .label { font-size:58px; font-weight:800; line-height:1.15; }
    .subtext { font-size:30px; opacity:.82; margin-top:.5em; font-weight:500; }
    .stage { perspective:1600px; }
    ${DEVICE_CSS}
    ${scenesCss}
  </style></head><body>${scenesHtml}
  <script>
    const durations = ${durationsMs};
    let i = 0;
    function playNext() {
      document.querySelectorAll(".scene.playing").forEach((el) => el.classList.remove("playing"));
      if (durations.length === 0) return;
      const el = document.getElementById("scene-" + i);
      if (el) el.classList.add("playing");
      setTimeout(() => { i = (i + 1) % durations.length; playNext(); }, durations[i] || 1000);
    }
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
    const page = await browser.newPage({ viewport: CANVAS });
    const scenes = [...project.scenes].sort((a, b) => a.order - b.order);
    for (const scene of scenes) {
      const html = sceneHtml(scene, sourceUriFor(project, scene, resolveUri), true);
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
