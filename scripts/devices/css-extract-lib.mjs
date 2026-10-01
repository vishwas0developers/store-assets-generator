// Helpers for extracting a CSS-built device from a video template's HTML.
// Templates are generated files; this is applied once per template by
// extract-css-devices.mjs (idempotent: already-extracted templates are skipped).

/** Index just past the `</div>` matching the `<div` opened at `start`. */
export function divEnd(html, start) {
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  throw new Error("unbalanced <div> at " + start);
}

/** Top-level child element ranges (divs only, plus text gaps) of an inner-HTML string. */
export function topLevelNodes(inner) {
  const nodes = [];
  const re = /<(div|img|span|svg|p)\b[^>]*>/g;
  let pos = 0, m;
  while ((m = re.exec(inner))) {
    if (m.index < pos) continue;
    let end;
    if (m[1] === "img") end = m.index + m[0].length;
    else {
      const close = new RegExp(`<(/?)${m[1]}\\b[^>]*>`, "g");
      close.lastIndex = m.index;
      let depth = 0, c;
      while ((c = close.exec(inner))) {
        depth += c[1] ? -1 : 1;
        if (depth === 0) { end = c.index + c[0].length; break; }
      }
      if (end === undefined) throw new Error("unbalanced " + m[1]);
    }
    nodes.push({ start: m.index, end, html: inner.slice(m.index, end), cls: (m[0].match(/class="([^"]*)"/) || [, ""])[1].split(/\s+/).filter(Boolean) });
    pos = end; re.lastIndex = end;
  }
  return nodes;
}

/** Top-level CSS rules of a stylesheet: {start,end,sel,body,at}. */
export function parseRules(css) {
  const rules = [];
  let i = 0;
  while (i < css.length) {
    if (css.startsWith("/*", i)) { const e = css.indexOf("*/", i); i = e < 0 ? css.length : e + 2; continue; }
    if (/\s/.test(css[i])) { i++; continue; }
    const start = i;
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0, j = open;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}" && --depth === 0) { j++; break; }
    }
    const sel = css.slice(start, open).trim();
    rules.push({ start, end: j, sel, body: css.slice(open + 1, j - 1), at: sel.startsWith("@") });
    i = j;
  }
  return rules;
}

export const classesIn = (html) => {
  const out = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach((c) => out.add(c));
  return out;
};
