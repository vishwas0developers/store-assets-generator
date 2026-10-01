import fs from "fs";
import path from "path";

/** Path to a standalone template's HTML file (flat: templates/video/<id>.html). */
export function templateHtmlPath(templateId: string): string {
  return path.join(process.cwd(), "templates", "video", `${templateId}.html`);
}

const templateConfigCache = new Map<string, any | null>();

/** Call after a template HTML file is rewritten on disk. */
export function clearTemplateConfigCache(): void {
  templateConfigCache.clear();
}

/** Cached parse of a template's embedded `#template-config` JSON. Returns
 *  null when the template has no HTML file or no config block. Kept in its
 *  own module (no dependency on render.ts/templates.ts) so both can read it
 *  without a circular import. */
export function templateConfig(templateId: string): any | null {
  if (templateConfigCache.has(templateId)) return templateConfigCache.get(templateId)!;
  let config: any | null = null;
  try {
    const htmlPath = templateHtmlPath(templateId);
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, "utf-8");
      const match = html.match(/<script type="application\/json" id="template-config">([\s\S]*?)<\/script>/);
      if (match) config = JSON.parse(match[1]);
    }
  } catch (e) {
    console.error(`Failed to parse template config for '${templateId}':`, e);
  }
  templateConfigCache.set(templateId, config);
  return config;
}

/** Converts a template config's literal `<span>word</span>` highlight
 *  markup (e.g. tpl-62155880's default "Meet <span>Personal</span>
 *  Delivery") into the `*word*` convention that slots.ts's renderRichText
 *  expects from *user-entered* text -- renderRichText HTML-escapes its
 *  input first (a sanitization requirement for free-text values), which
 *  would otherwise turn a template's own literal span markup into visible
 *  escaped text. Anything that isn't exactly one `<span>...</span>` pair is
 *  left untouched (returned as-is) rather than guessed at. */
export function htmlSpanToAsterisk(raw: string): string {
  return raw.replace(/<span>([^<]*)<\/span>/g, "*$1*");
}
