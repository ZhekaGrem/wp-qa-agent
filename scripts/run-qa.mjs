import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { loadEnvFile } from '../lib/env.mjs';
import { countResults, playwrightStatus, toolStatus, environmentStatus, runVerdict } from '../lib/run-verdict.mjs';

loadEnvFile('.env.qa');

const mode = process.argv[2] || 'fast'; // fast | update | full | plan | cleanup
const validModes = ['fast', 'update', 'full', 'plan', 'cleanup'];
if (!validModes.includes(mode)) {
  console.error(`Invalid mode: ${mode}. Valid modes: ${validModes.join(', ')}`);
  process.exit(1);
}

// Modes without an implementation say so and exit before creating a run
// directory, so no run artifact can suggest that work happened.
if (mode === 'cleanup') {
  console.log('Fixture cleanup is not implemented in this script: nothing was deleted.');
  console.log('Remove fixtures through the wordpress-fixture-manager skill, which records fixture IDs and asks for confirmation.');
  process.exit(2);
}
if (mode === 'plan') {
  console.log('Planner mode is not implemented in this script: no plan was generated.');
  console.log('Use the playwright-test-planner skill (or /wordpress-qa) to explore the site and generate specs.');
  process.exit(2);
}

const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const runId = `${timestamp}-wp-qa-${mode}`;
const runDir = path.join(process.cwd(), 'qa', 'runs', runId);
const rawDir = path.join(runDir, 'raw');
fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });
fs.mkdirSync(path.join(runDir, 'traces'), { recursive: true });

console.log(`========================================`);
console.log(` Starting QA Run: ${runId}`);
console.log(` Mode: ${mode.toUpperCase()}`);
console.log(` Output: qa/runs/${runId}/`);
console.log(`========================================\n`);

const target = process.env.QA_BASE_URL || 'http://localhost:9400';
const runSummary = {
  runId,
  mode,
  startedAt: new Date().toISOString(),
  environment: { status: environmentStatus(process.env.QA_ENVIRONMENT), declared: process.env.QA_ENVIRONMENT || null, target },
  fixtures: { status: 'SKIPPED' },
  codeQuality: { status: 'SKIPPED' },
  phpUnit: { status: 'SKIPPED' },
  playwright: { status: 'SKIPPED', passed: 0, failed: 0, flaky: 0, skipped: 0 },
  stateVerification: { status: 'SKIPPED', checked: 0, note: 'Not automated in this script; use the wordpress-state-verifier skill.' },
  accessibility: { status: 'NOT_IMPLEMENTED' },
  findings: [],
  verdict: 'PENDING',
};
if (mode === 'update') {
  runSummary.updateChecks = { status: 'NOT_IMPLEMENTED', note: 'Version snapshot and visual comparison are not automated here; use /wp-check baseline and compare.' };
}

console.log('--- Step 1: Environment ---');
console.log(`Environment: ${runSummary.environment.status} (QA_ENVIRONMENT=${runSummary.environment.declared ?? 'unset'}) for ${target}`);

if (mode === 'full') {
  console.log('\n--- Step 2: Code Quality Preflight ---');
  const phpcs = 'vendor/bin/phpcs';
  runSummary.codeQuality.status = fs.existsSync(phpcs)
    ? toolStatus(spawnSync(phpcs, ['--standard=WordPress', '--report=json', `--report-file=${path.join(rawDir, 'phpcs.json')}`, '.'], { stdio: 'inherit' }))
    : 'SKIPPED';

  console.log('\n--- Step 3: PHPUnit Tests ---');
  const phpunit = 'vendor/bin/phpunit';
  runSummary.phpUnit.status = fs.existsSync(phpunit)
    ? toolStatus(spawnSync(phpunit, [`--log-junit=${path.join(rawDir, 'junit.xml')}`], { stdio: 'inherit' }))
    : 'SKIPPED';
}

console.log(`\n--- Step ${mode === 'full' ? '4' : '2'}: Executing Playwright Tests ---`);
const pwResultFile = path.join(runDir, 'playwright-results.json');
const res = spawnSync('npx', ['playwright', 'test', '--project=chromium-desktop', '--project=chromium-mobile', '--reporter=list,json'], {
  env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: pwResultFile },
  stdio: 'inherit',
  shell: true,
});
let counts = null;
if (fs.existsSync(pwResultFile)) {
  try {
    counts = countResults(JSON.parse(fs.readFileSync(pwResultFile, 'utf8')));
  } catch {
    counts = null;
  }
}
runSummary.playwright = { status: playwrightStatus({ exitCode: res.status, counts }), ...(counts || { passed: 0, failed: 0, flaky: 0, skipped: 0 }) };
console.log(`Playwright: ${runSummary.playwright.status} (${runSummary.playwright.passed} passed, ${runSummary.playwright.failed} failed, ${runSummary.playwright.flaky} flaky)`);

if (process.env.QA_CLEANUP_FIXTURES === 'true') {
  console.log('\nFixture cleanup is not implemented in this script: nothing was deleted.');
  runSummary.fixtures.cleanup = 'NOT_IMPLEMENTED';
}

runSummary.verdict = runVerdict(runSummary);
runSummary.completedAt = new Date().toISOString();
fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(runSummary, null, 2));

const nextActions = {
  PASS: '- All executed checks passed.',
  FAIL: '- Investigate failing checks and classify each one (PRODUCT_BUG / TEST_BUG / ENVIRONMENT_FAILURE).',
  BLOCKED: '- The run produced no trustworthy result (no tests executed or a tool crashed). Fix the setup and run again.',
  REVIEW: '- A human has to review: QA_ENVIRONMENT is not declared, or update-specific checks are not automated in this script.',
};
const updateRow = runSummary.updateChecks ? `| Update checks | ${runSummary.updateChecks.status} | ${runSummary.updateChecks.note} |\n` : '';
const reportMd = `# QA Run Report: ${runId}

- **Mode:** ${mode.toUpperCase()}
- **Verdict:** ${runSummary.verdict}
- **Target:** ${target}
- **Date:** ${runSummary.completedAt}

## Overview

| Component | Status | Details |
|---|---|---|
| Environment | ${runSummary.environment.status} | QA_ENVIRONMENT=${runSummary.environment.declared ?? 'unset'} |
| Code Quality | ${runSummary.codeQuality.status} | PHPCS (only when vendor/bin/phpcs exists) |
| PHPUnit | ${runSummary.phpUnit.status} | Only when vendor/bin/phpunit exists |
| Playwright E2E | ${runSummary.playwright.status} | Passed: ${runSummary.playwright.passed}, Failed: ${runSummary.playwright.failed}, Flaky: ${runSummary.playwright.flaky} |
| State Verification | ${runSummary.stateVerification.status} | ${runSummary.stateVerification.note} |
${updateRow}
## Next Actions

${nextActions[runSummary.verdict]}
`;
fs.writeFileSync(path.join(runDir, 'report.md'), reportMd);

console.log(`\n========================================`);
console.log(` Run Completed: ${runSummary.verdict}`);
console.log(` Core Manifest: qa/runs/${runId}/run.json`);
console.log(` Report Summary: qa/runs/${runId}/report.md`);
console.log(`========================================\n`);
process.exit(runSummary.verdict === 'PASS' ? 0 : 1);
