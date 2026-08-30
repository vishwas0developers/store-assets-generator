import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { projectFile, loadProject, saveProject } from "../project/projectStore.js";
import { AndroidCaptureBackend } from "../android/capture.js";
import { resolveTool } from "../toolchain/binaries.js";
import {
  startAndroidStream,
  stopAndroidStream,
  getLatestStreamFrame,
  getLatestFramePng,
  sendShellInput,
  subscribeAndroidFrames,
  startRawRecording,
  isScreenOff,
  setScreenOff,
  type RawRecording,
} from "./androidStream.js";

import { nextRecordingPath, registerRecording } from "./frameRecorder.js";

export { subscribeAndroidFrames, isScreenOff as isAndroidScreenOff, setScreenOff as setAndroidScreenOff };

const execFileAsync = promisify(execFile);

const backend = new AndroidCaptureBackend();
let currentDeviceId: string | null = null;
let currentScreenSize: { width: number; height: number } | null = null;

export async function listAndroidDevices(): Promise<string[]> {
  return backend.listDevices();
}

async function queryScreenSize(deviceId: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileAsync(resolveTool("adb"), ["-s", deviceId, "shell", "wm", "size"]);
  // "wm size" prints "Physical size: WxH" and, if overridden, an additional
  // "Override size: WxH" line — the override (if present) reflects what's
  // actually rendered, so take the LAST match rather than the first.
  const matches = [...stdout.matchAll(/(\d+)x(\d+)/g)];
  const last = matches[matches.length - 1];
  if (!last) throw new Error(`Could not determine screen size for device ${deviceId}`);
  return { width: Number(last[1]), height: Number(last[2]) };
}

export async function startAndroidSession(
  projectId: string,
  deviceId?: string,
  options?: { screenOff?: boolean }
): Promise<{ deviceId: string; width: number; height: number; screenOff: boolean }> {
  const devices = await backend.listDevices();
  if (devices.length === 0) {
    throw new Error("No Android devices found via ADB. Connect a device/emulator and enable USB debugging.");
  }
  const chosen = deviceId && devices.includes(deviceId) ? deviceId : devices[0];
  currentDeviceId = chosen;

  // Run screen size query and stream initialization in parallel to cut connection latency in half
  const [size] = await Promise.all([
    queryScreenSize(chosen),
    startAndroidStream(chosen, options),
  ]);

  currentScreenSize = size;
  return { deviceId: chosen, ...currentScreenSize, screenOff: isScreenOff() };
}

export function stopAndroidSession(): void {
  if (recording) {
    recording.recorder.abort();
    recording = null;
  }
  void stopAndroidStream();
  currentDeviceId = null;
  currentScreenSize = null;
}

// --- Screen recording ---------------------------------------------------
// Records scrcpy's ORIGINAL H.264 stream (stream-copied, no re-encode), not
// the preview's downscaled JPEGs -- so the preview can be compressed as hard
// as interaction speed demands while recordings stay at source quality.

let recording: {
  projectId: string;
  id: number;
  rel: string;
  recorder: RawRecording;
} | null = null;

export function isAndroidRecording(): boolean {
  return recording !== null;
}

export function startAndroidRecording(projectId: string): { id: number; file: string } {
  if (!currentDeviceId) throw new Error("No active Android session.");
  if (recording) throw new Error("A recording is already in progress.");

  const { id, rel, abs } = nextRecordingPath(projectId);
  recording = { projectId, id, rel, recorder: startRawRecording(abs) };
  return { id, file: rel };
}

export async function stopAndroidRecording(): Promise<{ id: number; file: string; durationSec: number }> {
  if (!recording) throw new Error("No recording in progress.");
  const r = recording;
  recording = null;

  const { width, height, durationSec } = await r.recorder.stop();
  return registerRecording({
    projectId: r.projectId,
    id: r.id,
    rel: r.rel,
    url: `android:${currentDeviceId}`,
    width,
    height,
    durationSec,
    deviceLabel: `Android (${currentDeviceId})`,
  });
}

export interface AndroidAppInfo {
  packageName: string;
  label: string;
}

// Fallback only -- used if scrcpy --list-apps returns nothing for a package
// (shouldn't normally happen, but keeps the dropdown populated either way).
function prettifyPackageName(pkg: string): string {
  const segment = pkg.split(".").filter(Boolean).pop() || pkg;
  return segment
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// scrcpy --list-apps pushes its on-device server and calls Android's real
// PackageManager.getApplicationLabel() -- the only way to get the actual
// localized app name (e.g. "WhatsApp") rather than a guess from the package
// id. Output lines look like " - WhatsApp                com.whatsapp" ('-'
// = third-party, '*' = system); label and package are separated by 2+ spaces.
const LIST_APPS_LINE = /^\s*([*-])\s+(.+?)\s{2,}(\S+)\s*$/;

let appsCache: { deviceId: string; apps: AndroidAppInfo[] } | null = null;

export async function listAndroidApps(forceRefresh = false): Promise<AndroidAppInfo[]> {
  if (!currentDeviceId) throw new Error("No active Android session.");
  if (!forceRefresh && appsCache?.deviceId === currentDeviceId) return appsCache.apps;

  const { stdout } = await execFileAsync(resolveTool("scrcpy"), ["-s", currentDeviceId, "--list-apps"], { timeout: 15000 });
  const apps: AndroidAppInfo[] = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(LIST_APPS_LINE);
    if (!m || m[1] !== "-") continue; // third-party only, matching prior "pm list packages -3" scope
    const [, , label, packageName] = m;
    apps.push({ packageName, label: label.trim() || prettifyPackageName(packageName) });
  }
  apps.sort((a, b) => a.label.localeCompare(b.label));
  appsCache = { deviceId: currentDeviceId, apps };
  return apps;
}

const PACKAGE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export async function launchAndroidApp(packageName: string): Promise<void> {
  if (!currentDeviceId) throw new Error("No active Android session.");
  if (!PACKAGE_NAME_RE.test(packageName)) throw new Error("Invalid package name.");
  sendShellInput(`monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
}

export interface AndroidAction {
  type: "tap" | "swipe" | "key";
  xPct?: number;
  yPct?: number;
  x2Pct?: number;
  y2Pct?: number;
  keycode?: number;
}

export function executeAndroidAction(action: AndroidAction): void {
  if (!currentDeviceId || !currentScreenSize) throw new Error("No active Android session.");
  const { width, height } = currentScreenSize;
  const toX = (pct: number) => Math.round((pct / 100) * width);
  const toY = (pct: number) => Math.round((pct / 100) * height);

  // Sent over the session's persistent shell (see androidStream.ts) rather
  // than spawning a fresh adb process per action -- that per-call spawn +
  // adb-server round trip was the dominant source of touch-to-screen lag.
  switch (action.type) {
    case "tap": {
      if (action.xPct === undefined || action.yPct === undefined) return;
      sendShellInput(`input tap ${toX(action.xPct)} ${toY(action.yPct)}`);
      break;
    }
    case "swipe": {
      if (
        action.xPct === undefined ||
        action.yPct === undefined ||
        action.x2Pct === undefined ||
        action.y2Pct === undefined
      )
        return;
      sendShellInput(
        `input swipe ${toX(action.xPct)} ${toY(action.yPct)} ${toX(action.x2Pct)} ${toY(action.y2Pct)} 150`
      );
      break;
    }
    case "key": {
      if (action.keycode === undefined) return;
      sendShellInput(`input keyevent ${Math.trunc(action.keycode)}`);
      break;
    }
  }
}

// Latest JPEG frame from the live scrcpy stream, for the polled preview
// endpoint. Not a PNG (unlike a one-off screenshot) -- see captureAndroidScreen.
export function getAndroidFrame(): Buffer {
  if (!currentDeviceId) {
    throw new Error("No active Android session.");
  }
  const frame = getLatestStreamFrame();
  if (!frame) {
    throw new Error("Live frame not ready yet.");
  }
  return frame;
}

function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export async function captureAndroidScreen(projectId: string): Promise<{ id: number; file: string }> {
  if (!currentDeviceId) {
    throw new Error("No active Android session.");
  }

  const project = loadProject(projectId);
  const nextId = project.captures.length > 0 ? Math.max(...project.captures.map((c) => c.id)) + 1 : 1;
  const filename = `${nextId}.png`;
  const relPath = path.posix.join("captures", filename);
  const absPath = projectFile(projectId, relPath);

  const buffer = await getLatestFramePng();
  await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
  await fs.promises.writeFile(absPath, buffer);

  const { width, height } = pngSize(buffer);
  const resolutionKey = `${width}x${height}`;
  const deviceLabel = `Android (${currentDeviceId})`;

  const captureInfo = {
    id: nextId,
    file: relPath,
    url: `android:${currentDeviceId}`,
    capturedAt: new Date().toISOString(),
    width,
    height,
    resolution: resolutionKey,
    deviceLabel,
  };
  project.captures.push(captureInfo);

  const srcId = `src_${Date.now()}`;
  const source = {
    id: srcId,
    name: `Screenshot ${nextId} (${resolutionKey})`,
    file: `captures/${filename}`,
    width,
    height,
    resolution: resolutionKey,
    deviceLabel,
  };
  project.mockup.sources.push(source);
  project.video.sources.push(source);

  saveProject(project);
  return { id: nextId, file: relPath };
}
