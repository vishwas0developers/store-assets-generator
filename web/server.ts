import http from "http";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { AssetPipeline } from "../src/orchestrator.js";
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

/**
 * Local-only manual workflow surface — a thin HTTP adapter over the same
 * core (AssetPipeline, credential store) that the CLI and MCP server call.
 * No separate implementation: whatever this UI can do, the CLI/MCP can do,
 * and vice versa (see ARCHITECTURE.md "One Core, Three Surfaces").
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

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";

  try {
    if (method === "GET" && url.pathname === "/") {
      if (!fs.existsSync(INDEX_HTML_PATH)) {
        sendError(res, 500, `Web UI asset missing: ${INDEX_HTML_PATH}. Reinstall or rebuild the package.`);
        return;
      }
      const html = fs.readFileSync(INDEX_HTML_PATH, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && url.pathname === "/api/auth/status") {
      sendJson(res, 200, getCredentialStatus());
      return;
    }

    if (method === "POST" && url.pathname === "/api/auth/credentials") {
      const body = await readJsonBody(req);
      if (!body.email) {
        sendError(res, 400, "email is required");
        return;
      }
      setCredentials(body.email, body.password);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "DELETE" && url.pathname === "/api/auth/credentials") {
      clearCredentials();
      sendJson(res, 200, { ok: true });
      return;
    }

    // --- AI provider / model management (mirrors CLI/MCP core — no
    // separate logic; the settings UI is just an HTTP client of registry.ts
    // and adapters.ts, exactly like the CLI would be if it exposed these) ---

    if (method === "GET" && url.pathname === "/api/ai/providers") {
      sendJson(res, 200, { providers: listProviders() });
      return;
    }

    if (method === "POST" && url.pathname === "/api/ai/providers") {
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
      const providerMatch = url.pathname.match(/^\/api\/ai\/providers\/([^/]+)$/);
      if (providerMatch && method === "DELETE") {
        deleteProvider(decodeURIComponent(providerMatch[1]));
        clearProviderKey(decodeURIComponent(providerMatch[1]));
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    {
      const testMatch = url.pathname.match(/^\/api\/ai\/providers\/([^/]+)\/test$/);
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
      const fetchMatch = url.pathname.match(/^\/api\/ai\/providers\/([^/]+)\/fetch-models$/);
      if (fetchMatch && method === "GET") {
        const provider = getProvider(decodeURIComponent(fetchMatch[1]));
        if (!provider) {
          sendError(res, 404, `Unknown provider '${fetchMatch[1]}'`);
          return;
        }
        const result = await fetchModelsForProvider(provider);
        if (isDiscoveryError(result)) {
          // Graceful contract, ported from the reference OCR tool: a
          // discovery failure is still a 200 with an actionable message,
          // never an opaque 500 — the UI shows it inline, not as a crash.
          sendJson(res, 200, { models: [], ...result });
        } else {
          sendJson(res, 200, { models: result });
        }
        return;
      }
    }

    if (method === "GET" && url.pathname === "/api/ai/models") {
      sendJson(res, 200, { models: listModels(), defaultModel: getDefaultModel() });
      return;
    }

    if (method === "POST" && url.pathname === "/api/ai/models") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.models)) {
        sendError(res, 400, "models array is required");
        return;
      }
      saveModels(body.models);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && url.pathname === "/api/ai/models/default") {
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
      const deleteModelMatch = url.pathname.match(/^\/api\/ai\/models\/([^/]+)\/([^/]+)$/);
      if (deleteModelMatch && method === "DELETE") {
        deleteModel(decodeURIComponent(deleteModelMatch[1]), decodeURIComponent(deleteModelMatch[2]));
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (method === "POST" && url.pathname === "/api/generate") {
      const body = await readJsonBody(req);
      if (!body.url) {
        sendError(res, 400, "url is required");
        return;
      }
      const platform = body.platform ?? "google-play";
      const outputDir = path.join(process.cwd(), "output", `ui-${Date.now()}`);
      const pipeline = new AssetPipeline();
      const result = await pipeline.run(body.url, platform, outputDir, {
        slug: body.slug,
        email: body.email,
        password: body.password,
      });
      sendJson(res, 200, result);
      return;
    }

    sendError(res, 404, `No route for ${method} ${url.pathname}`);
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
