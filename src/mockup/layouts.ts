/**
 * Layout preset grammar, reconstructed from studio.app-mockup.com's slug
 * list (mined from its production bundle):
 *
 *   [snapshot-]<presentation>-<textPosition>
 *
 * presentation: single | tilted-left | tilted-right | rotated-left-1/2 |
 *   rotated-right-1/2 | left-side | right-side | two-devices |
 *   two-devices-connected-left/right | the-airbnb-left/right-1/2
 * textPosition: title-above | title-below | caption-above | caption-below | no-text
 * snapshot- = frameless (screenshot only, no device SVG)
 *
 * Rather than hand-authoring ~50 templates, each preset is generated from a
 * small transform recipe per presentation x a text-block recipe per
 * position, matching the reference's combinatorial structure. See
 * docs/DEVICE-FRAMES.md / render/mockupRender.ts for how a preset is turned
 * into pixels.
 */

export interface LayoutPreset {
  slug: string;
  name: string;
  presentation: string;
  textPosition: string;
  frameless: boolean;
  twoDevices: boolean;
}

const PRESENTATIONS: Array<{ id: string; name: string; twoDevices?: boolean }> = [
  { id: "single", name: "Single device" },
  { id: "tilted-left", name: "Tilted left" },
  { id: "tilted-right", name: "Tilted right" },
  { id: "rotated-left-1", name: "Rotated left (subtle)" },
  { id: "rotated-left-2", name: "Rotated left (bold)" },
  { id: "rotated-right-1", name: "Rotated right (subtle)" },
  { id: "rotated-right-2", name: "Rotated right (bold)" },
  { id: "left-side", name: "Device left, text right" },
  { id: "right-side", name: "Device right, text left" },
  { id: "two-devices", name: "Two devices, side by side", twoDevices: true },
  { id: "two-devices-connected-left", name: "Two devices, connected left", twoDevices: true },
  { id: "two-devices-connected-right", name: "Two devices, connected right", twoDevices: true },
  { id: "the-airbnb-left-1", name: "Staggered left (near)", twoDevices: true },
  { id: "the-airbnb-left-2", name: "Staggered left (far)", twoDevices: true },
  { id: "the-airbnb-right-1", name: "Staggered right (near)", twoDevices: true },
  { id: "the-airbnb-right-2", name: "Staggered right (far)", twoDevices: true },
];

const TEXT_POSITIONS = ["title-above", "title-below", "caption-above", "caption-below", "no-text"];

function humanize(textPosition: string): string {
  return { "title-above": "Title above", "title-below": "Title below", "caption-above": "Caption above", "caption-below": "Caption below", "no-text": "No text" }[
    textPosition
  ]!;
}

function buildPresets(): LayoutPreset[] {
  const presets: LayoutPreset[] = [];
  for (const presentation of PRESENTATIONS) {
    for (const textPosition of TEXT_POSITIONS) {
      for (const frameless of [false, true]) {
        const slug = `${frameless ? "snapshot-" : ""}${presentation.id}-${textPosition}`;
        presets.push({
          slug,
          name: `${frameless ? "Snapshot " : ""}${presentation.name} — ${humanize(textPosition)}`,
          presentation: presentation.id,
          textPosition,
          frameless,
          twoDevices: presentation.twoDevices ?? false,
        });
      }
    }
  }
  return presets;
}

export const LAYOUT_PRESETS: LayoutPreset[] = buildPresets();
const BY_SLUG = new Map(LAYOUT_PRESETS.map((p) => [p.slug, p]));

export function getLayoutPreset(slug: string): LayoutPreset {
  return BY_SLUG.get(slug) ?? BY_SLUG.get("single-title-above")!;
}

export function listLayoutPresets(): Array<{ slug: string; name: string }> {
  return LAYOUT_PRESETS.map((p) => ({ slug: p.slug, name: p.name }));
}

/** Grouped for a picker UI, mirroring how the reference's Templates/Layout
 *  panel presents presentation families rather than one flat 160-item list. */
export function groupedLayoutPresets(): Array<{ presentation: string; name: string; twoDevices: boolean; slugs: string[] }> {
  return PRESENTATIONS.map((p) => ({
    presentation: p.id,
    name: p.name,
    twoDevices: p.twoDevices ?? false,
    slugs: LAYOUT_PRESETS.filter((preset) => preset.presentation === p.id).map((preset) => preset.slug),
  }));
}

/** Per-presentation transform recipe for deviceOne (and deviceTwo, when the
 *  layout uses two devices) — degrees of rotation and horizontal offset
 *  applied on top of the user's own size/x/y/rotation sliders. */
export function presentationTransform(presentation: string): {
  deviceOne: { xPct: number; rotate: number };
  deviceTwo?: { xPct: number; yPct: number; rotate: number };
} {
  switch (presentation) {
    case "tilted-left":
      return { deviceOne: { xPct: 0, rotate: -10 } };
    case "tilted-right":
      return { deviceOne: { xPct: 0, rotate: 10 } };
    case "rotated-left-1":
      return { deviceOne: { xPct: 0, rotate: -18 } };
    case "rotated-left-2":
      return { deviceOne: { xPct: 0, rotate: -32 } };
    case "rotated-right-1":
      return { deviceOne: { xPct: 0, rotate: 18 } };
    case "rotated-right-2":
      return { deviceOne: { xPct: 0, rotate: 32 } };
    case "left-side":
      return { deviceOne: { xPct: -28, rotate: 0 } };
    case "right-side":
      return { deviceOne: { xPct: 28, rotate: 0 } };
    case "two-devices":
      return { deviceOne: { xPct: -16, rotate: 0 }, deviceTwo: { xPct: 52, yPct: 5, rotate: 0 } };
    case "two-devices-connected-left":
      return { deviceOne: { xPct: -16, rotate: -4 }, deviceTwo: { xPct: 50, yPct: 6, rotate: 4 } };
    case "two-devices-connected-right":
      return { deviceOne: { xPct: 16, rotate: 4 }, deviceTwo: { xPct: -50, yPct: 6, rotate: -4 } };
    case "the-airbnb-left-1":
      return { deviceOne: { xPct: -10, rotate: -4 }, deviceTwo: { xPct: 14, yPct: 10, rotate: 4 } };
    case "the-airbnb-left-2":
      return { deviceOne: { xPct: -18, rotate: -8 }, deviceTwo: { xPct: 20, yPct: 14, rotate: 8 } };
    case "the-airbnb-right-1":
      return { deviceOne: { xPct: 10, rotate: 4 }, deviceTwo: { xPct: -14, yPct: 10, rotate: -4 } };
    case "the-airbnb-right-2":
      return { deviceOne: { xPct: 18, rotate: 8 }, deviceTwo: { xPct: -20, yPct: 14, rotate: -8 } };
    case "single":
    default:
      return { deviceOne: { xPct: 0, rotate: 0 } };
  }
}
