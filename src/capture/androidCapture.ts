import fs from "fs";
import path from "path";
import { AndroidCaptureBackend } from "../android/capture.js";
import { captureDir, saveCaptureSession, type CaptureSession, type RawScreenshot } from "./store.js";

/**
 * Android Capture — the second side-nav section of the Screen Capture tab,
 * over the existing (kept, not disabled) AndroidCaptureBackend. Independent
 * capture path from Website Capture; both write into the same
 * CaptureSession.raw[] but are otherwise unrelated interfaces.
 */

export async function listAndroidDevices(): Promise<string[]> {
  return new AndroidCaptureBackend().listDevices();
}

export interface AndroidCaptureRequest {
  deviceId?: string;
  /** Optional deep link to open before capturing (am start -a VIEW -d). */
  deepLink?: string;
  title?: string;
}

export async function captureAndroidScreen(session: CaptureSession, request: AndroidCaptureRequest): Promise<CaptureSession> {
  const backend = new AndroidCaptureBackend();
  if (request.deepLink) await backend.launchDeepLink(request.deepLink, request.deviceId);

  const rawDir = path.join(captureDir(session.id), "raw");
  fs.mkdirSync(rawDir, { recursive: true });
  const index = session.raw.length + 1;
  const filename = `screen_${index}.png`;
  const localPath = await backend.captureScreen(filename, { outputDir: rawDir, deviceId: request.deviceId });

  // Real pixel dimensions from the device capture, not an assumed viewport.
  const { width, height } = pngSize(localPath);

  const screenshot: RawScreenshot = {
    id: `screen_${index}`,
    url: request.deepLink ?? request.deviceId ?? "android-device",
    title: request.title || `Android Screen ${index}`,
    file: path.posix.join("raw", filename),
    width,
    height,
    source: "android",
  };
  session.raw = [...session.raw, screenshot];
  saveCaptureSession(session);
  return session;
}

function pngSize(absPath: string): { width: number; height: number } {
  const buf = fs.readFileSync(absPath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
