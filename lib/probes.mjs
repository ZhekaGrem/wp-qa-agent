import fs from 'node:fs';

const SOURCE = fs.readFileSync(new URL('./page-probes.browser.js', import.meta.url), 'utf8');
const CONTEXT_DESTROYED = /Execution context was destroyed/;

// A *refused* navigation no longer tears down this context at all: the guard
// in lib/read-only-route.mjs answers it with an empty 204, which Chromium
// treats as "stay on the current document" (no unload, no new context). But
// a script or redirect to a URL the filter *allows* really does navigate,
// and can do so mid-evaluate here, which surfaces as "Execution context was
// destroyed". Retrying once (after letting the frame settle) turns that race
// into a clean result either way: if it retries against the *same* document
// the result is correct, and if it retries against a *different* one, the
// caller's own page.url()-vs-finalUrl check (tests/visual/scan.spec.ts, right
// after runProbes) still catches the mismatch and fails the check with a
// clear "navigated away" error before any detections are recorded — so a
// successful-but-wrong retry here can never mislabel the record.
async function evaluateStable(page, fn) {
  try {
    return await page.evaluate(fn);
  } catch (error) {
    if (!CONTEXT_DESTROYED.test(String(error?.message ?? error))) throw error;
    await page.waitForLoadState('load', { timeout: 5_000 }).catch(() => {});
    return page.evaluate(fn);
  }
}

export async function runProbes(page) {
  await evaluateStable(page, SOURCE);
  return evaluateStable(page, () => window.__wpqa.run());
}

// Scroll through the page so lazy-loaded images and blocks render, then return to the top.
export async function stabilizePage(page) {
  try {
    await page.evaluate(async () => {
      if (document.fonts) await document.fonts.ready;
      const step = window.innerHeight;
      for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 60; y += step, i++) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      window.scrollTo(0, 0);
    });
  } catch (error) {
    // Scrolling is best-effort: swallow only the allowed-navigation race
    // described above, so it doesn't fail the whole check (runProbes and the
    // URL check right after it are what actually decide pass/fail).
    if (!CONTEXT_DESTROYED.test(String(error?.message ?? error))) throw error;
  }
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
}
