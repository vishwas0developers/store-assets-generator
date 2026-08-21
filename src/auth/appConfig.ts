import fs from "fs";
import path from "path";
import { type AuthConfig } from "../capture/auth.js";
import { readEnvValues, saveEnvValues } from "../config/env.js";

/**
 * Loads a per-app auth config from apps/<slug>/auth.json — keeps the core
 * engine free of any app-specific logic (PRD §6/§11). Returns null (no
 * per-app override exists for this slug) when no config exists for the
 * slug — callers should fall back to resolveAuthConfig() below rather than
 * treat null as "no auth needed", since a URL simply not having a
 * dedicated apps/<slug>/ folder does not mean it is public.
 */
export function loadAuthConfig(slug: string): AuthConfig | null {
  const configPath = path.join(process.cwd(), "apps", slug, "auth.json");
  if (!fs.existsSync(configPath)) return null;

  const text = expandEnvPlaceholders(fs.readFileSync(configPath, "utf-8"));
  const raw = JSON.parse(text);
  delete raw._comment;
  return raw as AuthConfig;
}

/**
 * The global demo-account config — one set of env vars that authenticates
 * ANY captured URL automatically, matching
 * 5.demo-assets-generator/app/config.py's model exactly: that project has
 * no per-app config files at all, just one ADMIN_API_BASE_URL/APP_CODE/
 * DEMO_ACCOUNT_EMAIL/PASSWORD applied to every capture. Used whenever a
 * URL has no apps/<slug>/auth.json override — this is what makes "enable
 * demo access in the Admin Panel, set the password" work immediately for
 * a newly-added target, with no per-app file to author first.
 *
 * Requires only DEMO_GEN_ADMIN_API_BASE_URL (see .env.example); everything else
 * has a sensible default. Actual credentials still come from the
 * DEMO_GEN_DEMO_ACCOUNT_EMAIL / DEMO_GEN_DEMO_ACCOUNT_PASSWORD_ENC env vars
 * (src/auth/credentials.ts) — this only supplies the endpoint shape.
 *
 * No client-side verify selectors here, deliberately — the reference
 * project has no such mechanism either; a 200 from POST /api/demo/login is
 * the whole identity guarantee (see demo_access.py's comment on this exact
 * point). A per-app apps/<slug>/auth.json can still define its own
 * `verify` block when a specific app genuinely needs one.
 */
export function loadDefaultAuthConfig(targetUrl: string): AuthConfig | null {
  const adminBaseUrl = process.env.DEMO_GEN_ADMIN_API_BASE_URL;
  if (!adminBaseUrl) return null;

  let cookieDomain: string;
  try {
    cookieDomain = new URL(targetUrl).hostname;
  } catch {
    return null;
  }

  const base = adminBaseUrl.replace(/\/$/, "");

  return {
    strategies: ["storage-state", "api-session"],
    apiSession: {
      statusUrl: `${base}/api/demo/status`,
      loginUrl: `${base}/api/demo/login`,
      cookieDomain,
      cookieName: "session_id",
      sessionIdField: "sessionId",
      userIdField: "id",
      deviceId: "store-assets-generator",
      appCode: process.env.DEMO_GEN_APP_CODE,
    },
  };
}

/** Per-app override if one exists, else the global demo-account default —
 *  the single entry point capture code should call instead of
 *  loadAuthConfig() directly, so a URL with no apps/<slug>/ folder still
 *  gets authenticated rather than silently captured as a login screen. */
export function resolveAuthConfig(targetUrl: string, slug: string): AuthConfig | null {
  return loadAuthConfig(slug) ?? loadDefaultAuthConfig(targetUrl);
}

export interface DemoAccessConfig {
  adminApiBaseUrl: string;
  appCode: string;
}

/** Reads the two non-secret demo-access settings the web UI's Demo Access
 *  panel edits (admin panel domain, application code) — persisted in .env
 *  as DEMO_GEN_ADMIN_API_BASE_URL / DEMO_GEN_APP_CODE, the same file and
 *  variables loadDefaultAuthConfig() reads. Frontend/target URLs are
 *  deliberately NOT part of this config — a capture supplies its own URL
 *  each time, and cookieDomain is derived from it, not stored. */
export function getDemoAccessConfig(): DemoAccessConfig {
  const values = readEnvValues(["DEMO_GEN_ADMIN_API_BASE_URL", "DEMO_GEN_APP_CODE"]);
  return { adminApiBaseUrl: values.DEMO_GEN_ADMIN_API_BASE_URL, appCode: values.DEMO_GEN_APP_CODE };
}

export function setDemoAccessConfig(config: Partial<DemoAccessConfig>): void {
  const values: Record<string, string> = {};
  if (config.adminApiBaseUrl !== undefined) values.DEMO_GEN_ADMIN_API_BASE_URL = config.adminApiBaseUrl;
  if (config.appCode !== undefined) values.DEMO_GEN_APP_CODE = config.appCode;
  saveEnvValues(values);
}

/** Replaces ${VAR_NAME} with process.env.VAR_NAME so auth.json can reference
 *  secrets/endpoints without ever containing them literally. */
function expandEnvPlaceholders(text: string): string {
  return text.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? "");
}

export function slugify(url: string): string {
  try {
    return new URL(url).hostname.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  } catch {
    return "app";
  }
}
