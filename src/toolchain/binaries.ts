import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import unzipper from "unzipper";
import {
  dependencyDir, dependenciesRoot, getDependencyOverrides, setDependencyOverride, isChromiumInstalled, chromiumLocation,
  ensureChromium, type DependencyKey, type ProgressFn,
} from "./dependencies.js";

// Legacy location (binaries bundled with older builds); still honoured as a fallback after the managed folder.
const VENDOR_DIR = path.join(process.cwd(), "vendor", "bin");
const CONFIG_FILE = path.join(process.cwd(), "output", ".toolchain-config.json");
const EXE = process.platform === "win32" ? ".exe" : "";

export type ToolName = "scrcpy" | "adb" | "ffmpeg";

export interface ToolStatus {
  name: ToolName;
  available: boolean;
  path: string | null;
  version: string | null;
  source: "custom" | "vendor" | "path" | "missing";
}

export interface ToolchainConfig {
  customDir: string | null;
}

export interface ToolchainStatus {
  ready: boolean;
  customDir: string | null;
  tools: Record<ToolName, ToolStatus>;
  /** Default managed dependency folder + per-dependency manual overrides + Chromium state. */
  dependenciesRoot: string;
  overrides: Partial<Record<DependencyKey, string>>;
  chromium: { available: boolean; path: string };
}

// Pinned Windows binary release endpoints
const SCRCPY_PINNED_VERSION = "v2.7";
const SCRCPY_URL = `https://github.com/Genymobile/scrcpy/releases/download/${SCRCPY_PINNED_VERSION}/scrcpy-win64-${SCRCPY_PINNED_VERSION}.zip`;
const FFMPEG_WINDOWS_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

function loadConfig(): ToolchainConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      return { customDir: typeof data.customDir === "string" && data.customDir.trim() ? data.customDir.trim() : null };
    }
  } catch (_) {}
  return { customDir: null };
}

function saveConfig(cfg: ToolchainConfig): void {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
  } catch (_) {}
}

export function getCustomDir(): string | null {
  return loadConfig().customDir;
}

export function setOverride(key: DependencyKey, dir: string | null): ToolchainStatus {
  setDependencyOverride(key, dir);
  resolvedCache.clear();
  return getToolchainStatus();
}

export function setCustomDir(dir: string | null): ToolchainStatus {
  const cleanDir = dir && dir.trim() ? dir.trim() : null;
  saveConfig({ customDir: cleanDir });
  resolvedCache.clear();
  return getToolchainStatus();
}

function findExecutable(dir: string, name: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const target = (name + EXE).toLowerCase();
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    try {
      for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
        const full = path.join(cur, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.name.toLowerCase() === target) return full;
      }
    } catch (_) {}
  }
  return null;
}

function getPathExecutable(name: string): string | null {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(cmd, [name], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    const firstLine = out.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
    return firstLine || null;
  } catch {
    return null;
  }
}

const resolvedCache = new Map<ToolName, { path: string; source: "custom" | "vendor" | "path" }>();

function vendorSubdir(name: ToolName): string {
  return name === "adb" ? "scrcpy" : name;
}

export function getVendorBinDir(): string {
  return VENDOR_DIR;
}

export function resolveToolInfo(name: ToolName): { path: string; source: "custom" | "vendor" | "path" } {
  const cached = resolvedCache.get(name);
  if (cached && fs.existsSync(cached.path)) return cached;

  // 1. manual per-dependency override, 2. legacy single custom dir, 3. managed Dependencies folder, 4. legacy vendor/bin, 5. PATH
  const depKey: DependencyKey = name === "ffmpeg" ? "ffmpeg" : "scrcpy";
  const overrideDir = getDependencyOverrides()[depKey];
  if (overrideDir) {
    const foundOverride = findExecutable(overrideDir, name);
    if (foundOverride) {
      const res = { path: foundOverride, source: "custom" as const };
      resolvedCache.set(name, res);
      return res;
    }
  }

  const customDir = getCustomDir();
  if (customDir) {
    const foundCustom = findExecutable(customDir, name);
    if (foundCustom) {
      const res = { path: foundCustom, source: "custom" as const };
      resolvedCache.set(name, res);
      return res;
    }
  }

  const foundVendor = findExecutable(dependencyDir(depKey), name) ?? findExecutable(path.join(VENDOR_DIR, vendorSubdir(name)), name);
  if (foundVendor) {
    const res = { path: foundVendor, source: "vendor" as const };
    resolvedCache.set(name, res);
    return res;
  }

  const foundPath = getPathExecutable(name);
  if (foundPath) {
    const res = { path: foundPath, source: "path" as const };
    resolvedCache.set(name, res);
    return res;
  }

  throw new Error(
    `${name} is not available. Click 'Toolchain Settings' (folder icon in header) to download binaries or set a custom folder.`
  );
}

export function resolveTool(name: ToolName): string {
  return resolveToolInfo(name).path;
}

export function getToolVersion(name: ToolName, exePath: string): string | null {
  try {
    const flag = name === "scrcpy" ? "--version" : "version";
    const out = execFileSync(exePath, [flag], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 });
    if (name === "adb") {
      const m = out.match(/Android Debug Bridge version ([\d.]+)/i);
      if (m) return `v${m[1]}`;
    } else if (name === "scrcpy") {
      const m = out.match(/scrcpy (v?[\d.]+)/i);
      if (m) return m[1].startsWith("v") ? m[1] : `v${m[1]}`;
    } else if (name === "ffmpeg") {
      const m = out.match(/ffmpeg version ([\w.-]+)/i);
      if (m) return m[1];
    }
    const firstLine = out.split(/\r?\n/).find((l) => l.trim().length > 0);
    return firstLine ? firstLine.trim().slice(0, 40) : null;
  } catch {
    return null;
  }
}

export function getToolchainStatus(): ToolchainStatus {
  const customDir = getCustomDir();
  const tools: Record<ToolName, ToolStatus> = {
    adb: { name: "adb", available: false, path: null, version: null, source: "missing" },
    scrcpy: { name: "scrcpy", available: false, path: null, version: null, source: "missing" },
    ffmpeg: { name: "ffmpeg", available: false, path: null, version: null, source: "missing" },
  };

  const toolNames: ToolName[] = ["adb", "scrcpy", "ffmpeg"];
  let allReady = true;

  for (const name of toolNames) {
    try {
      const info = resolveToolInfo(name);
      const version = getToolVersion(name, info.path);
      tools[name] = {
        name,
        available: true,
        path: info.path,
        version,
        source: info.source,
      };
    } catch {
      tools[name] = {
        name,
        available: false,
        path: null,
        version: null,
        source: "missing",
      };
      allReady = false;
    }
  }

  const chromium = { available: isChromiumInstalled(), path: chromiumLocation() };
  return {
    ready: allReady && chromium.available,
    customDir,
    tools,
    dependenciesRoot: dependenciesRoot(),
    overrides: getDependencyOverrides(),
    chromium,
  };
}

function calculateSha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function downloadAndExtractZip(url: string, destDir: string, label: string, onProgress?: ProgressFn): Promise<void> {
  onProgress?.(`Downloading ${label}...`, 0);
  const res = await fetch(url, { headers: { "User-Agent": "store-assets-generator" }, redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${url}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const chunks: Buffer[] = [];
  let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    got += value.length;
    onProgress?.(`Downloading ${label}...`, total ? Math.round((got / total) * 95) : undefined);
  }

  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  const tmpZip = `${destDir}.tmp.zip`;
  const tmpExtract = `${destDir}.tmp`;
  fs.writeFileSync(tmpZip, Buffer.concat(chunks));

  onProgress?.(`Extracting ${label}...`, 96);
  fs.rmSync(tmpExtract, { recursive: true, force: true });
  const directory = await unzipper.Open.file(tmpZip);
  await directory.extract({ path: tmpExtract });
  fs.rmSync(tmpZip, { force: true });

  // destDir is always an application-managed folder (never a user override), so replacing it is safe.
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.renameSync(tmpExtract, destDir);
  onProgress?.(`${label} ready`, 100);
}

/** Scale a 0-100 sub-task onto a slice of the overall 0-100 progress bar. */
function slice(onProgress: ProgressFn | undefined, from: number, to: number): ProgressFn {
  return (msg, pct) => onProgress?.(msg, pct === undefined ? undefined : Math.round(from + ((to - from) * pct) / 100));
}

/** Downloads scrcpy (+adb) and ffmpeg into the managed Dependencies folder when they cannot be resolved. */
export async function ensureBinaries(onProgress?: ProgressFn): Promise<void> {
  if (process.platform !== "win32") {
    onProgress?.("Auto-download is only implemented for Windows; ensure scrcpy, adb, and ffmpeg are on PATH.");
    return;
  }
  const missing = (n: ToolName) => { try { resolveToolInfo(n); return false; } catch { return true; } };

  if (missing("scrcpy") || missing("adb")) {
    await downloadAndExtractZip(SCRCPY_URL, dependencyDir("scrcpy"), "scrcpy", slice(onProgress, 0, 20));
  }
  resolvedCache.clear();
  if (missing("ffmpeg")) {
    await downloadAndExtractZip(FFMPEG_WINDOWS_URL, dependencyDir("ffmpeg"), "FFmpeg", slice(onProgress, 20, 100));
  }
  resolvedCache.clear();
}

let inFlight: Promise<void> | null = null;
const listeners = new Set<ProgressFn>();

/** Detect-or-download every required dependency (Chromium, scrcpy-bin, FFmpeg). Concurrent callers share one run. */
export function ensureDependencies(onProgress?: ProgressFn): Promise<void> {
  if (onProgress) listeners.add(onProgress);
  const emit: ProgressFn = (m, p) => listeners.forEach((l) => l(m, p));
  inFlight ??= (async () => {
    await ensureChromium(slice(emit, 0, 45));
    await ensureBinaries(slice(emit, 45, 100));
  })().finally(() => { inFlight = null; listeners.clear(); });
  return inFlight;
}
