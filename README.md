# Store Assets Generator

> A desktop studio (Electron + a local Node web server) for producing App Store / Google Play listing assets — captured screenshots, device-framed mockups, and promotional videos — from one place.

## What does Store Assets Generator do?

Shipping a mobile app means producing a pile of store assets: correctly-sized screenshots, marketing mockups with real device frames, and a short promo video. Doing it by hand across Figma, screen recorders and video editors is slow and hard to keep consistent between releases.

Store Assets Generator keeps all of it in one local application. You create an **Application** (name, category, starting URL, target store), capture screens from a live browser session or a connected Android device, lay them out in **Mockup Studio** using ready-made templates and device frames, and render a promo video in **Video Studio** from animated templates. Everything runs on your machine; nothing is uploaded anywhere except calls you explicitly configure to an AI provider.

If you find this project useful, consider giving it a ⭐ on GitHub!

---

## ✨ Key Features

| Area | What it does |
| :--- | :--- |
| **Applications** | Create and manage apps (name, category, starting URL, Play Store / App Store target). Each app owns its captures, mockups, videos, uploads and exports under `output/applications/<id>/`. |
| **Screen Capture** | Drive a live Chromium session (Playwright) or an Android device (scrcpy/adb) from the UI, take screenshots, record the screen, and optionally log in with saved demo-account credentials. |
| **Mockup Studio** | Fabric.js canvas editor with 16 template categories, layered objects, z-order, selection/rotation handles, two-page (paired) artboards, zoom/pan/hand tool, page multi-select, and ZIP export sized to store targets. |
| **Video Studio** | Scene-based promo videos from HTML templates, per-scene device swapping, per-scene Scene Transitions, backgrounds, background music, export presets (MP4/WebM), Three.js 3D device rendering. |
| **Device library** | 16 devices (11 phones, 5 tablets) with generated 2D SVG frames and 3D GLB models, plus 5 CSS-built device styles extracted from video templates. |
| **AI providers** | Optional OpenAI-compatible provider registry (`config/providers.json`) with an encrypted local key store. |
| **Toolchain manager** | Detects and manages `scrcpy`, `adb` and `ffmpeg` (bundled in `vendor/bin`, a custom directory, or `PATH`). |

---

## 📋 Requirements

| Component | Required Version | Verification Command |
| :--- | :--- | :--- |
| **Node.js** | `20+` | `node --version` |
| **npm** | `9+` | `npm --version` |
| **Windows** | 10 / 11 (x64) for the packaged installer | — |

> [!NOTE]
> `npm install` runs a `postinstall` step that downloads Playwright's Chromium (`playwright install chromium`). Screen capture and video/mockup rendering use it. The installer **does not bundle Chromium**: on a machine that only ran the installed app, install it once with `npx playwright install chromium` or the first capture/render will fail.

`scrcpy`, `adb` and `ffmpeg` binaries are expected in `vendor/bin/` (git-ignored). The app's toolchain panel can point at an existing install or download them.

---

## ⚡ Quick Setup Guide

```bash
git clone https://github.com/vishwas0developers/store-assets-generator.git
cd store-assets-generator
```

**Windows (recommended):** run `setup.bat` once. It checks Node.js, runs `npm install`, installs Playwright Chromium, and compiles the project. Afterwards use `start.bat` to launch.

**macOS / Linux:** `setup.sh` and `start.sh` provide the same flow (the packaged installer is Windows-only).

**Manual equivalent:**

```bash
npm install          # also installs Playwright Chromium
npm run build        # tsc -> dist/
npm start            # electron .
```

---

## 🛠️ Development Workflow

The app runs the **compiled** code in `dist/`, not the TypeScript sources. After editing anything in `src/` or `web/server.ts`, rebuild (`npm run build`) — `start.bat` does this automatically, and `main.js` logs a warning if `dist/` is older than the sources.

| What you edit | What you need to do |
| :--- | :--- |
| `src/**/*.ts`, `web/server.ts` | `npm run build`, restart the app |
| `web/js/*.js`, `web/app.css`, `web/index.html` | Nothing to rebuild — served statically (hard-refresh if the browser looks stale; the server sends `Cache-Control: no-cache`) |
| `templates/**`, `devices/**` | Read from disk at runtime; restart if a registry is cached |

You can also run the web server without Electron by importing `startWebServer` from `dist/web/server.js` and opening `http://127.0.0.1:8787` in a browser.

### Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run build` | Compile TypeScript (`tsc`) into `dist/` |
| `npm start` | Launch Electron against the working tree |
| `npm run devices:export` | Regenerate `devices/2d/*.svg` and `devices/3d/*.glb` from `devices/catalogue.json` |
| `npm run test:video` | Build and run the video render test |
| `npm run package:win` | Build and package the NSIS installer without bumping the version |

---

## 📦 Building the Installer

```bat
build.bat
```

`build.bat` performs, in order: prerequisite check → **version bump** → `npm install` → `npm run build` → `electron-builder --win nsis --x64`. The installer lands in `dist/`.

### Versioning

`package.json` `version` is the **single source of truth** (`MAJOR.MINOR.PATCH`). Each run of `build.bat` executes `npm version patch --no-git-tag-version`, which updates `package.json` and `package-lock.json` together (`1.0.0 → 1.0.1 → … → 1.0.9 → 1.0.10`). electron-builder reads that same field for the installer name, executable metadata and Add/Remove Programs entry — there is no second version to keep in sync. `package.json` therefore always holds the version of the **last build**.

Releases: bump `MINOR`/`MAJOR` manually (`npm version minor --no-git-tag-version`) when you want to, tag the commit `vX.Y.Z`, and build the release artifact with `npm run package:win` (which does not bump).

### What gets packaged

The app is packaged with `asar: false`, so templates, devices and output folders are real directories on disk (the backend reads and writes them relative to the working directory, and `main.js` sets `process.chdir` to the app folder at launch). Included: `main.js`, `preload.cjs`, `dist/`, `web/`, `devices/`, `templates/`, `assets/`, `config/`, `fonts/`, `vendor/`, `src/platform/specs/`, `build/` (icon + splash), plus `three/examples` (electron-builder strips `examples/` folders by default; it is re-added through `extraResources`).

The NSIS installer closes any running copy before replacing files, so reinstalling over an existing install updates it in place. The installer is per-user by default (`%LOCALAPPDATA%\Programs\store-assets-generator`), which keeps `output/` and `logs/` writable.

### Startup lifecycle

1. `main.js` shows `build/splash.html` immediately.
2. It imports `dist/web/server.js` and starts the server on `127.0.0.1:8787`. If 8787 is held by a stale copy of this app, that copy is ended; if another program owns it, the app falls back to a free port. Other programs are never killed.
3. The main window is created hidden and shown only after the page has loaded; the splash then closes.
4. Any startup failure produces an error dialog pointing at `logs/app.log` instead of a blank window.

A second launch focuses the existing window (single-instance lock).

### Icon

`build/icon.svg` is the single branding source. `node scripts/icons/build-icons.mjs` renders `build/icon.png` and a multi-size `build/icon.ico` from it. The same files serve the executable, installer, uninstaller, window/taskbar and splash.

---

## 🏗️ Architecture Overview

```
Electron main (main.js)
   ├─ splash window (build/splash.html)
   ├─ starts web/server.ts  ──  plain Node http server + WebSocket (Android live mirroring)
   └─ main window  ──►  http://127.0.0.1:8787  (web/index.html + web/js/*.js)

Server API (/api/*) ──► src/
   application/  mockup/  video/  devices/  capture/  android/  auth/  ai/  platform/  render/  toolchain/  templates/
```

- **Frontend** (`web/`): framework-free ES modules. `main.js` bootstraps; `canvas.js`/`matrix.js`/`editor.js`/`state.js` form Mockup Studio; `video.js` is Video Studio; `capture.js` is Screen Capture; `applications.js` manages apps.
- **Backend** (`web/server.ts`, `src/`): TypeScript compiled to `dist/`. The server serves the frontend and a JSON API; rendering uses Playwright (Chromium) to rasterise HTML, and Three.js (bridged into the page) for 3D devices.
- **Preload** (`preload.cjs`): exposes a small allow-listed `window.electronNative` (save dialogs, show-in-folder, etc.).
- **Persistence**: plain files. Applications live in `output/applications/<id>/` (`captures/`, `mockup/`, `video/`, `uploads/`, `exports/`).

A full diagram is in [docs/architecture/store-assets-generator.architecture.html](docs/architecture/store-assets-generator.architecture.html).

---

## 🎨 Mockup Studio

- **Templates** live in `templates/mockup/<category>/<template>.json` across 16 categories (books, business, education, entertainment, fintech, food-and-drink, health-and-fitness, modern, music, photo-and-video, productivity, professional, shopping-and-e-commerce, social-networking, travel-and-local, utilities). Loaded by `src/mockup/template-loader.ts` and `src/mockup/templates.ts`.
- **Editor**: Fabric.js v7. Layers with a z-order engine, per-page selection, rotation via corner handles, zoom/pan with a hand tool, and a "matrix" preview grid of all pages. Two-page pairs are shown together.
- **Export**: `src/mockup/export.ts` renders every device row at its target size (`sizeTargets.ts`) and zips the set. The rows you build in the editor are the export targets.
- **Store specs**: `src/platform/specs/google-play.yaml` and `apple-app-store.yaml` define required sizes and screenshot counts.

**Fabric.js v7 trap:** every object defaults `originX`/`originY` to `'center'`. Set them explicitly at each construction site, and style controls per instance (see `CONTROL_STYLE` / `applyCornerRotationControls` in `web/js/canvas.js`) — prototype patches silently do nothing because v7 classes merge defaults inside the constructor.

---

## 🎬 Video Studio

- **Templates** are flat HTML files in `templates/video/<id>.html` (device-specific portrait/landscape templates plus several full designs). Registered in `src/video/templates.ts` / `templateConfig.ts`.
- **Scenes** (`src/video/application.ts`) hold slot content (screens, text), a device, and a Scene Transition.
- **Scene Transitions**: `cut`, `fade` (from black), `fade-white`, `slide`, `slide-right`, `slide-up`, `wipe`, `wipe-down`, `zoom`. Each scene is rendered as its own document, so a transition is an entry overlay covering the incoming scene (`transitionFrames` in `src/video/render.ts`).
- **Backgrounds**: `src/video/templateBackgrounds.ts` exposes template backgrounds as selectable `template:<id>` references.
- **Audio**: `src/video/bgm.ts` (cached under `output/.bgm/`).
- **Export presets** (`src/video/exportPresets.ts`): App Store/Play (native MP4), social square 1080, web 720 WebM, and others; MP4 (H.264) or WebM (VP9), 24/30/60 fps.
- **Demo assets**: `assets/demo/` supplies placeholder screens.

---

## 📱 Device System

Everything device-related lives in `devices/` — the single source of truth. Paths are defined in `src/devices/paths.ts`.

| Path | Contents |
| :--- | :--- |
| `devices/catalogue.json` | Definitions for 16 devices (geometry, screen inset, bezel, cut-outs, camera island, buttons, ports) |
| `devices/2d/*.svg` | 2D frames, generated from the catalogue or uploaded as custom SVG |
| `devices/3d/*.glb` | 3D models used by the Three.js renderer |
| `devices/css/*.json` | CSS-built devices (markup + CSS) extracted from video templates |

Each device has a `deviceType` (**2D** or **3D**) and a `sourceType` (**SVG**, **GLB** or **CSS**). The UI shows only 2D and 3D tabs; CSS is a source badge, never a category. A device is identified by `(id, deviceType)`.

**Dynamic device swapping (Video Studio).** Templates declare a `deviceMode` on the template and each scene. A template's rig carries `data-device`, and its default device's CSS sits in `<style data-device-css>`. At compose time `applyRigDevices` (`src/devices/rig-engine.ts`) swaps the device per scene while keeping the screen content and animation. Unswapped output is the raw template. Incompatible (device, mode) pairs are rejected by the API and sanitised on save/render (`sanitizeSceneDevice`).

Regenerate files with `npm run devices:export`. Do not re-run the scripts in `scripts/generate/` on a migrated template — they emit the pre-extraction markup.

---

## 🔧 Configuration

| Item | Location |
| :--- | :--- |
| AI providers | `config/providers.json` (OpenAI-compatible endpoints; only enabled ones are offered) |
| API keys | Encrypted in `.auth/ai-keys.json`, keyed by `.auth/.secret.key` (git-ignored) |
| Demo-account login | `DEMO_GEN_DEMO_ACCOUNT_EMAIL` / `..._PASSWORD_ENC` in `.env` (password encrypted with AES-256-GCM) |
| Per-app auth | `apps/<slug>/auth.json` |
| Toolchain paths | `output/.toolchain-config.json` (custom dir for scrcpy/adb/ffmpeg) |
| Logs | `logs/app.log`, recreated at every launch |

---

## 📁 Project Structure

```
main.js, preload.cjs      Electron main process + preload
web/                      Frontend (index.html, app.css, js/) and server.ts
src/                      Backend modules (compiled to dist/)
templates/mockup|video    Mockup (JSON) and video (HTML) templates
devices/                  Device catalogue, 2D SVG, 3D GLB, CSS devices
assets/demo/              Demo screens
config/providers.json     AI provider registry
fonts/Inter/              Fonts embedded in renders
vendor/bin/               scrcpy, adb, ffmpeg (git-ignored)
build/                    Icon, splash, NSIS include
scripts/                  Generators, device export, icon build, analysis helpers
docs/architecture/        Architecture diagram
output/                   Runtime data (git-ignored)
```

---

## 🧯 Troubleshooting

| Symptom | Cause / fix |
| :--- | :--- |
| Stale UI or "the same bug again" | Browser cached old static files — hard refresh. For backend changes, rebuild with `npm run build`. |
| Edits to `src/` have no effect | The app runs `dist/`. Rebuild. |
| Black/blank window on an installed build | Check `logs/app.log` (in the install folder under `resources/app/logs`). A missing module or a failed server start is reported there and in an error dialog. |
| `EADDRINUSE` on port 8787 | The app reclaims the port from a stale copy of itself or falls back to a free port. For the dev server, don't kill unrelated processes on 8787. |
| Capture/render fails on a fresh install | Playwright Chromium isn't installed: `npx playwright install chromium`. |
| Android capture unavailable | `adb`/`scrcpy` missing — set them up in the toolchain panel or `vendor/bin`. |
| Electron won't launch in a headless/CI sandbox | Run the web server directly from `dist/web/server.js` under Node. |

---

## 📚 Documentation Links

- **Architecture diagram:** [docs/architecture/store-assets-generator.architecture.html](docs/architecture/store-assets-generator.architecture.html)

---

## 🤝 Contributing

Contributions are welcome — bug reports, template and device additions, and fixes alike.

1. **Fork and clone** the repository, then run `setup.bat` (or `npm install && npm run build`).
2. **Create a branch** off `main`: `git checkout -b fix/short-description` (or `feat/…`).
3. **Make your change.** Keep it focused; avoid unrelated refactors. Match the style of the surrounding code.
4. **Test it in the real app.** Run `npm run build`, launch with `start.bat` / `npm start`, and exercise the feature you touched. For video changes also run `npm run test:video`. For packaging changes, build the installer and install it — dev and packaged builds differ (working directory, `asar`, bundled files).
5. **Commit** with a conventional-style message (`fix(video): …`, `feat(devices): …`, `chore: …`) and **open a pull request** describing what changed, why, and how you verified it.

Before touching core architecture, read the sections above on device separation, the startup lifecycle and the Fabric.js v7 trap, and discuss large changes in an issue first. Expectations: TypeScript compiles cleanly, no dead wiring (grep for real call sites), no new second source of truth for versions, devices or templates, and docs updated when behavior changes.

Have an idea or found a bug? Open a GitHub Issue.

---

## 📄 License

No license file is currently included in the repository. Until one is added, all rights are reserved by the author; open an issue to discuss usage.
