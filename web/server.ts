import http from "http";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { WebSocketServer, WebSocket } from "ws";
import {
  setCredentials,
  getCredentialStatus,
  clearCredentials,
} from "../src/auth/credentials.js";
import {
  listProviders,
  getProvider,
  upsertProvider,
  deleteProvider,
  listModels,
  saveModels,
  deleteModel,
  getDefaultModel,
  setDefaultModel,
} from "../src/ai/registry.js";
import { setProviderKey, clearProviderKey } from "../src/ai/keystore.js";
import { fetchModelsForProvider, testProvider, isDiscoveryError } from "../src/ai/adapters.js";
import { chat, extractJsonArray } from "../src/ai/chat.js";
import { DEVICE_REGISTRY, listDevices, reloadRegistry } from "../src/devices/registry.js";
import { buildFrameSvg } from "../src/devices/build-frame-svg.js";
import { getDeviceGlbPath, createDevice, deleteDevice, archiveDevice } from "../src/devices/device-manager.js";
import { DEVICES_2D_DIR, DEVICES_CSS_DIR } from "../src/devices/paths.js";
import { listVideoDevices, listCssDevices, reloadCssDevices, resolveRigAsset, isDeviceCompatible, devicePreviewHtml, sync2dDeviceFiles } from "../src/devices/rig-assets.js";
import { loadPlatformSpec } from "../src/platform/index.js";

import {
  createApplication,
  listApplications,
  loadApplication,
  saveApplication,
  deleteApplication,
  deleteApplicationCapture,
  discardDraft,
  applicationDir,
  applicationFile,
} from "../src/application/applicationStore.js";
import {
  startBrowserSession,
  stopBrowserSession,
  executeBrowserAction,
  getBrowserFrame,
  captureBrowserScreen,
  startBrowserRecording,
  stopBrowserRecording,
  isBrowserRecording,
  resolveResolutionKeyForCategory,
} from "../src/capture/liveBrowser.js";
import { isDeviceCategory, DEVICE_CATEGORIES_LIST } from "../src/capture/deviceCategories.js";
import archiver from "archiver";
import { invalidateDataUri } from "../src/render/shared.js";

import {
  listAndroidDevices,
  startAndroidSession,
  stopAndroidSession,
  getAndroidFrame,
  captureAndroidScreen,
  listAndroidApps,
  launchAndroidApp,
  executeAndroidAction,
  subscribeAndroidFrames,
  subscribeAndroidH264,
  getInitialH264,
  sendScrcpyControlBuffer,
  startAndroidRecording,
  stopAndroidRecording,
  isAndroidRecording,
  isAndroidScreenOff,
  setAndroidScreenOff,
  isAndroidAutoRotate,
  setAndroidAutoRotate,
} from "../src/capture/androidLive.js";

import {
  getToolchainStatus,
  setCustomDir,
  ensureBinaries,
} from "../src/toolchain/binaries.js";

import {
  addColumn,
  addDeviceRow,
  defaultColumnStyle,
  listMockupApplications,
  loadMockupApplication,
  mockupDir,
  mockupFile,
  saveMockupApplication,
  setCellOverride,
  setCellOverridePath,
  updateColumnStyle,
  type ColumnStyle,
  type MockupDeviceRow,
} from "../src/mockup/application.js";
import { groupedLayoutPresets, listLayoutPresets } from "../src/mockup/layouts.js";
import { cellPreviewHtml, renderTemplateDetailThumbs, renderTemplateThumbs, templateThumbHtml, templateDetailThumbHtml, templateScreenHtml } from "../src/mockup/render.js";
import { exportMockupApplication, exportSingleScreen, exportPanoramicBanner } from "../src/mockup/export.js";
import { MOCKUP_TEMPLATES, applyMockupTemplate, getMockupTemplateFromDisk, updateTemplateFromApplication, createTemplateFromApplication } from "../src/mockup/templates.js";
import { sizeTargetsFor } from "../src/mockup/sizeTargets.js";

import {
  listVideoApplications,
  loadVideoApplication,
  saveVideoApplication,
  videoDir,
  videoFile,
  type VideoExportRecord,
} from "../src/video/application.js";
import { SCENE_ANIMATIONS, detectBestH264Encoder, ensureGeneratedBgm, listSceneAnimations, listSceneLayouts, listVideoBackgrounds, renderVideo, RenderCancelled, type RenderOptions, type RenderProgress, renderVideoTemplateThumbs, sceneHtml, scenePreviewHtml, sourceKindsFor, sourceUrisFor, templatePreviewHtml } from "../src/video/render.js";
import { EXPORT_PRESETS } from "../src/video/exportPresets.js";
import { listTemplateBackgrounds } from "../src/video/templateBackgrounds.js";
import { VIDEO_TEMPLATES, applyVideoTemplate, resolveTemplateId, scratchVideoApplication, loadAllTemplates, updateVideoTemplateOnDisk, createVideoTemplateOnDisk } from "../src/video/templates.js";
import { BGM_PRESETS, renderBgmWav } from "../src/video/bgm.js";
import { slotSpecsForScene, validateScene, type SlotIssue } from "../src/video/slots.js";
import { type SlotValue } from "../src/video/application.js";

/**
 * Local-only manual workflow surface -- a thin HTTP adapter over three
 * fully independent application stores (Screen Capture / Studio Mockup /
 * Video, see src/{capture,mockup,video}/*), matching the three-tab shell
 * in web/index.html. Nothing here carries state from one namespace to
 * another; that is by design (see docs/ARCHITECTURE.md).
 *
 * Binds to 127.0.0.1 only -- never exposed to the network, per
 * docs/AUTHENTICATION.md's security requirements around credential handling.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.join(__dirname, "index.html");

// In-flight concurrency lock to prevent parallel browser process storms
const pendingThumbRenders = new Map<string, Promise<void>>();
async function renderThumbsOnce(key: string, fn: () => Promise<void>): Promise<void> {
  if (!pendingThumbRenders.has(key)) {
    const p = fn().finally(() => pendingThumbRenders.delete(key));
    pendingThumbRenders.set(key, p);
  }
  return pendingThumbRenders.get(key)!;
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {};
  return JSON.parse(raw);
}

const MAX_UPLOAD_BYTES = (Number(process.env.SAG_MAX_UPLOAD_MB) || 25) * 1024 * 1024;

interface RenderJob {
  id: string;
  applicationId: string;
  configId?: string;
  state: "running" | "done" | "error" | "cancelled";
  cancelRequested?: boolean;
  abortController?: AbortController;
  progress: RenderProgress;
  error?: string;
  outputFile?: string;
  fileName?: string;
  format: "mp4" | "webm";
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationSec?: number;
  savedPath?: string;
  options: RenderOptions;
  startedAt: string;
  finishedAt?: string;
}

const renderJobs = new Map<string, RenderJob>();

function cleanupOldRenderJobs() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of renderJobs.entries()) {
    if (job.state !== "running" && new Date(job.startedAt).getTime() < oneHourAgo) {
      renderJobs.delete(id);
    }
  }
}
setInterval(cleanupOldRenderJobs, 10 * 60 * 1000);

function getRunningJobForApplication(applicationId: string): RenderJob | undefined {
  for (const job of renderJobs.values()) {
    if (job.applicationId === applicationId && job.state === "running") return job;
  }
  return undefined;
}

function startRenderJob(application: any, opts: RenderOptions = {}, meta: { configId?: string } = {}): { job: RenderJob; isNew: boolean } {
  const existing = getRunningJobForApplication(application.id);
  if (existing) {
    return { job: existing, isNew: false };
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const abortController = new AbortController();
  const format = opts.format === "webm" ? "webm" : "mp4";

  const job: RenderJob = {
    id: jobId,
    applicationId: application.id,
    configId: meta.configId,
    state: "running",
    progress: {
      phase: "preparing",
      percent: 0,
      message: "Starting render...",
    },
    format,
    options: { ...opts },
    abortController,
    startedAt: new Date().toISOString(),
  };

  renderJobs.set(jobId, job);

  // Run render asynchronously
  (async () => {
    try {
      const renderOpts: RenderOptions = {
        ...opts,
        signal: abortController.signal,
      };

      const finalVideoPath = await renderVideo(
        application,
        renderOpts,
        (progress) => {
          job.progress = { ...progress };
          if (progress.width) job.width = progress.width;
          if (progress.height) job.height = progress.height;
        }
      );

      job.state = "done";
      job.outputFile = finalVideoPath;
      job.finishedAt = new Date().toISOString();

      try {
        const stats = fs.statSync(finalVideoPath);
        job.sizeBytes = stats.size;
        job.fileName = path.basename(finalVideoPath);
      } catch {}

      // Calculate width, height, durationSec
      const scenes = opts.sceneRange
        ? [...application.scenes].sort((a, b) => a.order - b.order).slice(opts.sceneRange[0] - 1, opts.sceneRange[1])
        : application.scenes;
      const totalSec = scenes.reduce((s: number, sc: any) => s + Math.max(1, sc.durationSeconds), 0);
      job.durationSec = Math.round(totalSec * 10) / 10;

      // Handle saveTo if requested
      if (opts.saveTo) {
        try {
          fs.mkdirSync(path.dirname(opts.saveTo), { recursive: true });
          fs.copyFileSync(finalVideoPath, opts.saveTo);
          job.savedPath = opts.saveTo;
        } catch (err: any) {
          console.warn("Failed to copy rendered video to saveTo location:", err?.message);
        }
      }

      // If this was a main application render, update application.outputs.video
      if (!meta.configId) {
        try {
          const freshProj = loadVideoApplication(application.id);
          freshProj.outputs.video = path.relative(videoDir(application.id), finalVideoPath).split(path.sep).join("/");

          // Also record in application export history (up to 20 newest)
          freshProj.exports = freshProj.exports || [];
          freshProj.exports.unshift({
            id: `exp_${Date.now()}`,
            fileName: path.basename(finalVideoPath),
            format,
            width: job.width || (opts.orientation === "landscape" ? 1920 : opts.orientation === "square" ? 1080 : 1080),
            height: job.height || (opts.orientation === "landscape" ? 1080 : opts.orientation === "square" ? 1080 : 1920),
            fps: opts.fps || 30,
            durationSec: job.durationSec || 0,
            sizeBytes: job.sizeBytes || 0,
            sceneRange: opts.sceneRange,
            configId: meta.configId,
            savedPath: job.savedPath,
            createdAt: new Date().toISOString(),
          });
          freshProj.exports = freshProj.exports.slice(0, 20);
          saveVideoApplication(freshProj);
        } catch (err) {
          console.warn("Could not record export in application.json:", err);
        }
      } else {
        // Also copy to config_<cfgId>.<ext> for legacy download compatibility
        try {
          const cfgPath = path.join(videoDir(application.id), `config_${meta.configId}.${format}`);
          fs.copyFileSync(finalVideoPath, cfgPath);

          const freshProj = loadVideoApplication(application.id);
          freshProj.exports = freshProj.exports || [];
          freshProj.exports.unshift({
            id: `exp_${Date.now()}`,
            fileName: path.basename(finalVideoPath),
            format,
            width: job.width || 1080,
            height: job.height || 1920,
            fps: opts.fps || 30,
            durationSec: job.durationSec || 0,
            sizeBytes: job.sizeBytes || 0,
            sceneRange: opts.sceneRange,
            configId: meta.configId,
            savedPath: job.savedPath,
            createdAt: new Date().toISOString(),
          });
          freshProj.exports = freshProj.exports.slice(0, 20);
          saveVideoApplication(freshProj);
        } catch (err) {
          console.warn("Could not copy config export:", err);
        }
      }
    } catch (err: any) {
      if (err instanceof RenderCancelled || abortController.signal.aborted) {
        job.state = "cancelled";
        job.progress = { phase: "cancelled", percent: job.progress.percent, message: "Render cancelled." };
      } else {
        job.state = "error";
        job.error = err?.message || String(err);
        job.progress = { phase: "error", percent: job.progress.percent, message: job.error || "Render error." };
      }
      job.finishedAt = new Date().toISOString();
    }
  })();

  return { job, isNew: true };
}

async function readRawBody(req: http.IncomingMessage, maxBytes = MAX_UPLOAD_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > maxBytes) {
      throw new Error(`Upload payload exceeds the limit of ${Math.round(maxBytes / (1024 * 1024))}MB.`);
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function sendJson(res: http.ServerResponse, status: number, body: any): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

function sendFile(res: http.ServerResponse, filePath: string, contentType: string): void {
  if (!fs.existsSync(filePath)) {
    sendError(res, 404, "File not found");
    return;
  }
  // No ETag/Last-Modified was ever sent here, so browsers were free to serve
  // a stale cached copy of app.css/web/js/*.js on ordinary navigation with
  // no revalidation at all -- editors kept seeing old bugs "come back" after
  // a fix that had already landed on disk. These are local dev-server files
  // (reading from disk is effectively free), so always force revalidation.
  res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache" });
  fs.createReadStream(filePath).pipe(res);
}

/** sendFile plus HTTP Range support. <video>/<audio> can only seek (set currentTime)
 *  on a source that answers byte-range requests; without this a recording plays
 *  from the start but every seek is ignored, so the scene editor's frame-by-frame
 *  preview sits frozen on one frame. */
function sendFileRanged(req: http.IncomingMessage, res: http.ServerResponse, filePath: string, contentType: string): void {
  if (!fs.existsSync(filePath)) {
    sendError(res, 404, "File not found");
    return;
  }
  const size = fs.statSync(filePath).size;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (!m || (m[1] === "" && m[2] === "")) {
    res.writeHead(200, { "Content-Type": contentType, "Content-Length": size, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" });
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  // "bytes=-N" is the last N bytes; otherwise start[-end].
  const start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  const end = m[1] === "" || m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start > end || start >= size) {
    res.writeHead(416, { "Content-Range": `bytes */${size}` });
    res.end();
    return;
  }
  res.writeHead(206, {
    "Content-Type": contentType,
    "Content-Length": end - start + 1,
    "Content-Range": `bytes ${start}-${end}/${size}`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

function validateApplication(application: { template: string | null; scenes: { id: string; order: number; slotValues?: Record<string, SlotValue>; sourceId?: string; screenIds?: string[]; text?: string; subtext?: string }[] }) {
  const scenes = application.template
    ? application.scenes.map((scene) => {
        const specs = slotSpecsForScene(application.template as string, scene.order);
        const slotValues = { ...(scene.slotValues ?? {}) };
        if (!slotValues.text && scene.text) {
          slotValues.text = { kind: "text", value: scene.text };
        }
        if (!slotValues.subtext && scene.subtext) {
          slotValues.subtext = { kind: "text", value: scene.subtext };
        }
        if (!slotValues.screenshot && scene.sourceId) {
          slotValues.screenshot = { kind: "image", sourceId: scene.sourceId };
        }
        if (!slotValues.screenshots && (scene.screenIds || scene.sourceId)) {
          slotValues.screenshots = { kind: "imageList", sourceIds: scene.screenIds || (scene.sourceId ? [scene.sourceId] : []) };
        }
        const issues: SlotIssue[] = validateScene(specs, slotValues);
        return { sceneId: scene.id, issues };
      })
    : [];
  const ready = scenes.every((s) => s.issues.every((i) => i.severity !== "error"));
  return { ready, scenes };
}

function sniffImageFormat(buf: Buffer): "png" | "jpeg" | "webp" | "gif" | "svg" | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.length >= 6 && buf.toString("ascii", 0, 3) === "GIF") return "gif";
  if (/<svg[\s>]/i.test(buf.toString("utf8", 0, 1024))) return "svg";
  return null;
}

function imageExtFor(format: ReturnType<typeof sniffImageFormat>): string {
  return format === "jpeg" ? "jpg" : format ?? "png";
}

function imageDimensions(buf: Buffer, format: ReturnType<typeof sniffImageFormat>): { width: number; height: number } | null {
  try {
    if (format === "png" && buf.length >= 24) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (format === "gif" && buf.length >= 10) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (format === "jpeg") {
      let offset = 2;
      while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) break;
        const marker = buf[offset + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
        }
        const segLen = buf.readUInt16BE(offset + 2);
        offset += 2 + segLen;
      }
      return null;
    }
    if (format === "webp" && buf.length >= 30) {
      const chunk = buf.toString("ascii", 12, 16);
      if (chunk === "VP8X") {
        return { width: 1 + (buf.readUIntLE(24, 3)), height: 1 + buf.readUIntLE(27, 3) };
      }
      if (chunk === "VP8 ") {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      }
      if (chunk === "VP8L") {
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

let processGuardsInstalled = false;

/** Keeps a single unexpected rejection/throw (e.g. from a WS message handler or a fire-and-forget async call) from silently killing the dev server. */
function installProcessGuards(): void {
  if (processGuardsInstalled) return;
  processGuardsInstalled = true;
  process.on("unhandledRejection", (reason) => {
    console.error("[SAG-SERVER] Unhandled promise rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[SAG-SERVER] Uncaught exception:", err);
  });
}

export async function startWebServer(options: { port?: number; host?: string; openBrowser?: boolean } = {}): Promise<http.Server> {
  try { sync2dDeviceFiles(); } catch (e) { console.error("[devices] 2D asset sync failed:", e); }
  installProcessGuards();
  console.log(`[SAG-SERVER] Starting -- cwd=${process.cwd()} node=${process.version} file=${import.meta.url}`);
  const port = options.port || 8787;
  const host = options.host || "127.0.0.1";

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res);
    } catch (err: any) {
      console.error("[SAG-SERVER] Unhandled error in request handler:", err);
      if (!res.headersSent) {
        sendError(res, 500, err?.message || "Internal server error");
      } else {
        try { res.end(); } catch {}
      }
    }
  });

  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const p = url.pathname;
    const method = req.method?.toUpperCase();

    // Request log: one line per API call / page asset with status + timing. Static
    // frame polling and asset files are skipped (hundreds per minute, pure noise);
    // failures (>=400) are always logged.
    const started = Date.now();
    res.on("finish", () => {
      const noisy = /\/frame(\?|$)|\.(png|jpe?g|webp|svg|ico|woff2?|wav|mp3|mp4|webm)$/i.test(p) || p.startsWith("/vendor/");
      if (noisy && res.statusCode < 400) return;
      console.log(`[SAG-HTTP] ${method} ${p} -> ${res.statusCode} (${Date.now() - started}ms)`);
    });

    // CORS headers for local development if accessed from local web server
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Static assets
    if (method === "GET" && (p === "/" || p === "/index.html")) {
      const htmlPath = fs.existsSync(path.join(process.cwd(), "web", "index.html"))
        ? path.join(process.cwd(), "web", "index.html")
        : INDEX_HTML_PATH;
      sendFile(res, htmlPath, "text/html; charset=utf-8");
      return;
    }

    if (method === "GET" && p.startsWith("/vendor/")) {
      let vendorPath = path.join(process.cwd(), "web", p);
      if (!fs.existsSync(vendorPath)) {
        vendorPath = path.join(__dirname, p);
      }
      if (!fs.existsSync(vendorPath)) {
        if (p === "/vendor/sweetalert2/dark.min.css") {
          vendorPath = path.join(process.cwd(), "node_modules", "@sweetalert2", "theme-dark", "dark.css");
        } else if (p === "/vendor/sweetalert2/sweetalert2.min.js") {
          vendorPath = path.join(process.cwd(), "node_modules", "sweetalert2", "dist", "sweetalert2.all.min.js");
        } else if (p === "/vendor/three/build/three.module.js") {
          vendorPath = path.join(process.cwd(), "node_modules", "three", "build", "three.module.js");
        } else if (p.startsWith("/vendor/three/")) {
          // Generic fallback: /vendor/three/<subpath> -> node_modules/three/<subpath>
          const sub = p.replace("/vendor/three/", "");
          vendorPath = path.join(process.cwd(), "node_modules", "three", sub);
        }
      }
      let contentType = "application/javascript";
      if (p.endsWith(".css")) contentType = "text/css";
      else if (p.endsWith(".json")) contentType = "application/json";
      sendFile(res, vendorPath, contentType);
      return;
    }

    if (method === "GET" && (p === "/app.js" || p === "/app.css")) {
      let assetPath = path.join(process.cwd(), "web", p);
      if (!fs.existsSync(assetPath)) {
        assetPath = path.join(__dirname, p);
      }
      const contentType = p.endsWith(".js") ? "application/javascript" : "text/css";
      sendFile(res, assetPath, contentType);
      return;
    }

    // Centralized font directory (fonts/<Family>/<file>.woff2) -- one copy shared by the editor page and the renderer.
    if (method === "GET" && /^\/fonts\/[\w-]+\/[\w.-]+\.woff2$/.test(p)) {
      const fontPath = path.join(process.cwd(), p);
      if (fs.existsSync(fontPath)) {
        sendFile(res, fontPath, "font/woff2");
        return;
      }
    }

    if (method === "GET" && p.startsWith("/js/")) {
      let jsPath = path.join(process.cwd(), "web", p);
      if (!fs.existsSync(jsPath)) {
        jsPath = path.join(__dirname, "..", "..", "dist", "web", p);
      }
      if (fs.existsSync(jsPath)) {
        const contentType = p.endsWith(".js") ? "application/javascript" : "text/css";
        sendFile(res, jsPath, contentType);
        return;
      }
    }

    // Serves compiled shared TS modules (currently just layerLayout.ts) that
    // browser code (web/js/canvas.js) imports directly as plain ES modules --
    // see src/mockup/layerLayout.ts's doc comment for why this exists (the
    // single source of truth for z-order/font-size formulas previously
    // hand-duplicated between render.ts and canvas.js). tsc's outDir is
    // "./dist" with rootDir "./", so src/mockup/*.ts lands at
    // dist/src/mockup/*.js -- this route maps the shorter /dist/mockup/...
    // URL browser code uses onto that real compiled path.
    if (method === "GET" && p.startsWith("/dist/mockup/")) {
      const rel = p.replace("/dist/mockup/", "");
      const jsPath = path.join(process.cwd(), "dist", "src", "mockup", rel);
      if (fs.existsSync(jsPath)) {
        sendFile(res, jsPath, "application/javascript");
        return;
      }
    }

    if (p === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

    // =========================================================
    // Toolchain & Binary Manager API
    // =========================================================
    if (method === "GET" && p === "/api/toolchain/status") {
      sendJson(res, 200, getToolchainStatus());
      return;
    }

    if (method === "POST" && p === "/api/toolchain/config") {
      const body = await readJsonBody(req);
      const status = setCustomDir(body.customDir !== undefined ? body.customDir : null);
      sendJson(res, 200, status);
      return;
    }

    if (method === "POST" && p === "/api/toolchain/download") {
      try {
        await ensureBinaries();
        sendJson(res, 200, { ok: true, status: getToolchainStatus() });
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to download binaries");
      }
      return;
    }

    // AI Provider Management
    if (method === "GET" && p === "/api/ai/providers") {
      sendJson(res, 200, { providers: listProviders() });
      return;
    }

    if (method === "POST" && p === "/api/ai/providers") {
      const body = await readJsonBody(req);
      if (!body.id || !body.baseUrl) {
        return sendError(res, 400, "Missing required provider fields (id, baseUrl)");
      }
      upsertProvider(body.id, {
        adapter: body.adapter || "openai-compatible",
        baseUrl: body.baseUrl,
        enabled: body.enabled !== false,
        requiresKey: body.requiresKey !== false,
      });
      if (body.apiKey) setProviderKey(body.id, body.apiKey);
      sendJson(res, 201, getProvider(body.id));
      return;
    }

    {
      const m = p.match(/^\/api\/ai\/providers\/([^/]+)$/);
      if (m && method === "GET") {
        const provider = getProvider(decodeURIComponent(m[1]));
        if (!provider) return sendError(res, 404, "Provider not found");
        sendJson(res, 200, provider);
        return;
      }
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        upsertProvider(decodeURIComponent(m[1]), body);
        const provider = getProvider(decodeURIComponent(m[1]));
        sendJson(res, 200, provider);
        return;
      }
      if (m && method === "DELETE") {
        deleteProvider(decodeURIComponent(m[1]));
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/ai\/providers\/([^/]+)\/key$/);
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        if (typeof body.apiKey !== "string") return sendError(res, 400, "apiKey is required");
        setProviderKey(decodeURIComponent(m[1]), body.apiKey);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (m && method === "DELETE") {
        clearProviderKey(decodeURIComponent(m[1]));
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (method === "GET" && p === "/api/ai/models") {
      sendJson(res, 200, { models: listModels(), defaultModel: getDefaultModel() });
      return;
    }

    if (method === "POST" && p === "/api/ai/models") {
      const body = await readJsonBody(req);
      if (Array.isArray(body.models)) {
        saveModels(body.models);
      }
      if (body.defaultModel) {
        setDefaultModel(body.defaultModel.provider, body.defaultModel.modelId);
      }
      sendJson(res, 200, { models: listModels(), defaultModel: getDefaultModel() });
      return;
    }

    {
      const m = p.match(/^\/api\/ai\/models\/([^/]+)\/([^/]+)$/);
      if (m && method === "DELETE") {
        deleteModel(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/ai\/providers\/([^/]+)\/fetch-models$/);
      if (m && method === "POST") {
        const providerId = decodeURIComponent(m[1]);
        const provider = getProvider(providerId);
        if (!provider) return sendError(res, 404, "Provider not found");
        try {
          const models = await fetchModelsForProvider(provider);
          sendJson(res, 200, { models });
        } catch (err: any) {
          if (isDiscoveryError(err)) {
            sendJson(res, 200, {
              models: [],
              discoveryNotSupported: true,
              message: err.message,
            });
          } else {
            sendError(res, 500, err.message || "Failed to fetch models");
          }
        }
        return;
      }
    }

    {
      const m = p.match(/^\/api\/ai\/providers\/([^/]+)\/test$/);
      if (m && method === "POST") {
        const providerId = decodeURIComponent(m[1]);
        const provider = getProvider(providerId);
        if (!provider) return sendError(res, 404, "Provider not found");
        const result = await testProvider(provider);
        sendJson(res, 200, result);
        return;
      }
    }

    if (method === "GET" && p === "/api/ai/default-model") {
      sendJson(res, 200, getDefaultModel() || { providerId: null, modelId: null });
      return;
    }

    if (method === "PUT" && p === "/api/ai/default-model") {
      const body = await readJsonBody(req);
      if (!body.providerId || !body.modelId) {
        return sendError(res, 400, "providerId and modelId are required");
      }
      setDefaultModel(body.providerId, body.modelId);
      sendJson(res, 200, { ok: true });
      return;
    }

    // Devices & Platform Specs
    if (method === "GET" && p === "/api/devices") {
      sendJson(res, 200, { devices: listDevices() });
      return;
    }

    {
      const m = p.match(/^\/api\/devices\/([^/]+)\/glb$/);
      if (m && method === "GET") {
        const deviceId = decodeURIComponent(m[1]);
        const dev = DEVICE_REGISTRY[deviceId];
        if (!dev) return sendError(res, 404, `Device '${deviceId}' not found.`);
        const glbPath = await getDeviceGlbPath(dev.definition);
        if (!glbPath || !fs.existsSync(glbPath)) return sendError(res, 404, `No GLB model found for device '${deviceId}'.`);
        sendFile(res, glbPath, "model/gltf-binary");
        return;
      }
    }

    // One registry for every device (2D/3D x SVG/GLB/CSS). `type=2D|3D` returns only that mode.
    if (method === "GET" && p === "/api/video-devices") {
      const type = url.searchParams.get("type");
      const all = listVideoDevices();
      sendJson(res, 200, { devices: type === "2D" || type === "3D" ? all.filter((d) => d.deviceType === type) : all });
      return;
    }

    {
      const m = p.match(/^\/api\/video-devices\/(2D|3D)\/([^/]+)\/preview$/);
      if (m && method === "GET") {
        const asset = resolveRigAsset(decodeURIComponent(m[2]), m[1] as "2D" | "3D");
        if (!asset) return sendError(res, 404, `No ${m[1]} device '${decodeURIComponent(m[2])}'.`);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(devicePreviewHtml(asset));
        return;
      }
    }

    // Import: catalogue definitions (2D/3D) and/or CSS device assets, merged into devices/.
    if (method === "POST" && p === "/api/devices/import") {
      try {
        const body = await readJsonBody(req);
        const items = Array.isArray(body) ? body : [...(body.devices ?? []), ...(body.css ?? [])];
        if (!Array.isArray(items) || !items.length) {
          return sendError(res, 400, "Expected a JSON array of device definitions, or an object with 'devices' and/or 'css' arrays.");
        }
        let imported = 0;
        const skipped: string[] = [];
        for (const item of items) {
          if (item?.sourceType === "CSS" && item.markup?.front && /^[a-z0-9-]+$/.test(item.id ?? "")) {
            fs.mkdirSync(DEVICES_CSS_DIR, { recursive: true });
            fs.writeFileSync(path.join(DEVICES_CSS_DIR, `${item.id}.json`), JSON.stringify(item, null, 2) + "\n");
            imported++;
          } else {
            try { createDevice(item); imported++; } catch (e: any) { skipped.push(`${item?.id ?? "?"}: ${e.message}`); }
          }
        }
        reloadCssDevices();
        reloadRegistry();
        sendJson(res, 200, { ok: true, imported, skipped });
      } catch (err: any) {
        sendError(res, 400, `Invalid device registry JSON: ${err.message}`);
      }
      return;
    }

    if (method === "GET" && p === "/api/devices/export") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="device-registry.json"',
      });
      res.end(JSON.stringify({ devices: Object.values(DEVICE_REGISTRY).map((d) => d.definition), css: listCssDevices() }, null, 2));
      return;
    }

    {
      const m = p.match(/^\/api\/platforms\/([^/]+)$/);
      if (m && method === "GET") {
        const platformId = decodeURIComponent(m[1]);
        const spec = loadPlatformSpec(platformId);
        if (!spec) return sendError(res, 404, `Unknown platform '${platformId}'`);
        sendJson(res, 200, spec);
        return;
      }
    }

    // Applications API (Screen Capture Tab)
    if (method === "GET" && p === "/api/applications") {
      sendJson(res, 200, { applications: listApplications() });
      return;
    }

    if (method === "POST" && p === "/api/applications") {
      const body = await readJsonBody(req);
      if (!body.name) return sendError(res, 400, "name is required");
      // Trust boundary: the client must state the store explicitly.
      if (body.platform !== "play-store" && body.platform !== "app-store") return sendError(res, 400, "platform must be 'play-store' or 'app-store'");
      const application = createApplication(body.name, body.appCategory || "Utility", body.targetUrl || "", body.platform);
      sendJson(res, 200, application);
      return;
    }

    {
      const m = p.match(/^\/api\/applications\/([^/]+)$/);
      if (m && method === "GET") return sendJson(res, 200, loadApplication(decodeURIComponent(m[1])));
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        const application = loadApplication(decodeURIComponent(m[1]));
        if (body.name !== undefined) application.name = body.name;
        if (body.appCategory !== undefined) application.appCategory = body.appCategory;
        if (body.targetUrl !== undefined) application.targetUrl = body.targetUrl;
        if (body.platform !== undefined) {
          if (body.platform !== "play-store" && body.platform !== "app-store") return sendError(res, 400, "platform must be 'play-store' or 'app-store'");
          application.platform = body.platform;
        }
        saveApplication(application);
        sendJson(res, 200, application);
        return;
      }
      if (m && method === "DELETE") {
        deleteApplication(decodeURIComponent(m[1]));
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/applications\/([^/]+)\/files$/);
      if (m && method === "GET") {
        const id = decodeURIComponent(m[1]);
        const dir = applicationDir(id);
        const files: Array<{ path: string; size: number; mtime: number }> = [];

        function scan(sub: string) {
          const absSub = path.join(dir, sub);
          if (!fs.existsSync(absSub)) return;
          const entries = fs.readdirSync(absSub, { withFileTypes: true });
          for (const ent of entries) {
            const relPath = sub ? `${sub}/${ent.name}` : ent.name;
            if (ent.isDirectory()) {
              scan(relPath);
            } else {
              const stat = fs.statSync(path.join(dir, relPath));
              files.push({
                path: relPath.replace(/\\/g, "/"),
                size: stat.size,
                mtime: stat.mtimeMs,
              });
            }
          }
        }

        scan("");
        sendJson(res, 200, { files });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/applications\/([^/]+)\/captures\/([^/]+)$/);
      if (m && method === "DELETE") {
        const projId = decodeURIComponent(m[1]);
        const captureId = decodeURIComponent(m[2]);
        deleteApplicationCapture(projId, captureId);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/applications\/([^/]+)\/file$/);
      if (m && method === "GET") {
        const rel = url.searchParams.get("p");
        if (!rel) return sendError(res, 400, "query param 'p' is required");
        const abs = applicationFile(decodeURIComponent(m[1]), rel);
        const ext = path.extname(abs).toLowerCase();
        let mime = "image/png";
        if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
        else if (ext === ".webp") mime = "image/webp";
        else if (ext === ".mp4") mime = "video/mp4";
        else if (ext === ".webm") mime = "video/webm";
        sendFile(res, abs, mime);
        return;
      }
      if (m && method === "DELETE") {
        const rel = url.searchParams.get("p");
        if (!rel) return sendError(res, 400, "query param 'p' is required");
        const projId = decodeURIComponent(m[1]);
        deleteApplicationCapture(projId, rel);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    // Auth status & credentials
    if (method === "GET" && p === "/api/auth/status") {
      sendJson(res, 200, getCredentialStatus());
      return;
    }

    if (method === "POST" && p === "/api/auth/credentials") {
      const body = await readJsonBody(req);
      if (!body.email) return sendError(res, 400, "email is required");
      setCredentials(body.email, body.password);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "DELETE" && p === "/api/auth/credentials") {
      clearCredentials();
      sendJson(res, 200, { ok: true });
      return;
    }

    // Device-size taxonomy (Phone / 7-inch Tablet / 10-inch Tablet) -- single
    // source of truth the client reads instead of hardcoding its own copy.
    if (method === "GET" && p === "/api/device-categories") {
      sendJson(res, 200, { categories: DEVICE_CATEGORIES_LIST });
      return;
    }

    // Live Web Browser endpoints
    if (method === "POST" && p === "/api/browser/start") {
      const body = await readJsonBody(req);
      if (!body.applicationId || !body.url) {
        return sendError(res, 400, "applicationId and url are required");
      }
      try {
        const deviceCategory = isDeviceCategory(body.deviceCategory) ? body.deviceCategory : "phone";
        const resolutionKey = resolveResolutionKeyForCategory(deviceCategory);
        const result = await startBrowserSession(body.applicationId, body.url, resolutionKey);
        sendJson(res, 200, { ok: true, deviceCategory, ...result });
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to start browser session");
      }
      return;
    }

    if (method === "POST" && p === "/api/browser/stop") {
      await stopBrowserSession();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && p === "/api/browser/frame") {
      try {
        const frameBuffer = await getBrowserFrame();
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(frameBuffer);
      } catch (err: any) {
        sendError(res, 503, err.message || "Browser frame not ready yet.");
      }
      return;
    }

    if (method === "POST" && p === "/api/browser/action") {
      const body = await readJsonBody(req);
      try {
        await executeBrowserAction(body);
        sendJson(res, 200, { ok: true });
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to execute action");
      }
      return;
    }

    if (method === "POST" && p === "/api/browser/capture") {
      const body = await readJsonBody(req);
      if (!body.applicationId) {
        return sendError(res, 400, "applicationId is required");
      }
      try {
        const capture = await captureBrowserScreen(body.applicationId);
        sendJson(res, 200, capture);
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to capture browser screen");
      }
      return;
    }

    if (method === "POST" && p === "/api/browser/record/start") {
      const body = await readJsonBody(req);
      if (!body.applicationId) return sendError(res, 400, "applicationId is required");
      try {
        sendJson(res, 200, startBrowserRecording(body.applicationId));
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to start browser recording");
      }
      return;
    }

    if (method === "POST" && p === "/api/browser/record/stop") {
      try {
        sendJson(res, 200, await stopBrowserRecording());
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to stop browser recording");
      }
      return;
    }

    if (method === "GET" && p === "/api/browser/record/status") {
      sendJson(res, 200, { recording: isBrowserRecording() });
      return;
    }

    // Android Live Control endpoints
    if (method === "GET" && p === "/api/android/devices") {
      const devices = await listAndroidDevices();
      sendJson(res, 200, { devices });
      return;
    }

    if (method === "POST" && p === "/api/android/start") {
      const body = await readJsonBody(req);
      if (!body.applicationId) {
        return sendError(res, 400, "applicationId is required");
      }
      try {
        const result = await startAndroidSession(body.applicationId, body.deviceId, {
          screenOff: body.screenOff,
          nativePreview: Boolean(body.nativePreview),
        });
        sendJson(res, 200, { ok: true, ...result });
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to start Android session");
      }
      return;
    }

    if (method === "GET" && p === "/api/android/screen-off") {
      sendJson(res, 200, { screenOff: isAndroidScreenOff() });
      return;
    }

    if (method === "POST" && p === "/api/android/screen-off") {
      const body = await readJsonBody(req);
      try {
        const turnOff = body.screenOff !== undefined ? Boolean(body.screenOff) : !isAndroidScreenOff();
        const activeState = await setAndroidScreenOff(turnOff);
        sendJson(res, 200, { ok: true, screenOff: activeState });
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to toggle screen off");
      }
      return;
    }

    if (method === "GET" && p === "/api/android/auto-rotate") {
      sendJson(res, 200, { autoRotate: isAndroidAutoRotate() });
      return;
    }

    if (method === "POST" && p === "/api/android/auto-rotate") {
      const body = await readJsonBody(req);
      try {
        const enable = body.autoRotate !== undefined ? Boolean(body.autoRotate) : !isAndroidAutoRotate();
        const activeState = await setAndroidAutoRotate(enable);
        sendJson(res, 200, { ok: true, autoRotate: activeState });
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to toggle auto-rotation");
      }
      return;
    }

    // Single-frame polled endpoint (legacy fallback for cached browsers)
    if (method === "GET" && p === "/api/android/frame") {
      try {
        const frameBuffer = getAndroidFrame();
        res.writeHead(200, { "Content-Type": "image/jpeg" });
        res.end(frameBuffer);
      } catch (err: any) {
        sendError(res, 503, err.message || "Live frame not ready yet.");
      }
      return;
    }

    // Pushed MJPEG stream (multipart/x-mixed-replace)
    if (method === "GET" && p === "/api/android/stream") {
      let initialFrame: Buffer | null = null;
      try {
        initialFrame = getAndroidFrame();
      } catch (err: any) {
        if (err.message === "No active Android session.") {
          sendError(res, 503, err.message);
          return;
        }
      }

      res.writeHead(200, {
        "Content-Type": "multipart/x-mixed-replace; boundary=sagframe",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      let writable = true;
      let pending: Buffer | null = null;
      const send = (frame: Buffer) => {
        const header = Buffer.from(`--sagframe\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        try {
          writable = res.write(Buffer.concat([header, frame, Buffer.from("\r\n")]));
        } catch (_) {
          unsubscribe();
        }
      };
      res.on("drain", () => {
        writable = true;
        if (pending) {
          const frame = pending;
          pending = null;
          send(frame);
        }
      });
      const writeFrame = (frame: Buffer) => {
        if (!writable) {
          pending = frame;
          return;
        }
        send(frame);
      };
      const unsubscribe = subscribeAndroidFrames(writeFrame);
      req.on("close", unsubscribe);
      if (initialFrame) writeFrame(initialFrame);
      return;
    }

    if (method === "POST" && p === "/api/android/capture") {
      const body = await readJsonBody(req);
      if (!body.applicationId) {
        return sendError(res, 400, "applicationId is required");
      }
      const capture = await captureAndroidScreen(body.applicationId, body.imageData);
      sendJson(res, 200, capture);
      return;
    }

    if (method === "POST" && p === "/api/android/stop") {
      stopAndroidSession();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && p === "/api/android/record/start") {
      const body = await readJsonBody(req);
      if (!body.applicationId) return sendError(res, 400, "applicationId is required");
      try {
        sendJson(res, 200, startAndroidRecording(body.applicationId));
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to start recording");
      }
      return;
    }

    if (method === "POST" && p === "/api/android/record/stop") {
      try {
        sendJson(res, 200, await stopAndroidRecording());
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to stop recording");
      }
      return;
    }

    if (method === "GET" && p === "/api/android/record/status") {
      sendJson(res, 200, { recording: isAndroidRecording() });
      return;
    }

    if (method === "GET" && p === "/api/android/apps") {
      try {
        const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
        const deviceId = url.searchParams.get("deviceId") || undefined;
        const apps = await listAndroidApps(refresh, deviceId);
        sendJson(res, 200, { apps });
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to list apps");
      }
      return;
    }

    if (method === "POST" && p === "/api/android/launch") {
      const body = await readJsonBody(req);
      if (!body.packageName) {
        return sendError(res, 400, "packageName is required");
      }
      try {
        await launchAndroidApp(body.packageName);
        sendJson(res, 200, { ok: true });
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to launch app");
      }
      return;
    }

    if (method === "POST" && p === "/api/android/action") {
      const body = await readJsonBody(req);
      try {
        await executeAndroidAction(body);
        sendJson(res, 200, { ok: true });
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to execute action");
      }
      return;
    }

    // Fallback legacy routes
    if (method === "GET" && p === "/api/captures") {
      const sessions = listApplications().map((p) => ({
        id: p.id,
        createdAt: p.createdAt,
        name: p.name,
        source: "website",
        screenshots: p.captures.length,
      }));
      sendJson(res, 200, { sessions });
      return;
    }

    if (method === "POST" && p === "/api/captures") {
      const body = await readJsonBody(req);
      // ponytail: API path with no platform picker -> createApplication default (play-store).
      const application = createApplication(body.name || body.url || "Untitled Application", "Utility", body.url);
      sendJson(res, 200, {
        id: application.id,
        createdAt: application.createdAt,
        name: application.name,
        source: "website",
        url: application.targetUrl,
        platforms: ["google-play"],
        raw: [],
      });
      return;
    }

    {
      const m = p.match(/^\/api\/captures\/([^/]+)$/);
      if (m && method === "GET") {
        const application = loadApplication(decodeURIComponent(m[1]));
        sendJson(res, 200, {
          id: application.id,
          createdAt: application.createdAt,
          name: application.name,
          source: "website",
          url: application.targetUrl,
          platforms: ["google-play"],
          raw: application.captures.map((c) => ({
            file: c.file,
            width: c.width,
            height: c.height,
            capturedAt: c.capturedAt,
          })),
        });
        return;
      }
    }

    // Mockup applications
    if (method === "GET" && p === "/api/mockups/layouts") {
      sendJson(res, 200, {
        presets: listLayoutPresets(),
        grouped: groupedLayoutPresets()
      });
      return;
    }

    if (method === "GET" && p === "/api/mockups") {
      sendJson(res, 200, { applications: listMockupApplications() });
      return;
    }

    if (method === "GET" && p === "/api/mockups/devices-library") {
      const list = Object.entries(DEVICE_REGISTRY).map(([id, d]) => ({
        id,
        name: d.name,
        category: d.formFactor || "phone",
        width: d.geometry?.width || 1080,
        height: d.geometry?.height || 1920,
        aspectRatio: `${d.geometry?.width || 1080}:${d.geometry?.height || 1920}`,
        svgFrame: d.svgFrame || buildFrameSvg(d.definition, "dark"),
      }));
      sendJson(res, 200, { devices: list });
      return;
    }

    if (method === "POST" && p === "/api/mockups/devices-library/add-svg") {
      const body = await readJsonBody(req);
      if (!body.name || !body.svgContent) {
        return sendError(res, 400, "Device title and SVG content are required");
      }
      const svg = String(body.svgContent);
      let width = 1080;
      let height = 1920;
      const vbMatch = svg.match(/viewBox=["']\s*0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*["']/i);
      if (vbMatch) {
        width = Math.round(parseFloat(vbMatch[1])) || 1080;
        height = Math.round(parseFloat(vbMatch[2])) || 1920;
      } else {
        const wMatch = svg.match(/width=["'](\d+(?:\.\d+)?)(?:px)?["']/i);
        const hMatch = svg.match(/height=["'](\d+(?:\.\d+)?)(?:px)?["']/i);
        if (wMatch) width = Math.round(parseFloat(wMatch[1])) || 1080;
        if (hMatch) height = Math.round(parseFloat(hMatch[2])) || 1920;
      }

      const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "device";
      const id = `custom-${slug}-${Date.now().toString(36)}`;

      const def: any = {
        id,
        name: body.name.trim(),
        vendor: body.vendor || "generic",
        platforms: ["google-play", "apple-app-store"],
        formFactor: body.formFactor || "phone",
        geometry: { width, height, thickness: 80, cornerRadius: 40 },
        screenInset: { top: 0, left: 0, width, height },
        bezelWidth: 16,
        edgeProfile: "flat",
        cutout: { type: "none" },
        cameraIsland: { style: "none", position: { xPct: 0, yPct: 0 }, size: { widthPct: 0, heightPct: 0 }, cornerRadius: 0, lenses: [] },
        buttons: [],
        ports: [],
        body: "#1a1a1a",
        accent: "#3a3a3a",
        railMaterial: "aluminum",
        customSvgFile: `${id}.svg`,
        schemaVersion: 2,
      };

      fs.mkdirSync(DEVICES_2D_DIR, { recursive: true });
      fs.writeFileSync(path.join(DEVICES_2D_DIR, `${id}.svg`), svg);
      createDevice(def);
      reloadRegistry();
      sendJson(res, 200, { ok: true, deviceId: id, name: def.name });
      return;
    }

    {
      const delMatch = p.match(/^\/api\/mockups\/devices-library\/([^/]+)$/);
      if (delMatch && method === "DELETE") {
        const devId = decodeURIComponent(delMatch[1]);
        try {
          deleteDevice(devId);
        } catch {
          archiveDevice(devId);
        }
        reloadRegistry();
        sendJson(res, 200, { ok: true, deleted: devId });
        return;
      }
    }

    if (method === "POST" && p === "/api/mockups") {
      const body = await readJsonBody(req);
      if (!body.name) return sendError(res, 400, "name is required");
      const application = createApplication(body.name);
      sendJson(res, 200, application.mockup);
      return;
    }

    {
      const m = p.match(/^\/api\/mockups\/(?!templates$|layouts$|export$)([^/]+)$/);
      // platform is exposed (not stored on the mockup) so the client can pick size targets without a second fetch.
      if (m && method === "GET") { const id = decodeURIComponent(m[1]); return sendJson(res, 200, { ...loadMockupApplication(id), platform: loadApplication(id).platform }); }
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        const application = loadMockupApplication(decodeURIComponent(m[1]));
        if (body.devices !== undefined) application.devices = body.devices;
        if (body.columns !== undefined) application.columns = body.columns;
        if (body.cells !== undefined) application.cells = body.cells;
        if (body.sources !== undefined) application.sources = body.sources;
        if (body.globalPanoramic !== undefined) application.globalPanoramic = body.globalPanoramic;
        if (body.settings !== undefined) application.settings = body.settings;
        saveMockupApplication(application);
        sendJson(res, 200, application);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/columns$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const body = (await readJsonBody(req).catch(() => ({}))) || {};
        const application = loadMockupApplication(id);
        const style = body.style || defaultColumnStyle(`Screen ${application.columns.length + 1}`);
        const col = addColumn(application, style);
        saveMockupApplication(application);
        sendJson(res, 200, { application, column: col });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/columns\/([^/]+)$/);
      if (m && method === "PUT") {
        const id = decodeURIComponent(m[1]);
        const colId = decodeURIComponent(m[2]);
        const body = await readJsonBody(req);
        const application = loadMockupApplication(id);
        if (body.style) {
          updateColumnStyle(application, colId, body.style);
          saveMockupApplication(application);
        }
        sendJson(res, 200, { application });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/cells\/([^/]+)\/([^/]+)$/);
      if (m && method === "PUT") {
        const id = decodeURIComponent(m[1]);
        const rowId = decodeURIComponent(m[2]);
        const colId = decodeURIComponent(m[3]);
        const body = await readJsonBody(req);
        const application = loadMockupApplication(id);
        if (body.path !== undefined) {
          // Sparse per-field override: { path: "deviceOne.rotation", value: 12 }
          setCellOverridePath(application, rowId, colId, body.path, body.value);
        } else if (body.paths && typeof body.paths === "object") {
          for (const [path, value] of Object.entries(body.paths)) setCellOverridePath(application, rowId, colId, path, value);
        } else {
          // Legacy whole-sub-object override, e.g. { override: { deviceOne: {...} } } or { override: null } to clear.
          setCellOverride(application, rowId, colId, body.override ?? body.style ?? null);
        }
        saveMockupApplication(application);
        sendJson(res, 200, { application });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/devices(?:\/([^/]+))?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const rowId = m[2] ? decodeURIComponent(m[2]) : null;
        const application = loadMockupApplication(id);
        if (method === "POST") {
          const body = await readJsonBody(req);
          const dev = addDeviceRow(application, {
            deviceId: body.deviceId || "phone",
            variant: body.variant,
            label: body.label || "Row",
            previewsVisible: true,
            isBase: application.devices.length === 0,
          });
          saveMockupApplication(application);
          sendJson(res, 200, { application, device: dev });
          return;
        }
        if (method === "DELETE" && rowId) {
          application.devices = application.devices.filter((d) => d.id !== rowId);
          saveMockupApplication(application);
          sendJson(res, 200, { application });
          return;
        }
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/upload-asset$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const body = await readJsonBody(req);
        if (!body.data) return sendError(res, 400, "data (base64) is required");
        const filename = body.name || `asset_${Date.now()}.png`;
        const base64Data = body.data.replace(/^data:image\/\w+;base64,/, "");
        const application = loadMockupApplication(id);
        const rel = `sources/${Date.now()}_${filename}`;
        const abs = mockupFile(id, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, Buffer.from(base64Data, "base64"));
        // This endpoint is for decorative Asset Layers (stickers, badges,
        // panorama assets) -- a completely different concept from a
        // application's screenshot sources. It must NOT push into
        // application.sources: that array is exactly what populates the
        // Screenshot Source Mapping dropdown (mk-source, see
        // web/js/editor.js's populateSourceSelect), so doing so previously
        // let every asset-layer upload masquerade as a selectable screenshot.
        const sourceObj = {
          id: `asset_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: filename,
          file: rel,
          width: body.width || 1080,
          height: body.height || 1920,
        };
        sendJson(res, 200, { application, source: sourceObj });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/export$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const application = loadMockupApplication(id);
        try {
          const result = await exportMockupApplication(application);
          sendJson(res, 200, { ok: true, result, downloadUrl: `/api/mockups/${id}/file?p=exports/mockup-export.zip` });
        } catch (err: any) {
          sendError(res, 500, err?.message || "Export failed");
        }
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/export\/single$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const application = loadMockupApplication(id);
        const body = await readJsonBody(req);
        try {
          const file = await exportSingleScreen(application, body?.columnId);
          const rel = path.relative(mockupDir(id), file).replace(/\\/g, "/");
          sendJson(res, 200, { ok: true, downloadUrl: `/api/mockups/${id}/file?p=${encodeURIComponent(rel)}` });
        } catch (err: any) {
          sendError(res, 500, err?.message || "Single screen export failed");
        }
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/export\/panoramic$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const application = loadMockupApplication(id);
        const body = await readJsonBody(req).catch(() => ({}));
        const sizeKey = body?.sizeKey ?? url.searchParams.get("sizeKey") ?? undefined;
        if (sizeKey !== undefined && !sizeTargetsFor(loadApplication(id).platform).some((t) => t.key === sizeKey)) return sendError(res, 400, "unknown sizeKey for this application's platform");
        try {
          const file = await exportPanoramicBanner(application, sizeKey);
          const rel = path.relative(mockupDir(id), file).replace(/\\/g, "/");
          sendJson(res, 200, { ok: true, downloadUrl: `/api/mockups/${id}/file?p=${encodeURIComponent(rel)}` });
        } catch (err: any) {
          sendError(res, 500, err?.message || "Panoramic export failed");
        }
        return;
      }
    }


    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/file$/);
      if (m && method === "GET") {
        const rel = url.searchParams.get("p");
        if (!rel) return sendError(res, 400, "query param 'p' is required");
        const id = decodeURIComponent(m[1]);
        let abs = mockupFile(id, rel);
        if (!fs.existsSync(abs)) abs = applicationFile(id, rel);
        const ext = path.extname(abs).toLowerCase();
        sendFile(res, abs, ext === ".zip" ? "application/zip" : ext === ".svg" ? "image/svg+xml" : ext === ".webp" ? "image/webp" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png");
        return;
      }
    }

    // Templates section
    if (method === "GET" && p === "/api/mockups/templates") {
      sendJson(res, 200, {
        templates: MOCKUP_TEMPLATES.slice()
          .sort((a: any, b: any) => {
            const catComp = (a.category || "").localeCompare(b.category || "", undefined, { sensitivity: "base" });
            if (catComp !== 0) return catComp;
            return (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" });
          })
          .map((t: any) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            description: t.description,
            columnCount: t.columnCount,
            layout: t.layout,
            background: t.background,
            devices: t.devices,
            titles: t.titles
          }))
      });
      return;
    }

    {
      const m = p.match(/^\/api\/mockups\/templates\/([^/]+)\/asset$/);
      if (m && method === "GET") {
        const templateId = decodeURIComponent(m[1]);
        const rel = url.searchParams.get("p");
        if (!rel) return sendError(res, 400, "query param 'p' is required");
        const template = getMockupTemplateFromDisk(templateId);
        if (!template || !template.folderPath) {
          return sendError(res, 404, `Template '${templateId}' not found.`);
        }
        const safeRel = path.normalize(rel).replace(/^(\.\.[\/\\])+/, "");
        const abs = path.join(template.folderPath, safeRel);
        if (!fs.existsSync(abs)) {
          return sendError(res, 404, `Asset '${rel}' not found in template.`);
        }
        const ext = path.extname(abs).toLowerCase();
        const mime = ext === ".svg" ? "image/svg+xml" : ext === ".webp" ? "image/webp" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
        sendFile(res, abs, mime);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/template-preview\/([^/]+)$/);
      if (m && method === "GET") {
        const slug = decodeURIComponent(m[1]);
        const template = MOCKUP_TEMPLATES.find((t) => t.id === slug);
        if (!template) return sendError(res, 404, `Unknown template '${slug}'.`);
        const panelQuery = url.searchParams.get("panel");
        const panelIndex = panelQuery !== null ? parseInt(panelQuery, 10) : undefined;
        let html: string;
        if (panelIndex !== undefined && !isNaN(panelIndex)) {
          html = templateScreenHtml(template, panelIndex);
        } else {
          html = templateThumbHtml(template);
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(html);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/template-screen\/([^/]+)\/(\d+)$/);
      if (m && method === "GET") {
        const slug = decodeURIComponent(m[1]);
        const colIdx = parseInt(m[2], 10);
        const template = MOCKUP_TEMPLATES.find((t) => t.id === slug);
        if (!template) return sendError(res, 404, `Unknown template '${slug}'.`);
        const html = templateScreenHtml(template, colIdx);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(html);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/template-detail-preview\/([^/]+)$/);
      if (m && method === "GET") {
        const slug = decodeURIComponent(m[1]);
        const template = MOCKUP_TEMPLATES.find((t) => t.id === slug);
        if (!template) return sendError(res, 404, `Unknown template '${slug}'.`);
        const html = templateDetailThumbHtml(template);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(html);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/template-thumb\/([^/]+)\.png$/);
      if (m && method === "GET") {
        const slug = decodeURIComponent(m[1]);
        const template = MOCKUP_TEMPLATES.find((t) => t.id === slug);
        if (!template) return sendError(res, 404, `Unknown template '${slug}'.`);
        const outDir = path.join(process.cwd(), "output", ".template-thumbs");
        const thumbPath = path.join(outDir, `${slug}.png`);
        if (!fs.existsSync(thumbPath)) {
          await renderThumbsOnce(outDir, () => renderTemplateThumbs(outDir, MOCKUP_TEMPLATES));
        }
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
        fs.createReadStream(thumbPath).pipe(res);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/template-detail-thumb\/([^/]+)\.png$/);
      if (m && method === "GET") {
        const slug = decodeURIComponent(m[1]);
        const template = MOCKUP_TEMPLATES.find((t) => t.id === slug);
        if (!template) return sendError(res, 404, `Unknown template '${slug}'.`);
        const outDir = path.join(process.cwd(), "output", ".template-detail-thumbs");
        const thumbPath = path.join(outDir, `${slug}.png`);
        if (!fs.existsSync(thumbPath)) {
          await renderThumbsOnce(outDir, () => renderTemplateDetailThumbs(outDir, MOCKUP_TEMPLATES));
        }
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
        fs.createReadStream(thumbPath).pipe(res);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/(mockups|videos)\/([^/]+)\/draft$/);
      if (m && method === "DELETE") {
        discardDraft(decodeURIComponent(m[2]), m[1] === "mockups" ? "mockup" : "video");
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/configs$/);
      if (m && method === "GET") {
        sendJson(res, 200, loadMockupApplication(decodeURIComponent(m[1])).savedConfigs ?? []);
        return;
      }
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        const name = String(body.name ?? "").trim();
        if (!name) return sendError(res, 400, "A template name is required.");
        const snap = body.snapshot;
        if (!snap || !Array.isArray(snap.columns) || snap.columns.length === 0) return sendError(res, 400, "Nothing to save: load a template into the editor first.");
        const application = loadMockupApplication(decodeURIComponent(m[1]));
        const list = (application.savedConfigs = application.savedConfigs ?? []);
        const mode = body.mode === "update" ? "update" : "new";
        const target = mode === "update" ? list.find((c) => c.id === body.configId) : undefined;
        if (mode === "update" && !target) return sendError(res, 404, "The template to update no longer exists.");
        if (list.some((c) => c.name === name && c.id !== target?.id)) return sendError(res, 409, `A template named '${name}' already exists.`);
        const cfg = {
          id: target?.id ?? `mcfg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name,
          sourceTemplateId: typeof body.sourceTemplateId === "string" ? body.sourceTemplateId : target?.sourceTemplateId,
          snapshot: JSON.parse(JSON.stringify({
            devices: snap.devices ?? [],
            columns: snap.columns,
            cells: snap.cells ?? {},
            globalPanoramic: snap.globalPanoramic ?? { flip: false },
            settings: snap.settings ?? application.settings,
          })),
          savedAt: new Date().toISOString(),
        };
        if (target) Object.assign(target, cfg);
        else list.push(cfg);
        saveMockupApplication(application);
        sendJson(res, 200, { savedConfigs: list, id: cfg.id });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/configs\/([^/]+)\/apply$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const application = loadMockupApplication(id);
        const cfg = (application.savedConfigs ?? []).find((c) => c.id === decodeURIComponent(m[2]));
        if (!cfg) return sendError(res, 404, "Saved template not found");
        const snap = JSON.parse(JSON.stringify(cfg.snapshot));
        application.devices = snap.devices;
        application.columns = snap.columns;
        application.cells = snap.cells;
        application.globalPanoramic = snap.globalPanoramic;
        application.settings = snap.settings;
        saveMockupApplication(application);
        sendJson(res, 200, { ...application, platform: loadApplication(id).platform });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/configs\/([^/]+)$/);
      if (m && method === "DELETE") {
        const application = loadMockupApplication(decodeURIComponent(m[1]));
        const before = application.savedConfigs?.length ?? 0;
        application.savedConfigs = (application.savedConfigs ?? []).filter((c) => c.id !== decodeURIComponent(m[2]));
        if (application.savedConfigs.length === before) return sendError(res, 404, "Saved template not found");
        saveMockupApplication(application);
        sendJson(res, 200, application.savedConfigs);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/create-template$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        const id = decodeURIComponent(m[1]);
        const application = loadMockupApplication(id);
        const draft = body.snapshot;
        if (!draft || !Array.isArray(draft.columns)) return sendError(res, 400, "snapshot is required");
        application.devices = draft.devices ?? application.devices;
        application.columns = draft.columns;
        try {
          const t = createTemplateFromApplication(application, { name: String(body.name ?? ""), category: String(body.category ?? ""), description: body.description }, loadApplication(id).platform);
          sendJson(res, 200, { ok: true, templateId: t.id, name: t.name, category: t.category });
        } catch (e: any) {
          sendError(res, 400, e.message);
        }
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/update-template$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        if (!body.templateId) return sendError(res, 400, "templateId is required");
        const id = decodeURIComponent(m[1]);
        const application = loadMockupApplication(id);
        const draft = body.snapshot;
        if (draft && Array.isArray(draft.columns)) {
          // Source of truth is the posted in-memory draft; nothing here is persisted to the application file.
          application.devices = draft.devices ?? application.devices;
          application.columns = draft.columns;
        }
        try {
          const name = updateTemplateFromApplication(application, body.templateId, loadApplication(id).platform);
          try { fs.rmSync(path.join(process.cwd(), "output", ".template-thumbs", `${body.templateId}.png`), { force: true }); } catch { /* thumbnail is regenerated on demand */ }
          sendJson(res, 200, { ok: true, templateId: body.templateId, name });
        } catch (e: any) {
          sendError(res, 400, e.message);
        }
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/apply-template$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        if (!body.templateId) return sendError(res, 400, "templateId is required");
        const id = decodeURIComponent(m[1]);
        const application = loadMockupApplication(id);
        const platform = loadApplication(id).platform;
        applyMockupTemplate(application, body.templateId, platform);
        saveMockupApplication(application);
        sendJson(res, 200, { ...application, platform });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/cell-preview\/([^/]+)\/([^/]+)$/);
      if (m && method === "GET") {
        const id = decodeURIComponent(m[1]);
        const deviceRowId = decodeURIComponent(m[2]);
        const columnId = decodeURIComponent(m[3]);
        const application = loadMockupApplication(id);
        const html = cellPreviewHtml(application, deviceRowId, columnId);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(html);
        return;
      }
      // Live variant: renders the posted in-memory state merged over the saved application. Render-only, never writes.
      const ml = p.match(/^\/api\/mockups\/([^/]+)\/cell-preview-live$/);
      if (ml && method === "POST") {
        const body = await readJsonBody(req);
        const posted = body?.application ?? {};
        const application: any = loadMockupApplication(decodeURIComponent(ml[1]));
        for (const k of ["columns", "devices", "sources"]) {
          if (posted[k] !== undefined) { if (!Array.isArray(posted[k])) return sendError(res, 400, `application.${k} must be an array`); application[k] = posted[k]; }
        }
        for (const k of ["settings", "globalPanoramic"]) {
          if (posted[k] !== undefined) { if (typeof posted[k] !== "object" || posted[k] === null) return sendError(res, 400, `application.${k} must be an object`); application[k] = posted[k]; }
        }
        if (typeof body.deviceRowId !== "string" || typeof body.columnId !== "string") return sendError(res, 400, "deviceRowId and columnId are required");
        if (!application.devices.some((d: any) => d.id === body.deviceRowId) || !application.columns.some((c: any) => c.id === body.columnId)) return sendError(res, 404, "row or page not found");
        const html = cellPreviewHtml(application, body.deviceRowId, body.columnId);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(html);
        return;
      }
    }

    // Video tab
    if (method === "GET" && p === "/api/videos") {
      sendJson(res, 200, { applications: listVideoApplications() });
      return;
    }

    if (method === "POST" && p === "/api/videos") {
      const body = await readJsonBody(req);
      if (!body.name) return sendError(res, 400, "name is required");
      const application = createApplication(body.name);
      sendJson(res, 200, application.video);
      return;
    }

    {
      const m = p.match(/^\/api\/videos\/(?!templates$|scene-options$|template-backgrounds$)([^/]+)$/);
      if (m && method === "GET") {
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        // editing=none: a fresh Editing session starts with no template; never hand back the old working scenes.
        if (url.searchParams.get("editing") === "none") return sendJson(res, 200, { ...application, template: null, scenes: [] });
        return sendJson(res, 200, application);
      }
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        if (body.template !== undefined) application.template = body.template;
        if (body.scenes !== undefined) application.scenes = body.scenes;
        if (body.bgm !== undefined) application.bgm = body.bgm;
        if (body.bgmVolume !== undefined) application.bgmVolume = body.bgmVolume;
        if (body.brand !== undefined) application.brand = body.brand;
        if (body.backgroundImage !== undefined) application.backgroundImage = body.backgroundImage;
        saveVideoApplication(application);
        sendJson(res, 200, application);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/file$/);
      if (m && method === "GET") {
        const rel = url.searchParams.get("p");
        if (!rel) return sendError(res, 400, "query param 'p' is required");
        const id = decodeURIComponent(m[1]);
        let abs = videoFile(id, rel);
        if (!fs.existsSync(abs)) abs = applicationFile(id, rel);
        const ext = path.extname(abs).toLowerCase();
        let mime = "image/png";
        if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
        else if (ext === ".webp") mime = "image/webp";
        else if (ext === ".svg") { mime = "image/svg+xml"; res.setHeader("Content-Security-Policy", "sandbox"); }
        else if (ext === ".mp4") mime = "video/mp4";
        else if (ext === ".webm") mime = "video/webm";
        else if (ext === ".wav") mime = "audio/wav";
        else if (ext === ".mp3") mime = "audio/mpeg";
        sendFileRanged(req, res, abs, mime);
        return;
      }
    }

    {
      // Deterministic, per-template generated BGM track -- the same one renderVideo
      // falls back to when an application has no BGM upload of its own. Purely a function
      // of the template id (no application/ownership scoping needed): serves the cached
      // wav, generating it on first request. This is what lets the interactive
      // preview (Editing section / Saved Templates / Template picker) actually play
      // the default background music instead of the export-only ffmpeg mix being the
      // only place it's ever heard.
      const m = p.match(/^\/api\/bgm-presets\/([^/]+)$/);
      if (m && method === "GET") {
        const templateId = decodeURIComponent(m[1]);
        if (!BGM_PRESETS[templateId]) return sendError(res, 404, `No BGM preset for template '${templateId}'.`);
        const wavPath = ensureGeneratedBgm(templateId, 60);
        sendFileRanged(req, res, wavPath, "audio/wav");
        return;
      }
    }

    if (method === "GET" && p === "/api/videos/template-backgrounds") {
      loadAllTemplates();
      sendJson(res, 200, { backgrounds: listTemplateBackgrounds(VIDEO_TEMPLATES) });
      return;
    }

    if (method === "GET" && p === "/api/videos/templates") {
      loadAllTemplates();
      sendJson(res, 200, { templates: VIDEO_TEMPLATES });
      return;
    }

    {
      const m = p.match(/^\/api\/videos\/templates\/([^/]+)\/preview$/);
      if (m && method === "GET") {
        const templateId = resolveTemplateId(decodeURIComponent(m[1]));
        const template = VIDEO_TEMPLATES.find((t) => t.id === templateId);
        if (!template) return sendError(res, 404, `Unknown video template '${m[1]}'.`);
        const sourceApplicationId = url.searchParams.get("applicationId");
        const sources = sourceApplicationId ? loadVideoApplication(decodeURIComponent(sourceApplicationId)).sources : [];
        const scratch = scratchVideoApplication(templateId, sources);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(templatePreviewHtml(scratch));
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/templates\/([^/]+)\/scene\/(\d+)\/preview$/);
      if (m && method === "GET") {
        const templateId = resolveTemplateId(decodeURIComponent(m[1]));
        const sceneIndex = Number(m[2]);
        const template = VIDEO_TEMPLATES.find((t) => t.id === templateId);
        if (!template) return sendError(res, 404, `Unknown video template '${m[1]}'.`);
        const sourceApplicationId = url.searchParams.get("applicationId");
        const sources = sourceApplicationId ? loadVideoApplication(decodeURIComponent(sourceApplicationId)).sources : [];
        const scratch = scratchVideoApplication(templateId, sources);
        const scene = scratch.scenes[sceneIndex];
        if (!scene) return sendError(res, 404, `Scene index ${sceneIndex} out of range for '${templateId}'.`);
        const resolveUri = (rel: string) => `/api/videos/${scratch.id}/file?p=${encodeURIComponent(rel)}`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(sceneHtml(scene, sourceUrisFor(scratch, scene, resolveUri), false, sourceKindsFor(scratch, scene)));
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/template-thumb\/([^/]+)\.png$/);
      if (m && method === "GET") {
        const slug = resolveTemplateId(decodeURIComponent(m[1]));
        const template = VIDEO_TEMPLATES.find((t) => t.id === slug);
        if (!template) return sendError(res, 404, `Unknown video template '${m[1]}'.`);
        const outDir = path.join(process.cwd(), "output", ".template-thumbs");
        const thumbPath = path.join(outDir, `video-${slug}.png`);
        if (!fs.existsSync(thumbPath)) {
          await renderThumbsOnce(outDir + "-video", () => renderVideoTemplateThumbs(outDir, VIDEO_TEMPLATES));
        }
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
        fs.createReadStream(thumbPath).pipe(res);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/templates\/([^/]+)\/bgm\.wav$/);
      if (m && method === "GET") {
        const templateId = resolveTemplateId(decodeURIComponent(m[1]));
        const preset = BGM_PRESETS[templateId];
        if (!preset) return sendError(res, 404, `No BGM preset for template '${m[1]}'.`);
        const outDir = path.join(process.cwd(), "output", ".bgm");
        fs.mkdirSync(outDir, { recursive: true });
        const wavPath = path.join(outDir, `${templateId}.wav`);
        if (!fs.existsSync(wavPath)) fs.writeFileSync(wavPath, renderBgmWav(preset, 30));
        res.writeHead(200, { "Content-Type": "audio/wav", "Cache-Control": "no-cache" });
        fs.createReadStream(wavPath).pipe(res);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/apply-template$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        applyVideoTemplate(application, body.templateId);
        saveVideoApplication(application);
        sendJson(res, 200, application);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/template-preview$/);
      if (m && method === "GET") {
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(templatePreviewHtml(application));
        return;
      }
    }

    if (method === "GET" && p === "/api/videos/scene-options") {
      sendJson(res, 200, {
        animations: listSceneAnimations(),
        backgrounds: listVideoBackgrounds(),
        layouts: { "9:16": listSceneLayouts("9:16"), "16:9": listSceneLayouts("16:9") }
      });
      return;
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/sources$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const application = loadVideoApplication(id);
        const name = url.searchParams.get("name") ?? `image_${application.sources.length + 1}`;
        const contentType = req.headers["content-type"] ?? "";
        const isVideo = contentType.includes("video/");
        if (isVideo) {
          const ext = contentType.includes("webm") ? "webm" : "mp4";
          const relPath = `sources/rec_${Date.now()}.${ext}`;
          fs.writeFileSync(videoFile(id, relPath), await readRawBody(req));
          const source = { id: `src_${Date.now()}`, name, file: relPath, width: 0, height: 0, kind: "video" as const };
          application.sources.push(source);
          saveVideoApplication(application);
          sendJson(res, 200, source);
          return;
        }
        const bodyBuf = await readRawBody(req);
        const format = sniffImageFormat(bodyBuf);
        if (!format) return sendError(res, 400, "Unrecognized image format (expected PNG, JPEG, WebP, GIF, or SVG).");
        const relPath = `sources/img_${Date.now()}.${imageExtFor(format)}`;
        const abs = videoFile(id, relPath);
        fs.writeFileSync(abs, bodyBuf);
        const dims = imageDimensions(bodyBuf, format);
        const purposeParam = url.searchParams.get("purpose");
        const purpose = purposeParam === "background" ? ("background" as const) : ("screenshot" as const);
        const source = { id: `src_${Date.now()}`, name, file: relPath, width: dims?.width ?? 0, height: dims?.height ?? 0, kind: "image" as const, purpose };
        application.sources.push(source);

        const slotParam = url.searchParams.get("slot");
        if (slotParam) {
          const [sceneId, slotKey, indexStr] = slotParam.split(":");
          const scene = application.scenes.find((s) => s.id === sceneId);
          if (scene) {
            scene.slotValues = scene.slotValues ?? {};
            const spec = slotSpecsForScene(application.template ?? "", scene.order).find((sp) => sp.key === slotKey);
            if (spec?.kind === "imageList") {
              const index = indexStr ? Number(indexStr) : 0;
              const existing = scene.slotValues[slotKey];
              const sourceIds = existing?.kind === "imageList" ? [...existing.sourceIds] : new Array(spec.count ?? 1).fill(null);
              sourceIds[index] = source.id;
              scene.slotValues[slotKey] = { kind: "imageList", sourceIds };
            } else if (spec) {
              scene.slotValues[slotKey] = { kind: "image", sourceId: source.id };
            }
          }
        }

        saveVideoApplication(application);
        sendJson(res, 200, source);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/sources\/([^/]+)$/);
      if (m && method === "DELETE") {
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        const sourceId = decodeURIComponent(m[2]);
        const idx = application.sources.findIndex((s) => s.id === sourceId);
        if (idx === -1) return sendError(res, 404, "Source not found");
        application.sources.splice(idx, 1);
        saveVideoApplication(application);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scenes$/);
      if (m && method === "POST") {
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        if (application.scenes.length === 0) return sendError(res, 400, "Apply a template before adding scenes.");
        if (application.scenes.length >= 24) return sendError(res, 400, "24 scenes is the maximum for this application.");
        const last = [...application.scenes].sort((a, b) => a.order - b.order).at(-1)!;
        const order = application.scenes.length;
        const newScene = { ...last, id: `scene_${Date.now()}`, order, screenIds: undefined, text: "", subtext: "" };
        application.scenes.push(newScene);
        saveVideoApplication(application);
        sendJson(res, 200, application);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scenes\/order$/);
      if (m && method === "PATCH") {
        const body = await readJsonBody(req);
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        const order: string[] = body.order ?? [];
        for (const scene of application.scenes) {
          const idx = order.indexOf(scene.id);
          if (idx !== -1) scene.order = idx;
        }
        application.scenes.sort((a, b) => a.order - b.order);
        saveVideoApplication(application);
        sendJson(res, 200, application);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/update-template$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        if (!body.templateId) return sendError(res, 400, "templateId is required");
        if (!Array.isArray(body.scenes) || body.scenes.length === 0) return sendError(res, 400, "scenes are required");
        try {
          const t = updateVideoTemplateOnDisk(String(body.templateId), body.scenes);
          sendJson(res, 200, { ok: true, templateId: t.id, name: t.name });
        } catch (e: any) {
          sendError(res, 400, e.message);
        }
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/create-template$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        if (!body.baseTemplateId) return sendError(res, 400, "baseTemplateId is required");
        if (!Array.isArray(body.scenes) || body.scenes.length === 0) return sendError(res, 400, "scenes are required");
        try {
          const t = createVideoTemplateOnDisk(String(body.baseTemplateId), body.scenes, { name: String(body.name ?? ""), description: body.description });
          sendJson(res, 200, { ok: true, templateId: t.id, name: t.name });
        } catch (e: any) {
          sendError(res, 400, e.message);
        }
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/configs$/);
      if (m && method === "GET") {
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        sendJson(res, 200, application.savedConfigs ?? []);
        return;
      }
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        const name = String(body.name ?? "").trim();
        if (!name) return sendError(res, 400, "A configuration name is required.");
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        // The client posts the editing snapshot explicitly; the working document is only a fallback for older callers.
        const snap: any = body.snapshot && Array.isArray(body.snapshot.scenes) && body.snapshot.template
          ? body.snapshot
          : { template: application.template, scenes: application.scenes, bgm: application.bgm, bgmVolume: application.bgmVolume, bgmFadeInMs: application.bgmFadeInMs, bgmFadeOutMs: application.bgmFadeOutMs, backgroundImage: application.backgroundImage, brand: application.brand };
        if (!snap.template || snap.scenes.length === 0) return sendError(res, 400, "Apply a template before saving a configuration.");
        application.savedConfigs = application.savedConfigs ?? [];
        // mode "new": always a fresh id, never touches an existing config. mode "update": replace exactly `configId`.
        // No mode (legacy): overwrite-by-name.
        const mode = body.mode === "new" || body.mode === "update" ? body.mode : undefined;
        let existing: (typeof application.savedConfigs)[number] | undefined;
        if (mode === "update") {
          existing = application.savedConfigs.find((c) => c.id === body.configId);
          if (!existing) return sendError(res, 404, "The template to update no longer exists.");
          if (application.savedConfigs.some((c) => c.id !== existing!.id && c.name === name)) return sendError(res, 409, `A configuration named '${name}' already exists.`);
        } else if (mode === "new") {
          if (application.savedConfigs.some((c) => c.name === name)) return sendError(res, 409, `A configuration named '${name}' already exists.`);
        } else {
          existing = application.savedConfigs.find((c) => c.name === name);
        }
        const snapshot = {
          id: existing?.id ?? `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name,
          template: snap.template,
          scenes: JSON.parse(JSON.stringify(snap.scenes)),
          // Snapshot whatever BGM is in effect right now -- the template's own
          // default if the user never touched it, or their explicit choice if
          // they did -- so this saved config keeps that audio forever, even if
          // the live application's bgm changes later.
          bgm: snap.bgm,
          bgmVolume: snap.bgmVolume,
          bgmFadeInMs: snap.bgmFadeInMs,
          bgmFadeOutMs: snap.bgmFadeOutMs,
          backgroundImage: snap.backgroundImage ?? null,
          brand: snap.brand,
          savedAt: new Date().toISOString(),
        };
        if (existing) {
          if (!mode && !body.overwrite) return sendError(res, 409, `A configuration named '${name}' already exists.`);
          Object.assign(existing, snapshot);
        } else {
          application.savedConfigs.push(snapshot);
        }
        saveVideoApplication(application);
        sendJson(res, 200, application.savedConfigs);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/configs\/([^/]+)\/apply$/);
      if (m && method === "POST") {
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        const cfg = (application.savedConfigs ?? []).find((c) => c.id === decodeURIComponent(m[2]));
        if (!cfg) return sendError(res, 404, "Saved configuration not found");
        application.template = cfg.template;
        application.scenes = JSON.parse(JSON.stringify(cfg.scenes));
        application.bgm = cfg.bgm ?? null;
        application.bgmVolume = cfg.bgmVolume;
        application.bgmFadeInMs = cfg.bgmFadeInMs;
        application.bgmFadeOutMs = cfg.bgmFadeOutMs;
        application.backgroundImage = cfg.backgroundImage ?? null;
        application.brand = cfg.brand;
        saveVideoApplication(application);
        sendJson(res, 200, application);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/configs\/([^/]+)$/);
      if (m && method === "DELETE") {
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        const before = application.savedConfigs?.length ?? 0;
        application.savedConfigs = (application.savedConfigs ?? []).filter((c) => c.id !== decodeURIComponent(m[2]));
        if (application.savedConfigs.length === before) return sendError(res, 404, "Saved configuration not found");
        saveVideoApplication(application);
        sendJson(res, 200, application.savedConfigs);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/configs\/([^/]+)\/preview$/);
      if (m && method === "GET") {
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        const cfg = (application.savedConfigs ?? []).find((c) => c.id === decodeURIComponent(m[2]));
        if (!cfg) return sendError(res, 404, "Saved configuration not found");
        const overrideApplication = {
          ...application,
          template: cfg.template,
          scenes: JSON.parse(JSON.stringify(cfg.scenes)),
          bgm: cfg.bgm ?? null,
          bgmVolume: cfg.bgmVolume,
          bgmFadeInMs: cfg.bgmFadeInMs,
          bgmFadeOutMs: cfg.bgmFadeOutMs,
          backgroundImage: cfg.backgroundImage ?? null,
          brand: cfg.brand,
        };
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(templatePreviewHtml(overrideApplication));
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/configs\/([^/]+)\/render$/);
      if (m && method === "POST") {
        const vid = decodeURIComponent(m[1]);
        const cfgId = decodeURIComponent(m[2]);
        const body = (await readJsonBody(req)) || {};
        const application = loadVideoApplication(vid);
        const cfg = (application.savedConfigs ?? []).find((c) => c.id === cfgId);
        if (!cfg) return sendError(res, 404, "Saved configuration not found");
        const overrideApplication = {
          ...application,
          template: cfg.template,
          scenes: JSON.parse(JSON.stringify(cfg.scenes)),
          bgm: cfg.bgm ?? null,
          bgmVolume: cfg.bgmVolume,
          bgmFadeInMs: cfg.bgmFadeInMs,
          bgmFadeOutMs: cfg.bgmFadeOutMs,
          backgroundImage: cfg.backgroundImage ?? null,
          brand: cfg.brand,
        };
        const preflight = validateApplication(overrideApplication as any);
        if (!preflight.ready) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Some scenes are missing required content.", ...preflight }));
          return;
        }

        const { job, isNew } = startRenderJob(overrideApplication, body, { configId: cfgId });
        if (!isNew) {
          res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "A render is already running for this application.", jobId: job.id, job }));
          return;
        }
        sendJson(res, 202, { ok: true, jobId: job.id, configId: cfgId });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/configs\/([^/]+)\/download$/);
      if (m && method === "GET") {
        const vid = decodeURIComponent(m[1]);
        const cfgId = decodeURIComponent(m[2]);
        const configMp4Path = path.join(videoDir(vid), `config_${cfgId}.mp4`);
        const configWebmPath = path.join(videoDir(vid), `config_${cfgId}.webm`);
        const targetPath = fs.existsSync(configMp4Path) ? configMp4Path : fs.existsSync(configWebmPath) ? configWebmPath : null;
        if (!targetPath) {
          return sendError(res, 404, "Rendered video not found for this template");
        }
        sendFile(res, targetPath, targetPath.endsWith(".webm") ? "video/webm" : "video/mp4");
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scenes\/([^/]+)$/);
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        const idx = application.scenes.findIndex((s) => s.id === decodeURIComponent(m[2]));
        if (idx === -1) return sendError(res, 404, "Scene not found");
        const nextAspect = body.aspectRatio ?? application.scenes[idx].aspectRatio;
        if (application.scenes.some((s, i) => i !== idx && (s.aspectRatio ?? "9:16") !== (nextAspect ?? "9:16"))) {
          return sendError(res, 400, "Every scene in an application must share the same aspect ratio.");
        }
        // Free (non-template) scenes take their mode from the chosen scene animation.
        if (!application.template && body.sceneTemplate && body.deviceMode === undefined) body.deviceMode = SCENE_ANIMATIONS[body.sceneTemplate]?.deviceMode ?? "3D";
        if (body.device !== undefined || body.deviceMode !== undefined) {
          // A scene only accepts devices of its own mode -- reject, don't silently coerce, an explicit bad pick.
          const tpl = VIDEO_TEMPLATES.find((t) => t.id === application.template);
          const mode = body.deviceMode ?? application.scenes[idx].deviceMode ?? tpl?.scenes?.[idx]?.deviceMode ?? tpl?.deviceMode ?? "3D";
          const device = body.device ?? application.scenes[idx].device;
          if (!isDeviceCompatible(device, mode)) return sendError(res, 400, `'${device}' is not a ${mode} device -- this scene requires a ${mode} device.`);
        }
        application.scenes[idx] = { ...application.scenes[idx], ...body };
        saveVideoApplication(application);
        sendJson(res, 200, application.scenes[idx]);
        return;
      }
      if (m && method === "DELETE") {
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        const idx = application.scenes.findIndex((s) => s.id === decodeURIComponent(m[2]));
        if (idx === -1) return sendError(res, 404, "Scene not found");
        if (application.scenes.length <= 1) return sendError(res, 400, "An application needs at least one scene.");
        application.scenes.splice(idx, 1);
        application.scenes.sort((a, b) => a.order - b.order).forEach((s, i) => (s.order = i));
        saveVideoApplication(application);
        sendJson(res, 200, application);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scenes\/([^/]+)\/ai-text$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        const prompt =
          `Write a short promo-video on-screen line (max 6 words) and an optional subtext (max 10 words) ` +
          `for a scene described as: "${body.hint ?? ""}". Never invent features not implied by the hint. ` +
          `Reply with ONLY JSON: {"text":"...","subtext":"..."}`;
        const reply = await chat(prompt);
        const match = reply.match(/\{[\s\S]*\}/);
        sendJson(res, 200, match ? JSON.parse(match[0]) : { text: "", subtext: "" });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scene-preview\/([^/]+)$/);
      if (m && method === "GET") {
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(scenePreviewHtml(application, decodeURIComponent(m[2])));
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scene-spec\/([^/]+)$/);
      if (m && method === "GET") {
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        const scene = application.scenes.find((s) => s.id === decodeURIComponent(m[2]));
        if (!scene || !application.template) return sendError(res, 404, "Scene not found");
        const specs = slotSpecsForScene(application.template, scene.order);
        const issues = validateScene(specs, scene.slotValues);
        sendJson(res, 200, { specs, values: scene.slotValues ?? {}, issues });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scenes\/([^/]+)\/slots$/);
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        const scene = application.scenes.find((s) => s.id === decodeURIComponent(m[2]));
        if (!scene) return sendError(res, 404, "Scene not found");
        scene.slotValues = { ...(scene.slotValues ?? {}), ...(body.slotValues ?? {}) };
        saveVideoApplication(application);
        const specs = application.template ? slotSpecsForScene(application.template, scene.order) : [];
        sendJson(res, 200, { values: scene.slotValues, issues: validateScene(specs, scene.slotValues) });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/validate$/);
      if (m && method === "GET") {
        const application = loadVideoApplication(decodeURIComponent(m[1]));
        const result = validateApplication(application);
        sendJson(res, 200, result);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/bgm$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const application = loadVideoApplication(id);
        const contentType = req.headers["content-type"] ?? "audio/mpeg";
        const ext = contentType.includes("wav") ? "wav" : contentType.includes("ogg") ? "ogg" : "mp3";
        const relPath = `bgm.${ext}`;
        fs.writeFileSync(videoFile(id, relPath), await readRawBody(req));
        application.bgm = relPath;
        saveVideoApplication(application);
        sendJson(res, 200, { ok: true, bgm: relPath });
        return;
      }
    }

    if (method === "GET" && p === "/api/render-hardware") {
      // Same probe renderVideo itself runs (NVENC -> QSV -> libx264), cached after
      // the first call -- lets the export modal show which GPU/CPU will actually
      // do the work before the user commits to starting a render. WebM has no
      // hardware path in this renderer (always libvpx-vp9, software), so it's
      // answered directly without a probe.
      const format = url.searchParams.get("format") === "webm" ? "webm" : "mp4";
      if (format === "webm") {
        sendJson(res, 200, { accelerator: "CPU", encoder: "libvpx-vp9 (CPU)" });
        return;
      }
      const choice = await detectBestH264Encoder("23");
      const accelerator = choice.codec.includes("nvenc") || choice.codec.includes("qsv") ? "GPU" : "CPU";
      sendJson(res, 200, { accelerator, encoder: choice.name });
      return;
    }

    if (method === "GET" && p === "/api/video-export-presets") {
      sendJson(res, 200, EXPORT_PRESETS);
      return;
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/render-jobs\/([^/]+)$/);
      if (m && method === "GET") {
        const vid = decodeURIComponent(m[1]);
        const jobId = decodeURIComponent(m[2]);
        const job = renderJobs.get(jobId);
        if (!job || job.applicationId !== vid) return sendError(res, 404, "Render job not found");
        sendJson(res, 200, {
          id: job.id,
          applicationId: job.applicationId,
          configId: job.configId,
          state: job.state,
          progress: job.progress,
          error: job.error,
          fileName: job.fileName,
          format: job.format,
          sizeBytes: job.sizeBytes,
          width: job.width,
          height: job.height,
          durationSec: job.durationSec,
          savedPath: job.savedPath,
          options: job.options,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
        });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/render-jobs\/([^/]+)\/cancel$/);
      if (m && method === "POST") {
        const vid = decodeURIComponent(m[1]);
        const jobId = decodeURIComponent(m[2]);
        const job = renderJobs.get(jobId);
        if (!job || job.applicationId !== vid) return sendError(res, 404, "Render job not found");
        if (job.state === "running" && job.abortController) {
          job.cancelRequested = true;
          job.abortController.abort();
        }
        sendJson(res, 202, { ok: true, state: job.state });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/render-jobs\/([^/]+)\/file$/);
      if (m && method === "GET") {
        const vid = decodeURIComponent(m[1]);
        const jobId = decodeURIComponent(m[2]);
        const job = renderJobs.get(jobId);
        if (!job || job.applicationId !== vid || !job.outputFile) return sendError(res, 404, "Render job output not found");
        if (!fs.existsSync(job.outputFile)) return sendError(res, 404, "Output file does not exist on disk");

        const isDownload = url.searchParams.get("download") === "1";
        const mimeType = job.format === "webm" ? "video/webm" : "video/mp4";
        if (isDownload) {
          const fn = job.fileName || `promo.${job.format}`;
          res.setHeader("Content-Disposition", `attachment; filename="${fn}"`);
        }
        sendFile(res, job.outputFile, mimeType);
        return;
      }
    }

    {
      // Electron's Download button: a deliberate "Save As" to wherever the user
      // just picked via the native dialog, which may differ from the remembered
      // default folder a render was written to. Same-machine copy (Electron's
      // main process and this server share a filesystem), no re-encode.
      const m = p.match(/^\/api\/videos\/([^/]+)\/render-jobs\/([^/]+)\/save-as$/);
      if (m && method === "POST") {
        const vid = decodeURIComponent(m[1]);
        const jobId = decodeURIComponent(m[2]);
        const job = renderJobs.get(jobId);
        if (!job || job.applicationId !== vid || !job.outputFile) return sendError(res, 404, "Render job output not found");
        if (!fs.existsSync(job.outputFile)) return sendError(res, 404, "Output file does not exist on disk");
        const body = await readJsonBody(req);
        const target = String(body.path || "").trim();
        if (!target) return sendError(res, 400, "'path' is required");
        try {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.copyFileSync(job.outputFile, target);
        } catch (err: any) {
          return sendError(res, 500, `Could not save to '${target}': ${err?.message || err}`);
        }
        sendJson(res, 200, { ok: true, path: target });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/exports$/);
      if (m && method === "GET") {
        const vid = decodeURIComponent(m[1]);
        const application = loadVideoApplication(vid);
        // Filter out records whose file no longer exists
        const validExports = (application.exports ?? []).filter((exp) => {
          const fileP = path.join(videoDir(vid), "exports", exp.fileName);
          return fs.existsSync(fileP) || (exp.savedPath && fs.existsSync(exp.savedPath));
        });
        if (validExports.length !== (application.exports?.length ?? 0)) {
          application.exports = validExports;
          saveVideoApplication(application);
        }
        sendJson(res, 200, validExports);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/exports\/([^/]+)$/);
      if (m && method === "DELETE") {
        const vid = decodeURIComponent(m[1]);
        const expId = decodeURIComponent(m[2]);
        const application = loadVideoApplication(vid);
        const exp = (application.exports ?? []).find((e) => e.id === expId);
        if (exp) {
          try {
            const fileP = path.join(videoDir(vid), "exports", exp.fileName);
            if (fs.existsSync(fileP)) fs.rmSync(fileP, { force: true });
          } catch {}
          application.exports = (application.exports ?? []).filter((e) => e.id !== expId);
          saveVideoApplication(application);
        }
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/exports\/([^/]+)\/file$/);
      if (m && method === "GET") {
        const vid = decodeURIComponent(m[1]);
        const expId = decodeURIComponent(m[2]);
        const application = loadVideoApplication(vid);
        const exp = (application.exports ?? []).find((e) => e.id === expId);
        if (!exp) return sendError(res, 404, "Export record not found");
        const fileP = path.join(videoDir(vid), "exports", exp.fileName);
        const targetP = fs.existsSync(fileP) ? fileP : (exp.savedPath && fs.existsSync(exp.savedPath)) ? exp.savedPath : null;
        if (!targetP) return sendError(res, 404, "Export file not found on disk");

        const isDownload = url.searchParams.get("download") === "1";
        const mimeType = exp.format === "webm" ? "video/webm" : "video/mp4";
        if (isDownload) {
          res.setHeader("Content-Disposition", `attachment; filename="${exp.fileName}"`);
        }
        sendFile(res, targetP, mimeType);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/render$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const body = (await readJsonBody(req)) || {};
        const application = loadVideoApplication(id);
        const preflight = validateApplication(application);
        if (!preflight.ready) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Some scenes are missing required content.", ...preflight }));
          return;
        }

        const { job, isNew } = startRenderJob(application, body);
        if (!isNew) {
          res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "A render is already running for this application.", jobId: job.id, job }));
          return;
        }
        sendJson(res, 202, { ok: true, jobId: job.id });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/download$/);
      if (m && method === "GET") {
        const outD = videoDir(decodeURIComponent(m[1]));
        const mp4P = path.join(outD, "promo.mp4");
        const webmP = path.join(outD, "promo.webm");
        const targetP = fs.existsSync(mp4P) ? mp4P : fs.existsSync(webmP) ? webmP : null;
        if (!targetP) return sendError(res, 404, "Video file not found");
        sendFile(res, targetP, targetP.endsWith(".webm") ? "video/webm" : "video/mp4");
        return;
      }
    }

    sendError(res, 404, `Endpoint not found: ${method} ${p}`);
  }

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      // High-speed WebSocket server for low-latency live Android mirroring
      const androidWss = new WebSocketServer({
        noServer: true,
        maxPayload: 10 * 1024 * 1024,
        perMessageDeflate: false,
      });

      server.on("upgrade", (req, socket, head) => {
        const u = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
        if (u.pathname === "/api/android/ws" || u.pathname === "/api/android/h264-ws") {
          androidWss.handleUpgrade(req, socket, head, (ws) => androidWss.emit("connection", ws, req));
        } else {
          socket.destroy();
        }
      });

      androidWss.on("connection", (ws, req) => {
        const u = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
        const isH264 = u.pathname === "/api/android/h264-ws" || u.searchParams.get("codec") === "h264";

        let unsubscribe: (() => void) | null = null;

        if (isH264) {
          const clientTimestamp = new Date().toISOString();
          let forwardedChunks = 0;
          // Flush cached SPS/PPS + keyframe so the VideoDecoder configures instantly — eliminates long black screen.
          try {
            const { header, keyFrame } = getInitialH264();
            console.log(`[${clientTimestamp}] [SAG-WS] New H264 client connected. Initial flush: header=${header?.length ?? 0} bytes, keyFrame=${keyFrame?.length ?? 0} bytes`);
            if (header && ws.readyState === WebSocket.OPEN) ws.send(header, { binary: true, compress: false });
            if (keyFrame && ws.readyState === WebSocket.OPEN) ws.send(keyFrame, { binary: true, compress: false });
          } catch (_) {}
          const onH264Chunk = (chunk: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
              forwardedChunks++;
              if (forwardedChunks === 1 || forwardedChunks % 120 === 0) {
                console.log(`[${new Date().toISOString()}] [SAG-WS] Forwarding chunk #${forwardedChunks} (${chunk.length} bytes) to WS client`);
              }
              ws.send(chunk, { binary: true, compress: false });
            }
          };
          unsubscribe = subscribeAndroidH264(onH264Chunk);
        } else {
          let sending = false;
          let pendingFrame: Buffer | null = null;

          const sendNext = (frame: Buffer) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            sending = true;
            ws.send(frame, { binary: true, compress: false }, (err) => {
              sending = false;
              if (!err && pendingFrame) {
                const next = pendingFrame;
                pendingFrame = null;
                sendNext(next);
              }
            });
          };

          const onFrame = (frame: Buffer) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            if (sending) {
              pendingFrame = frame;
              return;
            }
            sendNext(frame);
          };

          unsubscribe = subscribeAndroidFrames(onFrame);
          try {
            const initial = getAndroidFrame();
            onFrame(initial);
          } catch (_) {}
        }

        ws.on("message", (raw) => {
          // Binary scrcpy control packets (32/14/21/2/1 bytes): pass through to control socket with zero-copy.
          try {
            const buf = Buffer.isBuffer(raw)
              ? raw
              : raw instanceof ArrayBuffer
              ? Buffer.from(raw)
              : Array.isArray(raw)
              ? Buffer.concat(raw)
              : null;

            if (buf && (buf.length === 32 || buf.length === 14 || buf.length === 21 || buf.length === 2 || buf.length === 1)) {
              if (sendScrcpyControlBuffer(buf)) {
                if (buf[0] === 2 && buf[1] !== 2) {
                  console.log(`[SAG-WS-CONTROL] Forwarded binary touch opcode=2 action=${buf[1]} (${buf.length}b)`);
                } else if (buf[0] === 0) {
                  console.log(`[SAG-WS-CONTROL] Forwarded binary key opcode=0 keycode=${buf.readUInt32BE(2)} (${buf.length}b)`);
                } else if (buf[0] === 3) {
                  console.log(`[SAG-WS-CONTROL] Forwarded binary scroll opcode=3 (${buf.length}b)`);
                }
                return;
              }
            }

            const msg = (buf ? buf : Buffer.from(raw as any)).toString("utf-8");
            const parsed = JSON.parse(msg);
            if (parsed && typeof parsed === "object" && parsed.type) {
              executeAndroidAction(parsed);
            }
          } catch (err: any) {
            // Non-JSON string or unparseable buffer
          }
        });

        const cleanup = () => {
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
        };

        ws.on("close", cleanup);
        ws.on("error", cleanup);
      });

      const address = `http://${host}:${port}`;
      console.log(`Store Assets Generator web interface running at ${address}`);

      if (options.openBrowser !== false) {
        openInBrowser(address);
      }

      resolve(server);
    });
  });
}

function openInBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "win32") exec(`start "" "${url}"`);
    else if (platform === "darwin") exec(`open "${url}"`);
    else exec(`xdg-open "${url}"`);
  } catch {}
}
