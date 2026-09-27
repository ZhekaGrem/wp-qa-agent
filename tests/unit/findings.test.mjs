import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFindings } from '../../lib/findings.mjs';

const now = '2026-09-27T10:00:00.000Z';
const item = (testId) => ({ source: 'detector', id: 'TXT-SHORTCODE', testId, area: 'content', severity: 'medium', title: 'Shortcode visible (/a/, 360px)', evidence: 'screenshots/a@360.png', actual: '[x_y]', note: 'form missing' });
const store = (findings) => ({ version: 1, updatedAt: '', findings });

test('new defects get the next BUG id of the year and OPEN status', () => {
  const { store: s, touched } = mergeFindings(store([{ id: 'BUG-2026-004', testId: 'other', status: 'OPEN' }]), [item('T1')], { runId: 'r1', now });
  assert.deepEqual(touched, ['BUG-2026-005']);
  const f = s.findings[1];
  assert.equal(f.status, 'OPEN');
  assert.equal(f.confidence, 'CONFIRMED');
  assert.equal(f.firstSeenRunId, 'r1');
  assert.equal(f.occurrences, 1);
  assert.deepEqual(f.evidence, ['screenshots/a@360.png']);
});

test('a recurring defect updates occurrences; the same run is not counted twice', () => {
  const existing = { id: 'BUG-2026-001', testId: 'T1', status: 'OPEN', occurrences: 1, lastSeenRunId: 'r0' };
  const once = mergeFindings(store([existing]), [item('T1')], { runId: 'r1', now }).store;
  assert.equal(once.findings[0].occurrences, 2);
  const twice = mergeFindings(once, [item('T1')], { runId: 'r1', now }).store;
  assert.equal(twice.findings[0].occurrences, 2);
});

test('verified or closed defects that reappear are REOPENED; WONT_FIX stays', () => {
  for (const status of ['FIXED', 'VERIFIED', 'CLOSED']) {
    const s = mergeFindings(store([{ id: 'BUG-2026-001', testId: 'T1', status, occurrences: 1, lastSeenRunId: 'r0' }]), [item('T1')], { runId: 'r1', now }).store;
    assert.equal(s.findings[0].status, 'REOPENED');
  }
  const w = mergeFindings(store([{ id: 'BUG-2026-001', testId: 'T1', status: 'WONT_FIX', occurrences: 1, lastSeenRunId: 'r0' }]), [item('T1')], { runId: 'r1', now }).store;
  assert.equal(w.findings[0].status, 'WONT_FIX');
  assert.equal(w.findings[0].lastSeenRunId, 'r1');
});

test('merge never produces CLOSED', () => {
  const { store: s } = mergeFindings(store([]), [item('T1'), item('T2')], { runId: 'r1', now });
  assert.ok(s.findings.every((f) => f.status !== 'CLOSED'));
});
