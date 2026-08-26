import { type FlowStep, type VideoProject, type VideoScene, type SlotValue } from "./project.js";
import { templateConfig, htmlSpanToAsterisk } from "./templateConfig.js";
import fs from "fs";
import path from "path";

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
function seedTextSlotValues(cfgScene: any, s: VideoTemplateScene): Record<string, SlotValue> {
  const values: Record<string, SlotValue> = {};
  const slots: Record<string, unknown> | undefined = cfgScene?.slots ?? undefined;
  if (slots?.text && s.text) values.text = { kind: "text", value: htmlSpanToAsterisk(s.text) };
  if (slots?.subtext && s.subtext) values.subtext = { kind: "text", value: htmlSpanToAsterisk(s.subtext) };
  return values;
}

export function applyVideoTemplate(project: VideoProject, templateId: string): void {
  const resolvedId = resolveTemplateId(templateId);
  const template = VIDEO_TEMPLATES.find((t) => t.id === resolvedId);
  if (!template) throw new Error(`Unknown video template '${templateId}'.`);

  // Device presets (no `slots` config) still drive their screenshots
  // positionally through the legacy sourceId/screenIds fields -- that's what
  // their code-generated render path (sceneHtml) reads. Slot-driven (tpl-*)
  // templates read screenshots through slotValues instead (see slots.ts),
  // so they must NOT also claim sources positionally here -- a multi-shot
  // scene's images are assigned by the user per-slot in the studio UI, not
  // by first-come-first-served source order.
  const cfg = templateConfig(resolvedId);
  const isDevicePreset = !resolvedId.startsWith("tpl-");

  let sourceCursor = 0;
  project.template = resolvedId;
  project.scenes = template.scenes.map((s, i): VideoScene => {
    const count = isDevicePreset && s.screenCount && s.screenCount > 1 ? s.screenCount : 1;
    let sourceId: string | undefined;
    let screenIds: string[] | undefined;
    if (isDevicePreset) {
      const slice = project.sources.slice(sourceCursor, sourceCursor + count);
      sourceCursor += count;
      sourceId = slice[0]?.id;
      screenIds = count > 1 ? Array.from({ length: count }, (_, j) => slice[j]?.id ?? `__placeholder_${i}_${j}__`) : undefined;
    }
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
      slotValues: isDevicePreset ? undefined : seedTextSlotValues(cfg?.scenes?.[i], s),
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
