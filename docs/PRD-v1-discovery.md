# Store Assets Generator – Developer Discovery & Implementation Planning

## Objective

We want to build a reusable **Store Assets Generator** inside our existing development workspace.

The primary purpose is to automatically generate professional Android/Google Play Store assets for our multiple applications from the **actual frontend websites/web applications that we already have**.

We do **not** want to start by assuming that screenshots must be captured from the Android APK.

In many of our applications, Android is essentially a WebView wrapper around an existing frontend website. Therefore, we want to investigate whether we can directly use the actual frontend URL and render it in Android-like viewport/device environments to automatically capture the required screens.

The first task is therefore **not to start coding immediately**.

First inspect our existing workspace, repositories, frontend projects, Android WebView projects, existing automation tools, build setup, routes, authentication flow, assets, and project-specific requirements.

Then provide a detailed technical feasibility report and implementation plan based on what actually exists.

---

# 1. First: Audit the Existing Workspace

Before proposing an architecture, inspect the complete workspace and identify:

* All relevant projects/repositories.
* Android WebView applications.
* Frontend websites/applications used by those Android apps.
* Astro/Laravel/HTML/JavaScript frontend projects.
* Existing development/build scripts.
* Existing testing/automation infrastructure.
* Existing Play Store or app-release automation.
* Existing screenshot/video generation tools.
* Existing browser automation tools such as Playwright/Puppeteer/Selenium, if any.
* Existing Android automation tools such as ADB/Appium, if any.
* Existing FFmpeg/video processing setup.
* Existing image processing utilities.
* Existing Canva or design automation integrations, if available.
* Existing CI/CD workflows.
* Existing reusable scripts or developer commands that could be reused.

Do not assume that we need to introduce a new technology if an existing project/tool already provides the required capability.

---

# 2. Understand Our Actual WebView Architecture

For each relevant Android application, determine:

1. Which frontend URL is loaded by the Android WebView?
2. Is the frontend:

   * Astro
   * Laravel Blade
   * SPA
   * traditional HTML/JS
   * another framework?
3. Is the UI responsive?
4. Does it already adapt correctly to Android/mobile viewport sizes?
5. Which routes/screens are available?
6. Which screens require authentication?
7. Which screens require specific user state?
8. Which screens require test/demo data?
9. Which screens require API calls?
10. Which screens require device/browser-specific behavior?
11. Are there screens where the Android WebView behaves differently from a normal browser?
12. Are there screens that can be captured directly from the frontend without installing the APK?

This analysis should determine whether we can use the **actual deployed frontend URL as the primary source for Store Asset generation**.

---

# 3. Core Requirement: Generate Assets Directly From a Frontend URL

Our preferred workflow is:

```text
Frontend URL
      ↓
Browser automation
      ↓
Android-like viewport/device configuration
      ↓
Navigate to required screens
      ↓
Capture screenshots
      ↓
Generate Store Assets
      ↓
Generate promotional videos
```

For example:

```text
https://example.com
```

should potentially be enough for the generator to:

* open the website,
* emulate an Android phone viewport,
* navigate through configured screens,
* authenticate if required,
* use demo/test data,
* capture screenshots,
* generate videos,
* generate Google Play Store assets.

We want to determine whether this is technically reliable for our existing applications.

Do not assume that APK-level automation is required unless the audit shows that a particular feature cannot be reproduced reliably from the frontend.

---

# 4. Investigate Dynamic Screen Capture

We want the system to support a configuration such as:

```yaml
app:
  name: Example App

source:
  type: url
  url: https://example.com

screens:
  - id: home
    path: /

  - id: mock-test
    path: /mock-test

  - id: exam
    path: /exam

  - id: result
    path: /result

  - id: ranking
    path: /ranking

  - id: subscription
    path: /subscription
```

However, do not assume this exact format is required.

Determine the best configuration structure after inspecting our projects.

The system should ideally support:

* URL-based navigation.
* Route-based navigation.
* Query parameters.
* Hash routes.
* JavaScript-triggered navigation.
* Login flows.
* Demo/test accounts.
* Local/session storage state.
* Cookies.
* Authentication tokens where appropriate.
* Screens that require sequential navigation.
* Screens that require clicking buttons before the final capture.
* Screens that require scrolling.
* Screens that require a specific UI state.

---

# 5. Determine How Screens Should Be Discovered

We want to understand whether important application screens can be:

### Option A – Explicitly configured

Developer specifies:

```text
Home
Mock Test
Exam
Result
Ranking
Subscription
Profile
```

### Option B – Automatically discovered

The system analyzes:

* routes,
* navigation menus,
* links,
* buttons,
* page titles,
* frontend structure,
* sitemap/routes,
* application configuration.

### Option C – Hybrid

Automatic discovery proposes screens, while a configuration file determines which screens are approved for Store Assets.

Evaluate these approaches and recommend the most reliable option for our projects.

---

# 6. Device and Screen Size Requirements

The generator must eventually support multiple Android-like viewport configurations.

Do not assume specific Play Store dimensions yet.

First determine the currently relevant Google Play requirements and then design the system so dimensions can be configured rather than hard-coded.

We should be able to define device profiles such as:

```text
phone-small
phone-standard
phone-large
tablet
custom
```

For each profile we should potentially control:

* viewport width
* viewport height
* device pixel ratio
* orientation
* browser/user-agent characteristics
* safe areas/insets where relevant
* screenshot resolution
* output format

The developer should identify which dimensions are actually required for our target Google Play Store listings.

---

# 7. Screenshot Generation Requirements

The system should ideally generate two different types of output:

## Raw UI Screenshots

These should represent the actual frontend UI without unnecessary modification.

Example:

```text
raw/
  home.png
  exam.png
  result.png
  ranking.png
```

## Store Marketing Screenshots

These may include:

* application name
* logo
* headline
* subtitle
* background
* device frame
* shadows
* branding
* decorative elements
* screenshot positioning
* multiple UI screenshots
* feature descriptions

Example:

```text
store/
  01-home.png
  02-mock-test.png
  03-live-exam.png
  04-result.png
```

Determine whether these should be generated through:

* HTML/CSS templates,
* image processing,
* Canva,
* another design system,
* or a combination.

Do not select a solution until the existing workspace and requirements have been inspected.

---

# 8. Important Requirement: No Manual Screenshot Workflow

We want to avoid this workflow:

```text
Open website manually
→ Resize browser
→ Navigate manually
→ Take screenshot
→ Edit screenshot
→ Resize screenshot
→ Create another screenshot
→ Repeat
```

Instead, the target should be:

```bash
store-assets generate --app example
```

or an equivalent command/UI.

The exact command is up to the developer after inspecting the existing development workflow.

---

# 9. Video Generation

We also want the system to generate promotional videos from the same frontend source.

The video does not necessarily need to be a simple screen recording.

We want to investigate whether we can generate professional marketing-style videos using:

* actual frontend screens,
* browser/device rendering,
* animated transitions,
* zoom effects,
* pan effects,
* screen movement,
* device mockups,
* text overlays,
* application branding,
* feature highlights,
* background music,
* sound effects,
* optional voice-over,
* intro/outro animations.

For example:

```text
Intro
 ↓
Home UI
 ↓
Feature 1
 ↓
Mock Test
 ↓
Feature 2
 ↓
Result
 ↓
Ranking
 ↓
Call To Action
```

The developer should determine which parts can be fully automated and which parts should be template-driven.

---

# 10. Video Should Be Template-Based

We do not want to manually create every promotional video.

Ideally, we should have reusable templates such as:

```text
template-01
template-02
template-03
```

Each template could receive:

```text
APP_NAME
LOGO
SCREEN_1
SCREEN_2
SCREEN_3
FEATURE_TEXT
BACKGROUND
MUSIC
CTA
```

and generate the final video automatically.

Investigate the most maintainable implementation for this.

---

# 11. Application-Specific Configuration

We expect to have multiple applications.

Therefore, the system should not contain application-specific logic throughout the codebase.

Instead, determine how we can define per-application configuration such as:

```text
Application
Frontend URL
Branding
Logo
Screens
Authentication
Demo user
Device profiles
Screenshot templates
Video template
Music
Store metadata
```

A possible concept is:

```text
apps/
  ncvt-online/
  railway/
  iti-career/
  another-app/
```

But do not assume this exact structure. Recommend the best structure after auditing the workspace.

---

# 12. Demo/Test State

Some screens may be empty or unusable without data.

Investigate how we can reliably generate screenshots using controlled demo/test state.

For example:

```text
Demo User
Demo Exam
Demo Questions
Demo Result
Demo Ranking
Demo Subscription
```

We need to avoid:

* real user information,
* production-sensitive data,
* empty screens,
* unpredictable content,
* random advertisements,
* temporary notifications,
* inconsistent API responses.

Determine whether the existing projects already have:

* test accounts,
* seed data,
* demo APIs,
* staging environments,
* mock APIs,
* development routes,
* fixture data.

Reuse existing mechanisms wherever possible.

---

# 13. Production URL vs Staging URL

Investigate whether the generator should support:

```text
production URL
staging URL
local development URL
```

For example:

```text
https://front.example.com
https://staging.example.com
http://localhost:4321
```

The system should ideally be able to generate assets from whichever environment is explicitly selected.

Determine the security and reliability implications.

---

# 14. Authentication

Some frontend screens may require login.

Investigate reliable automation methods for:

* email/password login
* existing test accounts
* cookies
* localStorage/sessionStorage
* authentication tokens
* pre-authenticated browser contexts
* OAuth/Firebase login where applicable

Do not introduce insecure mechanisms or hard-code production credentials.

The system should preferably support a dedicated demo/test account or pre-authenticated state.

---

# 15. Ads and Unwanted UI

Our Android applications may contain advertisements or other dynamic elements.

Determine how the asset generator can produce clean screenshots/videos without:

* unwanted advertisements,
* cookie banners,
* browser prompts,
* notifications,
* debug overlays,
* loading indicators,
* development banners,
* accidental user data.

Investigate whether our existing frontend already has a suitable test/demo mode.

---

# 16. Video Source: Website Rendering vs APK

This is an important architectural question.

Compare these approaches:

### Approach A

```text
Frontend URL
→ Playwright/browser
→ Android viewport
→ screenshot/video
```

### Approach B

```text
Frontend URL
→ Android WebView
→ emulator
→ ADB/screen recording
```

### Approach C

```text
APK
→ Android emulator
→ UI automation
→ screenshots/video
```

For our WebView applications, compare these approaches based on:

* accuracy
* speed
* maintainability
* reproducibility
* visual similarity to the actual Android application
* authentication
* WebView-specific behavior
* cost
* automation complexity

Then recommend the appropriate default.

The system should ideally use the simplest reliable approach and fall back to APK-level capture only when necessary.

---

# 17. Existing Tools Audit

Before introducing dependencies, check whether our workspace already contains or can reuse:

* Playwright
* Puppeteer
* Selenium
* Appium
* ADB
* Android Emulator
* Fastlane
* Screengrab
* FFmpeg
* ImageMagick
* Sharp
* Pillow
* Canva integration
* GitHub Actions
* existing CI/CD
* existing screenshot utilities
* existing video generation utilities

For every existing tool found, explain:

```text
What it currently does
What we can reuse
What is missing
Whether modification is required
```

---

# 18. Google Play Store Requirements

Research and document the current Google Play requirements relevant to our assets, including:

* screenshot dimensions
* supported orientations
* maximum/minimum sizes
* image formats
* file size limits
* video requirements
* promotional graphics where applicable
* device-specific requirements
* any current restrictions

Do not hard-code these requirements into the architecture.

Create a configurable validation layer so that if Google changes a requirement later, we can update the validation rules without redesigning the entire system.

---

# 19. Validation

Before an asset is considered complete, automatically validate:

### Images

* correct dimensions
* supported format
* file size
* aspect ratio
* no accidental cropping
* no blank/white screen
* no loading state
* no debug UI

### Videos

* correct resolution
* correct aspect ratio
* duration
* codec/container compatibility
* audio availability
* file size
* successful rendering
* no black frames
* no broken transitions

Generate a report such as:

```text
Asset Generation Report

✓ Home screenshot
✓ Mock Test screenshot
✓ Result screenshot
✓ Ranking screenshot

✓ Phone assets
✓ Tablet assets

✓ Promotional video
✓ BGM
✓ CTA

✓ Google Play validation
```

---

# 20. Reproducibility

The same configuration should produce the same type of output every time.

For example:

```bash
store-assets generate --app ncvt-online
```

should regenerate the current assets after a UI update.

We should not need to manually redesign the assets after every frontend UI change.

---

# 21. CI/CD Possibility

Investigate whether this system can eventually run automatically after a frontend release.

Potential future workflow:

```text
Frontend UI changed
        ↓
Build/deploy
        ↓
Store Asset Generator
        ↓
Capture important screens
        ↓
Generate marketing assets
        ↓
Generate video
        ↓
Validate
        ↓
Store artifacts
        ↓
Optional Play Store upload
```

Do not implement CI/CD initially unless the existing architecture makes it straightforward.

First make the local workflow reliable.

---

# 22. Play Store Upload

Investigate whether the final stage can optionally integrate with existing Play Store deployment tooling.

The system should ideally separate:

```text
Asset Generation
```

from:

```text
Asset Upload
```

so that generating assets does not automatically publish anything.

Possible future workflow:

```bash
store-assets generate
```

followed by:

```bash
store-assets validate
```

and optionally:

```bash
store-assets upload
```

The upload command must require explicit confirmation.

---

# 23. Multi-Project Architecture

The most important architectural requirement is reusability.

We should be able to use the same generator for:

```text
Project A
Project B
Project C
Project D
...
```

without copying the generator into every project.

Determine whether it should be:

### Option 1

A standalone repository/CLI.

### Option 2

A shared package.

### Option 3

A central service/dashboard.

### Option 4

A hybrid CLI + configuration repository.

Compare these options and recommend one based on our existing workspace.

---

# 24. Developer Deliverables

Do NOT immediately start implementation.

First provide a report containing:

## A. Workspace Audit

List the relevant projects and what each one contains.

## B. Existing Capability Matrix

For example:

| Requirement           | Already Available | Needs Modification | New Development |
| --------------------- | ----------------- | ------------------ | --------------- |
| Frontend rendering    | ?                 | ?                  | ?               |
| Screen navigation     | ?                 | ?                  | ?               |
| Authentication        | ?                 | ?                  | ?               |
| Screenshot capture    | ?                 | ?                  | ?               |
| Device emulation      | ?                 | ?                  | ?               |
| Video recording       | ?                 | ?                  | ?               |
| Video rendering       | ?                 | ?                  | ?               |
| Marketing templates   | ?                 | ?                  | ?               |
| Play Store validation | ?                 | ?                  | ?               |
| Play Store upload     | ?                 | ?                  | ?               |

## C. Recommended Architecture

Explain the architecture based on the actual projects.

## D. Technology Selection

For each proposed technology explain:

* why it is required,
* whether it already exists,
* alternatives,
* maintenance implications.

## E. Frontend URL Capture Feasibility

Explicitly answer:

> Can we reliably generate Android-style screenshots and videos directly from our deployed frontend URL without installing/capturing the Android APK?

If yes, explain exactly how.

If partially, explain the limitations.

If no, explain why and identify which screens require APK-level capture.

## F. Screen Discovery Strategy

Recommend:

* manual configuration,
* automatic discovery,
* or hybrid.

## G. Authentication Strategy

Explain how screenshots can be generated for authenticated screens without using unsafe production credentials.

## H. Asset Pipeline

Describe:

```text
URL
→ Screen
→ Screenshot
→ Marketing Asset
→ Video
→ Validation
→ Final Store Package
```

## I. Multi-Application Strategy

Explain how the same generator will work across all our applications.

## J. Implementation Phases

Provide a phased plan such as:

```text
Phase 1 – Discovery
Phase 2 – Basic URL screenshot capture
Phase 3 – Multiple device profiles
Phase 4 – Marketing screenshot generation
Phase 5 – Video generation
Phase 6 – Validation
Phase 7 – Multi-project support
Phase 8 – Optional Play Store upload
```

Do not assign arbitrary phases if the actual workspace suggests a better sequence.

---

# 25. Important Constraints

Do not:

* build a completely independent system without inspecting existing projects,
* assume APK capture is mandatory,
* assume every application has the same routes,
* assume every application uses the same authentication,
* hard-code Google Play dimensions,
* hard-code application-specific logic into the core engine,
* introduce unnecessary dependencies,
* create manual screenshot workflows,
* require Photoshop/manual editing for every release,
* upload anything to Play Store automatically without explicit confirmation.

---

# 26. Desired End State

Ultimately we want something conceptually similar to:

```bash
store-assets generate --app ncvt-online
```

The generator should be able to:

1. Read the application's configuration.
2. Open the configured frontend URL.
3. Use the required authentication/demo state.
4. Render the frontend using Android-like device profiles.
5. Navigate to configured important screens.
6. Capture clean screenshots.
7. Generate Play Store-compatible screenshots.
8. Generate professional marketing creatives.
9. Generate promotional videos using reusable templates.
10. Add configured branding, animations and BGM.
11. Validate all generated assets.
12. Produce a versioned output package.
13. Optionally prepare assets for Play Store upload.
14. Never modify production data or publish assets without explicit approval.

---

# Final Instruction

Treat this as a **technical discovery and architecture-planning task first**, not as a request to immediately implement the tool.

Inspect our actual workspace and existing projects before making recommendations.

The key question we want answered is:

> **How much of this Store Assets Generator can we build by directly rendering our existing frontend websites at Android device dimensions, and how much—if any—actually requires the Android WebView/APK?**

We want the final solution to be:

* reusable across multiple applications,
* driven by configuration,
* dynamically based on actual frontend URLs,
* capable of generating screenshots and videos,
* maintainable by our existing development team,
* easy to run repeatedly after UI updates,
* compatible with our current projects,
* and extensible for future Play Store automation.

Do not over-engineer the first version. First identify what we already have, what can be reused, what is technically possible, and what the minimum new development required is.
