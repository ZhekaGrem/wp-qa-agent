import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFakeWp } from '../support/fake-wp.mjs';
import { runProcess } from '../support/run-process.mjs';

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

async function scan(baseUrl, planInput, dirs) {
  const planPath = path.join(tmp('wpqa-plan-'), 'plan-input.json');
  fs.writeFileSync(planPath, JSON.stringify(planInput));
  const result = await runProcess('node', ['scripts/visual-qa.mjs', 'run', planPath, '--env', path.join(dirs.runs, 'none.env')], {
    env: { QA_BASE_URL: baseUrl, QA_RUNS_DIR: dirs.runs, QA_BASELINES_DIR: dirs.baselines },
  });
  const summaryPath = path.join(dirs.runs, planInput.runId, 'detections.json');
  return { ...result, summary: fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf8')) : null };
}

test('scan finds seeded defects, stays quiet on the clean page and never mutates', async (t) => {
  const wp = createFakeWp();
  const url = await wp.start();
  t.after(() => wp.stop());
  const dirs = { runs: tmp('wpqa-runs-'), baselines: tmp('wpqa-base-') };
  const { status, output, summary } = await scan(url, { runId: 'scan-1', pages: ['/text-defects/', '/overflow/', '/clean/', '/server-error/'], viewports: [360, 1366] }, dirs);
  assert.equal(status, 0, output);
  assert.equal(summary.coverage.status, 'COMPLETE');
  assert.equal(summary.coverage.scanned, 8);
  const at = (page, id, width) => summary.detections.some((d) => d.page === `${url}${page}` && d.id === id && (!width || d.viewport === width));
  assert.ok(at('/text-defects/', 'TXT-SHORTCODE'));
  assert.ok(at('/text-defects/', 'NET-BROKEN-LINK'));
  assert.ok(at('/overflow/', 'VIS-OVERFLOW-X', 360));
  assert.ok(!at('/overflow/', 'VIS-OVERFLOW-X', 1366));
  assert.ok(at('/server-error/', 'NET-HTTP-ERROR'));
  assert.deepEqual(summary.detections.filter((d) => d.page === `${url}/clean/`), []);
  assert.ok(fs.existsSync(path.join(dirs.runs, 'scan-1', 'screenshots', 'clean@360.png')));
  assert.ok(wp.hits.every((h) => !/add-to-cart|_wpnonce|logout/.test(h) && !h.startsWith('POST')), wp.hits.join('\n'));
});

test('compare: no baseline -> baseline -> same -> changed', async (t) => {
  const wp = createFakeWp();
  const url = await wp.start();
  t.after(() => wp.stop());
  const dirs = { runs: tmp('wpqa-runs-'), baselines: tmp('wpqa-base-') };
  const plan = (runId, mode) => ({ runId, mode, pages: ['/clean/'], viewports: [1366], checkLinks: false });

  const none = await scan(url, plan('cmp-1', 'compare'), dirs);
  assert.equal(none.summary.compare[0].status, 'NO_BASELINE', none.output);

  const base = await scan(url, plan('cmp-2', 'baseline'), dirs);
  assert.equal(base.summary.compare[0].status, 'BASELINE_SAVED', base.output);

  const same = await scan(url, plan('cmp-3', 'compare'), dirs);
  assert.equal(same.summary.compare[0].status, 'SAME', same.output);

  wp.setVariant('b');
  const changed = await scan(url, plan('cmp-4', 'compare'), dirs);
  assert.equal(changed.summary.compare[0].status, 'CHANGED', changed.output);
  assert.deepEqual(changed.summary.compare[0].text.added, ['Нова акція: безкоштовна доставка.']);
});

test('a script or iframe navigation to a refused URL is aborted in every frame and never hits the server', async (t) => {
  const wp = createFakeWp();
  const url = await wp.start();
  t.after(() => wp.stop());
  const dirs = { runs: tmp('wpqa-runs-'), baselines: tmp('wpqa-base-') };
  const { status, output, summary } = await scan(url, { runId: 'trap-1', pages: ['/nav-trap/'], viewports: [360], checkLinks: false }, dirs);
  assert.equal(status, 0, output);
  assert.equal(summary.coverage.status, 'COMPLETE');
  assert.ok(wp.hits.every((h) => !/add-to-cart|_wpnonce|logout/.test(h)), wp.hits.join('\n'));
  const recordPath = path.join(dirs.runs, 'trap-1', 'records', 'nav-trap@360.json');
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  assert.ok(record.blocked.some((b) => b.startsWith('NAVIGATE ') && b.includes('add-to-cart')), record.blocked.join('\n'));
  assert.ok(record.blocked.some((b) => b.startsWith('NAVIGATE ') && b.includes('logout')), record.blocked.join('\n'));
});

test('a script navigation to an allowed URL is reported as not scanned, not mislabeled', async (t) => {
  const wp = createFakeWp();
  const url = await wp.start();
  t.after(() => wp.stop());
  const dirs = { runs: tmp('wpqa-runs-'), baselines: tmp('wpqa-base-') };
  // A second, unrelated page keeps this plan out of the "nothing scanned at
  // all" BLOCKED case (aggregateRun treats an all-missing run as BLOCKED,
  // same as the unreachable-site test above) so coverage can actually land
  // on the INCOMPLETE status this test is about.
  const { summary } = await scan(url, { runId: 'away-1', pages: ['/nav-away/', '/clean/'], viewports: [360], checkLinks: false }, dirs);
  assert.equal(summary.coverage.status, 'INCOMPLETE');
  const missing = summary.coverage.missing.find((m) => m.key === 'nav-away@360');
  assert.ok(missing, JSON.stringify(summary.coverage.missing));
  assert.match(missing.error, /navigated away to .*\/clean\//);
  assert.deepEqual(summary.detections, []);
});

test('an unreachable site is BLOCKED with exit code 1', async () => {
  const dirs = { runs: tmp('wpqa-runs-'), baselines: tmp('wpqa-base-') };
  const { status, summary } = await scan('http://127.0.0.1:65530', { runId: 'down-1', pages: ['/'], viewports: [360] }, dirs);
  assert.equal(status, 1);
  assert.equal(summary.coverage.status, 'BLOCKED');
  assert.match(summary.coverage.missing[0].error, /ERR_CONNECTION_REFUSED|ECONNREFUSED/);
});
