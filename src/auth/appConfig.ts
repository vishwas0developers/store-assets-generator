import fs from "fs";
import path from "path";
import { type AuthConfig } from "../capture/auth.js";

/**
 * Loads a per-app auth config from apps/<slug>/auth.json — keeps the core
 * engine free of any app-specific logic (PRD §6/§11). Returns null (no
 * auth attempted) when no config exists for the slug, which is the correct
 * default for public sites that need no login at all.
 */
export function loadAuthConfig(slug: string): AuthConfig | null {
  const configPath = path.join(process.cwd(), "apps", slug, "auth.json");
  if (!fs.existsSync(configPath)) return null;

  const text = expandEnvPlaceholders(fs.readFileSync(configPath, "utf-8"));
  const raw = JSON.parse(text);
  delete raw._comment;
  return raw as AuthConfig;
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
