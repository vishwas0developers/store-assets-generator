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
import { getLayoutPreset, presentationTransform } from "./layouts.js";
import {
  effectiveCellStyle,
  mockupDir,
  mockupFile,
  type ColumnStyle,
  type DeviceLayerStyle,
  type MockupProject,
} from "./project.js";

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
  const screenshotUri = source ? ctx.resolveUri(source.file) : "";

  const bg = resolveBackground(style.background, ctx.resolveUri, ctx.columnIndex, ctx.columnCount);

  const d1 = style.deviceOne;
  const d1Transform = `translate(${transform.deviceOne.xPct + d1.x}%, ${d1.y}%) scale(${d1.size / 90}) rotate(${transform.deviceOne.rotate + d1.rotation}deg)`;
  let deviceLayers = `<div class="layer" style="transform:${d1Transform}">${layerMarkup(deviceRow.deviceId, screenshotUri, d1, deviceRow.variant)}</div>`;

  if (preset.twoDevices && style.deviceTwo && transform.deviceTwo) {
    const d2 = style.deviceTwo;
    const source2 = project.sources.find((s) => s.id === d2.sourceId) ?? source;
    const uri2 = source2 ? ctx.resolveUri(source2.file) : screenshotUri;
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
  const resolveUri = (relativePath: string) => dataUri(mockupFile(project.id, relativePath));
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
