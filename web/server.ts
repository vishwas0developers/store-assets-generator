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
import { getDeviceGlbPath } from "../src/devices/device-manager.js";
import { loadPlatformSpec } from "../src/platform/index.js";

import {
  createProject,
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  deleteProjectCapture,
  projectDir,
  projectFile,
} from "../src/project/projectStore.js";
import {
  startBrowserSession,
  stopBrowserSession,
  executeBrowserAction,
  getBrowserFrame,
  captureBrowserScreen,
  startBrowserRecording,
  stopBrowserRecording,
  isBrowserRecording,
} from "../src/capture/liveBrowser.js";
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
  listMockupProjects,
  loadMockupProject,
  mockupDir,
  mockupFile,
  saveMockupProject,
  setCellOverride,
  setCellOverridePath,
  updateColumnStyle,
  type ColumnStyle,
  type MockupDeviceRow,
} from "../src/mockup/project.js";
import { groupedLayoutPresets, listLayoutPresets } from "../src/mockup/layouts.js";
import { cellPreviewHtml, renderTemplateDetailThumbs, renderTemplateThumbs, templateThumbHtml, templateDetailThumbHtml, templateScreenHtml } from "../src/mockup/render.js";
import { exportMockupProject, exportSingleScreen, exportPanoramicBanner } from "../src/mockup/export.js";
import { MOCKUP_TEMPLATES, applyMockupTemplate } from "../src/mockup/templates.js";

import {
  listVideoProjects,
  loadVideoProject,
  saveVideoProject,
  videoDir,
  videoFile,
} from "../src/video/project.js";
import { listSceneAnimations, listSceneLayouts, listVideoBackgrounds, renderVideo, renderVideoTemplateThumbs, sceneHtml, scenePreviewHtml, sourceKindsFor, sourceUrisFor, templatePreviewHtml } from "../src/video/render.js";
import { VIDEO_TEMPLATES, applyVideoTemplate, resolveTemplateId, scratchVideoProject, loadAllTemplates } from "../src/video/templates.js";
import { BGM_PRESETS, renderBgmWav } from "../src/video/bgm.js";
import { slotSpecsForScene, validateScene, type SlotIssue } from "../src/video/slots.js";
import { type SlotValue } from "../src/video/project.js";

/**
 * Local-only manual workflow surface -- a thin HTTP adapter over three
 * fully independent project stores (Screen Capture / Studio Mockup /
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

function validateProject(project: { template: string | null; scenes: { id: string; order: number; slotValues?: Record<string, SlotValue> }[] }) {
  const scenes = project.template
    ? project.scenes.map((scene) => {
        const specs = slotSpecsForScene(project.template as string, scene.order);
        const issues: SlotIssue[] = validateScene(specs, scene.slotValues);
        return { sceneId: scene.id, issues };
      })
    : [];
  const ready = scenes.every((s) => s.issues.every((i) => i.severity !== "error"));
  return { ready, scenes };
}

function sniffImageFormat(buf: Buffer): "png" | "jpeg" | "webp" | "gif" | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.length >= 6 && buf.toString("ascii", 0, 3) === "GIF") return "gif";
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
  installProcessGuards();
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

    if (method === "POST" && p === "/api/devices/import") {
      try {
        const body = await readJsonBody(req);
        const devices = Array.isArray(body) ? body : body.devices;
        if (!Array.isArray(devices)) {
          return sendError(res, 400, "Expected a JSON array of device specifications, or an object with a 'devices' array.");
        }
        const customFile = path.join(process.cwd(), "output", ".custom-devices.json");
        fs.writeFileSync(customFile, JSON.stringify(devices, null, 2), "utf-8");
        reloadRegistry();
        sendJson(res, 200, { ok: true, count: devices.length, total: DEVICE_REGISTRY.length });
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
      res.end(JSON.stringify(DEVICE_REGISTRY, null, 2));
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

    // Projects API (Screen Capture Tab)
    if (method === "GET" && p === "/api/projects") {
      sendJson(res, 200, { projects: listProjects() });
      return;
    }

    if (method === "POST" && p === "/api/projects") {
      const body = await readJsonBody(req);
      if (!body.name) return sendError(res, 400, "name is required");
      const project = createProject(body.name, body.appCategory || "Utility", body.targetUrl || "");
      sendJson(res, 200, project);
      return;
    }

    {
      const m = p.match(/^\/api\/projects\/([^/]+)$/);
      if (m && method === "GET") return sendJson(res, 200, loadProject(decodeURIComponent(m[1])));
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        const project = loadProject(decodeURIComponent(m[1]));
        if (body.name !== undefined) project.name = body.name;
        if (body.appCategory !== undefined) project.appCategory = body.appCategory;
        if (body.targetUrl !== undefined) project.targetUrl = body.targetUrl;
        saveProject(project);
        sendJson(res, 200, project);
        return;
      }
      if (m && method === "DELETE") {
        deleteProject(decodeURIComponent(m[1]));
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/projects\/([^/]+)\/files$/);
      if (m && method === "GET") {
        const id = decodeURIComponent(m[1]);
        const dir = projectDir(id);
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
      const m = p.match(/^\/api\/projects\/([^/]+)\/captures\/([^/]+)$/);
      if (m && method === "DELETE") {
        const projId = decodeURIComponent(m[1]);
        const captureId = decodeURIComponent(m[2]);
        deleteProjectCapture(projId, captureId);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/projects\/([^/]+)\/file$/);
      if (m && method === "GET") {
        const rel = url.searchParams.get("p");
        if (!rel) return sendError(res, 400, "query param 'p' is required");
        const abs = projectFile(decodeURIComponent(m[1]), rel);
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
        deleteProjectCapture(projId, rel);
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

    // Live Web Browser endpoints
    if (method === "POST" && p === "/api/browser/start") {
      const body = await readJsonBody(req);
      if (!body.projectId || !body.url) {
        return sendError(res, 400, "projectId and url are required");
      }
      try {
        const result = await startBrowserSession(body.projectId, body.url);
        sendJson(res, 200, { ok: true, ...result });
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
      if (!body.projectId) {
        return sendError(res, 400, "projectId is required");
      }
      try {
        const capture = await captureBrowserScreen(body.projectId);
        sendJson(res, 200, capture);
      } catch (err: any) {
        sendError(res, 500, err.message || "Failed to capture browser screen");
      }
      return;
    }

    if (method === "POST" && p === "/api/browser/record/start") {
      const body = await readJsonBody(req);
      if (!body.projectId) return sendError(res, 400, "projectId is required");
      try {
        sendJson(res, 200, startBrowserRecording(body.projectId));
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
      if (!body.projectId) {
        return sendError(res, 400, "projectId is required");
      }
      try {
        const result = await startAndroidSession(body.projectId, body.deviceId, {
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
      if (!body.projectId) {
        return sendError(res, 400, "projectId is required");
      }
      const capture = await captureAndroidScreen(body.projectId, body.imageData);
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
      if (!body.projectId) return sendError(res, 400, "projectId is required");
      try {
        sendJson(res, 200, startAndroidRecording(body.projectId));
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
      const sessions = listProjects().map((p) => ({
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
      const project = createProject(body.name || body.url || "Untitled Project", "Utility", body.url);
      sendJson(res, 200, {
        id: project.id,
        createdAt: project.createdAt,
        name: project.name,
        source: "website",
        url: project.targetUrl,
        platforms: ["google-play"],
        raw: [],
      });
      return;
    }

    {
      const m = p.match(/^\/api\/captures\/([^/]+)$/);
      if (m && method === "GET") {
        const project = loadProject(decodeURIComponent(m[1]));
        sendJson(res, 200, {
          id: project.id,
          createdAt: project.createdAt,
          name: project.name,
          source: "website",
          url: project.targetUrl,
          platforms: ["google-play"],
          raw: project.captures.map((c) => ({
            file: c.file,
            width: c.width,
            height: c.height,
            capturedAt: c.capturedAt,
          })),
        });
        return;
      }
    }

    // Mockup projects
    if (method === "GET" && p === "/api/mockups/layouts") {
      sendJson(res, 200, {
        presets: listLayoutPresets(),
        grouped: groupedLayoutPresets()
      });
      return;
    }

    if (method === "GET" && p === "/api/mockups") {
      sendJson(res, 200, { projects: listMockupProjects() });
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
      }));
      sendJson(res, 200, { devices: list });
      return;
    }

    if (method === "POST" && p === "/api/mockups") {
      const body = await readJsonBody(req);
      if (!body.name) return sendError(res, 400, "name is required");
      const project = createProject(body.name);
      sendJson(res, 200, project.mockup);
      return;
    }

    {
      const m = p.match(/^\/api\/mockups\/(?!templates$|layouts$|export$)([^/]+)$/);
      if (m && method === "GET") return sendJson(res, 200, loadMockupProject(decodeURIComponent(m[1])));
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        const project = loadMockupProject(decodeURIComponent(m[1]));
        if (body.devices !== undefined) project.devices = body.devices;
        if (body.columns !== undefined) project.columns = body.columns;
        if (body.cells !== undefined) project.cells = body.cells;
        if (body.sources !== undefined) project.sources = body.sources;
        if (body.globalPanoramic !== undefined) project.globalPanoramic = body.globalPanoramic;
        if (body.panoramaAssets !== undefined) project.panoramaAssets = body.panoramaAssets;
        if (body.settings !== undefined) project.settings = body.settings;
        saveMockupProject(project);
        sendJson(res, 200, project);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/columns$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const body = (await readJsonBody(req).catch(() => ({}))) || {};
        const project = loadMockupProject(id);
        const style = body.style || defaultColumnStyle(`Screen ${project.columns.length + 1}`);
        const col = addColumn(project, style);
        saveMockupProject(project);
        sendJson(res, 200, { project, column: col });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/columns\/([^/]+)$/);
      if (m && method === "PUT") {
        const id = decodeURIComponent(m[1]);
        const colId = decodeURIComponent(m[2]);
        const body = await readJsonBody(req);
        const project = loadMockupProject(id);
        if (body.style) {
          updateColumnStyle(project, colId, body.style);
          saveMockupProject(project);
        }
        sendJson(res, 200, { project });
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
        const project = loadMockupProject(id);
        if (body.path !== undefined) {
          // Sparse per-field override: { path: "deviceOne.rotation", value: 12 }
          setCellOverridePath(project, rowId, colId, body.path, body.value);
        } else if (body.paths && typeof body.paths === "object") {
          for (const [path, value] of Object.entries(body.paths)) setCellOverridePath(project, rowId, colId, path, value);
        } else {
          // Legacy whole-sub-object override, e.g. { override: { deviceOne: {...} } } or { override: null } to clear.
          setCellOverride(project, rowId, colId, body.override ?? body.style ?? null);
        }
        saveMockupProject(project);
        sendJson(res, 200, { project });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/devices(?:\/([^/]+))?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const rowId = m[2] ? decodeURIComponent(m[2]) : null;
        const project = loadMockupProject(id);
        if (method === "POST") {
          const body = await readJsonBody(req);
          const dev = addDeviceRow(project, {
            deviceId: body.deviceId || "phone",
            variant: body.variant,
            label: body.label || "Row",
            previewsVisible: true,
            isBase: project.devices.length === 0,
          });
          saveMockupProject(project);
          sendJson(res, 200, { project, device: dev });
          return;
        }
        if (method === "DELETE" && rowId) {
          project.devices = project.devices.filter((d) => d.id !== rowId);
          saveMockupProject(project);
          sendJson(res, 200, { project });
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
        const project = loadMockupProject(id);
        const rel = `sources/${Date.now()}_${filename}`;
        const abs = mockupFile(id, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, Buffer.from(base64Data, "base64"));
        const sourceObj = {
          id: `source_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: filename,
          file: rel,
          width: body.width || 1080,
          height: body.height || 1920,
        };
        project.sources = project.sources || [];
        project.sources.push(sourceObj);
        saveMockupProject(project);
        sendJson(res, 200, { project, source: sourceObj });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/export$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const project = loadMockupProject(id);
        try {
          const result = await exportMockupProject(project);
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
        const project = loadMockupProject(id);
        const body = await readJsonBody(req);
        try {
          const file = await exportSingleScreen(project, body?.columnId);
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
        const project = loadMockupProject(id);
        try {
          const file = await exportPanoramicBanner(project);
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
        if (!fs.existsSync(abs)) abs = projectFile(id, rel);
        const ext = path.extname(abs).toLowerCase();
        sendFile(res, abs, ext === ".zip" ? "application/zip" : "image/png");
        return;
      }
    }

    // Templates section
    if (method === "GET" && p === "/api/mockups/templates") {
      sendJson(res, 200, {
        templates: MOCKUP_TEMPLATES.map((t: any) => ({
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
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" });
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
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" });
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
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" });
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
      const m = p.match(/^\/api\/mockups\/([^/]+)\/apply-template$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        if (!body.templateId) return sendError(res, 400, "templateId is required");
        const id = decodeURIComponent(m[1]);
        const project = loadMockupProject(id);
        applyMockupTemplate(project, body.templateId);
        saveMockupProject(project);
        sendJson(res, 200, project);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/cell-preview\/([^/]+)\/([^/]+)$/);
      if (m && method === "GET") {
        const id = decodeURIComponent(m[1]);
        const deviceRowId = decodeURIComponent(m[2]);
        const columnId = decodeURIComponent(m[3]);
        const project = loadMockupProject(id);
        const html = cellPreviewHtml(project, deviceRowId, columnId, { width: 1080, height: 1920 });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(html);
        return;
      }
    }

    // Video tab
    if (method === "GET" && p === "/api/videos") {
      sendJson(res, 200, { projects: listVideoProjects() });
      return;
    }

    if (method === "POST" && p === "/api/videos") {
      const body = await readJsonBody(req);
      if (!body.name) return sendError(res, 400, "name is required");
      const project = createProject(body.name);
      sendJson(res, 200, project.video);
      return;
    }

    {
      const m = p.match(/^\/api\/videos\/(?!templates$|scene-options$)([^/]+)$/);
      if (m && method === "GET") return sendJson(res, 200, loadVideoProject(decodeURIComponent(m[1])));
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        const project = loadVideoProject(decodeURIComponent(m[1]));
        if (body.template !== undefined) project.template = body.template;
        if (body.scenes !== undefined) project.scenes = body.scenes;
        if (body.bgm !== undefined) project.bgm = body.bgm;
        if (body.bgmVolume !== undefined) project.bgmVolume = body.bgmVolume;
        if (body.brand !== undefined) project.brand = body.brand;
        saveVideoProject(project);
        sendJson(res, 200, project);
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
        if (!fs.existsSync(abs)) abs = projectFile(id, rel);
        const ext = path.extname(abs).toLowerCase();
        let mime = "image/png";
        if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
        else if (ext === ".webp") mime = "image/webp";
        else if (ext === ".mp4") mime = "video/mp4";
        else if (ext === ".webm") mime = "video/webm";
        else if (ext === ".wav") mime = "audio/wav";
        else if (ext === ".mp3") mime = "audio/mpeg";
        sendFile(res, abs, mime);
        return;
      }
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
        const sourceProjectId = url.searchParams.get("projectId");
        const sources = sourceProjectId ? loadVideoProject(decodeURIComponent(sourceProjectId)).sources : [];
        const scratch = scratchVideoProject(templateId, sources);
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
        const sourceProjectId = url.searchParams.get("projectId");
        const sources = sourceProjectId ? loadVideoProject(decodeURIComponent(sourceProjectId)).sources : [];
        const scratch = scratchVideoProject(templateId, sources);
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
        const project = loadVideoProject(decodeURIComponent(m[1]));
        applyVideoTemplate(project, body.templateId);
        saveVideoProject(project);
        sendJson(res, 200, project);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/template-preview$/);
      if (m && method === "GET") {
        const project = loadVideoProject(decodeURIComponent(m[1]));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(templatePreviewHtml(project));
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
        const project = loadVideoProject(id);
        const name = url.searchParams.get("name") ?? `image_${project.sources.length + 1}`;
        const contentType = req.headers["content-type"] ?? "";
        const isVideo = contentType.includes("video/");
        if (isVideo) {
          const ext = contentType.includes("webm") ? "webm" : "mp4";
          const relPath = `sources/rec_${Date.now()}.${ext}`;
          fs.writeFileSync(videoFile(id, relPath), await readRawBody(req));
          const source = { id: `src_${Date.now()}`, name, file: relPath, width: 0, height: 0, kind: "video" as const };
          project.sources.push(source);
          saveVideoProject(project);
          sendJson(res, 200, source);
          return;
        }
        const bodyBuf = await readRawBody(req);
        const format = sniffImageFormat(bodyBuf);
        if (!format) return sendError(res, 400, "Unrecognized image format (expected PNG, JPEG, WebP, or GIF).");
        const relPath = `sources/img_${Date.now()}.${imageExtFor(format)}`;
        const abs = videoFile(id, relPath);
        fs.writeFileSync(abs, bodyBuf);
        const dims = imageDimensions(bodyBuf, format);
        const source = { id: `src_${Date.now()}`, name, file: relPath, width: dims?.width ?? 0, height: dims?.height ?? 0, kind: "image" as const };
        project.sources.push(source);

        const slotParam = url.searchParams.get("slot");
        if (slotParam) {
          const [sceneId, slotKey, indexStr] = slotParam.split(":");
          const scene = project.scenes.find((s) => s.id === sceneId);
          if (scene) {
            scene.slotValues = scene.slotValues ?? {};
            const spec = slotSpecsForScene(project.template ?? "", scene.order).find((sp) => sp.key === slotKey);
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

        saveVideoProject(project);
        sendJson(res, 200, source);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/sources\/([^/]+)$/);
      if (m && method === "DELETE") {
        const project = loadVideoProject(decodeURIComponent(m[1]));
        const sourceId = decodeURIComponent(m[2]);
        const idx = project.sources.findIndex((s) => s.id === sourceId);
        if (idx === -1) return sendError(res, 404, "Source not found");
        project.sources.splice(idx, 1);
        saveVideoProject(project);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scenes$/);
      if (m && method === "POST") {
        const project = loadVideoProject(decodeURIComponent(m[1]));
        if (project.scenes.length === 0) return sendError(res, 400, "Apply a template before adding scenes.");
        if (project.scenes.length >= 24) return sendError(res, 400, "24 scenes is the maximum for this project.");
        const last = [...project.scenes].sort((a, b) => a.order - b.order).at(-1)!;
        const order = project.scenes.length;
        const newScene = { ...last, id: `scene_${Date.now()}`, order, screenIds: undefined, text: "", subtext: "" };
        project.scenes.push(newScene);
        saveVideoProject(project);
        sendJson(res, 200, project);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scenes\/order$/);
      if (m && method === "PATCH") {
        const body = await readJsonBody(req);
        const project = loadVideoProject(decodeURIComponent(m[1]));
        const order: string[] = body.order ?? [];
        for (const scene of project.scenes) {
          const idx = order.indexOf(scene.id);
          if (idx !== -1) scene.order = idx;
        }
        project.scenes.sort((a, b) => a.order - b.order);
        saveVideoProject(project);
        sendJson(res, 200, project);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/configs$/);
      if (m && method === "GET") {
        const project = loadVideoProject(decodeURIComponent(m[1]));
        sendJson(res, 200, project.savedConfigs ?? []);
        return;
      }
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        const name = String(body.name ?? "").trim();
        if (!name) return sendError(res, 400, "A configuration name is required.");
        const project = loadVideoProject(decodeURIComponent(m[1]));
        if (!project.template || project.scenes.length === 0) return sendError(res, 400, "Apply a template before saving a configuration.");
        project.savedConfigs = project.savedConfigs ?? [];
        const existing = project.savedConfigs.find((c) => c.name === name);
        const snapshot = {
          id: existing?.id ?? `cfg_${Date.now()}`,
          name,
          template: project.template,
          scenes: JSON.parse(JSON.stringify(project.scenes)),
          savedAt: new Date().toISOString(),
        };
        if (existing) {
          if (!body.overwrite) return sendError(res, 409, `A configuration named '${name}' already exists.`);
          Object.assign(existing, snapshot);
        } else {
          project.savedConfigs.push(snapshot);
        }
        saveVideoProject(project);
        sendJson(res, 200, project.savedConfigs);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/configs\/([^/]+)\/apply$/);
      if (m && method === "POST") {
        const project = loadVideoProject(decodeURIComponent(m[1]));
        const cfg = (project.savedConfigs ?? []).find((c) => c.id === decodeURIComponent(m[2]));
        if (!cfg) return sendError(res, 404, "Saved configuration not found");
        project.template = cfg.template;
        project.scenes = JSON.parse(JSON.stringify(cfg.scenes));
        saveVideoProject(project);
        sendJson(res, 200, project);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/configs\/([^/]+)$/);
      if (m && method === "DELETE") {
        const project = loadVideoProject(decodeURIComponent(m[1]));
        const before = project.savedConfigs?.length ?? 0;
        project.savedConfigs = (project.savedConfigs ?? []).filter((c) => c.id !== decodeURIComponent(m[2]));
        if (project.savedConfigs.length === before) return sendError(res, 404, "Saved configuration not found");
        saveVideoProject(project);
        sendJson(res, 200, project.savedConfigs);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scenes\/([^/]+)$/);
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        const project = loadVideoProject(decodeURIComponent(m[1]));
        const idx = project.scenes.findIndex((s) => s.id === decodeURIComponent(m[2]));
        if (idx === -1) return sendError(res, 404, "Scene not found");
        const nextAspect = body.aspectRatio ?? project.scenes[idx].aspectRatio;
        if (project.scenes.some((s, i) => i !== idx && (s.aspectRatio ?? "9:16") !== (nextAspect ?? "9:16"))) {
          return sendError(res, 400, "Every scene in a project must share the same aspect ratio.");
        }
        project.scenes[idx] = { ...project.scenes[idx], ...body };
        saveVideoProject(project);
        sendJson(res, 200, project.scenes[idx]);
        return;
      }
      if (m && method === "DELETE") {
        const project = loadVideoProject(decodeURIComponent(m[1]));
        const idx = project.scenes.findIndex((s) => s.id === decodeURIComponent(m[2]));
        if (idx === -1) return sendError(res, 404, "Scene not found");
        if (project.scenes.length <= 1) return sendError(res, 400, "A project needs at least one scene.");
        project.scenes.splice(idx, 1);
        project.scenes.sort((a, b) => a.order - b.order).forEach((s, i) => (s.order = i));
        saveVideoProject(project);
        sendJson(res, 200, project);
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
        const project = loadVideoProject(decodeURIComponent(m[1]));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(scenePreviewHtml(project, decodeURIComponent(m[2])));
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scene-spec\/([^/]+)$/);
      if (m && method === "GET") {
        const project = loadVideoProject(decodeURIComponent(m[1]));
        const scene = project.scenes.find((s) => s.id === decodeURIComponent(m[2]));
        if (!scene || !project.template) return sendError(res, 404, "Scene not found");
        const specs = slotSpecsForScene(project.template, scene.order);
        const issues = validateScene(specs, scene.slotValues);
        sendJson(res, 200, { specs, values: scene.slotValues ?? {}, issues });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scenes\/([^/]+)\/slots$/);
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        const project = loadVideoProject(decodeURIComponent(m[1]));
        const scene = project.scenes.find((s) => s.id === decodeURIComponent(m[2]));
        if (!scene) return sendError(res, 404, "Scene not found");
        scene.slotValues = { ...(scene.slotValues ?? {}), ...(body.slotValues ?? {}) };
        saveVideoProject(project);
        const specs = project.template ? slotSpecsForScene(project.template, scene.order) : [];
        sendJson(res, 200, { values: scene.slotValues, issues: validateScene(specs, scene.slotValues) });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/validate$/);
      if (m && method === "GET") {
        const project = loadVideoProject(decodeURIComponent(m[1]));
        const result = validateProject(project);
        sendJson(res, 200, result);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/bgm$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const project = loadVideoProject(id);
        const contentType = req.headers["content-type"] ?? "audio/mpeg";
        const ext = contentType.includes("wav") ? "wav" : contentType.includes("ogg") ? "ogg" : "mp3";
        const relPath = `bgm.${ext}`;
        fs.writeFileSync(videoFile(id, relPath), await readRawBody(req));
        project.bgm = relPath;
        saveVideoProject(project);
        sendJson(res, 200, { ok: true, bgm: relPath });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/render$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const project = loadVideoProject(id);
        const preflight = validateProject(project);
        if (!preflight.ready) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Some scenes are missing required content.", ...preflight }));
          return;
        }
        const videoPath = await renderVideo(project);
        project.outputs.video = path.relative(videoDir(id), videoPath).split(path.sep).join("/");
        saveVideoProject(project);
        sendJson(res, 200, { videoPath: project.outputs.video });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/download$/);
      if (m && method === "GET") {
        sendFile(res, path.join(videoDir(decodeURIComponent(m[1])), "promo.mp4"), "video/mp4");
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
