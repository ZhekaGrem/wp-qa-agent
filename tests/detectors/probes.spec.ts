import { test, expect } from '@playwright/test';
import { createFakeWp } from '../support/fake-wp.mjs';
import { runProbes } from '../../lib/probes.mjs';
import { detectTextDefects } from '../../lib/text-detectors.mjs';

let wp: ReturnType<typeof createFakeWp>;
let base = '';

test.beforeAll(async () => {
  wp = createFakeWp();
  base = await wp.start();
});
test.afterAll(async () => {
  await wp.stop();
});
test.use({ viewport: { width: 360, height: 740 } });

const cases: [string, string][] = [
  ['overflow', 'VIS-OVERFLOW-X'],
  ['body-hidden-overflow', 'VIS-OVERFLOW-X'],
  ['broken-image', 'VIS-IMG-BROKEN'],
  ['distorted-image', 'VIS-IMG-DISTORTED'],
  ['overlap', 'VIS-OVERLAP'],
  ['clipped', 'VIS-TEXT-CLIPPED'],
  ['empty-control', 'TXT-EMPTY-CONTROL'],
  ['wp-die', 'TXT-PHP-ERROR'],
];

for (const [fixture, id] of cases) {
  test(`${fixture} is reported as ${id} and nothing else`, async ({ page }) => {
    await page.goto(`${base}/${fixture}/`);
    const { detections } = await runProbes(page);
    expect(detections.map((d) => d.id)).toEqual([id]);
  });
}

test('ordinary theme patterns on the clean page produce no detections', async ({ page }) => {
  await page.goto(`${base}/clean/`);
  const result = await runProbes(page);
  expect(result.detections).toEqual([]);
  expect(detectTextDefects(result.blocks, result.meta)).toEqual([]);
  expect(result.meta.lang).toBe('uk');
});

test('text-defects page yields every seeded text detection', async ({ page }) => {
  await page.goto(`${base}/text-defects/`);
  const { blocks, meta, links } = await runProbes(page);
  const ids = [...new Set(detectTextDefects(blocks, meta).map((d) => d.id))].sort();
  expect(ids).toEqual(['TXT-DUP-WORD', 'TXT-LANG-LEAK', 'TXT-MIXED-SCRIPT', 'TXT-MOJIBAKE', 'TXT-PHP-ERROR', 'TXT-PLACEHOLDER', 'TXT-SHORTCODE', 'TXT-UNRENDERED']);
  expect(links).toContain(`${base}/missing-page/`);
});
