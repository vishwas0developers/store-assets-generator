# Android Capture — Feasibility and Architecture

**Companion documents:** [`PRD.md`](../PRD.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`AGENT-MCP-DISTRIBUTION.md`](./AGENT-MCP-DISTRIBUTION.md) · [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)

> **Status (Phase 9):** retained and unaffected by the four-step manual
> workflow rework. `src/android/capture.ts` and its MCP tools stay
> available as an **alternate source for Step 1 (Capture)** — screenshots
> pulled from a live/physical device via `adb`, alongside the web
> (Playwright) capture path. Unlike `src/orchestrator.ts` and
> `src/render/video.ts`, nothing here was disabled.

---

## 1. Verified Environment

Checked on the development machine, not assumed:

| Check | Result |
|---|---|
| `adb version` | **1.0.41 / 37.0.0**, at `C:\platform-tools\adb.exe` |
| `ANDROID_HOME` | **`D:\Android\Sdk`** (set) |
| `adb devices` | **One physical device attached and authorized** (`9641166920001ZN`) |
| Device OS | **Android 11** |
| Device screen | **720 × 1600, density 300 (hdpi)** |
| Target app installed | **Yes** — `ncvtonline.cits.kdhakar` |
| Release APK present | **Yes** — `3.App.ITI_Career_Prep/kdhakar/release/NcvtOnline-CBT-Exam-v30-release.apk` |
| Emulator binary | **Not found** at `$ANDROID_HOME/emulator` |

**Conclusion: Android capture is feasible today** for a physical device. `adb exec-out screencap -p` would work immediately. No emulator is currently installed.

---

## 2. The Resolution Problem — and why it decides the architecture

The connected device is **720 × 1600**. Play Store phone screenshots require substantially more pixels than that, and upscaling a 720p capture produces visibly soft assets that look worse than the web-rendered equivalent.

This single fact drives the recommendation:

| Source | Resolution control | Verdict |
|---|---|---|
| **Frontend URL via Playwright** | Arbitrary — set DPR 3 and capture at any size | **Primary source** |
| **Android emulator** | Arbitrary — AVDs can be defined at any resolution and density | **Secondary**, when native behaviour matters |
| **Physical device** | Fixed by hardware — 720 × 1600 here | **Verification only**, not asset production |

A physical device is excellent for *checking that the real app looks right*. It is a poor source for *store assets*, because you cannot ask the hardware for more pixels.

---

## 3. When Android Capture Is Actually Needed

`3.App.ITI_Career_Prep` is a WebView wrapper: `WebViewHelper.kt` loads `AppUrls.BASE_URL` (a `BuildConfig` value pointing at the web frontend) and the app's screens are the website's screens. For this app, **frontend capture reproduces nearly everything** at far higher quality.

Android capture earns its place only where the frontend genuinely cannot stand in:

1. **Native UI outside the WebView** — splash screen, permission dialogs, native navigation chrome, error states from `WebViewErrorHelper`.
2. **WebView-specific rendering differences** — where the Android WebView paints differently from desktop Chromium.
3. **Android-only features** — billing/subscription flows (`BillingApiService`), push notifications, ads (`AdsHelper`), device-security prompts (`DeviceSecurity`).
4. **Verification** — confirming the shipped APK actually looks like the generated assets claim.
5. **Store-listing honesty** — where a reviewer would expect to see the real app.

The agent decides which source to use per screen. That decision belongs in the `store-assets-capture` skill, informed by the project inspection.

---

## 4. Architecture

Android capture is a **second capture backend behind the same interface** as web capture. Everything downstream — project document, mockups, templates, video, validation — is identical regardless of where the PNG came from. This is the design property that keeps Android capture from infecting the rest of the system.

```
CaptureSource (interface)
├── WebCaptureBackend       Playwright · viewport/DPR emulation · route navigation
└── AndroidCaptureBackend   adb · emulator or device · UI automation
        ↓
   raw/*.png  (identical contract)
        ↓
   Project Document → mockups → templates → video → validation
```

### 4.1 Android backend components

| Component | Responsibility |
|---|---|
| `device.ts` | Enumerate devices/emulators (`adb devices`), read `wm size`/`wm density`, select target |
| `emulator.ts` | Optionally launch an AVD at a configured resolution; wait for boot |
| `install.ts` | `adb install -r <apk>` when an APK path is configured |
| `launch.ts` | `adb shell am start -n <package>/<activity>` |
| `navigate.ts` | Drive the UI to a target screen |
| `screencap.ts` | `adb exec-out screencap -p > file.png` |
| `hygiene.ts` | Suppress notifications, hide the status bar clock, disable animations |

### 4.2 Navigation strategy

The hard part is reaching a specific screen reliably. Options, in preference order:

1. **Deep links** — `adb shell am start -a android.intent.action.VIEW -d "<url>"`. For a WebView app, the URL *is* the screen; this is by far the most reliable route and should be the default.
2. **UI Automator dumps** — `adb shell uiautomator dump` to find elements, then `adb shell input tap x y`. Workable but brittle against layout changes.
3. **Appium** — full UI automation. Powerful, but a heavy dependency (server, drivers, capabilities) for what deep links already achieve here. **Not recommended for v1.**

For WebView apps, deep-link navigation makes Android capture almost as configuration-driven as web capture.

### 4.3 Screenshot hygiene

Real devices leak reality into screenshots. Before capture:

- `adb shell settings put global heads_up_notifications_enabled 0` — suppress notification popups
- Demo mode for a clean status bar (full signal, full battery, fixed clock):
  `adb shell settings put global sysui_demo_allowed 1`, then `adb shell am broadcast -a com.android.systemui.demo …`
- Disable animations (`window_animation_scale` etc.) so captures are deterministic
- Enable airplane mode or use a demo account to avoid real user data and live ads

Every one of these must be **restored afterwards** — the tool is operating on someone's real device and must leave it as it found it. This is non-negotiable and belongs in the backend's teardown path.

---

## 5. Emulator vs Physical Device

| | Emulator | Physical device |
|---|---|---|
| Resolution | Configurable to any size | Fixed (720×1600 here) |
| Reproducibility | High — defined AVD | Low — device state varies |
| CI-capability | Yes | No |
| Setup cost | AVD download + install (not currently present) | Zero (already working) |
| Fidelity | Very high for WebView; imperfect for hardware features | Perfect |
| Speed | Slower boot | Instant |

**Recommendation:** support both. Default to emulator for asset production (resolution control and reproducibility), and use a physical device for verification and for hardware-dependent screens. Given no emulator is currently installed, the physical device is the practical starting point for prototyping the backend — with the resolution limitation clearly understood as a prototyping constraint, not the final quality bar.

---

## 6. Configuration

Per-app, alongside the web configuration — no app-specific logic in the core:

```yaml
android:
  package: ncvtonline.cits.kdhakar
  apk: ../3.App.ITI_Career_Prep/kdhakar/release/NcvtOnline-CBT-Exam-v30-release.apk
  launchActivity: .ui.HomeActivity
  preferEmulator: true
  avd: store-assets-1080x1920
  hygiene:
    demoStatusBar: true
    disableAnimations: true
    suppressNotifications: true
  screens:
    - id: splash
      strategy: launch          # native — not reproducible from the frontend
    - id: subscription
      strategy: deeplink
      url: https://web.iticareer.com/subscriptions
      reason: native billing sheet
```

The `reason` field is deliberate: it documents *why* a screen needs Android capture rather than the cheaper web path, so the list does not silently grow.

---

## 7. Risks and Limitations

| Risk | Impact | Mitigation |
|---|---|---|
| **Physical device resolution below store requirements** | Assets too small / soft | Use an emulator for production assets; device for verification |
| No emulator currently installed | Blocks emulator path | AVD setup is a documented `setup` step; report as a disabled capability until present |
| Device state pollution (notifications, real data, ads) | Unusable screenshots | Hygiene sequence with guaranteed restore |
| **Modifying a real personal device's settings** | User-visible side effects | Always restore; never assume the device is disposable; require explicit opt-in for device (vs emulator) capture |
| UI automation brittleness | Flaky navigation | Prefer deep links; treat tap-coordinate automation as a last resort |
| Emulator unavailable in CI without nested virtualization | Blocks future CI | Web capture remains the CI path; Android capture stays local |
| adb absent on other machines | Feature unavailable | Optional capability; degrade visibly, never fail the install |
| Screen recording of real flows (optional, secondary) | Scope creep | `adb shell screenrecord` exists and is trivial — but per the PRD this is a short, secondary final section only, never the primary video source |

---

## 8. Recommendation

1. **Frontend URL capture is the primary source** for this app family and should carry the full MVP. It is higher resolution, faster, more reproducible, and requires no device.
2. **Android capture is a genuine secondary backend**, justified for native UI, WebView divergence, Android-only features, and verification — not as a default.
3. **Build it behind the same `CaptureSource` interface**, so it never complicates the rest of the pipeline.
4. **Deep-link navigation first**, UI automation only where unavoidable, Appium not at all in v1.
5. **Defer it past the MVP.** The end-to-end workflow must be proven on the web path first; Android capture is an extension of a working system, not a prerequisite for one.
