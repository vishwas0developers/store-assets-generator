import http from "http";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { setCredentials, getCredentialStatus, clearCredentials } from "../src/auth/credentials.js";
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
  createSession,
  listSessions,
  loadSession,
  saveSession,
  sessionDir,
  sessionFile,
  type MockupConfig,
  type SceneConfig,
} from "../src/session/store.js";
import { captureRawScreens } from "../src/capture/step1.js";
import { defaultMockupConfig, listMockupOptions, mockupHtmlForScreen } from "../src/render/mockup.js";
import { buildStorePackage } from "../src/package/store.js";
import { defaultSceneConfig, listSceneOptions, renderVideo, scenePreviewHtml } from "../src/render/scene.js";

/**
 * Local-only manual workflow surface — a thin HTTP adapter over the same
 * core (session model, capture/render/package modules, credential store)
 * that the CLI and MCP server use. No separate implementation: whatever
 * this UI can do, the CLI/MCP can do, and vice versa (see ARCHITECTURE.md
 * "One Core, Three Surfaces").
 *
 * Binds to 127.0.0.1 only — never exposed to the network, per
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
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
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

const MOCKUP_PREVIEW_CANVAS = { width: 540, height: 960 };

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
      const html = fs.readFileSync(INDEX_HTML_PATH, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (method === "GET" && p === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    // --- Demo access credentials ---

    if (method === "GET" && p === "/api/auth/status") {
      sendJson(res, 200, getCredentialStatus());
      return;
    }

    if (method === "POST" && p === "/api/auth/credentials") {
      const body = await readJsonBody(req);
      if (!body.email) {
        sendError(res, 400, "email is required");
        return;
      }
      setCredentials(body.email, body.password);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "DELETE" && p === "/api/auth/credentials") {
      clearCredentials();
      sendJson(res, 200, { ok: true });
      return;
    }

    // --- AI provider / model management (mirrors CLI/MCP core — no
    // separate logic; the settings UI is just an HTTP client of registry.ts
    // and adapters.ts, exactly like the CLI would be if it exposed these) ---

    if (method === "GET" && p === "/api/ai/providers") {
      sendJson(res, 200, { providers: listProviders() });
      return;
    }

    if (method === "POST" && p === "/api/ai/providers") {
      const body = await readJsonBody(req);
      if (!body.id) {
        sendError(res, 400, "id is required");
        return;
      }
      upsertProvider(body.id, {
        adapter: body.adapter,
        baseUrl: body.baseUrl,
        enabled: body.enabled,
        requiresKey: body.requiresKey,
      });
      if (body.apiKey) setProviderKey(body.id, body.apiKey);
      sendJson(res, 200, { ok: true });
      return;
    }

    {
      const providerMatch = p.match(/^\/api\/ai\/providers\/([^/]+)$/);
      if (providerMatch && method === "DELETE") {
        deleteProvider(decodeURIComponent(providerMatch[1]));
        clearProviderKey(decodeURIComponent(providerMatch[1]));
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const testMatch = p.match(/^\/api\/ai\/providers\/([^/]+)\/test$/);
      if (testMatch && method === "POST") {
        const provider = getProvider(decodeURIComponent(testMatch[1]));
        if (!provider) {
          sendError(res, 404, `Unknown provider '${testMatch[1]}'`);
          return;
        }
        sendJson(res, 200, await testProvider(provider));
        return;
      }
    }

    {
      const fetchMatch = p.match(/^\/api\/ai\/providers\/([^/]+)\/fetch-models$/);
      if (fetchMatch && method === "GET") {
        const provider = getProvider(decodeURIComponent(fetchMatch[1]));
        if (!provider) {
          sendError(res, 404, `Unknown provider '${fetchMatch[1]}'`);
          return;
        }
        const result = await fetchModelsForProvider(provider);
        if (isDiscoveryError(result)) {
          sendJson(res, 200, { models: [], ...result });
        } else {
          sendJson(res, 200, { models: result });
        }
        return;
      }
    }

    if (method === "GET" && p === "/api/ai/models") {
      sendJson(res, 200, { models: listModels(), defaultModel: getDefaultModel() });
      return;
    }

    if (method === "POST" && p === "/api/ai/models") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.models)) {
        sendError(res, 400, "models array is required");
        return;
      }
      saveModels(body.models);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && p === "/api/ai/models/default") {
      const body = await readJsonBody(req);
      if (!body.provider || !body.modelId) {
        sendError(res, 400, "provider and modelId are required");
        return;
      }
      setDefaultModel(body.provider, body.modelId);
      sendJson(res, 200, { ok: true });
      return;
    }

    {
      const deleteModelMatch = p.match(/^\/api\/ai\/models\/([^/]+)\/([^/]+)$/);
      if (deleteModelMatch && method === "DELETE") {
        deleteModel(decodeURIComponent(deleteModelMatch[1]), decodeURIComponent(deleteModelMatch[2]));
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    // --- Devices & platform specs (Step 2/3/4 pickers) ---

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

    // --- Sessions (four-step workflow) ---

    if (method === "GET" && p === "/api/sessions") {
      sendJson(res, 200, { sessions: listSessions() });
      return;
    }

    if (method === "POST" && p === "/api/sessions") {
      const body = await readJsonBody(req);
      if (!body.url) {
        sendError(res, 400, "url is required");
        return;
      }
      const platforms: string[] = Array.isArray(body.platforms) && body.platforms.length > 0 ? body.platforms : ["google-play"];
      const session = createSession({ url: body.url, slug: body.slug, platforms });
      sendJson(res, 200, session);
      return;
    }

    {
      const sessionMatch = p.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionMatch && method === "GET") {
        sendJson(res, 200, loadSession(decodeURIComponent(sessionMatch[1])));
        return;
      }
    }

    {
      const captureMatch = p.match(/^\/api\/sessions\/([^/]+)\/capture$/);
      if (captureMatch && method === "POST") {
        const id = decodeURIComponent(captureMatch[1]);
        const body = await readJsonBody(req);
        const session = loadSession(id);
        const updated = await captureRawScreens(session, {
          maxPages: body.maxPages,
          email: body.email,
          password: body.password,
        });
        sendJson(res, 200, { count: updated.raw.length, raw: updated.raw });
        return;
      }
    }

    {
      const fileMatch = p.match(/^\/api\/sessions\/([^/]+)\/file$/);
      if (fileMatch && method === "GET") {
        const id = decodeURIComponent(fileMatch[1]);
        const rel = url.searchParams.get("p");
        if (!rel) {
          sendError(res, 400, "query param 'p' is required");
          return;
        }
        const abs = sessionFile(id, rel);
        const ext = path.extname(abs).toLowerCase();
        const type = ext === ".png" ? "image/png" : ext === ".mp4" ? "video/mp4" : ext === ".zip" ? "application/zip" : "application/octet-stream";
        sendFile(res, abs, type);
        return;
      }
    }

    // --- Step 2: Studio Mockups ---

    {
      const mockupsMatch = p.match(/^\/api\/sessions\/([^/]+)\/mockups$/);
      if (mockupsMatch && method === "GET") {
        const id = decodeURIComponent(mockupsMatch[1]);
        const session = loadSession(id);
        sendJson(res, 200, { mockups: session.mockups, options: listMockupOptions() });
        return;
      }
      if (mockupsMatch && method === "POST") {
        const id = decodeURIComponent(mockupsMatch[1]);
        const body = await readJsonBody(req);
        if (!body.screenId || !body.config) {
          sendError(res, 400, "screenId and config are required");
          return;
        }
        const session = loadSession(id);
        session.mockups[body.screenId] = body.config as MockupConfig;
        saveSession(session);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const mockupAiMatch = p.match(/^\/api\/sessions\/([^/]+)\/mockups\/ai$/);
      if (mockupAiMatch && method === "POST") {
        const id = decodeURIComponent(mockupAiMatch[1]);
        const session = loadSession(id);
        const prompt =
          `You are writing short app-store screenshot labels. For each screen below, ` +
          `write a punchy label (max 6 words) and an optional one-line subtext (max 10 words), ` +
          `grounded only in the given title/URL — never invent features. ` +
          `Reply with ONLY a JSON array of {"screenId","label","subtext"} objects, one per screen.\n\n` +
          session.raw.map((r) => `- screenId: ${r.id}, title: "${r.title}", url: ${r.url}`).join("\n");
        const reply = await chat(prompt);
        const items = extractJsonArray(reply);
        for (const item of items) {
          const existing = session.mockups[item.screenId] ?? defaultMockupConfig(
            session.raw.find((r) => r.id === item.screenId)!,
            session.platforms[0],
          );
          session.mockups[item.screenId] = { ...existing, label: item.label ?? existing.label, subtext: item.subtext ?? existing.subtext };
        }
        saveSession(session);
        sendJson(res, 200, { mockups: session.mockups });
        return;
      }
    }

    {
      const previewMatch = p.match(/^\/api\/sessions\/([^/]+)\/mockup-preview\/([^/]+)$/);
      if (previewMatch && method === "GET") {
        const id = decodeURIComponent(previewMatch[1]);
        const screenId = decodeURIComponent(previewMatch[2]);
        const session = loadSession(id);
        const html = mockupHtmlForScreen(session, screenId, MOCKUP_PREVIEW_CANVAS);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
    }

    // --- Step 3: Store Asset Package ---

    {
      const packageMatch = p.match(/^\/api\/sessions\/([^/]+)\/package$/);
      if (packageMatch && method === "POST") {
        const id = decodeURIComponent(packageMatch[1]);
        const body = await readJsonBody(req);
        const session = loadSession(id);
        const result = await buildStorePackage(session, { targets: body.targets ?? {} });
        sendJson(res, 200, result);
        return;
      }
    }

    {
      const zipMatch = p.match(/^\/api\/sessions\/([^/]+)\/download\/zip$/);
      if (zipMatch && method === "GET") {
        const id = decodeURIComponent(zipMatch[1]);
        sendFile(res, path.join(sessionDir(id), "store-assets.zip"), "application/zip");
        return;
      }
    }

    // --- Step 4: Animation Video ---

    {
      const scenesMatch = p.match(/^\/api\/sessions\/([^/]+)\/scenes$/);
      if (scenesMatch && method === "GET") {
        const id = decodeURIComponent(scenesMatch[1]);
        const session = loadSession(id);
        if (session.scenes.length === 0 && session.raw.length > 0) {
          session.scenes = session.raw.map((r, i) => defaultSceneConfig(r.id, session.platforms[0], i));
          saveSession(session);
        }
        sendJson(res, 200, { scenes: session.scenes, options: listSceneOptions() });
        return;
      }
      if (scenesMatch && method === "POST") {
        const id = decodeURIComponent(scenesMatch[1]);
        const body = await readJsonBody(req);
        if (!body.sceneId || !body.config) {
          sendError(res, 400, "sceneId and config are required");
          return;
        }
        const session = loadSession(id);
        const idx = session.scenes.findIndex((s) => s.id === body.sceneId);
        if (idx === -1) {
          sendError(res, 404, `Scene '${body.sceneId}' not found`);
          return;
        }
        session.scenes[idx] = { ...session.scenes[idx], ...(body.config as Partial<SceneConfig>) };
        saveSession(session);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const sceneAiMatch = p.match(/^\/api\/sessions\/([^/]+)\/scenes\/ai$/);
      if (sceneAiMatch && method === "POST") {
        const id = decodeURIComponent(sceneAiMatch[1]);
        const session = loadSession(id);
        const prompt =
          `You are writing short promo-video scene captions. For each scene below, ` +
          `write a punchy on-screen line (max 6 words) and an optional subtext (max 10 words), ` +
          `grounded only in the given screen title/URL — never invent features. ` +
          `Reply with ONLY a JSON array of {"sceneId","text","subtext"} objects, one per scene.\n\n` +
          session.scenes
            .map((s) => {
              const screen = session.raw.find((r) => r.id === s.screenId);
              return `- sceneId: ${s.id}, title: "${screen?.title ?? ""}", url: ${screen?.url ?? ""}`;
            })
            .join("\n");
        const reply = await chat(prompt);
        const items = extractJsonArray(reply);
        for (const item of items) {
          const idx = session.scenes.findIndex((s) => s.id === item.sceneId);
          if (idx !== -1) {
            session.scenes[idx] = { ...session.scenes[idx], text: item.text ?? session.scenes[idx].text, subtext: item.subtext ?? session.scenes[idx].subtext };
          }
        }
        saveSession(session);
        sendJson(res, 200, { scenes: session.scenes });
        return;
      }
    }

    {
      const scenePreviewMatch = p.match(/^\/api\/sessions\/([^/]+)\/scene-preview\/([^/]+)$/);
      if (scenePreviewMatch && method === "GET") {
        const id = decodeURIComponent(scenePreviewMatch[1]);
        const sceneId = decodeURIComponent(scenePreviewMatch[2]);
        const session = loadSession(id);
        const html = scenePreviewHtml(session, sceneId);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
    }

    {
      const bgmMatch = p.match(/^\/api\/sessions\/([^/]+)\/bgm$/);
      if (bgmMatch && method === "POST") {
        const id = decodeURIComponent(bgmMatch[1]);
        const session = loadSession(id);
        const contentType = req.headers["content-type"] ?? "audio/mpeg";
        const ext = contentType.includes("wav") ? "wav" : contentType.includes("ogg") ? "ogg" : "mp3";
        const relPath = `bgm.${ext}`;
        const abs = sessionFile(id, relPath);
        const body = await readRawBody(req);
        fs.writeFileSync(abs, body);
        session.bgm = relPath;
        saveSession(session);
        sendJson(res, 200, { ok: true, bgm: relPath });
        return;
      }
    }

    {
      const videoMatch = p.match(/^\/api\/sessions\/([^/]+)\/video$/);
      if (videoMatch && method === "POST") {
        const id = decodeURIComponent(videoMatch[1]);
        const session = loadSession(id);
        const videoPath = await renderVideo(session);
        session.outputs.video = path.relative(sessionDir(id), videoPath).split(path.sep).join("/");
        saveSession(session);
        sendJson(res, 200, { videoPath: session.outputs.video });
        return;
      }
    }

    {
      const videoDownloadMatch = p.match(/^\/api\/sessions\/([^/]+)\/download\/video$/);
      if (videoDownloadMatch && method === "GET") {
        const id = decodeURIComponent(videoDownloadMatch[1]);
        sendFile(res, path.join(sessionDir(id), "video", "promo.mp4"), "video/mp4");
        return;
      }
    }

    sendError(res, 404, `No route for ${method} ${p}`);
  } catch (err) {
    // Every failure surfaces as a real, readable message — never a silent
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
    if (platform === "win32") {
      exec(`start "" "${url}"`);
    } else if (platform === "darwin") {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
  } catch {
    // Non-fatal — the URL is already printed to the console above.
  }
}
