import fs from "fs";
import path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import type { Browser } from "playwright";

const execFileAsync = promisify(execFile);
import { resolveTool } from "../toolchain/binaries.js";
import {
  BACKGROUNDS,
  DEVICE_CSS,
  backgroundCss,
  dataUri,
  decorationsMarkup,
  deviceMarkup,
  device3dMarkup,
  deviceScaleFor,
  escapeHtml,
  type DecorationLike,
} from "../render/shared.js";
import { DEVICE_REGISTRY, resolveGeometry, frameSvgFor, type DeviceModel } from "../devices/registry.js";
import { videoDir, videoFile, type VideoProject, type VideoScene } from "./project.js";
import { projectFile } from "../project/projectStore.js";
import { VIDEO_TEMPLATES, type VideoTemplate } from "./templates.js";
import { templateHtmlPath, templateConfig } from "./templateConfig.js";
import { placeholderScreenUri } from "./placeholder.js";
import { resolveSlots, resolveImageSequences, slotSpecsForScene } from "./slots.js";
import { installThreeJsRoutes, THREE_BRIDGE_SCRIPT } from "../render/three-bridge.js";
import { resolveDemoAsset } from "./demoAssets.js";
import { BGM_PRESETS, renderBgmWav } from "./bgm.js";
export { EXPORT_PRESETS, type ExportPreset } from "./exportPresets.js";

export class RenderCancelled extends Error {
  constructor(message = "Render cancelled by user") {
    super(message);
    this.name = "RenderCancelled";
  }
}

export interface RenderOptions {
  format?: "mp4" | "webm";
  resolution?: "native" | "1080" | "720" | "480" | { width: number; height: number };
  orientation?: "native" | "landscape" | "portrait" | "square";
  fps?: 24 | 30 | 60;
  quality?: "high" | "standard" | "small";
  includeAudio?: boolean;
  audioVolume?: number;
  fileName?: string;
  saveTo?: string;
  sceneRange?: [number, number];
  signal?: AbortSignal;
}

export interface RenderProgress {
  phase: "preparing" | "frames" | "encoding" | "audio" | "done" | "cancelled" | "error";
  percent: number;
  message: string;
  frame?: number;
  totalFrames?: number;
  scene?: number;
  sceneCount?: number;
  fps?: number;
  etaSec?: number | null;
  accelerator?: string;
  encoder?: string;
  width?: number;
  height?: number;
}

export function cleanExportFileName(name?: string, ext = "mp4"): string {
  const base = (name || "promo")
    .replace(/\.[a-zA-Z0-9]+$/, "")
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "promo";
  const cleanExt = ext.replace(/^\./, "");
  return `${base}.${cleanExt}`;
}

export function clampEven(v: number): number {
  return Math.max(240, Math.min(3840, Math.floor(v / 2) * 2));
}

export function buildVfFilter(
  targetWidth: number,
  targetHeight: number,
  baseWidth: number,
  baseHeight: number,
  orientation?: string
): string {
  if (targetWidth !== baseWidth || targetHeight !== baseHeight || (orientation && orientation !== "native")) {
    return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`;
  }
  return "";
}

/**
 * Video tab renderer -- one scene per animation beat, independent of
 * Screen Capture and Studio Mockup (its own VideoProject/VideoScene,
 * own uploaded sources). HTML/CSS/JS animation only, never an AI video
 * engine (PRD requirement).
 *
 * The single-generator invariant: `sceneHtml()` backs both the live
 * preview (played natively by the browser) and the final render (stepped
 * deterministically via window.seek + document.getAnimations()).
 * `templatePreviewHtml()` reuses the exact same layout/animation CSS via
 * `sceneLayoutCss()` so a layout or depth change never needs two edits.
 *
 * Every scene renders THREE independently-animated layers -- device,
 * text, backdrop -- each with its own easing/delay, so a scene reads as
 * a small choreographed sequence rather than one element tweening.
 * `renderVideo` renders one scene per Playwright page (see below), so all
 * motion here is intra-scene: every scene owns its own entrance and exit
 * inside its own duration, never overlapping the next scene -- cross-scene
 * continuity is a `transition` overlay (see `transitionKeyframeBody`), not a
 * true cross-dissolve between two live pages.
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
   *  lets one animation (e.g. a foldable hinge sweep, or the 3D showcase
   *  entrance) render more than the plain depth-mode default. `uris`/`kinds`
   *  are the scene's full screen list (front-face cross-fade candidates),
   *  not just the first. Falls back to `deviceRigMarkup` (depth-aware). */
  renderDevice?: (device: DeviceModel, uris: string[], kinds: ("image" | "video")[], scene: VideoScene, durationMs: number) => string;
  /** Optional extra per-scene CSS beyond the standard device/backdrop/copy
   *  keyframes -- used by portrait-flow's screen-merge bezel fade-out. */
  extraCss?: (scene: VideoScene, selector: string, gateSelector: string, keyframeSuffix: string, durationMs: number) => string;
}

/** Every entrance/exit distance is expressed in terms of `move`/`zoom`/`rotate`
 *  but capped so the device settles back in frame instead of flying past the
 *  canvas edge -- an entrance may start from just outside, an exit only ever
 *  fades/settles in place, it never travels off-canvas. */
const MOVE_CAP = 70;
const cappedMove = (move: number) => Math.min(move, MOVE_CAP);

function defaultBackdrop(s: VideoScene): string {
  return `
    0%   { transform: scale(1) translate3d(0,0,0); }
    100% { transform: scale(${1 + Math.min(s.zoom, 30) / 250}) translate3d(${s.move / 60}%, -${s.move / 80}%, 0); }
  `;
}

export const SCENE_ANIMATIONS: Record<string, SceneAnimation> = {
  "hero-rise": {
    id: "hero-rise",
    name: "Hero rise",
    easing: "cubic-bezier(.16,1,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: translateY(${60 + cappedMove(s.move)}px) scale(${0.92 - s.zoom / 300}); opacity: 0; }
      14%  { opacity: 1; }
      55%  { transform: translateY(0) scale(${1 + s.zoom / 120}); opacity: 1; }
      88%  { transform: translateY(0) scale(${1 + s.zoom / 120}); opacity: 1; }
      100% { transform: translateY(0) scale(${1 + s.zoom / 130}); opacity: 1; }
    `,
  },
  "tilt-3d": {
    id: "tilt-3d",
    name: "3D tilt",
    easing: "cubic-bezier(.2,.85,.3,1)",
    deviceKeyframes: (s) => {
      const rot = Math.min(Math.max(s.rotate, 6), 18);
      return `
      0%   { transform: perspective(1800px) rotateY(${-18 - rot}deg) translateY(${cappedMove(s.move) * 0.25}px) scale(${0.92 - s.zoom / 300}); opacity: 0; }
      15%  { opacity: 1; }
      55%  { transform: perspective(1800px) rotateY(0deg) translateY(0) scale(${1 + s.zoom / 120}); opacity: 1; }
      100% { transform: perspective(1800px) rotateY(0deg) translateY(0) scale(${1 + s.zoom / 120}); opacity: 1; }
    `;
    },
    backdropKeyframes: (s) => `
      0%   { transform: scale(1.03) translate3d(1.5%,0,0); }
      100% { transform: scale(${1 + s.zoom / 260}) translate3d(-1.5%,0,0); }
    `,
  },
  "zoom-focus": {
    id: "zoom-focus",
    name: "Zoom focus",
    easing: "cubic-bezier(.25,.9,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: scale(${0.88 - s.zoom / 350}); opacity: 0; }
      16%  { opacity: 1; }
      60%  { transform: scale(${1 + s.zoom / 120}); opacity: 1; }
      100% { transform: scale(${1 + s.zoom / 110}); opacity: 1; }
    `,
  },
  "slide-pan": {
    id: "slide-pan",
    name: "Slide / pan",
    easing: "cubic-bezier(.22,.9,.28,1)",
    deviceKeyframes: (s) => `
      0%   { transform: translateX(${-1 * (70 + cappedMove(s.move))}px) rotateY(-8deg); opacity: 0; }
      15%  { opacity: 1; }
      58%  { transform: translateX(0) rotateY(0deg) scale(${1 + s.zoom / 120}); opacity: 1; }
      100% { transform: translateX(0) rotateY(0deg) scale(${1 + s.zoom / 120}); opacity: 1; }
    `,
    backdropKeyframes: (s) => `
      0%   { transform: scale(1.06) translate3d(-2%,0,0); }
      100% { transform: scale(1.06) translate3d(2%,0,0); }
    `,
  },
  "mask-reveal": {
    id: "mask-reveal",
    name: "Mask reveal",
    easing: "cubic-bezier(.3,.9,.25,1)",
    deviceKeyframes: (s) => `
      0%   { clip-path: inset(100% 0 0 0); transform: translateY(${15 + cappedMove(s.move) / 4}px) scale(${0.96 + s.zoom / 200}); opacity: 0; }
      12%  { opacity: 1; }
      48%  { clip-path: inset(0 0 0 0); transform: translateY(0) scale(${1 + s.zoom / 120}); opacity: 1; }
      100% { clip-path: inset(0 0 0 0); transform: translateY(0) scale(${1 + s.zoom / 120}); opacity: 1; }
    `,
  },
  "parallax-stack": {
    id: "parallax-stack",
    name: "Parallax stack",
    easing: "cubic-bezier(.18,.9,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: translateY(${35 + cappedMove(s.move) / 3}px) scale(${0.94 - s.zoom / 300}); opacity: 0; }
      14%  { opacity: 1; }
      50%  { transform: translateY(0) scale(${1 + s.zoom / 120}); opacity: 1; }
      100% { transform: translateY(0) scale(${1 + s.zoom / 120}); opacity: 1; }
    `,
    backdropKeyframes: (s) => `
      0%   { transform: scale(1.08) translate3d(0,2%,0); }
      100% { transform: scale(1.02) translate3d(0,-2%,0); }
    `,
  },
  "kinetic-type": {
    id: "kinetic-type",
    name: "Kinetic type",
    easing: "cubic-bezier(.22,1,.36,1)",
    deviceKeyframes: (s) => `
      0%   { transform: scale(${0.92 - s.zoom / 300}) translateY(${14 + cappedMove(s.move) / 5}px); opacity: 0; }
      18%  { opacity: 1; }
      55%  { transform: scale(${1 + s.zoom / 120}) translateY(0); opacity: 1; }
      100% { transform: scale(${1 + s.zoom / 110}) translateY(0); opacity: 1; }
    `,
  },
  "card-flip": {
    id: "card-flip",
    name: "Card flip",
    easing: "cubic-bezier(.3,.9,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: perspective(1600px) rotateY(65deg) scale(${0.92 - s.zoom / 300}); opacity: 0; }
      18%  { opacity: 1; }
      52%  { transform: perspective(1600px) rotateY(0deg) scale(${1 + s.zoom / 120}); opacity: 1; }
      100% { transform: perspective(1600px) rotateY(0deg) scale(${1 + s.zoom / 120}); opacity: 1; }
    `,
  },
  "outro-cta": {
    id: "outro-cta",
    name: "Outro CTA",
    easing: "cubic-bezier(.2,.9,.25,1.05)",
    deviceKeyframes: (s) => `
      0%   { transform: scale(${0.9 - s.zoom / 300}) translateY(${15 + cappedMove(s.move) / 6}px); opacity: 0; }
      18%  { opacity: 1; }
      50%  { transform: scale(${1 + s.zoom / 120}) translateY(0); opacity: 1; }
      100% { transform: scale(${1 + s.zoom / 120}) translateY(0); opacity: 1; }
    `,
    backdropKeyframes: () => `
      0%   { transform: scale(1); filter: brightness(1); }
      50%  { transform: scale(1.04); filter: brightness(1.08); }
      100% { transform: scale(1.02); filter: brightness(1.04); }
    `,
  },
  "portrait-flow": {
    id: "portrait-flow",
    name: "Portrait flow (zoom-into-screen)",
    easing: "cubic-bezier(.2,.85,.25,1)",
    // 3D physical phone enters with a full 360-degree rotation (back-to-front),
    // settles at center, then gradually scales up so the screen fits the canvas exactly without overshooting
    deviceKeyframes: (s) => {
      const targetScale = (1 / (s.deviceFraction ?? 0.6)).toFixed(3);
      return `
        0%   { transform: perspective(2000px) rotateY(-360deg) scale(0.85); opacity: 0; }
        10%  { opacity: 1; }
        36%  { transform: perspective(2000px) rotateY(0deg) scale(1); opacity: 1; }
        46%  { transform: perspective(2000px) rotateY(0deg) scale(1); opacity: 1; }
        72%  { transform: perspective(2000px) rotateY(0deg) scale(${targetScale}); opacity: 1; }
        100% { transform: perspective(2000px) rotateY(0deg) scale(${targetScale}); opacity: 1; }
      `;
    },
    backdropKeyframes: () => `
      0%   { transform: scale(1.05); filter: brightness(1); }
      50%  { transform: scale(1.15); filter: brightness(0.85); }
      100% { transform: scale(1.2); filter: brightness(0.7); }
    `,
    renderDevice: (device, uris, kinds, scene, durationMs) => device3dMarkup(device, uris, scene.variant, durationMs, kinds),
    // The bezel/back/sides/reflection fade out as the rig scales past frame,
    // so only the screen content remains -- a genuine merge with the canvas
    // rather than just a big scaled-up phone with a darkened backdrop.
    extraCss: (_scene, selector, gateSelector, keyframeSuffix, durationMs) => `
      ${gateSelector} .device-frame, ${gateSelector} .device-back, ${gateSelector} .device-side, ${gateSelector} .device-sheen, ${gateSelector} .device-reflection {
        animation: bezelFade${keyframeSuffix} ${durationMs}ms ease-in forwards;
      }
      @keyframes bezelFade${keyframeSuffix} {
        0%   { opacity: 1; }
        72%  { opacity: 1; }
        92%  { opacity: 0; }
        100% { opacity: 0; }
      }
    `,
  },
  "landscape-flow": {
    id: "landscape-flow",
    name: "Landscape flow (screen recording showcase)",
    easing: "cubic-bezier(.2,.85,.25,1)",
    // Phone enters centrally with a 360-degree 3D spin, then scales up to match vertical frame height.
    // Alternating subtitle labels display on left & right.
    deviceKeyframes: (s) => {
      const targetScale = (1 / (s.deviceFraction ?? 0.6)).toFixed(3);
      return `
        0%   { transform: perspective(2000px) rotateY(-360deg) scale(0.85); opacity: 0; }
        10%  { opacity: 1; }
        32%  { transform: perspective(2000px) rotateY(0deg) scale(1); opacity: 1; }
        40%  { transform: perspective(2000px) rotateY(0deg) scale(1); opacity: 1; }
        60%  { transform: perspective(2000px) rotateY(0deg) scale(${targetScale}); opacity: 1; }
        100% { transform: perspective(2000px) rotateY(0deg) scale(${targetScale}); opacity: 1; }
      `;
    },
    backdropKeyframes: () => `
      0%   { transform: scale(1.04); filter: brightness(0.95); }
      50%  { transform: scale(1.08); filter: brightness(1.02); }
      100% { transform: scale(1.12); filter: brightness(1); }
    `,
    renderDevice: (device, uris, kinds, scene, durationMs) => device3dMarkup(device, uris, scene.variant, durationMs, kinds),
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
    renderDevice: (device, uris, kinds, scene) => {
      const foldedMarkup = deviceMarkup(device, uris[0] ?? "", "folded", kinds[0] ?? "image");
      const unfoldedMarkup = deviceMarkup(device, uris[0] ?? "", "unfolded", kinds[0] ?? "image");
      const foldedG = resolveGeometry(device, "folded");
      const unfoldedG = resolveGeometry(device, "unfolded");
      const areaRatio = (unfoldedG.width * unfoldedG.height) / (foldedG.width * foldedG.height);
      const foldedScale = Math.min(2.6, Math.max(1, Math.sqrt(areaRatio) * 0.62));
      return `<div class="fold-rig">
        <div class="fold-layer fold-folded" style="transform:scale(${foldedScale.toFixed(2)})">${foldedMarkup}</div>
        <div class="fold-layer fold-unfolded">${unfoldedMarkup}</div>
      </div>`;
    },
  },
  "tablet-pan": {
    id: "tablet-pan",
    name: "Tablet pan",
    easing: "cubic-bezier(.24,.85,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: translateX(${-1 * (40 + cappedMove(s.move) / 2)}px) rotateY(${-6 - s.rotate / 4}deg) scale(${0.95 - s.zoom / 300}); opacity: 0; }
      18%  { opacity: 1; }
      62%  { transform: translateX(0) rotateY(${s.rotate / 8}deg) scale(${1 + s.zoom / 120}); opacity: 1; }
      100% { transform: translateX(0) rotateY(0deg) scale(${1 + s.zoom / 120}); opacity: 1; }
    `,
    backdropKeyframes: (s) => `
      0%   { transform: scale(1.04) translate3d(-1.5%,0,0); }
      100% { transform: scale(${1 + s.zoom / 260}) translate3d(1.5%,0,0); }
    `,
  },
  "showcase-3d": {
    id: "showcase-3d",
    name: "3D showcase",
    easing: "cubic-bezier(.19,.85,.24,1.02)",
    deviceKeyframes: (s) => `
      0%   { transform: perspective(2000px) rotateY(-95deg) rotateX(4deg) translateZ(-40px) scale(${0.85 - s.zoom / 320}); opacity: 0; }
      12%  { opacity: 1; }
      55%  { transform: perspective(2000px) rotateY(0deg) rotateX(0deg) translateZ(0) scale(${1 + s.zoom / 110}); opacity: 1; }
      100% { transform: perspective(2000px) rotateY(0deg) rotateX(0deg) translateZ(0) scale(${1 + s.zoom / 110}); opacity: 1; }
    `,
    backdropKeyframes: () => `
      0%   { transform: scale(1.1); filter: brightness(.88); }
      45%  { transform: scale(1.04); filter: brightness(1.04); }
      100% { transform: scale(1); filter: brightness(1.08); }
    `,
    renderDevice: (device, uris, kinds, scene, durationMs) => device3dMarkup(device, uris, scene.variant, durationMs, kinds),
  },
  "trio-lineup": {
    id: "trio-lineup",
    name: "Trio lineup",
    easing: "cubic-bezier(.22,.9,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: translateY(${30 + cappedMove(s.move) / 2}px) scale(${0.92 - s.zoom / 300}); opacity: 0; }
      16%  { opacity: 1; }
      55%  { transform: translateY(0) scale(${1 + s.zoom / 110}); opacity: 1; }
      100% { transform: translateY(0) scale(${1 + s.zoom / 100}); opacity: 1; }
    `,
    renderDevice: (device, uris, kinds, scene) => {
      const centerUri = uris[0] ?? "";
      const leftUri = uris[1] ?? uris[0] ?? "";
      const rightUri = uris[2] ?? uris[0] ?? "";
      const flank = (uri: string, kind: "image" | "video", tx: string, rot: string) => `
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; transform:translateX(${tx}) translateZ(-140px) rotateY(${rot}) scale(.8); opacity:.7; filter:brightness(.72);">
          ${deviceMarkup(device, uri, scene.variant, kind)}
        </div>`;
      return `<div style="position:relative; width:100%; height:100%;">
        ${flank(leftUri, kinds[1] ?? "image", "-56%", "26deg")}
        ${flank(rightUri, kinds[2] ?? "image", "56%", "-26deg")}
        <div style="position:relative; z-index:2;">${deviceMarkup(device, centerUri, scene.variant, kinds[0] ?? "image")}</div>
      </div>`;
    },
  },
  "hud-blueprint-rise": {
    id: "hud-blueprint-rise",
    name: "HUD blueprint rise",
    easing: "cubic-bezier(.16,1,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: perspective(1500px) rotateY(15deg) translateY(${120 + cappedMove(s.move)}px) scale(${0.88 - s.zoom / 300}); opacity: 0; }
      15%  { opacity: 1; }
      55%  { transform: perspective(1500px) rotateY(0deg) translateY(0) scale(${1 + s.zoom / 120}); opacity: 1; }
      100% { transform: perspective(1500px) rotateY(0deg) translateY(0) scale(${1 + s.zoom / 135}); opacity: 1; }
    `,
    backdropKeyframes: (s) => `
      0%   { transform: scale(1.05); filter: opacity(0.8); }
      100% { transform: scale(${1.05 + s.zoom / 280}) translate3d(${s.move / 80}%, 0, 0); filter: opacity(1); }
    `,
    renderDevice: (device, uris, kinds, scene, durationMs) => {
      // Add custom SVG blueprint overlay inside the device wrapper
      const dev = deviceMarkup(device, uris[0] ?? "", scene.variant, kinds[0] ?? "image");
      return `<div style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
        <div style="position:absolute; inset:-10%; z-index:1; pointer-events:none; border: 1px solid rgba(0,198,184,.15); clip-path: polygon(0 0, 100% 0, 90% 100%, 10% 100%);"></div>
        ${dev}
      </div>`;
    }
  },
  "neon-rings-orbit": {
    id: "neon-rings-orbit",
    name: "Neon rings orbit",
    easing: "cubic-bezier(.2,.85,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: perspective(1800px) rotateY(${-25 - s.rotate}deg) rotateX(15deg) scale(0.85); opacity: 0; }
      18%  { opacity: 1; }
      60%  { transform: perspective(1800px) rotateY(${s.rotate * 0.3}deg) rotateX(0deg) scale(${1 + s.zoom / 120}); opacity: 1; }
      100% { transform: perspective(1800px) rotateY(0deg) rotateX(0deg) scale(${1 + s.zoom / 130}); opacity: 1; }
    `,
    backdropKeyframes: () => `
      0%   { transform: rotate(0deg) scale(1); }
      100% { transform: rotate(15deg) scale(1.1); }
    `,
    renderDevice: (device, uris, kinds, scene, durationMs) => {
      const dev = deviceMarkup(device, uris[0] ?? "", scene.variant, kinds[0] ?? "image");
      return `<div style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
        <!-- Concentric neon crimson rings background -->
        <div style="position:absolute; width:480px; height:480px; border-radius:50%; border:2px dashed rgba(232,23,93,.35); animation: spinRing 25s linear infinite;"></div>
        <div style="position:absolute; width:640px; height:640px; border-radius:50%; border:1px solid rgba(232,23,93,.15); animation: spinRingRev 40s linear infinite;"></div>
        ${dev}
        <style>
          @keyframes spinRing { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes spinRingRev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        </style>
      </div>`;
    }
  },
  "studio-orbit-scroll": {
    id: "studio-orbit-scroll",
    name: "Studio orbit scroll",
    easing: "cubic-bezier(.25,1,.2,1)",
    deviceKeyframes: (s) => `
      0%   { transform: perspective(1600px) rotateY(${s.rotate}deg) rotateX(2deg) scale(0.92); opacity: 0; }
      12%  { opacity: 1; }
      50%  { transform: perspective(1600px) rotateY(${s.rotate * 0.2}deg) rotateX(0deg) scale(1.02); opacity: 1; }
      100% { transform: perspective(1600px) rotateY(0deg) rotateX(0deg) scale(1); opacity: 1; }
    `,
    backdropKeyframes: () => `
      0%   { filter: brightness(0.8) contrast(1.1); }
      100% { filter: brightness(1) contrast(1); }
    `,
    renderDevice: (device, uris, kinds, scene, durationMs) => {
      // Auto-scrolling screen overlay in screen styles
      const g = resolveGeometry(device, scene.variant);
      const r = g.cornerRadius ?? 0;
      const screenStyle = `top:${g.screenInset.top - 1}px;left:${g.screenInset.left - 1}px;width:${g.screenInset.width + 2}px;height:${g.screenInset.height + 2}px;border-radius:${r}px;clip-path:inset(0 round ${r}px);object-fit:cover;object-position:top center;animation: screenScroll ${durationMs}ms cubic-bezier(.1,.9,.2,1) forwards;`;
      
      const media = kinds[0] === "video" 
        ? `<video class="device-screen" src="${uris[0]}" style="${screenStyle}" autoplay muted loop playsinline></video>`
        : `<img class="device-screen" src="${uris[0]}" style="${screenStyle}" />`;

      return `<div class="device" style="width:${g.width}px;height:${g.height}px">
        ${media}
        <div class="device-frame">${frameSvgFor(device, scene.variant)}</div>
        <style>
          @keyframes screenScroll {
            0% { object-position: top center; }
            100% { object-position: bottom center; }
          }
        </style>
      </div>`;
    }
  },
  "matte-spheres-drift": {
    id: "matte-spheres-drift",
    name: "Matte spheres drift",
    easing: "cubic-bezier(.22,1,.36,1)",
    deviceKeyframes: (s) => `
      0%   { transform: perspective(1800px) rotateY(${-15 - s.rotate}deg) rotateZ(5deg) scale(0.9); opacity: 0; }
      15%  { opacity: 1; }
      60%  { transform: perspective(1800px) rotateY(0deg) rotateZ(0deg) scale(${1 + s.zoom / 110}); opacity: 1; }
      100% { transform: perspective(1800px) rotateY(0deg) rotateZ(0deg) scale(${1 + s.zoom / 115}); opacity: 1; }
    `,
    renderDevice: (device, uris, kinds, scene, durationMs) => {
      const dev = deviceMarkup(device, uris[0] ?? "", scene.variant, kinds[0] ?? "image");
      return `<div style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
        <!-- Matte Spheres Background elements -->
        <div style="position:absolute; left:12%; top:25%; width:100px; height:100px; border-radius:50%; background:radial-gradient(circle at 35% 35%, #333, #0a0a0c 75%); filter: blur(1px); animation: driftOne 8s ease-in-out infinite alternate;"></div>
        <div style="position:absolute; right:15%; bottom:20%; width:140px; height:140px; border-radius:50%; background:radial-gradient(circle at 35% 35%, #222, #050507 75%); filter: blur(2px); animation: driftTwo 10s ease-in-out infinite alternate;"></div>
        <!-- Cyber Neon Cyan borders overlay -->
        <div style="position:absolute; width:460px; height:820px; border:2px solid rgba(0,240,255,.12); border-radius:32px; pointer-events:none;">
          <div style="position:absolute; top:-2px; left:-2px; width:40px; height:40px; border-top:3px solid #00f0ff; border-left:3px solid #00f0ff; border-radius:6px 0 0 0;"></div>
          <div style="position:absolute; bottom:-2px; right:-2px; width:40px; height:40px; border-bottom:3px solid #00f0ff; border-right:3px solid #00f0ff; border-radius:0 0 6px 0;"></div>
        </div>
        ${dev}
        <style>
          @keyframes driftOne { 0% { transform: translateY(0px) scale(1); } 100% { transform: translateY(-20px) scale(1.05); } }
          @keyframes driftTwo { 0% { transform: translateY(0px) scale(1); } 100% { transform: translateY(25px) scale(0.98); } }
        </style>
      </div>`;
    }
  },
  "split-panorama-track": {
    id: "split-panorama-track",
    name: "Split panorama track",
    easing: "cubic-bezier(.25,1,.2,1)",
    deviceKeyframes: (s) => `
      0%   { transform: translateX(${-80 - cappedMove(s.move)}px) scale(0.92); opacity: 0; }
      16%  { opacity: 1; }
      60%  { transform: translateX(0) scale(1); opacity: 1; }
      100% { transform: translateX(0) scale(1); opacity: 1; }
    `,
    renderDevice: (device, uris, kinds, scene, durationMs) => {
      const dev = deviceMarkup(device, uris[0] ?? "", scene.variant, kinds[0] ?? "image");
      return `<div style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
        <!-- Dashed Curved connection path -->
        <svg style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:0;" viewBox="0 0 1920 1080">
          <path d="M 200,540 C 600,340 1320,740 1720,540" fill="none" stroke="#0088ff" stroke-width="3" stroke-dasharray="10 10" />
        </svg>
        <div style="position:relative; z-index:1;">${dev}</div>
      </div>`;
    }
  },
  "trio-fan-gloss": {
    id: "trio-fan-gloss",
    name: "Trio fan gloss",
    easing: "cubic-bezier(.16,1,.3,1)",
    deviceKeyframes: (s) => `
      0%   { transform: translateY(${40 + cappedMove(s.move) / 2}px) scale(0.9); opacity: 0; }
      15%  { opacity: 1; }
      55%  { transform: translateY(0) scale(1); opacity: 1; }
      100% { transform: translateY(0) scale(1); opacity: 1; }
    `,
    renderDevice: (device, uris, kinds, scene) => {
      const centerUri = uris[0] ?? "";
      const leftUri = uris[1] ?? uris[0] ?? "";
      const rightUri = uris[2] ?? uris[0] ?? "";
      const flank = (uri: string, kind: "image" | "video", tx: string, rot: string, isLeft: boolean) => `
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; transform:translateX(${tx}) translateZ(-160px) rotateY(${rot}) scale(.82); opacity:.8; filter:brightness(.75);">
          ${deviceMarkup(device, uri, scene.variant, kind)}
        </div>`;
      return `<div style="position:relative; width:100%; height:100%;">
        ${flank(leftUri, kinds[1] ?? "image", "-45%", "22deg", true)}
        ${flank(rightUri, kinds[2] ?? "image", "45%", "-22deg", false)}
        <div style="position:relative; z-index:2; filter: drop-shadow(0 25px 50px rgba(0,0,0,0.55));">${deviceMarkup(device, centerUri, scene.variant, kinds[0] ?? "image")}</div>
        <!-- Bottom Floor Gloss reflection shadow -->
        <div style="position:absolute; bottom:0; left:50%; transform:translateX(-50%); width:80%; height:80px; background:radial-gradient(ellipse at center, rgba(140,122,230,0.2) 0%, transparent 70%); filter:blur(15px); pointer-events:none; z-index:1;"></div>
      </div>`;
    },
  },
  "studio-opener": {
    id: "studio-opener",
    name: "Studio opener",
    easing: "cubic-bezier(.16,1,.3,1)",
    deviceKeyframes: (s) => `0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); }`,
  },
  "studio-phone": {
    id: "studio-phone",
    name: "Studio phone",
    easing: "cubic-bezier(.16,1,.3,1)",
    deviceKeyframes: (s) => `0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); }`,
  },
  "studio-outro": {
    id: "studio-outro",
    name: "Studio outro",
    easing: "cubic-bezier(.16,1,.3,1)",
    deviceKeyframes: (s) => `0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); }`,
  },
  "studio-macro": {
    id: "studio-macro",
    name: "Studio macro",
    easing: "cubic-bezier(.16,1,.3,1)",
    deviceKeyframes: (s) => `0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); }`,
  },
  "studio-transition": {
    id: "studio-transition",
    name: "Studio transition",
    easing: "cubic-bezier(.16,1,.3,1)",
    deviceKeyframes: (s) => `0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); }`,
  },
  "studio-landscape": {
    id: "studio-landscape",
    name: "Studio landscape",
    easing: "cubic-bezier(.16,1,.3,1)",
    deviceKeyframes: (s) => `0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); }`,
  },
  "studio-split": {
    id: "studio-split",
    name: "Studio split",
    easing: "cubic-bezier(.16,1,.3,1)",
    deviceKeyframes: (s) => `0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); }`,
  },
};

export function listSceneAnimations() {
  return Object.values(SCENE_ANIMATIONS).map((a) => ({ id: a.id, name: a.name }));
}
export function listVideoBackgrounds() {
  return Object.keys(BACKGROUNDS);
}

/**
 * Composition registry -- which side the device sits on, how the copy block
 * is sized/aligned, and any extra canvas treatment (split panel, edge
 * offset, full-bleed overlay).
 */
export interface SceneLayout {
  id: string;
  name: string;
  orientation: "9:16" | "16:9" | "both";
  direction: "row" | "row-reverse" | "column" | "column-reverse";
  copyAlign: "left" | "center" | "right";
  copyFlex: string;
  copyMaxWidth?: string;
  overlay?: "lower-third";
  canvasClass?: "edge-left" | "edge-right" | "panel-split";
}

export const LAYOUTS: Record<string, SceneLayout> = {
  "copy-left": { id: "copy-left", name: "Copy left, device right", orientation: "16:9", direction: "row", copyAlign: "left", copyFlex: "1 1 44%", copyMaxWidth: "640px" },
  "copy-right": { id: "copy-right", name: "Copy right, device left", orientation: "16:9", direction: "row-reverse", copyAlign: "left", copyFlex: "1 1 44%", copyMaxWidth: "640px" },
  "hero-device": { id: "hero-device", name: "Hero device, minimal copy", orientation: "16:9", direction: "row", copyAlign: "left", copyFlex: "0 0 26%", copyMaxWidth: "420px" },
  "centre-flank": { id: "centre-flank", name: "Centred device", orientation: "16:9", direction: "column", copyAlign: "center", copyFlex: "0 0 auto", copyMaxWidth: "900px" },
  "split-panel": { id: "split-panel", name: "Split panel", orientation: "16:9", direction: "row-reverse", copyAlign: "left", copyFlex: "1 1 40%", copyMaxWidth: "600px", canvasClass: "panel-split" },

  "stacked-top": { id: "stacked-top", name: "Copy above device (centered)", orientation: "9:16", direction: "column", copyAlign: "center", copyFlex: "0 0 auto" },
  "stacked-bottom": { id: "stacked-bottom", name: "Copy below device (centered)", orientation: "9:16", direction: "column-reverse", copyAlign: "center", copyFlex: "0 0 auto" },
  "edge-offset-left": { id: "edge-offset-left", name: "Device slight left", orientation: "9:16", direction: "column", copyAlign: "left", copyFlex: "0 0 auto", canvasClass: "edge-left" },
  "edge-offset-right": { id: "edge-offset-right", name: "Device slight right", orientation: "9:16", direction: "column", copyAlign: "right", copyFlex: "0 0 auto", canvasClass: "edge-right" },

  "full-bleed": { id: "full-bleed", name: "Full-bleed device, overlay caption", orientation: "both", direction: "column", copyAlign: "center", copyFlex: "0 0 auto", overlay: "lower-third" },
};

export function listSceneLayouts(orientation?: "9:16" | "16:9") {
  return Object.values(LAYOUTS)
    .filter((l) => !orientation || l.orientation === "both" || l.orientation === orientation)
    .map((l) => ({ id: l.id, name: l.name, orientation: l.orientation }));
}

function orientationOf(scene: VideoScene): "9:16" | "16:9" {
  return scene.aspectRatio === "16:9" ? "16:9" : "9:16";
}

function layoutFor(scene: VideoScene): SceneLayout {
  const orientation = orientationOf(scene);
  const requested = scene.layout ? LAYOUTS[scene.layout] : undefined;
  if (requested && (requested.orientation === "both" || requested.orientation === orientation)) return requested;
  return LAYOUTS[orientation === "16:9" ? "copy-left" : "stacked-top"];
}

/** Safe-margin inset (percent) applied to every canvas -- titles, badges,
 *  callouts and the device itself never reach the frame edge. */
const SAFE_INSET = { x: 6, y: 5 };

const CANVAS = { width: 1080, height: 1920 };
const CANVAS_LANDSCAPE = { width: 1920, height: 1080 };

/** A scene's canvas is landscape only when its template opted in; every
 *  scene without an explicit aspectRatio keeps the app-store-standard 9:16
 *  portrait canvas. */
function canvasFor(scene: VideoScene): { width: number; height: number } {
  return scene.aspectRatio === "16:9" ? CANVAS_LANDSCAPE : CANVAS;
}

function sourceUriFor(project: VideoProject, scene: VideoScene, resolveUri: (rel: string) => string, allowDemo: boolean): string {
  const source = project.sources.find((s) => s.id === scene.sourceId) ?? project.sources[0];
  if (source) return resolveUri(source.file);
  const demo = allowDemo ? resolveDemoAsset(scene.sourceId) : undefined;
  return demo ? dataUri(demo.absPath) : "";
}

/** Ordered screenshot URIs for a scene -- `screenIds` (2+) drives an
 *  in-device screen swap; otherwise falls back to the single `sourceId`.
 *  When a multi-screen scene has no real source uploaded yet (e.g.
 *  previewing a template before applying it), each slot still gets its own
 *  distinct placeholder (or the shared global demo photo) so the swap is
 *  visible ahead of real screenshots. `allowDemo` gates the demo-photo
 *  fallback -- it is only ever off for the actual `renderVideo()` export, so
 *  demo/template-preview assets never end up baked into a real rendered
 *  video, only the interactive editor preview. */
export function sourceUrisFor(project: VideoProject, scene: VideoScene, resolveUri: (rel: string) => string, allowDemo = true): string[] {
  const slotShot = scene.slotValues?.screenshot?.kind === "image" ? scene.slotValues.screenshot.sourceId : undefined;
  const slotShots = scene.slotValues?.screenshots?.kind === "imageList" ? scene.slotValues.screenshots.sourceIds : undefined;
  const screenIds = (slotShots && slotShots.length > 1) ? slotShots : scene.screenIds;
  const effectiveSourceId = slotShot || scene.sourceId;

  if (screenIds && screenIds.length > 1) {
    return screenIds.map((id, i) => {
      const source = project.sources.find((s) => s.id === id);
      if (source) return resolveUri(source.file);
      const demo = allowDemo ? resolveDemoAsset(id) : undefined;
      return demo ? dataUri(demo.absPath) : placeholderScreenUri(i);
    });
  }
  const source = project.sources.find((s) => s.id === effectiveSourceId) ?? (effectiveSourceId ? null : project.sources[0]);
  if (source) return [resolveUri(source.file)];
  const demo = allowDemo ? resolveDemoAsset(effectiveSourceId) : undefined;
  return demo ? [dataUri(demo.absPath)] : [];
}

/** Parallel to `sourceUrisFor` -- which of those URIs is a real screen
 *  recording ("video") vs a still screenshot ("image"), so the render path
 *  can pick `<video>`/`<img>` per slot and window.seek can frame-step it. */
export function sourceKindsFor(project: VideoProject, scene: VideoScene): ("image" | "video")[] {
  if (scene.screenIds && scene.screenIds.length > 1) {
    return scene.screenIds.map((id) => (project.sources.find((s) => s.id === id)?.kind === "video" ? "video" : "image"));
  }
  const source = project.sources.find((s) => s.id === scene.sourceId) ?? project.sources[0];
  if (!source) return [];
  return [source.kind === "video" ? "video" : "image"];
}


/** Depth-aware device rendering for scenes with no custom `renderDevice`
 *  hook. Every depth mode now renders the genuine six-face 3D rig
 *  (device3dMarkup) -- real thickness, real side rails and buttons, not a
 *  border around a flat image; `depth` only changes the wrapping motion:
 *  "perspective" adds a static tilt shadow context, "float" adds the bob
 *  animation, "flat"/"showcase" render the rig directly. */
function deviceRigMarkup(device: DeviceModel, uris: string[], kinds: ("image" | "video")[], scene: VideoScene, durationMs: number): string {
  const depth = scene.depth ?? "flat";
  const rig = device3dMarkup(device, uris, scene.variant, durationMs, kinds);
  if (depth === "perspective") return `<div class="device-tilt">${rig}</div>`;
  if (depth === "float") return `<div class="device-float">${rig}</div>`;
  return rig;
}

/** Resolves what to actually draw inside the device box for a scene: a
 *  custom `renderDevice` hook (fold-open, showcase-3d, trio-lineup) takes
 *  precedence; otherwise the scene's `depth` mode picks flat/perspective/
 *  float/showcase rendering. */
function deviceInnerMarkup(animation: SceneAnimation, device: DeviceModel, scene: VideoScene, uris: string[], kinds: ("image" | "video")[], durationMs: number): string {
  const filled = uris.length > 0 ? uris : [placeholderScreenUri(0)];
  const filledKinds = uris.length > 0 ? kinds : (["image"] as ("image" | "video")[]);
  if (animation.renderDevice) return animation.renderDevice(device, filled, filledKinds, scene, durationMs);
  return deviceRigMarkup(device, filled, filledKinds, scene, durationMs);
}

/** Per-scene text-block CSS: a single-pass entrance for the whole
 *  title/subtitle block -- once displayed the text is 100% stable (no
 *  per-word staggering/flicker). The exit fade itself is emitted per-scene
 *  by `sceneLayoutCss` (its timing depends on that scene's duration).
 *  `scope`/`suffix` let the multi-scene concatenated preview give every
 *  scene its own keyframe name and selector so scenes with different
 *  presets don't collide on the same global `@keyframes textIn`. */
function textAnimCss(scene: VideoScene, scope = "", suffix = ""): string {
  const ta = scene.textAnimation ?? {};
  const speed = ta.speed && ta.speed > 0 ? ta.speed : 1;
  const duration = Math.round(480 / speed);
  const scale = ta.scale ?? 1;
  const keyframeName = `textIn${suffix}`;
  const preset = ta.preset ?? "fade-up";
  const bodies: Record<string, string> = {
    "fade-up": `0% { opacity: 0; transform: translateY(20px) scale(${scale}); } 100% { opacity: 1; transform: translateY(0) scale(1); }`,
    "slide-in": `0% { opacity: 0; transform: translateX(-40px) scale(${scale}); } 100% { opacity: 1; transform: translateX(0) scale(1); }`,
    "zoom-in": `0% { opacity: 0; transform: scale(${(0.5 * scale).toFixed(3)}); } 100% { opacity: 1; transform: scale(1); }`,
    "tracking-in": `0% { opacity: 0; letter-spacing: .5em; transform: scale(${scale}); } 100% { opacity: 1; letter-spacing: normal; transform: scale(1); }`,
    kinetic: `0% { opacity: 0; transform: translateY(30px) scale(${scale}); } 60% { opacity: 1; transform: translateY(-6px) scale(1.03); } 100% { opacity: 1; transform: translateY(0) scale(1); }`,
    typewriter: `0% { opacity: 1; clip-path: inset(0 100% 0 0); } 100% { opacity: 1; clip-path: inset(0 0 0 0); }`,
  };
  const body = bodies[preset] ?? bodies["fade-up"];
  return `
    ${scope} .word { display: inline-block; }
    ${scope} .label, ${scope} .subtext { opacity: 0; animation: ${keyframeName} ${duration}ms cubic-bezier(.16,1,.3,1) forwards; }
    @keyframes ${keyframeName} { ${body} }
  `;
}

/** Backgrounds pale/bright enough that white text loses contrast against
 *  them -- text color and its shadow flip to dark on these, keeping every
 *  scene readable regardless of which background a template picks. */
const LIGHT_BACKGROUNDS = new Set(["light", "candy", "citrus", "solid-white", "solid-cream"]);
function textColorFor(background: string): string {
  return LIGHT_BACKGROUNDS.has(background) ? "#141821" : "#ffffff";
}
function textShadowFor(background: string): string {
  return LIGHT_BACKGROUNDS.has(background) ? "0 1px 3px rgba(255,255,255,.55)" : "0 2px 12px rgba(0,0,0,.4)";
}

function textBlockHtml(scene: VideoScene): string {
  if (!scene.text) return "";
  const extraDelay = scene.textAnimation?.delayMs ?? 0;
  const title = `<div class="label" style="animation-delay:${60 + extraDelay}ms"><span class="word">${escapeHtml(scene.text)}</span></div>`;
  const sub = scene.subtext
    ? `<div class="subtext" style="animation-delay:${220 + extraDelay}ms"><span class="word">${escapeHtml(scene.subtext)}</span></div>`
    : "";
  return `<div class="copy" style="color:${textColorFor(scene.background)};text-shadow:${textShadowFor(scene.background)}">${title}${sub}</div>`;
}

/** CSS for the fold-open device hook -- both variant frames stacked and
 *  flex-centred (their native sizes differ), cross-fading over `durationMs`. */
function foldRigCss(durationMs: number): string {
  return `
    .fold-rig { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
    /* Deliberately plain block flow, NOT flex-centered: .stage-scale (an
       ancestor) scales everything down from its TOP-LEFT corner
       (transform-origin: top left). Centering an oversized device inside a
       small flex container assumes the eventual scale-down also happens
       from the CENTER -- it doesn't, so centering-then-scale-from-top-left
       shifts the whole device hundreds of pixels up and left of where it
       visually belongs. Every non-fold scene's device sits in plain block
       flow for exactly this reason (it overflows toward bottom-right,
       anchored at the same top-left corner the scale is anchored to);
       fold-layer now matches that same anchor instead of fighting it. */
    .fold-layer { position: absolute; inset: 0; }
    .fold-folded { animation: foldFadeOut ${durationMs}ms ease-in-out forwards; }
    .fold-unfolded { animation: foldFadeIn ${durationMs}ms ease-in-out forwards; opacity: 0; }
    @keyframes foldFadeOut { 0% { opacity: 1; } 45% { opacity: 1; } 65% { opacity: 0; } 100% { opacity: 0; } }
    @keyframes foldFadeIn { 0% { opacity: 0; } 45% { opacity: 0; } 65% { opacity: 1; } 100% { opacity: 1; } }
  `;
}

/** Entrance-only transition applied to a scene's first ~400ms via a
 *  full-canvas overlay layer -- a CSS animation like everything else here,
 *  so it stays deterministic under window.seek and needs no ffmpeg xfade /
 *  extra encode pass. Deliberately entrance-only: every scene here is its
 *  own isolated document (one Playwright page per scene, see renderVideo),
 *  so there is no "next scene" underneath to reveal on exit -- an exit
 *  fade-to-opaque would just leave the frame painted over with nothing
 *  behind it once the scene (and the whole sequence) ends. The overlay
 *  therefore always resolves back to fully transparent well before 100%,
 *  so the final frame is never obscured. "cut" (the default) renders an
 *  always-invisible overlay. */
function transitionKeyframeBody(scene: VideoScene, durationMs: number): string {
  const t = scene.transition ?? "cut";
  const inEnd = Math.min(14, (400 / durationMs) * 100).toFixed(2);
  switch (t) {
    case "fade":
      return `0% { opacity: 1; } ${inEnd}% { opacity: 0; } 100% { opacity: 0; }`;
    case "slide":
      return `0% { opacity: 1; transform: translateX(-6%); } ${inEnd}% { opacity: 0; transform: translateX(0); } 100% { opacity: 0; transform: translateX(0); }`;
    case "wipe":
      return `0% { opacity: 1; clip-path: inset(0 100% 0 0); } ${inEnd}% { opacity: 0; clip-path: inset(0 0 0 0); } 100% { opacity: 0; clip-path: inset(0 0 0 0); }`;
    case "zoom":
      return `0% { opacity: 1; transform: scale(1.3); } ${inEnd}% { opacity: 0; transform: scale(1); } 100% { opacity: 0; transform: scale(1); }`;
    case "cut":
    default:
      return `0% { opacity: 0; } 100% { opacity: 0; }`;
  }
}

const CANVAS_BASE_CSS = `
  * { box-sizing: border-box; }
  .canvas, .scene {
    position: relative; display: flex; align-items: center; justify-content: center; gap: 5%;
    font-family: "Segoe UI", Roboto, -apple-system, sans-serif; color: #fff; overflow: hidden;
  }
  .backdrop { position: absolute; inset: -8%; z-index: 0; }
  .vignette { position: absolute; inset: 0; background: radial-gradient(circle at 50% 42%, rgba(0,0,0,0) 45%, rgba(0,0,0,.35) 100%); z-index: 1; }
  .transition-overlay { position: absolute; inset: 0; z-index: 5; background: #05060a; pointer-events: none; opacity: 0; }
  .copy { position: relative; z-index: 3; padding: 0 2%; }
  .label { font-weight: 800; line-height: 1.15; }
  .subtext { opacity: .82; margin-top: .5em; font-weight: 500; }
  /* flex: 0 0 auto always -- .stage's size is deliberately pre-computed in
     px (stageWidth/stageHeight, from deviceScaleFor) to match the device's
     scale exactly; letting it flex-grow (an earlier version keyed this off
     the layout) stretches the box far past that while the child transform:
     scale() inside it still assumes the original size, producing a
     misaligned, double-scaled mess. Only .copy is allowed to flex --
     layouts that want a bigger device use a bigger deviceFraction instead. */
  .stage { position: relative; perspective: 1800px; z-index: 2; flex: 0 0 auto; }
  .stage-scale { position: absolute; inset: 0; transform-origin: top left; }
  .stage-inner { width: 100%; height: 100%; }
`;

/** Per-scene overrides: composition (layout), font sizing, background,
 *  per-scene keyframes, and the animation-triggering rules (gated behind
 *  `gateSelector` so a sequence view only animates its currently-visible
 *  scene, while a standalone scene document animates immediately). Shared
 *  verbatim by `sceneHtml` (single scene) and `templatePreviewHtml` (N
 *  scenes) -- the one generator this file promises in its header comment. */
const FLOW_LABEL_CSS = `
  .flow-label {
    position: absolute;
    z-index: 10;
    padding: 16px 28px;
    background: rgba(10, 14, 22, 0.84);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 48px;
    color: #ffffff;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 14px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.52);
    opacity: 0;
    pointer-events: none;
    top: 50%;
    transform: translateY(-50%);
  }
  .flow-label-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 14px #38bdf8;
  }
  .flow-label-left {
    left: 4.5%;
  }
  .flow-label-right {
    right: 4.5%;
  }
`;

/** Stacks a scene's flowSteps down each side (1 item = vertically centered,
 *  as before; 2-3+ items per side = evenly spaced rows) -- reused as-is by
 *  the mid-sequence "App Flow" walkthrough labels and by landscape-flow's
 *  Scene 10 climax, which just supplies up to 6 steps (3 left / 3 right)
 *  instead of 1-3 alternating ones. */
function flowLabelsHtml(scene: VideoScene, durationMs: number): string {
  if (!scene.flowSteps || scene.flowSteps.length === 0) return "";
  const bySide = { left: scene.flowSteps.filter((s) => s.side === "left"), right: scene.flowSteps.filter((s) => s.side === "right") };
  return scene.flowSteps
    .map((step, idx) => {
      const startMs = step.startSec * 1000;
      const stepDurMs = Math.max(800, step.durationSec * 1000);
      const isLeft = step.side === "left";
      const animName = `flowStepAnim_${idx}`;
      const sideClass = isLeft ? "flow-label-left" : "flow-label-right";
      const inTranslate = isLeft ? "-32px" : "32px";
      const sideItems = bySide[step.side];
      const rowIdx = sideItems.indexOf(step);
      const topPct = ((rowIdx + 1) / (sideItems.length + 1)) * 100;
      return `
        <div class="flow-label ${sideClass}" style="top:${topPct}%; animation: ${animName} ${stepDurMs}ms ${startMs}ms cubic-bezier(.2,.85,.25,1) forwards;">
          <div class="flow-label-dot"></div>
          <span>${escapeHtml(step.label)}</span>
        </div>
        <style>
          @keyframes ${animName} {
            0% { opacity: 0; transform: translateY(-50%) translateX(${inTranslate}) scale(0.92); }
            18% { opacity: 1; transform: translateY(-50%) translateX(0) scale(1); }
            82% { opacity: 1; transform: translateY(-50%) translateX(0) scale(1); }
            100% { opacity: 0; transform: translateY(-50%) translateX(${inTranslate}) scale(0.95); }
          }
        </style>
      `;
    })
    .join("\n");
}

/** Precedence, most to least specific: scene.slotValues.background (the
 *  left-side per-scene override) -> project.backgroundImage (the right-side
 *  global default) -> the scene's own named theme via backgroundCss. Mirrors
 *  resolveSlots' brand-fallback pattern in slots.ts, just for a field that
 *  lives outside the slot-target system (background paints `.backdrop`
 *  directly, it has no DOM slot target to resolve through). */
function resolveSceneBackgroundCss(
  scene: VideoScene,
  project?: VideoProject,
  resolveUri?: (rel: string) => string,
): string {
  if (project && resolveUri) {
    const override = scene.slotValues?.background;
    const overrideId = override?.kind === "image" ? override.sourceId : undefined;
    const sourceId = overrideId ?? project.backgroundImage ?? null;
    if (sourceId) {
      const source = project.sources.find((s) => s.id === sourceId);
      if (source) return `center / cover no-repeat url(${resolveUri(source.file)})`;
    }
  }
  return backgroundCss(scene.background);
}

function sceneLayoutCss(
  scene: VideoScene,
  animation: SceneAnimation,
  durationMs: number,
  selector: string,
  keyframeSuffix: string,
  gateSelector: string = selector,
  project?: VideoProject,
  resolveUri?: (rel: string) => string,
): string {
  const layout = layoutFor(scene);
  const isLandscape = orientationOf(scene) === "16:9";
  const backdropKf = (animation.backdropKeyframes ?? defaultBackdrop)(scene);
  const exitDelay = Math.max(0, durationMs - 480);
  const isStackedTop = layout.id === "stacked-top";
  const isStackedBottom = layout.id === "stacked-bottom";

  return `
    ${selector} { flex-direction: ${layout.direction}; padding: ${SAFE_INSET.y}% ${SAFE_INSET.x}%; justify-content: center; align-items: center; }
    ${selector} .copy { text-align: ${layout.copyAlign}; flex: ${layout.copyFlex}; ${layout.copyMaxWidth ? `max-width:${layout.copyMaxWidth};` : ""} z-index: 4; ${isStackedTop ? "margin-bottom: clamp(32px, 4.5vh, 60px);" : ""} ${isStackedBottom ? "margin-top: clamp(32px, 4.5vh, 60px);" : ""} }
    ${selector} .label { font-size: ${isLandscape ? 64 : 54}px; }
    ${selector} .subtext { font-size: ${isLandscape ? 32 : 28}px; }
    ${selector} .backdrop { background: ${resolveSceneBackgroundCss(scene, project, resolveUri)}; }
    ${!isLandscape ? `${selector} .stage { margin: 0 auto; align-self: center !important; }` : ""}
    ${
      scene.depth === "float" || scene.depth === "showcase"
        ? `${selector} .stage, ${selector} .stage-scale, ${selector} .stage-inner { transform-style: preserve-3d; }`
        : ""
    }
    ${layout.canvasClass === "edge-left" && isLandscape ? `${selector} .stage { align-self: flex-start; }` : ""}
    ${layout.canvasClass === "edge-right" && isLandscape ? `${selector} .stage { align-self: flex-end; }` : ""}
    ${layout.canvasClass === "panel-split" ? `${selector}::before { content:""; position:absolute; inset:0; width:46%; background:linear-gradient(160deg, rgba(0,0,0,.4), rgba(0,0,0,0) 65%); z-index:0; }` : ""}
    ${
      layout.overlay
        ? `${selector} .copy { position:absolute; left:0; right:0; bottom:6%; z-index:4; text-align:center; padding:0 8%; }
    ${selector} .copy::before { content:""; position:absolute; inset:-14% -8% -22% -8%; background:linear-gradient(to top, rgba(0,0,0,.62), rgba(0,0,0,0)); z-index:-1; }
    ${selector} .stage { position: relative; margin: 0 auto; align-self: center !important; }`
        : ""
    }
    ${gateSelector} .stage-inner { animation: play${keyframeSuffix} ${durationMs}ms ${animation.easing} forwards; }
    ${gateSelector} .backdrop { animation: bg${keyframeSuffix} ${durationMs}ms ease-out forwards; }
    ${gateSelector} .copy { animation: copyExit${keyframeSuffix} 420ms ${exitDelay}ms cubic-bezier(.4,0,1,1) forwards; }
    ${gateSelector} .transition-overlay { animation: trans${keyframeSuffix} ${durationMs}ms linear forwards; }
    ${gateSelector} .fold-folded { animation-duration: ${durationMs}ms; }
    ${gateSelector} .fold-unfolded { animation-duration: ${durationMs}ms; }
    @keyframes play${keyframeSuffix} { ${animation.deviceKeyframes(scene)} }
    @keyframes bg${keyframeSuffix} { ${backdropKf} }
    @keyframes copyExit${keyframeSuffix} { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-14px); } }
    @keyframes trans${keyframeSuffix} { ${transitionKeyframeBody(scene, durationMs)} }
    ${animation.extraCss ? animation.extraCss(scene, selector, gateSelector, keyframeSuffix, durationMs) : ""}
  `;
}

/** The DOM for one scene's content -- shared by the standalone document and
 *  the sequence player's per-scene layer. */
function sceneContentHtml(scene: VideoScene, device: DeviceModel, uris: string[], kinds: ("image" | "video")[], durationMs: number): string {
  const animation = SCENE_ANIMATIONS[scene.sceneTemplate] ?? SCENE_ANIMATIONS["hero-rise"];
  const canvas = canvasFor(scene);
  const deviceScale = deviceScaleFor(device, canvas.height, scene.variant, scene.deviceFraction ?? 0.58);
  const geometry = resolveGeometry(device, scene.variant);
  const stageWidth = Math.round(geometry.width * deviceScale);
  const stageHeight = Math.round(geometry.height * deviceScale);
  return `
    <div class="backdrop"></div>
    <div class="vignette"></div>
    ${textBlockHtml(scene)}
    <div class="stage" style="width:${stageWidth}px;height:${stageHeight}px;">
      <div class="stage-scale" style="transform:scale(${deviceScale})">
        <div class="stage-inner">${deviceInnerMarkup(animation, device, scene, uris, kinds, durationMs)}</div>
      </div>
    </div>
    ${decorationsMarkup(scene.decorations ?? [], canvas)}
    ${flowLabelsHtml(scene, durationMs)}
    <div class="transition-overlay"></div>
  `;
}

/** Injects a project's dynamic content into a slot-driven template's own
 *  HTML (config parsed once, verbatim markup/CSS/keyframes untouched). Both
 *  the live preview (`resolveUri` -> `/api/videos/:id/file?p=...`) and the
 *  final render (`resolveUri` -> a `data:` URI read off disk) share this one
 *  path -- see slots.ts's resolveSlots for the actual value resolution.
 *
 *  IMPORTANT: always pass the full multi-scene document, never a single
 *  scene's markup in isolation -- some templates reference `<defs>` (e.g.
 *  an SVG gradient) declared in an earlier scene (tpl-62155880 scene 4
 *  reuses `url(#pinGrad)` from scene 1). */
export function composeStandaloneHtml(project: VideoProject, activeSceneIndex?: number, resolveUri?: (rel: string) => string, allowDemo = true): string {
  const templateId = project.template || "iphone-15-pro-portrait";
  const htmlPath = templateHtmlPath(templateId);
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Standalone template HTML not found at ${htmlPath}`);
  }
  let html = fs.readFileSync(htmlPath, "utf-8");

  const config = templateConfig(templateId);
  if (!config) return html;
  // Durations come from the PROJECT's scenes (what the user actually edited),
  // not the template's own defaults -- config.scenes is a cached parse shared
  // across every render, so clone before overriding it. Without this, a scene
  // whose duration was changed (e.g. a screen-recording clip lengthening it to
  // 23.8s while the template still says 5s) still seeks/plays on the template's
  // stale duration: the export renders frames well past 5s that the player only
  // ever shows as the next scene's opening frame, held and slightly jittering
  // (the transition's own motion) -- exactly the "stuck on Scene 2, flickering"
  // symptom, for every scene after the one whose length was ever edited.
  const projectScenesByOrder = [...project.scenes].sort((a, b) => a.order - b.order);
  const scenes = (config.scenes || []).map((s: any, i: number) => {
    const projScene = projectScenesByOrder[i];
    if (!projScene) return s;
    const durationSeconds = Math.max(0.1, projScene.durationSeconds || 5);
    return { ...s, durationSeconds, durationMs: durationSeconds * 1000 };
  });
  if (scenes.length) {
    html = html.replace(
      /(<script type="application\/json" id="template-config">)[\s\S]*?(<\/script>)/,
      (_m, open, close) => `${open}\n${JSON.stringify({ ...config, scenes })}\n${close}`,
    );
  }

  // Migrated templates (see deviceShellMarkup) carry {{DEVICE_ID}}/
  // {{DEVICE_W}}/{{DEVICE_H}} placeholders on their device-shell <canvas>
  // tags instead of a hardcoded CSS device shape -- substitute the
  // template's own (already-present, previously-unused) `config.device`
  // field. Plain string substitution, not regex/DOM surgery, so this is a
  // no-op for not-yet-migrated templates (no placeholders present).
  if (html.includes("{{DEVICE_ID}}")) {
    const shellDevice = DEVICE_REGISTRY[config.device ?? ""] ?? DEVICE_REGISTRY["phone"];
    html = html
      .replaceAll("{{DEVICE_ID}}", shellDevice.id)
      .replaceAll("{{DEVICE_W}}", String(shellDevice.geometry.width))
      .replaceAll("{{DEVICE_H}}", String(shellDevice.geometry.height));
  }
  const uriFor = resolveUri ?? previewResolveUri(project.id);

  // Resolve the same BGM renderVideo would mix into the export -- a real
  // upload if one is set, else the template's own generated track -- so the
  // interactive preview (this function) can actually play it too, instead of
  // background music only ever being audible in the final rendered file.
  let bgmUrl: string | null = null;
  if (project.bgm) {
    const candidate = videoFile(project.id, project.bgm);
    if (fs.existsSync(candidate)) bgmUrl = uriFor(project.bgm);
  }
  if (!bgmUrl && BGM_PRESETS[templateId]) {
    bgmUrl = `/api/bgm-presets/${encodeURIComponent(templateId)}`;
  }
  const bgmVolume = project.bgmVolume ?? 1;

  // Calculate scene offset if activeSceneIndex is set
  let sceneStartMs = 0;
  const activeSceneDurMs = activeSceneIndex === undefined ? 0
    : scenes[activeSceneIndex]?.durationMs || ((scenes[activeSceneIndex]?.durationSeconds || 5) * 1000);
  if (activeSceneIndex !== undefined) {
    for (let idx = 0; idx < activeSceneIndex; idx++) {
      sceneStartMs += scenes[idx]?.durationMs || ((scenes[idx]?.durationSeconds || 5) * 1000);
    }
  }

  // Build one flat payload for every scene the template declares slots for
  // -- resolveSlots is the single normalizer both the studio editor and this
  // renderer use, so there is no second description of what a scene needs.
  const payload = project.scenes.flatMap((_pScene, idx) => resolveSlots(project, idx, uriFor, allowDemo));
  // Within-scene multi-screenshot timelines (project-wide -- see
  // resolveImageSequences's doc comment for why this can't be per-scene).
  const sequences = resolveImageSequences(project, uriFor, allowDemo);

  // Screenshot -> video hand-off for the active scene (see VideoScene.videoSourceId).
  const activeScene = activeSceneIndex === undefined ? undefined : project.scenes.find((sc) => sc.order === activeSceneIndex);
  const videoSource = activeScene?.videoSourceId ? project.sources.find((src) => src.id === activeScene.videoSourceId && src.kind === "video") : undefined;
  const videoTargets = activeScene && videoSource && project.template
    ? slotSpecsForScene(project.template, activeScene.order)
        .filter((sp) => sp.key === "screenshot" || sp.key === "screenshots")
        .flatMap((sp) => sp.targets)
    : [];
  const videoCfg = videoSource && activeScene && videoTargets.length
    ? {
        src: uriFor(videoSource.file),
        targets: videoTargets,
        holdMs: Math.max(0, activeScene.screenshotHoldSec ?? 2) * 1000,
        startSec: activeScene.videoStartSec ?? 0,
        endSec: activeScene.videoEndSec ?? 0,
      }
    : null;

  const injectionScript = `
  <script>
    (function() {
      function applyPayload() {
        const payload = ${JSON.stringify(payload)};
        payload.forEach(({ targets, op, value }) => targets.forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => {
            if (op === 'text') el.textContent = value;
            else if (op === 'src') el.src = value;
            else el.innerHTML = value;
          });
        }));
        if (window.__videoPreview && !window.__videoPreview.togglePlay) {
          window.__videoPreview.togglePlay = function() {
            if (typeof window.__videoPreview.currentState === 'function' && window.__videoPreview.currentState() === 'playing') {
              window.__videoPreview.pause();
            } else if (typeof window.__videoPreview.currentState === 'function' && window.__videoPreview.currentState() === 'ended') {
              if (typeof window.__videoPreview.replay === 'function') window.__videoPreview.replay();
              else window.__videoPreview.play();
            } else {
              window.__videoPreview.play();
            }
          };
        }
      }
      function boot() {
        applyPayload();

      // Multi-screenshot timeline: swap each target's src to whichever
      // segment covers the current ABSOLUTE document time. Driven by
      // wrapping window.seek (below) rather than a wall-clock timer so it
      // renders identically in the interactive preview AND in the headless
      // frame-by-frame video render, which drives every frame exclusively
      // through repeated window.seek(ms) calls -- see renderVideo's frame
      // loop. A per-target last-applied cache avoids redundant DOM writes
      // on every one of the ~30 seek calls per second.
      const sequences = ${JSON.stringify(sequences)};
      const seqLastSrc = new Map();
      function applySequencesAt(ms) {
        for (const { targets, segments } of sequences) {
          const seg = segments.find((s) => ms >= s.startMs && ms < s.endMs) || segments[segments.length - 1];
          if (!seg) continue;
          for (const sel of targets) {
            if (seqLastSrc.get(sel) === seg.src) continue;
            const el = document.querySelector(sel);
            if (el) { el.src = seg.src; seqLastSrc.set(sel, seg.src); }
          }
        }
      }
      if (sequences.length > 0) {
        const beforeSequenceSeek = window.seek;
        window.seek = (ms) => {
          applySequencesAt(ms);
          if (typeof beforeSequenceSeek === 'function') return beforeSequenceSeek(ms);
        };
        applySequencesAt(0);
      }

      // Apply seek offset adapter if activeSceneIndex is set
      if (${activeSceneIndex !== undefined}) {
        const originalSeek = window.seek;
        const startMs = ${sceneStartMs};
        const vid = ${JSON.stringify(videoCfg)};
        let videoEl = null;
        let videoShown = null;
        if (vid) {
          const imgs = vid.targets.flatMap((sel) => Array.from(document.querySelectorAll(sel)));
          if (imgs[0]) {
            videoEl = document.createElement('video');
            videoEl.src = vid.src;
            videoEl.muted = true;
            videoEl.playsInline = true;
            videoEl.preload = 'auto';
            videoEl.className = imgs[0].className;
            videoEl.style.cssText = imgs[0].style.cssText;
            videoEl.style.setProperty('opacity', '1', 'important');
            videoEl.style.setProperty('object-fit', 'cover');
            videoEl.style.display = 'none';
            imgs[0].parentNode.insertBefore(videoEl, imgs[0].nextSibling);
            // A clip that can't load must not stall every frame on the 1.5s 'seeked'
            // timeout below (that was ~16 minutes for one 22s recording) or swap the
            // screenshot for a blank <video> -- keep showing the screenshot instead.
            videoEl.addEventListener('error', () => { videoBroken = true; });
            // Every template's own seek sets currentTime = scene time on ALL <video>s
            // on the page, which clobbered this clip's hold/trim-adjusted time (it ran
            // 2s ahead and ignored the trim, plus paid a second seek every frame).
            // Only syncVideo below may move this element's playhead.
            Object.defineProperty(videoEl, 'currentTime', {
              configurable: true,
              get: function () { return mediaTime.get.call(this); },
              set: function () {},
            });
          }
          var videoBroken = false;
          var mediaTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
          // Show the screenshot(s) OR the video for a given scene-relative time.
          // visibility (not opacity/display) on the imgs: templates animate their
          // opacity every frame, so those must stay untouched.
          var syncVideo = (ms) => {
            if (!videoEl) return;
            if (videoBroken || videoEl.error) {
              if (videoShown !== false) {
                videoShown = false;
                imgs.forEach((im) => { im.style.visibility = ''; });
                videoEl.style.display = 'none';
              }
              return;
            }
            const showVideo = ms >= vid.holdMs;
            if (showVideo !== videoShown) {
              videoShown = showVideo;
              imgs.forEach((im) => { im.style.visibility = showVideo ? 'hidden' : ''; });
              videoEl.style.display = showVideo ? '' : 'none';
            }
            if (!showVideo) return;
            const clipEnd = vid.endSec > vid.startSec ? vid.endSec : (videoEl.duration || vid.startSec);
            const t = Math.min(clipEnd, vid.startSec + (ms - vid.holdMs) / 1000);
            if (Math.abs(videoEl.currentTime - t) < 0.001) return;
            return new Promise((resolve) => {
              const done = () => { videoEl.removeEventListener('seeked', done); resolve(undefined); };
              videoEl.addEventListener('seeked', done);
              mediaTime.set.call(videoEl, t);
              setTimeout(() => {
                // Still no data at all after 1.5s: treat as unloadable rather than
                // paying this timeout again on every remaining frame.
                if (videoEl.readyState === 0) videoBroken = true;
                done();
              }, 1500);
            });
          };
        }
        window.seek = (ms) => {
          const videoDone = videoEl ? syncVideo(ms) : undefined;
          if (typeof originalSeek === 'function') {
            // Clamp inside the scene: seeking to its exact end (startMs + duration)
            // lands on the NEXT scene's first frame, so hold the last frame instead.
            const seeked = originalSeek(startMs + Math.min(ms, Math.max(0, ${activeSceneDurMs} - 1)));
            return videoDone ? Promise.all([videoDone, seeked]) : seeked;
          }
        };
        // Jump the interactive player to this scene on load -- without this
        // the player's own bootstrap (renderFrameAt(0), see player-helper.mjs)
        // always shows scene 0 first, so every single-scene preview request
        // rendered the same opening frame regardless of which scene was
        // actually requested. Harmless (and unused) during the headless
        // frame-capture render path, which drives frames exclusively through
        // the wrapped window.seek above.
        if (typeof window.goto === 'function') {
          window.goto(${activeSceneIndex});
        }
      }

      // Background music -- wraps the now-fully-adapted play/pause/seek (defined
      // above and, for a single-scene preview, by the activeSceneIndex block) so
      // this fires last regardless of which mode is active. The existing mute
      // button already toggles every <audio>/<video> element's .muted, so no
      // change was needed there.
      const bgmUrl = ${JSON.stringify(bgmUrl)};
      if (bgmUrl) {
        const bgmAudio = document.createElement('audio');
        bgmAudio.src = bgmUrl;
        bgmAudio.loop = true;
        bgmAudio.preload = 'auto';
        bgmAudio.volume = ${JSON.stringify(bgmVolume)};
        bgmAudio.style.display = 'none';
        document.body.appendChild(bgmAudio);
        // The Studio editor's own scene transport (frame-stepping, scrubbing, speed
        // control) drives playback by calling only .seek() on a manual interval --
        // never .play()/.pause(), since those would start this document's own
        // animation-frame loop fighting that manual stepping. It starts/stops this
        // audio element directly instead; expose it for that purpose.
        window.__bgmAudio = bgmAudio;

        const beforePlay = window.play;
        window.play = function () {
          bgmAudio.play().catch(() => {});
          return typeof beforePlay === 'function' ? beforePlay.apply(this, arguments) : undefined;
        };
        const beforePause = window.pause;
        window.pause = function () {
          bgmAudio.pause();
          return typeof beforePause === 'function' ? beforePause.apply(this, arguments) : undefined;
        };
        const beforeBgmSeek = window.seek;
        window.seek = function (ms) {
          if (bgmAudio.duration) {
            const t = (ms / 1000) % bgmAudio.duration;
            if (Math.abs(bgmAudio.currentTime - t) > 0.25) bgmAudio.currentTime = t;
          }
          return typeof beforeBgmSeek === 'function' ? beforeBgmSeek.apply(this, arguments) : undefined;
        };
      }
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
      else boot();
    })();
  </script>
  `;

  html = html.replace("</body>", `${injectionScript}</body>`);
  return html;
}

/** The single generator used by both preview and render. */
export function sceneHtml(
  scene: VideoScene,
  screenshotUris: string[],
  seekable = false,
  screenshotKinds: ("image" | "video")[] = [],
  project?: VideoProject,
  resolveUri?: (rel: string) => string,
  allowDemo = true,
): string {
  if (project && project.template) {
    // Only templates that declare `slots` (the replicated tpl-* promos) go
    // through the standalone-HTML injector. The 10 device presets carry a
    // template.html (for the Templates-tab preview player) but no slots, so
    // they fall through to the code-generated path below, which is what
    // actually understands their screenshots/screenCount/word-split text.
    const cfg = templateConfig(project.template);
    if (cfg?.scenes?.some((s: any) => s.slots)) {
      return composeStandaloneHtml(project, scene.order, resolveUri ?? previewResolveUri(project.id), allowDemo);
    }
  }

  const device = DEVICE_REGISTRY[scene.device] ?? DEVICE_REGISTRY["phone"];
  if (!device) throw new Error(`Device '${scene.device}' not found in registry`);
  const animation = SCENE_ANIMATIONS[scene.sceneTemplate] ?? SCENE_ANIMATIONS["hero-rise"];
  const canvas = canvasFor(scene);
  const durationMs = Math.max(1, scene.durationSeconds) * 1000;

  const contentHtml = sceneContentHtml(scene, device, screenshotUris, screenshotKinds, durationMs);
  const usesDeviceRig = contentHtml.includes("device-rig-canvas");

  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  html, body { margin: 0; padding: 0; width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; }
  ${CANVAS_BASE_CSS}
  .canvas { width: ${canvas.width}px; height: ${canvas.height}px; }
  ${DEVICE_CSS}
  ${textAnimCss(scene)}
  ${FLOW_LABEL_CSS}
  ${foldRigCss(durationMs)}
  ${sceneLayoutCss(scene, animation, durationMs, ".canvas", "", undefined, project, resolveUri)}
</style></head>
<body>
  <div class="canvas">${contentHtml}</div>
  ${
    seekable
      ? `<script>
  window.seek = (ms) => {
    document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; });
    const vids = Array.from(document.querySelectorAll("video"));
    if (vids.length === 0) return;
    return Promise.all(vids.map((v) => new Promise((resolve) => {
      const onSeeked = () => { v.removeEventListener("seeked", onSeeked); resolve(undefined); };
      v.addEventListener("seeked", onSeeked);
      v.pause();
      v.currentTime = ms / 1000;
    })));
  };
</script>`
      : ""
  }
  ${usesDeviceRig ? THREE_BRIDGE_SCRIPT : ""}
</body></html>`;
}

function previewResolveUri(projectId: string) {
  return (rel: string) => `/api/videos/${projectId}/file?p=${encodeURIComponent(rel)}`;
}

export function scenePreviewHtml(project: VideoProject, sceneId: string): string {
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error(`Scene '${sceneId}' not found in project ${project.id}`);
  const resolveUri = previewResolveUri(project.id);
  return sceneHtml(scene, sourceUrisFor(project, scene, resolveUri), false, sourceKindsFor(project, scene), project, resolveUri);
}

/** Concatenated full-template preview: every scene of the project is laid
 *  out ahead of time, but nothing plays until the page's `window.seek`-free
 *  companion API (`window.__videoPreview`) is told to -- see the player
 *  script below. Each scene is its own absolutely-positioned layer with its
 *  own named @keyframes (no name collisions across scenes); a small script
 *  shows exactly one scene at a time and (re)starts its CSS animations by
 *  toggling a class, timed via setTimeout against each scene's own duration
 *  -- plain JS scheduling, not an AI video engine. */
export function templatePreviewHtml(project: VideoProject): string {
  if (project.template) {
    const htmlPath = path.join(process.cwd(), "templates", "video", project.template, "template.html");
    if (fs.existsSync(htmlPath)) {
      return composeStandaloneHtml(project);
    }
  }

  const resolveUri = previewResolveUri(project.id);
  const scenes = [...project.scenes].sort((a, b) => a.order - b.order);

  const canvas = canvasFor(scenes[0] ?? ({} as VideoScene));

  const scenesCss = scenes
    .map((scene, i) => {
      const animation = SCENE_ANIMATIONS[scene.sceneTemplate] ?? SCENE_ANIMATIONS["hero-rise"];
      const durationMs = Math.max(1, scene.durationSeconds) * 1000;
      return sceneLayoutCss(scene, animation, durationMs, `.scene-${i}`, `-${i}`, `.scene-${i}.playing`, project, resolveUri) + textAnimCss(scene, `.scene-${i}`, `-${i}`);
    })
    .join("\n");

  const scenesHtml = scenes
    .map((scene, i) => {
      const device = DEVICE_REGISTRY[scene.device] ?? DEVICE_REGISTRY["phone"];
      const durationMs = Math.max(1, scene.durationSeconds) * 1000;
      const uris = sourceUrisFor(project, scene, resolveUri);
      const kinds = sourceKindsFor(project, scene);
      return `<div class="scene scene-${i}" id="scene-${i}">${sceneContentHtml(scene, device, uris, kinds, durationMs)}</div>`;
    })
    .join("\n");

  const durationsMs = JSON.stringify(scenes.map((s) => Math.max(1, s.durationSeconds) * 1000));

  return `<!doctype html><html><head><meta charset="utf-8" /><style>
    html, body { margin:0; width:${canvas.width}px; height:${canvas.height}px; overflow:hidden; }
    ${CANVAS_BASE_CSS}
    .scene { position:absolute; inset:0; width:${canvas.width}px; height:${canvas.height}px; display:none; }
    .scene.playing { display:flex; }
    ${DEVICE_CSS}
    ${foldRigCss(0)}
    ${scenesCss}
  </style></head><body>${scenesHtml}
  <script>
    // Player API consumed by the Video tab's preview controls
    // (window.__videoPreview). Loads paused on scene 0 -- nothing plays
    // until play()/playScene() is called explicitly (no autoplay). play()
    // advances the full sequence and STOPS after the last scene (no loop);
    // playScene(n) plays exactly one scene and never advances into the
    // next. onState is pushed on every transition so the host page never
    // has to poll.
    const durations = ${durationsMs};
    let i = 0;
    let timer = null;
    let playState = "idle"; // idle | playing | paused | ended
    let mode = "sequence"; // sequence | scene

    function showScene(index) {
      document.querySelectorAll(".scene.playing").forEach((el) => el.classList.remove("playing"));
      void document.body.offsetWidth; // force reflow so animations restart
      const el = document.getElementById("scene-" + index);
      if (el) el.classList.add("playing");
    }
    function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
    function notify() {
      if (window.__videoPreview && window.__videoPreview.onState) {
        try { window.__videoPreview.onState({ scene: i, state: playState, mode }); } catch (e) {}
      }
    }
    function setAnimationsPaused(p) {
      document.getAnimations().forEach((a) => { try { p ? a.pause() : a.play(); } catch (e) {} });
      document.querySelectorAll("video").forEach((v) => { try { p ? v.pause() : v.play(); } catch (e) {} });
    }
    // Every animation here starts at 0% = its entrance (e.g. opacity:0,
    // off-canvas) -- pausing right after a class toggle starts it freezes
    // that INVISIBLE first instant, not the settled, fully-composed frame
    // (device+text+backdrop all in place). "Selecting a scene must show it,
    // paused" therefore needs the timeline jumped to its resolved end state
    // before pausing, not just paused wherever it happens to be. Used for
    // the initial load and goto() (holding a scene, unplayed); an actual
    // mid-playback pause() correctly freezes in place instead, via
    // setAnimationsPaused above.
    function settleAnimations() {
      // One shared instant, not each animation's own end: the device
      // entrance, the backdrop drift, and each staggered word span all
      // finish at different real times, but the copy block's own late
      // copyExit fade starts near the scene's end (durationMs-480) --
      // jumping every animation to ITS OWN finish (an earlier version of
      // this did) makes copyExit land on its end too, i.e. fully faded
      // out, hiding the text
      // that the word spans had just finished fading IN. Picking one target
      // time comfortably after every entrance but well before the exit
      // keeps the whole scene visually settled: device in place, full text
      // visible, nothing exited yet.
      const dur = durations[i] || 1000;
      // 72% clears every device animation's own settle point (most land by
      // 55-65%, e.g. fold-open's cross-fade doesn't finish until 65%) with
      // margin, while staying well before the copy's exit fade, which only
      // starts at dur-480ms (typically ~85-90% of a scene's duration).
      const target = Math.max(0, Math.min(dur - 600, Math.max(1600, dur * 0.72)));
      document.getAnimations().forEach((a) => {
        try {
          a.pause();
          a.currentTime = target;
        } catch (e) {}
      });
      document.querySelectorAll("video").forEach((v) => { try { v.pause(); } catch (e) {} });
    }
    function advance() {
      clearTimer();
      if (mode === "scene" || i + 1 >= durations.length) { playState = "ended"; notify(); return; }
      i += 1;
      showScene(i);
      playState = "playing";
      notify();
      timer = setTimeout(advance, durations[i] || 1000);
    }

    window.__videoPreview = {
      sceneCount: durations.length,
      onState: null,
      /** Full sequence, from the current scene onward (or from 0 if the
       *  sequence had already ended). Stops after the final scene. */
      play() {
        mode = "sequence";
        if (playState === "ended") { i = 0; showScene(i); }
        else if (playState !== "paused") { showScene(i); } // fresh/idle scene -> start it from frame 0
        // else: resuming from pause -- the scene is already showing its
        // paused frame, so resume in place instead of restarting it.
        setAnimationsPaused(false);
        playState = "playing";
        notify();
        clearTimer();
        timer = setTimeout(advance, durations[i] || 1000);
      },
      /** Exactly one scene, once. Never advances into the next scene. */
      playScene(index) {
        mode = "scene";
        i = Math.max(0, Math.min(index, durations.length - 1));
        showScene(i);
        setAnimationsPaused(false);
        playState = "playing";
        notify();
        clearTimer();
        timer = setTimeout(() => { playState = "ended"; notify(); }, durations[i] || 1000);
      },
      pause() { clearTimer(); setAnimationsPaused(true); playState = "paused"; notify(); },
      /** Restart the full sequence from scene 0. */
      replay() { clearTimer(); i = 0; this.play(); },
      isPaused() { return playState === "paused"; },
      currentScene() { return i; },
      currentState() { return playState; },
      /** Select a scene and hold it, unplayed (paused on its first frame). */
      goto(index) {
        clearTimer();
        mode = "scene";
        i = Math.max(0, Math.min(index, durations.length - 1));
        showScene(i);
        settleAnimations();
        playState = "idle";
        notify();
        return i;
      },
      next() { return this.goto(i + 1); },
      prev() { return this.goto(i - 1); },
    };

    // Load paused on scene 0: showScene() toggling the "playing" class is
    // what makes the browser start scene 0's CSS animations running (that
    // is how CSS animations work the instant their selector matches -- there
    // is no implicit "wait for play()"), so an explicit pause right after is
    // required or the very first scene autoplays before the user ever
    // touches Play. This is the fix for "selecting a template must never
    // start playback."
    showScene(0);
    settleAnimations();
    playState = "idle";
    notify();
  </script>
  </body></html>`;
}

const FPS = 30;

async function ensureFfmpegAvailable(): Promise<void> {
  try {
    await execFileAsync(resolveTool("ffmpeg"), ["-version"]);
  } catch {
    throw new Error("ffmpeg is not installed or not on PATH. Install ffmpeg and ensure the 'ffmpeg' command is available, then retry.");
  }
}

/** `browser.close()` waits for a graceful Chromium shutdown, which can hang
 *  well past any reasonable wait when the browser process is itself under
 *  heavy load (many concurrent pages, GPU contention) -- exactly the state a
 *  cancelled render is usually in. That hang was why Cancel could appear to
 *  do nothing: the abort signal was set correctly, but the render's promise
 *  chain was stuck awaiting a close that never finished. Race it against a
 *  timeout and force-kill the underlying process if it doesn't. */
async function closeBrowserSafely(browser: Browser, timeoutMs = 5000): Promise<void> {
  // ponytail: a plain chromium.launch() Browser exposes no handle to the OS
  // process (only launchServer() does), so a close() that never resolves
  // can't be force-killed from here -- just stop waiting on it so the render
  // job (and Cancel) isn't held hostage. The orphaned process, if any, is
  // reaped by the OS/next server restart; upgrade to launchServer() if a
  // hard kill turns out to be needed.
  await Promise.race([
    browser.close().catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

const BGM_CACHE_DIR = path.join(process.cwd(), "output", ".bgm");

/** The generated (or cached) BGM file for a template id -- lazily rendered
 *  once, same pattern as the template-thumbnail cache below. */
export function ensureGeneratedBgm(templateId: string, seconds: number): string {
  const preset = BGM_PRESETS[templateId];
  if (!preset) throw new Error(`No BGM preset for template '${templateId}'.`);
  fs.mkdirSync(BGM_CACHE_DIR, { recursive: true });
  const wavPath = path.join(BGM_CACHE_DIR, `${templateId}.wav`);
  if (!fs.existsSync(wavPath)) fs.writeFileSync(wavPath, renderBgmWav(preset, Math.max(seconds, 20)));
  return wavPath;
}

interface EncoderChoice {
  codec: string;
  name: string;
  args: string[];
}

let cachedH264Encoder: EncoderChoice | null = null;

export async function detectBestH264Encoder(crf: string): Promise<EncoderChoice> {
  if (cachedH264Encoder) {
    // If cached, return adapted args for crf
    const isNvenc = cachedH264Encoder.codec === "h264_nvenc";
    const isQsv = cachedH264Encoder.codec === "h264_qsv";
    if (isNvenc) {
      return {
        codec: "h264_nvenc",
        name: "NVIDIA NVENC (GPU)",
        args: ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", crf, "-bf", "0", "-pix_fmt", "yuv420p"],
      };
    } else if (isQsv) {
      return {
        codec: "h264_qsv",
        name: "Intel QuickSync (GPU)",
        args: ["-c:v", "h264_qsv", "-global_quality", crf, "-pix_fmt", "nv12"],
      };
    } else {
      return {
        codec: "libx264",
        name: "libx264 (CPU)",
        args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", crf, "-bf", "0", "-pix_fmt", "yuv420p"],
      };
    }
  }

  // Probe NVENC first
  try {
    await execFileAsync(resolveTool("ffmpeg"), [
      "-y",
      "-f", "lavfi",
      "-i", "color=c=black:s=256x256:d=0.04",
      "-c:v", "h264_nvenc",
      "-f", "null",
      "-",
    ]);
    cachedH264Encoder = {
      codec: "h264_nvenc",
      name: "NVIDIA NVENC (GPU)",
      args: ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", crf, "-bf", "0", "-pix_fmt", "yuv420p"],
    };
    return cachedH264Encoder;
  } catch {}

  // Probe Intel QSV next
  try {
    await execFileAsync(resolveTool("ffmpeg"), [
      "-y",
      "-f", "lavfi",
      "-i", "color=c=black:s=256x256:d=0.04",
      "-c:v", "h264_qsv",
      "-f", "null",
      "-",
    ]);
    cachedH264Encoder = {
      codec: "h264_qsv",
      name: "Intel QuickSync (GPU)",
      args: ["-c:v", "h264_qsv", "-global_quality", crf, "-pix_fmt", "nv12"],
    };
    return cachedH264Encoder;
  } catch {}

  // Fallback to CPU libx264
  cachedH264Encoder = {
    codec: "libx264",
    name: "libx264 (CPU)",
    args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", crf, "-bf", "0", "-pix_fmt", "yuv420p"],
  };
  return cachedH264Encoder;
}

/** Renders every scene deterministically with GPU acceleration,
 *  multi-page scene parallelism, fast frame streaming, and hardware NVENC encoding. */
export async function renderVideo(
  project: VideoProject,
  opts: RenderOptions = {},
  onProgress?: (p: RenderProgress) => void
): Promise<string> {
  if (project.scenes.length === 0) throw new Error("No scenes configured -- pick a template first.");
  await ensureFfmpegAvailable();

  const signal = opts.signal;
  const checkAborted = () => {
    if (signal?.aborted) throw new RenderCancelled();
  };

  const report = (p: RenderProgress) => {
    if (onProgress) onProgress(p);
  };

  report({ phase: "preparing", percent: 1, message: "Preparing GPU render environment..." });
  checkAborted();

  const format = opts.format || "mp4";
  const fps = opts.fps || 30;
  const quality = opts.quality || "standard";
  const includeAudio = opts.includeAudio !== false;
  const audioVolume = opts.audioVolume ?? (project.bgmVolume ?? 1);

  let scenes = [...project.scenes].sort((a, b) => a.order - b.order);
  if (opts.sceneRange) {
    const [from, to] = opts.sceneRange;
    scenes = scenes.filter((s, idx) => (idx + 1) >= from && (idx + 1) <= to);
    if (scenes.length === 0) throw new Error("Scene range matches no scenes.");
  }

  const orientations = new Set(scenes.map((s) => orientationOf(s)));
  if (orientations.size > 1) throw new Error("Mixed-orientation project: every scene must share the same aspect ratio (9:16 or 16:9) before rendering.");

  const outDir = videoDir(project.id);

  const resolveUri = (rel: string) => {
    const abs = videoFile(project.id, rel);
    return dataUri(fs.existsSync(abs) ? abs : projectFile(project.id, rel));
  };

  // Compute total frames up front
  const sceneFrameCounts = scenes.map((s) => Math.round(Math.max(1, s.durationSeconds) * fps));
  const totalFrames = sceneFrameCounts.reduce((a, b) => a + b, 0);

  // Detect encoder choice
  let crf = quality === "high" ? "18" : quality === "small" ? "28" : "23";
  let encoderChoice: EncoderChoice;
  if (format === "webm") {
    encoderChoice = {
      codec: "libvpx-vp9",
      name: "libvpx-vp9",
      args: ["-c:v", "libvpx-vp9", "-crf", crf, "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p"],
    };
  } else {
    encoderChoice = await detectBestH264Encoder(crf);
  }

  const startTime = Date.now();
  let totalRenderedFrames = 0;

  // Scenes render strictly in order, one at a time: Scene 1's frames are all
  // captured and encoded before Scene 2 starts, matching how the project is
  // edited scene-by-scene and making "scene N of {total}" progress and the
  // final concat order unambiguous. Throughput instead comes from a pool of
  // pages capturing *within* one scene concurrently -- see POOL_SIZE below.
  const isGpu = encoderChoice.codec.includes("nvenc") || encoderChoice.codec.includes("qsv");
  const processorShort = isGpu ? "GPU" : "CPU";
  const acceleratorLabel = `${processorShort} (${encoderChoice.name})`;

  const rawVideoPath = path.join(outDir, `promo_raw_${Date.now()}.${format === "webm" ? "webm" : "mp4"}`);

  // Build scale/pad filter based on resolution & orientation options -- computed
  // up front now (not after capture) because the streaming ffmpeg process below
  // needs its full argument list before the first frame is even captured.
  const baseCanvas = canvasFor(scenes[0]);
  let targetWidth = baseCanvas.width;
  let targetHeight = baseCanvas.height;
  const isLandscape = baseCanvas.width > baseCanvas.height;

  if (opts.resolution && typeof opts.resolution === "object") {
    targetWidth = clampEven(opts.resolution.width);
    targetHeight = clampEven(opts.resolution.height);
  } else if (opts.resolution === "1080") {
    targetHeight = isLandscape ? 1080 : 1920;
    targetWidth = isLandscape ? 1920 : 1080;
  } else if (opts.resolution === "720") {
    targetHeight = isLandscape ? 720 : 1280;
    targetWidth = isLandscape ? 1280 : 720;
  } else if (opts.resolution === "480") {
    targetHeight = isLandscape ? 480 : 854;
    targetWidth = isLandscape ? 854 : 480;
  }

  if (opts.orientation === "square") {
    const side = Math.min(targetWidth, targetHeight);
    targetWidth = side;
    targetHeight = side;
  } else if (opts.orientation === "landscape" && targetWidth < targetHeight) {
    const tmp = targetWidth;
    targetWidth = targetHeight;
    targetHeight = tmp;
  } else if (opts.orientation === "portrait" && targetWidth > targetHeight) {
    const tmp = targetWidth;
    targetWidth = targetHeight;
    targetHeight = tmp;
  }

  const vfFilter = buildVfFilter(targetWidth, targetHeight, baseCanvas.width, baseCanvas.height, opts.orientation);

  // Each scene is piped straight into its own ffmpeg encode (image2pipe over
  // stdin) as a short segment, and the segments are stream-copied together at
  // the end. Two problems this avoids, both of which the live app hit:
  //  1. One JPEG file per frame (~1600 files) made throughput crawl to ~1fps with
  //     CPU/GPU near idle -- Windows Defender real-time protection (active on this
  //     machine) scans every new file on create, and that latency stalls the write
  //     without ever showing up as CPU/GPU/disk load. Now there are ~10 segment
  //     files instead of ~1600 frames, and no frames/ directory at all.
  //  2. Scenes render strictly one at a time now (see `concurrency` above), so
  //     each segment finishes fully -- capture, then its own encode -- before
  //     the next scene starts, and the segments are simply joined in order.
  const segmentDir = path.join(outDir, `segments_${Date.now()}`);
  fs.mkdirSync(segmentDir, { recursive: true });
  const segExt = format === "webm" ? "webm" : "mp4";
  const segmentPaths = scenes.map((_, i) => path.join(segmentDir, `seg_${String(i).padStart(3, "0")}.${segExt}`));
  const activeEncoders = new Set<ReturnType<typeof spawn>>();
  const killEncoders = () => activeEncoders.forEach((p) => p.kill("SIGKILL"));
  if (signal) signal.addEventListener("abort", killEncoders, { once: true });

  /** How many video frames actually made it into a segment file -- there's no
   *  vendored ffprobe, so this reads it back off ffmpeg's own progress output
   *  rather than trusting that a zero exit code means the frames all landed. */
  async function countSegmentFrames(segPath: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync(resolveTool("ffmpeg"), [
        "-v", "error", "-i", segPath, "-map", "0:v:0", "-c", "copy", "-f", "null",
        "-progress", "pipe:1", "-nostats", "-",
      ]);
      const matches = [...stdout.matchAll(/frame=(\d+)/g)];
      return matches.length ? parseInt(matches[matches.length - 1][1], 10) : 0;
    } catch {
      return 0;
    }
  }

  // -bf 0 (here and on every encoder choice above): each scene is its own
  // independently-encoded segment stitched together with -c copy, so every
  // scene boundary is a fresh GOP start. With B-frames enabled (NVENC's
  // default), a decoder has to buffer and reorder a few frames before it can
  // display anything from a new GOP -- ffmpeg's own seek-based frame checks
  // don't show this (it decodes properly, just not in real time), but a
  // player doing normal sequential playback stalls for those first few
  // frames while its reorder buffer refills. That's the "first 2-3 frames of
  // every scene stutter, then smooth" pattern. P-frames-only removes the
  // reorder buffer requirement entirely, so there's nothing to refill at a
  // GOP restart.
  const cpuFallbackArgs = ["-c:v", "libx264", "-preset", "veryfast", "-crf", quality === "high" ? "18" : quality === "small" ? "28" : "23", "-bf", "0", "-pix_fmt", "yuv420p"];

  function startSegmentEncoder(segPath: string, encoderArgs: string[] = encoderChoice.args) {
    const args = ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "pipe:0"];
    if (vfFilter) args.push("-vf", vfFilter);
    args.push(...encoderArgs, segPath);
    const proc = spawn(resolveTool("ffmpeg"), args, { stdio: ["pipe", "ignore", "pipe"] });
    activeEncoders.add(proc);
    let stderr = "";
    let exited = false;
    // stderr must be drained or ffmpeg blocks once the OS pipe buffer fills.
    proc.stderr!.on("data", (c) => { stderr = (stderr + c.toString()).slice(-2000); });
    // EPIPE if the encoder is killed (cancel) mid-write -- the exit code below is
    // what reports the real failure.
    proc.stdin!.on("error", () => {});
    const done = new Promise<void>((resolve, reject) => {
      proc.on("error", reject);
      proc.on("close", (code) => {
        exited = true;
        activeEncoders.delete(proc);
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg segment encode failed (exit ${code}): ${stderr.slice(-300)}`));
      });
    });
    // Observed later via finish(); without this a failure before then would be an
    // unhandled rejection that crashes the whole process (the previous version did).
    done.catch(() => {});
    return {
      async write(buf: Buffer) {
        // Encoder already gone (cancelled or crashed): its 'close' has fired, so a
        // drain/close wait below could never resolve -- that hang is why Cancel left
        // the job stuck "running". Return; the caller's checkAborted()/finish() report it.
        if (exited) return;
        if (!proc.stdin!.write(buf) && !exited) {
          await new Promise<void>((resolve) => {
            // Wait for drain, or for the encoder exiting (a drain that can't come) --
            // and detach whichever didn't fire, or every backpressured write leaks one.
            const finish = () => { proc.stdin!.off("drain", finish); proc.off("close", finish); resolve(); };
            proc.stdin!.once("drain", finish);
            proc.once("close", finish);
          });
        }
      },
      finish() {
        proc.stdin!.end();
        return done;
      },
    };
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-gpu",
      "--use-gl=angle",
      "--use-angle=d3d11",
      "--enable-accelerated-2d-canvas",
      "--enable-accelerated-video-decode",
      "--gpu-rasterization-msaa-sample-count=0",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--no-sandbox",
    ],
  });

  try {
    let lastReportTime = 0;
    let windowFrames = 0;
    let windowStartTime = Date.now();
    let dynamicFps = 0;

    // Every distinct device across the whole render, routed once per pool page
    // instead of once per scene.
    const allDeviceIds = [...new Set(scenes.map((s) => s.device))];

    // A fresh pool of pages *for every scene* -- within one scene, all pool
    // pages seek+screenshot different frames at once (a single page's
    // seek-then-screenshot round trip is mostly waiting, not compute, so one
    // page alone can't keep a GPU busy). Scenes stay strictly sequential --
    // scene N is fully captured, encoded and verified before scene N+1 starts.
    //
    // Pages are NOT reused across scenes, even though that sounds like the
    // obvious win: reusing a page for its next scene's `setContent()` leaves
    // some residual GPU-compositor/animation-timeline state that visibly
    // corrupts that scene's first ~100-150ms -- confirmed by isolating it to
    // exactly page reuse (reproduced even with a single page, zero
    // concurrency; gone the instant each scene gets brand-new pages). This
    // *is* the "scene 2 onward flickers/jumps" bug, on every scene after the
    // first one on a page. A prior version reused pages deliberately, to fix
    // an earlier ~1fps collapse -- but that collapse was actually caused by
    // writing one file per frame (thousands of tiny files, each hitting
    // Windows Defender's per-file scan), not by page-creation cost itself.
    // Since frames are now streamed straight into a per-scene ffmpeg encoder
    // (no per-frame files at all), that cause is gone and fresh pages are
    // cheap enough to afford per scene.
    const POOL_SIZE = 4;

    for (let sIdx = 0; sIdx < scenes.length; sIdx++) {
      checkAborted();
        const scene = scenes[sIdx];
        const sceneFrames = sceneFrameCounts[sIdx];
        const html = sceneHtml(
          scene,
          sourceUrisFor(project, scene, resolveUri, false),
          true,
          sourceKindsFor(project, scene),
          project,
          resolveUri,
          false
        );

        const pages = await Promise.all(
          Array.from({ length: POOL_SIZE }, () => browser.newPage({ viewport: canvasFor(scene) })),
        );
        await Promise.all(pages.map((page) => installThreeJsRoutes(page, allDeviceIds)));

        await Promise.all(pages.map(async (page) => {
          await page.setViewportSize(canvasFor(scene));
          await page.setContent(html, { waitUntil: "load" });
          // Every template's own template.html already ships a `body.rendering
          // .v-player-bar { display: none !important; }` rule for exactly this
          // (its standalone play/pause/scrubber/scene-chip overlay must never end
          // up baked into the exported frames) -- it just needs this class to
          // actually fire. Without it every frame captured the live player chrome,
          // which is what showed up as "flicker" (the scrubber/timer/active-chip
          // changing frame to frame) over the actual scene content.
          await page.evaluate(() => document.body.classList.add("rendering")).catch(() => {});
          // A screen-recording clip must be fully buffered before frame capture:
          // Chromium clamps a seek to the buffered range, so capturing early froze
          // the clip on whatever had loaded so far (~5s in) for the rest of the
          // scene. Capped at 15s so a broken clip can't hold up the render.
          await page.evaluate(async () => {
            const vids = Array.from(document.querySelectorAll("video"));
            const ready = (v: HTMLVideoElement) => !!v.error || (v.readyState >= 4 && v.buffered.length > 0 &&
              v.buffered.end(v.buffered.length - 1) >= v.duration - 0.05);
            vids.forEach((v) => { v.preload = "auto"; });
            for (const deadline = Date.now() + 15000; Date.now() < deadline && !vids.every(ready);) {
              await new Promise((r) => setTimeout(r, 50));
            }
          }).catch(() => {});
          // Warm-up: this page just navigated, so its WebGL context is still
          // compiling shaders / doing its first paint. The per-frame double-rAF
          // below only guards against animation-timeline lag on an already-warm
          // page -- it's too short to absorb a cold first paint, which is what
          // showed up as the first 2-4 frames of every scene shaking/repeating
          // before settling down. Seek to frame 0 and ride out several rAFs here,
          // once per scene setup, so that cold-start cost never lands in a
          // captured frame.
          await page.evaluate((t) => (window as any).seek(t), 0).catch(() => {});
          await page.evaluate(() => new Promise<void>((resolve) => {
            let n = 0;
            const tick = () => { if (++n >= 6) resolve(); else requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
          })).catch(() => {});
        }));

        let segment = startSegmentEncoder(segmentPaths[sIdx]);
        const sceneFrameBufs: Buffer[] = new Array(sceneFrames); // kept for a same-frames CPU retry below
        const frameBuf = new Map<number, Buffer>();
        let nextWriteFrame = 0;
        let draining = false;
        async function drainReadyFrames() {
          if (draining) return; // an in-progress call will pick up anything new -- see write() below
          draining = true;
          try {
            while (frameBuf.has(nextWriteFrame)) {
              const buf = frameBuf.get(nextWriteFrame)!;
              frameBuf.delete(nextWriteFrame);
              await segment.write(buf);
              nextWriteFrame++;
            }
          } finally {
            draining = false;
          }
        }

        let nextCaptureFrame = 0;
        const captureNext = async (page: import("playwright").Page) => {
          while (true) {
            checkAborted();
            const f = nextCaptureFrame++;
            if (f >= sceneFrames) return;
            const ms = (f / fps) * 1000;
            await page.evaluate((t) => (window as any).seek(t), ms);
            // Setting a Web Animation's currentTime doesn't synchronously repaint --
            // the new style only lands on the next rendering update. A screenshot
            // taken immediately can still capture the PREVIOUS frame's pose, and
            // which one wins is a timing race that gets worse under the 4-page
            // concurrent load above: exactly the "jumps back and forth between two
            // poses" flicker seen on every scene after the first (scene 1 happened
            // not to hit it, not because it's exempt). A double rAF forces a full
            // style+paint cycle to complete before the screenshot is taken.
            await page.evaluate(() => new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            }));
            const buf = await page.screenshot({ type: "jpeg", quality: 90 });
            sceneFrameBufs[f] = buf;
            frameBuf.set(f, buf);
            await drainReadyFrames();
            // Re-checked right after the slow part of each frame (not just before
            // it) so Cancel lands within one frame instead of costing whatever the
            // rest of the pool's in-flight frames would have taken.
            checkAborted();

            totalRenderedFrames++;
            windowFrames++;
            const now = Date.now();
            if (now - windowStartTime >= 1000) {
              dynamicFps = Math.round((windowFrames * 1000) / (now - windowStartTime));
              windowFrames = 0;
              windowStartTime = now;
            }
            if (now - lastReportTime > 250 || totalRenderedFrames === totalFrames) {
              lastReportTime = now;
              const percent = Math.min(92, Math.round(2 + (totalRenderedFrames / totalFrames) * 90));
              const elapsedSec = (now - startTime) / 1000;
              const overallFps = elapsedSec > 0 ? Math.round(totalRenderedFrames / elapsedSec) : 0;
              const activeFps = dynamicFps > 0 ? dynamicFps : overallFps;
              const remainingFrames = totalFrames - totalRenderedFrames;
              const etaSec = activeFps > 0 ? Math.round(remainingFrames / activeFps) : null;

              report({
                phase: "frames",
                percent,
                message: `Rendering frame ${totalRenderedFrames} / ${totalFrames} · scene ${sIdx + 1} of ${scenes.length}`,
                frame: totalRenderedFrames,
                totalFrames,
                scene: sIdx + 1,
                sceneCount: scenes.length,
                fps: activeFps,
                etaSec,
                accelerator: processorShort,
                encoder: encoderChoice.name,
              });
            }
          }
        };

        await Promise.all(pages.map((page) => captureNext(page)));
        await drainReadyFrames(); // flush anything left buffered after the last page finished

        checkAborted();
        let segmentOk = false;
        try {
          await segment.finish();
          segmentOk = (await countSegmentFrames(segmentPaths[sIdx])) === sceneFrames;
        } catch {
          segmentOk = false;
        }
        if (!segmentOk) {
          // The GPU encoder produced a short/empty segment (exactly the "frozen,
          // repeats one frame" symptom a later concat would bake in) -- same
          // captured frames, re-encoded once on the CPU before giving up.
          fs.rmSync(segmentPaths[sIdx], { force: true });
          segment = startSegmentEncoder(segmentPaths[sIdx], cpuFallbackArgs);
          for (const buf of sceneFrameBufs) await segment.write(buf);
          await segment.finish();
          const cpuFrames = await countSegmentFrames(segmentPaths[sIdx]);
          if (cpuFrames !== sceneFrames) {
            throw new Error(`Scene ${sIdx + 1} failed to encode (expected ${sceneFrames} frames, got ${cpuFrames}) even after a CPU retry.`);
          }
        }

      await Promise.all(pages.map((page) => page.close().catch(() => {})));
    }
  } catch (err) {
    killEncoders();
    // Retries: a just-killed ffmpeg on Windows can hold its segment file briefly.
    try { fs.rmSync(segmentDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
    throw err;
  } finally {
    // See closeBrowserSafely's doc comment -- a graceful close() can hang when
    // the browser is under the same load that made frames slow, which is
    // exactly the moment Cancel needs this to resolve promptly.
    await closeBrowserSafely(browser);
  }

  checkAborted();
  report({
    phase: "encoding",
    percent: 94,
    message: `Joining ${scenes.length} encoded scene${scenes.length === 1 ? "" : "s"}...`,
    accelerator: acceleratorLabel,
    encoder: encoderChoice.name,
  });
  // Stream copy (no re-encode): every segment was encoded with identical codec,
  // size and frame rate, so the concat demuxer just joins them -- near-instant.
  const concatList = path.join(segmentDir, "list.txt");
  fs.writeFileSync(concatList, segmentPaths.map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  try {
    await execFileAsync(resolveTool("ffmpeg"), [
      "-y", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", concatList,
      "-c", "copy",
      ...(format === "mp4" ? ["-movflags", "+faststart"] : []),
      rawVideoPath,
    ]);
  } finally {
    // Retries: a just-killed ffmpeg on Windows can hold its segment file briefly.
    try { fs.rmSync(segmentDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  }

  checkAborted();

  const totalSeconds = scenes.reduce((sum, s) => sum + Math.max(1, s.durationSeconds), 0);
  const exportsDir = path.join(outDir, "exports");
  fs.mkdirSync(exportsDir, { recursive: true });

  const finalFileName = cleanExportFileName(opts.fileName, format);
  const finalVideoPath = path.join(exportsDir, finalFileName);
  const defaultPromoPath = path.join(outDir, `promo.${format}`);

  let bgmPath: string | null = null;
  if (includeAudio) {
    report({ phase: "audio", percent: 93, message: "Mixing background music & audio..." });
    if (project.bgm) {
      const candidate = videoFile(project.id, project.bgm);
      if (fs.existsSync(candidate)) {
        bgmPath = candidate;
      }
    }
    if (!bgmPath && project.template && BGM_PRESETS[project.template]) {
      try {
        bgmPath = ensureGeneratedBgm(project.template, totalSeconds);
      } catch {}
    }
  }

  if (bgmPath && includeAudio) {
    const fadeInMs = project.bgmFadeInMs ?? 1500;
    const fadeOutMs = project.bgmFadeOutMs ?? 2000;
    const fadeOutStart = Math.max(0, totalSeconds - fadeOutMs / 1000);
    // loudnorm first: the generated BGM track is soft on its own (mean ~-22dB),
    // easy to miss under any scene audio -- normalize to a standard broadcast
    // level (-16 LUFS) before the user's own volume slider scales from there,
    // instead of scaling an already-quiet source.
    const audioFilter = `[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,volume=${audioVolume},afade=t=in:st=0:d=${(fadeInMs / 1000).toFixed(2)},afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${(fadeOutMs / 1000).toFixed(2)}[a]`;

    const audioArgs = [
      "-y",
      "-i", rawVideoPath,
      "-stream_loop", "-1",
      "-i", bgmPath,
      "-filter_complex", audioFilter,
      "-map", "0:v",
      "-map", "[a]",
      "-c:v", "copy",
      "-c:a", format === "webm" ? "libopus" : "aac",
      // loudnorm (in audioFilter above) combined with -stream_loop -1 on the BGM
      // input makes ffmpeg silently auto-negotiate the encoder's sample rate up
      // to 96kHz (confirmed: a 44.1kHz source in, 96kHz AAC out) instead of
      // matching the source. That's valid AAC, but common consumer decoders
      // (Windows' own default player among them) don't handle 96kHz AAC and
      // play the file back with no audio at all -- silently, no error, exactly
      // the "no audio" reports despite ffprobe/ffplay showing a normal-looking
      // stream. Pin the output to a standard, universally-supported rate.
      "-ar", "48000",
      "-shortest",
      finalVideoPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const ff = spawn(resolveTool("ffmpeg"), audioArgs);
      if (signal) {
        signal.addEventListener("abort", () => {
          ff.kill("SIGKILL");
          reject(new RenderCancelled());
        }, { once: true });
      }
      let audioStderr = "";
      ff.stderr.on("data", (chunk) => {
        audioStderr += chunk.toString();
      });
      ff.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg audio mixing failed with exit code ${code}: ${audioStderr.slice(-300)}`));
      });
    });

    fs.rmSync(rawVideoPath, { force: true });
  } else {
    fs.renameSync(rawVideoPath, finalVideoPath);
  }

  // Also copy/symlink to standard promo.<ext> for backwards compatibility
  fs.copyFileSync(finalVideoPath, defaultPromoPath);

  report({ phase: "done", percent: 100, message: "Export complete!", width: targetWidth, height: targetHeight });

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
