import { loadEnvFile } from "../src/config/env.js";
loadEnvFile();

import http from "http";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { setCredentials, getCredentialStatus, clearCredentials } from "../src/auth/credentials.js";
import { getDemoAccessConfig, setDemoAccessConfig } from "../src/auth/appConfig.js";
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
import { listDevices } from "../src/devices/registry.js";
import { loadPlatformSpec } from "../src/platform/index.js";

import {
  captureDir,
  captureFile,
  createCaptureSession,
  deleteCaptureSession,
  listCaptureSessions,
  loadCaptureSession,
  saveCaptureSession,
} from "../src/capture/store.js";
import { captureWebsiteScreens } from "../src/capture/websiteCapture.js";
import { captureAndroidScreen, listAndroidDevices } from "../src/capture/androidCapture.js";

import {
  addColumn,
  addDeviceRow,
  createMockupProject,
  defaultColumnStyle,
  listMockupProjects,
  loadMockupProject,
  mockupDir,
  mockupFile,
  saveMockupProject,
  setCellOverride,
  updateColumnStyle,
  type ColumnStyle,
  type MockupDeviceRow,
} from "../src/mockup/project.js";
import { groupedLayoutPresets, listLayoutPresets } from "../src/mockup/layouts.js";
import { cellPreviewHtml } from "../src/mockup/render.js";
import { exportMockupProject } from "../src/mockup/export.js";
import { MOCKUP_TEMPLATES, applyMockupTemplate } from "../src/mockup/templates.js";

import {
  createVideoProject,
  listVideoProjects,
  loadVideoProject,
  saveVideoProject,
  videoDir,
  videoFile,
} from "../src/video/project.js";
import { listSceneAnimations, listVideoBackgrounds, renderVideo, scenePreviewHtml, templatePreviewHtml } from "../src/video/render.js";
import { VIDEO_TEMPLATES, applyVideoTemplate } from "../src/video/templates.js";

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

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function readRawBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

function sendFile(res: http.ServerResponse, filePath: string, contentType: string): void {
  if (!fs.existsSync(filePath)) {
    sendError(res, 404, `File not found: ${filePath}`);
    return;
  }
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

function imageExtFromContentType(contentType: string | undefined): string {
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  if (contentType?.includes("webp")) return "webp";
  return "png";
}

function pngSize(absPath: string): { width: number; height: number } {
  const buf = fs.readFileSync(absPath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";
  const p = url.pathname;

  try {
    if (method === "GET" && p === "/") {
      if (!fs.existsSync(INDEX_HTML_PATH)) {
        sendError(res, 500, `Web UI asset missing: ${INDEX_HTML_PATH}. Reinstall or rebuild the package.`);
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(INDEX_HTML_PATH, "utf-8"));
      return;
    }

    if (method === "GET" && p === "/app.css") {
      sendFile(res, path.join(__dirname, "app.css"), "text/css; charset=utf-8");
      return;
    }
    if (method === "GET" && p === "/app.js") {
      sendFile(res, path.join(__dirname, "app.js"), "application/javascript; charset=utf-8");
      return;
    }

    if (method === "GET" && p === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    // --- Demo access config (shared, not tab-scoped): demo account
    // credentials (encrypted) + the two non-secret endpoint settings
    // (admin panel domain, app code) that make login automatic for any
    // captured URL — see src/auth/appConfig.ts's loadDefaultAuthConfig().
    // Frontend/target URLs are deliberately NOT part of this: each capture
    // supplies its own URL, and the cookie domain is derived from it.

    if (method === "GET" && p === "/api/auth/status") {
      sendJson(res, 200, { ...getCredentialStatus(), ...getDemoAccessConfig() });
      return;
    }
    if (method === "POST" && p === "/api/auth/credentials") {
      const body = await readJsonBody(req);
      if (!body.email) return sendError(res, 400, "email is required");
      setCredentials(body.email, body.password);
      setDemoAccessConfig({ adminApiBaseUrl: body.adminApiBaseUrl, appCode: body.appCode });
      sendJson(res, 200, { ok: true });
      return;
    }
    if (method === "DELETE" && p === "/api/auth/credentials") {
      clearCredentials();
      sendJson(res, 200, { ok: true });
      return;
    }

    // --- AI provider / model management (shared config, not tab-scoped) ---

    if (method === "GET" && p === "/api/ai/providers") {
      sendJson(res, 200, { providers: listProviders() });
      return;
    }
    if (method === "POST" && p === "/api/ai/providers") {
      const body = await readJsonBody(req);
      if (!body.id) return sendError(res, 400, "id is required");
      upsertProvider(body.id, { adapter: body.adapter, baseUrl: body.baseUrl, enabled: body.enabled, requiresKey: body.requiresKey });
      if (body.apiKey) setProviderKey(body.id, body.apiKey);
      sendJson(res, 200, { ok: true });
      return;
    }
    {
      const m = p.match(/^\/api\/ai\/providers\/([^/]+)$/);
      if (m && method === "DELETE") {
        deleteProvider(decodeURIComponent(m[1]));
        clearProviderKey(decodeURIComponent(m[1]));
        sendJson(res, 200, { ok: true });
        return;
      }
    }
    {
      const m = p.match(/^\/api\/ai\/providers\/([^/]+)\/test$/);
      if (m && method === "POST") {
        const provider = getProvider(decodeURIComponent(m[1]));
        if (!provider) return sendError(res, 404, `Unknown provider '${m[1]}'`);
        sendJson(res, 200, await testProvider(provider));
        return;
      }
    }
    {
      const m = p.match(/^\/api\/ai\/providers\/([^/]+)\/fetch-models$/);
      if (m && method === "GET") {
        const provider = getProvider(decodeURIComponent(m[1]));
        if (!provider) return sendError(res, 404, `Unknown provider '${m[1]}'`);
        const result = await fetchModelsForProvider(provider);
        sendJson(res, 200, isDiscoveryError(result) ? { models: [], ...result } : { models: result });
        return;
      }
    }
    if (method === "GET" && p === "/api/ai/models") {
      sendJson(res, 200, { models: listModels(), defaultModel: getDefaultModel() });
      return;
    }
    if (method === "POST" && p === "/api/ai/models") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.models)) return sendError(res, 400, "models array is required");
      saveModels(body.models);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (method === "POST" && p === "/api/ai/models/default") {
      const body = await readJsonBody(req);
      if (!body.provider || !body.modelId) return sendError(res, 400, "provider and modelId are required");
      setDefaultModel(body.provider, body.modelId);
      sendJson(res, 200, { ok: true });
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

    // --- Shared reference data (devices, platform specs) ---

    if (method === "GET" && p === "/api/devices") {
      const platform = (url.searchParams.get("platform") as any) || undefined;
      const formFactor = (url.searchParams.get("formFactor") as any) || undefined;
      sendJson(res, 200, { devices: listDevices({ platform, formFactor }) });
      return;
    }
    if (method === "GET" && p === "/api/platforms") {
      sendJson(res, 200, {
        platforms: ["google-play", "apple-app-store"].map((id) => {
          const spec = loadPlatformSpec(id);
          return { id, name: spec.name, deviceClasses: spec.deviceClasses };
        }),
      });
      return;
    }

    // =========================================================
    // Screen Capture tab -- Website Capture + Android Capture
    // =========================================================

    if (method === "GET" && p === "/api/captures") {
      sendJson(res, 200, { sessions: listCaptureSessions() });
      return;
    }
    if (method === "POST" && p === "/api/captures") {
      const body = await readJsonBody(req);
      const source = body.source === "android" ? "android" : "website";
      if (source === "website" && !body.url) return sendError(res, 400, "url is required for website capture");
      const session = createCaptureSession({
        source,
        url: body.url,
        slug: body.slug,
        name: body.name,
        platforms: Array.isArray(body.platforms) && body.platforms.length ? body.platforms : ["google-play"],
      });
      sendJson(res, 200, session);
      return;
    }
    {
      const m = p.match(/^\/api\/captures\/([^/]+)$/);
      if (m && method === "GET") return sendJson(res, 200, loadCaptureSession(decodeURIComponent(m[1])));
      if (m && method === "DELETE") {
        deleteCaptureSession(decodeURIComponent(m[1]));
        sendJson(res, 200, { ok: true });
        return;
      }
    }
    {
      const m = p.match(/^\/api\/captures\/([^/]+)\/file$/);
      if (m && method === "GET") {
        const rel = url.searchParams.get("p");
        if (!rel) return sendError(res, 400, "query param 'p' is required");
        sendFile(res, captureFile(decodeURIComponent(m[1]), rel), "image/png");
        return;
      }
    }
    {
      const m = p.match(/^\/api\/captures\/([^/]+)\/website$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        const session = loadCaptureSession(decodeURIComponent(m[1]));
        const updated = await captureWebsiteScreens(session, { maxPages: body.maxPages, email: body.email, password: body.password });
        sendJson(res, 200, { count: updated.raw.length, raw: updated.raw });
        return;
      }
    }
    {
      const m = p.match(/^\/api\/captures\/([^/]+)\/android\/devices$/);
      if (m && method === "GET") {
        sendJson(res, 200, { devices: await listAndroidDevices() });
        return;
      }
    }
    {
      const m = p.match(/^\/api\/captures\/([^/]+)\/android$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        const session = loadCaptureSession(decodeURIComponent(m[1]));
        const updated = await captureAndroidScreen(session, { deviceId: body.deviceId, deepLink: body.deepLink, title: body.title });
        sendJson(res, 200, { count: updated.raw.length, raw: updated.raw });
        return;
      }
    }

    // =========================================================
    // Studio Mockup tab -- Templates / Editor / Devices /
    // Panoramic / Preview / Settings / Export
    // =========================================================

    if (method === "GET" && p === "/api/mockups") {
      sendJson(res, 200, { projects: listMockupProjects() });
      return;
    }
    if (method === "POST" && p === "/api/mockups") {
      const body = await readJsonBody(req);
      if (!body.name) return sendError(res, 400, "name is required");
      sendJson(res, 200, createMockupProject({ name: body.name, appCategory: body.appCategory }));
      return;
    }
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)$/);
      if (m && method === "GET") return sendJson(res, 200, loadMockupProject(decodeURIComponent(m[1])));
    }
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/file$/);
      if (m && method === "GET") {
        const rel = url.searchParams.get("p");
        if (!rel) return sendError(res, 400, "query param 'p' is required");
        const abs = mockupFile(decodeURIComponent(m[1]), rel);
        const ext = path.extname(abs).toLowerCase();
        sendFile(res, abs, ext === ".zip" ? "application/zip" : "image/png");
        return;
      }
    }

    // Templates section
    if (method === "GET" && p === "/api/mockups/templates") {
      sendJson(res, 200, { templates: MOCKUP_TEMPLATES.map((t) => ({ id: t.id, name: t.name, category: t.category })) });
      return;
    }
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/apply-template$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        const project = loadMockupProject(decodeURIComponent(m[1]));
        applyMockupTemplate(project, body.templateId);
        saveMockupProject(project);
        sendJson(res, 200, project);
        return;
      }
    }

    // Source images (uploads)
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/sources$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const project = loadMockupProject(id);
        const name = url.searchParams.get("name") ?? `image_${project.sources.length + 1}`;
        const ext = imageExtFromContentType(req.headers["content-type"]);
        const relPath = `sources/img_${Date.now()}.${ext}`;
        const abs = mockupFile(id, relPath);
        fs.writeFileSync(abs, await readRawBody(req));
        const { width, height } = pngSize(abs);
        const source = { id: `src_${Date.now()}`, name, file: relPath, width, height };
        project.sources.push(source);
        saveMockupProject(project);
        sendJson(res, 200, source);
        return;
      }
    }

    // Devices section (rows)
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/devices$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const body = await readJsonBody(req);
        const project = loadMockupProject(id);
        const row = addDeviceRow(project, {
          deviceId: body.deviceId,
          variant: body.variant,
          label: body.label ?? body.deviceId,
          previewsVisible: true,
          isBase: project.devices.length === 0,
        } as Omit<MockupDeviceRow, "id">);
        saveMockupProject(project);
        sendJson(res, 200, { row, project });
        return;
      }
    }
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/devices\/([^/]+)$/);
      if (m && method === "DELETE") {
        const project = loadMockupProject(decodeURIComponent(m[1]));
        project.devices = project.devices.filter((d) => d.id !== decodeURIComponent(m[2]));
        saveMockupProject(project);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (m && method === "PATCH") {
        const body = await readJsonBody(req);
        const project = loadMockupProject(decodeURIComponent(m[1]));
        const idx = project.devices.findIndex((d) => d.id === decodeURIComponent(m[2]));
        if (idx === -1) return sendError(res, 404, "Device row not found");
        project.devices[idx] = { ...project.devices[idx], ...body };
        saveMockupProject(project);
        sendJson(res, 200, project.devices[idx]);
        return;
      }
    }

    // Editor section (columns + cell overrides)
    if (method === "GET" && p === "/api/mockups/layouts") {
      sendJson(res, 200, { presets: listLayoutPresets(), grouped: groupedLayoutPresets() });
      return;
    }
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/columns$/);
      if (m && method === "POST") {
        const project = loadMockupProject(decodeURIComponent(m[1]));
        const column = addColumn(project, defaultColumnStyle(`Feature ${project.columns.length + 1}`));
        saveMockupProject(project);
        sendJson(res, 200, { column, project });
        return;
      }
    }
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/columns\/([^/]+)$/);
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        const project = loadMockupProject(decodeURIComponent(m[1]));
        updateColumnStyle(project, decodeURIComponent(m[2]), body.style as ColumnStyle);
        saveMockupProject(project);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (m && method === "DELETE") {
        const project = loadMockupProject(decodeURIComponent(m[1]));
        project.columns = project.columns.filter((c) => c.id !== decodeURIComponent(m[2]));
        saveMockupProject(project);
        sendJson(res, 200, { ok: true });
        return;
      }
    }
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/cells\/([^/]+)\/([^/]+)$/);
      if (m && method === "PUT") {
        const body = await readJsonBody(req);
        const project = loadMockupProject(decodeURIComponent(m[1]));
        setCellOverride(project, decodeURIComponent(m[2]), decodeURIComponent(m[3]), body.override ?? null);
        saveMockupProject(project);
        sendJson(res, 200, { ok: true });
        return;
      }
    }
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/cell-preview\/([^/]+)\/([^/]+)$/);
      if (m && method === "GET") {
        const project = loadMockupProject(decodeURIComponent(m[1]));
        const width = Number(url.searchParams.get("width")) || 300;
        const height = Number(url.searchParams.get("height")) || 640;
        const html = cellPreviewHtml(project, decodeURIComponent(m[2]), decodeURIComponent(m[3]), { width, height });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
    }

    // AI assist -- text fields only
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/ai-text$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        const prompt =
          `Write a short app-store screenshot title (max 6 words) and an optional one-line subtitle ` +
          `(max 10 words) for a screen described as: "${body.hint ?? ""}". Never invent features not implied by the hint. ` +
          `Reply with ONLY JSON: {"title":"...","subtitle":"..."}`;
        const reply = await chat(prompt);
        const match = reply.match(/\{[\s\S]*\}/);
        sendJson(res, 200, match ? JSON.parse(match[0]) : { title: "", subtitle: "" });
        return;
      }
    }

    // Panoramic section
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/panoramic$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const project = loadMockupProject(id);
        const ext = imageExtFromContentType(req.headers["content-type"]);
        const relPath = `sources/panorama.${ext}`;
        fs.writeFileSync(mockupFile(id, relPath), await readRawBody(req));
        project.globalPanoramic = { file: relPath, flip: project.globalPanoramic.flip };
        saveMockupProject(project);
        sendJson(res, 200, project.globalPanoramic);
        return;
      }
      if (m && method === "PATCH") {
        const body = await readJsonBody(req);
        const project = loadMockupProject(decodeURIComponent(m[1]));
        project.globalPanoramic.flip = Boolean(body.flip);
        saveMockupProject(project);
        sendJson(res, 200, project.globalPanoramic);
        return;
      }
    }

    // Settings section
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/settings$/);
      if (m && method === "PATCH") {
        const body = await readJsonBody(req);
        const project = loadMockupProject(decodeURIComponent(m[1]));
        project.settings = { ...project.settings, ...body };
        if (body.name) project.name = body.name;
        if (body.appCategory) project.appCategory = body.appCategory;
        saveMockupProject(project);
        sendJson(res, 200, project);
        return;
      }
    }

    // Export section
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/export$/);
      if (m && method === "POST") {
        const project = loadMockupProject(decodeURIComponent(m[1]));
        const result = await exportMockupProject(project);
        sendJson(res, 200, { bytes: result.bytes, entries: result.entries });
        return;
      }
    }
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/download\/zip$/);
      if (m && method === "GET") {
        sendFile(res, path.join(mockupDir(decodeURIComponent(m[1])), "exports", "mockup-export.zip"), "application/zip");
        return;
      }
    }

    // =========================================================
    // Video tab -- Templates / Scenes
    // =========================================================

    if (method === "GET" && p === "/api/videos") {
      sendJson(res, 200, { projects: listVideoProjects() });
      return;
    }
    if (method === "POST" && p === "/api/videos") {
      const body = await readJsonBody(req);
      if (!body.name) return sendError(res, 400, "name is required");
      sendJson(res, 200, createVideoProject(body.name));
      return;
    }
    {
      const m = p.match(/^\/api\/videos\/([^/]+)$/);
      if (m && method === "GET") return sendJson(res, 200, loadVideoProject(decodeURIComponent(m[1])));
    }
    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/file$/);
      if (m && method === "GET") {
        const rel = url.searchParams.get("p");
        if (!rel) return sendError(res, 400, "query param 'p' is required");
        const abs = videoFile(decodeURIComponent(m[1]), rel);
        const ext = path.extname(abs).toLowerCase();
        sendFile(res, abs, ext === ".mp4" ? "video/mp4" : "image/png");
        return;
      }
    }

    if (method === "GET" && p === "/api/videos/templates") {
      sendJson(res, 200, { templates: VIDEO_TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, sceneCount: t.scenes.length })) });
      return;
    }
    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/apply-template$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        const project = loadVideoProject(decodeURIComponent(m[1]));
        applyVideoTemplate(project, body.templateId, body.device ?? "phone");
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
      sendJson(res, 200, { animations: listSceneAnimations(), backgrounds: listVideoBackgrounds() });
      return;
    }
    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/sources$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const project = loadVideoProject(id);
        const name = url.searchParams.get("name") ?? `image_${project.sources.length + 1}`;
        const ext = imageExtFromContentType(req.headers["content-type"]);
        const relPath = `sources/img_${Date.now()}.${ext}`;
        const abs = videoFile(id, relPath);
        fs.writeFileSync(abs, await readRawBody(req));
        const { width, height } = pngSize(abs);
        const source = { id: `src_${Date.now()}`, name, file: relPath, width, height };
        project.sources.push(source);
        saveVideoProject(project);
        sendJson(res, 200, source);
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
        project.scenes[idx] = { ...project.scenes[idx], ...body };
        saveVideoProject(project);
        sendJson(res, 200, project.scenes[idx]);
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
        sendFile(res, path.join(videoDir(decodeURIComponent(m[1])), "video", "promo.mp4"), "video/mp4");
        return;
      }
    }

    sendError(res, 404, `No route for ${method} ${p}`);
  } catch (err) {
    // Every failure surfaces as a real, readable message -- never a silent
    // 500 or a hung request. This is the same "fail loud" discipline as
    // the capture/auth layers.
    sendError(res, 500, (err as Error).message || String(err));
  }
}

export interface UiServerOptions {
  port?: number;
  host?: string;
  openBrowser?: boolean;
}

export async function startUiServer(options: UiServerOptions = {}): Promise<http.Server> {
  const port = options.port ?? 8787;
  const host = options.host ?? "127.0.0.1";

  if (!fs.existsSync(INDEX_HTML_PATH)) {
    throw new Error(
      `Cannot start the web interface: missing UI asset at ${INDEX_HTML_PATH}. ` +
        `Run "npm run build" (it copies web/index.html into dist/web/) and try again.`,
    );
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => sendError(res, 500, (err as Error).message));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use. Set SAG_UI_PORT to a different port and try again.`));
      } else {
        reject(err);
      }
    });
    server.listen(port, host, () => resolve());
  });

  const address = `http://${host}:${port}`;
  console.log(`Store Assets Generator web interface running at ${address}`);

  if (options.openBrowser !== false) {
    openInBrowser(address);
  }

  return server;
}

function openInBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "win32") exec(`start "" "${url}"`);
    else if (platform === "darwin") exec(`open "${url}"`);
    else exec(`xdg-open "${url}"`);
  } catch {
    // Non-fatal -- the URL is already printed to the console above.
  }
}
