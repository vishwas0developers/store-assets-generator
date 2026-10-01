import { type FlowStep, type VideoApplication, type VideoScene, type SlotValue } from "./application.js";
import { templateConfig, htmlSpanToAsterisk, clearTemplateConfigCache, templateHtmlPath } from "./templateConfig.js";
import { slotSpecsForScene } from "./slots.js";
import { DEVICE_REGISTRY } from "../devices/registry.js";
import { listCssDevices } from "../devices/rig-assets.js";
import fs from "fs";
import path from "path";

// Scenes below default to sourceId/screenIds like "demo_landscape"/"demo_1" so a
// freshly-applied template previews with real photo content immediately. These ids are
// resolved at render time against the shared global demo assets (see demoAssets.ts,
// used from render.ts/slots.ts) -- never copied into or registered as this application's
// own sources/files.

export interface VideoTemplateScene {
  label: string;
  sceneTemplate: string;
  durationSeconds: number;
  background: string;
  rotate: number;
  zoom: number;
  move: number;
  screenCount?: number;
  layout?: string;
  depth?: "flat" | "perspective" | "float" | "showcase";
  transition?: "cut" | "fade" | "slide" | "wipe" | "zoom";
  flowSteps?: FlowStep[];
  /** Explicit device mode this scene expects (defaults to the template's). */
  deviceMode?: "2D" | "3D";
  text: string;
  subtext: string;
}

export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  useCase: string;
  designStyle: string;
  aspectRatio: string;
  features: string[];
  /** Default device mode for every scene in this template. */
  deviceMode: "2D" | "3D";
  /** Store platforms this template targets (google-play / apple-app-store). */
  platforms: string[];
  device: string;
  variant?: string;
  deviceFraction: number;
  scenes: VideoTemplateScene[];
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [];

export function loadAllTemplates(): VideoTemplate[] {
  const templatesDir = path.join(process.cwd(), "templates", "video");
  if (!fs.existsSync(templatesDir)) return [];
  const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith(".html"));
  const list: VideoTemplate[] = [];
  for (const f of files) {
    const htmlPath = path.join(templatesDir, f);
    {
      try {
        const html = fs.readFileSync(htmlPath, "utf-8");
        const match = html.match(/<script type="application\/json" id="template-config">([\s\S]*?)<\/script>/);
        if (match) {
          const config = JSON.parse(match[1]);
          config.deviceMode ??= "3D";
          config.platforms ??= DEVICE_REGISTRY[config.device]?.platforms ?? listCssDevices().find((d) => d.id === config.device)?.platforms ?? [];
          list.push(config);
        }
      } catch (e) {
        console.error(`Failed to load template ${f}:`, e);
      }
    }
  }
  VIDEO_TEMPLATES.length = 0;
  VIDEO_TEMPLATES.push(...list);
  return VIDEO_TEMPLATES;
}

// Initial load
loadAllTemplates();

export const TEMPLATE_ID_ALIASES: Record<string, string> = {
  "minimal-premium": "iphone-15-pro-portrait",
  "modern-saas": "pixel-9-pro-portrait",
  "bold-marketing": "galaxy-s25-portrait",
  "light-minimal": "iphone-16-pro-portrait",
  "cinematic-showcase": "iphone-15-pro-landscape",
  "futuristic-tech": "pixel-9-pro-landscape",
  "editorial-studio": "iphone-16-pro-landscape",
  "dark-premium": "galaxy-s25-landscape",
  "foldable-story": "pixel-9-portrait",
  "foldable-unfold": "pixel-9-portrait",
  "feature-showcase": "iphone-15-pro-portrait",
  "social-promo": "pixel-9-portrait",
  "quick-teaser": "pixel-9-pro-portrait",
  "studio-tablet": "iphone-16-pro-landscape",
  "landscape-hero": "iphone-15-pro-landscape",
  "landscape-cinematic": "pixel-9-pro-landscape",
  "landscape-social-ad": "galaxy-s25-landscape",
  "landscape-minimal": "iphone-16-pro-landscape",
};

export function resolveTemplateId(templateId: string): string {
  if (VIDEO_TEMPLATES.some((t) => t.id === templateId)) return templateId;
  return TEMPLATE_ID_ALIASES[templateId] ?? templateId;
}

/** Seed slotValues.text/subtext from the template's own default copy, for
 *  whichever roles this scene actually declares -- a convenience starting
 *  point, not a full derivation (that's slots.ts's job; templates.ts can't
 *  import it without a circular dependency back through render.ts). Image/
 *  list slots start unset and are filled by the user via the studio UI. */
function seedDemoSlotValues(
  templateId: string,
  sceneIndex: number,
  cfgScene: any,
  s: VideoTemplateScene,
  sourceId: string | undefined,
  screenIds: string[] | undefined,
): Record<string, SlotValue> {
  const values: Record<string, SlotValue> = {};
  const slots: Record<string, unknown> | undefined = cfgScene?.slots ?? undefined;

  if (slots?.text && s.text) values.text = { kind: "text", value: htmlSpanToAsterisk(s.text) };
  if (slots?.subtext && s.subtext) values.subtext = { kind: "text", value: htmlSpanToAsterisk(s.subtext) };
  if (slots?.textRight && s.text) values.textRight = { kind: "text", value: htmlSpanToAsterisk(s.text) };
  if (slots?.subtextRight && s.subtext) values.subtextRight = { kind: "text", value: htmlSpanToAsterisk(s.subtext) };

  const specs = slotSpecsForScene(templateId, sceneIndex);
  for (const spec of specs) {
    if (values[spec.key]) continue;
    if (spec.kind === "image") {
      values[spec.key] = { kind: "image", sourceId: spec.key === "logo" ? "demo_logo" : (sourceId ?? `demo_${(sceneIndex % 6) + 1}`) };
    } else if (spec.kind === "imageList") {
      // Mirror the legacy screenIds/sourceId this same scene already carries
      // (see applyVideoTemplate) so the slot-driven and code-generated
      // render paths never disagree about which demo screenshot is shown.
      const count = spec.count ?? 1;
      const base = (screenIds && screenIds.length > 0) ? screenIds : (sourceId ? [sourceId] : []);
      values[spec.key] = {
        kind: "imageList",
        sourceIds: Array.from({ length: count }, (_, j) => base[j % Math.max(base.length, 1)] ?? `demo_${(j % 6) + 1}`),
      };
    } else if (spec.kind === "text") {
      values[spec.key] = { kind: "text", value: spec.key === "text" ? "Headline" : "Subtext" };
    } else if (spec.kind === "textList") {
      const count = spec.count ?? 1;
      values[spec.key] = {
        kind: "textList",
        values: Array.from({ length: count }, () => "Label"),
      };
    } else if (spec.kind === "platformList") {
      values[spec.key] = {
        kind: "platformList",
        items: [
          { name: "App Store", icon: "apple", url: "https://apps.apple.com" },
          { name: "Google Play", icon: "android", url: "https://play.google.com" }
        ]
      };
    }
  }
  return values;
}

export function applyVideoTemplate(application: VideoApplication, templateId: string): void {
  const resolvedId = resolveTemplateId(templateId);
  const template = VIDEO_TEMPLATES.find((t) => t.id === resolvedId);
  if (!template) throw new Error(`Unknown video template '${templateId}'.`);

  const cfg = templateConfig(resolvedId);
  const isDevicePreset = !resolvedId.startsWith("tpl-");
  const isLandscape = template.aspectRatio === "16:9";

  application.template = resolvedId;
  // ponytail: leave application.bgm unset here -- render/preview already fall back to
  // the template's own generated BGM preset (BGM_PRESETS) whenever it's null, so
  // there's nothing to default it to here. A prior "bgm_chill" sentinel did not
  // correspond to any real file or preset id and only obscured that fallback.

  application.scenes = template.scenes.map((s, i): VideoScene => {
    const count = isDevicePreset && s.screenCount && s.screenCount > 1 ? s.screenCount : 1;
    // Slot-driven (tpl-*) templates don't read sourceId/screenIds at render
    // time (they read slotValues instead), but still get a sensible default
    // here so seedDemoSlotValues below has something real to point at.
    const sourceId = isLandscape ? "demo_landscape" : "demo_1";
    const screenIds = isDevicePreset && count > 1 ? Array.from({ length: count }, (_, j) => `demo_${(j % 6) + 1}`) : undefined;

    return {
      id: `scene_${i + 1}`,
      order: i,
      sceneTemplate: s.sceneTemplate,
      sourceId,
      screenIds,
      deviceMode: s.deviceMode ?? template.deviceMode ?? "3D",
      device: template.device,
      variant: template.variant,
      deviceFraction: template.deviceFraction,
      aspectRatio: template.aspectRatio === "16:9" ? "16:9" : "9:16",
      layout: s.layout,
      depth: s.depth,
      transition: s.transition,
      background: s.background,
      text: s.text,
      subtext: s.subtext,
      durationSeconds: s.durationSeconds || 5,
      rotate: s.rotate,
      zoom: s.zoom,
      move: s.move,
      slotValues: seedDemoSlotValues(resolvedId, i, cfg?.scenes?.[i], s, sourceId, screenIds),
    };
  });
}

export function scratchVideoApplication(templateId: string, sources: VideoApplication["sources"] = []): VideoApplication {
  const scratch: VideoApplication = {
    id: "__template_preview__",
    createdAt: new Date().toISOString(),
    name: templateId,
    template: null,
    sources,
    scenes: [],
    bgm: null,
    outputs: {},
  };
  applyVideoTemplate(scratch, templateId);
  return scratch;
}


// ---- Default-template authoring (writes templates/video/*.html) ----

const CONFIG_RE = /(<script type="application\/json" id="template-config">)([\s\S]*?)(<\/script>)/;

function asteriskToSpan(raw: string): string {
  return raw.replace(/\*([^*]+)\*/g, "<span>$1</span>");
}

/** Folds the editing scenes back into a template config (inverse of applyVideoTemplate). Scene count must match,
 *  because each scene is bound to scene-specific markup/slots in the template's HTML. */
function mergeScenesIntoConfig(config: any, scenes: VideoScene[]): any {
  const baseScenes: any[] = config.scenes ?? [];
  if (scenes.length !== baseScenes.length) {
    throw new Error(`This template has ${baseScenes.length} scenes but the editor has ${scenes.length}. Add or remove scenes to match before updating.`);
  }
  const ordered = [...scenes].sort((a, b) => a.order - b.order);
  const next = JSON.parse(JSON.stringify(config));
  next.scenes = baseScenes.map((b, i) => {
    const s = ordered[i];
    const textVal = s.slotValues?.text;
    const subVal = s.slotValues?.subtext;
    const merged: any = {
      ...b,
      sceneTemplate: s.sceneTemplate,
      durationSeconds: s.durationSeconds,
      background: s.background,
      rotate: s.rotate,
      zoom: s.zoom,
      move: s.move,
      text: textVal?.kind === "text" ? asteriskToSpan(textVal.value) : s.text,
      subtext: subVal?.kind === "text" ? asteriskToSpan(subVal.value) : s.subtext,
    };
    for (const k of ["layout", "depth", "transition", "deviceMode", "flowSteps"] as const) {
      if ((s as any)[k] !== undefined) merged[k] = (s as any)[k];
    }
    if (s.screenIds && s.screenIds.length > 1) merged.screenCount = s.screenIds.length;
    return merged;
  });
  const first = ordered[0];
  if (first) {
    if (first.device) next.device = first.device;
    if (first.variant !== undefined) next.variant = first.variant;
    if (first.deviceFraction !== undefined) next.deviceFraction = first.deviceFraction;
    if (first.deviceMode) next.deviceMode = first.deviceMode;
  }
  return next;
}

function writeConfigIntoHtml(html: string, config: any): string {
  return html.replace(CONFIG_RE, (_m, a, _b, c) => `${a}
${JSON.stringify(config, null, 2)}
${c}`);
}

/** Overwrites exactly `templateId`'s HTML file (keeping a one-time .bak). */
export function updateVideoTemplateOnDisk(templateId: string, scenes: VideoScene[]): VideoTemplate {
  const file = templateHtmlPath(templateId);
  if (!VIDEO_TEMPLATES.some((t) => t.id === templateId) || !fs.existsSync(file)) throw new Error(`Unknown video template '${templateId}'.`);
  const html = fs.readFileSync(file, "utf-8");
  const m = html.match(CONFIG_RE);
  if (!m) throw new Error(`Template '${templateId}' has no embedded config.`);
  const config = mergeScenesIntoConfig(JSON.parse(m[2]), scenes);
  const bak = `${file}.bak`;
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
  fs.writeFileSync(file, writeConfigIntoHtml(html, config), "utf-8");
  clearTemplateConfigCache();
  loadAllTemplates();
  return VIDEO_TEMPLATES.find((t) => t.id === templateId)!;
}

/** Creates a brand-new default template (own id + file) from `baseTemplateId`'s markup with the editing scenes. */
export function createVideoTemplateOnDisk(
  baseTemplateId: string,
  scenes: VideoScene[],
  meta: { name: string; description?: string },
): VideoTemplate {
  const baseFile = templateHtmlPath(baseTemplateId);
  if (!VIDEO_TEMPLATES.some((t) => t.id === baseTemplateId) || !fs.existsSync(baseFile)) throw new Error(`Unknown video template '${baseTemplateId}'.`);
  const name = meta.name.trim();
  if (!name) throw new Error("A template name is required.");
  if (VIDEO_TEMPLATES.some((t) => t.name.toLowerCase() === name.toLowerCase())) throw new Error(`A template named '${name}' already exists.`);
  const html = fs.readFileSync(baseFile, "utf-8");
  const m = html.match(CONFIG_RE);
  if (!m) throw new Error(`Template '${baseTemplateId}' has no embedded config.`);
  const baseConfig = JSON.parse(m[2]);
  const config = mergeScenesIntoConfig(baseConfig, scenes);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "template";
  // "tpl-" ids select the slot-driven render path (see applyVideoTemplate); presets must stay without it.
  const id = baseTemplateId.startsWith("tpl-") ? `tpl-${Date.now() % 100000000}-${slug}` : `${slug.replace(/^tpl-/, "")}-${Date.now() % 100000}`;
  config.id = id;
  config.name = name;
  if (meta.description !== undefined) config.description = meta.description;
  const newFile = templateHtmlPath(id);
  if (fs.existsSync(newFile)) throw new Error("Template id collision; try again.");
  fs.writeFileSync(newFile, writeConfigIntoHtml(html, config), "utf-8");
  clearTemplateConfigCache();
  loadAllTemplates();
  return VIDEO_TEMPLATES.find((t) => t.id === id)!;
}
