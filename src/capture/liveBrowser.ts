import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";
import fs from "fs";
import path from "path";
import { projectDir, projectFile, loadProject, saveProject } from "../project/projectStore.js";
import { resolveAuthConfig, slugify } from "../auth/appConfig.js";
import { defaultSessionStatePath, authenticate } from "./auth.js";
import { startFrameRecorder, nextRecordingPath, registerRecording, type FrameRecorder } from "./frameRecorder.js";
import { type DeviceCategory, CATEGORY_RESOLUTION } from "./deviceCategories.js";

export interface MobileDevicePreset {
  name: string;
  category: DeviceCategory;
  cssWidth: number;
  cssHeight: number;
  scaleFactor: number;
  outputWidth: number;
  outputHeight: number;
  userAgent: string;
  isMobile: boolean;
  hasTouch: boolean;
}

// Keyed by resolutionKey (technical detail) but every preset carries the
// device-size `category` it belongs to -- that category, not this key, is
// what the UI shows and filters by. "1242x2688" is kept only so older
// projects that reference it still resolve; the user-facing "connect"
// dropdown offers just the one canonical preset per category (see
// CATEGORY_RESOLUTION / resolveResolutionKeyForCategory below).
export const STORE_DEVICE_PRESETS: Record<string, MobileDevicePreset> = {
  "1290x2796": {
    name: "Phone – 6.7\" / Standard (1290 × 2796)",
    category: "phone",
    cssWidth: 430,
    cssHeight: 932,
    scaleFactor: 3,
    outputWidth: 1290,
    outputHeight: 2796,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  },
  "1242x2688": {
    name: "Phone – 6.5\" Display (1242 × 2688)",
    category: "phone",
    cssWidth: 414,
    cssHeight: 896,
    scaleFactor: 3,
    outputWidth: 1242,
    outputHeight: 2688,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  },
  "2048x2732": {
    name: "Tablet – 10\" / 12.9\" Pro (2048 × 2732)",
    category: "tablet10",
    cssWidth: 1024,
    cssHeight: 1366,
    scaleFactor: 2,
    outputWidth: 2048,
    outputHeight: 2732,
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  },
  "1200x1920": {
    name: "Tablet – 7\" Display (1200 × 1920)",
    category: "tablet7",
    cssWidth: 600,
    cssHeight: 960,
    scaleFactor: 2,
    outputWidth: 1200,
    outputHeight: 1920,
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-T500) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
    isMobile: true,
    hasTouch: true,
  },
};

/** The one canonical resolutionKey used to connect a Live Web session "as" a
 *  given device-size category -- the primary, user-facing selector. */
export function resolveResolutionKeyForCategory(category: DeviceCategory): string {
  return CATEGORY_RESOLUTION[category].resolutionKey;
}

let activeBrowser: Browser | null = null;
let activeContext: BrowserContext | null = null;
let activePage: Page | null = null;
let currentProjectId: string | null = null;
let currentPreset: MobileDevicePreset = STORE_DEVICE_PRESETS["1290x2796"];

export async function startBrowserSession(
  projectId: string,
  url: string,
  resolutionKey = "1290x2796"
): Promise<{ sessionExpired?: boolean; message?: string }> {
  console.log(`[SAG-BROWSER] [${new Date().toLocaleTimeString()}] Starting true mobile Playwright browser for project ${projectId} (${resolutionKey}) at URL: ${url}`);
  
  if (activeBrowser) {
    await stopBrowserSession();
  }

  currentProjectId = projectId;
  currentPreset = STORE_DEVICE_PRESETS[resolutionKey] || STORE_DEVICE_PRESETS["1290x2796"];

  activeBrowser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--ignore-certificate-errors",
      "--disable-web-security",
      "--allow-running-insecure-content"
    ]
  });

  const slug = slugify(url);
  const sessionStatePath = defaultSessionStatePath(slug);

  const contextOptions: any = {
    viewport: { width: currentPreset.cssWidth, height: currentPreset.cssHeight },
    deviceScaleFactor: currentPreset.scaleFactor,
    userAgent: currentPreset.userAgent,
    isMobile: currentPreset.isMobile,
    hasTouch: currentPreset.hasTouch,
    ignoreHTTPSErrors: true,
    screen: { width: currentPreset.cssWidth, height: currentPreset.cssHeight }
  };

  if (fs.existsSync(sessionStatePath)) {
    contextOptions.storageState = sessionStatePath;
    console.log(`[SAG-BROWSER] Loaded cached storage state from ${sessionStatePath}`);
  }

  activeContext = await activeBrowser.newContext(contextOptions);
  activePage = await activeContext.newPage();

  // Emulate true mobile screen
  await activePage.emulateMedia({ media: "screen" });

  // Try authentication
  const authConfig = resolveAuthConfig(url, slug);
  let authResult: any = null;
  if (authConfig) {
    authConfig.sessionStatePath = sessionStatePath;
    console.log(`[SAG-BROWSER] Resolving authentication with strategy...`);
    try {
      authResult = await authenticate(activePage, activeContext, authConfig);
      console.log(`[SAG-BROWSER] Authentication status: ok=${authResult.ok}, stage=${authResult.stage}, reason=${authResult.reason || "none"}`);
      if (authResult.ok && authResult.shouldSave) {
        fs.mkdirSync(path.dirname(sessionStatePath), { recursive: true });
        await activeContext.storageState({ path: sessionStatePath });
        console.log(`[SAG-BROWSER] Storage state updated at ${sessionStatePath}`);
      } else if (!authResult.ok && authResult.reason && /expired|disabled|invalid/i.test(authResult.reason)) {
        if (fs.existsSync(sessionStatePath)) {
          try { fs.unlinkSync(sessionStatePath); } catch {}
        }
      }
    } catch (authError: any) {
      console.error(`[SAG-BROWSER] Auth error during session init:`, authError.message);
    }
  }

  console.log(`[SAG-BROWSER] Navigating to ${url} with mobile viewport (${currentPreset.cssWidth}x${currentPreset.cssHeight}, DPR: ${currentPreset.scaleFactor})...`);
  
  let navigationError: Error | null = null;
  let response: any = null;
  try {
    response = await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
  } catch (err: any) {
    navigationError = err;
    console.warn(`[SAG-BROWSER] Initial page.goto warning/timeout:`, err.message);

    // If navigation timed out waiting for domcontentloaded, check if the page loaded or was redirected
    const currentUrl = activePage.url();
    if (!currentUrl || currentUrl === "about:blank") {
      // Try fallback with waitUntil: "commit"
      try {
        response = await activePage.goto(url, { waitUntil: "commit", timeout: 20000 });
        navigationError = null;
      } catch (commitErr: any) {
        navigationError = commitErr;
      }
    } else {
      // URL has changed from about:blank (e.g. redirected to login or content started rendering)
      navigationError = null;
    }
  }

  const finalUrl = activePage.url();
  const status = response?.status() ?? null;
  console.log(`[SAG-BROWSER] Landed at URL: ${finalUrl} (HTTP Status: ${status})`);

  // Expired session detection logic
  const hasPasswordField = await activePage.locator("input[type='password']").first().isVisible().catch(() => false);
  const isLoginPage = finalUrl.includes("/login") || finalUrl.includes("/signin") || finalUrl.includes("/auth");
  const isAuthFailed = authResult && !authResult.ok && /expired|disabled|unauthenticated|login/i.test(authResult.reason || "");
  
  if (authConfig && (isLoginPage || hasPasswordField || isAuthFailed)) {
    console.warn(`[SAG-BROWSER] Expired session detected: redirected to login / password input found.`);
    if (fs.existsSync(sessionStatePath)) {
      try { fs.unlinkSync(sessionStatePath); } catch {}
    }
    return {
      sessionExpired: true,
      message: "Demo login session has expired. Please login again."
    };
  }

  if (navigationError) {
    const isTimeout = /timeout/i.test(navigationError.message);
    if (isTimeout) {
      throw new Error(`Connection timed out while loading ${url}. The server took too long to respond. Please verify the URL and try again.`);
    } else {
      const cleanMsg = navigationError.message.replace(/Call log:[\s\S]*/, "").replace(/\[2m|\[22m/g, "").trim();
      throw new Error(`Failed to load ${url}: ${cleanMsg}`);
    }
  }

  return {};
}

export async function stopBrowserSession(): Promise<void> {
  console.log(`[SAG-BROWSER] [${new Date().toLocaleTimeString()}] Stopping browser session`);
  if (recording) {
    recording.recorder.abort();
    recording = null;
  }
  if (activeBrowser) {
    await activeBrowser.close();
  }
  activeBrowser = null;
  activeContext = null;
  activePage = null;
  currentProjectId = null;
}

// --- Screen recording ---------------------------------------------------
// Chromium's own Page.startScreencast pushes a JPEG whenever the page paints,
// which is both higher fidelity and far cheaper than the preview's polled
// page.screenshot() loop -- so recording doesn't compete with the live view.

let recording: {
  projectId: string;
  id: number;
  rel: string;
  cdp: CDPSession;
  recorder: FrameRecorder;
} | null = null;

export function isBrowserRecording(): boolean {
  return recording !== null;
}

export async function startBrowserRecording(projectId: string): Promise<{ id: number; file: string }> {
  if (!activePage || !activeContext) throw new Error("No active browser session.");
  if (recording) throw new Error("A recording is already in progress.");

  const { id, rel, abs } = nextRecordingPath(projectId);
  const recorder = startFrameRecorder(abs);
  const cdp = await activeContext.newCDPSession(activePage);

  cdp.on("Page.screencastFrame", async (params: any) => {
    recorder.write(Buffer.from(params.data, "base64"));
    // Chromium stops sending frames until the current one is acked.
    await cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
  });

  // maxWidth/maxHeight pinned to the preset's OUTPUT size: without them Chromium
  // caps screencast frames at the CSS viewport, so a 1290x2796 session would
  // record at 430x932 -- both low quality and invisible to the gallery's
  // resolution filter.
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90,
    everyNthFrame: 1,
    maxWidth: currentPreset.outputWidth,
    maxHeight: currentPreset.outputHeight,
  });
  recording = { projectId, id, rel, cdp, recorder };
  console.log(`[SAG-BROWSER] Recording ${id} started -> ${rel}`);
  return { id, file: rel };
}

export async function stopBrowserRecording(): Promise<{ id: number; file: string; durationSec: number }> {
  if (!recording) throw new Error("No recording in progress.");
  const r = recording;
  recording = null;

  await r.cdp.send("Page.stopScreencast").catch(() => {});
  await r.cdp.detach().catch(() => {});

  const { width, height, durationSec } = await r.recorder.stop();
  console.log(`[SAG-BROWSER] Recording ${r.id} stopped (${durationSec}s, ${width}x${height})`);
  return registerRecording({
    projectId: r.projectId,
    id: r.id,
    rel: r.rel,
    url: activePage?.url() ?? "",
    width,
    height,
    durationSec,
    deviceLabel: currentPreset.name || "Phone",
  });
}

export async function executeBrowserAction(action: {
  type: "click" | "scroll" | "type" | "press" | "navigate" | "back" | "forward" | "reload";
  xPct?: number;
  yPct?: number;
  deltaX?: number;
  deltaY?: number;
  text?: string;
  key?: string;
  url?: string;
}): Promise<void> {
  if (!activePage) {
    throw new Error("No active browser session. Start a session first.");
  }

  switch (action.type) {
    case "click": {
      if (action.xPct !== undefined && action.yPct !== undefined) {
        const clampedXPct = Math.min(100, Math.max(0, action.xPct));
        const clampedYPct = Math.min(100, Math.max(0, action.yPct));
        const vp = activePage.viewportSize() || { width: currentPreset.cssWidth, height: currentPreset.cssHeight };
        const x = Math.min(vp.width - 1, Math.max(0, Math.round((clampedXPct / 100) * vp.width)));
        const y = Math.min(vp.height - 1, Math.max(0, Math.round((clampedYPct / 100) * vp.height)));
        console.log(`[SAG-BROWSER] Multi-Strategy Click at (${x}, ${y}) on viewport (${vp.width}x${vp.height}) [xPct=${clampedXPct.toFixed(1)}%, yPct=${clampedYPct.toFixed(1)}%]`);
        
        // 1. Playwright mouse click (pointerdown, mousedown, mouseup, click)
        await activePage.mouse.move(x, y).catch(() => {});
        await activePage.mouse.click(x, y, { delay: 30 }).catch(() => {});

        // 2. Playwright touch tap for touch-specific listeners
        if (currentPreset.hasTouch) {
          await activePage.touchscreen.tap(x, y).catch(() => {});
        }

        // 3. In-page DOM fallback: directly click the element at (x, y) or its closest interactive parent
        await activePage.evaluate(({ clickX, clickY }) => {
          try {
            const el = document.elementFromPoint(clickX, clickY);
            if (el) {
              const clickable = el.closest("button, a, [role='button'], input, select, textarea, [onclick], .btn, .icon-btn, [tabindex]") || el;
              if (clickable && typeof (clickable as HTMLElement).click === "function") {
                (clickable as HTMLElement).focus?.();
                (clickable as HTMLElement).click();
              }
            }
          } catch (_) {}
        }, { clickX: x, clickY: y }).catch(() => {});
      }
      break;
    }
    case "scroll": {
      const deltaX = action.deltaX ?? 0;
      const deltaY = action.deltaY ?? 0;
      if (action.xPct !== undefined && action.yPct !== undefined) {
        const x = Math.round((action.xPct / 100) * currentPreset.cssWidth);
        const y = Math.round((action.yPct / 100) * currentPreset.cssHeight);
        await activePage.mouse.move(x, y).catch(() => {});
      }
      await activePage.mouse.wheel(deltaX, deltaY).catch(() => {});
      break;
    }
    case "type": {
      if (action.text) {
        console.log(`[SAG-BROWSER] Typing text`);
        await activePage.keyboard.type(action.text);
      }
      break;
    }
    case "press": {
      if (action.key) {
        console.log(`[SAG-BROWSER] Key press: ${action.key}`);
        await activePage.keyboard.press(action.key);
      }
      break;
    }
    case "navigate": {
      if (action.url) {
        console.log(`[SAG-BROWSER] Navigating to: ${action.url}`);
        await activePage.goto(action.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      }
      break;
    }
    case "back": {
      await activePage.goBack().catch(() => {});
      break;
    }
    case "forward": {
      await activePage.goForward().catch(() => {});
      break;
    }
    case "reload": {
      await activePage.reload().catch(() => {});
      break;
    }
  }
}

export async function getBrowserFrame(): Promise<Buffer> {
  if (!activePage) {
    throw new Error("No active browser session.");
  }
  return await activePage.screenshot({ type: "jpeg", quality: 70 });
}

export async function captureBrowserScreen(projectId: string): Promise<{ id: number; file: string }> {
  if (!activePage) {
    throw new Error("No active browser session.");
  }

  const project = loadProject(projectId);
  const nextId = project.captures.length > 0 ? Math.max(...project.captures.map((c) => c.id)) + 1 : 1;
  const filename = `${nextId}.png`;
  const relPath = path.posix.join("captures", filename);
  const absPath = projectFile(projectId, relPath);

  console.log(`[SAG-BROWSER] Capturing pristine high-res mobile screen ${nextId} (${currentPreset.outputWidth}x${currentPreset.outputHeight})`);

  // Take high-res device screenshot using scaleFactor
  const screenshotBuffer = await activePage.screenshot({
    type: "png",
    scale: "device"
  });
  fs.writeFileSync(absPath, screenshotBuffer);

  const resolutionKey = `${currentPreset.outputWidth}x${currentPreset.outputHeight}`;
  const deviceLabelClean = currentPreset.name || "Phone";

  const captureInfo = {
    id: nextId,
    file: relPath,
    url: activePage.url(),
    capturedAt: new Date().toISOString(),
    width: currentPreset.outputWidth,
    height: currentPreset.outputHeight,
    deviceCategory: currentPreset.category,
    resolution: resolutionKey,
    deviceLabel: deviceLabelClean,
  };

  project.captures.push(captureInfo);

  const srcId = `src_${Date.now()}`;

  // Name stays free of pixel dimensions -- device size (deviceCategory) and
  // resolution are separate metadata fields; the UI appends the device-size
  // label at display time (see web/js/editor.js's populateSourceSelect)
  // rather than baking it into the name here.
  const sourceName = `Screenshot ${nextId}`;

  project.mockup.sources.push({
    id: srcId,
    name: sourceName,
    file: `captures/${filename}`,
    width: currentPreset.outputWidth,
    height: currentPreset.outputHeight,
    deviceCategory: currentPreset.category,
    resolution: resolutionKey,
    deviceLabel: deviceLabelClean,
  });

  project.video.sources.push({
    id: srcId,
    name: sourceName,
    file: `captures/${filename}`,
    width: currentPreset.outputWidth,
    height: currentPreset.outputHeight,
    deviceCategory: currentPreset.category,
    resolution: resolutionKey,
    deviceLabel: deviceLabelClean,
  });

  saveProject(project);
  console.log(`[SAG-BROWSER] Capture registered successfully for project ${projectId}`);

  return { id: nextId, file: relPath };
}
