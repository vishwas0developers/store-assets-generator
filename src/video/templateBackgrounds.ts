import fs from "fs";
import { templateHtmlPath } from "./templateConfig.js";

/** Prefix that marks a background reference as "the native background of
 *  template <id>" rather than an uploaded source id -- stored in the same
 *  fields (project.backgroundImage / scene.slotValues.background.sourceId). */
export const TEMPLATE_BG_PREFIX = "template:";

const cache = new Map<string, string | null>();

/** A template's own background, read straight from its template HTML so every
 *  existing template is automatically a reusable background asset (no second
 *  registry to keep in sync). Device presets keep it inline on their first
 *  scene's `.backdrop`; the tpl-* promos put it on the shared `.canvas` rule. */
export function templateBackgroundCss(templateId: string): string | null {
  if (cache.has(templateId)) return cache.get(templateId)!;
  let css: string | null = null;
  try {
    const file = templateHtmlPath(templateId);
    if (fs.existsSync(file)) {
      const html = fs.readFileSync(file, "utf-8");
      const inline = html.match(/class="backdrop"\s+style="background:\s*([^";]+)/);
      if (inline) css = inline[1].trim();
      else {
        for (const rule of html.matchAll(/\.canvas\s*\{([^}]*)\}/g)) {
          const bg = rule[1].match(/(?:^|[;\s])background\s*:\s*([^;]+)/);
          if (bg) { css = bg[1].trim(); break; }
        }
      }
    }
  } catch { css = null; }
  cache.set(templateId, css);
  return css;
}

export function listTemplateBackgrounds(templates: { id: string; name: string }[]): { ref: string; templateId: string; name: string; css: string }[] {
  const out: { ref: string; templateId: string; name: string; css: string }[] = [];
  for (const t of templates) {
    const css = templateBackgroundCss(t.id);
    if (css) out.push({ ref: TEMPLATE_BG_PREFIX + t.id, templateId: t.id, name: t.name, css });
  }
  return out;
}
