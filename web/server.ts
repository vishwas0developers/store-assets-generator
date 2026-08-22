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
  createProject,
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  projectDir,
  projectFile,
} from "../src/project/projectStore.js";
import {
  startBrowserSession,
  stopBrowserSession,
  executeBrowserAction,
  getBrowserFrame,
  captureBrowserScreen,
} from "../src/capture/liveBrowser.js";
import archiver from "archiver";

import { captureWebsiteScreens } from "../src/capture/websiteCapture.js";
import { captureAndroidScreen, listAndroidDevices } from "../src/capture/androidCapture.js";

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
  updateColumnStyle,
  type ColumnStyle,
  type MockupDeviceRow,
} from "../src/mockup/project.js";
import { groupedLayoutPresets, listLayoutPresets } from "../src/mockup/layouts.js";
import { cellPreviewHtml, renderTemplateDetailThumbs, renderTemplateThumbs } from "../src/mockup/render.js";
import { exportMockupProject } from "../src/mockup/export.js";
import { MOCKUP_TEMPLATES, applyMockupTemplate } from "../src/mockup/templates.js";

import {
  listVideoProjects,
  loadVideoProject,
  saveVideoProject,
  videoDir,
  videoFile,
} from "../src/video/project.js";
import { listSceneAnimations, listSceneLayouts, listVideoBackgrounds, renderVideo, renderVideoTemplateThumbs, sceneHtml, scenePreviewHtml, sourceKindsFor, sourceUrisFor, templatePreviewHtml } from "../src/video/render.js";
import { VIDEO_TEMPLATES, applyVideoTemplate, resolveTemplateId, scratchVideoProject } from "../src/video/templates.js";
import { BGM_PRESETS, renderBgmWav } from "../src/video/bgm.js";

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

  console.log(`[SAG-SERVER] [${new Date().toLocaleTimeString()}] ${method} ${p}${url.search}`);

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

    if (method === "GET" && p === "/favicon.ico") {
      res.writeHead(204);
      res.end();
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
    // Unified Projects List & File Manager
    // =========================================================

    if (method === "GET" && p === "/api/projects") {
      sendJson(res, 200, { projects: listProjects() });
      return;
    }

    if (method === "POST" && p === "/api/projects") {
      const body = await readJsonBody(req);
      if (!body.name) return sendError(res, 400, "name is required");
      const project = createProject(body.name, body.appCategory, body.targetUrl);
      sendJson(res, 200, project);
      return;
    }

    {
      const m = p.match(/^\/api\/projects\/([^/]+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (method === "GET") {
          sendJson(res, 200, loadProject(id));
          return;
        }
        if (method === "PATCH") {
          const body = await readJsonBody(req);
          const project = loadProject(id);
          if (body.name) project.name = body.name;
          if (body.appCategory) project.appCategory = body.appCategory;
          if (body.targetUrl !== undefined) project.targetUrl = body.targetUrl;
          saveProject(project);
          sendJson(res, 200, project);
          return;
        }
        if (method === "DELETE") {
          deleteProject(id);
          sendJson(res, 200, { ok: true });
          return;
        }
      }
    }

    {
      const m = p.match(/^\/api\/projects\/([^/]+)\/files$/);
      if (m && method === "GET") {
        const id = decodeURIComponent(m[1]);
        const dir = projectDir(id);
        
        // Scan directory recursively
        const getFiles = (currentDir: string): any[] => {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          let files: any[] = [];
          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
              files = files.concat(getFiles(fullPath));
            } else {
              const rel = path.relative(dir, fullPath).split(path.sep).join("/");
              const stat = fs.statSync(fullPath);
              files.push({
                path: rel,
                name: entry.name,
                size: stat.size,
                mtime: stat.mtime.toISOString(),
              });
            }
          }
          return files;
        };

        sendJson(res, 200, { files: getFiles(dir) });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/projects\/([^/]+)\/file$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const rel = url.searchParams.get("p");
        if (!rel) return sendError(res, 400, "query param 'p' is required");
        const abs = projectFile(id, rel);

        if (method === "GET") {
          const ext = path.extname(abs).toLowerCase();
          const mime = ext === ".mp4" ? "video/mp4" : ext === ".zip" ? "application/zip" : "image/png";
          sendFile(res, abs, mime);
          return;
        }
        if (method === "DELETE") {
          if (fs.existsSync(abs)) {
            try { fs.unlinkSync(abs); } catch (e) {}
          }
          const normRel = rel.replace(/\\/g, "/");
          // If it was a capture screenshot or media file, clean up project.json arrays
          const project = loadProject(id);
          project.captures = (project.captures || []).filter((c: any) => (c.file || "").replace(/\\/g, "/") !== normRel);
          if (project.mockup && project.mockup.sources) {
            project.mockup.sources = project.mockup.sources.filter((s: any) => (s.file || "").replace(/\\/g, "/") !== normRel);
          }
          if (project.video && project.video.sources) {
            project.video.sources = project.video.sources.filter((s: any) => (s.file || "").replace(/\\/g, "/") !== normRel);
          }
          saveProject(project);

          sendJson(res, 200, { ok: true });
          return;
        }
      }
    }

    {
      const m = p.match(/^\/api\/projects\/([^/]+)\/captures\/(\d+)$/);
      if (m && method === "DELETE") {
        const id = decodeURIComponent(m[1]);
        const captureId = Number(m[2]);
        const project = loadProject(id);
        const capture = (project.captures || []).find((c: any) => c.id === captureId);
        if (capture) {
          const abs = projectFile(id, capture.file);
          if (fs.existsSync(abs)) {
            try { fs.unlinkSync(abs); } catch (e) {}
          }
          const normRel = capture.file.replace(/\\/g, "/");
          project.captures = (project.captures || []).filter((c: any) => c.id !== captureId);
          if (project.mockup && project.mockup.sources) {
            project.mockup.sources = project.mockup.sources.filter((s: any) => (s.file || "").replace(/\\/g, "/") !== normRel);
          }
          if (project.video && project.video.sources) {
            project.video.sources = project.video.sources.filter((s: any) => (s.file || "").replace(/\\/g, "/") !== normRel);
          }
          saveProject(project);
        }
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const m = p.match(/^\/api\/projects\/([^/]+)\/upload$/);
      if (m && method === "POST") {
        const id = decodeURIComponent(m[1]);
        const project = loadProject(id);
        const name = url.searchParams.get("name") ?? `upload_${Date.now()}`;
        const ext = imageExtFromContentType(req.headers["content-type"]);
        const relPath = `uploads/img_${Date.now()}.${ext}`;
        const abs = projectFile(id, relPath);
        
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, await readRawBody(req));
        
        const { width, height } = pngSize(abs);
        const sourceId = `src_${Date.now()}`;
        const source = { id: sourceId, name, file: relPath, width, height };
        
        // Add to both mockup and video sources
        project.mockup.sources.push(source);
        project.video.sources.push(source);
        saveProject(project);
        
        sendJson(res, 200, source);
        return;
      }
    }

    {
      const m = p.match(/^\/api\/projects\/([^/]+)\/download-zip$/);
      if (m && method === "GET") {
        const id = decodeURIComponent(m[1]);
        const dir = projectDir(id);
        const zipFile = path.join(dir, "exports", `${id}-export.zip`);
        
        fs.mkdirSync(path.dirname(zipFile), { recursive: true });
        
        const output = fs.createWriteStream(zipFile);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", () => {
          sendFile(res, zipFile, "application/zip");
        });

        archive.on("error", (err) => {
          sendError(res, 500, err.message);
        });

        archive.pipe(output);
        // Exclude the generated zip itself if it is stored in the project directory
        archive.glob("**/*", {
          cwd: dir,
          ignore: ["exports/*-export.zip", "project.json"],
        });
        archive.finalize();
        return;
      }
    }

    // =========================================================
    // Live Browser Engine Routes
    // =========================================================

    if (method === "POST" && p === "/api/browser/start") {
      const body = await readJsonBody(req);
      if (!body.projectId || !body.url) {
        return sendError(res, 400, "projectId and url are required");
      }
      const resolution = body.resolution ?? (body.width && body.height ? `${body.width}x${body.height}` : "1290x2796");
      try {
        const result = await startBrowserSession(body.projectId, body.url, resolution);
        sendJson(res, 200, { ok: true, ...result });
      } catch (err: any) {
        let msg = err.message || "Failed to start browser session";
        msg = msg.replace(/Call log:[\s\S]*/, "").replace(/\[2m|\[22m/g, "").trim();
        sendError(res, 500, msg);
      }
      return;
    }

    if (method === "POST" && p === "/api/browser/action") {
      const body = await readJsonBody(req);
      await executeBrowserAction(body);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && p === "/api/browser/frame") {
      const frameBuffer = await getBrowserFrame();
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(frameBuffer);
      return;
    }

    if (method === "POST" && p === "/api/browser/capture") {
      const body = await readJsonBody(req);
      if (!body.projectId) {
        return sendError(res, 400, "projectId is required");
      }
      const capture = await captureBrowserScreen(body.projectId);
      sendJson(res, 200, capture);
      return;
    }

    if (method === "POST" && p === "/api/browser/stop") {
      await stopBrowserSession();
      sendJson(res, 200, { ok: true });
      return;
    }

    // =========================================================
    // Screen Capture tab -- Fallback legacy routes (redirecting to projects)
    // =========================================================

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
            id: `screen_${c.id}`,
            url: c.url,
            title: `Screen ${c.id}`,
            file: c.file,
            width: c.width,
            height: c.height,
            source: "website",
          })),
        });
        return;
      }
    }

    // =========================================================
    // Studio Mockup tab -- Fallback legacy /api/mockups redirect
    // =========================================================

    if (method === "GET" && p === "/api/mockups") {
      sendJson(res, 200, { projects: listMockupProjects() });
      return;
    }
    if (method === "POST" && p === "/api/mockups") {
      const body = await readJsonBody(req);
      if (!body.name) return sendError(res, 400, "name is required");
      const project = createProject(body.name, body.appCategory);
      sendJson(res, 200, project.mockup);
      return;
    }
    {
      const m = p.match(/^\/api\/mockups\/(?!templates$|layouts$)([^/]+)$/);
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
      sendJson(res, 200, {
        templates: MOCKUP_TEMPLATES.map((t) => ({
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
      const m = p.match(/^\/api\/mockups\/template-thumb\/([^/]+)\.png$/);
      if (m && method === "GET") {
        const slug = decodeURIComponent(m[1]);
        const template = MOCKUP_TEMPLATES.find((t) => t.id === slug);
        if (!template) return sendError(res, 404, `Unknown template '${slug}'.`);
        const outDir = path.join(process.cwd(), "output", ".template-thumbs");
        const thumbPath = path.join(outDir, `${slug}.png`);
        if (!fs.existsSync(thumbPath)) await renderTemplateThumbs(outDir, MOCKUP_TEMPLATES);
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
        const outDir = path.join(process.cwd(), "output", ".template-thumbs");
        const thumbPath = path.join(outDir, `${slug}-detail.png`);
        if (!fs.existsSync(thumbPath)) await renderTemplateDetailThumbs(outDir, MOCKUP_TEMPLATES);
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
        fs.createReadStream(thumbPath).pipe(res);
        return;
      }
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
    {
      const m = p.match(/^\/api\/mockups\/([^/]+)\/import-template$/);
      if (m && method === "POST") {
        const body = await readJsonBody(req);
        const project = loadMockupProject(decodeURIComponent(m[1]));
        if (body.devices) project.devices = body.devices;
        if (body.columns) project.columns = body.columns;
        if (body.cells) project.cells = body.cells;
        if (body.globalPanoramic) project.globalPanoramic = body.globalPanoramic;
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
      const project = createProject(body.name);
      sendJson(res, 200, project.video);
      return;
    }
    {
      const m = p.match(/^\/api\/videos\/(?!templates$|scene-options$)([^/]+)$/);
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
        if (!fs.existsSync(thumbPath)) await renderVideoTemplateThumbs(outDir, VIDEO_TEMPLATES);
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
      sendJson(res, 200, { animations: listSceneAnimations(), backgrounds: listVideoBackgrounds(), layouts: { "9:16": listSceneLayouts("9:16"), "16:9": listSceneLayouts("16:9") } });
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
        const ext = imageExtFromContentType(req.headers["content-type"]);
        const relPath = `sources/img_${Date.now()}.${ext}`;
        const abs = videoFile(id, relPath);
        fs.writeFileSync(abs, await readRawBody(req));
        const { width, height } = pngSize(abs);
        const source = { id: `src_${Date.now()}`, name, file: relPath, width, height, kind: "image" as const };
        project.sources.push(source);
        saveVideoProject(project);
        sendJson(res, 200, source);
        return;
      }
    }
    {
      const m = p.match(/^\/api\/videos\/([^/]+)\/scenes$/);
      if (m && method === "POST") {
        const project = loadVideoProject(decodeURIComponent(m[1]));
        if (project.scenes.length === 0) return sendError(res, 400, "Apply a template before adding scenes.");
        if (project.scenes.length >= 10) return sendError(res, 400, "10 scenes is the app-store maximum for this project.");
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
        sendFile(res, path.join(videoDir(decodeURIComponent(m[1])), "promo.mp4"), "video/mp4");
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
