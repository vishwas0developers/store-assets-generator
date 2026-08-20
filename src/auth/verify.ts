import { type Page } from "playwright";

export interface VerifyConfig {
  /** CSS selector that proves the authenticated UI is present. */
  authenticatedSelector?: string;
  /** CSS selector that must be ABSENT — e.g. a login modal/gate. */
  loginGateSelector?: string;
  timeoutMs?: number;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Never trust a bare timeout as proof of login. Authentication succeeds only
 * when the authenticated marker is present AND the login gate is absent —
 * this is what turns a silent wrong screenshot (a captured login modal) into
 * a loud, actionable failure instead.
 */
export async function verifyAuthenticated(page: Page, cfg: VerifyConfig): Promise<VerifyResult> {
  const timeoutMs = cfg.timeoutMs ?? 15_000;

  if (cfg.authenticatedSelector) {
    try {
      await page.waitForSelector(cfg.authenticatedSelector, { timeout: timeoutMs, state: "visible" });
    } catch {
      return { ok: false, reason: `Authenticated marker '${cfg.authenticatedSelector}' never appeared.` };
    }
  }

  if (cfg.loginGateSelector) {
    const gateVisible = await page
      .locator(cfg.loginGateSelector)
      .first()
      .isVisible()
      .catch(() => false);
    if (gateVisible) {
      return { ok: false, reason: `Login gate '${cfg.loginGateSelector}' is still visible — auth did not take effect.` };
    }
  }

  if (!cfg.authenticatedSelector && !cfg.loginGateSelector) {
    return { ok: false, reason: "No verify selectors configured — cannot confirm authentication without one." };
  }

  return { ok: true };
}
