# Device Frame Catalogue

**Companion documents:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) §6.1/§7 · [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) Phase 9

## Why parametric, not per-device art

The legacy `studio.app-mockup.com` tool shipped 35 devices as individual
frame images served from a third-party CDN — no assets were ever mirrored
locally, and licensing them is the standing blocker recorded in
`IMPLEMENTATION_PLAN.md` §0. This project's original `DEVICE_REGISTRY`
(`src/devices/registry.ts`) side-stepped that by hand-authoring two inline
SVG bezels as string literals — which does not scale to "every Samsung,
every iPhone, foldables, tablets" without an SVG artist doing new art for
every commercially available model.

The resolution: **one parametric SVG generator, driven by a data
catalogue.** A device frame is drawn from its geometry and a small set of
named traits, not from bespoke artwork. Adding a new device — the newest
iPhone, a Samsung foldable, a generic Android tablet — is a JSON entry in
`config/devices.json`, no code and no new art.

## The catalogue file — `config/devices.json`

Same pattern as `config/providers.json` (`src/ai/registry.ts`): a plain
JSON file, loaded through a `readJson`-with-fallback helper that seeds
built-in defaults on first run, editable directly by a user without
touching code. Seeded with the classes the two platform specs
(`src/platform/specs/*.yaml`) actually need:

- Generic Android phone, Google Pixel
- Samsung Galaxy S-series
- Samsung Galaxy Z Fold (folded + unfolded **variants**) and Z Flip
- Apple iPhone 15 / 16 / 17 / 18 Pro and Pro Max
- iPad Pro 12.9"
- Generic 10" Android tablet

## Shape

```ts
interface DeviceModel {
  id: string;
  name: string;
  vendor: string;
  releaseYear?: number;
  platforms: ("google-play" | "apple-app-store")[];
  formFactor: "phone" | "tablet" | "foldable";
  geometry: DeviceGeometry;        // unchanged from the original shape:
                                    // width, height, screenInset, cornerRadius
  frame: {
    bezelWidth: number;
    outerRadius: number;
    body: string;                  // fill colour
    accent: string;                // trim/button colour
    cutout: "none" | "notch" | "punch-hole" | "dynamic-island" | "pill";
    cutoutSize?: { width: number; height: number };
    fold?: { axis: "vertical" | "horizontal"; seamOffset: number };
    buttons?: boolean;              // draw side power/volume rails
  };
  /** Foldables ship both physical states as selectable variants. */
  variants?: Array<{ id: string; name: string; geometry: DeviceGeometry }>;
}
```

`geometry` and the top-level fields are unchanged from the pre-Phase-9
`DeviceModel`/`DeviceGeometry` in `src/devices/registry.ts`, so
`src/render/still.ts` and the MCP `list_device_profiles` tool keep working
without modification — only the frame's *origin* changes, from a pasted
SVG string to a generated one.

## How a frame is drawn — `src/devices/frame.ts`

`buildFrameSvg(device, colorway)` renders, in order:

1. The outer bezel — a rounded rect at `outerRadius`, stroked at
   `bezelWidth`, filled `body`.
2. The screen aperture — traced from `geometry.screenInset`, so the
   rendered frame and the region a screenshot is masked into
   (`src/render/shared.ts`'s `deviceMarkup()`) always agree by
   construction; there is no second copy of the inset numbers to drift.
3. The `cutout` shape at top-center, sized by `cutoutSize` (a notch is a
   rounded rect, a punch-hole a circle, a dynamic island a pill, `pill` a
   longer rounded rect, `none` draws nothing).
4. Side buttons (`buttons: true`) — short rects on the bezel edge, `accent`
   coloured.
5. For foldables, a `fold` seam — a thin line at `seamOffset` along the
   declared `axis`.

The same function serves every mockup template (Step 2) and every scene
template (Step 4) — devices are one independent axis, templates are
another, and any device composes with any template. `listDevices({
platform, formFactor })` groups the catalogue by vendor and form factor for
the device dropdowns in both steps.

## Foldables

A foldable device declares two entries in `variants[]` — folded and
unfolded — each with its own `geometry`. The mockup/scene config stores the
selected variant id alongside the device id; `mockupHtml()`/`sceneHtml()`
resolve geometry from the variant, so an unfolded Fold gets its wide
aspect ratio and the seam line, while the folded state renders as a normal
tall phone. The raw screenshot is object-fit into whichever aperture the
selected variant declares — no separate capture per fold state is needed
for the mockup/video steps (Step 1 still captures once at the largest
class, per `src/capture/step1.ts`).

## Adding a device

No code change. Append an entry to `config/devices.json` with the fields
above — e.g. for a new iPhone model, copy the previous Pro Max entry,
bump `releaseYear`, and adjust `geometry`/`cutout` if the notch/island
size changed. It appears in the Step 2 and Step 4 device dropdowns on the
next server request; no build or restart required beyond the file write.
