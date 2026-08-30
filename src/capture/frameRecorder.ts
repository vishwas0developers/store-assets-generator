import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { resolveTool } from "../toolchain/binaries.js";
import { loadProject, saveProject, projectFile } from "../project/projectStore.js";

// Both live views (Android via scrcpy, Web via Chrome DevTools screencast)
// already produce a stream of JPEG frames for their previews. Recording just
// tees those same frames into an ffmpeg process that muxes H.264/MP4 -- no
// second capture pipeline on the device or in the browser, so turning
// recording on costs the live preview nothing.
//
// Frames arrive whenever the source changes, not on a fixed clock, so
// -use_wallclock_as_timestamps + an output fps filter is what keeps the
// recording's duration matched to real time instead of playing back fast/slow.

// If the encoder ever falls behind, drop frames rather than buffering them in
// Node's memory -- a laggy recording is acceptable, a laggy live preview (or
// an OOM) is not.
const MAX_PENDING_BYTES = 8 * 1024 * 1024;

export interface FrameRecorder {
  /** Feed one JPEG frame. Silently drops the frame if the encoder is behind. */
  write(frame: Buffer): void;
  /** Flush + wait for a valid, seekable MP4 on disk. Resolves with metadata. */
  stop(): Promise<{ file: string; width: number; height: number; durationSec: number }>;
  /** Kill without producing a file (session teardown while recording). */
  abort(): void;
}

/** Width/height from a JPEG's SOFn marker -- avoids a separate ffprobe spawn. */
export function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0..SOF15, skipping the non-frame markers DHT(c4), JPG(c8), DAC(cc)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

export function startFrameRecorder(outPath: string, fps = 30): FrameRecorder {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const proc: ChildProcess = spawn(
    resolveTool("ffmpeg"),
    [
      "-y",
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-use_wallclock_as_timestamps", "1",
      "-i", "pipe:0",
      // fps normalises the variable-rate input to CFR; the scale rounds to even
      // dimensions, which yuv420p requires.
      "-vf", `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outPath,
    ],
    { stdio: ["pipe", "ignore", "pipe"] }
  );

  let stderr = "";
  proc.stderr?.on("data", (c: Buffer) => {
    stderr = (stderr + c.toString()).slice(-4000);
  });
  // Without a handler an EPIPE on stdin (ffmpeg died) crashes the server.
  proc.stdin?.on("error", () => {});
  proc.on("error", () => {});

  const startedAt = Date.now();
  let size: { width: number; height: number } | null = null;
  let frames = 0;
  let stopped = false;

  return {
    write(frame: Buffer) {
      if (stopped || !proc.stdin?.writable) return;
      if (proc.stdin.writableLength > MAX_PENDING_BYTES) return;
      if (!size) size = jpegSize(frame);
      frames++;
      proc.stdin.write(frame);
    },

    stop() {
      stopped = true;
      const durationSec = (Date.now() - startedAt) / 1000;
      return new Promise((resolve, reject) => {
        if (frames === 0) {
          try { proc.kill(); } catch (_) {}
          reject(new Error("No frames were recorded -- is the live preview running?"));
          return;
        }
        proc.on("exit", (code) => {
          if (code === 0 && fs.existsSync(outPath)) {
            resolve({
              file: outPath,
              width: size?.width ?? 0,
              height: size?.height ?? 0,
              durationSec: Math.round(durationSec * 10) / 10,
            });
          } else {
            reject(new Error(`Recording failed (ffmpeg exit ${code}): ${stderr.split("\n").slice(-3).join(" ")}`));
          }
        });
        try { proc.stdin?.end(); } catch (_) { }
      });
    },

    abort() {
      stopped = true;
      try { proc.stdin?.end(); } catch (_) {}
      try { proc.kill(); } catch (_) {}
    },
  };
}

/** Next free capture id + its `captures/<id>.mp4` path, same numbering as screenshots. */
export function nextRecordingPath(projectId: string): { id: number; rel: string; abs: string } {
  const project = loadProject(projectId);
  const id = project.captures.length > 0 ? Math.max(...project.captures.map((c) => c.id)) + 1 : 1;
  const rel = `captures/${id}.mp4`;
  return { id, rel, abs: projectFile(projectId, rel) };
}

/** Registers a finished recording in project.captures + video.sources (kind: "video"). */
export function registerRecording(opts: {
  projectId: string;
  id: number;
  rel: string;
  url: string;
  width: number;
  height: number;
  durationSec: number;
  deviceLabel: string;
}): { id: number; file: string; durationSec: number } {
  const project = loadProject(opts.projectId);
  const resolution = `${opts.width}x${opts.height}`;

  project.captures.push({
    id: opts.id,
    file: opts.rel,
    url: opts.url,
    capturedAt: new Date().toISOString(),
    width: opts.width,
    height: opts.height,
    resolution,
    deviceLabel: opts.deviceLabel,
    kind: "video",
    durationSec: opts.durationSec,
  });

  // Video sources only -- the mockup renderer composites still images, so a
  // recording has nothing to contribute there.
  project.video.sources.push({
    id: `src_${Date.now()}`,
    name: `Recording ${opts.id} (${opts.durationSec}s)`,
    file: opts.rel,
    width: opts.width,
    height: opts.height,
    resolution,
    deviceLabel: opts.deviceLabel,
    kind: "video",
  });

  saveProject(project);
  return { id: opts.id, file: opts.rel, durationSec: opts.durationSec };
}
