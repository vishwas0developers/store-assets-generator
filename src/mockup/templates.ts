import { addColumn, addDeviceRow, defaultColumnStyle, ensureSizeRows, type ColumnStyle, type MockupProject } from "./project.js";
import { DEVICE_REGISTRY, resolveGeometry } from "../devices/registry.js";
import { getLayoutPreset } from "./layouts.js";
import { designSizeFor, primaryTargetFor } from "./sizeTargets.js";
import {
  loadMockupTemplatesFromDisk,
  getMockupTemplateFromDisk,
  writeTemplateToDisk,
  type MockupTemplateDefinition,
  type MockupTemplatePage
} from "./template-loader.js";

export { getMockupTemplateFromDisk, loadMockupTemplatesFromDisk };
export type MockupStarterTemplate = MockupTemplateDefinition;

export function getMockupTemplates(): MockupStarterTemplate[] {
  return loadMockupTemplatesFromDisk();
}

/** Dynamic accessor getter so callers accessing `MOCKUP_TEMPLATES` get the loaded templates */
export const MOCKUP_TEMPLATES: MockupStarterTemplate[] = new Proxy([], {
  get(target, prop, receiver) {
    const list = loadMockupTemplatesFromDisk();
    if (prop === "length") return list.length;
    if (prop === Symbol.iterator) return list[Symbol.iterator].bind(list);
    if (typeof prop === "string" && !isNaN(Number(prop))) {
      return list[Number(prop)];
    }
    const val = (list as any)[prop];
    return typeof val === "function" ? val.bind(list) : val;
  }
});

const CANVAS_WIDTH = 1080;

function sizeForDevice(deviceId: string, variant: string | undefined, targetWidthPx: number, maxHeightPx = 1920 * 0.82): number {
  const device = DEVICE_REGISTRY[deviceId] ?? DEVICE_REGISTRY["phone"];
  const geometry = resolveGeometry(device, variant);
  const widthScale = targetWidthPx / geometry.width;
  const heightScale = maxHeightPx / geometry.height;
  return Math.round(90 * Math.min(widthScale, heightScale));
}

/** Re-fits a page authored for `designH` (absolute px at 1080 wide) to a page `H` tall: shorter pages scale the whole
 *  composition down uniformly (centred horizontally, top-anchored); taller pages keep it at 1:1 from the top. Layers that
 *  bled off the page bottom / both sides keep doing so. Without this, % positions stretch with the page height while
 *  font sizes and widths don't -- e.g. an underline drifting up behind its title on a 1920-tall preview. */
function fitPageToHeight(style: ColumnStyle, designH: number, H: number, deviceHeightAt90: number, pageIndex: number): void {
  if (designH === H) return;
  const s = Math.min(1, H / designH);
  const ox = (1080 * (1 - s)) / 2;
  const yk = (s * designH) / H; // design % of page height -> new %
  const fitBox = (l: { xPct: number; yPct: number; widthPct: number; heightPct?: number }) => {
    // A layer touching a side edge keeps touching it (stretching) -- uniform scaling alone would open a gap there.
    const left = l.xPct, right = l.xPct + l.widthPct;
    const bleedBottom = l.heightPct != null && l.yPct + l.heightPct >= 99.9;
    l.xPct = left <= 0.01 ? left : ((ox + (s * left * 1080) / 100) / 1080) * 100;
    const newRight = right >= 99.99 ? right : ((ox + (s * right * 1080) / 100) / 1080) * 100;
    l.widthPct = newRight - l.xPct;
    l.yPct *= yk;
    if (l.heightPct != null) l.heightPct = bleedBottom ? 100 - l.yPct : l.heightPct * yk;
  };
  for (const l of style.assetLayers ?? []) fitBox(l);
  for (const l of style.textLayers ?? []) {
    fitBox(l);
    l.style.size *= s;
  }
  for (const d of [style.deviceOne, style.deviceTwo, ...(style.extraDevices ?? [])]) {
    if (!d) continue;
    const devH = (deviceHeightAt90 * d.size) / 90; // rendered height at design scale
    const cy = designH / 2 + (d.y / 100) * devH;
    d.size *= s;
    d.y = ((s * cy - H / 2) / (s * devH)) * 100; // x is % of the device's own width, so it survives uniform scaling
    if (d.panoramaXPx != null) d.panoramaXPx = pageIndex * 1080 + ox + s * (d.panoramaXPx - pageIndex * 1080);
  }
}

/** Inverse of applyMockupTemplate: overwrites `templateId`'s JSON with the project's current pages. Returns the template name. */
export function updateTemplateFromProject(project: MockupProject, templateId: string, platform?: string): string {
  const template = getMockupTemplateFromDisk(templateId);
  if (!template) throw new Error(`Unknown template '${templateId}'.`);
  if (project.columns.length === 0) throw new Error("This project has no pages to save.");
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  const device = (d: any) => {
    const c = clone(d);
    delete c.sourceId;
    return c;
  };

  template.pages = project.columns.map((col) => {
    const s = col.style;
    const { text: title, ...titleStyle } = s.title;
    const { text: subtitle, ...subtitleStyle } = s.subtitle;
    return {
      title,
      subtitle,
      titleStyle,
      subtitleStyle,
      layout: s.layout,
      background: clone(s.background),
      devices: null,
      decorations: clone(s.decorations ?? []),
      textLayers: clone(s.textLayers ?? []),
      assetLayers: clone(s.assetLayers ?? []),
      deviceOne: device(s.deviceOne),
      deviceTwo: s.deviceTwo ? device(s.deviceTwo) : undefined,
      extraDevices: s.extraDevices?.length ? s.extraDevices.map(device) : undefined,
    };
  });
  if (project.devices.length > 0) {
    template.devices = project.devices.map((d) => ({ deviceId: d.deviceId, label: d.label, variant: d.variant }));
  }
  template.layout = project.columns[0].style.layout;
  template.background = clone(project.columns[0].style.background);
  template.textColor = undefined; // per-page titleStyle now carries colours
  template.designHeight = designSizeFor(primaryTargetFor(platform)).height;
  writeTemplateToDisk(template);
  return template.name;
}

export function applyMockupTemplate(project: MockupProject, templateId: string, platform?: string, canvasHeight?: number): void {
  const template = getMockupTemplateFromDisk(templateId) || loadMockupTemplatesFromDisk().find((t) => t.id === templateId);
  if (!template) throw new Error(`Unknown template '${templateId}'.`);

  project.devices = [];
  project.columns = [];
  project.cells = {};
  project.globalPanoramic = { file: "", flip: false };

  template.devices.forEach((d, i) => addDeviceRow(project, { deviceId: d.deviceId, label: d.label, variant: d.variant, previewsVisible: true, isBase: i === 0 }));

  if (platform) ensureSizeRows(project, platform);

  const preset = getLayoutPreset(template.layout);
  const targetWidth = preset.twoDevices ? CANVAS_WIDTH * 0.72 : CANVAS_WIDTH * 0.78;
  const baseDevice = template.devices[0];
  const deviceSize = sizeForDevice(baseDevice?.deviceId ?? "phone", baseDevice?.variant, targetWidth);

  const pages: MockupTemplatePage[] = template.pages && template.pages.length > 0 ? template.pages : Array.from({ length: template.columnCount || 5 }, (_, i) => ({
    title: template.titles?.[i] || `Feature ${i + 1}`,
    subtitle: template.subtitles?.[i] || "Lorem ipsum dolor sit amet",
    layout: template.layout,
    background: null,
    devices: null,
    decorations: [],
    textLayers: [],
    assetLayers: []
  }));

  if (template.panoramic) {
    project.globalPanoramic = {
      file: template.background?.panoramaFile || template.background?.value || "",
      flip: false
    };
  }

  pages.forEach((page, i) => {
    const defaultTitle = page.title || `Feature ${i + 1}`;
    const defaultSub = page.subtitle || "Lorem ipsum dolor sit amet";
    const pageLayout = page.layout || template.layout;
    const pagePreset = getLayoutPreset(pageLayout);

    const style = defaultColumnStyle(defaultTitle);
    style.subtitle.text = defaultSub;
    style.layout = pageLayout;
    
    style.background = page.background || template.background;

    if (template.textColor) {
      style.title.color = template.textColor;
      style.subtitle.color = template.textColor;
    }
    if (page.titleStyle) Object.assign(style.title, page.titleStyle);
    if (page.subtitleStyle) Object.assign(style.subtitle, page.subtitleStyle);
    style.deviceOne.size = deviceSize;
    style.deviceOne.frameless = pagePreset.frameless;
    if (pagePreset.twoDevices) {
      style.deviceTwo = { ...style.deviceOne, sourceId: undefined };
    }

    if (page.deviceOne) Object.assign(style.deviceOne, page.deviceOne);
    if (page.deviceTwo && style.deviceTwo) Object.assign(style.deviceTwo, page.deviceTwo);
    if (page.extraDevices && page.extraDevices.length > 0) {
      style.extraDevices = page.extraDevices.map((d) => ({ ...style.deviceOne, sourceId: undefined, ...JSON.parse(JSON.stringify(d)) }));
    }

    if (page.decorations && page.decorations.length > 0) {
      style.decorations = JSON.parse(JSON.stringify(page.decorations));
    }
    if (page.textLayers && page.textLayers.length > 0) {
      style.textLayers = JSON.parse(JSON.stringify(page.textLayers));
    }
    if (page.assetLayers && page.assetLayers.length > 0) {
      style.assetLayers = JSON.parse(JSON.stringify(page.assetLayers));
    }

    if (template.designHeight) {
      const geo = resolveGeometry(DEVICE_REGISTRY[baseDevice?.deviceId ?? "phone"] ?? DEVICE_REGISTRY["phone"], baseDevice?.variant);
      fitPageToHeight(style, template.designHeight, canvasHeight ?? designSizeFor(primaryTargetFor(platform)).height, geo.height, i);
    }

    const col = addColumn(project, style);
    col.templateDefaultStyle = JSON.parse(JSON.stringify(style));
  });
}
