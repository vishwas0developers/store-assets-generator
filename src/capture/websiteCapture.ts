import fs from "fs";
import path from "path";
import { DiscoveryEngine } from "../discovery/crawl.js";
import { WebCaptureBackend } from "./browser.js";
import { defaultSessionStatePath } from "./auth.js";
import { resolveAuthConfig, slugify } from "../auth/appConfig.js";
import { loadPlatformSpec } from "../platform/index.js";
import { saveCaptureSession, captureDir, type RawScreenshot, type CaptureSession } from "./store.js";

/**
 * Website Capture — Screen Capture tab. Captures raw, unframed application
 * screens using the configured demo access. Independent of Studio Mockup
 * and Video (see src/capture/store.ts) — nothing here writes into their
 * project stores.
 */

export interface CaptureRequest {
  maxPages?: number;
  email?: string;
  password?: string;
}

/**
 * ponytail: single capture viewport, the largest 9:x phone class of the
 * selected platforms. Capture per device class if a tablet listing ever
 * needs a genuinely different responsive layout rather than a rescale.
 */
function captureViewport(platforms: string[]): { width: number; height: number } {
  let best = { width: 1080, height: 2400 };
  for (const platform of platforms) {
    const spec = loadPlatformSpec(platform);
    for (const cls of Object.values(spec.deviceClasses)) {
      if (cls.aspectRatio.startsWith("9:") && cls.width > best.width) {
        best = { width: cls.width, height: cls.height };
      }
    }
  }
  return best;
}

export async function captureWebsiteScreens(session: CaptureSession, request: CaptureRequest = {}): Promise<CaptureSession> {
  if (!session.url) throw new Error("Website capture requires a url on the capture session.");
  const slug = session.slug || slugify(session.url);
  const authConfig = resolveAuthConfig(session.url, slug);
  if (authConfig && !authConfig.sessionStatePath) {
    authConfig.sessionStatePath = defaultSessionStatePath(slug);
  }
  if (authConfig && (request.email || request.password) && authConfig.apiSession) {
    authConfig.apiSession = { ...authConfig.apiSession, email: request.email, password: request.password };
  }

  const viewport = captureViewport(session.platforms);
  const rawDir = path.join(captureDir(session.id), "raw");
  fs.mkdirSync(rawDir, { recursive: true });

  const discover = new DiscoveryEngine();
  await discover.initialize();
  let pages;
  try {
    pages = await discover.crawl(session.url, { maxPages: request.maxPages ?? 6 });
  } finally {
    await discover.close();
  }
  if (pages.length === 0) throw new Error(`Could not discover any pages at ${session.url}`);

  const backend = new WebCaptureBackend();
  await backend.initialize();
  const raw: RawScreenshot[] = [];
  const skipped: string[] = [];

  try {
    for (let i = 0; i < pages.length; i++) {
      const filename = `screen_${session.raw.length + i + 1}.png`;
      try {
        await backend.captureScreen(pages[i].url, filename, {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          outputDir: rawDir,
          auth: authConfig ?? undefined,
        });
        raw.push({
          id: `screen_${session.raw.length + i + 1}`,
          url: pages[i].url,
          title: pages[i].title || `Screen ${i + 1}`,
          file: path.posix.join("raw", filename),
          width: viewport.width,
          height: viewport.height,
          source: "website",
        });
      } catch (err) {
        skipped.push(`${pages[i].url}: ${(err as Error).message}`);
      }
    }
  } finally {
    await backend.close();
  }

  if (raw.length === 0) {
    throw new Error(`No screens captured. Reasons:\n${skipped.join("\n") || "unknown"}`);
  }

  session.raw = [...session.raw, ...raw];
  saveCaptureSession(session);
  return session;
}
