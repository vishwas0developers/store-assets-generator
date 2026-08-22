import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import {
  BACKGROUNDS,
  DEVICE_CSS,
  backgroundCss,
  dataUri,
  decorationsMarkup,
  deviceMarkup,
  deviceMarkupMultiScreen,
  device3dMarkup,
  deviceScaleFor,
  escapeHtml,
  type DecorationLike,
} from "../render/shared.js";
import { DEVICE_REGISTRY, resolveGeometry, frameSvgFor, type DeviceModel } from "../devices/registry.js";
import { videoDir, videoFile, type VideoProject, type VideoScene } from "./project.js";
import { VIDEO_TEMPLATES, type VideoTemplate } from "./templates.js";
import { BGM_PRESETS, renderBgmWav } from "./bgm.js";

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
      55%  { transform: perspective(1800px) rotateY(${rot * 0.4}deg) translateY(0) scale(${1 + s.zoom / 120}); opacity: 1; }
      88%  { transform: perspective(1800px) rotateY(0deg) translateY(0) scale(${1 + s.zoom / 120}); opacity: 1; }
      100% { transform: perspective(1800px) rotateY(0deg) translateY(0) scale(${1 + s.zoom / 130}); opacity: 1; }
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
      50%  { transform: scale(${1.02 + s.zoom / 150}) translateY(0); opacity: 1; }
      65%  { transform: scale(${1 + s.zoom / 120}) translateY(0); opacity: 1; }
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
    deviceKeyframes: (s) => `
      0%   { transform: perspective(2000px) rotateY(-360deg) scale(0.85); opacity: 0; }
      10%  { opacity: 1; }
      36%  { transform: perspective(2000px) rotateY(0deg) scale(1); opacity: 1; }
      46%  { transform: perspective(2000px) rotateY(0deg) scale(1); opacity: 1; }
      72%  { transform: perspective(2000px) rotateY(0deg) scale(1.68); opacity: 1; }
      100% { transform: perspective(2000px) rotateY(0deg) scale(1.68); opacity: 1; }
    `,
    backdropKeyframes: () => `
      0%   { transform: scale(1.05); filter: brightness(1); }
      50%  { transform: scale(1.15); filter: brightness(0.85); }
      100% { transform: scale(1.2); filter: brightness(0.7); }
    `,
    renderDevice: (device, uris, kinds, scene, durationMs) => device3dMarkup(device, uris, scene.variant, durationMs, kinds),
  },
  "landscape-flow": {
    id: "landscape-flow",
    name: "Landscape flow (screen recording showcase)",
    easing: "cubic-bezier(.2,.85,.25,1)",
    // Phone enters centrally with a 360-degree 3D spin, then scales up to match vertical frame height.
    // Alternating subtitle labels display on left & right.
    deviceKeyframes: (s) => `
      0%   { transform: perspective(2000px) rotateY(-360deg) scale(0.85); opacity: 0; }
      10%  { opacity: 1; }
      32%  { transform: perspective(2000px) rotateY(0deg) scale(1); opacity: 1; }
      40%  { transform: perspective(2000px) rotateY(0deg) scale(1); opacity: 1; }
      60%  { transform: perspective(2000px) rotateY(0deg) scale(1.56); opacity: 1; }
      100% { transform: perspective(2000px) rotateY(0deg) scale(1.56); opacity: 1; }
    `,
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
      45%  { transform: perspective(2000px) rotateY(-12deg) rotateX(2deg) translateZ(0) scale(${1 + s.zoom / 130}); opacity: 1; }
      70%  { transform: perspective(2000px) rotateY(4deg) rotateX(0deg) translateZ(0) scale(${1 + s.zoom / 110}); opacity: 1; }
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1020 2340" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <rect width="1020" height="2340" fill="#eef1f6"/>
    ${header}
    ${body}
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Depth-aware device rendering for scenes with no custom `renderDevice`
 *  hook: "flat" is today's plain frame (default), "perspective" tilts that
 *  same flat plane with a matched shadow, "float"/"showcase" use the
 *  genuine six-face 3D rig (device3dMarkup) -- real thickness, not a
 *  border around a flat image. */
function deviceRigMarkup(device: DeviceModel, uris: string[], kinds: ("image" | "video")[], scene: VideoScene, durationMs: number): string {
  const depth = scene.depth ?? "flat";
  if (depth === "flat") {
    return uris.length > 1 ? deviceMarkupMultiScreen(device, uris, scene.variant, durationMs, kinds) : deviceMarkup(device, uris[0] ?? "", scene.variant, kinds[0] ?? "image");
  }
  if (depth === "perspective") {
    const inner = uris.length > 1 ? deviceMarkupMultiScreen(device, uris, scene.variant, durationMs, kinds) : deviceMarkup(device, uris[0] ?? "", scene.variant, kinds[0] ?? "image");
    return `<div class="device-tilt">${inner}</div>`;
  }
  const rig = device3dMarkup(device, uris, scene.variant, durationMs, kinds);
  return depth === "float" ? `<div class="device-float">${rig}</div>` : rig;
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

/** Splits text into word `<span>`s with a per-word entrance delay, so the
 *  title reads as a staggered reveal rather than popping in as one block. */
function wordSpans(text: string, className: string, baseDelayMs: number, stepMs: number): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => `<span class="${className}" style="animation-delay:${baseDelayMs + i * stepMs}ms">${escapeHtml(word)}</span>`)
    .join(" ");
}

/** Shared text-block CSS: word-by-word entrance for title/subtitle. The
 *  exit fade itself is emitted per-scene by `sceneLayoutCss` (its timing
 *  depends on that scene's duration). */
const WORD_SPAN_CSS = `
  .word { display: inline-block; opacity: 0; transform: translateY(22px); animation: wordIn 560ms cubic-bezier(.16,1,.3,1) forwards; }
  @keyframes wordIn { 0% { opacity: 0; transform: translateY(22px); } 100% { opacity: 1; transform: translateY(0); } }
`;

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

function flowLabelsHtml(scene: VideoScene, durationMs: number): string {
  if (!scene.flowSteps || scene.flowSteps.length === 0) return "";
  return scene.flowSteps
    .map((step, idx) => {
      const startMs = step.startSec * 1000;
      const stepDurMs = Math.max(800, step.durationSec * 1000);
      const isLeft = step.side === "left";
      const animName = `flowStepAnim_${idx}`;
      const sideClass = isLeft ? "flow-label-left" : "flow-label-right";
      const inTranslate = isLeft ? "-32px" : "32px";
      return `
        <div class="flow-label ${sideClass}" style="animation: ${animName} ${stepDurMs}ms ${startMs}ms cubic-bezier(.2,.85,.25,1) forwards;">
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

function sceneLayoutCss(scene: VideoScene, animation: SceneAnimation, durationMs: number, selector: string, keyframeSuffix: string, gateSelector: string = selector): string {
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
    ${selector} .backdrop { background: ${backgroundCss(scene.background)}; }
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

export function composeStandaloneHtml(project: VideoProject, activeSceneIndex?: number, screenshotUris: string[] = []): string {
  const templateId = project.template || "iphone-15-pro-portrait";
  const htmlPath = path.join(process.cwd(), "templates", "video", templateId, "template.html");
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Standalone template HTML not found at ${htmlPath}`);
  }
  let html = fs.readFileSync(htmlPath, "utf-8");

  // Read config from script tag
  const match = html.match(/<script type="application\/json" id="template-config">([\s\S]*?)<\/script>/);
  if (!match) return html;

  const config = JSON.parse(match[1]);
  const scenes = config.scenes || [];

  // Calculate scene offset if activeSceneIndex is set
  let sceneStartMs = 0;
  if (activeSceneIndex !== undefined) {
    for (let idx = 0; idx < activeSceneIndex; idx++) {
      sceneStartMs += scenes[idx]?.durationMs || ((scenes[idx]?.durationSeconds || 5) * 1000);
    }
  }

  // Construct values payload to inject
  const screenshots: { slotId: string; url: string }[] = [];
  const texts: { slotId: string; val: string }[] = [];

  // Mappings
  project.scenes.forEach((pScene, idx) => {
    const tScene = scenes[idx];
    if (!tScene || !tScene.slots) return;
    const slots = tScene.slots;

    // Map title/subtext
    if (slots.text) {
      texts.push({ slotId: slots.text, val: pScene.text || "" });
    }
    if (slots.subtext) {
      texts.push({ slotId: slots.subtext, val: pScene.subtext || "" });
    }

    // Map screenshots
    if (activeSceneIndex !== undefined && idx === activeSceneIndex) {
      if (slots.screenshot && screenshotUris[0]) {
        screenshots.push({ slotId: slots.screenshot, url: screenshotUris[0] });
      }
      if (slots.screenshots && Array.isArray(slots.screenshots)) {
        slots.screenshots.forEach((slotId: string, sIdx: number) => {
          if (screenshotUris[sIdx]) {
            screenshots.push({ slotId, url: screenshotUris[sIdx] });
          }
        });
      }
    } else {
      const screenIds = pScene.screenIds || (pScene.sourceId ? [pScene.sourceId] : []);
      if (slots.screenshot) {
        const src = project.sources.find(s => s.id === screenIds[0]);
        if (src) {
          const url = `/api/videos/${project.id}/file?p=${encodeURIComponent(src.file)}`;
          screenshots.push({ slotId: slots.screenshot, url });
        }
      }
      if (slots.screenshots && Array.isArray(slots.screenshots)) {
        slots.screenshots.forEach((slotId: string, sIdx: number) => {
          const src = project.sources.find(s => s.id === screenIds[sIdx]);
          if (src) {
            const url = `/api/videos/${project.id}/file?p=${encodeURIComponent(src.file)}`;
            screenshots.push({ slotId, url });
          }
        });
      }
    }
  });

  const injectionScript = `
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      const screenshots = ${JSON.stringify(screenshots)};
      const texts = ${JSON.stringify(texts)};
      
      // Apply screenshots to image slots
      screenshots.forEach(s => {
        const img = document.getElementById(s.slotId);
        if (img) img.src = s.url;
      });

      // Apply texts to copy elements
      texts.forEach(t => {
        const el = document.getElementById(t.slotId);
        if (el) el.textContent = t.val;
      });

      // Apply seek offset adapter if activeSceneIndex is set
      if (${activeSceneIndex !== undefined}) {
        const originalSeek = window.seek;
        const startMs = ${sceneStartMs};
        window.seek = (ms) => {
          if (typeof originalSeek === 'function') {
            return originalSeek(startMs + ms);
          }
        };
      }
    });
  </script>
  `;

  html = html.replace("</body>", `${injectionScript}</body>`);
  return html;
}

/** The single generator used by both preview and render. */
export function sceneHtml(scene: VideoScene, screenshotUris: string[], seekable = false, screenshotKinds: ("image" | "video")[] = [], project?: VideoProject): string {
  if (project && project.template) {
    const htmlPath = path.join(process.cwd(), "templates", "video", project.template, "template.html");
    if (fs.existsSync(htmlPath)) {
      return composeStandaloneHtml(project, scene.order, screenshotUris);
    }
  }

  const device = DEVICE_REGISTRY[scene.device] ?? DEVICE_REGISTRY["phone"];
  if (!device) throw new Error(`Device '${scene.device}' not found in registry`);
  const animation = SCENE_ANIMATIONS[scene.sceneTemplate] ?? SCENE_ANIMATIONS["hero-rise"];
  const canvas = canvasFor(scene);
  const durationMs = Math.max(1, scene.durationSeconds) * 1000;

  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  html, body { margin: 0; padding: 0; width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; }
  ${CANVAS_BASE_CSS}
  .canvas { width: ${canvas.width}px; height: ${canvas.height}px; }
  ${DEVICE_CSS}
  ${WORD_SPAN_CSS}
  ${FLOW_LABEL_CSS}
  ${foldRigCss(durationMs)}
  ${sceneLayoutCss(scene, animation, durationMs, ".canvas", "")}
</style></head>
<body>
  <div class="canvas">${sceneContentHtml(scene, device, screenshotUris, screenshotKinds, durationMs)}</div>
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
</body></html>`;
}

function previewResolveUri(projectId: string) {
  return (rel: string) => `/api/videos/${projectId}/file?p=${encodeURIComponent(rel)}`;
}

export function scenePreviewHtml(project: VideoProject, sceneId: string): string {
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error(`Scene '${sceneId}' not found in project ${project.id}`);
  const resolveUri = previewResolveUri(project.id);
  return sceneHtml(scene, sourceUrisFor(project, scene, resolveUri), false, sourceKindsFor(project, scene), project);
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
      return sceneLayoutCss(scene, animation, durationMs, `.scene-${i}`, `-${i}`, `.scene-${i}.playing`);
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
    ${WORD_SPAN_CSS}
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

function ensureFfmpegAvailable(): void {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg is not installed or not on PATH. Install ffmpeg and ensure the 'ffmpeg' command is available, then retry.");
  }
}

const BGM_CACHE_DIR = path.join(process.cwd(), "output", ".bgm");

/** The generated (or cached) BGM file for a template id -- lazily rendered
 *  once, same pattern as the template-thumbnail cache below. */
function ensureGeneratedBgm(templateId: string, seconds: number): string {
  const preset = BGM_PRESETS[templateId];
  if (!preset) throw new Error(`No BGM preset for template '${templateId}'.`);
  fs.mkdirSync(BGM_CACHE_DIR, { recursive: true });
  const wavPath = path.join(BGM_CACHE_DIR, `${templateId}.wav`);
  if (!fs.existsSync(wavPath)) fs.writeFileSync(wavPath, renderBgmWav(preset, Math.max(seconds, 20)));
  return wavPath;
}

/** Renders every scene deterministically via frame-stepped seek(), then
 *  encodes with FFmpeg in one call and muxes BGM (uploaded, or generated
 *  from the project's template preset) with volume + fade in/out. */
export async function renderVideo(project: VideoProject): Promise<string> {
  if (project.scenes.length === 0) throw new Error("No scenes configured -- pick a template first.");
  ensureFfmpegAvailable();

  const orientations = new Set(project.scenes.map((s) => orientationOf(s)));
  if (orientations.size > 1) throw new Error("Mixed-orientation project: every scene must share the same aspect ratio (9:16 or 16:9) before rendering.");

  const outDir = videoDir(project.id);
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
      const html = sceneHtml(scene, sourceUrisFor(project, scene, resolveUri), true, sourceKindsFor(project, scene), project);
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

  const totalSeconds = project.scenes.reduce((sum, s) => sum + Math.max(1, s.durationSeconds), 0);
  const rawVideoPath = path.join(outDir, "promo_raw.mp4");
  execSync(`ffmpeg -y -framerate ${FPS} -i "${framesDir}/frame_%06d.png" -c:v libx264 -pix_fmt yuv420p "${rawVideoPath}"`, { stdio: "ignore" });

  const finalVideoPath = path.join(outDir, "promo.mp4");
  const bgmPath = project.bgm ? videoFile(project.id, project.bgm) : project.template ? ensureGeneratedBgm(project.template, totalSeconds) : null;

  if (bgmPath) {
    const volume = project.bgmVolume ?? 0.35;
    const fadeInMs = project.bgmFadeInMs ?? 1500;
    const fadeOutMs = project.bgmFadeOutMs ?? 2000;
    const fadeOutStart = Math.max(0, totalSeconds - fadeOutMs / 1000);
    const filter = `[1:a]volume=${volume},afade=t=in:st=0:d=${(fadeInMs / 1000).toFixed(2)},afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${(fadeOutMs / 1000).toFixed(2)}[a]`;
    execSync(
      `ffmpeg -y -i "${rawVideoPath}" -stream_loop -1 -i "${bgmPath}" -filter_complex "${filter}" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest "${finalVideoPath}"`,
      { stdio: "ignore" },
    );
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
