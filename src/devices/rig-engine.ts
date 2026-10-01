/**
 * Template-device separation engine.
 *
 * A Video Studio template animates a "rig" element (`.phone-3d-rig` /
 * `.phone-3d-chassis`); everything *inside* the rig is the device (front face,
 * back face, side rails, camera cut-outs, GLB shell canvas ...) and the CSS
 * that styles it. Templates mark each rig with `data-device="<id>"` and keep
 * that device's CSS in a `<style data-device-css="<id>">` block, so an
 * unswapped template is byte-for-byte what it always was and can still be
 * opened directly. At compose time `applyRigDevices` swaps the device of any
 * rig whose scene asks for a different one, keeping the screen content (the
 * `<img id="slot-N">` etc.) and the rig's animation untouched.
 *
 * Pure string functions -- no registry / fs imports -- so both the runtime and
 * the one-off extraction script (scripts/devices/extract-rig-devices.mjs) use
 * exactly the same parsing.
 */

export type SourceType = "SVG" | "GLB" | "CSS";
export type DeviceMode = "2D" | "3D";

export interface RigDeviceParts {
  /** Front face; `<!--SCREEN-->` marks where the screen content goes. */
  front: string;
  back?: string;
  sides: string[];
  ambient?: string;
  /** GLB shell `<canvas>` (3D GLB devices only). */
  shell?: string;
}

export interface RigDeviceAsset {
  id: string;
  name: string;
  vendor?: string;
  /** 2D or 3D -- what the device renders as; the only thing templates care about. */
  deviceType: DeviceMode;
  /** How the device is implemented (implementation detail, not a user category). */
  sourceType: SourceType;
  formFactor: "phone" | "tablet" | "foldable";
  /** Store platforms this device belongs to (google-play / apple-app-store). */
  platforms?: string[];
  dimensions: { width: number; height: number; depth?: number; radius?: number };
  screen?: { top: number; left: number; width: number; height: number; radius?: number };
  features: string[];
  /** Rig element class this device's CSS was written against. */
  rigClass: string;
  /** Extra classes the rig carries while this device is installed. */
  rigClasses: string[];
  /** When true the rig is resized to this device's aspect at the rig's
   *  current height (2D / generic GLB devices); CSS devices size themselves. */
  fitRig?: boolean;
  markup: RigDeviceParts;
  css: string;
  sourceTemplate?: string;
}

export const SCREEN_MARKER = "<!--SCREEN-->";
const SCREEN_CONTAINERS = ["screen-scroll-wrap", "phone-screen-frame"];
/** Children of a screen container that belong to the device, not the content. */
const SCREEN_DECOR = ["gloss-sheen", "phone-glass-reflection", "screen-edge-glare", "curved-edge-shadow"];
const RIG_CLASSES = ["phone-3d-rig", "phone-3d-chassis"];
/** Layout-mode ancestors a device rule may legitimately be nested under. */
const MODE_ANCESTORS = ["landscape-layout", "landscape-mode"];
/** Rig-rule declarations that describe the device body, not the animation. */
const RIG_DEVICE_DECLS = new Set(["width", "height", "border-radius", "box-shadow", "background", "background-color", "border"]);

// ---------------------------------------------------------------------------
// HTML parsing
// ---------------------------------------------------------------------------

/** Index just past the closing tag matching the `<tag` opened at `start`. */
export function elementEnd(html: string, start: number, tag = "div"): number {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  throw new Error(`unbalanced <${tag}> at ${start}`);
}

export interface HtmlNode {
  tag: string;
  start: number;
  end: number;
  html: string;
  cls: string[];
}

/** Top-level element nodes of an inner-HTML string. */
export function topLevelNodes(inner: string): HtmlNode[] {
  const nodes: HtmlNode[] = [];
  const re = /<(div|img|span|svg|p|canvas)\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    const end = m[1] === "img" ? m.index + m[0].length : elementEnd(inner, m.index, m[1]);
    nodes.push({
      tag: m[1], start: m.index, end, html: inner.slice(m.index, end),
      cls: (m[0].match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean),
    });
    re.lastIndex = end;
  }
  return nodes;
}

const openTagOf = (html: string) => html.match(/^<[^>]*>/)![0];

function getAttr(open: string, name: string): string | undefined {
  return open.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

function setAttr(open: string, name: string, value: string): string {
  const re = new RegExp(`(\\s${name}=")[^"]*(")`);
  if (re.test(open)) return open.replace(re, (_m, a, b) => `${a}${value}${b}`);
  return open.replace(/\/?>$/, (end) => ` ${name}="${value}"${end}`);
}

function editClasses(open: string, remove: string[], add: string[]): string {
  const cur = (getAttr(open, "class") ?? "").split(/\s+/).filter(Boolean).filter((c) => !remove.includes(c));
  for (const c of add) if (!cur.includes(c)) cur.push(c);
  return setAttr(open, "class", cur.join(" "));
}

/** Merge `decl` into the tag's inline style; later declarations win per property. */
function appendStyle(open: string, decl: string): string {
  const props = new Map<string, string>();
  for (const d of `${getAttr(open, "style") ?? ""};${decl}`.split(";")) {
    const i = d.indexOf(":");
    if (i > 0) props.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
  }
  return setAttr(open, "style", [...props].map(([k, v]) => `${k}: ${v};`).join(" "));
}

/** Copy the instance's inline `style` onto a device part's opening tag so
 *  per-instance tweaks (e.g. a back face's translateZ) survive a swap. */
function inheritStyle(partHtml: string, instanceHtml: string): string {
  const style = getAttr(openTagOf(instanceHtml), "style");
  if (!style) return partHtml;
  const open = openTagOf(partHtml);
  return partHtml.replace(open, appendStyle(open, style));
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

type Role = "front" | "back" | "side" | "ambient" | "shell" | "other";

function roleOf(n: HtmlNode): Role {
  const c = n.cls;
  if (n.tag === "canvas" && c.includes("device-shell-canvas")) return "shell";
  if (c.includes("phone-ambient-shadow")) return "ambient";
  if (c.includes("phone-face-front") || (c.includes("phone-face") && c.includes("front"))) return "front";
  if (c.includes("phone-face-back") || (c.includes("phone-face") && c.includes("back"))) return "back";
  if (c.includes("phone-side") || c.includes("phone-side-extrusion")) return "side";
  return "other";
}

interface ScreenSplit { before: string; content: string; after: string; containerStyle?: string }

/** Splits a front-face node's html around its screen content run. */
function splitScreen(front: string): ScreenSplit | null {
  const open = openTagOf(front);
  const inner = front.slice(open.length, front.lastIndexOf("</"));
  const container = topLevelNodes(inner).find((n) => n.cls.some((c) => SCREEN_CONTAINERS.includes(c)));
  // Some templates put the screen content straight into the front face.
  const cOpen = container ? openTagOf(container.html) : "";
  const cInner = container ? container.html.slice(cOpen.length, container.html.lastIndexOf("</")) : inner;
  const content = topLevelNodes(cInner).filter((k) => !k.cls.some((c) => SCREEN_DECOR.includes(c)));
  if (!content.length) return null;
  const from = content[0].start;
  const to = content[content.length - 1].end;
  if (!container) {
    const close = front.slice(front.lastIndexOf("</"));
    return { before: open + cInner.slice(0, from), content: cInner.slice(from, to), after: cInner.slice(to) + close, containerStyle: getAttr(open, "style") };
  }
  const pre = open + inner.slice(0, container.start) + cOpen + cInner.slice(0, from);
  const post = cInner.slice(to) + container.html.slice(container.html.lastIndexOf("</")) + inner.slice(container.end) + front.slice(front.lastIndexOf("</"));
  return { before: pre, content: cInner.slice(from, to), after: post, containerStyle: getAttr(cOpen, "style") };
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

export interface CssRule { start: number; end: number; sel: string; body: string; at: boolean }

export function parseCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  let i = 0;
  while (i < css.length) {
    if (css.startsWith("/*", i)) { const e = css.indexOf("*/", i); i = e < 0 ? css.length : e + 2; continue; }
    if (/\s/.test(css[i])) { i++; continue; }
    const start = i;
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0;
    let j = open;
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

const lastCompound = (s: string) => s.split(/\s+|>|\+|~/).filter(Boolean).pop() ?? "";
/** Position/state words that appear on many unrelated elements. */
const GENERIC_CLASSES = new Set(["front", "back", "left", "right", "top", "bottom", "active"]);
const hasClass = (s: string, set: Set<string>) => [...s.matchAll(/\.([\w-]+)/g)].some((m) => set.has(m[1]) && !GENERIC_CLASSES.has(m[1]));

function selectorIsDevice(sel: string, deviceClasses: Set<string>): boolean {
  return sel.split(",").map((s) => s.trim()).every((s) => {
    if (!hasClass(lastCompound(s), deviceClasses)) return false;
    const parts = s.split(/\s+/).filter(Boolean);
    return parts.slice(0, -1).every((p) => MODE_ANCESTORS.some((a) => p === `.${a}`));
  });
}

/** Prefix every selector of `css` so it only matches inside/on a rig carrying
 *  `data-device="key"`. `assetRig` (the rig class the css was authored for) is
 *  rewritten to `actualRig`. */
export function scopeCss(css: string, key: string, assetRig: string, actualRig: string): string {
  const attr = `[data-device="${key}"]`;
  const scopeSel = (raw: string): string =>
    raw.split(",").map((s) => {
      s = s.trim();
      const mode = s.match(/^((?:\.(?:landscape-layout|landscape-mode)\s+)+)(.*)$/);
      const ancestors = mode ? mode[1] : "";
      const rest = mode ? mode[2] : s;
      const swapped = rest.replace(new RegExp(`\\.${assetRig}(?![\\w-])`, "g"), `.${actualRig}`);
      const m = swapped.match(new RegExp(`^(\\.${actualRig}(?:\\.[\\w-]+)*)(.*)$`));
      return m ? `${ancestors}${m[1]}${attr}${m[2]}` : `${ancestors}${attr} ${swapped}`;
    }).join(", ");
  const out: string[] = [];
  for (const r of parseCssRules(css)) {
    if (!r.at) out.push(`${scopeSel(r.sel)} {${r.body}}`);
    else if (/^@media|^@supports/.test(r.sel)) out.push(`${r.sel} {${scopeCss(r.body, key, assetRig, actualRig)}}`);
    else out.push(css.slice(r.start, r.end));
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Extraction (used once per template by scripts/devices/extract-rig-devices.mjs)
// ---------------------------------------------------------------------------

export interface ExtractOptions {
  deviceId: string;
  /** Extra device-only classes beyond those discovered inside the rig. */
  extraDeviceClasses?: string[];
  /** Classes that look like device classes but are template content/choreography. */
  contentClasses?: string[];
}

export interface ExtractResult {
  html: string;
  rigClass: string;
  css: string;
  markup: RigDeviceParts;
  rigClasses: string[];
  size: { width: number; height: number } | null;
  rigCount: number;
  variants: number;
  movedSelectors: string[];
}

const RIG_OPEN = (rig: string) => new RegExp(`<div class="(?:[^"]* )?${rig}(?: [^"]*)?"[^>]*>`, "g");

export function extractRigDevice(html: string, opts: ExtractOptions): ExtractResult {
  const rigClass = RIG_CLASSES.find((r) => RIG_OPEN(r).test(html));
  if (!rigClass) throw new Error("no rig element found");

  const rigs: { start: number; openEnd: number; end: number; open: string }[] = [];
  for (const m of html.matchAll(RIG_OPEN(rigClass))) {
    rigs.push({ start: m.index!, openEnd: m.index! + m[0].length, end: elementEnd(html, m.index!), open: m[0] });
  }

  // Canonical parts: the rig exposing the most roles.
  let best: { score: number; nodes: HtmlNode[]; inner: string } | null = null;
  const variantKeys = new Set<string>();
  const deviceClasses = new Set<string>(opts.extraDeviceClasses ?? []);
  const content = new Set<string>(opts.contentClasses ?? []);
  let commonRigExtra: string[] | null = null;
  for (const r of rigs) {
    const inner = html.slice(r.openEnd, r.end - 6);
    const nodes = topLevelNodes(inner);
    const roles = nodes.map(roleOf);
    variantKeys.add(roles.join(","));
    const score = new Set(roles).size + roles.filter((x) => x === "side").length;
    if (!best || score > best.score) best = { score, nodes, inner };
    const extra = (r.open.match(/class="([^"]*)"/)![1].split(/\s+/)).filter((c) => c !== rigClass);
    commonRigExtra = commonRigExtra ? commonRigExtra.filter((c) => extra.includes(c)) : extra;
    for (const n of nodes) {
      if (roleOf(n) === "other") continue;
      const split = n.html && roleOf(n) === "front" ? splitScreen(n.html) : null;
      // every class inside the device chrome (outside the screen content) is a device class
      const chrome = split ? split.before + split.after : n.html;
      for (const c of chrome.matchAll(/class="([^"]*)"/g)) c[1].split(/\s+/).filter(Boolean).forEach((x) => deviceClasses.add(x));
      if (split) for (const c of split.content.matchAll(/class="([^"]*)"/g)) c[1].split(/\s+/).filter(Boolean).forEach((x) => content.add(x));
    }
  }
  for (const c of content) if (!SCREEN_DECOR.includes(c)) deviceClasses.delete(c);
  deviceClasses.add(rigClass);
  if (!best) throw new Error("no rig content");

  const markup: RigDeviceParts = { front: "", sides: [] };
  for (const n of best.nodes) {
    const role = roleOf(n);
    if (role === "front") {
      const split = splitScreen(n.html);
      if (!split) throw new Error("front face has no screen container");
      markup.front = split.before + SCREEN_MARKER + split.after;
    } else if (role === "back") markup.back ??= n.html;
    else if (role === "side") markup.sides.push(n.html);
    else if (role === "ambient") markup.ambient ??= n.html;
    else if (role === "shell") markup.shell ??= n.html;
  }
  if (!markup.front) throw new Error("no front face found");

  // ---- CSS: pull device rules out of the template's stylesheet ----
  const styleM = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!styleM) throw new Error("no <style> block");
  const css = styleM[1];
  const moved: string[] = [];
  const movedParts: string[] = [];
  const MARK = "/*__DEVICE_CSS__*/";
  let newCss = "";
  let cursor = 0;
  let placed = false;
  let size: { width: number; height: number } | null = null;
  for (const r of parseCssRules(css)) {
    if (r.at) continue;
    const rigOnly = r.sel.split(",").every((x) => x.trim() === `.${rigClass}`);
    let keep: string | null = null; // text left behind in the template for this rule
    if (rigOnly) {
      // animation/layout declarations stay in the template; body declarations move.
      const decls = r.body.split(";").map((d) => d.trim()).filter(Boolean);
      const mv = decls.filter((d) => RIG_DEVICE_DECLS.has(d.split(":")[0].trim()));
      const w = mv.find((d) => d.startsWith("width:"))?.match(/([\d.]+)px/)?.[1];
      const h = mv.find((d) => d.startsWith("height:"))?.match(/([\d.]+)px/)?.[1];
      if (w && h && !size) size = { width: Number(w), height: Number(h) };
      if (!mv.length) continue;
      const left = decls.filter((d) => !mv.includes(d));
      keep = `${r.sel} { ${left.join("; ")}${left.length ? ";" : ""} }`;
      movedParts.push(`.${rigClass} { ${mv.join("; ")}; }`);
    } else if (selectorIsDevice(r.sel, deviceClasses)) {
      movedParts.push(css.slice(r.start, r.end));
    } else continue;
    moved.push(r.sel);
    newCss += css.slice(cursor, r.start);
    cursor = r.end;
    if (!placed) { newCss += MARK; placed = true; }
    if (keep) newCss += keep;
  }
  newCss += css.slice(cursor);
  const deviceCss = movedParts.join("\n    ");
  const block = `</style>\n  <style data-device-css="${opts.deviceId}">\n    ${deviceCss}\n  </style>\n  <style>`;
  let out = html.replace(styleM[0], () => `<style>${newCss.replace(MARK, () => block)}</style>`);

  // ---- mark every rig ----
  const rigClasses = (commonRigExtra ?? []).filter((c) => !c.startsWith("duo-"));
  const ranges = [...out.matchAll(RIG_OPEN(rigClass))].map((m) => ({ index: m.index!, open: m[0] })).reverse();
  for (const r of ranges) {
    let open = setAttr(r.open, "data-device", opts.deviceId);
    open = setAttr(open, "data-device-rig-classes", rigClasses.join(" "));
    if (size) open = setAttr(open, "data-device-size", `${size.width}x${size.height}`);
    out = out.slice(0, r.index) + open + out.slice(r.index + r.open.length);
  }
  return { html: out, rigClass, css: deviceCss, markup, rigClasses, size, rigCount: rigs.length, variants: variantKeys.size, movedSelectors: moved };
}

// ---------------------------------------------------------------------------
// Runtime application
// ---------------------------------------------------------------------------

export interface ApplyContext {
  /** Device asset wanted by the scene at this index, or null to leave the template's own. */
  pick: (sceneIndex: number) => RigDeviceAsset | null;
}

const STYLE_BLOCK = /<style data-device-css="([^"]*)">([\s\S]*?)<\/style>/g;

interface RigInstance { start: number; openEnd: number; end: number; open: string; deviceId: string }

function findRigs(html: string): RigInstance[] {
  const out: RigInstance[] = [];
  for (const rig of RIG_CLASSES) {
    for (const m of html.matchAll(RIG_OPEN(rig))) {
      const deviceId = getAttr(m[0], "data-device");
      if (!deviceId) continue;
      out.push({ start: m.index!, openEnd: m.index! + m[0].length, end: elementEnd(html, m.index!), open: m[0], deviceId });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function sceneStarts(html: string): number[] {
  return [...html.matchAll(/<div class="scene[^"]*" id="scene-(\d+)"/g)].map((m) => m.index!);
}

function sceneIndexAt(pos: number, starts: number[]): number {
  let idx = -1;
  starts.forEach((s, i) => { if (s <= pos) idx = i; });
  return idx;
}

const actualRigClass = (open: string) => RIG_CLASSES.find((c) => (getAttr(open, "class") ?? "").split(/\s+/).includes(c)) ?? "phone-3d-rig";

/** Append `style` to the screen container that holds the SCREEN marker. */
function styleScreenContainer(front: string, style: string): string {
  const at = front.indexOf(SCREEN_MARKER);
  if (at < 0) return front;
  const re = /<div class="[^"]*(?:screen-scroll-wrap|phone-screen-frame)[^"]*"[^>]*>/g;
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(front); m && m.index < at; m = re.exec(front)) last = m;
  if (!last) return front;
  return front.slice(0, last.index) + appendStyle(last[0], style) + front.slice(last.index + last[0].length);
}

function rebuildRig(inner: string, asset: RigDeviceAsset): string {
  const nodes = topLevelNodes(inner);
  let out = "";
  let cursor = 0;
  let sidesDone = false;
  let sawShell = false;
  for (const n of nodes) {
    out += inner.slice(cursor, n.start);
    cursor = n.end;
    switch (roleOf(n)) {
      case "front": {
        const split = splitScreen(n.html);
        const content = split ? split.content : "";
        let front = asset.markup.front;
        // keep the instance's own screen-backdrop style (e.g. a per-scene wallpaper colour)
        if (split?.containerStyle) front = styleScreenContainer(front, split.containerStyle);
        out += inheritStyle(front.replace(SCREEN_MARKER, () => content), n.html);
        break;
      }
      case "back":
        if (asset.markup.back) out += inheritStyle(asset.markup.back, n.html);
        break;
      case "side":
        if (!sidesDone) { out += asset.markup.sides.join("\n"); sidesDone = true; }
        break;
      case "ambient":
        if (asset.markup.ambient) out += asset.markup.ambient;
        break;
      case "shell":
        sawShell = true;
        if (asset.markup.shell) out += asset.markup.shell;
        break;
      default:
        out += n.html;
    }
  }
  out += inner.slice(cursor);
  if (!sawShell && asset.markup.shell) out = `${asset.markup.shell}\n${out}`;
  return out;
}

/** Rewrite only the GLB shell canvas (device id / raster size) -- what a
 *  device override on a GLB-shell template has always done. */
function retargetShell(inner: string, shell: string): string {
  const id = shell.match(/data-device-id="([^"]*)"/)?.[1];
  const w = shell.match(/\swidth="([^"]*)"/)?.[1];
  const h = shell.match(/\sheight="([^"]*)"/)?.[1];
  return inner.replace(/<canvas\b[^>]*device-shell-canvas[^>]*>/g, (tag) => {
    let t = tag;
    if (id) t = setAttr(t, "data-device-id", id);
    if (w) t = setAttr(t, "width", w);
    if (h) t = setAttr(t, "height", h);
    return t;
  });
}

export function applyRigDevices(html: string, ctx: ApplyContext): string {
  const rigs = findRigs(html);
  if (!rigs.length) return html;
  const starts = sceneStarts(html);

  const plan = rigs.map((r) => {
    const asset = ctx.pick(sceneIndexAt(r.start, starts));
    // A catalogue GLB device is rebuilt even when it is the template's own device, so its screen box/radius always
    // come from the device's real geometry instead of the legacy flat-CSS numbers baked into the template.
    return { r, asset: asset && (asset.id !== r.deviceId || asset.sourceType === "GLB") ? asset : null };
  });
  if (!plan.some((p) => p.asset)) return html;

  const blockCss = new Map<string, string>();
  for (const m of html.matchAll(STYLE_BLOCK)) blockCss.set(m[1], m[2]);

  const used = new Map<string, { assetRig: string; actualRig: string; css: string }>();
  let out = html;
  for (const { r, asset } of [...plan].reverse()) {
    const rigClass = actualRigClass(r.open);
    if (!asset) {
      used.set(r.deviceId, { assetRig: rigClass, actualRig: rigClass, css: blockCss.get(r.deviceId) ?? "" });
      continue;
    }
    const inner = out.slice(r.openEnd, r.end - 6);
    const hasShell = /device-shell-canvas/.test(inner);
    let open = r.open;
    let newInner: string;
    {
      newInner = rebuildRig(inner, asset);
      const oldClasses = (getAttr(r.open, "data-device-rig-classes") ?? "").split(/\s+/).filter(Boolean);
      open = editClasses(open, oldClasses, asset.rigClasses);
      open = setAttr(open, "data-device", asset.id);
      open = setAttr(open, "data-device-rig-classes", asset.rigClasses.join(" "));
      if (asset.fitRig) {
        const height = Number((getAttr(r.open, "data-device-size") ?? "").split("x")[1]) || asset.dimensions.height;
        const width = Math.round((height * asset.dimensions.width) / asset.dimensions.height);
        open = appendStyle(open, `width:${width}px;height:${height}px;`);
        open = setAttr(open, "data-device-size", `${width}x${height}`);
      } else {
        open = setAttr(open, "data-device-size", `${asset.dimensions.width}x${asset.dimensions.height}`);
      }
      used.set(asset.id, { assetRig: asset.rigClass, actualRig: rigClass, css: asset.css });
    }
    out = out.slice(0, r.start) + open + newInner + "</div>" + out.slice(r.end);
  }

  // Re-emit the device CSS: one scoped block per device still in use, at the
  // position of the template's first device block (cascade order preserved).
  const scoped: string[] = [];
  for (const [id, { css, assetRig, actualRig }] of used) scoped.push(scopeCss(css, id, assetRig, actualRig));
  let placed = false;
  out = out.replace(STYLE_BLOCK, () => {
    if (placed) return "";
    placed = true;
    return `<style data-device-css="scoped">\n${scoped.join("\n")}\n</style>`;
  });
  return out;
}
