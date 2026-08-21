# Store Assets Generator — Product Requirements Document

**Version:** 3.0 (supersedes v2; v1 discovery brief archived at `docs/PRD-v1-discovery.md`)
**Status:** Requirements defined, pending implementation
**Location:** `D:\AI_Tools\store-assets-generator`
**Distribution:** GitHub repository → NPM package → one-command install (not server-hosted)

---

## 0. Core Principle

> **The AI Agent provides the intelligence; Skills teach the workflow; MCP provides controlled capabilities; and Store Assets Generator performs deterministic asset generation and rendering.**

The system must understand the *actual application* rather than blindly generating generic marketing content.

The final objective: an AI Agent takes an existing website or Android application, understands its real features, captures the right screens, writes accurate feature explanations, places those screens into reusable mockup templates, generates professional animated promotional videos, and produces the required store assets with minimal human intervention.

**The APIs, prompts, configuration, and automation logic live inside the tool** (revised in v3.1). The agent primarily *controls and executes* the workflow; the tool owns the intelligence and can generate video titles and feature copy standalone, with no agent attached.

**Determinism is preserved by staging:** AI output is persisted into the Project Document, and rendering reads that document without calling any API. The same document always produces the same output, offline.

---

## 1. Product Summary

The Store Assets Generator is a reusable, AI-agent-driven system for generating professional store-listing assets across multiple websites and Android applications.

The core pipeline:

```
App URL / Project
   ↓
Automated screenshot extraction  (frontend URL, or Android app where needed)
   ↓
Platform-specific asset sizing
   ↓
Mobile / device mockups
   ↓
Template-based animation
   ↓
AI-generated feature explanations
   ↓
Automatically generated production-ready video
```

At minimum the user provides an app URL and a target platform. With an AI agent connected, the agent inspects the actual project and drives the rest.

**Goal beyond screenshots:** the system should let an agent understand a real application, identify important features and screens, write feature explanations automatically, create marketing screenshots and animated promotional videos, and optionally capture actual Android application screens.

---

## 2. What This Product Is Not

These exclusions are definitional, not preferences:

- **Screen recording is not the primary video source.** The main promotional video is synthesised from still screenshots using mockups, templates, and animation. A short real-application-flow section *may* appear as a secondary closing segment (§4.7.1), but it is never the basis of the video.
- **This is not a manual walkthrough recorder.** The system does not require a human to drive the app while it records.
- **This is not a video editor.** No timeline UI, no manual clip arrangement, no per-release hand editing.
- **This is not based on `5.demo-assets-generator`.** That project exists for a different use case (recording manual feature walkthroughs for a marketing landing page). Its architecture, workflow, and output contract are explicitly **not** the reference for this product.
- **This is not a hosted service.** It is not deployed to CloudPanel or any server. It runs locally on the developer/agent machine. A future server/API mode is possible but is not a requirement.

The primary video workflow is:

```
Frontend / Android → Important Screens → Mobile Screenshots
   → Mobile Device Mockups → Reusable Video Templates → Animations
   → AI-generated feature text → BGM / Voice / CTA → Professional Promotional Video
```

---

## 3. Primary Workflow

The manual surface (`store-assets ui`) presents this as **four reviewable
steps**, sharing one set of raw screenshots per session. Each step's output
is inspected and adjusted before moving to the next — this is the
concrete form the "hybrid automation with explicit override" principle in
§0 takes for the day-to-day workflow (Phase 9, see
`docs/IMPLEMENTATION_PLAN.md`):

```
Demo Access → Raw Screenshots → Store Device Sizes → Studio Mockups → Store Asset ZIP
Raw Screenshots → Scene Templates → HTML/CSS/JS Animation Preview → Scene Editing → BGM → Final Video
```

1. **Capture (Step 1).** The user enters the app URL, selects target
   platform(s) (Google Play, Apple App Store, or both), and supplies
   demo/test-account access if the app requires authentication (§7). The
   system captures the required screens automatically and reports **how
   many screenshots were captured**. These originals are kept as the
   single raw source for both downstream branches.
2. **Studio Mockups (Step 2).** Each raw screenshot is composited into a
   realistic device mockup — frame, label, sub-text, background,
   layout — configurable manually or AI-assisted, with a live preview
   before anything is finalized.
3. **Store Asset Package (Step 3).** The finalized mockups are rendered at
   each required device-class size for the selected store(s) and packaged
   into a ZIP shaped for a manual Google Play Console / App Store Connect
   upload or listing update.
4. **Animation Video (Step 4).** The same raw screenshots drive an
   HTML/CSS/JS-animated promotional video, one scene per screenshot, built
   from reusable scene templates. Every scene is previewed and can be
   individually edited (screenshot, text/labels, device, 3D rotation,
   movement, zoom, duration) before the scenes are combined with BGM into
   the final rendered video.

MCP/CLI automation (§4.15) exposes the same steps as granular tool calls,
so an agent can drive the identical workflow non-interactively.

---

## 4. Functional Requirements

### 4.1 Input

| Input | Required | Notes |
|---|---|---|
| App URL | Yes | The only mandatory user-typed value |
| Target platform | Yes | `google-play` or `apple-app-store` |
| Credentials (demo/test account) | Optional | Only needed to reach authenticated screens; see §7 |
| Branding overrides (logo, colours, headlines) | Optional | Auto-derived from the site when not supplied |
| Template selection | Optional | System picks a sensible default |

### 4.2 Automated Screen Discovery

The system must discover capturable screens without the user enumerating them:

- Parse `sitemap.xml` when present.
- Crawl in-page navigation links, menus, and primary CTAs from the entered URL.
- Rank discovered screens by prominence (nav position, link frequency, page title/heading semantics) to select the most representative set.
- Allow an optional config file to override, pin, exclude, or reorder screens.

Hybrid discovery is required: automatic proposal with optional explicit override.

### 4.2.1 Capture Sources

The system must support two capture backends behind one interface:

**Frontend URL capture (primary).** For WebView applications the deployed frontend is the preferred source — higher resolution, faster, more reproducible, and requiring no device. An APK must not be required merely to capture a screen the frontend already renders.

**Android application capture (secondary).** Real APK capture via emulator or device, used when WebView behaviour differs from the browser, native UI exists, Android-specific UI must be shown, the actual APK appearance must be verified, or frontend rendering is otherwise insufficient.

The **agent decides which source is appropriate per screen**. Downstream processing is identical regardless of origin.

### 4.3 Screenshot Capture — Step 1

- Render the app at device-accurate viewports (width, height, device pixel ratio, user agent, orientation).
- Wait for genuine content readiness (network idle plus content assertions), not fixed timeouts.
- Suppress cookie banners, consent dialogs, ads, notification prompts, chat widgets, debug overlays, and loading indicators.
- Capture at high DPR so downstream compositing and video rendering never upscale a low-resolution source.
- Detect and reject blank, error, and still-loading captures automatically.
- Use the configured demo access (§7) when the app requires authentication.
- **Report how many screenshots were captured** as the visible outcome of the step, before the user moves on.
- Keep the raw/original captures available, unmodified, as the input to both Step 2 (mockups) and Step 4 (video) — nothing downstream re-captures.

### 4.4 Platform Specification Engine

- Store dimensions, aspect ratios, formats, file-size limits, count minimums/maximums, and video specifications as **data, not code**.
- Cover Google Play Store and Apple App Store, including their per-device-class variants (phone, 7" tablet, 10" tablet, iPhone display sizes, iPad).
- Support updating a platform requirement by editing a data file, with no code change and no redesign.
- Validate every produced asset against the active specification before it is considered complete.

### 4.5 Device Mockups — Step 2 (Studio Mockups)

- Send each Step 1 raw screenshot into the Studio Mockup workflow, converting it into an actual device mockup.
- Composite each screenshot into a realistic device frame (bezel, rounded corners, notch/dynamic island, buttons, accurate screen inset geometry).
- Provide a catalogue of modern iOS and Android devices — including foldables — comparable in breadth to `studio.app-mockup.com` (iPhone, iPad, Pixel, Galaxy families) but built as **data, not per-device artwork**: adding a new commercially available device (a new iPhone, a new Samsung, a new foldable) must be a catalogue entry, not new art (see `docs/DEVICE-FRAMES.md`).
- Correctly mask the screenshot to the frame's screen aperture, including corner radii and cutouts.
- Support frame colour variants (light/dark), and — via layout templates — angled/3D presentation.
- Support multiple mockup templates (layout, caption placement, presentation style), selectable per screen.
- Allow frame, label, text, and layout details to be configured **manually or generated/assisted by the AI Agent**.
- Show a live preview of the mockup before it is used downstream.

### 4.6 Marketing Screenshot Generation — feeds Step 3 (Store Asset Package)

Beyond the raw UI capture, produce composed store screenshots containing:

- The device mockup with the screenshot inside
- Headline and subtitle text
- Background (gradient, solid, pattern, or image)
- App logo and branding
- Decorative elements and layout variations
- Correct final output dimensions for the selected platform, rendered once per required device class of the selected store(s), and packaged as a ZIP ready for a manual Google Play Store / Apple App Store upload or listing update.

### 4.7 Automated Video Generation — Step 4 (Animation Video)

The promotional video is generated from the **same raw/original
screenshots** captured in Step 1 (not the Step 2 mockup renders), each
automatically placed inside a phone/device mockup for its scene.

**The video must be produced by HTML/CSS/JavaScript-based animation,
never by an AI video-generation engine.** The animation *workflow*
(scene templates, timing model, rendering mechanics) is static; the
*content* — screenshots, text, labels, device, duration, and other
template-defined properties — is dynamic per run. Concretely:

- Support **multiple reusable scene templates** (e.g. hero rise, 3D tilt,
  zoom focus, slide/pan) — the template defines the animation shape, not
  a one-off hardcoded sequence.
- **Each screenshot represents one scene.** For every scene, the user (or
  the AI Agent) selects a template and customizes: screenshot, text/
  labels, device/mockup, 3D rotation, movement, zoom, animation, duration,
  and any other properties the template exposes.
- Provide a **visual preview/playback of every scene** before final
  rendering, and allow reviewing and modifying scenes individually in
  order — Scene 1 → Scene 2 → Scene 3 → etc.
- After all scenes are finalized, render the complete video by combining
  the HTML animations with final BGM/audio into one encoded file.
- Support device entrance/exit animation, 3D phone rotation, screenshot
  zoom/pan/camera movement, and text overlays/feature callouts, all as
  scene-template-defined, per-scene-configurable properties — not global
  hardcoded behaviour.
- Background music, with optional sound effects and voice-over.
- A clear call-to-action closing frame is supported as a scene like any
  other.

The output must meet the selected platform's video specification (resolution, aspect ratio, duration bounds, codec, container, file size).

### 4.7.1 Optional Real-Flow Section

A short, secondary closing section may show real application flow with click/tap effects, appended after the mockup-based feature scenes. It must remain brief and secondary; it is never the primary video source.

### 4.7.2 AI-Generated Feature Explanations

**One of the most important requirements.** Video and marketing-screenshot text must never be hardcoded. The agent generates it from the actual project:

```
Actual Project → Source Code + UI + Requirements → Screenshot
   → AI Analysis → Identify Feature → Generate Headline
   → Generate Short Explanation → Generate Optional CTA
   → Pass content to MCP → Template Renderer
```

The agent combines screenshot, frontend source, Android source where relevant, routes, UI labels, requirements, and existing documentation to understand a screen's real purpose. Example: a result page whose source computes score, correct/wrong answers, percentage, and ranking yields *"See Your Complete Performance — Track your score, accuracy and ranking after every test."*

**The agent must not invent features that do not exist.** Every claim must be grounded in observed source or UI; omit rather than guess. This project-aware analysis is the core differentiator of the system.

### 4.7.3 Agent Iteration

The agent must be able to review generated assets and improve them — rewriting copy that is too long, adjusting a scene that feels too slow — and regenerate **individual assets or scenes** without rebuilding the entire project. The MCP surface must support granular regeneration.

### 4.8 Template System

The template system is a first-class subsystem and a core part of the product. The architecture must be flexible and modular rather than hardcoded around a single video design.

**Required capabilities:**

- **Importing templates** — install a template from a portable package file
- **Exporting templates** — export any template as a portable, self-contained package
- **Creating new templates** — author from scratch or derive from an existing template
- **Editing and customizing templates** — modify layout, animation, styling, and assets
- **Maintaining multiple templates** — a managed library, not a single design
- **Selecting templates per generation** — choose which template drives a given run
- **Reusing templates across apps and projects** — templates are app-agnostic
- **Supporting varied designs** — different animation styles, device mockups, layouts, and video compositions
- **Future extension without architectural change** — new capabilities arrive additively

**Requirements:**

- A template accepts slots: app name, logo, screenshots, headline/feature text, background, colour palette, music, CTA.
- A template is a portable, self-contained package — its fonts, backgrounds, overlays, and music travel with it.
- Templates are versioned and carry an engine-compatibility marker, with a migration path for schema evolution.
- Imported templates are **untrusted input** and must be validated before use; importing a template must never execute code.
- One template drives **both** still screenshots and video, so the two share a consistent visual language.
- Selecting a different template regenerates visibly different output from identical inputs, with no code change.
- Adding a template or a new visual capability must not require changes to the capture, sizing, validation, or packaging layers.

### 4.8.1 Project Document

Separately from templates, the system maintains a **project document**: the fully resolved description of one asset set — screens, captures, template, devices, platform, text, and branding.

- The pipeline generates it automatically; no manual authoring is required.
- It may be saved, edited, and re-rendered without re-capturing.
- It is the reproducibility record for a generated package.
- It is the seam between automation and control: everything before it is automated, everything after is deterministic rendering.

### 4.9 Validation and Reporting

Before an asset set is considered complete, automatically verify:

**Images** — dimensions, aspect ratio, format, file size, no blank/white frames, no loading state, no visible debug UI, no accidental cropping.

**Videos** — resolution, aspect ratio, duration within platform bounds, codec/container compatibility, audio presence, no black frames, no broken transitions, file size.

Produce a machine-readable and human-readable report listing every asset with pass/fail status and the specific rule violated on failure.

### 4.10 Output Packaging

- Produce a versioned output package per app per platform, organized as one session folder holding everything the four steps produced (raw captures, per-device-class store renders, the store ZIP, and the video/BGM).
- Separate raw screenshots, composed store screenshots, and video into distinct output directories.
- Step 3's package is a **ZIP**, structured per platform and required device class, ready for a manual Google Play Store / Apple App Store upload or listing update — not an automated upload (§4.11 remains deferred).
- Regenerating after a UI change must reproduce the same asset structure without manual redesign.

### 4.11 Upload (Deferred)

Asset generation and asset upload must remain strictly separate. Upload is out of scope for the initial release; when added it must require explicit confirmation and never publish automatically.

---

### 4.12 Distribution and Installation

The system must be installable and reusable across multiple computers and multiple application projects.

```
GitHub Repository → NPM Package → One-command installation
   → Skills + MCP + Generator setup → AI Agent ready
```

- Published as an NPM package providing a CLI, an MCP server, and an installer from one package.
- Installation approximates `npm install -g <package>` followed by a setup command.
- Setup installs required dependencies, skills, MCP configuration, agent integration, configuration, and templates.
- Missing dependencies are detected, with clear guidance or safe automated installation.
- Optional capabilities (e.g. Android tooling) degrade individually and visibly — a machine without them must still generate web assets successfully.
- Cross-platform: Windows, and Linux/macOS where supported.

### 4.13 Multi-Agent Skill Installation

```
New Computer → Install NPM Package → Run Setup
   → Skills Installed → MCP Configured → Agent Ready
```

- Supports multiple AI coding/automation agents.
- The installer detects supported agent environments where possible and installs skills and MCP configuration to each agent's native location.
- Users must never manually copy skill files or repeatedly configure MCP settings.
- **Skills must contain no hardcoded paths.** The installer resolves the installation path dynamically, and the same skill package must work on any machine.
- Drift detection and repair (`doctor`) and post-upgrade re-sync (`update`) are required.

Architecture reference: `D:\AI_Tools\workspace-sync` (reference only — inspect and learn, do not copy blindly).

### 4.14 Skills

Skills are a core part of the product. They teach an agent **how to reason about the workflow**, while MCP provides execution. Required coverage: what the system does; how to inspect an application; how to identify important screens; how to capture frontend and Android screens; how to analyse screenshots; how to inspect project source code; how to identify features; how to write feature explanations; how to select screens for a store listing; how to create marketing screenshots and mockups; how to create promotional video scenes; how to use templates; how to validate assets; how to iterate and regenerate; how to prepare final store assets.

### 4.15 MCP Interface

Capabilities must be exposed through MCP so agents use typed tools rather than manipulating files or running complex rendering commands.

- Deterministic and well-defined; same inputs produce same outputs.
- No MCP tool may call an AI service.
- Granularity must support regenerating a single asset or scene.
- Indicative surface: `capture_web_screen`, `capture_android_screen`, `list_screens`, `create_mockup`, `create_marketing_image`, `create_video_scene`, `create_video`, `update_scene`, `set_screen_copy`, `preview_asset`, `validate_asset`, `list_templates`, `list_device_profiles`. Final surface to be designed against the architecture.

---

## 5. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| Automation | Minimal manual intervention after URL + platform entry |
| Reproducibility | Identical inputs produce structurally identical output |
| Reusability | Works for any app URL, not only ITI Career properties |
| Maintainability | Platform specs, device frames, and templates are data/assets, not embedded logic |
| Performance | A full generation run completes in minutes, unattended |
| Portability | Runs locally on a developer machine; no mandatory cloud service |
| Security | No production credentials committed; secrets encrypted at rest; nothing published without confirmation |

---

## 5.1 Manual Operation (mandatory)

**The tool is not intended only for AI agents. It must be fully usable manually.**

We must be able to enter an app URL ourselves and perform every task an agent would perform through MCP — capture, copy generation, template selection, scene and video rendering, validation, packaging. This is essential for testing, validating, debugging, and understanding whether the tool actually works.

**Requirement: the manual UI and the MCP/AI workflow must use the same underlying functionality and APIs, never separate implementations.**

- One core service layer; Web UI, CLI, and MCP are thin adapters over it.
- No capability may exist in one surface and not the others.
- The Web UI calls the same local HTTP API that the CLI and MCP layers call.
- Every workflow step is independently runnable and re-runnable by hand.
- An agent run that misbehaves must be reproducible step-by-step in the UI, on the same code path.

---

## 6. Multi-Application Support

The tool must contain **no app-specific logic in its core**. Any app-specific values (URL, branding, screen overrides, credentials) live in per-app configuration. The same binary/CLI serves every application.

---

## 7. Authentication

**Goal:** App URL + email/password → authenticate automatically → access the real app UI → capture the required screens → continue the pipeline. The system must capture **authenticated UI**, never a login page or login modal.

Full design in `docs/AUTHENTICATION.md`.

- **Pluggable strategies:** cached `storageState` (tried first), `api-session` (login endpoint + session injection — the proven approach and the default for this app family), `form` (genuine email/password forms), `manual` (one-time human login for OTP/SSO/CAPTCHA apps, session saved and reused).
- **Verification, not timeouts.** Authentication succeeds only when the authenticated marker is present *and* the login gate is absent. A bare wait is never proof.
- **Session persistence** via Playwright `storageState`, so credentials are not needed on every run. Treated as a cache; a stale session falls back to fresh login.
- **Never** attempt Google/Firebase/social login. Prefer demo/test accounts; never production user credentials.
- When credentials are absent or expired, auth-gated screens are skipped with a recorded reason — never captured as a login screen.

### 7.1 Rotating, Time-Limited Credentials

Demo access **expires** and the password **changes frequently**. Updating it must never require code changes.

- **Environment variables** (`SAG_AUTH_EMAIL`, `SAG_AUTH_PASSWORD`, …) for CI and overrides.
- **Local web interface** (`store-assets ui`, loopback only) to view and update email/password, with the password masked and **blank meaning "keep existing"**.
- **CLI**: `auth set`, `auth status`, `auth test`, `auth clear`.
- Passwords encrypted at rest (AES-256-GCM, local gitignored key); plaintext in memory only; never logged, echoed, or written into any manifest, report, or bundle.
- **Expiry is first-class:** remaining access time is shown in CLI, UI, and MCP status; an expired run aborts before opening a browser with a clear "re-enable and update the password" message.

---

## 7.2 Multi-Provider AI Management

The tool holds its own AI provider settings, model inventory, and system prompts. Full design in `docs/AI-PROVIDERS.md`. Reference implementation: `D:\AI_Tools\1-Apps\Flask_Bot_Manager\App_Tools\ocr_for_documents`.

**Requirement: multi-provider compatibility.** We must be able to connect and manage multiple AI providers and their models, and select any configured model when generating videos or other assets.

- **Provider registry, separate from model inventory.** Configure a provider once, attach many models to it. Supports OpenAI, OpenRouter, Groq, DeepSeek, Together, Ollama, LM Studio (one OpenAI-compatible adapter), plus Anthropic and Gemini adapters. A new OpenAI-compatible provider needs only a registry entry — no code.
- **Dynamic model discovery** — fetch available models live from each provider, then curate which to save with friendly display names.
- **Per-task model selection** — different models for screen analysis (vision), feature copy, video titles, and review, each overridable per call from UI, CLI, and MCP.
- **Custom providers and endpoints** addable through the UI, including local/self-hosted.
- Providers, endpoints, models, keys, and prompts are all configurable **through the web interface and environment variables** — never code edits.
- API keys encrypted at rest; env vars take precedence; never logged or returned by any endpoint.
- System prompts ship as editable assets with user overrides. The grounding rule (describe only what is evidenced; omit rather than guess) is baked in.
- Used to generate video titles, feature headlines, descriptions, CTAs, and scene narrative automatically.
- **Optional infrastructure:** with AI disabled or unreachable, the system degrades to heading extraction; a capture run never fails because an AI call failed. Unavailable models fail over to the default, with the substitution recorded.

---

## 8. Success Criteria

The product is successful when a developer can run a single command with an app URL and a platform, walk away, and return to a validated, submission-ready asset package containing platform-correct screenshots and a professionally produced promotional video — with no screen recording, no manual screenshot editing, and no video editing at any point.

---

## 9. Reference Material

### 9.1 `studio.app-mockup.com` — legacy predecessor

A local mirror of the 2020 "AppMockUp Studio" (React + Material-UI + Canvas), retained as a **reference codebase to be fully absorbed and then deleted**.

Its design model is to be modernized and incorporated where relevant, and this product is its functional successor. The essential difference: the legacy tool is a *manual design tool* where a human uploads screenshots and arranges them; this product is an *automated pipeline* where a URL goes in and finished assets come out.

**Concepts to carry forward** (full inventory and disposition in `docs/ARCHITECTURE.md` §2): project design document, template library by app category, device catalogue with light/dark variants, frame style variants, multi-device composition, layout presets, global panoramic backgrounds, gradient/background system, screenshot transforms, typography controls, caption model, style consistency, localization axis, ZIP export, and preview mode.

**Capabilities the legacy tool did not have** — and which therefore carry the highest implementation risk: automated screenshot acquisition, video generation of any kind, a platform specification engine, validation, and unattended CLI operation.

**Constraints on its use:**
- It contains **no device frame image assets** — frames were served from an external CDN and were not mirrored. Frames must be sourced or produced independently, and their licensing resolved.
- It has **no source maps**; its behaviour was reconstructed from string analysis, not read from source. It is never imported, bundled, or executed.
- Its device catalogue stops at 2020-era hardware and must be extended.
- It is deleted once the adopted concepts are implemented and verified.
### 9.2 `workspace-sync` — distribution reference

`D:\AI_Tools\workspace-sync` (v0.2.8, MIT, published to npm) is **reference-only** for the installation and agent-integration architecture: NPM package structure, installation flow, skill installation mechanism, agent setup, MCP setup, multi-agent compatibility, configuration, one-command setup, global vs project-level installation, and detection of supported agents.

Do not copy its implementation blindly — its domain model (projects, SSH environments, VPS links) has no analogue here. Store Assets Generator gets its own clean architecture. Full analysis in `docs/AGENT-MCP-DISTRIBUTION.md` §2.

### 9.3 Documentation

- `docs/ARCHITECTURE.md` — layered architecture, engine pipeline, legacy concept inventory, technology and renderer decisions.
- `docs/AGENT-MCP-DISTRIBUTION.md` — agent/skill/MCP layers, NPM package architecture, multi-agent installation, `workspace-sync` analysis.
- `docs/ANDROID-CAPTURE.md` — Android capture feasibility (verified) and backend architecture; retained in Phase 9 as an alternate Step 1 capture source.
- `docs/DEVICE-FRAMES.md` — the device frame catalogue: parametric SVG generation, `config/devices.json` shape, foldable variants, how to add a device.
- `docs/DIAGRAMS.md` — index of the Mermaid diagrams in `docs/diagrams/` (one pure-Mermaid `.mmd` file per diagram, so each previews standalone): layered architecture, distribution/installation, AI-driven workflow, system overview, the current four-step workflow, the historical pipeline it superseded, video pipeline, template system, legacy migration, module structure, capture sources.
- `docs/IMPLEMENTATION_PLAN.md` — MVP vertical slice, phased plan, blocking decisions.
- `docs/PRD-v1-discovery.md` — archived v1 discovery brief, retained for history.

### 9.4 Other workspace projects

- `5.demo-assets-generator` — a screen-recording tool for a different purpose. **Not a reference architecture** (see §2). Its one genuinely reusable artefact is the accumulated ad/consent/noise selector list, worth porting into the capture layer.
- `2.web.iticareer.com` — a real multi-route Astro application with both public and authenticated screens; the honest test case for discovery and capture.
- `3.App.ITI_Career_Prep` — Android WebView wrapper (`ncvtonline.cits.kdhakar`) with a release APK; the test case for Android capture.

---

## 10. Explicit Constraints

Do not:

- Build any screen-recording or screencast capability
- Derive video from a recording of a live session
- Generate the promotional video with an AI video-generation engine — it is always rendered from HTML/CSS/JavaScript-based animation, driven by reusable scene templates (§4.7). Screen-recording and other systems not needed for the current capture → mockup → HTML animation → video workflow are disabled, not deleted, so they can be re-enabled later if required.
- Treat `5.demo-assets-generator` as the reference architecture
- Hard-code platform dimensions into application logic
- Embed app-specific logic in the core engine
- Require manual image or video editing for any release
- Upload to any store automatically without explicit confirmation
- Introduce dependencies where an existing one or a small amount of code suffices
- Hardcode the system around a single video design or a single template
- Allow imported templates to execute code
- Import, bundle, or execute any part of the `studio.app-mockup.com` mirror

---

## 11. Known Blocking Decisions

Detail in `docs/IMPLEMENTATION_PLAN.md` §0.

1. **Device frame sourcing and licensing** — **resolved by decision (Phase 9).** Frames are generated in-house by a parametric SVG builder (`src/devices/frame.ts`) driven by a data catalogue (`config/devices.json`, see `docs/DEVICE-FRAMES.md`) rather than sourced as licensed or third-party artwork. No frame-pack dependency, no licensing risk; a new device (including future hardware, e.g. a not-yet-released iPhone) is added as a catalogue entry.
2. **Apple App Store preview policy** — whether a stills-derived preview satisfies current review requirements, and therefore whether Apple video is in scope.
3. **Music licensing** — for background audio shipped with templates, especially if published publicly.

**Resolved:** renderer defaults to Playwright + FFmpeg rather than Remotion (no licence trigger, no new dependency, reversible behind a backend interface); TypeScript is chosen for the MCP/NPM distribution layer rather than for the renderer; Android capture feasibility is verified on this machine.

---

## 12. Development Approach

Do not implement everything at once. First prove the smallest complete flow end to end:

```
Frontend URL → Mobile viewport → One important screenshot → One mockup
   → One animated video scene → AI-generated headline/description
   → MCP invocation → Final video
```

Only once that works reliably, expand to multiple screens and mockups, full video, Android APK capture, multiple applications, multi-agent skill installation, one-click setup, and store validation.

The first implementation must prove the **actual end-to-end workflow**, not build a large platform prematurely.
