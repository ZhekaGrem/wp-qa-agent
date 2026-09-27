import fs from 'node:fs';

const SOURCE = fs.readFileSync(new URL('./page-probes.browser.js', import.meta.url), 'utf8');

export async function runProbes(page) {
  await page.evaluate(SOURCE);
  return page.evaluate(() => window.__wpqa.run());
}

// Scroll through the page so lazy-loaded images and blocks render, then return to the top.
export async function stabilizePage(page) {
  await page.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
    const step = window.innerHeight;
    for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 60; y += step, i++) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
}
