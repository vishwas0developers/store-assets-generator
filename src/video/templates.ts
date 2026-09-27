import { type FlowStep, type VideoProject, type VideoScene, type SlotValue } from "./project.js";
import { templateConfig, htmlSpanToAsterisk } from "./templateConfig.js";
import { slotSpecsForScene } from "./slots.js";
import fs from "fs";
import path from "path";

// Scenes below default to sourceId/screenIds like "demo_landscape"/"demo_1" so a
// freshly-applied template previews with real photo content immediately. These ids are
// resolved at render time against the shared global demo assets (see demoAssets.ts,
// used from render.ts/slots.ts) -- never copied into or registered as this project's
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
  device: string;
  variant?: string;
  deviceFraction: number;
  scenes: VideoTemplateScene[];
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [];

export function loadAllTemplates(): VideoTemplate[] {
  const templatesDir = path.join(process.cwd(), "templates", "video");
  if (!fs.existsSync(templatesDir)) return [];
  const folders = fs.readdirSync(templatesDir);
  const list: VideoTemplate[] = [];
  for (const f of folders) {
    const htmlPath = path.join(templatesDir, f, "template.html");
    if (fs.existsSync(htmlPath)) {
      try {
        const html = fs.readFileSync(htmlPath, "utf-8");
        const match = html.match(/<script type="application\/json" id="template-config">([\s\S]*?)<\/script>/);
        if (match) {
          const config = JSON.parse(match[1]);
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

export function applyVideoTemplate(project: VideoProject, templateId: string): void {
  const resolvedId = resolveTemplateId(templateId);
  const template = VIDEO_TEMPLATES.find((t) => t.id === resolvedId);
  if (!template) throw new Error(`Unknown video template '${templateId}'.`);

  const cfg = templateConfig(resolvedId);
  const isDevicePreset = !resolvedId.startsWith("tpl-");
  const isLandscape = template.aspectRatio === "16:9";

  project.template = resolvedId;
  // ponytail: leave project.bgm unset here -- render/preview already fall back to
  // the template's own generated BGM preset (BGM_PRESETS) whenever it's null, so
  // there's nothing to default it to here. A prior "bgm_chill" sentinel did not
  // correspond to any real file or preset id and only obscured that fallback.

  project.scenes = template.scenes.map((s, i): VideoScene => {
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

export function scratchVideoProject(templateId: string, sources: VideoProject["sources"] = []): VideoProject {
  const scratch: VideoProject = {
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
