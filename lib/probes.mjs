import fs from 'node:fs';

const SOURCE = fs.readFileSync(new URL('./page-probes.browser.js', import.meta.url), 'utf8');
const CONTEXT_DESTROYED = /Execution context was destroyed/;

// A page whose script or iframe points at a URL the read-only guard refuses
// (a nonce, logout or add-to-cart link) starts a real navigation attempt
// before the guard's route handler can abort the underlying request; Chromium
// tears down the frame's JS execution context as part of that attempt even
// though the document itself never actually changes and the request is then
// aborted. `page.evaluate` surfaces that as "Execution context was
// destroyed". The fix is to let the frame settle back onto its (unchanged)
// document and retry once, rather than fail the whole page.
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
    // Scrolling is best-effort: swallow only the blocked-navigation race
    // described above, so a nav-trap page doesn't fail the whole scan.
    if (!CONTEXT_DESTROYED.test(String(error?.message ?? error))) throw error;
  }
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
}
