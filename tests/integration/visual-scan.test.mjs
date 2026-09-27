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

// Reads the record of one page × viewport through the run's own plan, so the
// test does not depend on how page slugs are derived.
function readRecord(dirs, runId, pagePath, width) {
  const plan = JSON.parse(fs.readFileSync(path.join(dirs.runs, runId, 'plan.json'), 'utf8'));
  const page = plan.pages.find((p) => new URL(p.url).pathname === pagePath);
  const file = path.join(dirs.runs, runId, 'records', `${page.slug}@${width}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
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
  // The blocked navigations must never actually replace the document being
  // scanned: the captured text has to be nav-trap.html's own content, not an
  // empty capture of whatever Chromium showed after the block.
  const text = JSON.parse(fs.readFileSync(path.join(dirs.runs, 'trap-1', 'text', 'nav-trap@360.json'), 'utf8'));
  assert.equal(text.title, 'Nav trap');
  assert.equal(text.lang, 'en');
  assert.ok(text.blocks.some((b) => b.text.includes('Nav trap')), JSON.stringify(text.blocks));
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

test('finalize: undecided -> REVIEW, then a confirmed shortcode -> FAIL with one finding for all viewports', async (t) => {
  const wp = createFakeWp();
  const url = await wp.start();
  t.after(() => wp.stop());
  const dirs = { runs: tmp('wpqa-runs-'), baselines: tmp('wpqa-base-') };
  const { summary } = await scan(url, { runId: 'fin-1', request: 'перевір текст', pages: ['/text-defects/'], viewports: [360, 1366], checkLinks: false }, dirs);
  // The same text defect seen at two widths is one detection listing both.
  const shortcodes = summary.detections.filter((d) => d.id === 'TXT-SHORTCODE');
  assert.equal(shortcodes.length, 1, JSON.stringify(shortcodes));
  assert.deepEqual(shortcodes[0].viewports, [360, 1366]);
  assert.equal(shortcodes[0].screenshots.length, 2);
  const runDir = path.join(dirs.runs, 'fin-1');
  const findingsFile = path.join(tmp('wpqa-findings-'), 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify({ version: 1, updatedAt: '', findings: [] }));
  const finalize = () => runProcess('node', ['scripts/visual-qa.mjs', 'finalize', runDir, '--env', path.join(dirs.runs, 'none.env')], { env: { QA_FINDINGS_FILE: findingsFile } });

  await finalize();
  assert.equal(JSON.parse(fs.readFileSync(path.join(runDir, 'summary.json'), 'utf8')).verdict, 'REVIEW');

  const shortcode = summary.detections.find((d) => d.id === 'TXT-SHORTCODE');
  const decisions = summary.detections.map((d) => ({ ref: d.ref, decision: d.ref === shortcode.ref ? 'confirmed' : 'rejected', reason: 'test' }));
  fs.writeFileSync(path.join(runDir, 'review.json'), JSON.stringify({ decisions }));
  await finalize();
  const final = JSON.parse(fs.readFileSync(path.join(runDir, 'summary.json'), 'utf8'));
  assert.equal(final.verdict, 'FAIL');
  const store = JSON.parse(fs.readFileSync(findingsFile, 'utf8'));
  assert.equal(store.findings.length, 1);
  assert.equal(store.findings[0].status, 'OPEN');
  assert.match(fs.readFileSync(path.join(runDir, 'report.md'), 'utf8'), /\*\*Вердикт:\*\* `FAIL`/);
});

test('a redirect to a refused URL is never followed, by the link checker or by the page', async (t) => {
  const wp = createFakeWp();
  const url = await wp.start();
  t.after(() => wp.stop());
  const dirs = { runs: tmp('wpqa-runs-'), baselines: tmp('wpqa-base-') };
  const { output, summary } = await scan(url, { runId: 'redir-1', pages: ['/redirect-link/', '/go/'], viewports: [360] }, dirs);
  assert.ok(summary, output);
  assert.ok(wp.hits.every((h) => !/add-to-cart/.test(h)), wp.hits.join('\n'));
  // The planned /go/ page ends either not scanned or scanned with the redirect listed as blocked.
  const go = readRecord(dirs, 'redir-1', '/go/', 360);
  const missing = summary.coverage.missing.find((m) => m.page === `${url}/go/`);
  assert.ok(missing || go.blocked.some((b) => b.includes('add-to-cart')), JSON.stringify({ missing, go }));
  if (missing) assert.match(missing.error, /add-to-cart/);
  // The link is neither reported as broken nor followed.
  assert.ok(!summary.detections.some((d) => d.id === 'NET-BROKEN-LINK' && d.evidence.includes('/go/')), JSON.stringify(summary.detections));
  // Links with a query string are skipped, the refused redirect counts as skipped, the 404 is checked.
  const record = readRecord(dirs, 'redir-1', '/redirect-link/', 360);
  assert.deepEqual(record.linkCheck, { checked: 1, skipped: 2, budgetExhausted: false });
  assert.ok(wp.hits.every((h) => !h.includes('ref=menu')), wp.hits.join('\n'));
  assert.ok(summary.detections.some((d) => d.id === 'NET-BROKEN-LINK' && d.evidence === `${url}/missing-page/`));
});

test('a page script POST to another origin never leaves the browser', async (t) => {
  const wp = createFakeWp();
  const collector = createFakeWp();
  const url = await wp.start();
  wp.setCollector(await collector.start());
  t.after(() => Promise.all([wp.stop(), collector.stop()]));
  const dirs = { runs: tmp('wpqa-runs-'), baselines: tmp('wpqa-base-') };
  const { status, output } = await scan(url, { runId: 'xpost-1', pages: ['/cross-post/'], viewports: [360], checkLinks: false }, dirs);
  assert.equal(status, 0, output);
  assert.ok(collector.hits.every((h) => !h.startsWith('POST')), collector.hits.join('\n'));
  const record = readRecord(dirs, 'xpost-1', '/cross-post/', 360);
  assert.ok(record.blocked.some((b) => b === `POST ${collector.url}/collect`), record.blocked.join('\n'));
});

test('a base URL that redirects to another host stops the run before anything is scanned', async (t) => {
  const wp = createFakeWp({ canonicalHost: 'localhost' });
  const url = await wp.start();
  t.after(() => wp.stop());
  const dirs = { runs: tmp('wpqa-runs-'), baselines: tmp('wpqa-base-') };
  const { status, output, summary } = await scan(url, { runId: 'canon-1', pages: ['/clean/'], viewports: [360] }, dirs);
  assert.equal(status, 2, output);
  const port = new URL(url).port;
  assert.match(output, new RegExp(`site redirects to http://localhost:${port}; set QA_BASE_URL to it`));
  assert.equal(summary, null);
  assert.deepEqual(wp.hits, ['GET /']);
});

test('the scanner\'s own blocked POST is not reported as a console error and never reaches the server', async (t) => {
  const wp = createFakeWp();
  const url = await wp.start();
  t.after(() => wp.stop());
  const dirs = { runs: tmp('wpqa-runs-'), baselines: tmp('wpqa-base-') };
  const { status, output, summary } = await scan(url, { runId: 'frag-1', pages: ['/cart-fragments/'], viewports: [360], checkLinks: false }, dirs);
  assert.equal(status, 0, output);
  assert.ok(wp.hits.every((h) => !h.startsWith('POST')), wp.hits.join('\n'));
  const record = readRecord(dirs, 'frag-1', '/cart-fragments/', 360);
  assert.ok(record.blocked.some((b) => b.startsWith('POST ') && b.includes('wc-ajax=get_refreshed_fragments')), record.blocked.join('\n'));
  assert.deepEqual(summary.detections.filter((d) => d.id === 'NET-CONSOLE-ERROR'), []);
});
