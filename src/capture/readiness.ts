import { type Page } from "playwright";

/**
 * Content-readiness gate — waits for the page's actual data to finish
 * loading before a screenshot is taken, instead of screenshotting whatever
 * is on screen the instant navigation "completes" (which, for any
 * data-driven SPA, is the skeleton/loading state: `load`/`domcontentloaded`
 * fire once the initial HTML+JS bundle is parsed, well before the app's
 * own API calls have returned and rendered real content).
 *
 * Three signals combined, each best-effort (a missing signal is not a
 * failure — the next one still runs):
 *   1. Network idle — no in-flight requests for a short window. Catches
 *      the common case (API calls finish, page goes quiet).
 *   2. Skeleton/loading-indicator absence — generic class/attribute
 *      patterns (skeleton, shimmer, placeholder, spinner, aria-busy)
 *      polled until none are visible. Catches apps that keep a websocket
 *      or polling connection open (never truly "network idle") but do
 *      remove their loading placeholders once real content is in.
 *   3. DOM-mutation quiet period — waits until the page stops mutating
 *      its own DOM for a short window. Catches everything else: content
 *      that swaps in after network idle (render-after-fetch), animations
 *      settling, etc. This is the actual "is the UI still changing"
 *      signal, and the one that matters most.
 *
 * No fixed sleep is used as the primary mechanism — every wait above is a
 * real condition with a timeout, not a guessed delay. A single short
 * settle (150ms) after all three pass absorbs the last paint/animation
 * frame, nothing more.
 */

export interface ReadinessOptions {
  /** Extra CSS selectors identifying this app's own loading indicators,
   *  checked alongside the generic defaults below. */
  extraLoadingSelectors?: string[];
  /** Overall budget for the whole readiness gate. Defaults to 20s. */
  timeoutMs?: number;
  /** How long the DOM must stay unchanged to be considered "settled". */
  quietMs?: number;
}

const DEFAULT_LOADING_SELECTORS = [
  '[class*="skeleton" i]',
  '[class*="shimmer" i]',
  '[class*="placeholder-glow" i]',
  '[class*="loading" i]',
  '[class*="spinner" i]',
  '[class*="loader" i]',
  '[aria-busy="true"]',
  '[role="progressbar"]',
  '.MuiSkeleton-root',
  '.ant-skeleton-active',
  '.animate-pulse',
];

export async function waitForContentReady(page: Page, opts: ReadinessOptions = {}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const quietMs = opts.quietMs ?? 600;
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(250, deadline - Date.now());

  // 1. Network idle — SPAs that finish their data fetch cleanly go quiet.
  await page.waitForLoadState("networkidle", { timeout: Math.min(8000, remaining()) }).catch(() => {});

  // 2. Loading-indicator absence — apps with an open socket/poll never go
  // network-idle, but still remove their own skeleton/spinner once ready.
  const selectors = [...DEFAULT_LOADING_SELECTORS, ...(opts.extraLoadingSelectors ?? [])].join(",");
  await page
    .waitForFunction(
      (sel) => {
        const els = document.querySelectorAll(sel);
        for (const el of Array.from(els)) {
          const style = window.getComputedStyle(el as Element);
          const visible = style.display !== "none" && style.visibility !== "hidden" && (el as HTMLElement).offsetParent !== null;
          if (visible) return false;
        }
        return true;
      },
      selectors,
      { timeout: remaining(), polling: 250 },
    )
    .catch(() => {
      // Either no such elements ever existed (nothing to wait for) or they
      // never disappeared within budget — the DOM-quiet check below is the
      // real gate either way, so this is not a hard failure.
    });

  // 3. DOM-mutation quiet period — the authoritative "did the UI stop
  // changing" signal, independent of any selector guesswork above.
  await page
    .evaluate(
      ({ quietMs, maxMs }) =>
        new Promise<void>((resolve) => {
          let timer: ReturnType<typeof setTimeout>;
          const finish = () => {
            observer.disconnect();
            resolve();
          };
          const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(finish, quietMs);
          });
          observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
          timer = setTimeout(finish, quietMs);
          setTimeout(finish, maxMs); // hard cap — never wait past the budget
        }),
      { quietMs, maxMs: remaining() },
    )
    .catch(() => {
      // document.body missing/evaluate context destroyed mid-navigation —
      // proceed rather than fail the whole capture over the settle check.
    });

  // Final short settle for the last paint/animation frame.
  await page.waitForTimeout(150);
}
