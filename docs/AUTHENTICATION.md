# Authentication & Credential Management

**Companion documents:** [`PRD.md`](../PRD.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`AI-PROVIDERS.md`](./AI-PROVIDERS.md) · [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)

---

## 1. The Problem, Demonstrated

`output/final-test/raw/screen_1.png` shows exactly what this document fixes: a **login modal over a blurred dashboard**. The pipeline captured the login gate, not the app.

The current implementation in `src/capture/auth.ts` searches for `input[type='password']`, fills it, clicks a submit button, and waits a fixed 3 seconds. Against this application, every one of those steps fails:

| Assumption in current code | Reality in the target app |
|---|---|
| An email/username field exists | The modal offers **Mobile Number (+91)** only |
| A **password field** exists | **There is none.** Login is OTP-by-phone or Google OAuth |
| A submit click completes login | "Continue" triggers an OTP flow that never completes |
| `waitForTimeout(3000)` proves success | A bare timeout proves nothing; the modal is still open |
| Content behind the modal is capturable | The app **blurs** background content while unauthenticated |

**Conclusion: form-driving cannot authenticate this application.** There is no password field to fill, and the tool must never attempt Google/Firebase social login. This is precisely why `5.demo-assets-generator` bypasses the UI entirely.

---

## 2. The Proven Approach in `5.demo-assets-generator`

That project authenticates through a **dedicated backend endpoint**, then injects the resulting session into a fresh Playwright context so the app hydrates already-authenticated. Analysis of `app/services/demo_access.py`:

### 2.1 Flow

```
1. GET  {admin}/api/demo/status        → preflight: is demo access enabled and unexpired?
2. POST {admin}/api/demo/login         → { email, password } + identity headers → session
3. context.add_cookies(session_id)     → httpOnly cookie, matching the backend's own login response
4. context.add_init_script(...)        → localStorage seeded BEFORE any app script runs
5. Navigate → app hydrates authenticated, no login modal
```

### 2.2 The five details that actually make it work

These are non-obvious and were clearly hard-won. Each must survive the port:

1. **Preflight before login.** `/api/demo/status` returns `enabled` and `expires_at`. A 404 means the routes aren't registered at all — the correct signal for "this is production", not an error to retry. Demo access is **time-limited by design** and this check is what produces a clear "expired, re-enable it" message instead of a confusing login failure.

2. **A fixed device identity.** `DEMO_DEVICE_ID = "demo-assets-generator"` is sent as `X-Device-Id` on the login call **and** written into `localStorage` for the browser. The app's own `global.js#getAppIdentityHeaders` otherwise computes a canvas/UA/screen fingerprint that a server-to-server login could never match — and the backend's single-active-session policy would then return `200 code:'session_inactive'` on every subsequent API call. That is the notorious "login succeeds but no data loads" failure. **One fixed string on both sides is the fix.**

3. **`X-App-Code` must match the target site's own `PUBLIC_APP_CODE`.** Otherwise the session lands in a different Application Group than the pages query, and the app appears empty.

4. **Init script, not post-load injection.** `add_init_script` runs before any app script in every frame, so the app hydrates authenticated rather than flashing a login modal first.

5. **Top-frame guard.** `window.localStorage` throws `SecurityError` in opaque/cross-origin frames (e.g. an ad iframe whose request the blocker aborted), which aborts the whole init script. The guard is `if (window.top === window.self)` inside a `try/catch`.

### 2.3 Credential storage — the pattern to reuse

From `app/config.py`:

- `DEMO_ACCOUNT_EMAIL` — plaintext, not a secret, shown in the UI for editing.
- `DEMO_ACCOUNT_PASSWORD_ENC` — **Fernet ciphertext**, the only form written to `.env`.
- `.secret.key` — local encryption key, gitignored, `chmod 600` best-effort.
- `DEMO_ACCOUNT_PASSWORD` — decrypted **in memory only**, never persisted in that form.
- `demo_credentials_status()` returns `{ email, password_set: bool }` — **presence only, never the value or the ciphertext**.
- Saving with a blank password **keeps the existing one**, which is what lets the UI show masked dots instead of forcing re-entry.

---

## 3. Design for Store Assets Generator

The ITI approach is correct but ITI-specific — it hardcodes one endpoint shape. Since this tool must serve any application with no app-specific logic in the core, authentication becomes a **pluggable, config-driven strategy**.

### 3.1 Strategies

| Strategy | When to use | Notes |
|---|---|---|
| **`storage-state`** | Any app, once a session exists | Reuse a saved Playwright `storageState`. **Tried first, always.** |
| **`api-session`** | Apps with a login/demo API endpoint | The generalized ITI approach. **The default for this app family.** |
| **`form`** | Apps with a genuine email/password form | The existing implementation, fixed to verify success rather than assume it |
| **`manual`** | Anything else — OTP, CAPTCHA, SSO | Human logs in once in a headed browser; the tool saves the state and reuses it |

`manual` is the honest escape hatch. For an OTP- or Google-only app with no demo endpoint, no automation can log in, and pretending otherwise is how you get a screenshot of a login modal.

### 3.2 Configuration — `api-session`

Fully declarative, so a new app needs config rather than code:

```yaml
auth:
  strategy: api-session
  sessionStatePath: .auth/iticareer.json     # cached storageState
  reuseSession: true

  preflight:                                  # optional but recommended
    url: "${ADMIN_API_BASE_URL}/api/demo/status"
    expect:
      enabled: true
      notExpiredField: expires_at             # time-limited access, see §4
    onMissing: "Demo endpoints unavailable — this looks like a production build."

  login:
    url: "${ADMIN_API_BASE_URL}/api/demo/login"
    method: POST
    body:
      email: "${AUTH_EMAIL}"
      password: "${AUTH_PASSWORD}"
    headers:
      X-Device-Id: "${DEVICE_ID}"             # fixed; see §2.2 detail 2
      X-Platform: web
      X-App-Code: "${APP_CODE}"

  inject:
    cookies:
      - name: session_id
        valueFrom: sessionId                  # JSON path in the login response
        httpOnly: true
        path: /
    localStorage:
      sessionId:      { valueFrom: sessionId }
      userId:         { valueFrom: id }
      web_device_id:  { value: "${DEVICE_ID}" }
      device_id:      { value: "${DEVICE_ID}" }

  verify:                                     # NEVER a bare timeout
    selector: "[data-authenticated], #course-dashboard"
    absent: ".login-modal, [data-login-gate]"
    timeoutMs: 20000
```

The `verify` block is what turns the current silent failure into a loud one. Authentication is not "we clicked something and waited" — it is **an assertion that the authenticated UI is present and the login gate is gone**. If it fails, the run aborts with a clear reason rather than producing a screenshot of a modal.

### 3.3 Session reuse — Playwright `storageState`

```
Capture run starts
   ↓
storageState file exists and loads?
   ├── yes → create context with it → run verify
   │            ├── passes → capture (no login at all)
   │            └── fails  → discard, fall through
   └── no  → run configured strategy → verify → save storageState
```

This is what stops credentials being needed on every run. The saved state is treated as a cache that can be invalidated at any time, never as a source of truth — a stale session must degrade to a fresh login, not to a broken capture.

**The state file contains live session tokens and must be treated as a secret:** stored under `.auth/`, gitignored, permissions restricted, and never included in any output package, manifest, or report.

---

## 4. Credential Management — Rotating, Time-Limited Access

The demo password **changes frequently** and access **expires**. Updating it must never require touching code.

### 4.1 Three layers of configuration

Resolved in order, later overriding earlier:

1. **Config file** — non-secret values (`email`, endpoints, `APP_CODE`, device id).
2. **Environment variables** — `DEMO_GEN_DEMO_ACCOUNT_EMAIL`, `DEMO_GEN_DEMO_ACCOUNT_PASSWORD_ENC`, `DEMO_GEN_APP_CODE`, `DEMO_GEN_ADMIN_API_BASE_URL` (see .env.example). The Demo Access panel in the web UI writes all four for you.
3. **Encrypted local store** — what the web UI and CLI write. Wins, because it is the most recently and deliberately set.

The password is **never** written to a config file in plaintext, and never committed.

### 4.2 Storage

Directly adopting the proven pattern, in Node:

- Key: `.auth/.secret.key`, generated on first use, gitignored, permissions restricted (best-effort on Windows).
- Cipher: **AES-256-GCM** (Node `crypto`, no dependency — the equivalent of Fernet's authenticated encryption).
- Persisted: `.auth/credentials.json` holding `{ email, passwordEnc, updatedAt }`.
- Plaintext password exists **in process memory only**, for the duration of the login call.
- **Never logged, never returned by any API, never written into a manifest, screenshot, report, or bundle.**

Optional upgrade: OS keychain via `keytar`, with the encrypted file as fallback. Recommended as a later refinement, not a v1 requirement — the file approach is already proven here.

### 4.3 CLI

```bash
store-assets auth set --email demo@example.com          # prompts for password, hidden input
store-assets auth set --password                        # update password only, keep email
store-assets auth status                                # { email, passwordSet, sessionCached, expiresAt }
store-assets auth test                                  # preflight + login + verify, no capture
store-assets auth clear                                 # wipe credentials and cached session
```

`auth test` is the one that matters operationally: after rotating the password, run it and get a definitive yes/no in seconds — rather than discovering the problem at the end of a five-minute capture run.

### 4.4 Web interface

A small local settings UI, following the `5.demo-assets-generator` Settings-modal precedent:

```
store-assets ui        →  http://127.0.0.1:8787
```

| Field | Behaviour |
|---|---|
| Demo email | Shown and editable — not a secret |
| Demo password | Masked dots (`••••••••`) when set. **Blank = keep existing.** Typing replaces it |
| Admin API base URL | Editable |
| App code | Editable |
| Access status | Live badge: enabled / disabled / **expires in 2h 14m** |
| Test connection | Runs preflight + login + verify, reports the precise failure reason |
| Clear session | Drops the cached `storageState` |

Endpoints, mirroring the proven shapes:

```
GET  /api/settings/credentials   → { email, passwordSet: true, updatedAt }   # presence only
POST /api/settings/credentials   → { email, password? }                      # blank password = unchanged
GET  /api/settings/access-status → { enabled, expiresAt, remainingSeconds }
POST /api/settings/test-auth     → { ok, stage, reason? }
```

The UI binds to `127.0.0.1` only, is not exposed to the network, and never returns a password value or its ciphertext in any response.

### 4.5 Expiry handling

Because access is time-limited, expiry is a first-class state rather than a generic error:

- Preflight reads `expires_at` and surfaces remaining time in CLI, UI, and MCP status.
- An expired session produces **"Demo access expired — re-enable it in the Admin Panel and update the password here"**, not "login failed".
- A capture run aborts *before* opening a browser when access is already expired — no wasted work, no misleading screenshots.
- If expiry occurs mid-run, the affected screens are reported as skipped with the reason recorded, exactly as unauthenticated screens are.

---

## 5. MCP Surface

```
get_auth_status      → { email, passwordSet, accessEnabled, expiresAt, sessionCached }
test_auth            → { ok, stage, reason? }
set_auth_credentials → { email, password? }        # write-only; never echoes the value
clear_auth_session   → drops cached storageState
```

`set_auth_credentials` is write-only by design. An agent may need to help configure the tool, but no tool call should ever be able to read a stored password back out.

---

## 6. Fixing the Current Implementation

`src/capture/auth.ts` needs to change in four ways:

1. **Try `storageState` first.** Currently it logs in every time.
2. **Add the `api-session` strategy** as the default for this app family. Form-driving is the fallback, not the primary path.
3. **Replace `waitForTimeout(3000)` with a real `verify` assertion** — authenticated marker present *and* login gate absent. This is the single highest-value change: it converts a silent wrong-screenshot into a loud, actionable failure.
4. **Return a typed result**, not `boolean`. Callers need to know *which* stage failed (preflight / login / injection / verification) to report it usefully.

Additionally, `injectSession` must adopt the top-frame guard and seed the device-identity keys, or the session will be established and then rejected on every API call.

---

## 7. Security Requirements

- Never hardcode credentials; never commit them.
- Passwords encrypted at rest; plaintext in memory only, for the duration of a login call.
- Never log, echo, or serialize a password or its ciphertext — including into MCP responses, manifests, reports, and bundles.
- `.auth/` gitignored in full; `storageState` treated as a live secret.
- Web UI bound to loopback only.
- Never attempt Google/Firebase/social login.
- Prefer demo/test accounts; never production user credentials.
- Refuse to run against a production build when a preflight indicates it — capture must not touch production data.

---

## 8. Open Questions

1. **Does the demo endpoint exist for this app outside local builds?** `5.demo-assets-generator` states the backend structurally refuses demo login outside `APP_ENV=local`. If capture must target staging or production, an equivalent gated endpoint is needed there — otherwise `manual` strategy with a saved session is the only route.
2. **How long is the access window?** Determines whether session caching meaningfully reduces logins or whether re-auth is needed every run.
3. **Should `auth test` run automatically before every capture?** It costs seconds and prevents wasted runs; recommended as the default with an opt-out.
4. **Keychain now or later?** The encrypted-file approach is proven; `keytar` is a refinement.
