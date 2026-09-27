import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from '../../lib/report.mjs';

test('report shows request, verdict, coverage, defects, rejections and gaps', () => {
  const md = renderReport({
    plan: { request: 'перевір контакти', baseUrl: 'https://s.test/', mode: 'scan', audience: 'visitor' },
    summary: { coverage: { planned: 8, scanned: 7, missing: [{ key: 'b@360', error: 'timeout' }], status: 'INCOMPLETE' }, compare: [] },
    applied: {
      confirmed: [{ source: 'detector', id: 'TXT-SHORTCODE', page: 'https://s.test/a/', viewport: 360, severity: 'medium', title: 'Unrendered shortcode is visible', evidence: 'screenshots/a@360.png', actual: '[x_y]' }],
      rejected: [{ ref: 'D2', id: 'VIS-OVERFLOW-X', page: 'https://s.test/a/', viewport: 360, reason: 'carousel' }],
      undecided: [], unreviewedChanges: [], missingBaselines: [],
    },
    result: { verdict: 'FAIL', reasons: ['Підтверджено дефектів: 1.'] },
    findingIds: ['BUG-2026-001'],
  });
  assert.match(md, /\*\*Запит:\*\* перевір контакти/);
  assert.match(md, /\*\*Вердикт:\*\* `FAIL`/);
  assert.match(md, /7\/8/);
  assert.match(md, /Unrendered shortcode is visible/);
  assert.match(md, /carousel/);
  assert.match(md, /b@360 — timeout/);
  assert.match(md, /BUG-2026-001/);
});

test('free text does not inject markdown structure into the report', () => {
  const md = renderReport({
    plan: { request: 'a\nb', baseUrl: 'https://s.test/', mode: 'scan', audience: 'visitor' },
    summary: { coverage: { planned: 1, scanned: 1, missing: [], status: 'COMPLETE' }, compare: [] },
    applied: {
      confirmed: [],
      rejected: [{ ref: 'D2', id: 'VIS-OVERFLOW-X', page: 'https://s.test/a/', viewport: 360, reason: 'ok\n## Injected' }],
      undecided: [], unreviewedChanges: [], missingBaselines: [], invalid: [],
    },
    result: { verdict: 'PASS', reasons: [] },
    findingIds: [],
  });
  assert.ok(!md.split('\n').some((l) => l.startsWith('## Injected')));
  assert.match(md, /ok ## Injected/);
  assert.match(md, /\*\*Запит:\*\* a b/);
});
