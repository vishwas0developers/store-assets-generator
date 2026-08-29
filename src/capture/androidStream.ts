import { execFile, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import net from "net";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { resolveTool } from "../toolchain/binaries.js";

const execFileAsync = promisify(execFile);

// Frame consumers (the MJPEG multipart route) subscribe here instead of
// polling getLatestStreamFrame() -- pushes each decoded frame the instant
// ffmpeg produces it, which is what actually fixes "the preview is behind /
// laggy": polling on an interval added up to a full interval's worth of
// avoidable delay on top of the encode itself.
const frameEmitter = new EventEmitter();
export function subscribeAndroidFrames(cb: (frame: Buffer) => void): () => void {
  frameEmitter.on("frame", cb);
  return () => frameEmitter.off("frame", cb);
}

// screencap/screenrecord read the physical display buffer, which stops
// updating once the panel is powered off -- verified empirically (screencap
// returns solid black under `dumpsys power` state=OFF). scrcpy's on-device
// server captures the SurfaceControl layer directly, independent of panel
// power, so it can keep producing real frames while the screen is dark.
// We spawn it with --record pointed at a Windows named pipe (verified: scrcpy
// connects and streams matroska/h264 into it) and pipe that into ffmpeg,
// which re-encodes to MJPEG on stdout -- we keep only the latest decoded
// frame in memory for the preview/capture endpoints.
//
// --turn-screen-off alone was tested against real hardware and does NOT keep
// the stream alive indefinitely: without a wake lock, the device reaches
// PowerManager wakefulness=Asleep about 8-10s after the panel goes dark, and
// at that exact moment ALL capture paths freeze -- screencap, screenrecord,
// and scrcpy's own SurfaceControl capture alike (verified with and without a
// visible scrcpy window). --stay-awake is required to hold wakefulness and
// keep frames flowing continuously, but on this hardware it maps to Android's
// "stay awake while charging" policy, which keeps the backlight lit (dimmed,
// not black). That's an accepted, deliberate trade-off: an always-live,
// always touch-controllable preview with a dim (not pitch-black) panel, over
// a black panel that freezes solid after ~8s. See screen_brightness handling
// below, which dims it as far down as the OS allows.
const MIN_BRIGHTNESS = "1";

interface StreamSession {
  deviceId: string;
  scrcpy: ChildProcess;
  ffmpeg: ChildProcess;
  pipeServer: net.Server;
  inputShell: ChildProcess | null;
  latestFrame: Buffer | null;
  buf: Buffer;
  healthy: boolean;
  savedBrightness: string | null;
}

let session: StreamSession | null = null;

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

export async function startAndroidStream(deviceId: string): Promise<void> {
  await stopAndroidStream();

  const adb = resolveTool("adb");
  let savedBrightness: string | null = null;
  // Read and set brightness asynchronously so it doesn't block stream startup
  execFileAsync(adb, ["-s", deviceId, "shell", "settings", "get", "system", "screen_brightness"])
    .then(({ stdout }) => {
      savedBrightness = stdout.trim();
      return execFileAsync(adb, ["-s", deviceId, "shell", "settings", "put", "system", "screen_brightness", MIN_BRIGHTNESS]);
    })
    .catch(() => {});

  const pipeName =
    process.platform === "win32"
      ? String.raw`\\.\pipe\sag-scrcpy-${randomUUID()}`
      : `/tmp/sag-scrcpy-${randomUUID()}.sock`;

  const ffmpeg = spawn(resolveTool("ffmpeg"), [
    "-f", "matroska",
    "-fflags", "nobuffer",
    "-flags", "low_delay",
    "-i", "pipe:0",
    "-f", "mjpeg",
    "-flush_packets", "1",
    "-q:v", "6",
    "-vf", "fps=30",
    "pipe:1",
  ], { stdio: ["pipe", "pipe", "ignore"] });

  const state: StreamSession = {
    deviceId,
    scrcpy: null as any,
    ffmpeg,
    pipeServer: null as any,
    inputShell: null,
    latestFrame: null,
    buf: Buffer.alloc(0),
    healthy: true,
    savedBrightness,
  };

  let frameCount = 0;
  ffmpeg.stdout.on("data", (chunk: Buffer) => {
    state.buf = Buffer.concat([state.buf, chunk]);
    while (true) {
      const soi = state.buf.indexOf(SOI);
      if (soi === -1) break;
      const eoi = state.buf.indexOf(EOI, soi + 2);
      if (eoi === -1) break;
      state.latestFrame = state.buf.subarray(soi, eoi + 2);
      state.buf = state.buf.subarray(eoi + 2);
      frameCount++;
      if (frameCount === 1 || frameCount % 30 === 0) {
        console.log(`[SAG-ANDROID] Decoded frame #${frameCount} (${state.latestFrame.length} bytes)`);
      }
      if (session === state) frameEmitter.emit("frame", state.latestFrame);
    }
  });
  ffmpeg.on("exit", () => {
    if (session === state) state.healthy = false;
  });

  const pipeServer = net.createServer((socket) => {
    console.log(`[SAG-ANDROID] scrcpy connected to named pipe`);
    socket.on("error", (err) => console.error(`[SAG-ANDROID] Pipe error: ${err.message}`));
    socket.pipe(ffmpeg.stdin, { end: false });
  });
  state.pipeServer = pipeServer;

  await new Promise<void>((resolve, reject) => {
    pipeServer.once("error", reject);
    pipeServer.listen(pipeName, () => resolve());
  });

  // Wake device and dismiss lock screen asynchronously (don't block stream startup)
  execFileAsync(adb, ["-s", deviceId, "shell", "input keyevent 224 && input keyevent 82"]).catch(() => {});

  const scrcpy = spawn(
    resolveTool("scrcpy"),
    [
      "-s", deviceId,
      "--no-audio",
      "--no-audio-playback",
      "--no-window",
      "--stay-awake",
      "--keep-active",
      "--max-size=1024",
      "--max-fps=30",
      "--video-bit-rate=8M",
      "--video-codec-options=i-frame-interval=1",
      "--record-format=mkv",
      `--record=${pipeName}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ADB: adb } }
  );

  // Diagnostic logging: capture scrcpy's stderr to see connection/encoding errors
  scrcpy.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf-8").trim();
    if (msg) console.log(`[SAG-ANDROID] scrcpy: ${msg}`);
  });

  scrcpy.on("error", (err) => {
    console.error(`[SAG-ANDROID] Failed to launch scrcpy: ${err.message}`);
    state.healthy = false;
  });
  scrcpy.on("exit", (code) => {
    console.log(`[SAG-ANDROID] scrcpy exited with code ${code}`);
    if (session === state) state.healthy = false;
  });
  state.scrcpy = scrcpy;

  // A single long-lived `adb shell` fed over stdin, instead of spawning a new
  // adb process (fork + new adb-server connection) per tap -- that per-call
  // overhead was the bulk of the perceptible touch lag.
  const inputShell = spawn(adb, ["-s", deviceId, "shell"], { stdio: ["pipe", "ignore", "ignore"] });
  inputShell.on("exit", () => {
    if (session === state) state.inputShell = null;
  });
  state.inputShell = inputShell;

  session = state;
}

// Fire-and-forget input command (e.g. "input tap 500 800") over the
// session's persistent shell. Falls back to execFileAsync if the shell isn't up yet.
export function sendShellInput(cmd: string): void {
  if (session?.inputShell && !session.inputShell.killed && session.inputShell.stdin?.writable) {
    session.inputShell.stdin.write(cmd + "\n");
  } else if (session?.deviceId) {
    const adb = resolveTool("adb");
    execFileAsync(adb, ["-s", session.deviceId, "shell", ...cmd.split(" ")]).catch(() => {});
  }
}

export async function stopAndroidStream(): Promise<void> {
  if (!session) return;
  const s = session;
  session = null;
  try { s.scrcpy?.kill(); } catch (_) {}
  try { s.ffmpeg?.kill(); } catch (_) {}
  try { s.pipeServer?.close(); } catch (_) {}
  try { s.inputShell?.kill(); } catch (_) {}
  try {
    if (s.savedBrightness && /^\d+$/.test(s.savedBrightness)) {
      await execFileAsync(resolveTool("adb"), ["-s", s.deviceId, "shell", "settings", "put", "system", "screen_brightness", s.savedBrightness]);
    }
  } catch (_) {}
  try {
    await execFileAsync(resolveTool("adb"), ["-s", s.deviceId, "shell", "input", "keyevent", "224"]);
  } catch (_) {}
}

export function getLatestStreamFrame(): Buffer | null {
  return session && session.healthy ? session.latestFrame : null;
}

export function isStreamHealthy(): boolean {
  return !!session && session.healthy;
}

// Re-encodes the latest live JPEG frame to a lossless PNG, on demand, so
// saved captures stay PNG (matching what the rest of the app -- e.g. the
// mockup renderer's hardcoded `data:image/png` URIs -- expects) even though
// the live preview itself is JPEG.
export async function getLatestFramePng(): Promise<Buffer> {
  const frame = getLatestStreamFrame();
  if (!frame) throw new Error("No live Android frame available yet.");

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(resolveTool("ffmpeg"), [
      "-f", "mjpeg", "-i", "pipe:0",
      "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "ignore"] });
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error(`Failed to convert live frame to PNG (exit ${code})`));
    });
    proc.stdin.end(frame);
  });
}
