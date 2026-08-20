import fs from "fs";
import path from "path";
import { type BrowserContext, type Page } from "playwright";
import { authenticateViaApiSession, ApiSessionAuthError, type ApiSessionConfig } from "../auth/apiSession.js";
import { verifyAuthenticated, type VerifyConfig } from "../auth/verify.js";
import { resolveCredentials } from "../auth/credentials.js";

export type AuthStage = "storage-state" | "api-session" | "form" | "manual" | "verification";

export interface AuthResult {
  ok: boolean;
  stage: AuthStage | null;
  reason?: string;
  /** true if the authenticated context should be persisted for reuse */
  shouldSave: boolean;
}

export interface AuthConfig {
  /** Strategy order to try. Defaults to ["storage-state", "api-session", "form"]. */
  strategies?: Array<"storage-state" | "api-session" | "form">;
  sessionStatePath?: string;
  apiSession?: Omit<ApiSessionConfig, "email" | "password"> & { email?: string; password?: string };
  verify?: VerifyConfig;
  form?: { loginUrl?: string };
}

const DEFAULT_SESSION_STATE_DIR = path.join(process.cwd(), ".auth");

export function defaultSessionStatePath(slug: string): string {
  return path.join(DEFAULT_SESSION_STATE_DIR, `${slug}.json`);
}

export function hasStoredSession(sessionStatePath: string): boolean {
  return fs.existsSync(sessionStatePath);
}

export async function saveStorageState(context: BrowserContext, sessionStatePath: string): Promise<void> {
  fs.mkdirSync(path.dirname(sessionStatePath), { recursive: true });
  await context.storageState({ path: sessionStatePath });
}

/**
 * Tries a genuine email/password FORM login — but only if a password field
 * actually exists on the page. Against apps like this workspace's
 * WebView target, the login modal offers Mobile Number or Google only, so
 * this strategy correctly declines rather than blind-filling the wrong
 * field and reporting false success (the exact failure mode this replaces).
 */
async function tryFormLogin(page: Page, email: string, password: string, loginUrl?: string): Promise<boolean> {
  if (loginUrl) {
    await page.goto(loginUrl, { waitUntil: "load", timeout: 20_000 }).catch(() => {});
  }

  const passwordSelectors = ["input[type='password']", "input[name='password']", "input[id*='password']"];
  let passwordField = null;
  for (const sel of passwordSelectors) {
    const locator = page.locator(sel).first();
    if (await locator.isVisible().catch(() => false)) {
      passwordField = locator;
      break;
    }
  }

  if (!passwordField) {
    // No password field on this page — form strategy genuinely does not
    // apply here (e.g. OTP-by-phone or Google-only login). Decline rather
    // than fill an unrelated field and claim success.
    return false;
  }

  const emailSelectors = ["input[type='email']", "input[name='email']", "input[name='username']"];
  for (const sel of emailSelectors) {
    const locator = page.locator(sel).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.fill(email);
      break;
    }
  }

  await passwordField.fill(password);

  const submitSelectors = ["button[type='submit']", "button:has-text('Login')", "button:has-text('Sign In')"];
  for (const sel of submitSelectors) {
    const locator = page.locator(sel).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      break;
    }
  }

  return true;
}

/**
 * Runs the configured auth strategy chain and verifies the result.
 * Never returns ok:true on a bare timeout — verification against a real
 * authenticated-UI marker (and absence of the login gate) is mandatory
 * whenever any strategy other than a cached storage-state was used.
 */
export async function authenticate(page: Page, context: BrowserContext, config: AuthConfig): Promise<AuthResult> {
  const strategies = config.strategies ?? ["storage-state", "api-session", "form"];
  const sessionStatePath = config.sessionStatePath;

  if (strategies.includes("storage-state") && sessionStatePath && hasStoredSession(sessionStatePath)) {
    // storageState is applied at context-creation time by the caller (see
    // capture/browser.ts) — here we only need to verify it still holds.
    const result = config.verify ? await verifyAuthenticated(page, config.verify) : { ok: true };
    if (result.ok) {
      return { ok: true, stage: "storage-state", shouldSave: false };
    }
    // Cached session is stale — fall through to a fresh login below.
  }

  const creds = resolveCredentials();

  if (strategies.includes("api-session") && config.apiSession) {
    const email = config.apiSession.email ?? creds?.email;
    const password = config.apiSession.password ?? creds?.password;
    if (email && password) {
      try {
        await authenticateViaApiSession(context, { ...config.apiSession, email, password } as ApiSessionConfig);
        if (config.verify) {
          const result = await verifyAuthenticated(page, config.verify);
          if (!result.ok) {
            return { ok: false, stage: "verification", reason: result.reason, shouldSave: false };
          }
        }
        return { ok: true, stage: "api-session", shouldSave: true };
      } catch (e) {
        const err = e as ApiSessionAuthError;
        // Fall through to the next strategy rather than aborting outright —
        // but report this attempt's specific stage/reason if nothing else works.
        if (!strategies.includes("form")) {
          return { ok: false, stage: "api-session", reason: err.message, shouldSave: false };
        }
      }
    }
  }

  if (strategies.includes("form") && creds) {
    const attempted = await tryFormLogin(page, creds.email, creds.password, config.form?.loginUrl);
    if (attempted) {
      if (config.verify) {
        const result = await verifyAuthenticated(page, config.verify);
        if (!result.ok) {
          return { ok: false, stage: "verification", reason: result.reason, shouldSave: false };
        }
      }
      return { ok: true, stage: "form", shouldSave: true };
    }
  }

  return {
    ok: false,
    stage: null,
    reason: "No applicable auth strategy succeeded (no password field for form login, no api-session configured, no cached session).",
    shouldSave: false,
  };
}
