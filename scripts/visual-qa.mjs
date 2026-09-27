import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from '../lib/env.mjs';
import { normalizePlan, newRunId } from '../lib/plan.mjs';
import { aggregateRun } from '../lib/aggregate.mjs';

const [command, target, ...rest] = process.argv.slice(2);
const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const runsRoot = () => process.env.QA_RUNS_DIR || path.join('qa', 'runs');

function fail(message, code = 2) {
  console.error(`✗ ${message}`);
  process.exit(code);
}

function run(planPath) {
  if (!planPath || !fs.existsSync(planPath)) fail(`Plan file not found: ${planPath}`);
  const baseUrl = process.env.QA_BASE_URL;
  if (!baseUrl) fail('QA_BASE_URL is not set. Copy config/wordpress-qa.example.env to .env.qa and fill it in.');
  const input = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const runId = input.runId || newRunId(input.mode || 'scan');
  const { ok, errors, plan } = normalizePlan({ ...input, runId }, { baseUrl });
  if (!ok) {
    errors.forEach((e) => console.error(`✗ ${e}`));
    process.exit(2);
  }
  console.log(`Run ${runId}: ${plan.pages.length} pages × ${plan.viewports.length} viewports = ${plan.pages.length * plan.viewports.length} checks (${plan.mode}, ${plan.audience})`);
  for (const p of plan.pages) console.log(`  ${p.url}`);
  if (rest.includes('--dry-run')) return;
  if (plan.audience === 'admin' && !fs.existsSync('.auth/admin.json')) fail('audience "admin" needs .auth/admin.json — run node scripts/wp-inventory.mjs first.');

  const runDir = path.resolve(runsRoot(), runId);
  fs.mkdirSync(runDir, { recursive: true });
  const planFile = path.join(runDir, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));

  const args = ['playwright', 'test', '--project=visual', '--reporter=list,json', `--workers=${process.env.QA_SCAN_WORKERS || 2}`,
    `--update-snapshots=${plan.mode === 'baseline' ? 'all' : 'none'}`];
  spawnSync('npx', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, QA_SCAN_PLAN: planFile, QA_RUN_DIR: runDir, PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(runDir, 'playwright-results.json') },
  });

  const summary = aggregateRun(runDir, plan);
  fs.writeFileSync(path.join(runDir, 'detections.json'), JSON.stringify(summary, null, 2));
  console.log(`\nCoverage: ${summary.coverage.status} (${summary.coverage.scanned}/${summary.coverage.planned})`);
  for (const m of summary.coverage.missing) console.log(`  not scanned: ${m.key} — ${m.error}`);
  for (const [id, n] of Object.entries(summary.byId)) console.log(`  ${id}: ${n}`);
  for (const c of summary.compare) console.log(`  compare ${c.key}: ${c.status}`);
  console.log(`Run directory: ${runDir}`);
  process.exit(summary.coverage.status === 'BLOCKED' ? 1 : 0);
}

loadEnvFile(option('--env') || '.env.qa');
if (command === 'run') run(target);
else fail('Usage: node scripts/visual-qa.mjs run <plan.json> [--dry-run] [--env <file>] | finalize <run-dir> [--env <file>]');
