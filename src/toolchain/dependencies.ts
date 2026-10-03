import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { createRequire } from "module";

/**
 * Application-managed dependency folder -- the single default home of every external component:
 *   <root>/Chromium/    Playwright browsers (screen capture + mockup/video rendering)
 *   <root>/scrcpy-bin/  scrcpy + adb
 *   <root>/FFmpeg/      ffmpeg (video conversion)
 * It lives outside the install directory so reinstalling/updating the app reuses what is already downloaded.
 * Advanced users can redirect any single dependency (see setDependencyOverride).
 *
 * IMPORTANT: this module must not statically import "playwright": it sets PLAYWRIGHT_BROWSERS_PATH on load,
 * and Playwright reads that variable when it is first imported. Keep it the first import of every entry point.
 */

export type DependencyKey = "chromium" | "scrcpy" | "ffmpeg";
export type ProgressFn = (message: string, percent?: number, bytes?: { done: number; total: number }) => void;

const FOLDER_NAMES: Record<DependencyKey, string> = { chromium: "Chromium", scrcpy: "scrcpy-bin", ffmpeg: "FFmpeg" };

export function dependenciesRoot(): string {
  if (process.env.SAG_DEPENDENCIES_DIR) return path.resolve(process.env.SAG_DEPENDENCIES_DIR);
  const base = process.platform === "win32"
    ? process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local")
    : path.join(os.homedir(), ".local", "share");
  return path.join(base, "Store Assets Generator", "Dependencies");
}

export function dependencyDir(key: DependencyKey): string {
  return path.join(dependenciesRoot(), FOLDER_NAMES[key]);
}

// ---- manual overrides (per dependency), stored next to the dependencies so they survive reinstalls ----

const OVERRIDES_FILE = () => path.join(dependenciesRoot(), ".overrides.json");

export function getDependencyOverrides(): Partial<Record<DependencyKey, string>> {
  try {
    const raw = JSON.parse(fs.readFileSync(OVERRIDES_FILE(), "utf-8"));
    const out: Partial<Record<DependencyKey, string>> = {};
    for (const k of Object.keys(FOLDER_NAMES) as DependencyKey[]) {
      if (typeof raw[k] === "string" && raw[k].trim()) out[k] = raw[k].trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function setDependencyOverride(key: DependencyKey, dir: string | null): void {
  if (!(key in FOLDER_NAMES)) throw new Error(`Unknown dependency '${key}'`);
  const cur = getDependencyOverrides();
  if (dir && dir.trim()) cur[key] = dir.trim();
  else delete cur[key];
  fs.mkdirSync(dependenciesRoot(), { recursive: true });
  fs.writeFileSync(OVERRIDES_FILE(), JSON.stringify(cur, null, 2), "utf-8");
}

// ---- Chromium (Playwright) ----

/** Folder Playwright searches for browsers: the user's override, else <root>/Chromium. */
export function chromiumRoot(): string {
  return getDependencyOverrides().chromium || dependencyDir("chromium");
}

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = chromiumRoot();

const require = createRequire(import.meta.url);

function chromiumRevision(): string | null {
  try {
    const exe: string = require("playwright").chromium.executablePath();
    return exe.match(/chromium-(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isChromiumInstalled(): boolean {
  const rev = chromiumRevision();
  if (!rev) return false;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH!;
  return ["chromium", "chromium_headless_shell"].every((n) => fs.existsSync(path.join(root, `${n}-${rev}`, "INSTALLATION_COMPLETE")));
}

export function chromiumLocation(): string {
  return process.env.PLAYWRIGHT_BROWSERS_PATH!;
}

export async function ensureChromium(onProgress?: ProgressFn): Promise<void> {
  if (isChromiumInstalled()) return;
  const root = chromiumLocation();
  fs.mkdirSync(root, { recursive: true });
  const cli = path.join(path.dirname(require.resolve("playwright/package.json")), "cli.js");
  onProgress?.("Downloading Chromium...", 0);
  await new Promise<void>((resolve, reject) => {
    // process.execPath is Electron when packaged: ELECTRON_RUN_AS_NODE makes it behave as plain Node.
    const child = spawn(process.execPath, [cli, "install", "chromium"], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PLAYWRIGHT_BROWSERS_PATH: root },
      windowsHide: true,
    });
    let tail = "";
    const onData = (d: Buffer) => {
      const text = d.toString();
      tail = (tail + text).slice(-600);
      const pct = [...text.matchAll(/(\d{1,3})%\s+of\s+([\d.]+)\s*(KiB|MiB|GiB)/g)].pop();
      if (pct) {
        const p = Math.min(100, Number(pct[1]));
        const total = Number(pct[2]) * { KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 }[pct[3] as "KiB" | "MiB" | "GiB"];
        onProgress?.("Downloading Chromium...", p, { done: (total * p) / 100, total });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Chromium install failed (exit ${code}): ${tail.trim()}`))));
  });
  if (!isChromiumInstalled()) throw new Error("Chromium install finished but the browser was not found.");
}
