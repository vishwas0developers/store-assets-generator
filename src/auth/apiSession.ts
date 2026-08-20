import { type BrowserContext } from "playwright";

/**
 * Generic API-session auth strategy — the pattern proven in
 * 5.demo-assets-generator/app/services/demo_access.py, generalized so any
 * app with a login/demo endpoint can be configured without touching code.
 *
 * Five details ported deliberately because each one silently breaks auth
 * if missed (see docs/AUTHENTICATION.md §2.2):
 *   1. Status preflight before attempting login (enabled + not expired).
 *   2. A FIXED device identity sent on the login call AND written into
 *      localStorage — otherwise a real browser fingerprint never matches
 *      what a server-to-server login call sent, and every subsequent API
 *      call 200s with an inactive-session code ("login worked, no data").
 *   3. An app-code header so the session lands in the right app bucket.
 *   4. Injection via an init script that runs before any app script.
 *   5. A top-frame guard — opaque cross-origin iframes throw SecurityError
 *      on localStorage access and would otherwise abort the whole script.
 */

export interface ApiSessionConfig {
  statusUrl?: string; // GET → { enabled, expires_at }; omit to skip preflight
  loginUrl: string; // POST { email, password } → session payload
  email: string;
  password: string;
  deviceId?: string; // fixed identity; defaults to a stable constant
  appCode?: string;
  extraHeaders?: Record<string, string>;
  // JSON-path-ish accessors into the login response body
  sessionIdField?: string; // default "sessionId"
  userIdField?: string; // default "id"
  cookieDomain: string;
  cookieName?: string; // default "session_id"
}

export class ApiSessionAuthError extends Error {
  constructor(
    message: string,
    public readonly stage: "preflight" | "login" | "network",
  ) {
    super(message);
  }
}

const DEFAULT_DEVICE_ID = "store-assets-generator";

async function preflight(cfg: ApiSessionConfig): Promise<void> {
  if (!cfg.statusUrl) return;

  let resp: Response;
  try {
    resp = await fetch(cfg.statusUrl, { signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    throw new ApiSessionAuthError(`Could not reach ${cfg.statusUrl}: ${(e as Error).message}`, "network");
  }

  if (resp.status === 404) {
    throw new ApiSessionAuthError(
      "Demo/auth endpoints not registered here — this looks like a production build.",
      "preflight",
    );
  }
  if (!resp.ok) {
    throw new ApiSessionAuthError(`Status check failed (HTTP ${resp.status}).`, "preflight");
  }

  const data = (await resp.json()) as { enabled?: boolean; expires_at?: string };
  if (!data.enabled) {
    throw new ApiSessionAuthError("Demo access disabled — enable it first.", "preflight");
  }
  if (data.expires_at) {
    const expiry = new Date(data.expires_at);
    if (isNaN(expiry.getTime()) || expiry <= new Date()) {
      throw new ApiSessionAuthError("Demo access expired — re-enable it and update the password.", "preflight");
    }
  }
}

interface LoginResult {
  sessionId: string;
  userId: string | number;
}

async function login(cfg: ApiSessionConfig): Promise<LoginResult> {
  const deviceId = cfg.deviceId ?? DEFAULT_DEVICE_ID;

  let resp: Response;
  try {
    resp = await fetch(cfg.loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
        "X-Platform": "web",
        ...(cfg.appCode ? { "X-App-Code": cfg.appCode } : {}),
        ...(cfg.extraHeaders ?? {}),
      },
      body: JSON.stringify({ email: cfg.email, password: cfg.password }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new ApiSessionAuthError(`Could not reach ${cfg.loginUrl}: ${(e as Error).message}`, "network");
  }

  if (resp.status === 404) {
    throw new ApiSessionAuthError("Login endpoint not available — production build?", "login");
  }
  if (!resp.ok) {
    let reason = `Login failed (HTTP ${resp.status}).`;
    try {
      const body = await resp.json();
      reason = body.message || body.code || reason;
    } catch {
      // non-JSON error body — keep the generic HTTP-status reason
    }
    throw new ApiSessionAuthError(reason, "login");
  }

  const body = await resp.json();
  const sessionIdField = cfg.sessionIdField ?? "sessionId";
  const userIdField = cfg.userIdField ?? "id";
  const sessionId = body[sessionIdField];
  const userId = body[userIdField];
  if (!sessionId) {
    throw new ApiSessionAuthError(
      `Login response had no '${sessionIdField}' field — check sessionIdField config.`,
      "login",
    );
  }
  return { sessionId, userId };
}

/** Seeds a fresh browser context with the session BEFORE any app script
 *  runs, so the app hydrates already-authenticated. */
async function injectSession(context: BrowserContext, cfg: ApiSessionConfig, session: LoginResult): Promise<void> {
  const deviceId = cfg.deviceId ?? DEFAULT_DEVICE_ID;
  const cookieName = cfg.cookieName ?? "session_id";

  await context.addCookies([
    {
      name: cookieName,
      value: String(session.sessionId),
      domain: cfg.cookieDomain,
      path: "/",
      httpOnly: true,
      secure: cfg.cookieDomain.length > 0,
    },
  ]);

  await context.addInitScript(
    ({ sessionId, userId, deviceId }) => {
      try {
        // Only the top-level document needs the session; opaque/cross-origin
        // frames (e.g. an aborted ad iframe) throw SecurityError on access.
        if (window.top === window.self) {
          window.localStorage.setItem("sessionId", sessionId);
          window.localStorage.setItem("userId", String(userId));
          window.localStorage.setItem("web_device_id", deviceId);
          window.localStorage.setItem("device_id", deviceId);
        }
      } catch {
        /* opaque-origin or storage-blocked frame — nothing to seed there */
      }
    },
    { sessionId: session.sessionId, userId: session.userId, deviceId },
  );
}

/** Full flow: preflight → login → inject. Throws ApiSessionAuthError with a
 *  specific stage on failure; callers must abort rather than fall through to
 *  an unauthenticated capture. */
export async function authenticateViaApiSession(context: BrowserContext, cfg: ApiSessionConfig): Promise<void> {
  await preflight(cfg);
  const session = await login(cfg);
  await injectSession(context, cfg, session);
}
