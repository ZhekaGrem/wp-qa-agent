import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeRecord, aggregateRun } from '../../lib/aggregate.mjs';
import { diffText } from '../../lib/text-diff.mjs';

const plan = {
  runId: 'r1', mode: 'scan', request: 'check',
  viewports: [360],
  pages: [{ url: 'https://s.test/a/', slug: 'a' }, { url: 'https://s.test/b/', slug: 'b' }],
};
const record = (page, detections) => ({ page, viewport: 360, key: '', screenshot: 'screenshots/x.png', detections, compare: null });
const link = { id: 'NET-BROKEN-LINK', severity: 'medium', message: 'Link returns HTTP 404', selector: '', match: '404', evidence: 'https://s.test/missing/' };

test('complete coverage, sequential refs, broken links counted once per run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpqa-agg-'));
  writeRecord(dir, 'a@360', record('https://s.test/a/', [link, { ...link, id: 'TXT-SHORTCODE', evidence: '[x_y]' }]));
  writeRecord(dir, 'b@360', record('https://s.test/b/', [link]));
  const s = aggregateRun(dir, plan);
  assert.equal(s.coverage.status, 'COMPLETE');
  assert.equal(s.coverage.scanned, 2);
  assert.deepEqual(s.detections.map((d) => d.ref), ['D1', 'D2']);
  assert.deepEqual(s.byId, { 'NET-BROKEN-LINK': 1, 'TXT-SHORTCODE': 1 });
});

test('a missing or failed record makes coverage INCOMPLETE; none at all is BLOCKED', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpqa-agg-'));
  writeRecord(dir, 'a@360', record('https://s.test/a/', []));
  writeRecord(dir, 'b@360', { page: 'https://s.test/b/', viewport: 360, screenshot: null, detections: [], error: 'net::ERR_CONNECTION_REFUSED' });
  const s = aggregateRun(dir, plan);
  assert.equal(s.coverage.status, 'INCOMPLETE');
  assert.deepEqual(s.coverage.missing, [{ key: 'b@360', page: 'https://s.test/b/', viewport: 360, error: 'net::ERR_CONNECTION_REFUSED' }]);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wpqa-agg-'));
  assert.equal(aggregateRun(empty, plan).coverage.status, 'BLOCKED');
});

test('diffText compares text blocks as multisets', () => {
  assert.deepEqual(diffText(['a', 'b', 'b'], ['b', 'c']), { added: ['c'], removed: ['a', 'b'], addedCount: 1, removedCount: 2 });
});

test('the same detection at several viewports is merged into one, listing every viewport and screenshot', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpqa-agg-'));
  const two = { ...plan, viewports: [360, 768], pages: [plan.pages[0]] };
  const shortcode = { id: 'TXT-SHORTCODE', severity: 'medium', message: 'Unrendered shortcode is visible', selector: 'main > p', match: '[x_y]', evidence: 'text [x_y]' };
  const overflow = (px) => ({ id: 'VIS-OVERFLOW-X', severity: 'medium', message: 'overflow', selector: '.wide', match: '', evidence: `right=${px}` });
  writeRecord(dir, 'a@360', { page: 'https://s.test/a/', viewport: 360, screenshot: 'screenshots/a@360.png', detections: [shortcode, overflow(500)], compare: null });
  writeRecord(dir, 'a@768', { page: 'https://s.test/a/', viewport: 768, screenshot: 'screenshots/a@768.png', detections: [shortcode, overflow(900)], compare: null });
  const s = aggregateRun(dir, two);
  const merged = s.detections.filter((d) => d.id === 'TXT-SHORTCODE');
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].viewports, [360, 768]);
  assert.deepEqual(merged[0].screenshots, ['screenshots/a@360.png', 'screenshots/a@768.png']);
  assert.equal(merged[0].viewport, 360);
  assert.equal(merged[0].screenshot, 'screenshots/a@360.png');
  // Different evidence (layout numbers differ per width) stays separate.
  assert.equal(s.detections.filter((d) => d.id === 'VIS-OVERFLOW-X').length, 2);
  assert.deepEqual(s.detections.map((d) => d.ref), ['D1', 'D2', 'D3']);
  assert.deepEqual(s.byId, { 'TXT-SHORTCODE': 1, 'VIS-OVERFLOW-X': 2 });
});
