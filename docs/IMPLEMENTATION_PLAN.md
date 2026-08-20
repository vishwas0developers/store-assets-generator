# Store Assets Generator — Implementation Plan

**Companion documents:** [`PRD.md`](../PRD.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`AGENT-MCP-DISTRIBUTION.md`](./AGENT-MCP-DISTRIBUTION.md) · [`ANDROID-CAPTURE.md`](./ANDROID-CAPTURE.md) · [`AUTHENTICATION.md`](./AUTHENTICATION.md) · [`AI-PROVIDERS.md`](./AI-PROVIDERS.md) · [`architecture.mmd`](./architecture.mmd)

---

## -1. Implementation Status (verified against real runs)

Built and confirmed working end to end against `https://web.iticareer.com` on this machine — not aspirational, actually run:

| Area | Status | Verified by |
|---|---|---|
| CLI (`generate`, `mcp`, `install`, `auth set/status/test/clear`) | ✅ Working | `dist/cli/index.js` run directly |
| Discovery (sitemap-free nav crawl + prominence ranking) | ✅ Working | Real crawl of the live site |
| Web capture (Playwright, device viewport, DPR) | ✅ Working | Real PNG captures produced |
| **Auth strategy chain** (`storage-state` → `api-session` → `form`) | ✅ Fixed and working | See below — this was the concretely broken piece |
| **Error-page rejection** (HTTP ≥ 400 refused at capture, re-checked at validation) | ✅ Fixed and working | Previously a captured 404 silently reported "PASSED"; now rejected at both layers |
| Still composition (device frame + gradient + caption) | ✅ Working | Real composed PNG produced |
| Video render (Playwright frame-stepping + FFmpeg) | ✅ Fixed and working | Was crashing (browser launched/killed per frame — 150× for a 5s clip); now one browser/page reused across all frames |
| Platform spec loading (YAML) | ✅ Working | google-play spec loaded and applied |
| MCP server (tool list + handlers) | ✅ Working, now includes auth tools | `mcp/server.ts` |
| Multi-agent installer | ⚠️ Minimal | Writes 3 skills to 4 hardcoded agent paths; not yet the full `workspace-sync`-derived table from `AGENT-MCP-DISTRIBUTION.md` §2.2 |
| Android capture | ⚠️ Skeleton only | `src/android/capture.ts` exists (64 lines); not yet the hygiene/deep-link backend from `ANDROID-CAPTURE.md` |
| Template system (`.sagtpl`, scene graph interpreter) | ⚠️ Schema only | `TemplateSchema` in `project/schema.ts`; no import/export/registry yet |
| **Multi-provider AI layer — registry, discovery, key management** | ✅ Real, working | `src/ai/{registry,adapters,keystore}.ts` — provider registry seeded with 8 providers (OpenAI, OpenRouter, Groq, DeepSeek, Ollama, LM Studio, Anthropic, Gemini) across 3 adapters; live dynamic model discovery with the graceful `{error, requiresApiKey, message}` contract; per-provider AES-256-GCM key storage; custom-provider add with no code change. Wired into the Settings popup (⚙) in the web UI: Providers tab (list, add, save key, test, delete), Models tab (fetch → curate → save → set default), model selector on the Generate panel. **Not yet built:** the actual copy-generation call (chat completion) that *uses* a selected model — this pass built the provider/model management system the copy stage will consume, not the copy stage itself |
| **Local Web UI** | ✅ Real, working, and now the default startup surface | `store-assets ui` (`web/server.ts` + `web/index.html`) — loopback-only, same core (`AssetPipeline`, credential store, AI registry/adapters) the CLI/MCP use. Covers: credential set/status/clear, generate, full AI provider/model management via the Settings popup. Not yet the full workflow surface (per-step capture/copy/render/validate panels) from Phase 2.6 |
| Device frame assets | ❌ Blocked | Still the standing blocker from §0 below — `DEVICE_REGISTRY` exists but frame sourcing/licensing is unresolved |

### What was fixed this pass, and why it mattered

1. **Authentication was silently broken against the real target.** The old `capture/auth.ts` hunted for `input[type='password']` — but the target app's login modal offers Mobile Number or Google only, no password field. It filled nothing, clicked Continue, waited a bare 3 seconds, and screenshotted the still-open modal. Confirmed with `output/final-test/raw/screen_1.png` (login modal over a blurred dashboard).

   **Fix:** rebuilt as a strategy chain (`src/auth/`) generalizing the proven `5.demo-assets-generator` approach — `storage-state` (cached session, tried first) → `api-session` (preflight + login endpoint + session injection, config-driven via `apps/<slug>/auth.json`) → `form` (now correctly **declines** when no password field exists, instead of blind-filling the wrong one). Every non-cached path is followed by a `verify()` assertion — authenticated marker present *and* login gate absent — never a bare timeout. Credentials live in an AES-256-GCM encrypted store (`src/auth/credentials.ts`) with env-var override, managed via `store-assets auth set/status/test/clear` and MCP's `get_auth_status`/`set_auth_credentials`/`clear_auth_session`.

2. **The video renderer crashed on every real run.** It launched and tore down a full Chromium instance per frame — 150 times for a 5-second clip — and the rapid launch/kill cycle was producing `Page.captureScreenshot: Unable to capture screenshot` protocol errors. Fixed to launch one browser/page and reuse it across all frames. Verified: a real 5-second, 157KB MP4 now renders successfully.

3. **A captured error page was reported as a passing asset.** The validator never checked HTTP status, so a 404 capture (confirmed live — the target site is currently returning nginx 404s workspace-wide, an external/deployment issue, not a bug here) sailed through as `"status": "PASSED"`. Fixed at the root: `capture/browser.ts` now refuses to save a ≥400 response (`Navigation returned HTTP 404 — refusing to capture an error page`), and the validator independently re-checks any `httpStatus` recorded in `project.json` as defense in depth.

### Fixed in a follow-up pass: `start.bat` launched the CLI, not the web interface

Root cause: there was no web interface to launch. `web/index.html` + `web/server.ts` are new — a plain Node `http` server (no framework dependency added), loopback-only, serving a single-page UI and a small REST API (`/api/auth/status`, `/api/auth/credentials`, `/api/generate`) backed directly by the same `AssetPipeline` and credential store the CLI and MCP server call. `store-assets ui` starts it and opens the browser; `npm run build` now copies `web/index.html` into `dist/web/` since `tsc` only compiles `.ts`.

`start.bat` now: checks Node is on `PATH`, builds if `dist/cli/index.js` or `dist/web/index.html` is missing (reporting the actual `npm run build` failure if it fails, not a generic message), then runs `store-assets ui` and surfaces its real exit behavior — a port conflict prints `Port 8787 is already in use. Set SAG_UI_PORT to a different port and try again.` rather than the process dying silently. The CLI (`generate`, `mcp`) and MCP server are unaffected and still invoked directly, per their own commands — `ui` is just the new default in `start.bat`.

Verified: server starts and serves real HTTP 200s (`/`, `/api/health`), the credential save/status/clear cycle works end-to-end through the HTTP API, and the port-conflict path produces the exact actionable message above with exit code 1.

**Note:** validating `start.bat` itself hit an unrelated environment issue on this dev machine — `cmd.exe`'s `node` resolves through an nvm-windows (`nvm4w`) shim that prompted for first-run interactive setup and blocked. Confirmed independently that the server, build, and error-handling logic all work correctly once that shim is bypassed. If `start.bat` appears to hang with no output on a machine using nvm-windows, that's the shim's own first-run prompt, not this script — run `nvm4w` setup (or `node -v` once) directly first.

### Fixed in a second follow-up pass: `setup.bat` crashed with no visible syntax error

Reported symptom matched exactly: the window closed/errored with no readable cause. Root-caused by testing under real `cmd.exe` (not Git Bash, which had been masking this the whole time — `npm run build` "worked" every time it was tested via Bash because Git Bash doesn't route through `cmd.exe`'s batch parser at all):

1. **The actual crash**: `cmd.exe`'s `"and was unexpected at this time."` — caused by a literal `(v20+)` inside an `echo` string that was itself already inside a parenthesized `if (...)` block. `cmd.exe` counts parentheses even inside `echo` text when nested inside a compound statement, so the unescaped `(` `)` broke the parser. Fixed by rewording and, everywhere else parens appear inside a block echo, escaping them as `^(` `^)`.
2. **A second, larger bug surfaced once the first was fixed**: `setup.bat` and `start.bat` had been saved with **Unix LF-only line endings**, not Windows CRLF. `cmd.exe` is picky about this and misparses batch files inconsistently when line endings aren't CRLF — manifesting as bizarre, non-deterministic fragments (`'al' is not recognized`, `'tarting' is not recognized`, etc., from `setlocal`/`Starting`/`echo`/`pause` having their leading characters silently eaten). This is why the crash showed no coherent syntax error: the parser wasn't failing cleanly, it was corrupting itself. Fixed by normalizing both files to pure CRLF. There was also stray non-ASCII (`—` em-dashes) in a few echo lines, replaced with plain ASCII `-` to remove any codepage risk.
3. **A working-directory bug**, found while testing: `cmd /c "C:\full\path\to\script.bat"` does **not** set the working directory to the script's own folder — only an Explorer double-click does that automatically. Any other invocation (a shortcut with a different "Start in" folder, a scheduled task, running it from another directory) would `npm install` into the wrong folder. Fixed by adding `cd /d "%~dp0"` as the second line of both scripts, so they're correct regardless of how or from where they're launched.

All three fixes were verified with real, non-mocked runs of the actual `.bat` files under `cmd.exe` (not just typechecking the underlying TypeScript) — `setup.bat` now completes end-to-end (npm install → Playwright browser install → build → skill install) with exit code 0, and `start.bat` starts the server and answers `GET /api/health` with `200 {"ok":true}`.

**Takeaway for future edits to these files:** always verify `.bat` changes with a real `cmd.exe` run, not just Git Bash/`sh` — the two have meaningfully different parsers, and Bash was silently passing scripts that were broken on native Windows.

### Deliberately not built this pass, and why

The full scope in `PRD.md`/`ARCHITECTURE.md`/`AI-PROVIDERS.md` is a multi-week system: multi-provider AI with dynamic model discovery, a full local web UI serving as a true third client of the core service layer, the `.sagtpl` template package format and scene-graph interpreter, the complete `workspace-sync`-derived multi-agent installer, and the Android capture backend with hygiene/deep-linking.

Building all of those shallowly in one pass would mean generic, mostly-untested stubs across the board. Instead this pass fixed the two pieces that were concretely broken and demonstrated as broken (auth, video render) and closed the one correctness gap they exposed (error-page validation) — because a vertical slice that silently mis-captures and silently mis-validates is not a foundation worth building the rest on top of. The phased plan below is unchanged; treat the table above as "done" markers against it, not a replacement for it.

---

---

## 0. Before Any Code — Blocking Decisions

Three questions gate real work. Resolve them first.

| # | Decision | Blocks | Why it is blocking |
|---|---|---|---|
| 1 | **Device frame sourcing + licensing** | Everything visual | There are no frame assets anywhere in the project. The legacy mirror captured none — they were served from `media.app-mockup.com` and are third-party proprietary. Without frames there is no mockup, and without mockups there are no store screenshots and no video. Options: licence a commercial pack, adopt an appropriately licensed open set, or author SVG frames in-house. **Highest priority — blocks the MVP itself.** |
| 2 | **Apple App Store preview policy** | Apple video scope | Apple has historically expected previews to reflect actual in-app experience. If a stills-derived preview does not satisfy review, Apple video is out of scope and only Google Play video ships. |
| 3 | **Music licensing** | Video audio | BGM shipped inside template packages needs a clear licence — more so if the package is published publicly. |

**Resolved since the previous draft:**

- **Renderer** — default to **Playwright + FFmpeg** rather than Remotion (`ARCHITECTURE.md` §3.2). Removes the licensing blocker, adds no dependency, and stays reversible behind a `RenderBackend` interface. Confirm Remotion licence terms before Phase 5 only if the team wants it as an opt-in backend.
- **Language** — TypeScript, now justified by the MCP/NPM/multi-agent distribution layer rather than by the renderer (`ARCHITECTURE.md` §3.1).
- **Android capture feasibility** — verified working on this machine (adb 1.0.41, `ANDROID_HOME` set, device attached, target app installed). See [`ANDROID-CAPTURE.md`](./ANDROID-CAPTURE.md).

---

## 0.5 MVP First — the Vertical Slice

Before any phased build-out, prove the **smallest complete end-to-end flow**:

```
Frontend URL
  → mobile viewport
  → ONE important screenshot
  → ONE mockup
  → ONE animated video scene
  → AI-generated headline/description
  → MCP invocation
  → final video
```

Everything in that chain is one item deep, but **no link is skipped** — including MCP and agent-written copy. That is the point: the risk in this project is not building many screens, it is whether the agent → MCP → deterministic-render chain works at all.

**Target for the slice:** `https://web.iticareer.com`, one screen, one device profile, one template, one scene.

**Exit criteria:** an agent, given only the skill and the MCP server, produces a short video with accurate copy about a real feature of a real app, without a human touching a file.

Only once that holds does the phased expansion below begin. Everything after the MVP is widening a proven pipe rather than discovering whether it exists.

---

## 1. Sequencing Principle

The plan is ordered so that **each phase produces something verifiable on its own**, and so that the riskiest unknowns are hit early rather than discovered in Phase 6.

The specific ordering choice worth calling out: **capture before rendering**. It is tempting to start with templates and video because that is the visible, exciting part. But rendering depends on real screenshots to look right, and screenshot quality problems (blank captures, consent banners, half-loaded pages) are the ones that silently poison everything downstream. Getting clean captures out of a real app first means every later phase is validated against real material.

The second ordering choice: **the Project Document lands in Phase 2, not late**. It is the seam between the automated half and the rendering half. Introducing it early means Phases 3–6 all consume a stable contract rather than being refactored onto one later.

---

## Phase 0 — Foundation

**Goal:** a runnable skeleton with the contracts defined.

- Initialize Node 22 + TypeScript project, strict mode, ESLint/Prettier.
- Install and pin: Playwright, Zod, YAML parser, zip library. Defer Remotion until decision 2 resolves.
- `src/cli.ts` with `generate | render | validate | template` subcommands, all stubbed.
- Define and commit the three core schemas as types + Zod validators, with no implementation behind them yet:
  - `PlatformSpec`
  - `ProjectDocument`
  - `Template` (`template.json`)
- Repository conventions: `output/`, `templates/`, `apps/` gitignored appropriately; secrets never committed.

**Exit criteria:** `store-assets --help` runs; all three schemas parse a hand-written fixture; CI/lint green.

**Verification:** a fixture project document and a fixture template validate successfully, and a deliberately malformed one fails with a useful path-scoped error.

---

## Phase 1 — Platform Specification Engine

**Goal:** the rules layer, as data, before anything depends on it.

- Author `src/platform/specs/google-play.yaml` and `apple-app-store.yaml`.
- **Research current store requirements at this point and write the real values in** — dimensions, aspect ratios, formats, file-size caps, count minimums/maximums, per-device-class variants (phone / 7" tablet / 10" tablet; iPhone display classes / iPad), and video constraints (resolution, duration bounds, codec, container).
- Schema-validate specs at load; record a `specVersion` for the report.
- `store-assets platform show <id>` prints the resolved spec.

**Exit criteria:** both platforms resolve; changing a dimension is a one-line YAML edit with no code change.

**Verification:** a unit test asserts a spec edit changes resolved output without touching TypeScript — this is the PRD's "no hard-coding" requirement made testable.

> Resolve blocking decisions 1 and 2 during this phase.

---

## Phase 2 — Discovery, Capture, and the Project Document

**Goal:** URL in, clean screenshots and a Project Document out. This is the automation half, complete.

### 2a — Discovery
- `sitemap.xml` parsing.
- Playwright-based nav crawl: `<nav>`, header/footer menus, primary CTAs, internal anchors.
- Prominence ranking: nav placement, cross-page link frequency, heading semantics, path depth.
- Deny-list for legal/utility routes (privacy, terms, refund, 404, login).
- Auth-gated route detection.
- Config override support: pin, exclude, reorder, rename.

### 2b — Capture
- Browser lifecycle, one context per device profile, bounded-concurrency page pool.
- Noise suppression: port the accumulated selector knowledge from `5.demo-assets-generator/app/services/ad_block.py` — this is the one genuinely valuable artefact from that project — plus generic heuristics for consent banners, notification prompts, and chat widgets.
- Readiness gate: network idle **plus** content assertion. No bare timeouts.
- Blank/near-blank/error detection with reject-and-retry.
- Capture at DPR 3.
- Optional credentials: encrypted at rest, session injection, skipped-screen reporting when absent.

### 2c — Project Assembly
- Branding derivation: logo from favicon / `og:image` / web manifest icons; palette from dominant capture colours.
- Feature text derivation from page headings.
- Bind screens to devices and layouts; resolve template slots.
- Emit `project.json`.

**Exit criteria:** `store-assets generate --url <real app> --platform google-play --stage capture` produces clean, non-blank screenshots of a real application plus a valid Project Document.

**Verification:** run against `https://web.iticareer.com` (a real multi-route Astro app with both public and auth-gated screens — an honest test case). Manually inspect every capture for banners, loading states, and blank frames. This manual review is the gate; automated blank-detection is not sufficient proof at this stage.

**Risk note:** this phase has no legacy prior art. Expect discovery ranking to need tuning against real sites, and expect noise suppression to be an ongoing accumulation rather than a one-time task.

---

## Phase 3 — Device Frames and Still Composition

**Goal:** screenshots inside realistic device mockups, at platform-correct dimensions.

*Depends on blocking decisions 1 and 2.*

- Device registry: port the legacy catalogue's taxonomy and naming convention (`vendor-model-colourway`), then **extend it with current devices** — the legacy set stops at iPhone 11 / Pixel 4 / Galaxy S10 and every device since is missing.
- SVG frames plus per-frame `geometry.json`: screen inset rect, corner radii, notch/dynamic-island cutout path.
- Frame style axis (`default`, `clay`) and colourway (`light`, `dark`), following the legacy model.
- Masking: composite the screenshot into the screen aperture, respecting radii and cutouts.
- Remotion `renderStill` driver.
- Layout primitives from the legacy preset set: `caption-above`, `caption-below`, `left-caption-above/below`, `right-caption-above/below`, `rotated-left-1/2`, `rotated-right-1/2`, `all-devices-column`.
- Background layer: solid / gradient / image, with a named gradient preset library.
- Panoramic layer (a single wide background spanning a screenshot set).
- Support N devices per scene.

**Exit criteria:** platform-correct store screenshots generated from Phase 2 captures, visually comparable to what the legacy studio produced by hand.

**Verification:** side-by-side comparison against a manually composed reference. Assert output dimensions match `PlatformSpec` exactly.

---

## Phase 4 — Template System

**Goal:** the design becomes portable, editable data rather than embedded behaviour.

- Finalize the `template.json` Zod schema (§4.3 of the architecture).
- Scene graph interpreter: layer primitives → Remotion components; slot resolution (`{{item}}`, `{{palette.primary}}`); `repeatFor` expansion.
- `.sagtpl` package format: ZIP with manifest, previews, and bundled assets.
- Registry resolution: builtin → user → imported.
- Security boundary — treat imported templates as untrusted: schema validation, asset paths confined to package root (no traversal), no code execution, `engineVersion` compatibility check.
- `migrate.ts` with a real migration path from day one, not retrofitted.
- Lifecycle commands: `template list | import | export | new | validate | preview`.
- Author 2–3 built-in templates covering distinct visual styles, as declarative documents through the same path a user would take — this is what proves the schema is genuinely expressive rather than shaped around one design.

**Exit criteria:** a template exports on one machine, imports on another, and renders identically. Switching template regenerates visibly different output from identical captures with no code change.

**Verification:** round-trip test (export → import → render → byte-compare). A malicious fixture with `../` asset paths is rejected. A template with an incompatible `engineVersion` fails clearly rather than rendering wrongly.

**Note:** still output only in this phase. The timeline section of the schema is defined but not yet interpreted — this keeps the schema honest by forcing it to be designed for both outputs before either is finished.

---

## Phase 5 — Video Generation

**Goal:** production-ready promotional video, synthesised from stills.

*Depends on blocking decisions 2, 3, and 4.*

- Timeline interpretation: `fps`, scenes, `durationInFrames`, `repeatFor`.
- Animation drivers: `interpolate` and `spring` against frame number.
- Animatable properties: `translateX/Y`, `scale`/`scaleX/Y`, `rotate`, `rotate3d.x/y/z`, `opacity`, `blur`, `flip`.
- `camera` layer for zoom and pan moves.
- Scene structure: intro → per-screenshot feature scenes → outro/CTA.
- Device entrance/exit choreography and 3D rotation.
- Text overlays and feature callouts.
- Audio: track mixing, fade in/out.
- Duration clamping to platform bounds.
- Encode to the platform's required codec/container via FFmpeg.
- Parallel frame rendering.

**Exit criteria:** a promotional video generated end-to-end from a URL, meeting the platform video specification, that a reviewer would accept as professionally produced.

**Verification:** human review is the real gate here — automated checks cannot judge whether a video looks professional. Automated checks confirm the specification is met; a person confirms it is good.

**Risk note:** the largest net-new surface in the project, with no legacy prior art. Budget accordingly, and expect the animation vocabulary to need extension once real templates are authored against it.

---

## Phase 6 — Validation, Reporting, and Packaging

**Goal:** nothing ships unverified.

- Image validation: dimensions, aspect ratio, format, byte size, blank/near-blank detection, loading-state detection, crop sanity.
- Video validation via FFprobe: resolution, aspect ratio, duration bounds, codec, container, audio stream presence, file size, black-frame sampling.
- `report.json` plus a human-readable summary; every failure names the specific rule violated.
- Versioned output packaging: `output/<app>/<platform>/<version>/` with `raw/`, `store/`, `video/`, `project.json`, `report.json`.
- Record tool version, template id + version, and `specVersion` in the report for reproducibility.

**Exit criteria:** a full run ends with a pass/fail report per asset; a deliberately broken asset is caught and named.

**Verification:** inject known-bad assets (wrong dimensions, blank frame, over-length video) and assert each is caught with the correct rule cited.

---

## Phase 7 — Multi-App Hardening

**Goal:** prove the tool is a product, not a one-app script.

- Run against at least three structurally different applications.
- Per-app config overrides in `apps/<slug>/config.yaml`.
- Raw-capture caching keyed by URL + device profile, so changing template or platform skips Phases 2's work entirely — this is what makes template iteration fast.
- `store-assets render --project <file>` to re-render from an edited Project Document without re-capturing.
- Documentation: README, template authoring guide, troubleshooting.

**Exit criteria:** a developer unfamiliar with the internals generates a validated asset package for a new app from the README alone.

---

## Phase 2.5 — Authentication (urgent — blocks useful capture today)

**Goal:** capture authenticated UI, not login modals. Detail in [`AUTHENTICATION.md`](./AUTHENTICATION.md).

The current `src/capture/auth.ts` fails against the real app because it looks for a password field the app does not have (login is OTP-by-phone or Google). `output/final-test/raw/screen_1.png` is the evidence: a login modal over a blurred dashboard.

- Pluggable strategies: `storage-state` (tried first) → `api-session` (default) → `form` → `manual`.
- **Replace `waitForTimeout(3000)` with a `verify` assertion** — authenticated marker present, login gate absent. Highest-value single change: turns a silent wrong screenshot into a loud, actionable failure.
- Port the five non-obvious details from `5.demo-assets-generator`: status preflight, **fixed device id on both sides**, `X-App-Code`, init-script injection, top-frame guard.
- Typed result reporting which stage failed (preflight / login / injection / verification).
- Encrypted credential store (AES-256-GCM), env-var layer, `auth set|status|test|clear`.
- Session persistence via `storageState`.

**Exit criteria:** `store-assets auth test` passes, and a capture of `/course-dashboard` shows the dashboard, not a modal.

---

## Phase 2.6 — Local Web UI (full manual workflow)

**Goal:** everything an agent can do via MCP, a person can do by hand. This is the primary testing and debugging surface, not a settings page.

**Architecture rule:** the UI is a client of the same local HTTP API that CLI and MCP call. One core, three adapters — no separate implementation, no logic that exists in only one surface.

- Loopback-only server (`store-assets ui`).
- **Workflow panel:** enter an app URL → discover screens → select which to capture → capture (with live preview) → generate copy → edit copy inline → pick template → render scene / full video → validate → package. Each step independently runnable and re-runnable.
- **Inspect panel:** view raw captures, Project Document JSON (editable), validation report, run logs.
- **Credentials panel:** email editable, password masked (blank = keep existing), live access-status badge with expiry countdown, test-connection.
- **AI panel:** provider / base URL / model / key / vision, test connection, prompt editor with preview.
- Endpoints never return a password or API key value.

**Exit criteria:** a full asset package can be produced start to finish through the UI alone, with no CLI and no agent. Rotating a demo password takes under a minute with no file edits.

**Verification:** run the same job through UI, CLI, and MCP; assert identical output. Any divergence means logic leaked into an adapter.

---

## Phase 4.4 — Multi-Provider AI Layer

**Goal:** the tool generates its own titles and copy, using any configured provider/model. Detail in [`AI-PROVIDERS.md`](./AI-PROVIDERS.md); patterns from `ocr_for_documents`.

- Three adapters: one OpenAI-compatible HTTP client (OpenAI/OpenRouter/Groq/DeepSeek/Together/Ollama/LM Studio) + Anthropic + Gemini. No per-provider SDKs, no LangChain.
- **Provider registry** (`config/providers.json`) seeded with default endpoints, keys empty — adding an OpenAI-compatible provider is a config entry, not code.
- **Model inventory** (`config/models.json`), unique on `(provider, modelId)`, with vision flags and display names.
- **Dynamic model discovery** per provider, with the reference's graceful contract: missing key → `{ requiresApiKey, message }`, never an exception.
- **Per-task model bindings** (analyze-screen / feature-copy / video-title / scene-narrative / review-asset) with a global default and per-call override from UI, CLI, and MCP. `requiresVision` enforced at selection time.
- Prompts as editable shipped assets with user override; grounding rule baked in.
- Keys in the AES-256-GCM store, env vars (`SAG_AI_KEY_<PROVIDER>`) taking precedence.
- Output persisted into the Project Document; **re-render never re-generates**.
- Failover to default model with the substitution recorded; per-run diagnostics (resolved prompt + raw response).

**Exit criteria:** two different providers are configured and either can generate the same asset; `store-assets generate --url X` yields accurate copy and a title with no agent; re-rendering the saved document works offline.

**Verification:** disable the bound provider mid-run and assert failover is recorded, not silent.

---

## Phase 4.5 — MCP Server and Agent Integration

**Goal:** the agent can drive the system. Runs alongside Phase 4, not after it.

- MCP stdio server (`store-assets mcp`) using `@modelcontextprotocol/sdk`, Zod-typed tools.
- Tool surface per `AGENT-MCP-DISTRIBUTION.md` §5.2 — inspection, capture, composition, video, project/output.
- **Granular regeneration** (`update_scene`, `preview_asset`) implemented from the start, not bolted on. The agent's iterate loop is unusable without it.
- `set_screen_copy` writes agent-authored text into the Project Document. **No LLM inside the engine.**
- Skills authored as string constants: overview, inspect-project, select-screens, capture, write-copy, compose, video, validate-iterate.
- Multi-agent installer modelled on `workspace-sync`: per-agent skill directories, per-agent MCP config paths, skills-only agents, `.store-assets-version` stamp, content-hash drift detection, deprecated-skill cleanup.
- `setup`, `install [agent]`, `doctor`, `update` commands.

**Exit criteria:** on a clean machine, `npm install -g` → `setup` → `install claude` yields a working agent that can generate assets end-to-end.

**Verification:** install on a second machine and run the MVP slice there. Assert no absolute paths appear in any installed skill file — this is the portability requirement made testable.

---

## Phase 6.5 — Android Capture Backend

**Goal:** the secondary capture source, behind the existing interface.

*Deliberately placed after web capture, composition, templates, and video are proven. Android is an extension of a working system, never a prerequisite.*

- `AndroidCaptureBackend` implementing the same `CaptureSource` interface as the web backend.
- Device/emulator enumeration; AVD launch at a configured resolution.
- APK install and app launch.
- Deep-link navigation as the primary strategy; UI Automator taps only where unavoidable; no Appium.
- Device hygiene with **guaranteed restore**.
- `capture_android_screen` and `list_android_devices` MCP tools.
- Per-app Android configuration block, including a `reason` per Android-captured screen.

**Exit criteria:** a native screen unreachable from the frontend (splash, billing sheet) is captured and flows through the identical downstream pipeline.

**Verification:** run against the connected device and the installed `ncvtonline.cits.kdhakar` app. Confirm device settings are restored afterwards. Confirm downstream stages cannot tell which backend produced a PNG.

---

## Phase 7.5 — Optional Real-Flow Video Section

**Goal:** the short, secondary screen-recording tail described in the requirements.

- `adb shell screenrecord` (or Playwright trace) for a brief real-flow clip.
- Tap/click visual effects.
- Appended as a final scene in the template timeline, clearly bounded in duration.

**Scope guard:** this is a *closing section* of a mockup-based video, never the primary source. If it starts growing, it has drifted from the product definition.

---

## Phase 8 — Deferred Scope

Explicitly **not** in the initial release. Listed so the architecture accommodates them without being built prematurely:

| Item | Notes |
|---|---|
| **Visual template editor** | Local web UI reading/writing the same schema — the legacy studio's role, modernized. Deferred until the schema is proven by real templates. |
| **Localization** | Per-locale screenshot sets. The `locale` axis is reserved in the Project Document so this is not a re-architecture. |
| **Store upload** | Must stay strictly separate from generation, require explicit confirmation, and never publish automatically. |
| **CI/CD integration** | Only after the local workflow is reliable. |
| **Shared template registry** | Internal distribution for cross-project reuse. |

---

## 2. Legacy Retirement

`studio.app-mockup.com/` is reference-only throughout. It is never imported, bundled, or executed.

**Retirement criteria** — delete the folder once every concept in `ARCHITECTURE.md` §2.2 marked *Adopt* is implemented and verified:

- Phase 3 covers concepts 3, 4, 5, 6, 7, 8, 16
- Phase 4 covers concepts 1, 2, 10, 11, 12, 14, 15
- Phase 5 covers concept 9 (transforms, extended with a time axis)
- Concept 13 (localization) is reserved, not implemented — its retirement condition is that the `locale` axis exists in the Project Document schema

Concepts 17, 18, and 19 are explicitly replaced or discarded and need no migration.

Do not delete earlier: §2.2 was reconstructed from strings in a minified bundle, not read from source, so the mirror remains the only artefact that can settle a question about legacy behaviour until the replacement is proven.

---

## 3. Effort Shape

Relative sizing rather than calendar estimates, since the blocking decisions materially change scope:

| Phase | Relative size | Risk | Prior art |
|---|---|---|---|
| **MVP vertical slice** | **M** | **High** | — |
| 0 — Foundation | S | Low | workspace-sync package shape |
| 1 — Platform specs | S | Low | None, but well-understood |
| 2 — Discovery + capture + project | **L** | **High** | None |
| 3 — Frames + still composition | **L** | **High** (asset-blocked) | Legacy design model |
| 4 — Template system | **L** | Medium | Legacy JSON/ZIP model |
| 4.5 — MCP + agent integration | **L** | Medium | **workspace-sync (strong)** |
| 5 — Video generation | **XL** | **High** | None |
| 6 — Validation + packaging | M | Low | — |
| 6.5 — Android capture | M | Medium | adb verified working |
| 7 — Multi-app hardening | M | Medium | — |
| 7.5 — Real-flow video tail | S | Low | — |

The honest shape: the legacy studio contributes a strong *design* model, `workspace-sync` contributes a strong *distribution* model, and neither contributes anything toward automated capture or video generation — which remain the two largest and riskiest pieces.

---

## 4. Open Questions

Carried from `ARCHITECTURE.md` §9, restated as things needing an owner and an answer:

1. Device frame sourcing and licensing — **blocking, highest priority**.
2. Remotion licence eligibility — **blocking**.
3. Apple App Store preview policy for stills-derived video.
4. Music licensing for bundled BGM.
5. Is URL-only navigation sufficient for v1, or are config-defined interaction steps needed to reach valuable screens (mid-exam, post-payment)?
6. Is hand-edited `template.json` acceptable for v1, with the visual editor deferred?
7. When does localization become real work rather than a reserved axis?
8. Local template files only, or a shared internal registry?
