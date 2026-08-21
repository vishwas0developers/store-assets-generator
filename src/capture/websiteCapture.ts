import fs from "fs";
import path from "path";
import { WebCaptureBackend } from "./browser.js";
import { defaultSessionStatePath } from "./auth.js";
import { resolveAuthConfig, slugify } from "../auth/appConfig.js";
import { loadPlatformSpec } from "../platform/index.js";
import { saveCaptureSession, captureDir, type RawScreenshot, type CaptureSession } from "./store.js";

/**
 * Website Capture — Screen Capture tab. Captures raw, unframed application
 * screens using the configured demo access, strictly from the exact URLs
 * the user provides (no discovery/crawling, no page selected at random —
 * see docs/IMPLEMENTATION_PLAN.md). Independent of Studio Mockup and Video
 * (see src/capture/store.ts) — nothing here writes into their project
 * stores.
 */

/** One user-entered target. `id` is a plain numeric identifier the user
 *  assigns to this URL slot in the UI (1, 2, 3, ...) — it does NOT imply a
 *  fixed page order (it is not "Home", "Dashboard", etc.); the actual
 *  capture order is simply the order these entries arrive in. */
export interface CaptureUrlEntry {
  id: number;
  url: string;
}

export interface CaptureRequest {
  pages: CaptureUrlEntry[];
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

export async function captureWebsiteScreens(session: CaptureSession, request: CaptureRequest): Promise<CaptureSession> {
  const pages = (request.pages ?? []).filter((p) => p.url && p.url.trim().length > 0);
  if (pages.length === 0) {
    throw new Error("At least one URL is required — enter the pages to capture before running Capture.");
  }

  // Auth is resolved once, against the session's own URL (or the first
  // entered page, if the session was created without one) — every entered
  // URL is assumed to belong to the same app/demo account.
  const authBaseUrl = session.url || pages[0].url;
  const slug = session.slug || slugify(authBaseUrl);
  const authConfig = resolveAuthConfig(authBaseUrl, slug);
  if (authConfig && !authConfig.sessionStatePath) {
    authConfig.sessionStatePath = defaultSessionStatePath(slug);
  }
  if (authConfig && (request.email || request.password) && authConfig.apiSession) {
    authConfig.apiSession = { ...authConfig.apiSession, email: request.email, password: request.password };
  }

  const viewport = captureViewport(session.platforms);
  const rawDir = path.join(captureDir(session.id), "raw");
  fs.mkdirSync(rawDir, { recursive: true });

  const backend = new WebCaptureBackend();
  await backend.initialize();
  const raw: RawScreenshot[] = [];
  const skipped: string[] = [];

  try {
    // Strictly the order the user provided — never re-sorted, never
    // re-ranked, never substituted with a discovered/guessed page.
    for (const entry of pages) {
      const filename = `screen_${entry.id}.png`;
      try {
        await backend.captureScreen(entry.url, filename, {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          outputDir: rawDir,
          auth: authConfig ?? undefined,
        });
        raw.push({
          id: `screen_${entry.id}`,
          url: entry.url,
          title: `Screen ${entry.id}`,
          file: path.posix.join("raw", filename),
          width: viewport.width,
          height: viewport.height,
          source: "website",
        });
      } catch (err) {
        skipped.push(`#${entry.id} (${entry.url}): ${(err as Error).message}`);
      }
    }
  } finally {
    await backend.close();
  }

  if (raw.length === 0) {
    throw new Error(`No screens captured. Reasons:\n${skipped.join("\n") || "unknown"}`);
  }

  // Replace, not append — a re-run of the same numeric slots should
  // overwrite those exact screens rather than pile up duplicates.
  const replacedIds = new Set(raw.map((r) => r.id));
  session.raw = [...session.raw.filter((r) => !replacedIds.has(r.id)), ...raw];
  saveCaptureSession(session);
  return session;
}
