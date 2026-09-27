import test from 'node:test';
import assert from 'node:assert/strict';
import { applyReview, scanVerdict } from '../../lib/review.mjs';

const det = (ref, id = 'TXT-SHORTCODE', selector = 'footer > p') => ({ ref, id, severity: 'medium', message: 'Unrendered shortcode is visible', selector, match: '[x_y]', evidence: 'text [x_y]', page: 'https://s.test/a/', viewport: 360, screenshot: 'screenshots/a@360.png' });
const summary = (over = {}) => ({ coverage: { planned: 2, scanned: 2, missing: [], status: 'COMPLETE' }, detections: [det('D1'), det('D2', 'VIS-OVERFLOW-X', '.carousel')], compare: [], ...over });
const verdict = (s, r) => scanVerdict(s, applyReview(s, r)).verdict;

test('a confirmed detection is FAIL and becomes a normalised defect', () => {
  const s = summary();
  const applied = applyReview(s, { decisions: [{ ref: 'D1', decision: 'confirmed', reason: 'form missing' }, { ref: 'D2', decision: 'rejected', reason: 'carousel' }] });
  assert.equal(scanVerdict(s, applied).verdict, 'FAIL');
  assert.equal(applied.confirmed.length, 1);
  assert.equal(applied.confirmed[0].area, 'content');
  assert.match(applied.confirmed[0].testId, /^TXT-SHORTCODE@\/a\/@360@[0-9a-f]{8}$/);
  assert.deepEqual(applied.rejected, [{ ref: 'D2', id: 'VIS-OVERFLOW-X', page: 'https://s.test/a/', viewport: 360, reason: 'carousel' }]);
});

test('without a review every detection is undecided -> REVIEW', () => {
  assert.equal(verdict(summary(), undefined), 'REVIEW');
});

test('all rejected on complete coverage -> PASS', () => {
  assert.equal(verdict(summary(), { decisions: [{ ref: 'D1', decision: 'rejected', reason: 'x' }, { ref: 'D2', decision: 'rejected', reason: 'y' }] }), 'PASS');
});

test('BLOCKED wins; INCOMPLETE caps at REVIEW; confirmed defects still FAIL on partial coverage', () => {
  const blocked = summary({ coverage: { planned: 2, scanned: 0, missing: [], status: 'BLOCKED' }, detections: [] });
  assert.equal(verdict(blocked, {}), 'BLOCKED');
  const partial = summary({ coverage: { planned: 2, scanned: 1, missing: [{ key: 'b@360' }], status: 'INCOMPLETE' } });
  assert.equal(verdict(partial, { decisions: [{ ref: 'D1', decision: 'rejected' }, { ref: 'D2', decision: 'rejected' }] }), 'REVIEW');
  assert.equal(verdict(partial, { decisions: [{ ref: 'D1', decision: 'confirmed' }, { ref: 'D2', decision: 'rejected' }] }), 'FAIL');
});

test('compare: unreviewed change and missing baseline -> REVIEW; expected -> PASS; regression -> FAIL', () => {
  const s = summary({ detections: [], compare: [{ key: 'home@1366', page: 'https://s.test/', viewport: 1366, status: 'CHANGED' }] });
  assert.equal(verdict(s, {}), 'REVIEW');
  assert.equal(verdict(s, { compareDecisions: [{ key: 'home@1366', decision: 'expected', reason: 'new banner' }] }), 'PASS');
  const applied = applyReview(s, { compareDecisions: [{ key: 'home@1366', decision: 'regression', reason: 'menu wraps' }] });
  assert.equal(scanVerdict(s, applied).verdict, 'FAIL');
  assert.equal(applied.confirmed[0].id, 'CMP-REGRESSION');
  const noBase = summary({ detections: [], compare: [{ key: 'home@1366', page: 'https://s.test/', viewport: 1366, status: 'NO_BASELINE' }] });
  assert.equal(verdict(noBase, {}), 'REVIEW');
});

test('agent findings are defects; testId differs per quote and is stable', () => {
  const s = summary({ detections: [] });
  const r = { agentFindings: [
    { id: 'AGT-TYPO', page: 'https://s.test/a/', viewport: 1366, title: 'typo 1', quote: 'адрес' },
    { id: 'AGT-TYPO', page: 'https://s.test/a/', viewport: 1366, title: 'typo 2', quote: 'сдесь' },
  ] };
  const a = applyReview(s, r);
  assert.equal(scanVerdict(s, a).verdict, 'FAIL');
  assert.notEqual(a.confirmed[0].testId, a.confirmed[1].testId);
  assert.equal(applyReview(s, r).confirmed[0].testId, a.confirmed[0].testId);
});

test('a malformed detection decision is treated as undecided, not rejected, and reported as invalid', () => {
  const s = summary();
  const applied = applyReview(s, { decisions: [{ ref: 'D1', decision: 'confirm' }, { ref: 'D2', decision: 'rejected', reason: 'y' }] });
  assert.equal(scanVerdict(s, applied).verdict, 'REVIEW');
  assert.ok(applied.undecided.includes('D1'));
  assert.deepEqual(applied.invalid, [{ ref: 'D1', value: 'confirm' }]);
});

test('a malformed compare decision is treated as unreviewed, not expected, and reported as invalid', () => {
  const s = summary({ detections: [], compare: [{ key: 'home@1366', page: 'https://s.test/', viewport: 1366, status: 'CHANGED' }] });
  const applied = applyReview(s, { compareDecisions: [{ key: 'home@1366', decision: 'fine' }] });
  assert.equal(scanVerdict(s, applied).verdict, 'REVIEW');
  assert.ok(applied.unreviewedChanges.includes('home@1366'));
  assert.deepEqual(applied.invalid, [{ key: 'home@1366', value: 'fine' }]);
});
