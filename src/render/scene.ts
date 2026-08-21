import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { BACKGROUNDS, DEVICE_CSS, backgroundCss, dataUri, deviceMarkup, deviceScaleFor, escapeHtml } from "./shared.js";
import { DEVICE_REGISTRY } from "../devices/registry.js";
import { sessionDir, sessionFile, type SceneConfig, type Session } from "../session/store.js";

/**
 * Step 4 — Animation Video. Scene templates are static workflow, dynamic
 * content: each template is a named CSS @keyframes shape; what varies per
 * scene is the screenshot, text, device, rotation/zoom/move amounts, and
 * duration. HTML/CSS/JS-animated only — never an AI video-generation
 * engine (PRD §4.7 / §10).
 *
 * The single-generator invariant: `sceneHtml()` is used for BOTH the live
 * preview (played natively by the browser) and the final render (stepped
 * deterministically via window.seek). See docs/ARCHITECTURE.md §6.1.
 */

export interface SceneTemplate {
  id: string;
  name: string;
  /** Builds the @keyframes body given the scene's rotate/zoom/move amounts. */
  keyframes: (scene: SceneConfig) => string;
}

export const SCENE_TEMPLATES: Record<string, SceneTemplate> = {
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

export function listSceneOptions() {
  return {
    templates: Object.values(SCENE_TEMPLATES).map((t) => ({ id: t.id, name: t.name })),
    backgrounds: Object.keys(BACKGROUNDS),
  };
}

export function defaultSceneConfig(screenId: string, platform: string, index: number): SceneConfig {
  return {
    id: `scene_${index + 1}`,
    screenId,
    template: index % 2 === 0 ? "hero-rise" : "tilt-3d",
    text: "",
    subtext: "",
    device: platform === "apple-app-store" ? "apple-iphone-15-pro" : "phone",
    background: "graphite",
    durationSeconds: 3,
    rotate: 20,
    zoom: 8,
    move: 40,
  };
}

const CANVAS = { width: 1080, height: 1920 };

/** The single generator used by both preview and render. `seekable`
 *  embeds the frame-stepping hook the renderer calls; the browser preview
 *  ignores it and just plays the CSS animation live. */
export function sceneHtml(scene: SceneConfig, screenshotUri: string, seekable = false): string {
  const template = SCENE_TEMPLATES[scene.template] ?? SCENE_TEMPLATES["hero-rise"];
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
  .stage-inner {
    transform: scale(${deviceScale});
    transform-origin: center;
    animation: play ${durationMs}ms ease-out forwards;
  }
  ${DEVICE_CSS}
  @keyframes play { ${template.keyframes(scene)} }
</style></head>
<body>
  <div class="canvas">
    ${scene.text ? `<div class="copy"><div class="label">${escapeHtml(scene.text)}</div>${scene.subtext ? `<div class="subtext">${escapeHtml(scene.subtext)}</div>` : ""}</div>` : ""}
    <div class="stage"><div class="stage-inner">${deviceMarkup(device, screenshotUri, scene.variant)}</div></div>
  </div>
  ${seekable ? `<script>window.seek = (ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; });</script>` : ""}
</body></html>`;
}

export function scenePreviewHtml(session: Session, sceneId: string): string {
  const scene = session.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error(`Scene '${sceneId}' not found in session ${session.id}`);
  const screen = session.raw.find((r) => r.id === scene.screenId);
  if (!screen) throw new Error(`Screen '${scene.screenId}' not found in session ${session.id}`);
  return sceneHtml(scene, dataUri(sessionFile(session.id, screen.file)), false);
}

const FPS = 30;

/** Renders every scene deterministically via frame-stepped seek(), then
 *  encodes with FFmpeg in one call and muxes BGM if present. */
export async function renderVideo(session: Session): Promise<string> {
  if (session.scenes.length === 0) throw new Error("No scenes configured — add at least one scene first.");

  const videoDir = path.join(sessionDir(session.id), "video");
  const framesDir = path.join(videoDir, "frames");
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  let frameIndex = 0;

  try {
    const page = await browser.newPage({ viewport: CANVAS });
    for (const scene of session.scenes) {
      const screen = session.raw.find((r) => r.id === scene.screenId);
      if (!screen) throw new Error(`Screen '${scene.screenId}' referenced by scene '${scene.id}' not found.`);
      const html = sceneHtml(scene, dataUri(sessionFile(session.id, screen.file)), true);
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

  const rawVideoPath = path.join(videoDir, "promo_raw.mp4");
  execSync(
    `ffmpeg -y -framerate ${FPS} -i "${framesDir}/frame_%06d.png" -c:v libx264 -pix_fmt yuv420p "${rawVideoPath}"`,
    { stdio: "ignore" },
  );

  const finalVideoPath = path.join(videoDir, "promo.mp4");
  if (session.bgm) {
    const bgmPath = sessionFile(session.id, session.bgm);
    execSync(
      `ffmpeg -y -i "${rawVideoPath}" -i "${bgmPath}" -c:v copy -c:a aac -shortest "${finalVideoPath}"`,
      { stdio: "ignore" },
    );
    fs.rmSync(rawVideoPath, { force: true });
  } else {
    fs.renameSync(rawVideoPath, finalVideoPath);
  }

  fs.rmSync(framesDir, { recursive: true, force: true });
  return finalVideoPath;
}
