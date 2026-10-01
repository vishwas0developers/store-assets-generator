import fs from "fs";
import path from "path";

/**
 * Minimal .env loader/writer — the missing piece that made demo login
 * silently break. apps/<slug>/auth.json and the global default demo config
 * (see src/auth/appConfig.ts) reference ${DEMO_GEN_ADMIN_API_BASE_URL} /
 * ${DEMO_GEN_APP_CODE} placeholders, expanded from process.env. With
 * nothing ever loading a .env file, those variables were never set unless
 * the shell happened to export them, so the placeholders silently expanded
 * to "" — producing a malformed relative URL ("/api/demo/status" with no
 * host) that fetch() cannot resolve, and an empty X-App-Code. Demo login
 * then failed before it ever reached the target app, so every capture ran
 * unauthenticated and the login popup was all that ever got screenshotted.
 *
 * Mirrors 5.demo-assets-generator/app/config.py's ENV_PATH pattern (a
 * gitignored .env at the application root, editable through the app's own
 * Settings UI rather than by hand) — hand-rolled rather than adding the
 * `dotenv` dependency, since the format needed here is a handful of
 * KEY=VALUE lines, not the full spec.
 *
 * ponytail: no multi-line values, no variable interpolation inside .env
 * itself. Add when a real value needs either.
 */

const ENV_PATH = path.join(process.cwd(), ".env");

export function loadEnvFile(): void {
  if (!fs.existsSync(ENV_PATH)) return;

  for (const [key, value] of parseEnvFile(fs.readFileSync(ENV_PATH, "utf-8"))) {
    // Never override a value the shell/CI already exported — an explicit
    // env var should always win over the file default.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseEnvFile(text: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries.push([key, value]);
  }
  return entries;
}

/**
 * Persists one or more KEY=VALUE pairs into .env — read-modify-write,
 * preserving every other line (comments, unrelated keys) untouched, and
 * appending any key that doesn't exist yet. Also applies the values to
 * process.env immediately, so a running server picks them up without a
 * restart. This is what makes values entered through the web UI (Demo
 * Access panel) actually persistent and reusable across runs, the same
 * role 5.demo-assets-generator's Settings modal plays for its own .env.
 */
export function saveEnvValues(values: Record<string, string>): void {
  const existingText = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
  const lines = existingText.length ? existingText.split("\n") : [];
  const remaining = new Map(Object.entries(values));

  const updatedLines = lines.map((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return rawLine;
    const eq = line.indexOf("=");
    if (eq === -1) return rawLine;
    const key = line.slice(0, eq).trim();
    if (!remaining.has(key)) return rawLine;
    const value = remaining.get(key)!;
    remaining.delete(key);
    return `${key}=${value}`;
  });

  for (const [key, value] of remaining) {
    updatedLines.push(`${key}=${value}`);
  }
  // Drop a trailing blank line left by the split, then write with exactly
  // one trailing newline.
  while (updatedLines.length && updatedLines[updatedLines.length - 1] === "") updatedLines.pop();

  fs.writeFileSync(ENV_PATH, updatedLines.join("\n") + "\n", "utf-8");

  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}

/** Reads current values straight from process.env (already loaded by
 *  loadEnvFile() at startup) — used to prefill the Demo Access UI panel. */
export function readEnvValues(keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) result[key] = process.env[key] ?? "";
  return result;
}
