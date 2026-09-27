import test from 'node:test';
import assert from 'node:assert/strict';
import { countResults, playwrightStatus, toolStatus, environmentStatus, runVerdict } from '../../lib/run-verdict.mjs';

const env = (status) => ({ status });
const base = { mode: 'fast', environment: env('DECLARED_NON_PRODUCTION'), codeQuality: { status: 'SKIPPED' }, phpUnit: { status: 'SKIPPED' } };

test('countResults walks nested describe suites', () => {
  const report = { suites: [{ specs: [{ tests: [{ status: 'expected' }] }], suites: [{ specs: [{ tests: [{ status: 'unexpected' }, { status: 'flaky' }, { status: 'skipped' }] }] }] }] };
  assert.deepEqual(countResults(report), { passed: 1, failed: 1, flaky: 1, skipped: 1 });
});

test('regression: Playwright crashed with no JSON report is not PASS', () => {
  const status = playwrightStatus({ exitCode: 1, counts: null });
  assert.equal(status, 'ERROR');
  assert.equal(runVerdict({ ...base, playwright: { status } }), 'BLOCKED');
});

test('zero executed tests is BLOCKED, not PASS', () => {
  const status = playwrightStatus({ exitCode: 0, counts: { passed: 0, failed: 0, flaky: 0, skipped: 3 } });
  assert.equal(status, 'NO_TESTS_EXECUTED');
  assert.equal(runVerdict({ ...base, playwright: { status } }), 'BLOCKED');
});

test('a failed test is FAIL', () => {
  const status = playwrightStatus({ exitCode: 1, counts: { passed: 2, failed: 1, flaky: 0, skipped: 0 } });
  assert.equal(runVerdict({ ...base, playwright: { status } }), 'FAIL');
});

test('passing tests on a declared non-production target is PASS', () => {
  assert.equal(runVerdict({ ...base, playwright: { status: 'PASSED' } }), 'PASS');
});

test('undeclared environment or update mode caps the verdict at REVIEW', () => {
  assert.equal(runVerdict({ ...base, environment: env('REVIEW'), playwright: { status: 'PASSED' } }), 'REVIEW');
  assert.equal(runVerdict({ ...base, mode: 'update', playwright: { status: 'PASSED' } }), 'REVIEW');
});

test('toolStatus uses the exit code instead of assuming success', () => {
  assert.equal(toolStatus(null), 'SKIPPED');
  assert.equal(toolStatus({ status: 0 }), 'PASSED');
  assert.equal(toolStatus({ status: 1 }), 'FAILED');
  assert.equal(toolStatus({ error: new Error('ENOENT') }), 'ERROR');
  assert.equal(runVerdict({ ...base, codeQuality: { status: 'FAILED' }, playwright: { status: 'PASSED' } }), 'FAIL');
});

test('environmentStatus trusts only an explicit declaration', () => {
  assert.equal(environmentStatus('staging'), 'DECLARED_NON_PRODUCTION');
  assert.equal(environmentStatus('production'), 'PRODUCTION_READ_ONLY');
  assert.equal(environmentStatus(undefined), 'REVIEW');
  assert.equal(environmentStatus('dev-shop'), 'REVIEW');
});
