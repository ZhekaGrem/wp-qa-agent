export function countResults(report) {
  const counts = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  const walk = (suite) => {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        if (t.status === 'expected') counts.passed++;
        else if (t.status === 'unexpected') counts.failed++;
        else if (t.status === 'flaky') counts.flaky++;
        else if (t.status === 'skipped') counts.skipped++;
      }
    }
    for (const child of suite.suites || []) walk(child);
  };
  for (const suite of report.suites || []) walk(suite);
  return counts;
}

export function playwrightStatus({ exitCode, counts }) {
  if (!counts) return exitCode === 0 ? 'NO_RESULTS' : 'ERROR';
  if (counts.passed + counts.failed + counts.flaky === 0) return 'NO_TESTS_EXECUTED';
  if (counts.failed > 0) return 'FAILED';
  return 'PASSED';
}

export function toolStatus(result) {
  if (!result) return 'SKIPPED';
  if (result.error) return 'ERROR';
  return result.status === 0 ? 'PASSED' : 'FAILED';
}

export function environmentStatus(declared) {
  const value = String(declared || '').toLowerCase();
  if (['local', 'development', 'dev', 'staging', 'test'].includes(value)) return 'DECLARED_NON_PRODUCTION';
  if (value === 'production') return 'PRODUCTION_READ_ONLY';
  return 'REVIEW';
}

export function runVerdict({ mode, environment, playwright, codeQuality, phpUnit }) {
  const statuses = [playwright.status, codeQuality.status, phpUnit.status];
  if (statuses.includes('FAILED')) return 'FAIL';
  if (statuses.some((s) => ['ERROR', 'NO_TESTS_EXECUTED', 'NO_RESULTS'].includes(s))) return 'BLOCKED';
  if (playwright.status !== 'PASSED') return 'BLOCKED';
  if (mode === 'update' || environment.status === 'REVIEW') return 'REVIEW';
  return 'PASS';
}
