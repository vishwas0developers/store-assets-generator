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
  // No screenshot uploaded yet (the default state right after applying a
  // template) -- fall back to a realistic dummy screen instead of leaving
  // the device frame empty, varied per column so a multi-screen template
  // doesn't repeat the exact same placeholder in every cell.
  const screenshotUri = source ? ctx.resolveUri(source.file) : placeholderScreenUri(ctx.columnIndex);

  const bg = resolveBackground(style.background, ctx.resolveUri, ctx.columnIndex, ctx.columnCount);

  const d1 = style.deviceOne;
  const d1Transform = `translate(${transform.deviceOne.xPct + d1.x}%, ${d1.y}%) scale(${d1.size / 90}) rotate(${transform.deviceOne.rotate + d1.rotation}deg)`;
  let deviceLayers = `<div class="layer" style="transform:${d1Transform}">${layerMarkup(deviceRow.deviceId, screenshotUri, d1, deviceRow.variant)}</div>`;

  if (preset.twoDevices && style.deviceTwo && transform.deviceTwo) {
    const d2 = style.deviceTwo;
    const source2 = project.sources.find((s) => s.id === d2.sourceId) ?? source;
    const uri2 = source2 ? ctx.resolveUri(source2.file) : placeholderScreenUri(ctx.columnIndex + 1);
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

/** A landscape thumbnail showing up to `panelCount` of the template's
 *  columns side by side, each rendered through the real cellHtml() pipeline
 *  -- so the thumbnail is literally what applying the template produces,
 *  not a CSS approximation. */
function templateThumbHtmlSized(template: MockupStarterTemplate, size: { width: number; height: number }, panelCount: number): string {
  const scratch = buildScratchProject(template);
  const deviceRow = scratch.devices[0];
  const shownColumns = scratch.columns.slice(0, Math.min(panelCount, scratch.columns.length));
  const n = shownColumns.length;

  // Play Store screenshots are never edge-to-edge -- each shot sits in its
  // own frame with visible breathing room from its neighbours. Reserve that
  // gap out of the same total width the un-gapped panels used to fill, so
  // the filmstrip doesn't get wider (or clipped) than before.
  const rawScale = size.height / THUMB_CANVAS.height;
  const rawCellWidth = THUMB_CANVAS.width * rawScale;
  const gapPx = Math.round(rawCellWidth * 0.07);
  const cellScale = n > 1 ? (rawCellWidth * n - gapPx * (n - 1)) / (THUMB_CANVAS.width * n) : rawScale;
  const cellWidth = THUMB_CANVAS.width * cellScale;

  const panels = shownColumns
    .map((col, i) => {
      const placeholder = placeholderScreenUri(i);
      const inner = cellHtml(scratch, deviceRow.id, col.id, THUMB_CANVAS, {
        resolveUri: () => placeholder,
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
  html, body { margin: 0; padding: 0; width: ${size.width}px; height: ${size.height}px; overflow: hidden; background: #f4f6f8; }
  .row { display: flex; justify-content: center; align-items: center; gap: ${gapPx}px; width: ${size.width}px; height: ${size.height}px; overflow: hidden; }
  .panel { overflow: hidden; flex-shrink: 0; border-radius: 6px; }
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
