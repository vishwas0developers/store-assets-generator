import { chromium, type Browser } from "playwright";
import fs from "fs";
import path from "path";
import { authenticate, saveStorageState, type AuthConfig, type AuthResult } from "./auth.js";

export interface CaptureOptions {
  width: number;
  height: number;
  deviceScaleFactor?: number;
  outputDir: string;
  /** Path to a cached Playwright storageState — tried first if present. */
  storageState?: string;
  /** Auth strategy config. Omit to skip authentication entirely. */
  auth?: AuthConfig;
}

export interface CaptureResult {
  path: string;
  auth: AuthResult | null;
  /** HTTP status of the final navigation — callers/validators use this to
   *  reject error pages (404s, 5xx) rather than silently accepting them. */
  httpStatus: number | null;
}

export class WebCaptureBackend {
  private browser: Browser | null = null;

  async initialize() {
    this.browser = await chromium.launch({ headless: true });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async captureScreen(url: string, filename: string, options: CaptureOptions): Promise<CaptureResult> {
    if (!this.browser) {
      await this.initialize();
    }

    const { width, height, deviceScaleFactor = 3, outputDir, storageState, auth } = options;

    // Noise selectors for suppression (consents, ad banners, popups)
    const noiseSelectors = [
      "#consent-banner", ".cookie-consent", ".ad-container", "[id*='cookie']",
      "[class*='cookie']", ".banner-ads", "#newsletter-popup", ".chat-widget"
    ];

    const contextOptions: any = {
      viewport: { width, height },
      deviceScaleFactor,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      isMobile: true,
      hasTouch: true
    };

    const effectiveStorageState = storageState ?? auth?.sessionStatePath;
    if (effectiveStorageState && fs.existsSync(effectiveStorageState)) {
      contextOptions.storageState = effectiveStorageState;
    }

    const context = await this.browser!.newContext(contextOptions);
    const page = await context.newPage();
    const outputPath = path.join(outputDir, filename);
    fs.mkdirSync(outputDir, { recursive: true });

    let authResult: AuthResult | null = null;

    try {
      if (auth) {
        authResult = await authenticate(page, context, { ...auth, sessionStatePath: effectiveStorageState });
        if (!authResult.ok) {
          throw new Error(
            `Authentication failed at stage '${authResult.stage ?? "none"}': ${authResult.reason ?? "unknown reason"}`,
          );
        }
        if (authResult.shouldSave && effectiveStorageState) {
          await saveStorageState(context, effectiveStorageState);
        }
      }

      const navResponse = await page.goto(url, { waitUntil: "load", timeout: 20000 });
      const httpStatus = navResponse?.status() ?? null;
      if (httpStatus !== null && httpStatus >= 400) {
        throw new Error(`Navigation returned HTTP ${httpStatus} — refusing to capture an error page.`);
      }

      // Attempt noise suppression
      for (const selector of noiseSelectors) {
        try {
          await page.evaluate((sel) => {
            const elements = document.querySelectorAll(sel);
            elements.forEach(el => (el as HTMLElement).style.display = "none");
          }, selector);
        } catch {
          // Ignore if elements do not exist
        }
      }

      // Assert page contains content
      const bodyText = await page.innerText("body");
      if (!bodyText || bodyText.trim().length === 0) {
        throw new Error("Captured page body is empty");
      }

      // If auth was required, re-verify on the FINAL destination page — the
      // gate check above ran right after login, not after navigating here.
      if (auth?.verify) {
        const { verifyAuthenticated } = await import("../auth/verify.js");
        const finalCheck = await verifyAuthenticated(page, auth.verify);
        if (!finalCheck.ok) {
          throw new Error(`Post-navigation auth verification failed: ${finalCheck.reason}`);
        }
      }

      await page.screenshot({ path: outputPath, type: "png" });
      return { path: outputPath, auth: authResult, httpStatus };
    } finally {
      await page.close();
      await context.close();
    }
  }
}
