import { execFile, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import net from "net";
import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { resolveTool } from "../toolchain/binaries.js";
import {
  serializeInjectTouchEvent,
  serializeInjectKeyCode,
  serializeInjectScrollEvent,
  serializeSetDisplayPower,
  serializeRotateDevice,
  ScrcpyStreamParser,
  AndroidMotionEventAction,
  AndroidKeyEventAction,
  ScrcpyMediaPacket,
  SC_POINTER_ID_GENERIC_FINGER,
} from "./scrcpyProtocol.js";

const execFileAsync = promisify(execFile);

const h264Emitter = new EventEmitter();
h264Emitter.setMaxListeners(100);
export function subscribeAndroidH264(cb: (chunk: Buffer) => void): () => void {
  h264Emitter.on("h264", cb);
  return () => h264Emitter.off("h264", cb);
}

// Deprecated frame emitter maintained for backward compatibility
const frameEmitter = new EventEmitter();
frameEmitter.setMaxListeners(100);
export function subscribeAndroidFrames(cb: (frame: Buffer) => void): () => void {
  frameEmitter.on("frame", cb);
  return () => frameEmitter.off("frame", cb);
}

interface StreamSession {
  deviceId: string;
  serverProcess: ChildProcess;
  videoSocket: net.Socket;
  controlSocket: net.Socket;
  localServer: net.Server;
  abstractName: string;
  healthy: boolean;
  savedBrightness: string | null;
  screenOff: boolean;
  autoRotate: boolean;
  latestH264Header: Buffer | null; // Cached SPS/PPS NAL units
  latestKeyFrame: Buffer | null;
  rawSinks: Set<(chunk: Buffer) => void>;
  parser: ScrcpyStreamParser;
  width: number;
  height: number;
}

let session: StreamSession | null = null;
let streamStarting = false;

const MIN_BRIGHTNESS = "1";

export async function startAndroidStream(deviceId: string, options: { screenOff?: boolean } = {}): Promise<void> {
  if (streamStarting) {
    console.log(`[SAG-ANDROID] startAndroidStream: ignoring concurrent start request`);
    return;
  }
  streamStarting = true;
  try {
    await _startAndroidStream(deviceId, options);
  } finally {
    streamStarting = false;
  }
}

async function _startAndroidStream(deviceId: string, options: { screenOff?: boolean } = {}): Promise<void> {
  await stopAndroidStream();

  const adb = resolveTool("adb");
  const scrcpyBin = resolveTool("scrcpy");
  const scrcpyDir = path.dirname(scrcpyBin);
  const scrcpyServerPath = path.join(scrcpyDir, "scrcpy-server");

  if (!fs.existsSync(scrcpyServerPath)) {
    throw new Error(`scrcpy-server not found at ${scrcpyServerPath}`);
  }

  const screenOff = options.screenOff === true;

  // 1. Push scrcpy-server to device (Android app_process requires .jar extension in CLASSPATH).
  // Delete any existing copy first: overwriting the file in place at the same path can leave ART's
  // dexopt/verification cache for that path referencing stale class data, causing a spurious
  // ClassNotFoundException/SIGABRT on app_process launch even though the freshly-written jar is intact.
  console.log(`[SAG-ANDROID] Pushing scrcpy-server to device ${deviceId}...`);
  await execFileAsync(adb, ["-s", deviceId, "shell", "rm", "-f", "/data/local/tmp/scrcpy-server.jar"]).catch(() => {});
  await execFileAsync(adb, ["-s", deviceId, "push", scrcpyServerPath, "/data/local/tmp/scrcpy-server.jar"]);

  // 2. Open a local TCP server and reverse-tunnel the device's abstract socket to it.
  // This matches the topology scrcpy's own desktop client uses by default (tunnel_forward=false):
  // the on-device server connects OUT to us, rather than us connecting IN through `adb forward`.
  // On this hardware, `adb forward` + tunnel_forward=true reliably accepted the TCP handshake but
  // the server then closed the connection immediately with zero bytes written -- `adb reverse`
  // (verified working via the reference scrcpy.exe client) does not have that problem.
  const scid = Math.floor(Math.random() * 0x7fffffff).toString(16).padStart(8, "0");
  const abstractName = `scrcpy_${scid}`;

  const localServer = net.createServer();
  await new Promise<void>((resolve, reject) => {
    localServer.once("error", reject);
    localServer.listen(0, "127.0.0.1", () => resolve());
  });
  const localPort = (localServer.address() as net.AddressInfo).port;

  // The server connects video first, then control -- accept in that order.
  const socketsPromise = new Promise<{ video: net.Socket; control: net.Socket }>((resolve, reject) => {
    let videoSocket: net.Socket | null = null;
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for scrcpy-server to connect back")), 8000);
    localServer.on("connection", (sock) => {
      sock.setNoDelay(true);
      if (!videoSocket) {
        videoSocket = sock;
        console.log(`[SAG-ANDROID] Connected to scrcpy Video socket (reverse tunnel)`);
      } else {
        console.log(`[SAG-ANDROID] Connected to scrcpy Control socket (reverse tunnel)`);
        clearTimeout(timeout);
        resolve({ video: videoSocket, control: sock });
      }
    });
  });

  console.log(`[SAG-ANDROID] Setting up ADB reverse localabstract:${abstractName} tcp:${localPort}`);
  await execFileAsync(adb, ["-s", deviceId, "reverse", `localabstract:${abstractName}`, `tcp:${localPort}`]);

  // 3. Wake device and dismiss keyguard
  execFileAsync(adb, ["-s", deviceId, "shell", "input", "keyevent", "224"]).catch(() => {});
  execFileAsync(adb, ["-s", deviceId, "shell", "wm", "dismiss-keyguard"]).catch(() => {});

  // 4. Launch scrcpy-server on Android device via app_process
  const serverArgs = [
    "-s", deviceId, "shell",
    "CLASSPATH=/data/local/tmp/scrcpy-server.jar",
    "app_process", "/", "com.genymobile.scrcpy.Server", "4.1",
    `scid=${scid}`,
    "tunnel_forward=false",
    "video=true",
    "audio=false",
    "control=true",
    "max_size=1080",
    "video_bit_rate=8000000",
    "max_fps=60",
    "stay_awake=true",
    "send_device_meta=true",
    "send_frame_meta=true",
    "send_dummy_byte=false",
    "send_stream_meta=true",
    "video_codec=h264",
    "video_codec_options=i-frame-interval=1",
  ];

  console.log(`[SAG-ANDROID] Spawning scrcpy-server app_process...`);
  const serverProcess = spawn(adb, serverArgs, { stdio: ["ignore", "pipe", "pipe"] });

  serverProcess.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf-8").trim();
    if (msg) console.log(`[SAG-ANDROID] scrcpy-server: ${msg}`);
  });

  serverProcess.on("exit", (code) => {
    console.log(`[SAG-ANDROID] scrcpy-server exited with code ${code}`);
    if (session?.serverProcess === serverProcess) session.healthy = false;
  });

  // 5. Wait for the server to connect back: Video socket first, then Control socket
  const { video: videoSocket, control: controlSocket } = await socketsPromise;

  // tunnel_forward=false: the server connects OUT to us; DesktopConnection.java only
  // writes the dummy byte inside the tunnelForward=true branch, so never send it here.
  const parser = new ScrcpyStreamParser({
    sendDummyByte: false,
    sendDeviceMeta: true,
    sendCodecMeta: true,
    sendFrameMeta: true,
  });

  const state: StreamSession = {
    deviceId,
    serverProcess,
    videoSocket,
    controlSocket,
    localServer,
    abstractName,
    healthy: true,
    savedBrightness: null,
    screenOff,
    autoRotate: false,
    latestH264Header: null,
    latestKeyFrame: null,
    rawSinks: new Set(),
    parser,
    width: 0,
    height: 0,
  };

  let packetCount = 0;
  // ponytail: packet_merger replicates scrcpy-master/app/src/packet_merger.c
  // Cache the config (SPS+PPS) packet and prepend it to the next media packet so
  // WebCodecs VideoDecoder sees [SPS+PPS+IDR] or [SPS+PPS+delta] in one chunk.
  let pendingConfigBuffer: Buffer | null = null;
  // ponytail: one-shot flag — SET_DISPLAY_POWER(false) must fire exactly once after first IDR,
  // not on every keyframe (~1/sec). Repeated sends can cause OEM encoder stalls on some devices.
  let screenOffApplied = false;

  videoSocket.on("data", (chunk: Buffer) => {
    if (session !== state) return;

    // Parse packet
    parser.parse(chunk, (packet: ScrcpyMediaPacket) => {
      packetCount++;
      const now = new Date().toISOString();
      if (packetCount === 1 || packetCount <= 5 || packetCount % 120 === 0) {
        console.log(`[${now}] [SAG-STREAM] [dev:${deviceId}] Packet #${packetCount}: ${packet.data.length} bytes, keyframe=${packet.isKeyFrame}, config=${packet.isConfig}, pts=${packet.pts}`);
      }

      if (parser.width && parser.height && (state.width !== parser.width || state.height !== parser.height)) {
        state.width = parser.width;
        state.height = parser.height;
        console.log(`[${now}] [SAG-STREAM] [dev:${deviceId}] Stream resolution identified: ${state.width}x${state.height}, deviceName="${parser.deviceName}"`);
      }

      if (packet.isConfig) {
        // Cache SPS/PPS — will be prepended to next media packet (packet_merger pattern)
        state.latestH264Header = packet.data;
        pendingConfigBuffer = packet.data;
        console.log(`[${now}] [SAG-STREAM] [dev:${deviceId}] Cached SPS/PPS config packet #${packetCount} (${packet.data.length} bytes)`);
        // Don't emit config packet standalone; it will ride with the next media packet.
        return;
      }

      // Merge pending config (SPS/PPS) onto the front of this media packet
      let payload = packet.data;
      if (pendingConfigBuffer) {
        payload = Buffer.concat([pendingConfigBuffer, packet.data]);
        console.log(`[${now}] [SAG-STREAM] [dev:${deviceId}] Merged config (${pendingConfigBuffer.length}b) with media packet #${packetCount} -> total ${payload.length}b`);
        pendingConfigBuffer = null;
      }

      // Forward pure Annex-B H.264 NAL payload to active MP4 recording sinks
      for (const sink of state.rawSinks) sink(payload);

      if (packet.isKeyFrame) {
        state.latestKeyFrame = payload;
        console.log(`[${now}] [SAG-STREAM] [dev:${deviceId}] KeyFrame captured on packet #${packetCount} (${payload.length} bytes)`);
      }

      // If screenOff was requested on startup, turn the physical screen off once the first
      // genuine IDR media frame arrives (isKeyFrame=true AND isConfig=false).
      // CRITICAL: must NOT fire on the codec config packet — scrcpy sets both CONFIG and KEY_FRAME
      // flags on the SPS/PPS config packet (Streamer.java). Powering off before an actual IDR
      // frame kills the virtual display before MediaCodec encodes the first real frame, causing
      // zero IDR frames to ever arrive and permanent black screen on the client.
      if (state.screenOff && !screenOffApplied && state.controlSocket?.writable && packet.isKeyFrame && !packet.isConfig) {
        try {
          state.controlSocket.write(serializeSetDisplayPower(false));
          screenOffApplied = true;
          console.log(`[${now}] [SAG-ANDROID] [dev:${deviceId}] SET_DISPLAY_POWER(false) queued on first real IDR frame (packet #${packetCount}).`);
        } catch (err) {
          console.error(`[${now}] [SAG-ANDROID] [dev:${deviceId}] Failed to send deferred SET_DISPLAY_POWER:`, err);
        }
      }

      // Emit merged Annex-B packet to WebCodecs WebSocket clients
      h264Emitter.emit("h264", payload);
    });
  });

  videoSocket.on("error", (err) => {
    console.error(`[SAG-ANDROID] Video socket error: ${err.message}`);
    if (session === state) state.healthy = false;
  });

  videoSocket.on("close", () => {
    if (session === state) state.healthy = false;
  });

  controlSocket.on("error", (err) => {
    console.error(`[SAG-ANDROID] Control socket error: ${err.message}`);
  });

  session = state;
}

// Low-latency binary socket control input functions (<1ms execution)
export function sendScrcpyTouch(action: "down" | "move" | "up", x: number, y: number, width?: number, height?: number): void {
  if (!session || !session.healthy || !session.controlSocket.writable) return;
  const act = action === "down" ? AndroidMotionEventAction.DOWN : action === "up" ? AndroidMotionEventAction.UP : AndroidMotionEventAction.MOVE;
  const streamW = width || session.width || 1080;
  const streamH = height || session.height || 2400;
  const buf = serializeInjectTouchEvent({
    action: act,
    x,
    y,
    width: streamW,
    height: streamH,
    pointerId: SC_POINTER_ID_GENERIC_FINGER,
  });
  session.controlSocket.write(buf);
  if (action !== "move") {
    console.log(`[SAG-TOUCH] ${action} at (${x}, ${y}) streamSize=${streamW}x${streamH}`);
  }
}

export function sendScrcpyKey(keycode: number): void {
  if (!session || !session.healthy || !session.controlSocket.writable) return;
  const downBuf = serializeInjectKeyCode({ action: AndroidKeyEventAction.DOWN, keycode });
  const upBuf = serializeInjectKeyCode({ action: AndroidKeyEventAction.UP, keycode });
  session.controlSocket.write(downBuf);
  session.controlSocket.write(upBuf);
  console.log(`[SAG-KEY] Injected keycode ${keycode}`);
}

export function sendScrcpyScroll(x: number, y: number, width: number, height: number, hscroll: number, vscroll: number): void {
  if (!session || !session.healthy || !session.controlSocket.writable) return;
  const streamW = width || session.width || 1080;
  const streamH = height || session.height || 2400;
  const buf = serializeInjectScrollEvent({ x, y, width: streamW, height: streamH, hscroll, vscroll });
  session.controlSocket.write(buf);
  console.log(`[SAG-SCROLL] at (${x}, ${y}) streamSize=${streamW}x${streamH} vscroll=${vscroll} hscroll=${hscroll}`);
}

export function sendScrcpyRotate(): void {
  if (!session || !session.healthy || !session.controlSocket.writable) return;
  session.controlSocket.write(serializeRotateDevice());
  console.log(`[SAG-ROTATE] Sent ROTATE_DEVICE control message to Android device`);
}

export function sendShellInput(cmd: string, targetDeviceId?: string): void {
  // Legacy shell fallback
  const dev = targetDeviceId || session?.deviceId;
  if (dev) {
    const adb = resolveTool("adb");
    execFileAsync(adb, ["-s", dev, "shell", ...cmd.split(" ")]).catch(() => {});
  }
}

export function sendTouchStream(action: "down" | "move" | "up", x: number, y: number, wasDragged?: boolean, targetDeviceId?: string): void {
  if (session && session.healthy) {
    sendScrcpyTouch(action, x, y, session.width || 1080, session.height || 2400);
  } else {
    sendShellInput(`input motionevent ${action.toUpperCase()} ${x} ${y}`, targetDeviceId);
  }
}

// --- Recording ---------------------------------------------------------
export interface RawRecording {
  stop(): Promise<{ width: number; height: number; durationSec: number }>;
  abort(): void;
}

export function startRawRecording(outPath: string): RawRecording {
  const s = session;
  if (!s) throw new Error("No active Android session.");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  // Use wallclock timestamps on the raw H.264 stream and convert variable-rate scrcpy frames
  // to a steady 30fps CFR MP4 so idle/static pauses match real time instead of rushing through in 2s.
  const proc = spawn(resolveTool("ffmpeg"), [
    "-y",
    "-use_wallclock_as_timestamps", "1",
    "-fflags", "+genpts+discardcorrupt",
    "-f", "h264",
    "-i", "pipe:0",
    "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outPath,
  ], { stdio: ["pipe", "ignore", "pipe"] });

  // Preload SPS/PPS and latest keyframe to guarantee valid H.264 stream header
  if (s.latestH264Header) {
    try { proc.stdin?.write(s.latestH264Header); } catch (_) {}
  }
  if (s.latestKeyFrame) {
    try { proc.stdin?.write(s.latestKeyFrame); } catch (_) {}
  }

  // Request immediate IDR keyframe from scrcpy encoder
  requestKeyFrame();

  let stderr = "";
  proc.stderr?.on("data", (c: Buffer) => { stderr = (stderr + c.toString()).slice(-4000); });
  proc.stdin?.on("error", () => {});
  proc.on("error", () => {});

  let chunksReceived = 0;
  const sink = (chunk: Buffer) => {
    if (proc.stdin?.writable) {
      chunksReceived++;
      proc.stdin.write(chunk);
    }
  };
  s.rawSinks.add(sink);

  const startedAt = Date.now();
  const detach = () => { s.rawSinks.delete(sink); };

  return {
    stop() {
      detach();
      const durationSec = Math.round(((Date.now() - startedAt) / 1000) * 10) / 10;
      return new Promise((resolve, reject) => {
        if (chunksReceived === 0) {
          try { proc.kill(); } catch (_) {}
          reject(new Error("No video was captured -- the live stream produced no frames."));
          return;
        }
        proc.on("exit", (code) => {
          if (code === 0 && fs.existsSync(outPath)) {
            resolve({ width: s.width || 1080, height: s.height || 2400, durationSec });
          } else {
            reject(new Error(`Recording failed (ffmpeg exit ${code}): ${stderr.split("\n").slice(-3).join(" ")}`));
          }
        });
        try { proc.stdin?.end(); } catch (_) {}
      });
    },
    abort() {
      detach();
      try { proc.stdin?.end(); } catch (_) {}
      try { proc.kill(); } catch (_) {}
    },
  };
}

export async function stopAndroidStream(): Promise<void> {
  if (!session) return;
  const s = session;
  session = null;
  s.rawSinks.clear();
  try { s.videoSocket?.destroy(); } catch (_) {}
  try { s.controlSocket?.destroy(); } catch (_) {}
  try { s.serverProcess?.kill(); } catch (_) {}
  try { s.localServer?.close(); } catch (_) {}

  const adb = resolveTool("adb");
  try {
    await execFileAsync(adb, ["-s", s.deviceId, "reverse", "--remove", `localabstract:${s.abstractName}`]);
  } catch (_) {}

  try {
    if (s.savedBrightness && /^\d+$/.test(s.savedBrightness)) {
      await execFileAsync(adb, ["-s", s.deviceId, "shell", "settings", "put", "system", "screen_brightness", s.savedBrightness]);
    }
  } catch (_) {}
}

export function sendScrcpyControlBuffer(buf: Buffer): boolean {
  if (session && session.healthy && session.controlSocket.writable) {
    session.controlSocket.write(buf);
    return true;
  }
  return false;
}

/**
 * Sends TYPE_RESET_VIDEO (opcode 17) to force an immediate IDR keyframe from the encoder.
 * Call this when a new WebSocket client connects so the decoder receives an IDR quickly
 * instead of waiting up to i-frame-interval seconds.
 */
export function requestKeyFrame(): boolean {
  if (!session || !session.healthy || !session.controlSocket.writable) return false;
  // TYPE_RESET_VIDEO = 17, single-byte message, no payload (per ControlMessageReader.java)
  const buf = Buffer.alloc(1);
  buf.writeUInt8(17, 0);
  session.controlSocket.write(buf);
  console.log(`[SAG-ANDROID] TYPE_RESET_VIDEO sent — requesting immediate IDR keyframe.`);
  return true;
}

export function getInitialH264(): { header: Buffer | null; keyFrame: Buffer | null } {
  return {
    header: session?.latestH264Header || null,
    keyFrame: session?.latestKeyFrame || null,
  };
}

export function getLatestStreamFrame(): Buffer | null {
  return session && session.healthy ? (session.latestKeyFrame || session.latestH264Header) : null;
}

export function isStreamHealthy(): boolean {
  return !!session && session.healthy;
}

export function isScreenOff(): boolean {
  return session ? session.screenOff : false;
}

export function isAutoRotate(): boolean {
  return session ? session.autoRotate : false;
}

export async function setAutoRotate(enabled: boolean): Promise<boolean> {
  if (!session) throw new Error("No active Android session.");
  session.autoRotate = enabled;
  const adb = resolveTool("adb");
  try {
    await execFileAsync(adb, [
      "-s",
      session.deviceId,
      "shell",
      "settings",
      "put",
      "system",
      "accelerometer_rotation",
      enabled ? "1" : "0",
    ]);
    console.log(`[SAG-ANDROID] setAutoRotate: accelerometer_rotation set to ${enabled ? "1 (enabled)" : "0 (disabled)"}`);
  } catch (err) {
    console.warn(`[SAG-ANDROID] setAutoRotate failed:`, err);
  }
  return session.autoRotate;
}

export async function setScreenOff(turnOff: boolean): Promise<boolean> {
  if (!session) throw new Error("No active Android session.");
  session.screenOff = turnOff;
  if (session.healthy && session.controlSocket && session.controlSocket.writable) {
    session.controlSocket.write(serializeSetDisplayPower(!turnOff));
  } else {
    // Fallback if control socket is unavailable
    const adb = resolveTool("adb");
    if (turnOff) {
      execFileAsync(adb, ["-s", session.deviceId, "shell", "input", "keyevent", "26"]).catch(() => {});
    } else {
      execFileAsync(adb, ["-s", session.deviceId, "shell", "input", "keyevent", "224"]).catch(() => {});
    }
  }
  return session.screenOff;
}

export async function getLatestFramePng(): Promise<Buffer> {
  if (!session || !session.healthy) throw new Error("No live Android session active.");

  // Combine SPS/PPS config header and latest keyframe to guarantee ffmpeg can decode
  const header = session.latestH264Header;
  const frame = session.latestKeyFrame;
  if (!frame && !header) throw new Error("No live Android H.264 frame available yet.");

  const inputBuffer = header && frame ? Buffer.concat([header, frame]) : (frame || header)!;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(resolveTool("ffmpeg"), [
      "-y",
      "-f", "h264",
      "-i", "pipe:0",
      "-frames:v", "1",
      "-f", "image2pipe",
      "-vcodec", "png",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "ignore"] });
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error(`Failed to convert H.264 frame to PNG (exit ${code})`));
    });
    proc.stdin.end(inputBuffer);
  });
}
