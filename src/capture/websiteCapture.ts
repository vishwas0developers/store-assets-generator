import fs from "fs";
import path from "path";
import { DiscoveryEngine } from "../discovery/crawl.js";
import { WebCaptureBackend } from "./browser.js";
import { defaultSessionStatePath } from "./auth.js";
import { loadAuthConfig, slugify } from "../auth/appConfig.js";
import { loadPlatformSpec } from "../platform/index.js";
import { saveSession, sessionDir, type RawScreenshot, type Session } from "../session/store.js";

/**
 * Step 1 — capture the raw, unframed application screens using the
 * configured demo access. These originals are the single source for BOTH
 * step 3 (store package) and step 4 (video); nothing downstream re-captures.
 */

export interface CaptureRequest {
  maxPages?: number;
  email?: string;
  password?: string;
}

/**
 * The capture viewport. Raw screenshots are content, not deliverables — the
 * per-device-class store sizes are produced in step 3 by rendering the
 * mockup canvas at each target size, so one high-res phone capture serves
 * every class.
 *
 * ponytail: single capture viewport, the largest phone class of the selected
 * platforms. Capture per device class if a tablet listing ever needs a
 * genuinely different responsive layout rather than a rescale.
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

export async function captureRawScreens(session: Session, request: CaptureRequest = {}): Promise<Session> {
  const slug = session.slug || slugify(session.url);
  const authConfig = loadAuthConfig(slug);
  if (authConfig && !authConfig.sessionStatePath) {
    authConfig.sessionStatePath = defaultSessionStatePath(slug);
  }
  if (authConfig && (request.email || request.password) && authConfig.apiSession) {
    authConfig.apiSession = { ...authConfig.apiSession, email: request.email, password: request.password };
  }

  const viewport = captureViewport(session.platforms);
  const rawDir = path.join(sessionDir(session.id), "raw");
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
      const filename = `screen_${i + 1}.png`;
      try {
        await backend.captureScreen(pages[i].url, filename, {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          outputDir: rawDir,
          auth: authConfig ?? undefined,
        });
        raw.push({
          id: `screen_${i + 1}`,
          url: pages[i].url,
          title: pages[i].title || `Screen ${i + 1}`,
          file: path.posix.join("raw", filename),
          width: viewport.width,
          height: viewport.height,
        });
      } catch (err) {
        // A screen we could not authenticate into is skipped with its reason
        // rather than silently captured as a login page.
        skipped.push(`${pages[i].url}: ${(err as Error).message}`);
      }
    }
  } finally {
    await backend.close();
  }

  if (raw.length === 0) {
    throw new Error(`No screens captured. Reasons:\n${skipped.join("\n") || "unknown"}`);
  }

  session.raw = raw;
  saveSession(session);
  return session;
}
