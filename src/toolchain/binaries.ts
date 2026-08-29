import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import unzipper from "unzipper";

// adb/scrcpy/ffmpeg are external binaries the Android live-preview pipeline
// depends on. Rather than requiring them pre-installed on PATH, we resolve
// them from a project-local `vendor/bin/` folder first (auto-downloaded by
// ensureBinaries), falling back to PATH for anyone who already has them.
const VENDOR_DIR = path.join(process.cwd(), "vendor", "bin");
const EXE = process.platform === "win32" ? ".exe" : "";

export type ToolName = "scrcpy" | "adb" | "ffmpeg";

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

// adb ships bundled inside the scrcpy release zip, so it's vendored under the
// same subfolder rather than downloaded separately.
function vendorSubdir(name: ToolName): string {
  return name === "adb" ? "scrcpy" : name;
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
    `${name} is not available. Run start.bat (or "npm start") again to auto-download it, ` +
      `or install ${name} yourself and add it to PATH.`
  );
}

async function downloadAndExtractZip(url: string, destDir: string, onProgress?: (msg: string) => void): Promise<void> {
  onProgress?.(`Downloading ${path.basename(destDir)}...`);
  const res = await fetch(url, { headers: { "User-Agent": "store-assets-generator" } });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());

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

async function resolveScrcpyDownloadUrl(): Promise<string> {
  const archTag = "win64";
  const ext = ".zip";

  try {
    const res = await fetch("https://api.github.com/repos/Genymobile/scrcpy/releases/latest", {
      headers: { "User-Agent": "store-assets-generator" },
    });
    if (res.ok) {
      const json: any = await res.json();
      const asset = (json.assets || []).find((a: any) => a.name.includes(archTag) && a.name.endsWith(ext));
      if (asset) return asset.browser_download_url;
    }
  } catch (_) {
    // fall through to the redirect-scraping fallback below
  }

  // GitHub API rate-limited (or unreachable): read the tag off the
  // /releases/latest redirect instead and construct the asset URL directly.
  const redirectRes = await fetch("https://github.com/Genymobile/scrcpy/releases/latest", { redirect: "follow" });
  const tag = redirectRes.url.split("/").pop();
  if (!tag || !tag.startsWith("v")) throw new Error("Could not determine the latest scrcpy release.");
  return `https://github.com/Genymobile/scrcpy/releases/download/${tag}/scrcpy-${archTag}-${tag}${ext}`;
}

const FFMPEG_WINDOWS_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

// Downloads whatever's missing from vendor/bin/. Safe to call on every
// startup: already-present tools (vendored or on PATH) are skipped.
export async function ensureBinaries(onProgress?: (msg: string) => void): Promise<void> {
  if (process.platform !== "win32") {
    onProgress?.("Auto-download is only implemented for Windows; ensure scrcpy, adb, and ffmpeg are on PATH.");
    return;
  }

  const scrcpyDir = path.join(VENDOR_DIR, "scrcpy");
  if (!findExecutable(scrcpyDir, "scrcpy") && !isOnPath("scrcpy")) {
    const url = await resolveScrcpyDownloadUrl();
    await downloadAndExtractZip(url, scrcpyDir, onProgress);
  }

  const ffmpegDir = path.join(VENDOR_DIR, "ffmpeg");
  if (!findExecutable(ffmpegDir, "ffmpeg") && !isOnPath("ffmpeg")) {
    await downloadAndExtractZip(FFMPEG_WINDOWS_URL, ffmpegDir, onProgress);
  }

  resolvedCache.clear();
}
