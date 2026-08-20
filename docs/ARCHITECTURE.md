# Store Assets Generator — Architecture

**Companion documents:** [`PRD.md`](../PRD.md) · [`architecture.mmd`](./architecture.mmd) · [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) · [`AGENT-MCP-DISTRIBUTION.md`](./AGENT-MCP-DISTRIBUTION.md) · [`ANDROID-CAPTURE.md`](./ANDROID-CAPTURE.md)

---

## 0. Layered Architecture

The system has four layers with a hard boundary between intelligence and execution:

```
        AI AGENT              intelligence — judgement, copy, screen selection
            │
   ┌────────┴────────┐
 SKILLS          PROJECT       workflow reasoning │ source, frontend, Android, docs
   │                 │
   └────────┬────────┘
           MCP                 controlled, deterministic, typed capabilities
            │
  STORE ASSETS GENERATOR       deterministic capture, composition, rendering, validation
            │
  ┌─────────┼─────────┐
Frontend  Android   Templates
Capture   Capture   & Mockups
  └─────────┼─────────┘
       Asset Pipeline
            │
   ┌────────┴────────┐
Store Images    Video Scenes → Animated Video → Validation → Final Package
```

**The governing principle:** the Agent controls and executes the workflow; Skills teach it; MCP exposes capabilities; the Generator owns the APIs, prompts, configuration, and automation logic.

**AI lives inside the tool** (revised — see [`AI-PROVIDERS.md`](./AI-PROVIDERS.md) §1). The generator holds its own provider configuration and system prompts, so `store-assets generate` produces titles and feature copy standalone, with no agent attached. The agent orchestrates; it does not supply the intelligence.

**Determinism is preserved by staging, not by exclusion.** AI runs as a content stage whose output is persisted into the Project Document. Rendering reads that document and calls no API — so the same document always produces the same video, offline, forever.

```
capture → [AI content stage] → Project Document → deterministic render
                                     ↑
                       edit by hand or agent; re-render never re-generates
```

### One Core, Three Surfaces

**The tool is not agent-only.** Every capability must be operable by hand. This is a hard architectural requirement, not a convenience: manual operation is how the system gets tested, validated, debugged, and understood.

```
        ┌──────────────┬──────────────┬──────────────┐
        │  Web UI      │     CLI      │     MCP      │
        │  (manual)    │  (scriptable)│   (agent)    │
        └──────┬───────┴──────┬───────┴──────┬───────┘
               └──────────────┼──────────────┘
                              ▼
                    CORE SERVICE LAYER
        discover · auth · capture · assemble · generateCopy
        · compose · renderScene · renderVideo · validate · package
```

All three are **thin adapters over the same service functions**. No surface may contain logic another lacks.

The rules that keep this true:

- A new capability is implemented **once in the core**, then exposed by all three adapters.
- An MCP tool is a typed wrapper over a service call — never a reimplementation.
- The Web UI calls the same local HTTP API the CLI and MCP layers call. One API, three clients.
- Anything an agent can do through MCP, a person can do through the UI, and vice versa.

The practical payoff: when an agent run misbehaves, you reproduce it by hand in the UI and see exactly where it diverges — because it is provably the same code path, not a parallel implementation that might differ.

Distribution, skills, and MCP: [`AGENT-MCP-DISTRIBUTION.md`](./AGENT-MCP-DISTRIBUTION.md). Android backend: [`ANDROID-CAPTURE.md`](./ANDROID-CAPTURE.md). Authentication: [`AUTHENTICATION.md`](./AUTHENTICATION.md). AI layer: [`AI-PROVIDERS.md`](./AI-PROVIDERS.md). This document covers the engine.

---

## 1. Architectural Position

This is a **standalone Node/TypeScript tool** at `D:\AI_Tools\store-assets-generator`, distributed as an NPM package (CLI + MCP server + installer) and installable on any machine. It is not part of the ITI Career workspace build, does not import from it, and does not require a server. It takes a URL or an app project as input and produces a validated asset package as output.

It is deliberately **not** derived from `5.demo-assets-generator`. That tool's central mechanic — a human driving a live browser while Playwright screencasts the session — is exactly the mechanic this product excludes.

It **is** the successor to `studio.app-mockup.com`. That legacy codebase is a reference to be fully absorbed and then deleted; §2 is a complete inventory of its concepts and where each one lands in this architecture.

**The essential difference between the two:** the legacy studio is a *manual design tool* — a human uploads screenshots and arranges them. This product is an *automated pipeline* — a URL goes in and finished assets come out. The legacy tool's design model is excellent and is preserved almost entirely; what changes is that the pipeline authors the design document instead of a human, and the design document drives video as well as stills.

---

## 2. Legacy Analysis — `studio.app-mockup.com`

### 2.1 What the codebase actually is

| Property | Finding |
|---|---|
| Product | "AppMockUp Studio (Beta)" — a browser design tool for App Store / Play Store screenshots |
| Stack | React + Material-UI, webpack production bundle (`bundle.7403e5cae7adfcadbb15.js`, 2.9 MB, Nov 2020) |
| Source maps | **None** — minified and identifier-mangled; behaviour below was recovered from string and asset-reference analysis, not from source |
| Device frame images | **Not present.** Served from an external CDN (`media.app-mockup.com/assets/images/frames/store/…`); the mirror captured no image assets |
| Device catalogue | **Recoverable** — 35 devices × light/dark variants |
| Persistence | Project serialized to **JSON** ("Save design file", "Load Project File"), plus `localStorage` |
| Export | **ZIP** via `jszip`/`file-saver` ("AppMockUp Screenshots.zip", `ZipFileWorker`, "Zipping screenshots…") |
| Rendering | **Canvas** (`toBlob`, `toDataURL`) |
| Output | Stills only — **no video capability** |

### 2.2 Complete concept inventory

Every meaningful concept found in the legacy tool, and its disposition here:

| # | Legacy concept | Evidence | Disposition |
|---|---|---|---|
| 1 | **Project document** — a saveable/loadable JSON design file | "Save design file", "Load Project File", "Start New Project", "Project Settings" | **Adopt and formalize.** Becomes the Project Document (§5) — the pipeline's central intermediate representation. |
| 2 | **Template library** — starter templates by app category | "Load Starter Template", "Load App Template", "Books App Template 1", "Business App Template 1", "Entertainment App Template 1", "Food Template 3/4", "Photo & Video Template 1" | **Adopt and extend.** Becomes the portable template package system (§4), extended to drive video. |
| 3 | **Device catalogue** — 35 devices, light/dark variants | `apple-iphone-11-*`, `google-pixel-4-*`, `samsung-galaxy-s10-*`, `htc-*`, `huawei-*`, `lg-nexus-*` | **Adopt as data, modernize.** Taxonomy and naming convention reused; catalogue is five years stale and must be extended (§6). |
| 4 | **Frame style variants** | "Default Frames", "Clay Frames" | **Adopt.** Frame `style` axis alongside device id and colourway. |
| 5 | **Multi-device composition** — two devices per screenshot | "Device One", "Device Two", "Add Base Device", "Device One Screen", "Device Two Screen" | **Adopt, generalize.** N devices per scene rather than a fixed two. |
| 6 | **Layout presets** | "Rotated Left 1/2", "Rotated Right 1/2", "All Devices In Column", "Caption Above/Below", "Left/Right Side Caption Above/Below" | **Adopt.** Become named layout primitives inside templates. |
| 7 | **Global Panoramic** — one wide image spanning a whole screenshot set | "Global Panoramic", "Flip Global Panoramic", "Panoramic width/height can not exceed 10000 pixels", "Panorama" | **Adopt.** A signature store-listing technique; kept as a first-class template feature. |
| 8 | **Background system** | "Background Type", "Gradient(s)", "Color one"/"Color Two", "Color Palette", "Color Picker", named presets ("Dark Blue Gradient", "Colors Of Sky", "Curiosity blue", "New Orange", "Kimoby Is The New Blue") | **Adopt.** Background layer with solid/gradient/image types and a named-preset library. |
| 9 | **Screenshot transform** | "Position X/Y", "Scale X/Y", "Rotation", "Rotate Left/Right", "Flip", "Click & Drag to reposition screenshot" | **Adopt.** Becomes the transform block on layers — and, critically, the same properties become **animatable** for video. |
| 10 | **Typography controls** | "Fonts", "Font Size", "Alignment", "Align Left/Center/Right", "Align Top/Middle/Bottom", font loading states | **Adopt.** Text layer properties; fonts ship inside template packages. |
| 11 | **Caption model** | "Caption Above", "Caption Below", "Caption\nTimes two" | **Adopt.** Caption is a positioned text layer within layout presets. |
| 12 | **Style copy/paste across screenshots** | "Copy/Paste Layout Style", "Copy Background Style", "Copy Device One/Two Style", "Copy Screenshot Style" | **Adapt.** In a manual tool this is a productivity feature; here, style consistency is inherent — the template defines style once and every scene inherits it, with optional per-scene overrides. The user need it solved is met structurally. |
| 13 | **Localization** — per-language screenshot sets | "Languages", "All Languages", "No locale data passed", "No supported locale was found" | **Adopt as roadmap.** Real store requirement (localized listings). Deferred past v1 but the Project Document reserves a `locale` axis so it is not a later re-architecture. |
| 14 | **Export model** | "Export Screenshot", "Export Screenshots", "Export Device Screenshots", "Export Presentation Preview", ZIP bundling | **Adopt.** Informs output packaging and the `.sagtpl` package format. |
| 15 | **Preview mode** | "Preview Tab", "Preview Full", "Preview Device", "Export Presentation Preview" | **Adopt.** Becomes fast draft rendering for template iteration. |
| 16 | **Custom devices / image upload** | "Add custom devices", "Upload Image", "New Device" | **Adopt.** Device registry accepts user-added frames; branding assets can be supplied explicitly. |
| 17 | **Canvas rendering pipeline** | `toBlob`, `toDataURL` | **Replace.** Canvas cannot express a timeline, 3D transforms, or camera moves — this is precisely why the legacy tool was stills-only. Superseded by Remotion (§3). |
| 18 | **React + MUI UI shell** | Bundle analysis | **Replace if rebuilt.** Minified beyond practical recovery and 2020-era MUI. The UI's *role* returns later as the template editor (§4.6). |
| 19 | **Bundle source code** | No source maps | **Not reusable.** Recovering logic from mangled output costs more than reimplementation. |

### 2.3 What the legacy tool did *not* have

These are net-new and carry the highest implementation risk, because there is no prior art in the reference to lean on:

- **Automated screenshot acquisition.** The legacy tool required the user to upload images. Discovery + capture from a URL (stages 1–2) is entirely new.
- **Video generation of any kind.** No timeline, no animation, no encoding. Stages 5 and the entire animation half of the template schema are new.
- **Platform specification and validation.** Sizing was implicit in the chosen device; there was no rules engine and no validation report.
- **CLI / unattended operation.** It was an interactive browser app only.

**Summary:** the legacy project contributes a proven *design data model* — project document, template library, device catalogue, layout presets, panoramic, background system, transforms, typography — which this architecture adopts almost wholesale. It contributes no executable code, no frame assets, and nothing at all toward automation or video.

---

## 3. Technology Decisions

| Layer | Choice | Why this, not the alternative |
|---|---|---|
| **Language/runtime** | Node 20+ / TypeScript | **Decided by the distribution layer, not the renderer** (see §3.1). The MCP SDK, the NPM package model, and the multi-agent installer proven by `workspace-sync` are all Node/TypeScript. Playwright has first-class Node bindings. |
| **Screenshot capture** | Playwright (Chromium) | Device descriptor emulation (viewport, DPR, UA, touch) is built in and accurate. Puppeteer is narrower; Selenium heavier with worse emulation. |
| **Android capture** | adb (+ optional emulator) | Verified working on this machine. Deep-link navigation, no Appium. See [`ANDROID-CAPTURE.md`](./ANDROID-CAPTURE.md). |
| **Video + still rendering** | **Playwright + FFmpeg** (default), Remotion as opt-in backend | Reversed from the earlier recommendation — see §3.2. |
| **Encoding / muxing / probing** | FFmpeg (installed, v8.1.1) | Encoding, audio mux, and validation probing. |

### 3.1 Why TypeScript — the reason changed

The earlier draft justified TypeScript primarily by Remotion being React/Node-only. That reasoning is now secondary, and the requirements correctly warned against keeping the language choice purely on that basis.

The decisive argument is now the **distribution and agent layer**:

- The Model Context Protocol SDK is TypeScript-first (`@modelcontextprotocol/sdk`).
- The NPM package model — one package shipping a CLI, an MCP server, and a multi-agent installer — is the proven pattern from `workspace-sync`, in the same language.
- Playwright's Node bindings serve both web capture and (with FFmpeg) rendering.
- A single language spans capture, project assembly, rendering, MCP, CLI, and installer, with one dependency manager and one shared set of types for the Project Document and template schemas.

Python remains entirely capable of the capture and encoding work. What it cannot do without significant friction is the MCP-server-plus-NPM-distribution layer, which is now a core product requirement rather than an afterthought. **TypeScript is chosen for distribution, and would remain correct even if the renderer were something else entirely.**

### 3.2 Renderer decision — Remotion vs Playwright + FFmpeg

Re-evaluated on the criteria the requirements specify: licensing, commercial usage, maintainability, animation capability, performance, template support, deployment, and developer experience.

| Criterion | Remotion | Playwright + FFmpeg |
|---|---|---|
| **Licensing** | Free for individuals and very small companies; a **paid company licence** is required above a small headcount threshold | Apache-2.0 / LGPL — **no licence cost, no headcount trigger** |
| **Open-source distribution** | Complicates publishing an open-source tool others install and use commercially | No constraint |
| **Animation capability** | Excellent — React + CSS, springs, 3D transforms | Equivalent — the same CSS engine (Chromium) renders the same 3D transforms; we drive the timeline ourselves |
| **New dependency** | Yes, a substantial one | **None — Playwright and FFmpeg are already required** for capture and encoding |
| **Template support** | Strong, but oriented around React components | Our templates are declarative JSON interpreted by us, so React authoring is not the value it would otherwise be |
| **Developer experience** | Better — Remotion Studio preview, mature tooling | We build a preview path ourselves |
| **Performance** | Optimized parallel frame rendering, caching | We implement frame stepping and parallelism; slower to get right |
| **Maintainability** | Upstream handles rendering complexity | We own more code |

**Recommendation: default to Playwright + FFmpeg.** Three reasons, in order of weight:

1. **Licensing is a genuine blocker, not a formality.** This is intended as a reusable GitHub/NPM package used across multiple company projects. A renderer with a commercial-use headcount trigger is the wrong foundation for that.
2. **It adds no dependency.** Playwright is already mandatory for capture and FFmpeg for encoding. The renderer becomes an animation-timing layer over tools already in the package, not a third pillar.
3. **The template system already insulates us.** Because a template is declarative JSON interpreted by our own code, Remotion's React authoring model — its biggest advantage — is largely unused. We would pay the licensing cost for machinery our architecture routes around.

The honest cost: we implement deterministic frame stepping, parallel rendering, and preview ourselves. That is real work, and Remotion does it better. It is the right trade only because the licensing and dependency arguments are strong and the template indirection blunts Remotion's edge.

**How this stays reversible:** the interpreter targets a `RenderBackend` interface (`renderStill(scene, frame)`, `renderSequence(scenes)`). Playwright+FFmpeg is one implementation; a Remotion backend can be added without touching templates, the project document, or any other layer. If the team holds a Remotion licence, switching is a backend swap and a config flag.

**Confirm before Phase 5:** current Remotion licence terms and the team's eligibility. If a licence is already held or freely available, reconsider — the developer-experience advantage is real.

*Rejected outright:*
- **Canvas (the legacy approach)** — no timeline, no 3D, no declarative animation. Exactly why the legacy studio was stills-only.
- **FFmpeg filter graphs alone** — `xfade`/`zoompan` handle transitions and Ken Burns, but 3D rotation, device choreography, and text layout are impractical to express and unmaintainable to author. FFmpeg is used for encoding and muxing, not for composing scenes.
- **After Effects / `nexrender`** — requires licensed desktop software; unacceptable for an unattended, installable CLI.
| **Device frames** | SVG frames + JSON geometry | Vector scales to any platform resolution without artefacts — a genuine upgrade over the legacy PNG frames. Geometry as data lets frames be added without code changes. |
| **Template packages** | Declarative JSON manifest + assets, zipped (`.sagtpl`) | Enables import/export/create/edit with no build step and — critically — **no execution of imported code**. Direct descendant of the legacy ZIP/JSON model. See §4. |
| **Schema validation** | Zod | Imported templates and project files are untrusted input and must be validated before use. |
| **Zip handling** | `archiver` / `yauzl` | Mirrors the legacy `jszip` model with maintained libraries. |
| **Platform specs** | YAML data files | The PRD mandates specs be updatable without code changes. |
| **CLI** | Node `parseArgs` (stdlib) or Commander | Few subcommands; prefer stdlib unless flag ergonomics demand more. |
| **Secrets** | OS keychain (`keytar`) or AES-GCM with a gitignored local key | Never plaintext on disk. |
| **Interface** | CLI first; local web template editor later | The generation workflow is two inputs — a CLI satisfies it. A UI is needed only for visual template editing (§4.6). |

---

## 4. Template System

The template system is a first-class subsystem, not a folder of components. It must support import, export, creation, editing, multi-template management, per-generation selection, cross-app reuse, and future extension without architectural change.

### 4.1 Core decision — declarative, not code

A template is a **declarative JSON scene graph interpreted by a fixed set of built-in rendering primitives**. It is not a JavaScript/React module.

This is the most consequential decision in the system, and it follows directly from the import/export requirement:

- **Security** — an importable template containing code would execute arbitrary JavaScript on import. A declarative document cannot.
- **Portability** — JSON plus assets moves between machines, apps, and projects with no build step, no dependency install, no bundler.
- **Editability** — a schema-backed document is editable by hand, by CLI, or by a future visual editor against one contract.
- **Versionability** — templates carry an `engineVersion`; migrations are data transforms, not code rewrites.
- **Extensibility** — new capabilities arrive as new primitive types the renderer understands; existing templates keep working.

First-party templates are authored as the same declarative documents — no privileged path — which keeps the primitive set honest.

### 4.2 Package format — `.sagtpl`

A ZIP archive, directly descended from the legacy studio's ZIP export model:

```
my-template.sagtpl
├── template.json        # manifest + scene graph (schema-validated)
├── preview.png          # gallery thumbnail
├── preview.mp4          # optional motion preview
└── assets/
    ├── fonts/           # shipped with the template (legacy concept 10)
    ├── backgrounds/
    ├── overlays/
    └── music/
```

Assets are referenced by path relative to `template.json`. A template is self-contained: everything it needs travels with it.

### 4.3 Manifest shape

```jsonc
{
  "meta": {
    "id": "glide-rotate",
    "name": "Glide & Rotate",
    "version": "1.2.0",
    "engineVersion": "1.x",
    "category": "business",          // legacy concept 2: category-based library
    "tags": ["3d", "energetic"]
  },

  "compatibility": {
    "platforms": ["google-play", "apple-app-store"],
    "outputs": ["screenshots", "video"],
    "aspectRatios": ["9:16", "16:9"],
    "minScreenshots": 3,
    "maxScreenshots": 8
  },

  "slots": {                          // what the pipeline must supply
    "appName":     { "type": "text",    "required": true },
    "logo":        { "type": "image",   "required": false },
    "screenshots": { "type": "image[]", "required": true },
    "featureText": { "type": "text[]",  "required": false },
    "palette":     { "type": "palette", "required": false },
    "music":       { "type": "audio",   "required": false },
    "cta":         { "type": "text",    "required": false }
  },

  "theme": {                          // legacy concepts 8, 10
    "background": {
      "type": "gradient",
      "preset": "dark-blue",
      "colorOne": "{{palette.primary}}",
      "colorTwo": "#0B1020"
    },
    "typography": {
      "heading": { "font": "assets/fonts/Inter-Bold.woff2", "size": 64, "align": "center" },
      "body":    { "font": "assets/fonts/Inter-Regular.woff2", "size": 32, "align": "center" }
    },
    "device": { "default": "apple-iphone-15-pro", "style": "default", "colorway": "dark" }
  },

  "panoramic": {                      // legacy concept 7 — optional
    "enabled": false,
    "image": "assets/backgrounds/wide.jpg",
    "flip": false
  },

  "screenshots": {                    // still-output composition
    "layout": "caption-above",        // legacy concept 6
    "variants": ["caption-above", "rotated-left-1", "rotated-right-1"]
  },

  "timeline": {                       // video-output composition — net-new vs legacy
    "fps": 30,
    "scenes": [
      { "id": "intro", "durationInFrames": 60, "layers": [ /* … */ ] },
      {
        "id": "feature",
        "repeatFor": "screenshots",   // one instance per supplied screenshot
        "durationInFrames": 90,
        "layers": [
          { "type": "background", "from": "{{theme.background}}" },
          {
            "type": "device-mockup",
            "device": "{{theme.device}}",
            "screenshot": "{{item}}",
            "transform": { "perspective": 1200 },
            "animations": [
              { "property": "rotate3d.y", "from": -35, "to": 0,   "easing": "spring",      "start": 0, "duration": 45 },
              { "property": "translateY", "from": 120, "to": 0,   "easing": "easeOutCubic","start": 0, "duration": 30 },
              { "property": "scale",      "from": 0.9, "to": 1.0, "easing": "easeOutCubic","start": 0, "duration": 45 }
            ]
          },
          { "type": "text", "content": "{{item.featureText}}", "animations": [ /* … */ ] }
        ]
      },
      { "id": "outro", "durationInFrames": 75, "layers": [ /* … */ ] }
    ]
  },

  "audio": { "track": "assets/music/upbeat.mp3", "fadeInFrames": 15, "fadeOutFrames": 30 }
}
```

**Layer primitives (v1):** `background`, `image`, `text`, `shape`, `logo`, `device-mockup`, `group`, `camera`.
**Transform properties (from legacy concept 9, now animatable):** `translateX/Y`, `scale`/`scaleX/Y`, `rotate`, `rotate3d.x/y/z`, `opacity`, `blur`, `flip`.
**Easings:** standard cubic set plus `spring`.

The insight worth stating plainly: the legacy tool's *static* transform controls and this system's *animation* properties are the same property set. Video is what you get when the legacy design model gains a time axis. That is why the still and video halves of a template share one vocabulary rather than being two unrelated configurations.

Extending the system later means adding a primitive type and bumping `engineVersion` — no changes to capture, sizing, validation, or packaging.

### 4.4 Renderer

`src/render/interpreter/` walks the scene graph and maps each layer to a Remotion component and each animation to an `interpolate`/`spring` driver against the current frame. The interpreter is the only code that understands the schema, and it is shared by video rendering (`renderMedia`) and still composition (`renderStill`) — so one template produces a matching store screenshot set and promo video.

### 4.5 Registry and resolution

Templates resolve from three sources, later overriding earlier:

1. **Built-in** — ship with the tool (`src/templates/builtin/`)
2. **User** — `templates/` in the project root, shared across all apps
3. **Imported** — installed from a `.sagtpl` into the user directory

```
store-assets template list
store-assets template import <file.sagtpl>
store-assets template export <id> [--out <file>]
store-assets template new <id> [--from <existing-id>]
store-assets template validate <id>
store-assets template preview <id>
```

Because templates are app-agnostic documents referencing only slots, **cross-app reuse is inherent** — the same `.sagtpl` serves any application without modification.

### 4.6 Editing

- **v1** — edit `template.json` directly; `template validate` reports schema errors with JSON paths; `template preview` renders a fast draft against placeholder assets.
- **Later** — a local web visual editor: the legacy studio's actual role, modernized, reading and writing the same schema. Deferred deliberately — the schema is the contract and must be proven by real templates before a UI is built on top of it.

---

## 5. The Project Document

Adopted from the legacy tool's "design file" (concept 1), and the piece that makes the whole pipeline coherent.

A **Project Document** is the fully resolved description of one asset set: which screenshots, which template, which devices, which platform, which text, which branding. The legacy tool had a human author it; here the pipeline generates it, and a human may optionally edit it.

```jsonc
{
  "app":      { "name": "…", "url": "https://…", "slug": "…" },
  "platform": "google-play",
  "template": { "id": "glide-rotate", "version": "1.2.0" },
  "branding": { "logo": "…", "palette": { "primary": "#…" } },
  "locale":   "en",                     // reserved axis (legacy concept 13)
  "screens": [
    {
      "id": "home",
      "sourceUrl": "https://…/",
      "capture": "raw/home@3x.png",
      "featureText": "Practice thousands of questions",
      "device": "apple-iphone-15-pro",
      "layout": "caption-above",
      "overrides": { }                  // per-scene style overrides
    }
  ],
  "outputs": { "screenshots": true, "video": true }
}
```

Why this matters architecturally:

- **It is the seam between automation and control.** Everything before it is automated; everything after it is deterministic rendering. A user who wants to adjust one headline edits the project document and re-renders — no re-capture, no manual image editing.
- **It makes re-rendering cheap.** Changing template or platform reuses existing captures entirely.
- **It is the reproducibility record.** Saved alongside the output, it regenerates the exact package later.
- **It is what a future visual editor edits.** Same role the legacy design file played.

---

## 6. Pipeline Stages

Seven stages behind one orchestrator, each with typed input/output contracts so any stage can be run, tested, cached, or replaced independently.

### Stage 1 — Discovery (`src/discovery/`)
**In:** app URL, optional overrides. **Out:** ranked `ScreenTarget[]`.

Parse `sitemap.xml` when available; otherwise load the URL in Playwright and extract navigation structure (`<nav>`, header/footer menus, primary CTAs, internal anchors). Rank by prominence — nav placement, cross-page link frequency, heading semantics, path depth. Detect auth-gated routes. Apply config overrides (pin, exclude, reorder, rename). Deny-list legal/utility routes (privacy, terms, 404). Cap to the platform's useful maximum.

*Hybrid by design:* discovery finds pages reliably but cannot know which are marketable. Ranking gives a good default; overrides give control without demanding it.

### Stage 2 — Capture (`src/capture/`, `src/android/`)
**In:** `ScreenTarget[]`, device profiles, optional credentials. **Out:** raw PNG per screen at DPR 3.

Two backends behind one `CaptureSource` interface, so everything downstream is identical regardless of origin:

**Web backend (primary).** One browser, one context per device profile, bounded-concurrency page pool. Authentication runs first via a pluggable strategy — cached `storageState`, else `api-session` / `form` / `manual` — and **verifies** that the authenticated UI is present and the login gate absent before any capture ([`AUTHENTICATION.md`](./AUTHENTICATION.md)). Without valid credentials, auth-gated targets are skipped with a recorded reason, never captured as a login screen. Suppress noise before capture — consent banners, ad slots, notification prompts, chat widgets, dev banners — via a ported selector list plus generic heuristics. Readiness gate is network idle **plus** a content assertion, never a bare timeout. Reject-and-retry blank, near-blank, and error captures. High DPR so nothing downstream upscales.

**Android backend (secondary).** adb-driven capture from an emulator or physical device, for native UI, WebView divergence, Android-only features, and verification. Deep-link navigation preferred over UI automation. Device hygiene applied and restored. Full detail and verified feasibility in [`ANDROID-CAPTURE.md`](./ANDROID-CAPTURE.md).

The agent chooses the backend per screen; the pipeline does not care which produced a given PNG.

### Stage 3 — Platform Specification (`src/platform/`)
**In:** platform id. **Out:** resolved `PlatformSpec`.

Schema-validated data lookup: required device classes, output dimensions, aspect ratios, formats, size caps, count bounds, video constraints. Consumed by composition (to size output) and validation (to verify it).

> Exact current dimension and duration values must be confirmed against live store documentation at implementation time and written into these data files. They are deliberately not asserted here — a stale number baked into an architecture doc is how hard-coding starts.

### Stage 4 — Project Assembly (`src/project/`)
**In:** captures, `PlatformSpec`, template, branding. **Out:** Project Document (§5).

Binds screens to devices and layouts, derives branding when not supplied (logo from favicon/`og:image`/manifest icons, palette from dominant capture colours), and resolves template slots.

**Copy is generated in-tool.** The AI content stage calls the configured provider with the screenshot plus source/route context, using the tool's own shipped prompts, and writes headlines, descriptions, CTAs, and the video title into the Project Document ([`AI-PROVIDERS.md`](./AI-PROVIDERS.md)). Grounding is enforced in the prompt: describe only what the screenshot or source evidences, omit rather than guess. An agent may override or regenerate any field; a human may edit the document directly. With AI disabled or unreachable, it degrades to page-heading extraction, labelled as placeholder.

Once written, copy is **data**. Rendering never re-generates it, so re-renders are deterministic and offline.

### Stage 5 — Still Composition (`src/render/still.ts`)
**In:** Project Document. **Out:** platform-sized store screenshots.

Screenshot is masked into the device frame's screen aperture using the frame's JSON geometry (inset rect, corner radii, notch/island cutout). Layout preset positions device(s) and caption; background or panoramic renders behind. Rendered via Remotion `renderStill` at the platform's exact output dimensions.

### Stage 6 — Video Generation (`src/render/video.ts`)
**In:** Project Document. **Out:** encoded MP4.

The interpreter builds a Remotion composition from the template timeline: intro → per-screenshot feature scenes → outro/CTA. Each feature scene animates a framed device — entrance, 3D rotation, camera move, text overlay, exit. Audio mixed with fades; duration clamped to platform bounds; encoded to the required codec/container.

### Stage 7 — Validation & Packaging (`src/validate/`, `src/package/`)
**In:** all generated assets, `PlatformSpec`. **Out:** versioned package + report.

Images: dimensions, aspect ratio, format, byte size, blank/near-blank detection, loading-state detection. Videos: FFprobe-derived resolution, aspect, duration, codec, container, audio stream presence, size, plus black-frame sampling. Emits `report.json` and a human-readable summary; a failing asset names the specific rule violated rather than failing generically.

---

## 7. Proposed Structure

```
D:\AI_Tools\store-assets-generator\
├── PRD.md
├── docs/
│   ├── ARCHITECTURE.md · architecture.mmd · IMPLEMENTATION_PLAN.md · PRD-v1-discovery.md
├── cli/index.ts                   # CLI entry (bin: store-assets)
├── install/                       # multi-agent skill + MCP installer
│   ├── index.ts                   # agent detection, target tables, drift/version
│   └── skills/                    # skill content as string constants (portable)
├── mcp/
│   ├── server.ts                  # MCP stdio server (package main)
│   └── tools/                     # one module per MCP tool
├── src/
│   ├── orchestrator.ts            # runs stages 1-7, caching, concurrency
│   ├── discovery/                 # sitemap.ts · crawl.ts · rank.ts
│   ├── android/                   # device.ts · emulator.ts · launch.ts
│   │                              # navigate.ts · screencap.ts · hygiene.ts
│   ├── capture/
│   │   ├── browser.ts             # Playwright lifecycle, context pooling
│   │   ├── auth.ts                # credential injection, encrypted at rest
│   │   ├── noise.ts               # consent/ad/prompt suppression
│   │   ├── readiness.ts           # content-based settle detection
│   │   └── screenshot.ts
│   ├── platform/
│   │   ├── schema.ts
│   │   └── specs/{google-play,apple-app-store}.yaml
│   ├── devices/
│   │   ├── registry.ts            # catalogue, modernized from legacy
│   │   ├── frames/                # SVG frames, per style + colourway
│   │   └── geometry/              # screen inset + cutout JSON per frame
│   ├── project/
│   │   ├── schema.ts              # Project Document (§5)
│   │   ├── assemble.ts
│   │   └── branding.ts            # logo + palette derivation
│   ├── templates/
│   │   ├── schema.ts              # Zod schema for template.json
│   │   ├── registry.ts            # builtin + user + imported resolution
│   │   ├── package.ts             # .sagtpl import / export / validate
│   │   ├── migrate.ts             # engineVersion migrations
│   │   ├── presets/               # layouts, gradients, easings
│   │   └── builtin/
│   │       ├── glide-rotate/{template.json,preview.png,assets/}
│   │       ├── clean-slide/
│   │       └── bold-zoom/
│   ├── render/
│   │   ├── backend.ts             # RenderBackend interface (swappable)
│   │   ├── backends/
│   │   │   ├── playwright-ffmpeg/ # default: frame stepping + encode
│   │   │   └── remotion/          # optional, licence-gated
│   │   ├── still.ts · video.ts
│   │   └── interpreter/
│   │       ├── scene.ts · layer.ts · animate.ts
│   │       └── layers/{DeviceMockup,Text,Image,Shape,Background,Panoramic,Camera}
│   ├── validate/{image,video,report}.ts
│   └── package/bundle.ts
├── templates/                     # user + imported templates
├── apps/<app-slug>/config.yaml    # optional per-app overrides
├── assets/music/
├── output/<app>/<platform>/<version>/
│   ├── raw/ · store/ · video/ · project.json · report.json
└── studio.app-mockup.com/         # legacy reference — DELETE once §2 concepts are implemented
```

---

## 8. Cross-Cutting Concerns

**Security.** Credentials are optional, encrypted at rest, held in memory only for session injection, never logged, never written into any manifest, screenshot, or report. The tool never writes to the target application. Upload capability is absent, not merely disabled. **Imported templates are untrusted input**: schema-validated before use, asset paths confined to the package root (no traversal), no code execution — the declarative format is what makes this enforceable.

**Reproducibility.** Remotion renders deterministically from props. The Project Document plus tool/template/spec versions is saved with the output, so any package regenerates exactly.

**Performance.** Capture parallelises across a bounded page pool; rendering parallelises across Remotion workers. Video encoding is the realistic bottleneck. Raw captures are cached by URL + device profile, so changing template or platform skips stages 1–2 entirely — which makes template iteration fast, the workflow that matters most once templates are editable.

**Maintainability.** Platform specs are data. Device frames are assets plus geometry data. Templates are schema-validated documents. Layouts, gradients, and easings are presets. None requires touching the orchestrator, capture, or validation layers.

**Failure behaviour.** Every stage fails loudly with a specific cause. An uncapturable screen is reported and skipped, never silently replaced with a blank. A validation failure names the violated rule.

---

## 9. Risks, Limitations, and Open Decisions

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Device frame assets do not exist** — the mirror captured none; legacy frames were CDN-hosted third-party proprietary assets | Blocks stages 5 and 6 | **Largest unresolved dependency.** Resolve in Phase 1: licence a commercial pack, use an appropriately licensed open set, or author SVG frames in-house. Re-hosting App Mockup's CDN assets is a licensing question that must be answered before being relied upon. |
| **Legacy device catalogue is five years stale** — stops at iPhone 11 / Pixel 4 / S10 | Dated assets; current store device-class requirements unmet | Treat the catalogue as a starting taxonomy; add current devices as part of frame sourcing. |
| **Store review rejection of synthetic video** — Apple has historically expected previews to reflect actual in-app experience | Rejected submission | Validate against a real submission early. Google Play promo video is more permissive; Apple is the genuine open question. Escalate before investing in Apple-specific templates. |
| **A web app is not a native app** | Misleading assets | Acceptable for WebView-wrapper apps. For genuinely native apps this is the wrong instrument — document the limitation rather than engineering around it. |
| **Auth-gated screens are often the best screens** | Weak asset set without credentials | Optional credential support; explicitly report skipped screens. |
| **Remotion licensing** — free for individuals and small teams, paid above a threshold | Cost/compliance | Confirm eligibility against current licence terms before committing. Fallback to FFmpeg filter graphs means dropping 3D rotation. |
| **Template schema churn** — early mistakes break shipped templates | Broken imports | `engineVersion` on every template plus a migration path from day one, not retrofitted. |
| **Declarative schema hits an expressiveness ceiling** | A desired effect becomes unbuildable | Accept: add a primitive. Explicitly do **not** allow code in templates — that reopens the security and portability problems the format exists to prevent. |
| **Auto-generated feature text reads poorly** | Amateur-looking assets | Derive from headings as a default; make text an obvious Project Document edit point. |
| **Store spec drift** | Silently invalid assets | Specs as versioned data; validation always runs; spec version recorded in the report. |

### Limitations (accepted, not defects)

- Only the web UI reachable from the entered URL can be captured — native-only screens are out of reach by design.
- Screens requiring multi-step interaction (mid-exam states, post-payment confirmations) may need config-defined interaction steps rather than pure URL navigation.
- Auto-derived branding is a heuristic; explicit overrides will usually produce better results.
- No source recovery from the legacy bundle — its behaviour was inferred from strings and asset references, so §2.2 is an informed reconstruction, not a verified feature list.

### Open decisions — resolve before Phase 2

1. **Device frame sourcing and licensing** — blocks stages 5–6. Highest priority.
2. **Remotion licence eligibility** — confirm before building the interpreter on it.
3. **Apple App Store preview policy** — does a stills-derived preview satisfy current review requirements? Determines whether Apple video is in scope at all.
4. **Music licensing** — source for royalty-free BGM shipped with templates.
5. **Interaction steps** — is URL-only navigation sufficient for v1, or is a config-defined click/wait step list needed to reach valuable states?
6. **Template editor scope** — is hand-edited JSON acceptable for v1, with the visual editor deferred?
7. **Localization timing** — the axis is reserved; when does it become real work?
8. **Template distribution** — local files only, or a shared internal registry for cross-project reuse?

### Assumptions

- The target app is a responsive web application reachable over HTTP from the developer machine.
- The operator has authority to capture the target site and to use any supplied credentials.
- Generation runs on a developer machine with Node 22 and FFmpeg present (both verified available).
- Output is reviewed by a human before any store submission — this tool prepares assets, it does not submit them.
- The legacy studio mirror is reference-only, never imported or executed, and is deleted once §2's concepts are implemented.
