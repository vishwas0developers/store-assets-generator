import fs from "fs";
import path from "path";

/**
 * A workflow session is one folder under output/ holding everything the
 * four steps produce, plus a session.json describing it. No database: the
 * folder IS the state, so a session survives a server restart and can be
 * inspected/zipped by hand. See docs/ARCHITECTURE.md §6.1.
 *
 *   output/<id>/session.json
 *   output/<id>/raw/         step 1 — original screenshots (source of truth
 *                            for BOTH the mockup package and the video)
 *   output/<id>/store/       step 3 per-device-class renders
 *   output/<id>/store-assets.zip  step 3 deliverable
 *   output/<id>/video/       step 4 frames + final mp4
 *   output/<id>/bgm.*        step 4 uploaded audio
 */

export interface RawScreenshot {
  id: string;
  url: string;
  title: string;
  /** Path relative to the session dir, e.g. "raw/screen_1.png". */
  file: string;
  width: number;
  height: number;
}

export interface MockupConfig {
  template: string;
  device: string;
  variant?: string;
  label: string;
  subtext: string;
  background: string;
  textColor: string;
}

export interface SceneConfig {
  id: string;
  screenId: string;
  template: string;
  text: string;
  subtext: string;
  device: string;
  variant?: string;
  background: string;
  durationSeconds: number;
  rotate: number;
  zoom: number;
  move: number;
}

export interface Session {
  id: string;
  createdAt: string;
  url: string;
  slug?: string;
  platforms: string[];
  raw: RawScreenshot[];
  mockups: Record<string, MockupConfig>;
  scenes: SceneConfig[];
  bgm: string | null;
  outputs: { zip?: string; video?: string };
}

const SESSIONS_ROOT = path.join(process.cwd(), "output");

export function sessionDir(id: string): string {
  const dir = path.join(SESSIONS_ROOT, id);
  // Containment guard: `id` arrives from HTTP, so a "../.." must never
  // escape output/ and let a request read or overwrite arbitrary files.
  const rel = path.relative(SESSIONS_ROOT, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Invalid session id '${id}'.`);
  }
  return dir;
}

/** Absolute path of a session-relative file, with the same containment guard. */
export function sessionFile(id: string, relative: string): string {
  const dir = sessionDir(id);
  const full = path.join(dir, relative);
  const rel = path.relative(dir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Invalid path '${relative}'.`);
  return full;
}

export function createSession(init: Pick<Session, "url" | "slug" | "platforms">): Session {
  const id = `session-${Date.now()}`;
  const session: Session = {
    id,
    createdAt: new Date().toISOString(),
    ...init,
    raw: [],
    mockups: {},
    scenes: [],
    bgm: null,
    outputs: {},
  };
  fs.mkdirSync(sessionDir(id), { recursive: true });
  saveSession(session);
  return session;
}

export function saveSession(session: Session): void {
  fs.mkdirSync(sessionDir(session.id), { recursive: true });
  fs.writeFileSync(path.join(sessionDir(session.id), "session.json"), JSON.stringify(session, null, 2), "utf-8");
}

export function loadSession(id: string): Session {
  const file = path.join(sessionDir(id), "session.json");
  if (!fs.existsSync(file)) throw new Error(`Session '${id}' not found.`);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function listSessions(): Array<{ id: string; createdAt: string; url: string; screenshots: number }> {
  if (!fs.existsSync(SESSIONS_ROOT)) return [];
  return fs
    .readdirSync(SESSIONS_ROOT)
    .filter((name) => fs.existsSync(path.join(SESSIONS_ROOT, name, "session.json")))
    .map((name) => {
      const s = loadSession(name);
      return { id: s.id, createdAt: s.createdAt, url: s.url, screenshots: s.raw.length };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
