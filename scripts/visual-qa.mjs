import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from '../lib/env.mjs';
import { normalizePlan, newRunId } from '../lib/plan.mjs';
import { aggregateRun } from '../lib/aggregate.mjs';
import { applyReview, scanVerdict } from '../lib/review.mjs';
import { mergeFindings } from '../lib/findings.mjs';
import { renderReport } from '../lib/report.mjs';
import { checkUrl } from '../lib/safe-url.mjs';
import { followRedirects } from '../lib/link-check.mjs';

const [command, target, ...rest] = process.argv.slice(2);
const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const runsRoot = () => process.env.QA_RUNS_DIR || path.join('qa', 'runs');

function fail(message, code = 2) {
  console.error(`✗ ${message}`);
  process.exit(code);
}

// One GET of the home page, following redirects by hand without ever
// requesting another origin. Returns that origin when the site sends every
// visitor there (http -> https, apex -> www): the read-only guard and the URL
// filter are keyed to QA_BASE_URL, so scanning would be meaningless. A network
// error returns null; the scan itself reports the site as unreachable.
async function redirectedOrigin(baseUrl) {
  try {
    const result = await followRedirects(baseUrl, {
      hop: async (url) => {
        const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
        await res.body?.cancel();
        return { status: res.status, location: res.headers.get('location') };
      },
      allow: (url) => {
        const check = checkUrl(url, { baseUrl });
        return check.allowed ? true : check.reason;
      },
    });
    return result.refused && result.reason === 'external' ? new URL(result.refused).origin : null;
  } catch {
    return null;
  }
}

async function run(planPath) {
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
  const movedTo = await redirectedOrigin(plan.baseUrl);
  if (movedTo) fail(`site redirects to ${movedTo}; set QA_BASE_URL to it`);

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

function finalize(runDir) {
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const detectionsFile = path.join(runDir || '', 'detections.json');
  if (!runDir || !fs.existsSync(detectionsFile)) fail(`No detections.json in ${runDir}. Run the scan first.`);
  const summary = read(detectionsFile);
  const plan = read(path.join(runDir, 'plan.json'));
  const reviewFile = path.join(runDir, 'review.json');
  const review = fs.existsSync(reviewFile) ? read(reviewFile) : null;
  const applied = applyReview(summary, review);
  const result = scanVerdict(summary, applied);
  const now = new Date().toISOString();

  let findingIds = [];
  if (applied.confirmed.length) {
    const storeFile = process.env.QA_FINDINGS_FILE || path.join('qa', 'findings.json');
    const merged = mergeFindings(read(storeFile), applied.confirmed, { runId: summary.runId, now });
    fs.writeFileSync(storeFile, `${JSON.stringify(merged.store, null, 2)}\n`);
    findingIds = merged.touched;
  }

  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify({
    runId: summary.runId, verdict: result.verdict, reasons: result.reasons, coverage: summary.coverage,
    confirmed: applied.confirmed.length, rejected: applied.rejected.length, undecided: applied.undecided,
    findings: findingIds, reviewed: Boolean(review), finalizedAt: now,
  }, null, 2));
  fs.writeFileSync(path.join(runDir, 'report.md'), renderReport({ plan, summary, applied, result, findingIds }));

  console.log(`Verdict: ${result.verdict}`);
  for (const r of result.reasons) console.log(`  ${r}`);
  console.log(`Report: ${path.join(runDir, 'report.md')}`);
}

loadEnvFile(option('--env') || '.env.qa');
if (command === 'run') await run(target);
else if (command === 'finalize') finalize(target);
else fail('Usage: node scripts/visual-qa.mjs run <plan.json> [--dry-run] [--env <file>] | finalize <run-dir> [--env <file>]');
