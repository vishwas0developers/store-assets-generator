import fs from "fs";
import qrcode from "qrcode-generator";
import { templateConfig, templateHtmlPath } from "./templateConfig.js";
import { placeholderScreenUri } from "./placeholder.js";
import { type VideoApplication, type VideoScene, type SlotValue } from "./application.js";
import { resolveDemoAsset } from "./demoAssets.js";
import { dataUri } from "../render/shared.js";

/**
 * Derives what dynamic content each scene of each template needs, from the
 * template's own embedded `#template-config` JSON -- never by authoring a
 * second description of the templates. See templates/video/<id>.html.
 */

export type SlotKind = "text" | "textList" | "image" | "imageList" | "platformList";

export interface SlotSpec {
  key: string;
  kind: SlotKind;
  /** CSS selectors this slot writes to (an id target is just "#slot-0"). */
  targets: string[];
  op: "text" | "src" | "html";
  label: string;
  required: boolean;
  count?: number;
  accept?: string[];
  aspect?: "portrait" | "landscape" | "square" | "any";
  maxLength?: number;
  /** Sibling slot keys this one is mutually exclusive with. */
  oneOf?: string[];
}

export interface SlotIssue {
  slotKey: string;
  severity: "error" | "warning";
  message: string;
}

interface RoleDef {
  kind: SlotKind;
  op: "text" | "src" | "html";
  label: string;
  required: boolean;
  aspect?: SlotSpec["aspect"];
  maxLength?: number;
  oneOf?: string[];
  accept?: string[];
}

// Role -> semantics. The ONLY place template vocabulary lives -- extend this
// (and SlotKind) to add a new dynamic-content type; never touch the renderer.
const ROLE_TABLE: Record<string, RoleDef> = {
  text: { kind: "text", op: "html", label: "Headline", required: true, maxLength: 60 },
  subtext: { kind: "text", op: "html", label: "Subtext", required: false, maxLength: 120 },
  textRight: { kind: "text", op: "html", label: "Headline (right)", required: false, maxLength: 60 },
  subtextRight: { kind: "text", op: "html", label: "Subtext (right)", required: false, maxLength: 120 },
  screenshot: { kind: "image", op: "src", label: "Screenshot", required: true, aspect: "portrait" },
  screenshotLandscape: {
    kind: "image",
    op: "src",
    label: "Screenshot (landscape)",
    required: false,
    aspect: "landscape",
    oneOf: ["screenshot"],
  },
  logo: { kind: "image", op: "html", label: "App icon", required: true, aspect: "square" },
  screenshots: { kind: "imageList", op: "src", label: "Screenshots", required: true, aspect: "portrait" },
  features: { kind: "textList", op: "html", label: "Feature labels", required: false, maxLength: 40 },
  platforms: { kind: "platformList", op: "html", label: "Store links", required: false },
};

/**
 * Corrections layered on top of the templates' own (occasionally wrong or
 * incomplete) `slots` config -- keyed templateId -> sceneIndex -> role key.
 * Every entry here documents a real defect found by auditing the DOM; see
 * the plan for the audit. This table is the ONLY place that "knows" a
 * template's ids are wrong -- the template.html files themselves are never
 * edited, so the design stays byte-for-byte unchanged.
 */
// The 10 device-preset dual-screenshot templates below share one generator-copied bug:
// their config's 2-screenshot scenes declare ids like "slot-2a"/"slot-2b", but the actual
// DOM elements are "slot-2-0"/"slot-2-1" (landscape templates: scenes 1 and 3; portrait
// templates: scene 2). Confirmed identical across all 10 by direct DOM inspection.
const DUAL_SCREEN_LANDSCAPE_OVERRIDE = {
  1: { screenshots: ["#slot-1-0", "#slot-1-1"] },
  3: { screenshots: ["#slot-3-0", "#slot-3-1"] },
};
const DUAL_SCREEN_PORTRAIT_OVERRIDE = {
  2: { screenshots: ["#slot-2-0", "#slot-2-1"] },
};

const SLOT_OVERRIDES: Record<string, Record<number, Record<string, string[]>>> = {
  "galaxy-s25-landscape": DUAL_SCREEN_LANDSCAPE_OVERRIDE,
  "galaxy-s25-portrait": DUAL_SCREEN_PORTRAIT_OVERRIDE,
  "iphone-15-pro-landscape": DUAL_SCREEN_LANDSCAPE_OVERRIDE,
  "iphone-15-pro-portrait": DUAL_SCREEN_PORTRAIT_OVERRIDE,
  "iphone-16-pro-landscape": DUAL_SCREEN_LANDSCAPE_OVERRIDE,
  "iphone-16-pro-portrait": DUAL_SCREEN_PORTRAIT_OVERRIDE,
  "pixel-9-landscape": DUAL_SCREEN_LANDSCAPE_OVERRIDE,
  "pixel-9-portrait": DUAL_SCREEN_PORTRAIT_OVERRIDE,
  "pixel-9-pro-landscape": DUAL_SCREEN_LANDSCAPE_OVERRIDE,
  "pixel-9-pro-portrait": DUAL_SCREEN_PORTRAIT_OVERRIDE,
  "tpl-38180229-minimal-skyblue": {
    0: { logo: ["#s0-logo"] }, // config says "slot-logo" -- no such id in the DOM
    5: { features: ["#s5-badge-1", "#s5-badge-2", "#s5-badge-3"] }, // declared nowhere in config
    6: { logo: ["#s6-logo"], platforms: ["#s6-platforms"] }, // logo: config says "slot-logo-outro" (no such id); platforms container has an id but isn't in the config's `slots` map at all
  },
  "tpl-62155880-delivery-trio-showcase": {
    0: { logo: ["#s0-logo"] },
    3: { logo: ["#s3-logo"], platforms: ["#s3-platforms"] },
  },
  "tpl-1371526-hud-blueprint": {
    // Scene 11 ("SHOWCASE GALLERY") is a section-title card between screenshot groups --
    // config wrongly declares "screenshot": "slot-11", but no such id (or any phone-screen
    // element) exists in this scene's markup; slot-1..slot-10 are the real screenshot ids,
    // already used by other scenes. Suppressed (empty target list) rather than guessed at.
    11: { screenshot: [] },
  },
  "tpl-27720310-dark-matte-spheres": {
    // Scene 16 ("Outro transition", 1.4s, no text) is a brief kinetic wipe -- config wrongly
    // declares "screenshot": "slot-16", but no such id exists (slot-15 and slot-17 are real,
    // used by neighboring scenes; slot-16 was never wired to any element in this markup).
    16: { screenshot: [] },
  },
};

interface TemplateHtmlInfo {
  ids: Set<string>;
}

const htmlInfoCache = new Map<string, TemplateHtmlInfo | null>();

function templateHtmlInfo(templateId: string): TemplateHtmlInfo | null {
  if (htmlInfoCache.has(templateId)) return htmlInfoCache.get(templateId)!;
  let info: TemplateHtmlInfo | null = null;
  try {
    const htmlPath = templateHtmlPath(templateId);
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, "utf-8");
      const ids = new Set<string>();
      for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
      info = { ids };
    }
  } catch {
    info = null;
  }
  htmlInfoCache.set(templateId, info);
  return info;
}

/** Selectors that resolve to a real element in this template's HTML, plus
 *  any `#refl-<id>` / `#<id>-secondary` mirror that should be kept in sync
 *  with it (e.g. tpl-62155880's floor reflection, tpl-27720310's duplicate
 *  macro-closeup screen). */
function expandTargets(templateId: string, rawIds: string[]): string[] {
  const info = templateHtmlInfo(templateId);
  if (!info) return rawIds.map((id) => `#${id}`);
  const targets: string[] = [];
  for (const id of rawIds) {
    if (!info.ids.has(id)) {
      console.warn(`[slots] ${templateId}: slot id '${id}' not found in template.html -- dropped`);
      continue;
    }
    targets.push(`#${id}`);
    if (info.ids.has(`refl-${id}`)) targets.push(`#refl-${id}`);
    if (info.ids.has(`${id}-secondary`)) targets.push(`#${id}-secondary`);
  }
  return targets;
}

function toSpec(key: string, targets: string[], countOverride?: number): SlotSpec | null {
  const role = ROLE_TABLE[key];
  if (!role) return null;
  if (targets.length === 0) return null;
  return {
    key,
    kind: role.kind,
    targets,
    op: role.op,
    label: role.label,
    required: role.required,
    aspect: role.aspect,
    maxLength: role.maxLength,
    oneOf: role.oneOf,
    count: role.kind === "imageList" || role.kind === "textList" ? countOverride ?? targets.length : undefined,
  };
}

/** Everything a scene needs, derived from the template's own config (plus
 *  SLOT_OVERRIDES repairs) -- the single source both the editor UI and the
 *  renderer read from. Absent/null `slots` (or a device-preset template with
 *  no `slots` block and no screenshots to synthesize) means the scene
 *  genuinely needs no dynamic content -- an empty array, not an error. */
export function slotSpecsForScene(templateId: string, sceneIndex: number): SlotSpec[] {
  const config = templateConfig(templateId);
  const scene = config?.scenes?.[sceneIndex];

  // Escape hatch: an explicit slotSpec array on the scene is used verbatim.
  if (scene?.slotSpec && Array.isArray(scene.slotSpec)) return scene.slotSpec;

  const overrides = SLOT_OVERRIDES[templateId]?.[sceneIndex] ?? {};
  const specs: SlotSpec[] = [];

  const declaredSlots: Record<string, string | string[]> | undefined = scene?.slots ?? undefined;
  const keys = new Set([...Object.keys(declaredSlots ?? {}), ...Object.keys(overrides)]);

  for (const key of keys) {
    const rawIds = overrides[key] ? overrides[key].map((sel) => sel.replace(/^#/, "")) : normalizeIds(declaredSlots?.[key]);
    if (!rawIds.length) continue;
    const targets = overrides[key] ? expandTargetsPreResolved(overrides[key]) : expandTargets(templateId, rawIds);
    // count tracks resolved targets, not the declared arity -- a declared id
    // that doesn't exist in the DOM (e.g. tpl-1371526's slot-5b/slot-5c) is
    // dropped by expandTargets above, and the UI must not offer an upload
    // slot with nothing wired to receive it.
    const spec = toSpec(key, targets, targets.length);
    if (spec) specs.push(spec);
  }

  // Collapse a `screenshots` list that degenerated to the same single
  // target as `screenshot` (e.g. tpl-1371526 S6, whose declared 2nd/3rd
  // ids don't exist in the DOM) -- two controls writing the same element
  // is redundant and last-write-wins on save, not a real second slot.
  const shot = specs.find((s) => s.key === "screenshot");
  const shots = specs.find((s) => s.key === "screenshots");
  if (shot && shots && shots.targets.length === 1 && shots.targets[0] === shot.targets[0]) {
    specs.splice(specs.indexOf(shots), 1);
  }

  // Device presets: no `slots` block at all. Synthesize text/subtext/screenshots
  // from the legacy VideoTemplateScene fields so the editor is uniform across
  // all 16 templates, while the code-generated render path (which already
  // handles these) stays untouched.
  //
  // Restricted to actual device-preset templates (id doesn't start with "tpl-"):
  // a tpl-* template's scene can also lack a `slots` block, but that means
  // something different there -- a legacy/outro card with genuinely no image in
  // its design (e.g. tpl-23552607's "envato" outro brand card, scene 14, text-only).
  // Synthesizing a *required* screenshot for that scene wrongly blocked render and
  // showed nothing where nothing was ever supposed to render.
  const isDevicePresetTemplate = !templateId.startsWith("tpl-");
  if (!declaredSlots && scene && isDevicePresetTemplate && !Array.isArray(scene.platforms)) {
    if (typeof scene.text === "string") specs.push({ key: "text", kind: "text", targets: [], op: "text", label: "Headline", required: true, maxLength: 60 });
    if (typeof scene.subtext === "string") specs.push({ key: "subtext", kind: "text", targets: [], op: "text", label: "Subtext", required: false, maxLength: 120 });
    const count = scene.screenCount && scene.screenCount > 1 ? scene.screenCount : 1;
    specs.push({ key: "screenshots", kind: "imageList", targets: [], op: "src", label: "Screenshots", required: true, aspect: "portrait", count });
  }

  return specs;
}

function normalizeIds(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function expandTargetsPreResolved(overrideSelectors: string[]): string[] {
  // Override entries are already full CSS selectors (may include ids not
  // present as simple `id="..."` matches, e.g. structural selectors); pass
  // through as-is -- expandTargets' id-existence check only applies to the
  // config-declared (non-override) path.
  return overrideSelectors;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateScene(specs: SlotSpec[], values: Record<string, SlotValue> | undefined): SlotIssue[] {
  const issues: SlotIssue[] = [];
  const v = values ?? {};

  const oneOfGroups = new Map<string, string[]>();
  for (const spec of specs) {
    if (spec.oneOf) {
      const group = [spec.key, ...spec.oneOf].sort().join("|");
      if (!oneOfGroups.has(group)) oneOfGroups.set(group, []);
    }
  }

  for (const spec of specs) {
    const value = v[spec.key];
    switch (spec.kind) {
      case "text": {
        const text = value?.kind === "text" ? value.value : "";
        if (spec.required && !text.trim() && !spec.oneOf) {
          issues.push({ slotKey: spec.key, severity: "error", message: `${spec.label} is required.` });
        }
        if (spec.maxLength && text.length > spec.maxLength) {
          issues.push({ slotKey: spec.key, severity: "warning", message: `${spec.label} exceeds ${spec.maxLength} characters.` });
        }
        break;
      }
      case "textList": {
        const list = value?.kind === "textList" ? value.values : [];
        if (spec.count && list.filter((t: string) => t.trim()).length < spec.count && spec.required) {
          issues.push({ slotKey: spec.key, severity: "error", message: `${spec.label}: needs ${spec.count} entries.` });
        }
        break;
      }
      case "image": {
        if (value?.kind === "imageSequence") {
          if (spec.required && value.segments.filter((seg) => seg.sourceId).length === 0) {
            issues.push({ slotKey: spec.key, severity: "error", message: `${spec.label}: timeline has no screenshots yet.` });
          }
          break;
        }
        const sourceId = value?.kind === "image" ? value.sourceId : null;
        if (spec.required && !sourceId && !spec.oneOf) {
          issues.push({ slotKey: spec.key, severity: "error", message: `${spec.label} is required.` });
        }
        break;
      }
      case "imageList": {
        const ids = value?.kind === "imageList" ? value.sourceIds : [];
        const filled = ids.filter(Boolean).length;
        if (spec.required && spec.count && filled < spec.count) {
          issues.push({ slotKey: spec.key, severity: "error", message: `${spec.label}: ${filled}/${spec.count} provided.` });
        }
        break;
      }
      case "platformList":
        break; // optional by design; no required-arity check
    }
  }

  // oneOf: exactly one of the pair must be filled.
  const seen = new Set<string>();
  for (const spec of specs) {
    if (!spec.oneOf || seen.has(spec.key)) continue;
    const pairKeys = [spec.key, ...spec.oneOf];
    pairKeys.forEach((k) => seen.add(k));
    const filledCount = pairKeys.filter((k) => isSlotFilled(v[k])).length;
    if (filledCount === 0) {
      issues.push({ slotKey: spec.key, severity: "error", message: `Provide one of: ${pairKeys.map((k) => ROLE_TABLE[k]?.label ?? k).join(" or ")}.` });
    } else if (filledCount > 1) {
      issues.push({ slotKey: spec.key, severity: "warning", message: `Only one of ${pairKeys.map((k) => ROLE_TABLE[k]?.label ?? k).join("/")} is used; the rest are ignored.` });
    }
  }

  return issues;
}

function isSlotFilled(value: SlotValue | undefined): boolean {
  if (!value) return false;
  if (value.kind === "text") return !!value.value.trim();
  if (value.kind === "image") return !!value.sourceId;
  if (value.kind === "imageList") return value.sourceIds.some(Boolean);
  if (value.kind === "textList") return value.values.some((t: string) => t.trim());
  if (value.kind === "imageSequence") return value.segments.some((s) => s.sourceId);
  return value.items.length > 0;
}

// ---------------------------------------------------------------------------
// Resolution -- normalized payload for injection
// ---------------------------------------------------------------------------

export interface ResolvedSlot {
  targets: string[];
  // "bg" is appended by render.ts (composeStandaloneHtml) for the background
  // image override/default -- it never comes out of resolveSlots itself,
  // since background lives outside the per-role slot-target system.
  op: "text" | "src" | "html" | "bg";
  value: string;
}

/** `*word*` -> `<span>word</span>`, matching the highlight-span convention
 *  the reference designs use in their default headlines (e.g. tpl-62155880's
 *  "Meet <span>Personal</span> Delivery"). SANITIZATION CONTRACT: the raw
 *  user text is HTML-escaped FIRST -- `&`, `<`, `>` -- and only THEN is the
 *  `*...*` -> `<span>` substitution applied on top of the already-escaped
 *  string, so the substitution itself can never (re)introduce a live tag.
 *  This is safe specifically because every caller sets the result via
 *  `el.innerHTML` as element TEXT CONTENT, never into an attribute value
 *  (quotes are not escaped here on purpose -- unnecessary in that context,
 *  and escaping them would corrupt literal quote marks in headlines). If a
 *  future slot ever needs to land inside an attribute, it must NOT reuse
 *  this function without also escaping `"`. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function renderRichText(raw: string): string {
  return escapeHtml(raw).replace(/\*([^*]+)\*/g, "<span>$1</span>");
}

/** Self-check for renderRichText's sanitization contract -- run directly
 *  with `node dist/src/video/slots.js` after a build. No test framework;
 *  this is the "one runnable check" for the one branchy parsing routine in
 *  this file. */
function __selfCheckRenderRichText(): void {
  const cases: [string, string][] = [
    ["<script>alert(1)</script>", "&lt;script&gt;alert(1)&lt;/script&gt;"],
    ["Meet *Personal* Delivery", "Meet <span>Personal</span> Delivery"],
    ["*<b>x</b>*", "<span>&lt;b&gt;x&lt;/b&gt;</span>"],
    ["plain text", "plain text"],
  ];
  for (const [input, expected] of cases) {
    const actual = renderRichText(input);
    if (actual !== expected) throw new Error(`renderRichText(${JSON.stringify(input)}) = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
  console.log(`renderRichText self-check: ${cases.length}/${cases.length} passed`);
}
import { pathToFileURL } from "url";
if (typeof process !== "undefined" && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  __selfCheckRenderRichText();
}

export function resolveSlots(
  application: VideoApplication,
  sceneIndex: number,
  resolveUri: (rel: string) => string,
  allowDemo = true,
): ResolvedSlot[] {
  const templateId = application.template;
  // Precedence, most to least specific: scene.slotValues[key] -> application.brand
  // (only `logo`/`platforms` have a brand fallback -- brand doesn't define a
  // headline or a screenshot) -> the template's own baked default, which is
  // what's left on the page when nothing here resolves to a value (see the
  // per-kind `continue`s below). `required` on a SlotSpec governs render
  // gating (validateScene/preflight) ONLY -- it does not force a value here;
  // an unfilled required slot still previews with the template's default so
  // editing never shows a blank/broken scene, it just blocks final render.
  if (!templateId) return [];
  const scene = application.scenes[sceneIndex];
  if (!scene) return [];
  const specs = slotSpecsForScene(templateId, sceneIndex);
  const rawValues = scene.slotValues ?? {};
  const values: Record<string, any> = { ...rawValues };
  if (!values.text && scene.text) {
    values.text = { kind: "text", value: scene.text };
  }
  if (!values.subtext && scene.subtext) {
    values.subtext = { kind: "text", value: scene.subtext };
  }
  if (!values.screenshot && scene.sourceId) {
    values.screenshot = { kind: "image", sourceId: scene.sourceId };
  }
  if (!values.screenshots && (scene.screenIds || scene.sourceId)) {
    values.screenshots = { kind: "imageList", sourceIds: scene.screenIds || (scene.sourceId ? [scene.sourceId] : []) };
  }
  const brand = application.brand;
  const resolved: ResolvedSlot[] = [];

  const sourceUri = (sourceId: string | null | undefined, placeholderIndex = 0): string => {
    if (sourceId) {
      const source = application.sources.find((s) => s.id === sourceId);
      if (source) return resolveUri(source.file);
      const demo = allowDemo ? resolveDemoAsset(sourceId) : undefined;
      if (demo) return dataUri(demo.absPath);
    }
    return placeholderScreenUri(placeholderIndex);
  };

  for (const spec of specs) {
    if (spec.targets.length === 0) continue; // legacy device-preset specs handled by the code-gen path, not here
    const value = values[spec.key] ?? fallbackFromBrand(spec.key, brand);

    if (spec.kind === "text") {
      const text = value?.kind === "text" ? value.value : "";
      if (!text) continue; // leave the template's own baked default in place
      resolved.push({ targets: spec.targets, op: spec.op, value: renderRichText(text) });
    } else if (spec.kind === "textList") {
      const list = value?.kind === "textList" ? value.values : [];
      spec.targets.forEach((sel, i) => {
        if (list[i]) resolved.push({ targets: [sel], op: spec.op, value: renderRichText(list[i]) });
      });
    } else if (spec.kind === "image") {
      // `imageSequence` mode (multiple timed screenshots) is handled by
      // resolveImageSequences below, not here -- it needs cumulative
      // cross-scene timing this per-scene function doesn't have. When a
      // slot is in that mode, sourceId stays null here and the static
      // baked default is left in place until the sequence script (injected
      // separately by composeStandaloneHtml) sets the real src on load.
      const sourceId = value?.kind === "image" ? value.sourceId : null;
      if (!sourceId) continue;
      const uri = sourceUri(sourceId);
      resolved.push({
        targets: spec.targets,
        op: spec.op,
        // Fills the existing container (a fixed-size rounded square/circle
        // with its own shadow/margin, untouched) edge-to-edge rather than
        // reproducing its child's specific circle/letter styling.
        value:
          spec.op === "html"
            ? `<img src="${uri}" alt="${spec.label}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`
            : uri,
      });
    } else if (spec.kind === "imageList") {
      const ids = value?.kind === "imageList" ? value.sourceIds : [];
      spec.targets.forEach((sel, i) => {
        const sourceId = ids[i];
        if (!sourceId) return;
        resolved.push({ targets: [sel], op: spec.op, value: sourceUri(sourceId, i) });
      });
    } else if (spec.kind === "platformList") {
      const items = value?.kind === "platformList" ? value.items : [];
      if (!items.length) continue;
      resolved.push({ targets: spec.targets, op: "html", value: platformsHtml(templateId, items) });
    }
  }

  return resolved;
}

export interface ImageSequenceEntry {
  targets: string[];
  /** Absolute document-time windows (ms), cumulative across every scene --
   *  the whole multi-scene document is one continuous timeline, and this is
   *  built once for the whole application so the swap script only needs a
   *  single absolute `ms` to know which segment (if any, in any scene) is
   *  currently on screen. */
  segments: { src: string; startMs: number; endMs: number }[];
}

/** Application-wide (not per-scene, unlike resolveSlots) because a segment's
 *  absolute time window depends on every earlier scene's duration. Only the
 *  `screenshot` role supports sequence mode today -- it is the one
 *  single-image slot present on nearly every scene across all 16 templates;
 *  extending to other image roles is a ROLE_TABLE/SlotKind change, not a
 *  rewrite of this function. */
export function resolveImageSequences(application: VideoApplication, resolveUri: (rel: string) => string, allowDemo = true): ImageSequenceEntry[] {
  const templateId = application.template;
  if (!templateId) return [];
  const entries: ImageSequenceEntry[] = [];
  let cumMs = 0;
  const scenes = [...application.scenes].sort((a, b) => a.order - b.order);
  for (const scene of scenes) {
    const durMs = Math.max(1, scene.durationSeconds) * 1000;
    const value = scene.slotValues?.screenshot;
    if (value?.kind === "imageSequence" && value.segments.length > 0) {
      const spec = slotSpecsForScene(templateId, scene.order).find((s) => s.key === "screenshot");
      if (spec && spec.targets.length > 0) {
        let segStart = cumMs;
        const segments = value.segments.map((seg) => {
          const segDurMs = Math.max(100, seg.durationSec * 1000);
          const source = seg.sourceId ? application.sources.find((s) => s.id === seg.sourceId) : undefined;
          const demo = !source && seg.sourceId && allowDemo ? resolveDemoAsset(seg.sourceId) : undefined;
          const src = source ? resolveUri(source.file) : demo ? dataUri(demo.absPath) : placeholderScreenUri();
          const entry = { src, startMs: segStart, endMs: segStart + segDurMs };
          segStart += segDurMs;
          return entry;
        });
        entries.push({ targets: spec.targets, segments });
      }
    }
    cumMs += durMs;
  }
  return entries;
}

/** Only `logo` and `platforms` read an application-wide default -- these are the
 *  two roles that are genuinely the same across every scene of an application
 *  (one app icon, one set of store links), so setting them once in the
 *  brand panel is expected to reach every scene that has that slot (e.g.
 *  tpl-62155880's opener AND outro both show the same icon). A scene-level
 *  value always overrides this; there is no per-scene override of `text`
 *  from brand because headlines are scene-specific by nature. */
function fallbackFromBrand(key: string, brand: VideoApplication["brand"] | undefined): SlotValue | undefined {
  if (!brand) return undefined;
  if (key === "logo" && brand.appIcon) return { kind: "image", sourceId: brand.appIcon };
  if (key === "platforms" && brand.platforms?.length) return { kind: "platformList", items: brand.platforms };
  return undefined;
}

// ---------------------------------------------------------------------------
// QR generation -- shared by the studio renderer and the *.mjs generators
// (scripts/generate/generate-38180229.mjs, generate-62155880.mjs), which
// import this instead of keeping their own copy.
// ---------------------------------------------------------------------------

export function generateQRCodeSVG(text: string, size = 96): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cell = size / count;
  let rects = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        rects += `<rect x="${(c * cell).toFixed(2)}" y="${(r * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#0f172a">${rects}</g></svg>`;
}

// Per-template accent so the outro cards keep matching their design's brand
// color (skyblue's #1d9bf0 vs delivery-trio's #8b85f8) -- lifted verbatim
// from each template's own generator script.
const PLATFORM_ICON_SETS: Record<string, Record<string, string>> = {
  "tpl-38180229-minimal-skyblue": {
    android: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#1d9bf0"><path d="M17.6 9.48l1.84-3.18a.6.6 0 10-1.04-.6l-1.87 3.23a10.6 10.6 0 00-8.06 0L6.6 5.7a.6.6 0 10-1.04.6l1.84 3.18C4.7 11.2 2.7 14.14 2.4 17.6h19.2c-.3-3.46-2.3-6.4-5.98-8.12zM8 15a1.2 1.2 0 110-2.4A1.2 1.2 0 018 15zm8 0a1.2 1.2 0 110-2.4A1.2 1.2 0 0116 15z"/></svg>`,
    apple: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#0f172a"><path d="M16.7 12.7c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 3 2.3 1.2 0 1.6-.8 3-.8s1.8.8 3 .8c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.8zM14.2 5.9c.6-.8 1.1-1.9.9-3-1 .1-2.1.6-2.8 1.4-.6.7-1.2 1.9-1 2.9 1.1.1 2.2-.5 2.9-1.3z"/></svg>`,
    windows: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#1d9bf0"><path d="M3 5.6L10.4 4.5V11.4H3V5.6zM11.3 4.4L21 3V11.3H11.3V4.4zM3 12.4H10.4V19.4L3 18.3V12.4zM11.3 12.4H21V20.9L11.3 19.5V12.4z"/></svg>`,
    globe: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z"/></svg>`,
  },
  "tpl-62155880-delivery-trio-showcase": {
    android: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#8b85f8"><path d="M17.6 9.48l1.84-3.18a.6.6 0 10-1.04-.6l-1.87 3.23a10.6 10.6 0 00-8.06 0L6.6 5.7a.6.6 0 10-1.04.6l1.84 3.18C4.7 11.2 2.7 14.14 2.4 17.6h19.2c-.3-3.46-2.3-6.4-5.98-8.12zM8 15a1.2 1.2 0 110-2.4A1.2 1.2 0 018 15zm8 0a1.2 1.2 0 110-2.4A1.2 1.2 0 0116 15z"/></svg>`,
    apple: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff"><path d="M16.7 12.7c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 3 2.3 1.2 0 1.6-.8 3-.8s1.8.8 3 .8c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.8zM14.2 5.9c.6-.8 1.1-1.9.9-3-1 .1-2.1.6-2.8 1.4-.6.7-1.2 1.9-1 2.9 1.1.1 2.2-.5 2.9-1.3z"/></svg>`,
    windows: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#eab308"><path d="M3 5.6L10.4 4.5V11.4H3V5.6zM11.3 4.4L21 3V11.3H11.3V4.4zM3 12.4H10.4V19.4L3 18.3V12.4zM11.3 12.4H21V20.9L11.3 19.5V12.4z"/></svg>`,
  },
};

function platformsHtml(templateId: string, items: { name: string; icon: string; url: string }[]): string {
  const icons = PLATFORM_ICON_SETS[templateId] ?? {};
  return items
    .map(
      (p) =>
        `<div class="platform-card"><div class="qr-wrap">${generateQRCodeSVG(p.url, 96)}</div>` +
        `<div class="platform-name-row">${icons[p.icon] ?? ""}<div class="platform-name">${escapeHtml(p.name)}</div></div></div>`,
    )
    .join("");
}
