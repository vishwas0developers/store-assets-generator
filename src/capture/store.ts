import fs from "fs";
import path from "path";

/**
 * Screen Capture tab storage — completely independent of the Studio Mockup
 * and Video tabs (each owns its own root under output/). A capture session
 * is one folder; the folder IS the state, so it survives a server restart
 * and can be inspected by hand.
 *
 *   output/captures/<id>/capture.json
 *   output/captures/<id>/raw/       original screenshots
 */

export type CaptureSource = "website" | "android";

export interface RawScreenshot {
  id: string;
  /** Source URL (website capture) or package/activity hint (android capture). */
  url: string;
  title: string;
  /** Path relative to the session dir, e.g. "raw/screen_1.png". */
  file: string;
  width: number;
  height: number;
  source: CaptureSource;
}

export interface CaptureSession {
  id: string;
  createdAt: string;
  name: string;
  source: CaptureSource;
  /** Website capture only. */
  url?: string;
  slug?: string;
  platforms: string[];
  raw: RawScreenshot[];
}

const ROOT = path.join(process.cwd(), "output", "captures");

export function captureDir(id: string): string {
  const dir = path.join(ROOT, id);
  // Containment guard: `id` arrives over HTTP and must never escape ROOT.
  const rel = path.relative(ROOT, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Invalid capture session id '${id}'.`);
  return dir;
}

export function captureFile(id: string, relative: string): string {
  const dir = captureDir(id);
  const full = path.join(dir, relative);
  const rel = path.relative(dir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Invalid path '${relative}'.`);
  return full;
}

export function createCaptureSession(init: Partial<CaptureSession> & { source: CaptureSource }): CaptureSession {
  const id = `capture-${Date.now()}`;
  const session: CaptureSession = {
    id,
    createdAt: new Date().toISOString(),
    name: init.name ?? init.url ?? "Untitled capture",
    source: init.source,
    url: init.url,
    slug: init.slug,
    platforms: init.platforms?.length ? init.platforms : ["google-play"],
    raw: [],
  };
  fs.mkdirSync(captureDir(id), { recursive: true });
  saveCaptureSession(session);
  return session;
}

export function saveCaptureSession(session: CaptureSession): void {
  fs.mkdirSync(captureDir(session.id), { recursive: true });
  fs.writeFileSync(path.join(captureDir(session.id), "capture.json"), JSON.stringify(session, null, 2), "utf-8");
}

export function loadCaptureSession(id: string): CaptureSession {
  const file = path.join(captureDir(id), "capture.json");
  if (!fs.existsSync(file)) throw new Error(`Capture session '${id}' not found.`);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function listCaptureSessions(): Array<Pick<CaptureSession, "id" | "createdAt" | "name" | "source"> & { screenshots: number }> {
  if (!fs.existsSync(ROOT)) return [];
  return fs
    .readdirSync(ROOT)
    .filter((n) => fs.existsSync(path.join(ROOT, n, "capture.json")))
    .map((n) => {
      const s = loadCaptureSession(n);
      return { id: s.id, createdAt: s.createdAt, name: s.name, source: s.source, screenshots: s.raw.length };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteCaptureSession(id: string): void {
  fs.rmSync(captureDir(id), { recursive: true, force: true });
}
