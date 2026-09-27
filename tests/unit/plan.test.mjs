import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlan, pageSlug, viewportSize, newRunId, DEFAULT_VIEWPORTS } from '../../lib/plan.mjs';

const baseUrl = 'https://site.test';

test('defaults: scan, visitor, four viewports, links checked', () => {
  const { ok, plan } = normalizePlan({ runId: 'r1', pages: ['/'] }, { baseUrl });
  assert.equal(ok, true);
  assert.equal(plan.mode, 'scan');
  assert.equal(plan.audience, 'visitor');
  assert.deepEqual(plan.viewports, DEFAULT_VIEWPORTS);
  assert.deepEqual(DEFAULT_VIEWPORTS, [360, 768, 1366, 1920]);
  assert.equal(plan.checkLinks, true);
  assert.equal(plan.baseUrl, 'https://site.test/');
  assert.equal(plan.host, 'site.test');
  assert.deepEqual(plan.pages, [{ url: 'https://site.test/', label: '/', slug: 'home' }]);
});

test('mutating or foreign pages are refused with a reason', () => {
  const { ok, errors } = normalizePlan({ pages: ['/?add-to-cart=5', 'https://evil.test/'] }, { baseUrl });
  assert.equal(ok, false);
  assert.deepEqual(errors, [
    'page /?add-to-cart=5 refused: mutating-param:add-to-cart',
    'page https://evil.test/ refused: external',
    'plan has no pages',
  ]);
});

test('admin audience may include allow-listed wp-admin pages only', () => {
  assert.equal(normalizePlan({ audience: 'admin', pages: ['/wp-admin/plugins.php'] }, { baseUrl }).ok, true);
  assert.equal(normalizePlan({ audience: 'admin', pages: ['/wp-admin/options.php'] }, { baseUrl }).ok, false);
});

test('invalid mode and viewports are reported', () => {
  const { errors } = normalizePlan({ mode: 'fix', viewports: [100], pages: ['/'] }, { baseUrl });
  assert.deepEqual(errors, ['mode must be one of scan, baseline, compare', 'viewports must be integers between 280 and 3840']);
});

test('slugs are ascii and unique within a plan', () => {
  assert.equal(pageSlug('https://s.test/'), 'home');
  assert.equal(pageSlug('https://s.test/contacts/'), 'contacts');
  assert.equal(pageSlug('https://s.test/shop/?orderby=price'), 'shop-orderby-price');
  const { plan } = normalizePlan({ pages: ['/a-b/', '/a_b/'] }, { baseUrl });
  assert.deepEqual(plan.pages.map((p) => p.slug), ['a-b', 'a-b-2']);
});

test('a run id that could escape the runs directory is refused', () => {
  for (const runId of ['../evil', 'a/b', 'a\\b', '..', '.', 'x y', '']) {
    const { ok, errors } = normalizePlan({ runId, pages: ['/'] }, { baseUrl });
    assert.equal(ok, false, runId);
    assert.deepEqual(errors, ['runId must match ^[\\w.-]+$ and not be only dots'], runId);
  }
  assert.equal(normalizePlan({ runId: '20260927T100000Z-scan.v2', pages: ['/'] }, { baseUrl }).ok, true);
});

test('viewport heights and run ids', () => {
  assert.deepEqual(viewportSize(360), { width: 360, height: 740 });
  assert.deepEqual(viewportSize(1000), { width: 1000, height: 625 });
  assert.match(newRunId('scan'), /^\d{8}T\d{6}Z-scan$/);
});
