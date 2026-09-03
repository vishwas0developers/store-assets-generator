import fs from "fs";
import path from "path";
import {
  DEVICE_CSS,
  decorationsMarkup,
  deviceMarkup,
  escapeHtml,
  resolveBackground,
} from "../render/shared.js";
import { DEVICE_REGISTRY, resolveGeometry } from "../devices/registry.js";
import { projectFile } from "../project/projectStore.js";
import { getLayoutPreset, presentationTransform } from "./layouts.js";
import {
  effectiveCellStyle,
  mockupDir,
  mockupFile,
  type ColumnStyle,
  type DeviceLayerStyle,
  type MockupProject,
} from "./project.js";
import { applyMockupTemplate, type MockupStarterTemplate } from "./templates.js";

/**
 * Studio Mockup renderer -- the single HTML generator used by both the
 * live per-cell preview (Editor canvas, Preview section) and the final
 * Export render, so what is edited is exactly what ships.
 */

const CANVAS = { width: 1080, height: 1920 };

function frameless(device: (typeof DEVICE_REGISTRY)[string], screenshotUri: string, layer: DeviceLayerStyle, variant?: string): string {
  const g = resolveGeometry(device, variant);
  return `<div class="device" style="width:${g.width}px;height:${g.height}px">
    <img src="${screenshotUri}" style="width:100%;height:100%;object-fit:cover;border-radius:${g.cornerRadius ?? 0}px;filter:brightness(${layer.brightness}%)" />
  </div>`;
}

function layerMarkup(deviceEntryId: string, screenshotUri: string, layer: DeviceLayerStyle, variant?: string): string {
  const device = DEVICE_REGISTRY[deviceEntryId] ?? DEVICE_REGISTRY["phone"];
  if (!device) throw new Error(`Device '${deviceEntryId}' not found in registry`);
  return layer.frameless ? frameless(device, screenshotUri, layer, variant) : deviceMarkup(device, screenshotUri, variant);
}

function textBlock(style: ColumnStyle, textPosition: string): string {
  if (textPosition === "no-text") return "";
  const isCaption = textPosition.startsWith("caption");
  const titleSize = isCaption ? Math.round(style.title.size * 0.72) : style.title.size;
  return `<div class="copy" style="text-align:${style.title.align}">
    <div class="title" style="color:${style.title.color};font-size:${titleSize}px">${escapeHtml(style.title.text)}</div>
    ${style.subtitle.text ? `<div class="subtitle" style="color:${style.subtitle.color};font-size:${Math.round(style.subtitle.size * 0.5)}px">${escapeHtml(style.subtitle.text)}</div>` : ""}
  </div>`;
}

export interface RenderContext {
  /** Turns a project-relative source/background/panorama path into a usable src. */
  resolveUri: (relativePath: string) => string;
  columnIndex: number;
  columnCount: number;
}

/** Renders one cell (a device row x a column) to a full HTML document. */
export function cellHtml(project: MockupProject, deviceRowId: string, columnId: string, canvas: { width: number; height: number }, ctx: RenderContext): string {
  const deviceRow = project.devices.find((d) => d.id === deviceRowId);
  if (!deviceRow) throw new Error(`Device row '${deviceRowId}' not found.`);
  const style = effectiveCellStyle(project, deviceRowId, columnId);
  const preset = getLayoutPreset(style.layout);
  const transform = presentationTransform(preset.presentation);

  const source = project.sources.find((s) => s.id === style.deviceOne.sourceId) ?? project.sources[ctx.columnIndex] ?? project.sources[0];
  // If a source exists, resolve it via ctx.resolveUri; otherwise, if ctx.resolveUri
  // is provided (such as for templates), call ctx.resolveUri("") to get the placeholder,
  // falling back to placeholderScreenUri.
  const screenshotUri = source
    ? ctx.resolveUri(source.file)
    : ctx.resolveUri
    ? ctx.resolveUri("")
    : placeholderScreenUri(ctx.columnIndex);

  const bg = resolveBackground(style.background, ctx.resolveUri, ctx.columnIndex, ctx.columnCount);

  const d1 = style.deviceOne;
  const d1Transform = `translate(${transform.deviceOne.xPct + d1.x}%, ${d1.y}%) scale(${d1.size / 90}) rotate(${transform.deviceOne.rotate + d1.rotation}deg)`;
  let deviceLayers = `<div class="layer" style="transform:${d1Transform}">${layerMarkup(deviceRow.deviceId, screenshotUri, d1, deviceRow.variant)}</div>`;

  if (preset.twoDevices && style.deviceTwo && transform.deviceTwo) {
    const d2 = style.deviceTwo;
    const source2 = project.sources.find((s) => s.id === d2.sourceId) ?? source;
    const uri2 = source2
      ? ctx.resolveUri(source2.file)
      : ctx.resolveUri
      ? ctx.resolveUri("__second_device__")
      : placeholderScreenUri(ctx.columnIndex + 1);
    const d2Transform = `translate(${transform.deviceTwo.xPct + d2.x}%, ${transform.deviceTwo.yPct + d2.y}%) scale(${d2.size / 90}) rotate(${transform.deviceTwo.rotate + d2.rotation}deg)`;
    deviceLayers += `<div class="layer" style="transform:${d2Transform}">${layerMarkup(deviceRow.deviceId, uri2, d2, deviceRow.variant)}</div>`;
  }

  const textAbove = preset.textPosition.endsWith("above");
  const decorations = decorationsMarkup(style.decorations, canvas);

  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; }
  .canvas {
    position: relative; width: ${canvas.width}px; height: ${canvas.height}px;
    background: ${bg.background};
    ${bg.backgroundSize ? `background-size: ${bg.backgroundSize};` : ""}
    ${bg.backgroundPosition ? `background-position: ${bg.backgroundPosition};` : ""}
    display: flex; flex-direction: ${textAbove ? "column" : "column-reverse"}; align-items: center;
    justify-content: ${preset.textPosition === "no-text" ? "center" : "flex-start"};
    padding: ${preset.textPosition === "no-text" ? "0" : "6% 6%"};
    font-family: "Segoe UI", Roboto, -apple-system, sans-serif; overflow: hidden;
  }
  .copy { width: 100%; margin: ${textAbove ? "0 0 4%" : "4% 0 0"}; z-index: 4; }
  .title { font-weight: 800; line-height: 1.15; }
  .subtitle { opacity: .8; margin-top: .5em; font-weight: 500; }
  .stage { position: relative; flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; perspective: 2000px; }
  .layer { position: absolute; }
  ${DEVICE_CSS}
</style></head>
<body><div class="canvas">${textBlock(style, preset.textPosition)}<div class="stage">${deviceLayers}</div>${decorations}</div></body></html>`;
}

function projectResolveUri(projectId: string) {
  return (relativePath: string) => `/api/mockups/${projectId}/file?p=${encodeURIComponent(relativePath)}`;
}

export function cellPreviewHtml(project: MockupProject, deviceRowId: string, columnId: string, canvas: { width: number; height: number }): string {
  const columnIndex = project.columns.findIndex((c) => c.id === columnId);
  return cellHtml(project, deviceRowId, columnId, canvas, {
    resolveUri: projectResolveUri(project.id),
    columnIndex: Math.max(0, columnIndex),
    columnCount: project.columns.length,
  });
}

function dataUri(absPath: string): string {
  return `data:image/png;base64,${fs.readFileSync(absPath, "base64")}`;
}

/** Renders every column for one device row at that row's real export
 *  dimensions -- used by the Export section. Reads files from disk. */
export async function renderDeviceRowExport(project: MockupProject, deviceRowId: string, outputDir: string, canvas: { width: number; height: number }): Promise<string[]> {
  fs.mkdirSync(outputDir, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const written: string[] = [];
  // Uploaded sources live under the mockup dir; Live Web/Android captures live at the
  // project root ("captures/N.png") and are referenced by the same relative path.
  const resolveUri = (relativePath: string) => {
    const abs = mockupFile(project.id, relativePath);
    return dataUri(fs.existsSync(abs) ? abs : projectFile(project.id, relativePath));
  };
  try {
    const page = await browser.newPage({ viewport: canvas });
    const columns = [...project.columns].sort((a, b) => a.order - b.order);
    for (let i = 0; i < columns.length; i++) {
      const html = cellHtml(project, deviceRowId, columns[i].id, canvas, { resolveUri, columnIndex: i, columnCount: columns.length });
      await page.setContent(html, { waitUntil: "load" });
      const outPath = path.join(outputDir, `${String(i + 1).padStart(2, "0")}_${columns[i].id}.png`);
      await page.screenshot({ path: outPath, type: "png" });
      written.push(outPath);
    }
  } finally {
    await browser.close();
  }
  return written;
}

/** Synthetic placeholder screens -- no real screenshot exists for a template
 *  that hasn't been applied to a project yet, so the thumbnail shows a
 *  varied, plausible app-screen silhouette (list/grid/hero/profile) instead
 *  of the same blank card repeated across every column. */
/** Synthetic placeholder screens tailored to each template's category, colors,
 *  and screen theme -- ensures every template shows a rich, unique UI mockup
 *  without using any static external image assets. */
export function templatePlaceholderScreenUri(template: MockupStarterTemplate, index = 0): string {
  const cat = template.category;
  const isLightBg = template.background?.value === "solid-white" || template.background?.value === "solid-cream";

  // Palette tones adapted to the template theme
  let baseTone = "#c7d0dc";
  let subTone = "#dbe1ea";
  let accentTone = "#3b82f6";
  let cardBg = "#ffffff";
  let screenBg = isLightBg ? "#e5e9f0" : "#0f172a";

  if (cat === "music") {
    accentTone = "#a855f7"; // violet/purple
    baseTone = isLightBg ? "#9333ea" : "#c084fc";
    subTone = isLightBg ? "#e9d5ff" : "#581c87";
    screenBg = isLightBg ? "#faf5ff" : "#1e112a";
    cardBg = isLightBg ? "#ffffff" : "#2e1065";
  } else if (cat === "travel-and-local") {
    accentTone = "#f97316"; // orange sunset
    baseTone = isLightBg ? "#ea580c" : "#fb923c";
    subTone = isLightBg ? "#fed7aa" : "#7c2d12";
    screenBg = isLightBg ? "#fff7ed" : "#1c140e";
    cardBg = isLightBg ? "#ffffff" : "#431407";
  } else if (cat === "social-networking") {
    accentTone = "#06b6d4"; // cyan / mint / messenger blue
    baseTone = isLightBg ? "#0891b2" : "#38bdf8";
    subTone = isLightBg ? "#cffafe" : "#0c4a6e";
    screenBg = isLightBg ? "#f0fdfa" : "#082f49";
    cardBg = isLightBg ? "#ffffff" : "#0f3c5c";
  } else if (cat === "food-and-drink") {
    accentTone = "#ef4444"; // red/amber foodie
    baseTone = isLightBg ? "#dc2626" : "#f87171";
    subTone = isLightBg ? "#fecaca" : "#7f1d1d";
    screenBg = isLightBg ? "#fef2f2" : "#200d0d";
    cardBg = isLightBg ? "#ffffff" : "#450a0a";
  } else if (cat === "entertainment") {
    accentTone = "#e11d48"; // netflix red / game pink
    baseTone = isLightBg ? "#be123c" : "#fb7185";
    subTone = isLightBg ? "#ffe4e6" : "#881337";
    screenBg = isLightBg ? "#fff1f2" : "#180b11";
    cardBg = isLightBg ? "#ffffff" : "#3b0718";
  } else if (cat === "books") {
    accentTone = "#d97706"; // warm editorial amber
    baseTone = "#78350f";
    subTone = "#fde68a";
    screenBg = "#fef3c7";
    cardBg = "#ffffff";
  } else if (cat === "modern") {
    accentTone = "#8b5cf6"; // electric violet / neon
    baseTone = isLightBg ? "#6d28d9" : "#c4b5fd";
    subTone = isLightBg ? "#ddd6fe" : "#4c1d95";
    screenBg = isLightBg ? "#f5f3ff" : "#0f0e17";
    cardBg = isLightBg ? "#ffffff" : "#1e1b2e";
  } else if (cat === "fintech") {
    accentTone = "#10b981"; // emerald crypto green
    baseTone = isLightBg ? "#047857" : "#6ee7b7";
    subTone = isLightBg ? "#d1fae5" : "#064e3b";
    screenBg = isLightBg ? "#ecfdf5" : "#061a14";
    cardBg = isLightBg ? "#ffffff" : "#0b2e23";
  } else if (cat === "health-and-fitness") {
    accentTone = "#f97316"; // energetic coral orange
    baseTone = isLightBg ? "#c2410c" : "#ffedd5";
    subTone = isLightBg ? "#ffedd5" : "#7c2d12";
    screenBg = isLightBg ? "#fff7ed" : "#1c0d06";
    cardBg = isLightBg ? "#ffffff" : "#381709";
  } else if (cat === "shopping-and-e-commerce") {
    accentTone = "#ec4899"; // rose boutique pink
    baseTone = isLightBg ? "#be185d" : "#fbcfe8";
    subTone = isLightBg ? "#fce7f3" : "#831843";
    screenBg = isLightBg ? "#fdf2f8" : "#1f0914";
    cardBg = isLightBg ? "#ffffff" : "#3d1029";
  } else if (cat === "business" || cat === "productivity" || cat === "professional") {
    accentTone = "#2563eb"; // corporate / cloud storage blue
    baseTone = isLightBg ? "#1d4ed8" : "#60a5fa";
    subTone = isLightBg ? "#bfdbfe" : "#1e3a8a";
    screenBg = isLightBg ? "#eff6ff" : "#0b192e";
    cardBg = isLightBg ? "#ffffff" : "#172554";
  }

  // Header element
  const header = `
    <rect x="0" y="0" width="360" height="74" fill="${cardBg}" opacity="0.95"/>
    <circle cx="36" cy="40" r="15" fill="${accentTone}"/>
    <rect x="62" y="32" width="130" height="9" rx="4" fill="${baseTone}"/>
    <rect x="62" y="46" width="75" height="7" rx="3" fill="${subTone}"/>
    <circle cx="328" cy="40" r="12" fill="${subTone}" opacity="0.6"/>
  `;

  let body = "";
  const variant = index % 3;

  if (cat === "music") {
    if (variant === 0) {
      // Album player view
      body = `
        <rect x="30" y="100" width="300" height="300" rx="24" fill="${cardBg}"/>
        <circle cx="180" cy="250" r="100" fill="${accentTone}" opacity="0.8"/>
        <circle cx="180" cy="250" r="34" fill="${screenBg}"/>
        <rect x="50" y="425" width="180" height="16" rx="8" fill="${baseTone}"/>
        <rect x="50" y="450" width="110" height="12" rx="6" fill="${subTone}"/>
        <!-- Progress scrubber -->
        <rect x="50" y="490" width="260" height="6" rx="3" fill="${subTone}" opacity="0.4"/>
        <rect x="50" y="490" width="140" height="6" rx="3" fill="${accentTone}"/>
        <circle cx="190" cy="493" r="8" fill="${accentTone}"/>
        <!-- Controls -->
        <circle cx="180" cy="550" r="28" fill="${accentTone}"/>
        <polygon points="175,540 192,550 175,560" fill="#ffffff"/>
        <circle cx="110" cy="550" r="18" fill="${subTone}" opacity="0.5"/>
        <circle cx="250" cy="550" r="18" fill="${subTone}" opacity="0.5"/>
      `;
    } else {
      // Playlist rows
      body = [0, 1, 2, 3, 4]
        .map(
          (i) => `
        <rect x="24" y="${95 + i * 95}" width="312" height="80" rx="14" fill="${cardBg}"/>
        <rect x="36" y="${107 + i * 95}" width="56" height="56" rx="10" fill="${accentTone}" opacity="${0.6 + i * 0.08}"/>
        <rect x="106" y="${120 + i * 95}" width="140" height="14" rx="7" fill="${baseTone}"/>
        <rect x="106" y="${142 + i * 95}" width="90" height="10" rx="5" fill="${subTone}"/>
        <circle cx="310" cy="${135 + i * 95}" r="12" fill="${subTone}" opacity="0.4"/>
      `
        )
        .join("");
    }
  } else if (cat === "social-networking") {
    // Chat bubbles & conversations
    body = `
      <!-- Conversation list or chat view -->
      <circle cx="48" cy="115" r="22" fill="${accentTone}"/>
      <rect x="80" y="100" width="200" height="42" rx="16" fill="${cardBg}"/>
      <rect x="96" y="112" width="140" height="10" rx="5" fill="${baseTone}"/>
      <rect x="96" y="127" width="90" height="7" rx="3" fill="${subTone}"/>

      <rect x="80" y="165" width="230" height="52" rx="16" fill="${accentTone}" opacity="0.9"/>
      <rect x="98" y="179" width="180" height="10" rx="5" fill="#ffffff"/>
      <rect x="98" y="196" width="120" height="8" rx="4" fill="#ffffff" opacity="0.8"/>
      <circle cx="325" cy="190" r="18" fill="${baseTone}"/>

      <circle cx="48" cy="265" r="22" fill="${accentTone}"/>
      <rect x="80" y="245" width="180" height="42" rx="16" fill="${cardBg}"/>
      <rect x="96" y="257" width="130" height="10" rx="5" fill="${baseTone}"/>
      <rect x="96" y="272" width="70" height="7" rx="3" fill="${subTone}"/>

      <rect x="60" y="315" width="250" height="130" rx="18" fill="${cardBg}"/>
      <rect x="74" y="328" width="222" height="78" rx="10" fill="${subTone}" opacity="0.6"/>
      <rect x="74" y="415" width="130" height="12" rx="6" fill="${baseTone}"/>

      <!-- Bottom input bar -->
      <rect x="24" y="680" width="250" height="46" rx="23" fill="${cardBg}"/>
      <circle cx="310" cy="703" r="23" fill="${accentTone}"/>
      <polygon points="305,696 320,703 305,710" fill="#ffffff"/>
    `;
  } else if (cat === "travel-and-local") {
    // Map & Hero rental card
    body = `
      <rect x="24" y="90" width="312" height="210" rx="20" fill="${cardBg}"/>
      <rect x="36" y="102" width="288" height="130" rx="14" fill="${subTone}" opacity="0.7"/>
      <!-- Map pin badge -->
      <circle cx="70" cy="140" r="16" fill="${accentTone}"/>
      <circle cx="70" cy="137" r="6" fill="#ffffff"/>
      <rect x="40" y="245" width="170" height="16" rx="8" fill="${baseTone}"/>
      <rect x="40" y="269" width="100" height="11" rx="5" fill="${subTone}"/>
      <rect x="250" y="245" width="60" height="22" rx="6" fill="${accentTone}"/>

      <!-- Grid of mini listings -->
      ${[0, 1]
        .map(
          (c) => `
        <rect x="${24 + c * 162}" y="320" width="150" height="180" rx="16" fill="${cardBg}"/>
        <rect x="${34 + c * 162}" y="330" width="130" height="100" rx="10" fill="${subTone}" opacity="0.6"/>
        <rect x="${34 + c * 162}" y="440" width="100" height="12" rx="6" fill="${baseTone}"/>
        <rect x="${34 + c * 162}" y="460" width="60" height="10" rx="5" fill="${subTone}"/>
      `
        )
        .join("")}
    `;
  } else if (cat === "food-and-drink") {
    // Restaurant / Recipe cards
    body = `
      <rect x="24" y="90" width="312" height="170" rx="18" fill="${cardBg}"/>
      <rect x="40" y="105" width="140" height="120" rx="14" fill="${accentTone}" opacity="0.8"/>
      <rect x="195" y="115" width="125" height="16" rx="8" fill="${baseTone}"/>
      <rect x="195" y="140" width="90" height="11" rx="5" fill="${subTone}"/>
      <rect x="195" y="165" width="110" height="10" rx="5" fill="${subTone}"/>
      <rect x="195" y="200" width="80" height="24" rx="12" fill="${accentTone}"/>

      <!-- Horizontal row list -->
      ${[0, 1, 2]
        .map(
          (i) => `
        <rect x="24" y="${280 + i * 95}" width="312" height="80" rx="14" fill="${cardBg}"/>
        <circle cx="68" cy="${320 + i * 95}" r="26" fill="${subTone}" opacity="0.7"/>
        <rect x="110" y="${300 + i * 95}" width="140" height="14" rx="7" fill="${baseTone}"/>
        <rect x="110" y="${322 + i * 95}" width="95" height="10" rx="5" fill="${subTone}"/>
        <rect x="260" y="${308 + i * 95}" width="60" height="22" rx="6" fill="${accentTone}" opacity="0.9"/>
      `
        )
        .join("")}
    `;
  } else if (cat === "entertainment") {
    // Video streaming / Hero carousel + Posters
    body = `
      <rect x="20" y="90" width="320" height="190" rx="16" fill="${cardBg}"/>
      <rect x="30" y="100" width="300" height="140" rx="12" fill="${accentTone}" opacity="0.85"/>
      <circle cx="180" cy="170" r="28" fill="#ffffff" opacity="0.9"/>
      <polygon points="175,160 192,170 175,180" fill="${accentTone}"/>
      <rect x="40" y="250" width="140" height="14" rx="7" fill="${baseTone}"/>

      <!-- Movie poster rail -->
      <rect x="20" y="295" width="100" height="16" rx="8" fill="${baseTone}"/>
      ${[0, 1, 2]
        .map(
          (p) => `
        <rect x="${20 + p * 110}" y="325" width="100" height="150" rx="12" fill="${cardBg}"/>
        <rect x="${26 + p * 110}" y="331" width="88" height="110" rx="8" fill="${subTone}" opacity="${0.6 + p * 0.15}"/>
        <rect x="${26 + p * 110}" y="450" width="75" height="11" rx="5" fill="${baseTone}"/>
      `
        )
        .join("")}
    `;
  } else if (cat === "books") {
    // E-reader text lines & chapter view
    body = `
      <rect x="24" y="90" width="312" height="420" rx="16" fill="${cardBg}"/>
      <rect x="44" y="115" width="180" height="18" rx="9" fill="${baseTone}"/>
      <rect x="44" y="145" width="120" height="12" rx="6" fill="${subTone}"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7]
        .map(
          (line) => `
        <rect x="44" y="${180 + line * 28}" width="${272 - (line % 3) * 35}" height="10" rx="5" fill="${subTone}" opacity="0.85"/>
      `
        )
        .join("")}
      <!-- Page number -->
      <rect x="150" y="475" width="60" height="12" rx="6" fill="${baseTone}" opacity="0.5"/>
    `;
  } else if (cat === "fintech") {
    // Crypto / Wallet / Investment portfolio
    body = `
      <rect x="24" y="90" width="312" height="150" rx="20" fill="${cardBg}"/>
      <rect x="44" y="112" width="110" height="12" rx="6" fill="${subTone}"/>
      <rect x="44" y="132" width="160" height="32" rx="8" fill="${accentTone}"/>
      <rect x="44" y="174" width="80" height="18" rx="9" fill="${baseTone}" opacity="0.9"/>
      <path d="M 44 210 Q 120 185, 180 205 T 312 185" fill="none" stroke="${accentTone}" stroke-width="4" stroke-linecap="round"/>

      <!-- Asset list -->
      ${[0, 1, 2]
        .map(
          (i) => `
        <rect x="24" y="${256 + i * 72}" width="312" height="60" rx="14" fill="${cardBg}"/>
        <circle cx="54" cy="${286 + i * 72}" r="18" fill="${accentTone}"/>
        <rect x="84" y="${274 + i * 72}" width="100" height="12" rx="6" fill="${baseTone}"/>
        <rect x="84" y="${292 + i * 72}" width="65" height="10" rx="5" fill="${subTone}"/>
        <rect x="240" y="${278 + i * 72}" width="70" height="14" rx="7" fill="${baseTone}"/>
      `
        )
        .join("")}
    `;
  } else if (cat === "health-and-fitness") {
    // Fitness tracker, activity rings & stats
    body = `
      <rect x="24" y="90" width="312" height="180" rx="20" fill="${cardBg}"/>
      <circle cx="110" cy="180" r="55" fill="none" stroke="${subTone}" stroke-width="12" opacity="0.3"/>
      <circle cx="110" cy="180" r="55" fill="none" stroke="${accentTone}" stroke-width="12" stroke-dasharray="280" stroke-dashoffset="70" stroke-linecap="round"/>
      <circle cx="110" cy="180" r="38" fill="none" stroke="${baseTone}" stroke-width="10" stroke-dasharray="200" stroke-dashoffset="40" stroke-linecap="round"/>
      <rect x="185" y="125" width="120" height="14" rx="7" fill="${baseTone}"/>
      <rect x="185" y="148" width="80" height="24" rx="6" fill="${accentTone}"/>
      <rect x="185" y="182" width="110" height="10" rx="5" fill="${subTone}"/>
      <rect x="185" y="200" width="90" height="10" rx="5" fill="${subTone}"/>

      <!-- Daily progress cards -->
      ${[0, 1]
        .map(
          (i) => `
        <rect x="24" y="${286 + i * 90}" width="312" height="76" rx="16" fill="${cardBg}"/>
        <rect x="44" y="${304 + i * 90}" width="40" height="40" rx="10" fill="${accentTone}"/>
        <rect x="96" y="${310 + i * 90}" width="120" height="12" rx="6" fill="${baseTone}"/>
        <rect x="96" y="${330 + i * 90}" width="80" height="10" rx="5" fill="${subTone}"/>
        <rect x="245" y="${316 + i * 90}" width="65" height="16" rx="8" fill="${baseTone}"/>
      `
        )
        .join("")}
    `;
  } else if (cat === "shopping-and-e-commerce" || cat === "modern") {
    // Modern E-Commerce / Minimal storefront
    body = `
      <rect x="24" y="90" width="312" height="160" rx="20" fill="${accentTone}" opacity="0.9"/>
      <rect x="48" y="120" width="150" height="20" rx="10" fill="#ffffff"/>
      <rect x="48" y="150" width="100" height="12" rx="6" fill="#ffffff" opacity="0.8"/>
      <rect x="48" y="185" width="90" height="32" rx="16" fill="#ffffff"/>

      <!-- Product cards 2-col -->
      ${[0, 1]
        .map(
          (col) => `
        <rect x="${24 + col * 162}" y="266" width="150" height="200" rx="16" fill="${cardBg}"/>
        <rect x="${34 + col * 162}" y="276" width="130" height="110" rx="12" fill="${subTone}" opacity="0.6"/>
        <rect x="${34 + col * 162}" y="396" width="110" height="12" rx="6" fill="${baseTone}"/>
        <rect x="${34 + col * 162}" y="416" width="60" height="14" rx="7" fill="${accentTone}"/>
      `
        )
        .join("")}
    `;
  } else {
    // Productivity / Utilities / Business Dashboard cards
    body = `
      <rect x="24" y="90" width="312" height="140" rx="18" fill="${cardBg}"/>
      <rect x="44" y="110" width="130" height="14" rx="7" fill="${baseTone}"/>
      <rect x="44" y="132" width="90" height="28" rx="8" fill="${accentTone}"/>
      <rect x="44" y="170" width="220" height="10" rx="5" fill="${subTone}"/>
      <!-- Mini sparkline chart -->
      <polyline points="200,180 230,150 260,165 290,125 315,140" fill="none" stroke="${accentTone}" stroke-width="4" stroke-linecap="round"/>

      <!-- Dashboard 2x2 grid -->
      ${[0, 1, 2, 3]
        .map((i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          return `
          <rect x="${24 + col * 162}" y="${250 + row * 135}" width="150" height="120" rx="16" fill="${cardBg}"/>
          <circle cx="${54 + col * 162}" cy="${280 + row * 135}" r="16" fill="${accentTone}" opacity="0.8"/>
          <rect x="${40 + col * 162}" y="${310 + row * 135}" width="110" height="12" rx="6" fill="${baseTone}"/>
          <rect x="${40 + col * 162}" y="${330 + row * 135}" width="70" height="10" rx="5" fill="${subTone}"/>
        `;
        })
        .join("")}
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="780">
    <rect width="360" height="780" fill="${screenBg}"/>
    ${header}
    ${body}
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const PLACEHOLDER_LAYOUTS = ["list", "grid", "hero", "profile"] as const;
function placeholderScreenUri(index = 0): string {
  const layout = PLACEHOLDER_LAYOUTS[index % PLACEHOLDER_LAYOUTS.length];
  const header = `<rect x="0" y="0" width="360" height="88" fill="#ffffff"/>
    <circle cx="36" cy="44" r="16" fill="#c7d0dc"/>
    <rect x="64" y="34" width="140" height="10" rx="5" fill="#c7d0dc"/>
    <rect x="64" y="50" width="90" height="8" rx="4" fill="#dbe1ea"/>`;
  let body = "";
  if (layout === "list") {
    body = [0, 1, 2]
      .map((i) => `<rect x="24" y="${128 + i * 190}" width="312" height="160" rx="16" fill="#ffffff"/>
      <rect x="44" y="${152 + i * 190}" width="180" height="14" rx="7" fill="#c7d0dc"/>
      <rect x="44" y="${176 + i * 190}" width="240" height="10" rx="5" fill="#dbe1ea"/>
      <rect x="44" y="${196 + i * 190}" width="150" height="10" rx="5" fill="#dbe1ea"/>`)
      .join("");
  } else if (layout === "grid") {
    body = [0, 1, 2, 3]
      .map((i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        return `<rect x="${24 + col * 160}" y="${128 + row * 190}" width="148" height="170" rx="14" fill="#ffffff"/>
      <rect x="${40 + col * 160}" y="${256 + row * 190}" width="110" height="12" rx="6" fill="#c7d0dc"/>`;
      })
      .join("");
  } else if (layout === "hero") {
    body = `<rect x="24" y="128" width="312" height="220" rx="20" fill="#ffffff"/>
      <rect x="44" y="370" width="220" height="18" rx="9" fill="#c7d0dc"/>
      <rect x="44" y="398" width="270" height="12" rx="6" fill="#dbe1ea"/>
      <rect x="44" y="418" width="200" height="12" rx="6" fill="#dbe1ea"/>
      <rect x="44" y="460" width="272" height="70" rx="14" fill="#e1e6ee"/>`;
  } else {
    body = `<circle cx="180" cy="200" r="56" fill="#c7d0dc"/>
      <rect x="100" y="270" width="160" height="16" rx="8" fill="#c7d0dc"/>
      <rect x="130" y="292" width="100" height="10" rx="5" fill="#dbe1ea"/>
      ${[0, 1].map((i) => `<rect x="24" y="${330 + i * 130}" width="312" height="110" rx="16" fill="#ffffff"/>`).join("")}`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="780">
    <rect width="360" height="780" fill="#e9edf3"/>
    ${header}
    ${body}
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const THUMB_CANVAS = { width: 1080, height: 1920 };
const THUMB_SIZE = { width: 720, height: 389 };
/** Wider/shorter than the grid thumbnail -- horizontally spacious, still
 *  compact vertically -- so the detail view reads as a filmstrip of the
 *  template's actual screens rather than a single tall phone shot. */
const DETAIL_THUMB_SIZE = { width: 1240, height: 420 };

function buildScratchProject(template: MockupStarterTemplate): MockupProject {
  const scratch: MockupProject = {
    id: "__template_thumb__",
    createdAt: new Date().toISOString(),
    name: template.name,
    appCategory: template.category,
    sources: [],
    devices: [],
    columns: [],
    cells: {},
    globalPanoramic: { flip: false },
    settings: { inspectorPosition: "right", screenshotSizeLabel: "", palette: [] },
  };
  applyMockupTemplate(scratch, template.id);
  return scratch;
}

export function templateScreenHtml(template: MockupStarterTemplate, columnIndex = 0, canvas = THUMB_CANVAS): string {
  const scratch = buildScratchProject(template);
  scratch.sources = scratch.columns.map((_, i) => ({
    id: `template-placeholder-${i}`,
    name: `Template placeholder ${i + 1}`,
    file: `__template_placeholder_${i}__`,
    width: 360,
    height: 780,
  }));
  scratch.columns.forEach((col, i) => {
    col.style.deviceOne.sourceId = scratch.sources[i].id;
    if (col.style.deviceTwo) col.style.deviceTwo.sourceId = scratch.sources[(i + 1) % scratch.sources.length].id;
  });
  const deviceRow = scratch.devices[0];
  const col = scratch.columns[columnIndex] ?? scratch.columns[0];
  return cellHtml(scratch, deviceRow.id, col.id, canvas, {
    resolveUri: (rel: string) => {
      const matched = rel.match(/^__template_placeholder_(\d+)__$/);
      if (matched) return templatePlaceholderScreenUri(template, Number(matched[1]));
      if (rel && rel !== "__second_device__") return rel;
      return templatePlaceholderScreenUri(template, rel === "__second_device__" ? columnIndex + 1 : columnIndex);
    },
    columnIndex,
    columnCount: scratch.columns.length,
  });
}

/** A landscape thumbnail showing up to `panelCount` of the template's
 *  columns side by side, each rendered through the real cellHtml() pipeline
 *  -- so the thumbnail is literally what applying the template produces,
 *  not a CSS approximation. */
function templateThumbHtmlSized(template: MockupStarterTemplate, size: { width: number; height: number }, panelCount: number): string {
  const scratch = buildScratchProject(template);
  const deviceRow = scratch.devices[0];
  const shownColumns = scratch.columns.slice(0, Math.min(panelCount, scratch.columns.length));
  const n = shownColumns.length;

  const rawScale = size.height / THUMB_CANVAS.height;
  const rawCellWidth = THUMB_CANVAS.width * rawScale;
  const gapPx = Math.round(rawCellWidth * 0.08);
  const cellScale = n > 1 ? (rawCellWidth * n - gapPx * (n - 1)) / (THUMB_CANVAS.width * n) : rawScale;
  const cellWidth = THUMB_CANVAS.width * cellScale;

  const panels = shownColumns
    .map((col, i) => {
      const inner = cellHtml(scratch, deviceRow.id, col.id, THUMB_CANVAS, {
        resolveUri: (rel: string) => {
          if (rel && rel !== "__second_device__") return rel;
          return templatePlaceholderScreenUri(template, rel === "__second_device__" ? i + 1 : i);
        },
        columnIndex: i,
        columnCount: shownColumns.length,
      });
      const srcdoc = escapeHtml(inner);
      return `<div class="panel" style="width:${cellWidth}px;height:${size.height}px">
        <iframe srcdoc="${srcdoc}" style="width:${THUMB_CANVAS.width}px;height:${THUMB_CANVAS.height}px;border:0;transform:scale(${cellScale});transform-origin:top left;"></iframe>
      </div>`;
    })
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${size.width}px; height: ${size.height}px; overflow: hidden; background: transparent; }
  .row { display: flex; justify-content: center; align-items: center; gap: ${gapPx}px; width: ${size.width}px; height: ${size.height}px; overflow: hidden; }
  .panel { overflow: hidden; flex-shrink: 0; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); }
</style></head>
<body><div class="row">${panels}</div></body></html>`;
}

/** One 720x389 landscape thumbnail for the grid card -- up to 3 screens. */
export function templateThumbHtml(template: MockupStarterTemplate): string {
  return templateThumbHtmlSized(template, THUMB_SIZE, 3);
}

/** One 1240x420 landscape filmstrip for the detail view -- up to 5 screens. */
export function templateDetailThumbHtml(template: MockupStarterTemplate): string {
  return templateThumbHtmlSized(template, DETAIL_THUMB_SIZE, 5);
}

async function renderThumbSet(
  outDir: string,
  templates: MockupStarterTemplate[],
  suffix: string,
  size: { width: number; height: number },
  htmlFor: (t: MockupStarterTemplate) => string,
): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });
  const missing = templates.filter((t) => !fs.existsSync(path.join(outDir, `${t.id}${suffix}.png`)));
  if (missing.length === 0) return;

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: size });
    for (const template of missing) {
      await page.setContent(htmlFor(template), { waitUntil: "load" });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(outDir, `${template.id}${suffix}.png`), type: "png" });
    }
  } finally {
    await browser.close();
  }
}

/** Renders every template's grid thumbnail once and caches it to disk;
 *  existing files are left untouched (delete the file to force a re-render). */
export async function renderTemplateThumbs(outDir: string, templates: MockupStarterTemplate[]): Promise<void> {
  return renderThumbSet(outDir, templates, "", THUMB_SIZE, templateThumbHtml);
}

/** Renders every template's wider detail-view filmstrip once and caches it. */
export async function renderTemplateDetailThumbs(outDir: string, templates: MockupStarterTemplate[]): Promise<void> {
  return renderThumbSet(outDir, templates, "-detail", DETAIL_THUMB_SIZE, templateDetailThumbHtml);
}
