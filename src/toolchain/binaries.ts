import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import unzipper from "unzipper";

// Managed local vendor directory directly inside the application installation directory
const VENDOR_DIR = path.join(process.cwd(), "vendor", "bin");
const EXE = process.platform === "win32" ? ".exe" : "";

export type ToolName = "scrcpy" | "adb" | "ffmpeg";

// Pinned Windows binary release endpoints & SHA-256 integrity hashes
const SCRCPY_PINNED_VERSION = "v2.7";
const SCRCPY_URL = `https://github.com/Genymobile/scrcpy/releases/download/${SCRCPY_PINNED_VERSION}/scrcpy-win64-${SCRCPY_PINNED_VERSION}.zip`;
const FFMPEG_WINDOWS_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

function findExecutable(dir: string, name: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const target = (name + EXE).toLowerCase();
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.toLowerCase() === target) return full;
    }
  }
  return null;
}

function isOnPath(name: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const resolvedCache = new Map<ToolName, string>();

function vendorSubdir(name: ToolName): string {
  return name === "adb" ? "scrcpy" : name;
}

export function getVendorBinDir(): string {
  return VENDOR_DIR;
}

export function resolveTool(name: ToolName): string {
  const cached = resolvedCache.get(name);
  if (cached) return cached;

  const found = findExecutable(path.join(VENDOR_DIR, vendorSubdir(name)), name);
  if (found) {
    resolvedCache.set(name, found);
    return found;
  }
  if (isOnPath(name)) {
    resolvedCache.set(name, name);
    return name;
  }
  throw new Error(
    `${name} is not available. Run start.bat (or "npm start") again to auto-download it into ${VENDOR_DIR}, ` +
      `or install ${name} yourself and add it to PATH.`
  );
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
 * Ensures required external binaries (scrcpy, adb, ffmpeg) exist in vendor/bin/
 */
export async function ensureBinaries(onProgress?: (msg: string) => void): Promise<void> {
  if (process.platform !== "win32") {
    onProgress?.("Auto-download is only implemented for Windows; ensure scrcpy, adb, and ffmpeg are on PATH.");
    return;
  }

  const scrcpyDir = path.join(VENDOR_DIR, "scrcpy");
  if (!findExecutable(scrcpyDir, "scrcpy") || !findExecutable(scrcpyDir, "adb")) {
    await downloadAndExtractZip(SCRCPY_URL, scrcpyDir, onProgress);
  }

  const ffmpegDir = path.join(VENDOR_DIR, "ffmpeg");
  if (!findExecutable(ffmpegDir, "ffmpeg")) {
    await downloadAndExtractZip(FFMPEG_WINDOWS_URL, ffmpegDir, onProgress);
  }

  resolvedCache.clear();
}
