import { addColumn, addDeviceRow, defaultColumnStyle, ensureSizeRows, type ColumnStyle, type MockupProject } from "./project.js";
import { DEVICE_REGISTRY, resolveGeometry } from "../devices/registry.js";
import { getLayoutPreset } from "./layouts.js";
import {
  loadMockupTemplatesFromDisk,
  getMockupTemplateFromDisk,
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

export function applyMockupTemplate(project: MockupProject, templateId: string, platform?: string): void {
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
    style.deviceOne.size = deviceSize;
    style.deviceOne.frameless = pagePreset.frameless;
    if (pagePreset.twoDevices) {
      style.deviceTwo = { ...style.deviceOne, sourceId: undefined };
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

    const col = addColumn(project, style);
    col.templateDefaultStyle = JSON.parse(JSON.stringify(style));
  });
}
