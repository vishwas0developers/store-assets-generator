import fs from "fs";
import path from "path";
import type { ColumnStyle, Decoration, DeviceLayerStyle, MockupAssetLayer, TextLayer } from "./project.js";

export interface MockupTemplatePage {
  title?: string;
  subtitle?: string;
  layout?: string;
  background?: ColumnStyle["background"] | null;
  devices?: Array<{ deviceId: string; label: string; variant?: string }> | null;
  decorations?: Decoration[];
  textLayers?: TextLayer[];
  assetLayers?: MockupAssetLayer[];
  /** Per-page device placement (size/x/y/rotation/zIndex/panoramaXPx/visible...) merged over the layout preset defaults. */
  deviceOne?: Partial<DeviceLayerStyle>;
  deviceTwo?: Partial<DeviceLayerStyle>;
  extraDevices?: DeviceLayerStyle[];
}

export interface MockupTemplateDefinition {
  version?: number;
  id: string;
  name: string;
  category: string;
  description?: string;
  devices: Array<{ deviceId: string; label: string; variant?: string }>;
  layout: string;
  background: ColumnStyle["background"];
  textColor?: string;
  panoramic?: boolean;
  columnCount?: number;
  titles?: string[];
  subtitles?: string[];
  pages?: MockupTemplatePage[];
  /** Page height (at 1080 wide) the absolute layer/device positions were authored for; see fitPageToHeight in templates.ts. */
  designHeight?: number;
  folderPath?: string;
  filePath?: string;
}

const TEMPLATES_ROOT = path.join(process.cwd(), "templates", "mockup");
let cachedTemplates: Map<string, MockupTemplateDefinition> | null = null;

function scanJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      results.push(fullPath);
    }
  }
  return results;
}

export function validateAndNormalizeTemplate(raw: any, filepath?: string): MockupTemplateDefinition {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid JSON content in template file ${filepath || ""}`);
  }
  if (!raw.id || typeof raw.id !== "string") {
    throw new Error(`Template missing required string field 'id' in ${filepath || ""}`);
  }
  if (!raw.name || typeof raw.name !== "string") {
    throw new Error(`Template '${raw.id}' missing required string field 'name'`);
  }
  if (!raw.category || typeof raw.category !== "string") {
    throw new Error(`Template '${raw.id}' missing required string field 'category'`);
  }

  const devices = Array.isArray(raw.devices) ? raw.devices : [{ deviceId: "apple-iphone-16-pro-max", label: "6.7 Inch Phone" }];
  const layout = raw.layout || "the-airbnb-left-1-title-above";
  const background = raw.background || { type: "gradient", value: "sunset" };

  // Normalize pages array
  let pages: MockupTemplatePage[] = [];
  if (Array.isArray(raw.pages) && raw.pages.length > 0) {
    pages = raw.pages.map((p: any, idx: number) => ({
      title: p.title ?? (raw.titles?.[idx] || `Feature ${idx + 1}`),
      subtitle: p.subtitle ?? (raw.subtitles?.[idx] || "Lorem ipsum dolor sit amet"),
      layout: p.layout || layout,
      background: p.background ?? null,
      devices: p.devices ?? null,
      decorations: Array.isArray(p.decorations) ? p.decorations : [],
      textLayers: Array.isArray(p.textLayers) ? p.textLayers : [],
      assetLayers: Array.isArray(p.assetLayers) ? p.assetLayers : [],
      deviceOne: p.deviceOne,
      deviceTwo: p.deviceTwo,
      extraDevices: Array.isArray(p.extraDevices) ? p.extraDevices : undefined,
    }));
  } else {
    const count = typeof raw.columnCount === "number" && raw.columnCount > 0 ? raw.columnCount : (raw.titles?.length || 5);
    for (let i = 0; i < count; i++) {
      pages.push({
        title: raw.titles?.[i] || `Feature ${i + 1}`,
        subtitle: raw.subtitles?.[i] || "Lorem ipsum dolor sit amet",
        layout: layout,
        background: null,
        devices: null,
        decorations: [],
        textLayers: [],
        assetLayers: [],
      });
    }
  }

  return {
    version: raw.version || 1,
    id: raw.id,
    name: raw.name,
    category: raw.category,
    description: raw.description || "",
    devices,
    layout,
    background,
    textColor: raw.textColor,
    panoramic: !!raw.panoramic,
    designHeight: typeof raw.designHeight === "number" ? raw.designHeight : undefined,
    columnCount: pages.length,
    titles: pages.map((p) => p.title || ""),
    subtitles: pages.map((p) => p.subtitle || ""),
    pages,
  };
}

/** path+mtime+size of every template file -- the cache is only valid while this is unchanged,
 *  so editing/adding/removing a template JSON shows up without restarting the app. */
function templateSignature(files: string[]): string {
  return files
    .map((f) => {
      try {
        const st = fs.statSync(f);
        return `${f}:${st.mtimeMs}:${st.size}`;
      } catch {
        return `${f}:missing`;
      }
    })
    .sort()
    .join("|");
}
let cachedSignature = "";

export function loadMockupTemplatesFromDisk(forceReload = false): MockupTemplateDefinition[] {
  const jsonFiles = scanJsonFiles(TEMPLATES_ROOT);
  const signature = templateSignature(jsonFiles);
  if (cachedTemplates && !forceReload && signature === cachedSignature) {
    return Array.from(cachedTemplates.values());
  }
  console.log(
    `[TemplateLoader] ${cachedTemplates ? "Change detected -- reloading" : "Loading"} mockup templates from ${TEMPLATES_ROOT} (${jsonFiles.length} files)`,
  );

  const map = new Map<string, MockupTemplateDefinition>();

  for (const filePath of jsonFiles) {
    try {
      const rawText = fs.readFileSync(filePath, "utf-8");
      const json = JSON.parse(rawText);
      const normalized = validateAndNormalizeTemplate(json, filePath);
      normalized.folderPath = path.dirname(filePath);
      normalized.filePath = filePath;
      map.set(normalized.id, normalized);
    } catch (err: any) {
      console.error(`[TemplateLoader] Failed to load template file ${filePath}:`, err.message);
    }
  }

  cachedTemplates = map;
  cachedSignature = signature;
  console.log(`[TemplateLoader] Loaded ${map.size}/${jsonFiles.length} mockup templates`);
  return Array.from(cachedTemplates.values()).sort((a, b) => {
    const catCmp = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

export function getMockupTemplateFromDisk(id: string): MockupTemplateDefinition | undefined {
  if (!cachedTemplates) {
    loadMockupTemplatesFromDisk();
  }
  return cachedTemplates?.get(id);
}
