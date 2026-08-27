import fs from "fs";
import { frameSvgFor, resolveGeometry, type DeviceModel } from "../devices/registry.js";

// A render pass (multi-scene video, multi-cell mockup grid) commonly reuses the same
// source screenshot many times; cache its base64 encoding instead of re-reading per use.
const dataUriCache = new Map<string, string>();

/** Inline the screenshot so rendered HTML is self-contained (no file:// or
 *  http fetches to race with the screenshot call). */
export function dataUri(absPath: string): string {
  let cached = dataUriCache.get(absPath);
  if (cached === undefined) {
    cached = `data:image/png;base64,${fs.readFileSync(absPath, "base64")}`;
    dataUriCache.set(absPath, cached);
  }
  return cached;
}

/** Call when a capture file is deleted -- capture IDs (and therefore filenames) can be
 *  reused after all captures are cleared, so a stale cache entry must not survive that. */
export function invalidateDataUri(absPath: string): void {
  dataUriCache.delete(absPath);
}

export function escapeHtml(value: string): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** The device-in-frame block, shared by the mockup step and the video step
 *  so a screenshot looks identical in the store package and in the promo.
 *  `variantId` selects a foldable's folded/unfolded geometry. `kind` picks
 *  an `<img>` (default) or an autoplaying, muted `<video>` for a real screen
 *  recording -- see window.seek's <video> handling in video/render.ts for
 *  how the render pipeline keeps that deterministic under frame-stepping. */
export function deviceMarkup(device: DeviceModel, screenshotUri: string, variantId?: string, kind: "image" | "video" = "image"): string {
  const g = resolveGeometry(device, variantId);
  const r = g.cornerRadius ?? 0;
  const screenStyle = `top:${g.screenInset.top - 1}px;left:${g.screenInset.left - 1}px;width:${g.screenInset.width + 2}px;height:${g.screenInset.height + 2}px;border-radius:${r}px;clip-path:inset(0 round ${r}px);object-fit:cover;object-position:top center;`;
  const screenEl =
    kind === "video"
      ? `<video class="device-screen" src="${screenshotUri}" style="${screenStyle}" autoplay muted loop playsinline></video>`
      : `<img class="device-screen" src="${screenshotUri}" style="${screenStyle}" />`;
  return `<div class="device" style="width:${g.width}px;height:${g.height}px">
      ${screenEl}
      <div class="device-frame">${frameSvgFor(device, variantId)}</div>
    </div>`;
}

/** Physical thickness for the 3D rig -- a data-driven trait
 *  (`frame.thickness`) with a bezel-proportional fallback so every existing
 *  catalogue entry (no `thickness` field) still renders a plausible body. */
function deviceThickness(device: DeviceModel): number {
  return device.frame.thickness ?? Math.round((device.frame.bezelWidth || 24) * 1.6);
}

/** Genuine six-face 3D device -- front, back, left, right, top and bottom
 *  as separate `preserve-3d` planes positioned with `translateZ`/`rotateX`/
 *  `rotateY` at half the device's thickness. Rotating the *ancestor* that
 *  wraps this markup (see video/render.ts's showcase-3d / "float" depth
 *  modes) genuinely reveals the side rails and back panel, because they are
 *  real planes in 3D space -- not a border drawn around a flat image.
 *  `screenshotUris` (1+) drives the front face: a single URI renders once,
 *  2+ cross-fades via `deviceMarkupMultiScreen`. */
export function device3dMarkup(device: DeviceModel, screenshotUris: string[], variantId: string | undefined, durationMs: number, kinds: ("image" | "video")[] = []): string {
  const g = resolveGeometry(device, variantId);
  const t = deviceThickness(device);
  const half = t / 2;
  const uris = screenshotUris.filter(Boolean);
  const front = uris.length > 1 ? deviceMarkupMultiScreen(device, uris, variantId, durationMs, kinds) : deviceMarkup(device, uris[0] ?? "", variantId, kinds[0] ?? "image");
  const r = device.frame.outerRadius;
  const body = device.frame.body || "#1e2025";
  const accent = device.frame.accent || "#3a3f4b";

  const sideLeftRight = `linear-gradient(to bottom, rgba(255,255,255,0.2) 0%, ${body} 20%, ${body} 80%, rgba(0,0,0,0.3) 100%)`;
  const sideTop = `linear-gradient(to right, rgba(255,255,255,0.15) 0%, ${body} 25%, ${body} 75%, rgba(0,0,0,0.25) 100%)`;
  const sideBottom = `linear-gradient(to right, rgba(0,0,0,0.25) 0%, ${body} 25%, ${body} 75%, rgba(255,255,255,0.15) 100%)`;

  return `<div class="device-rig-wrap">
      <div class="device-rig" style="width:${g.width}px;height:${g.height}px;transform-style:preserve-3d;position:relative;">
        <!-- Front Face -->
        <div class="device-face device-front" style="width:${g.width}px;height:${g.height}px;transform:translateZ(${half}px);border-radius:${r}px;padding:4px;box-sizing:border-box;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 20px 45px rgba(0,0,0,.5);position:absolute;left:0;top:0;">
          ${front}
          <div class="device-sheen"></div>
        </div>
        <!-- Back Face -->
        <div class="device-face device-back" style="width:${g.width}px;height:${g.height}px;border-radius:${r}px;background:${body};transform:translateZ(-${half}px) rotateY(180deg);position:absolute;left:0;top:0;border:1px solid ${accent};">
          <!-- Realistic Camera Bump -->
          <div style="position:absolute; top:25px; left:25px; width:${Math.round(g.width * 0.32)}px; height:${Math.round(g.width * 0.32)}px; background:${accent}; border-radius:24px; box-shadow:0 4px 12px rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.15); display:flex; flex-wrap:wrap; gap:12px; padding:16px; box-sizing:border-box; align-items:center; justify-content:center;">
            <div class="device-lens" style="width:34px; height:34px; border-radius:50%; background:radial-gradient(circle at 30% 30%, #555 0%, #080808 70%); border:2px solid #222; box-shadow:inset 0 2px 4px rgba(255,255,255,0.25);"></div>
            <div class="device-lens" style="width:34px; height:34px; border-radius:50%; background:radial-gradient(circle at 30% 30%, #555 0%, #080808 70%); border:2px solid #222; box-shadow:inset 0 2px 4px rgba(255,255,255,0.25);"></div>
            <div class="device-lens" style="width:34px; height:34px; border-radius:50%; background:radial-gradient(circle at 30% 30%, #555 0%, #080808 70%); border:2px solid #222; box-shadow:inset 0 2px 4px rgba(255,255,255,0.25);"></div>
          </div>
        </div>
        <!-- Top Face -->
        <div class="device-face device-side" style="width:${g.width}px;height:${t}px;position:absolute;left:0;top:-${t}px;background:${sideTop};transform-origin: bottom center;transform:rotateX(90deg);border-bottom:1px solid rgba(255,255,255,0.15);">
          <!-- Top microphone hole -->
          <div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:6px; height:6px; border-radius:50%; background:#111;"></div>
        </div>
        <!-- Bottom Face -->
        <div class="device-face device-side" style="width:${g.width}px;height:${t}px;position:absolute;left:0;top:${g.height}px;background:${sideBottom};transform-origin: top center;transform:rotateX(-90deg);border-top:1px solid rgba(255,255,255,0.15);">
          <!-- USB-C Port -->
          <div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:60px; height:12px; background:#111; border-radius:6px; border:1px solid #444; box-shadow:inset 0 2px 4px rgba(0,0,0,0.8);"></div>
          <!-- Speaker holes -->
          <div style="position:absolute; left:30%; top:50%; transform:translateY(-50%); display:flex; gap:4px;">
            <span style="width:5px; height:5px; border-radius:50%; background:#111;"></span>
            <span style="width:5px; height:5px; border-radius:50%; background:#111;"></span>
            <span style="width:5px; height:5px; border-radius:50%; background:#111;"></span>
            <span style="width:5px; height:5px; border-radius:50%; background:#111;"></span>
          </div>
        </div>
        <!-- Left Face -->
        <div class="device-face device-side" style="width:${t}px;height:${g.height}px;position:absolute;left:-${t}px;top:0;background:${sideLeftRight};transform-origin: right center;transform:rotateY(-90deg);border-right:1px solid rgba(255,255,255,0.15);">
          <!-- Volume buttons -->
          <div class="side-btn volume-up" style="position:absolute;width:${t}px;height:55px;top:170px;left:0;background:linear-gradient(to bottom, #777, #333);border:1px solid #222;border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>
          <div class="side-btn volume-down" style="position:absolute;width:${t}px;height:55px;top:235px;left:0;background:linear-gradient(to bottom, #777, #333);border:1px solid #222;border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>
        </div>
        <!-- Right Face -->
        <div class="device-face device-side" style="width:${t}px;height:${g.height}px;position:absolute;left:${g.width}px;top:0;background:${sideLeftRight};transform-origin: left center;transform:rotateY(90deg);border-left:1px solid rgba(255,255,255,0.15);">
          <!-- Power button -->
          <div class="side-btn power-btn" style="position:absolute;width:${t}px;height:75px;top:210px;left:0;background:linear-gradient(to bottom, #777, #333);border:1px solid #222;border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>
        </div>
      </div>
      <div class="device-reflection" style="width:${g.width}px;height:${g.height}px">
        <div class="device-face device-front" style="transform:translateZ(${half}px);border-radius:${r}px;padding:4px;box-sizing:border-box">${front}</div>
      </div>
    </div>`;
}

/** Same as `deviceMarkup` but stacks multiple screenshots inside the screen
 *  aperture and cross-fades between them on evenly-spaced keyframes across
 *  `durationMs` -- lets one scene show several UI states inside the same
 *  device instead of one static screenshot for the whole scene. Pure CSS
 *  (named per-layer keyframes), so it stays deterministic under
 *  `window.seek` -> `document.getAnimations()` just like every other
 *  animation in the render pipeline. */
export function deviceMarkupMultiScreen(device: DeviceModel, screenshotUris: string[], variantId: string | undefined, durationMs: number, kinds: ("image" | "video")[] = []): string {
  const uris = screenshotUris.filter(Boolean);
  if (uris.length <= 1) return deviceMarkup(device, uris[0] ?? "", variantId, kinds[0] ?? "image");

  const g = resolveGeometry(device, variantId);
  const r = g.cornerRadius ?? 0;
  const holdPct = 100 / uris.length;
  const fadeMs = 260;
  const fadePct = Math.min(holdPct * 0.35, (fadeMs / durationMs) * 100);

  const layers = uris
    .map((uri, i) => {
      const inPct = i === 0 ? 0 : i * holdPct;
      const outPct = (i + 1) * holdPct;
      const kf =
        i === 0
          ? `0% { opacity: 1 } ${Math.max(0, outPct - fadePct).toFixed(2)}% { opacity: 1 } ${outPct.toFixed(2)}% { opacity: 0 } 100% { opacity: 0 }`
          : `0% { opacity: 0 } ${inPct.toFixed(2)}% { opacity: 0 } ${(inPct + fadePct).toFixed(2)}% { opacity: 1 } ${Math.max(inPct + fadePct, outPct - fadePct).toFixed(2)}% { opacity: 1 } ${outPct.toFixed(2)}% { opacity: ${i === uris.length - 1 ? 1 : 0} } 100% { opacity: ${i === uris.length - 1 ? 1 : 0} }`;
      const screenStyle = `top:${g.screenInset.top - 1}px;left:${g.screenInset.left - 1}px;width:${g.screenInset.width + 2}px;height:${g.screenInset.height + 2}px;border-radius:${r}px;clip-path:inset(0 round ${r}px);object-fit:cover;object-position:top center;animation:screenSwap${i} ${durationMs}ms ease-in-out forwards;`;
      const media = kinds[i] === "video" ? `<video class="device-screen device-screen-${i}" src="${uri}" style="${screenStyle}" autoplay muted loop playsinline></video>` : `<img class="device-screen device-screen-${i}" src="${uri}" style="${screenStyle}" />`;
      return `${media}
        <style>@keyframes screenSwap${i} { ${kf} }</style>`;
    })
    .join("\n");

  return `<div class="device" style="width:${g.width}px;height:${g.height}px">
      ${layers}
      <div class="device-frame">${frameSvgFor(device, variantId)}</div>
    </div>`;
}

export const DEVICE_CSS = `
  .device { position: relative; filter: drop-shadow(0 20px 35px rgba(0,0,0,.45)); }
  .device-screen { position: absolute; object-fit: cover; object-position: top center; z-index: 1; overflow: hidden; }
  .device-frame { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; }
  .device-frame svg { width: 100%; height: 100%; display: block; overflow: hidden; }
  .device-glow { position: absolute; inset: -6%; z-index: 0; background: radial-gradient(circle, rgba(255,255,255,.16) 0%, transparent 70%); filter: blur(18px); }
  .device-sheen { position: absolute; inset: 0; z-index: 3; pointer-events: none; background: linear-gradient(115deg, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 26%, rgba(255,255,255,0) 74%, rgba(255,255,255,.10) 100%); mix-blend-mode: overlay; }

  /* -- 2D tilt / float depth modes (real rotateY on the flat plane) -- */
  .device-tilt { position: relative; transform-style: preserve-3d; }
  .device-float { position: relative; animation: deviceFloat 5200ms ease-in-out infinite; }
  @keyframes deviceFloat { 0% { transform: translateY(0) rotateY(-4deg); } 50% { transform: translateY(-14px) rotateY(4deg); } 100% { transform: translateY(0) rotateY(-4deg); } }

  /* -- Genuine six-face 3D rig -- front/back/left/right/top/bottom as real
     planes, not a flat image with a border. See device3dMarkup. -- */
  .device-rig-wrap { position: relative; transform-style: preserve-3d; }
  .device-rig { position: relative; transform-style: preserve-3d; filter: drop-shadow(0 24px 42px rgba(0,0,0,.48)); }
  .device-face { position: absolute; top: 0; left: 0; backface-visibility: hidden; }
  .device-face.device-front { transform-style: preserve-3d; overflow: hidden; }
  .device-back { border: 1px solid rgba(255,255,255,.08); display: flex; align-items: flex-start; justify-content: center; }
  .device-cam-bar { display: flex; gap: 8px; align-items: center; justify-content: center; padding: 6px 14px; background: rgba(0,0,0,.4); border-radius: 20px; margin-top: 5%; border: 1px solid rgba(255,255,255,.1); }
  .device-lens { width: 14px; height: 14px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #555, #080808 70%); border: 1px solid rgba(255,255,255,.15); }
  .device-side { opacity: .96; }

  /* -- Floor reflection: a mirrored, blurred, faint copy of the rig sitting
     beneath it, matching the reference templates' glass-floor look. -- */
  .device-reflection { position: absolute; top: 100%; left: 0; transform-style: preserve-3d; transform: scaleY(-1); transform-origin: top center; opacity: .16; filter: blur(4px); pointer-events: none; mask-image: linear-gradient(to bottom, rgba(0,0,0,.6), transparent 70%); -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,.6), transparent 70%); }
`;

/** Solid colours — a flat swatch, distinct from a gradient preset. */
export const SOLID_COLORS: Record<string, string> = {
  "solid-navy": "#0f1115",
  "solid-charcoal": "#1c1c1c",
  "solid-white": "#f8fafc",
  "solid-cream": "#f5f0e6",
  "solid-indigo": "#2a2a72",
  "solid-forest": "#0b3d2e",
};

export const BACKGROUNDS: Record<string, string> = {
  ocean: "linear-gradient(135deg,#0f2027 0%,#203a43 50%,#2c5364 100%)",
  royal: "linear-gradient(135deg,#1e3c72 0%,#2a5298 100%)",
  sunset: "linear-gradient(135deg,#ff512f 0%,#dd2476 100%)",
  mint: "linear-gradient(135deg,#134e5e 0%,#71b280 100%)",
  graphite: "linear-gradient(135deg,#232526 0%,#414345 100%)",
  light: "linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%)",
  candy: "linear-gradient(135deg,#ee9ca7 0%,#ffdde1 100%)",
  aurora: "linear-gradient(135deg,#00c6ff 0%,#0072ff 100%)",
  citrus: "linear-gradient(135deg,#f7971e 0%,#ffd200 100%)",
  violet: "linear-gradient(135deg,#654ea3 0%,#eaafc8 100%)",
  "studio-spotlight": "radial-gradient(circle at center, #18181b 0%, #09090b 100%)",
  "purple-yellow-studio": "radial-gradient(circle at center, #2e1a47 0%, #0c0a0f 100%)",
};

/** Repeating-gradient / radial-gradient CSS patterns — the "mesh/pattern"
 *  style backgrounds Studio offers alongside flat gradients, built from
 *  pure CSS (no image assets to source or license). */
export const PATTERNS: Record<string, string> = {
  dots: "radial-gradient(circle, rgba(255,255,255,.18) 3px, transparent 3px) 0 0/28px 28px, linear-gradient(135deg,#1e3c72 0%,#2a5298 100%)",
  grid:
    "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px) 0 0/40px 40px, linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px) 0 0/40px 40px, linear-gradient(135deg,#232526 0%,#414345 100%)",
  diagonal:
    "repeating-linear-gradient(45deg, rgba(255,255,255,.08) 0 12px, transparent 12px 24px), linear-gradient(135deg,#0f2027 0%,#2c5364 100%)",
  mesh:
    "radial-gradient(at 20% 20%, rgba(255,100,150,.35) 0, transparent 50%), radial-gradient(at 80% 0%, rgba(100,150,255,.35) 0, transparent 50%), radial-gradient(at 50% 100%, rgba(150,255,200,.3) 0, transparent 50%), #14161c",
  waves:
    "repeating-radial-gradient(circle at 50% 120%, rgba(255,255,255,.10) 0 6px, transparent 6px 40px), linear-gradient(135deg,#134e5e 0%,#71b280 100%)",
  "blueprint-hud": "linear-gradient(rgba(0,198,184,.07) 1px, transparent 1px) 0 0/50px 50px, linear-gradient(90deg, rgba(0,198,184,.07) 1px, transparent 1px) 0 0/50px 50px, #0a1118",
  "neon-rings": "radial-gradient(circle at 75% 50%, rgba(232,23,93,.09) 0%, transparent 40%), radial-gradient(circle at 25% 50%, rgba(232,23,93,.06) 0%, transparent 50%), #0d0d11",
  "matte-spheres": "radial-gradient(circle at center, #111115 0%, #050507 100%)",
  "split-curve": "linear-gradient(90deg, #ffffff 60%, #0088ff 60%)",
};

/** Resolves a background name against every registry a scene may reference
 *  -- gradients (the historical set), solid swatches, and CSS patterns --
 *  so video scenes are no longer limited to the 10 gradients alone. */
export function backgroundCss(name: string): string {
  return BACKGROUNDS[name] ?? SOLID_COLORS[name] ?? PATTERNS[name] ?? BACKGROUNDS["ocean"];
}

export interface ResolvableBackground {
  type: "solid" | "gradient" | "pattern" | "image" | "panoramic";
  value: string;
  imageFile?: string;
  panoramaFile?: string;
}

/** Resolves any background type to a CSS `background` shorthand value, plus
 *  (for panoramic) the position needed so consecutive screens in the set
 *  read as slices of one continuous wide image. `resolveUri` turns a
 *  session-relative file into a usable src (a data: URI for a render, or
 *  an /api/sessions/:id/file URL for a live preview). */
export function resolveBackground(
  bg: ResolvableBackground,
  resolveUri: (relativePath: string) => string,
  panoramaIndex = 0,
  panoramaCount = 1,
): { background: string; backgroundSize?: string; backgroundPosition?: string } {
  switch (bg.type) {
    case "solid":
      return { background: SOLID_COLORS[bg.value] ?? SOLID_COLORS["solid-navy"] };
    case "pattern":
      return { background: PATTERNS[bg.value] ?? PATTERNS["dots"] };
    case "image":
      if (bg.imageFile) {
        return { background: `center/cover no-repeat url(${resolveUri(bg.imageFile)})` };
      }
      return { background: backgroundCss(bg.value) };
    case "panoramic": {
      if (!bg.panoramaFile) return { background: backgroundCss(bg.value) };
      // Evenly slice one wide image across the whole screenshot set —
      // screen i shows the i/(count-1) fraction of the image horizontally.
      const pct = panoramaCount > 1 ? (panoramaIndex / (panoramaCount - 1)) * 100 : 0;
      return {
        background: `url(${resolveUri(bg.panoramaFile)})`,
        backgroundSize: `${panoramaCount * 100}% 100%`,
        backgroundPosition: `${pct}% center`,
      };
    }
    case "gradient":
    default:
      return { background: backgroundCss(bg.value) };
  }
}

/** Device deck for a canvas: scales the device to a target fraction of
 *  canvas height, given the resolved (variant-aware) geometry. */
export function deviceScaleFor(device: DeviceModel, canvasHeight: number, variantId?: string, fraction = 0.62): number {
  const g = resolveGeometry(device, variantId);
  return (canvasHeight * fraction) / g.height;
}

export interface DecorationLike {
  kind: "icon" | "badge" | "shape";
  content: string;
  xPct: number;
  yPct: number;
  sizePct: number;
  rotate: number;
  color: string;
}

const SHAPE_MARKUP: Record<string, (color: string) => string> = {
  circle: (c) => `<div style="width:100%;height:100%;border-radius:50%;background:${c}"></div>`,
  ribbon: (c) => `<div style="width:100%;height:38%;margin-top:31%;background:${c};clip-path:polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)"></div>`,
  star: (c) => `<div style="width:100%;height:100%;background:${c};clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)"></div>`,
};

/** Decorative stickers/badges/shapes, absolutely positioned in percent so
 *  they land the same place regardless of the canvas's actual pixel size. */
export function decorationsMarkup(decorations: DecorationLike[], canvas: { width: number; height: number }): string {
  return decorations
    .map((d) => {
      const sizePx = Math.round((canvas.width * d.sizePct) / 100);
      const style = `position:absolute;left:${d.xPct}%;top:${d.yPct}%;width:${sizePx}px;height:${sizePx}px;transform:translate(-50%,-50%) rotate(${d.rotate}deg);z-index:6;display:flex;align-items:center;justify-content:center;`;
      if (d.kind === "shape") {
        const shape = SHAPE_MARKUP[d.content] ?? SHAPE_MARKUP["circle"];
        return `<div style="${style}">${shape(d.color)}</div>`;
      }
      const fontSize = Math.round(sizePx * 0.8);
      return `<div style="${style}font-size:${fontSize}px;line-height:1;color:${d.color};text-shadow:0 2px 8px rgba(0,0,0,.4);">${escapeHtml(d.content)}</div>`;
    })
    .join("\n");
}
