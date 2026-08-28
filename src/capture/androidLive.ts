import { execFile, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { projectFile, loadProject, saveProject } from "../project/projectStore.js";
import { AndroidCaptureBackend } from "../android/capture.js";

const execFileAsync = promisify(execFile);

const backend = new AndroidCaptureBackend();
let currentDeviceId: string | null = null;
let currentScreenSize: { width: number; height: number } | null = null;
let mirrorProcess: ChildProcess | null = null;

export async function listAndroidDevices(): Promise<string[]> {
  return backend.listDevices();
}

async function queryScreenSize(deviceId: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "wm", "size"]);
  // "wm size" prints "Physical size: WxH" and, if overridden, an additional
  // "Override size: WxH" line — the override (if present) reflects what's
  // actually rendered, so take the LAST match rather than the first.
  const matches = [...stdout.matchAll(/(\d+)x(\d+)/g)];
  const last = matches[matches.length - 1];
  if (!last) throw new Error(`Could not determine screen size for device ${deviceId}`);
  return { width: Number(last[1]), height: Number(last[2]) };
}

// Turning the physical display off while keeping a *live, touch-controllable*
// mirror requires scrcpy's own capture pipeline: its on-device server calls
// Device.setScreenPowerMode(OFF) while capturing the display's SurfaceControl
// layer directly, independent of backlight state. That capture path only
// exists inside scrcpy itself (see scrcpy-gui's --turn-screen-off
// --no-power-on invocation) -- plain `adb shell` (screencap polling, or
// toggling power/brightness) cannot reproduce it. So the live/interactive
// session is the real `scrcpy` binary, opened in its own window exactly like
// the reference app does; our embedded preview card only hosts on-demand
// screenshots (which still work) once scrcpy has taken over the device.
function startScrcpyMirror(deviceId: string): void {
  stopScrcpyMirror();
  const child = spawn(
    "scrcpy",
    ["-s", deviceId, "--turn-screen-off", "--no-power-on", "--stay-awake", "--window-title", "Store Assets Generator - Android"],
    { stdio: "ignore" }
  );
  child.on("error", (err) => {
    console.error(`[SAG-ANDROID] Could not launch scrcpy (${err.message}). Install scrcpy and ensure it's on PATH.`);
  });
  child.on("exit", () => {
    if (mirrorProcess === child) mirrorProcess = null;
  });
  mirrorProcess = child;
}

function stopScrcpyMirror(): void {
  if (mirrorProcess) {
    mirrorProcess.kill();
    mirrorProcess = null;
  }
}

export async function startAndroidSession(
  projectId: string,
  deviceId?: string
): Promise<{ deviceId: string; width: number; height: number }> {
  const devices = await backend.listDevices();
  if (devices.length === 0) {
    throw new Error("No Android devices found via ADB. Connect a device/emulator and enable USB debugging.");
  }
  const chosen = deviceId && devices.includes(deviceId) ? deviceId : devices[0];
  currentDeviceId = chosen;
  currentScreenSize = await queryScreenSize(chosen);
  startScrcpyMirror(chosen); // real live/interactive mirror with the physical screen off, via scrcpy
  return { deviceId: chosen, ...currentScreenSize };
}

export function stopAndroidSession(): void {
  stopScrcpyMirror();
  currentDeviceId = null;
  currentScreenSize = null;
}

export async function listAndroidApps(): Promise<string[]> {
  if (!currentDeviceId) throw new Error("No active Android session.");
  // -3 = third-party (user-installed) packages, the relevant "apps" a user would pick to explore.
  const { stdout } = await execFileAsync("adb", ["-s", currentDeviceId, "shell", "pm", "list", "packages", "-3"]);
  return stdout
    .split("\n")
    .map((line) => line.trim().replace(/^package:/, ""))
    .filter(Boolean)
    .sort();
}

export async function launchAndroidApp(packageName: string): Promise<void> {
  if (!currentDeviceId) throw new Error("No active Android session.");
  await execFileAsync("adb", [
    "-s", currentDeviceId,
    "shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1",
  ]);
}

export interface AndroidAction {
  type: "tap" | "swipe" | "key";
  xPct?: number;
  yPct?: number;
  x2Pct?: number;
  y2Pct?: number;
  keycode?: number;
}

export async function executeAndroidAction(action: AndroidAction): Promise<void> {
  if (!currentDeviceId || !currentScreenSize) throw new Error("No active Android session.");
  const deviceId = currentDeviceId;
  const { width, height } = currentScreenSize;
  const toX = (pct: number) => Math.round((pct / 100) * width);
  const toY = (pct: number) => Math.round((pct / 100) * height);

  switch (action.type) {
    case "tap": {
      if (action.xPct === undefined || action.yPct === undefined) return;
      await execFileAsync("adb", [
        "-s", deviceId, "shell", "input", "tap", String(toX(action.xPct)), String(toY(action.yPct)),
      ]);
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
      await execFileAsync("adb", [
        "-s", deviceId, "shell", "input", "swipe",
        String(toX(action.xPct)), String(toY(action.yPct)),
        String(toX(action.x2Pct)), String(toY(action.y2Pct)),
        "220",
      ]);
      break;
    }
    case "key": {
      if (action.keycode === undefined) return;
      await execFileAsync("adb", ["-s", deviceId, "shell", "input", "keyevent", String(action.keycode)]);
      break;
    }
  }
}

export async function getAndroidFrame(): Promise<Buffer> {
  if (!currentDeviceId) {
    throw new Error("No active Android session.");
  }

  const { stdout } = await execFileAsync(
    "adb",
    ["-s", currentDeviceId, "exec-out", "screencap", "-p"],
    { encoding: "buffer", maxBuffer: 1024 * 1024 * 64 }
  );
  return stdout;
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

  const buffer = await getAndroidFrame();
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
