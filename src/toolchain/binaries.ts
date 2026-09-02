import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import unzipper from "unzipper";

// Managed local vendor directory directly inside the application installation directory
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

  const customDir = getCustomDir();
  if (customDir) {
    const foundCustom = findExecutable(customDir, name);
    if (foundCustom) {
      const res = { path: foundCustom, source: "custom" as const };
      resolvedCache.set(name, res);
      return res;
    }
  }

  const foundVendor = findExecutable(path.join(VENDOR_DIR, vendorSubdir(name)), name);
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

  return {
    ready: allReady,
    customDir,
    tools,
  };
}

function calculateSha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function downloadAndExtractZip(
  url: string,
  destDir: string,
  onProgress?: (msg: string) => void,
  expectedSha256?: string
): Promise<void> {
  onProgress?.(`Downloading ${path.basename(destDir)} from ${url}...`);
  const res = await fetch(url, { headers: { "User-Agent": "store-assets-generator" } });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());

  if (expectedSha256) {
    const actualSha = calculateSha256(buf);
    if (actualSha !== expectedSha256) {
      throw new Error(`Integrity check failed for ${url}. Expected SHA-256 ${expectedSha256}, got ${actualSha}`);
    }
    onProgress?.(`SHA-256 verification passed for ${path.basename(destDir)}`);
  }

  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  const tmpZip = `${destDir}.tmp.zip`;
  const tmpExtract = `${destDir}.tmp`;
  fs.writeFileSync(tmpZip, buf);

  onProgress?.(`Extracting ${path.basename(destDir)}...`);
  fs.rmSync(tmpExtract, { recursive: true, force: true });
  const directory = await unzipper.Open.file(tmpZip);
  await directory.extract({ path: tmpExtract });
  fs.rmSync(tmpZip, { force: true });

  fs.rmSync(destDir, { recursive: true, force: true });
  fs.renameSync(tmpExtract, destDir);
}

/**
 * Ensures required external binaries (scrcpy, adb, ffmpeg) exist in vendor/bin/ or custom path
 */
export async function ensureBinaries(onProgress?: (msg: string) => void): Promise<void> {
  if (process.platform !== "win32") {
    onProgress?.("Auto-download is only implemented for Windows; ensure scrcpy, adb, and ffmpeg are on PATH.");
    return;
  }

  const customDir = getCustomDir();
  const targetDir = customDir || VENDOR_DIR;

  const scrcpyDir = customDir ? customDir : path.join(VENDOR_DIR, "scrcpy");
  if (!findExecutable(scrcpyDir, "scrcpy") || !findExecutable(scrcpyDir, "adb")) {
    await downloadAndExtractZip(SCRCPY_URL, scrcpyDir, onProgress);
  }

  const ffmpegDir = customDir ? customDir : path.join(VENDOR_DIR, "ffmpeg");
  if (!findExecutable(ffmpegDir, "ffmpeg")) {
    await downloadAndExtractZip(FFMPEG_WINDOWS_URL, ffmpegDir, onProgress);
  }

  resolvedCache.clear();
}
