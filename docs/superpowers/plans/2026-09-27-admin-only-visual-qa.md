# Admin-only Visual & Content QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tester who has only a wp-admin login ask, in plain words, for a visual/text check of a WordPress site and get a read-only, evidence-backed verdict — and make the repo's existing docs and scripts stop claiming things the code does not do.

**Architecture:** Two new skills (`wp-admin-access`, `wp-visual-content-qa`) and a `/wp-check` command drive two CLIs: `scripts/wp-inventory.mjs` (login, Site Health, page list) and `scripts/visual-qa.mjs` (`run` → a Playwright Test project that screenshots pages, extracts text and runs deterministic detectors; `finalize` → verdict, findings, report). Detectors are pure modules (Node-side text rules, browser-side DOM probes) tested against HTML fixtures served by a fake WordPress server. The repo becomes a Claude Code plugin so the skills are discoverable.

**Tech Stack:** Node.js ≥ 22 (ESM), `@playwright/test` ^1.56 (Chromium), `node:test`, Claude Code plugin manifest.

**Spec:** `docs/superpowers/specs/2026-09-27-admin-only-visual-qa-design.md`

## Global Constraints

- Node.js `>=22` (`package.json` `engines`), ESM (`"type": "module"`), no new runtime dependencies.
- The toolkit is used from a clone of this repo; every path is relative to the repo root (plugin installs into other projects are out of scope).
- Scanner and inventory send **GET only**; the single POST is the wp-login form. Same-origin non-GET requests issued by page scripts are aborted.
- URL filter (`lib/safe-url.mjs`) refuses: other origins, non-http(s), query params `_wpnonce`, `action`, `add-to-cart`, `remove_item`, `undo_item`, `wc-ajax`, `replytocom`, `customize_changeset_uuid`, `doing_wp_cron`, `preview_nonce`; any `logout`; `/wp-login.php`, `/xmlrpc.php`, `/wp-cron.php`, `/wp-comments-post.php`, `/wp-admin/admin-ajax.php`, `/wp-admin/admin-post.php`; any `/wp-admin/` page for `visitor`; for `admin` only `index.php`, `edit.php`, `plugins.php`, `site-health.php`, `nav-menus.php`.
- Default viewports `360, 768, 1366, 1920`; frontend is scanned as an anonymous visitor unless `audience: "admin"`.
- Detector IDs exactly: `VIS-OVERFLOW-X`, `VIS-IMG-BROKEN`, `VIS-IMG-DISTORTED`, `VIS-OVERLAP`, `VIS-TEXT-CLIPPED`, `TXT-SHORTCODE`, `TXT-PHP-ERROR`, `TXT-MOJIBAKE`, `TXT-PLACEHOLDER`, `TXT-UNRENDERED`, `TXT-DUP-WORD`, `TXT-MIXED-SCRIPT`, `TXT-LANG-LEAK`, `TXT-EMPTY-CONTROL`, `NET-HTTP-ERROR`, `NET-CONSOLE-ERROR`, `NET-BROKEN-LINK`; agent IDs `AGT-TYPO`, `AGT-GRAMMAR`, `AGT-UNTRANSLATED`, `AGT-LAYOUT`; compare `CMP-REGRESSION`.
- Verdicts: `PASS` only when coverage is complete, every detection has a review decision, no confirmed defect, no unreviewed change, no missing baseline. `BLOCKED` when nothing was scanned. The agent never writes a verdict and never sets `CLOSED`.
- Secrets: passwords only in `.env.qa`; sessions in `.auth/`; both gitignored; never printed.
- No file in the project is deleted by this plan (Deletion Guard). Tests that need throwaway files use `os.tmpdir()` and leave them there.
- Skills and code in English; `report.md` and verdict reasons in Ukrainian (end-user artifact).
- Commits: directly on `main`, one per task; Conventional Commits in English, title + 1–2 sentence body, no test counts, no file lists, no `Co-Authored-By`. No push unless the owner asks.

## Review Focus

1. **A link or page script that mutates on GET/POST** (`?add-to-cart=`, `?action=…&_wpnonce=`, logout, WooCommerce fragments POST) — the tester expects the site to be untouched. Pinned by `tests/unit/safe-url.test.mjs` (Task 1) and the fake-server hit log assertions in `tests/integration/visual-scan.test.mjs` (Task 9).
2. **A non-English site** (Ukrainian login labels, Cyrillic slugs, accented Latin names) — login must work and legitimate text must not be flagged. Pinned by `tests/integration/seed-login.test.mjs` `uk` case (Task 3), `clean.html` zero-detection test (Task 7), inventory login by element IDs (Task 8).
3. **Ordinary theme patterns** (sticky header, off-canvas menu, carousel, `.screen-reader-text`, ellipsis, custom checkbox) — must not produce false layout detections. Pinned by the `clean.html` fixture test (Task 7).
4. **Compare without a baseline / baseline that cannot stabilise** — must end as `REVIEW` with a clear reason, not a crash or `FAIL`. Pinned by the compare sequence in `tests/integration/visual-scan.test.mjs` (Task 9) and `tests/unit/review.test.mjs` (Task 10).
5. **Site down, wrong password, 2FA/captcha** — must never end as `PASS`. Pinned by the `BLOCKED` case in `tests/integration/visual-scan.test.mjs` (Task 9), `login-rejected` in `tests/integration/inventory.test.mjs` (Task 8) and the verdict table in `tests/unit/review.test.mjs` (Task 10).

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/env.mjs` | Parse/load `.env.qa` without overriding real env vars |
| `lib/safe-url.mjs` | Decide whether a URL may be requested (read-only guarantee) |
| `lib/run-verdict.mjs` | Honest statuses/verdict for `scripts/run-qa.mjs` |
| `lib/text-detectors.mjs` | Node-side text rules over extracted text blocks |
| `lib/page-probes.browser.js` | Browser-side DOM probes, installed via `page.evaluate(string)` |
| `lib/probes.mjs` | Node wrapper: install/run probes, stabilise page |
| `lib/wp-session.mjs` | Log in by core element IDs (or manually), save storage state |
| `lib/inventory-parsers.mjs` | Pure parsers: Site Health copy text, sitemap, hreflang, access verdict |
| `lib/plan.mjs` | Validate/normalise a scan plan, slugs, viewport sizes, run IDs |
| `lib/text-diff.mjs` | Multiset text diff for compare mode |
| `lib/aggregate.mjs` | Write per-check records; aggregate coverage and detections |
| `lib/review.mjs` | Apply agent review decisions; compute scan verdict |
| `lib/findings.mjs` | Merge confirmed defects into `qa/findings.json` |
| `lib/report.mjs` | Render `report.md` (Ukrainian) |
| `scripts/wp-inventory.mjs` | CLI: access check + inventory |
| `scripts/visual-qa.mjs` | CLI: `run <plan>` and `finalize <run-dir>` |
| `tests/visual/scan.spec.ts` | Playwright project `visual`: one test per page × viewport |
| `tests/detectors/probes.spec.ts` | Playwright project `detectors`: probe behaviour on fixtures |
| `tests/support/fake-wp.mjs` | Fake WordPress HTTP server for all browser tests and the eval |
| `tests/fixtures/pages/*.html` | One seeded defect per page + a clean page |
| `skills/wp-admin-access/`, `skills/wp-visual-content-qa/`, `commands/wp-check.md` | Agent-facing workflow |
| `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json` | Plugin wiring |

---

### Task 0: Spec clarifications

Work happens directly on `main` (owner's decision): no feature branch, one commit per task.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-27-admin-only-visual-qa-design.md` (append section 13)

- [ ] **Step 1: Confirm the working tree**

Run: `git status --short` and `git branch --show-current`
Expected: branch `main`; only the new spec and plan files are untracked.

- [ ] **Step 2: Append plan-time clarifications to the spec**

Append at the end of the spec:

```markdown
## 13. Уточнення на етапі плану (2026-09-27)

- Інструмент використовується з клону цього репо; встановлення плагіна в інші проєкти — поза обсягом.
- `wp-admin-access` пише один файл `inventory.json` із секцією `access` (замість окремого `access.json`).
- `report.md` генерує `visual-qa.mjs finalize` детерміновано; агент пише лише `review.json`.
- Підтверджена агентом регресія в режимі `compare` стає дефектом `CMP-REGRESSION` і дає `FAIL`; неоцінена зміна — `REVIEW`.
- LanguageTool не реалізується (прапорця `QA_LANGUAGETOOL` немає), щоб не додавати налаштування, яке нічого не робить.
- PreToolUse-хук лишається в `.claude/settings.json` (перевірений механізм) з розширеним матчером і дублюється в `hooks/hooks.json` плагіна; спрацювання плагінного хука перевіряється окремо.
- Для ізоляції тестів скрипти читають `QA_RUNS_DIR`, `QA_BASELINES_DIR`, `QA_FINDINGS_FILE` і прапорець `--env <file>`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-27-admin-only-visual-qa-design.md docs/superpowers/plans/2026-09-27-admin-only-visual-qa.md
git commit -m "docs(visual-qa): add design and implementation plan for admin-only QA" -m "Describes the read-only visual and content QA flow for testers who only have a wp-admin login, and the honesty fixes to existing scripts and docs."
```

---

### Task 1: Env loader, URL filter, test tooling

**Files:**
- Create: `lib/env.mjs`, `lib/safe-url.mjs`
- Test: `tests/unit/env.test.mjs`, `tests/unit/safe-url.test.mjs`
- Modify: `package.json` (engines, scripts)

**Interfaces:**
- Produces: `parseEnv(text: string): Record<string,string>`; `loadEnvFile(file = '.env.qa', target = process.env): { loaded: boolean, keys: string[] }` (never overrides keys already set); `checkUrl(input: string, { baseUrl: string, audience?: 'visitor'|'admin' }): { allowed: boolean, reason: string }`; `ensureSlash(url: string): string`.

- [ ] **Step 1: Install dependencies and set up scripts**

Run: `npm install` (creates `node_modules/` and `package-lock.json`).

In `package.json` set `"engines": { "node": ">=22" }` and add scripts:

```json
"test:unit": "node --test \"tests/unit/*.test.mjs\"",
"test:integration": "node --test --test-concurrency=1 \"tests/integration/*.test.mjs\"",
"test:detectors": "npx playwright test --project=detectors",
"verify": "npm run test:unit && npm run test:detectors && npm run test:integration",
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/env.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv, loadEnvFile } from '../../lib/env.mjs';

test('parseEnv reads keys, skips comments and blanks, strips quotes, keeps = in values, handles CRLF', () => {
  const env = parseEnv('# comment\r\nA=1\r\nB = "two words"\nC=x=y\n\nBROKEN\n');
  assert.deepEqual(env, { A: '1', B: 'two words', C: 'x=y' });
});

test('loadEnvFile sets missing keys but never overrides existing ones', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpqa-env-'));
  const file = path.join(dir, '.env.qa');
  fs.writeFileSync(file, 'QA_BASE_URL=https://from-file.test\nQA_ONLY_IN_FILE=yes\n');
  const target = { QA_BASE_URL: 'https://from-shell.test' };
  const result = loadEnvFile(file, target);
  assert.deepEqual(result, { loaded: true, keys: ['QA_BASE_URL', 'QA_ONLY_IN_FILE'] });
  assert.equal(target.QA_BASE_URL, 'https://from-shell.test');
  assert.equal(target.QA_ONLY_IN_FILE, 'yes');
});

test('loadEnvFile reports a missing file without throwing', () => {
  assert.deepEqual(loadEnvFile(path.join(os.tmpdir(), 'does-not-exist.env'), {}), { loaded: false, keys: [] });
});
```

`tests/unit/safe-url.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl, ensureSlash } from '../../lib/safe-url.mjs';

const base = 'https://site.test/';
const cases = [
  // [url, audience, allowed, reason]
  ['/', 'visitor', true, 'ok'],
  ['/contacts/', 'visitor', true, 'ok'],
  ['about/', 'visitor', true, 'ok'],
  ['https://site.test/shop/?orderby=price', 'visitor', true, 'ok'],
  ['https://other.test/', 'visitor', false, 'external'],
  ['mailto:hi@site.test', 'visitor', false, 'non-http'],
  ['/?add-to-cart=12', 'visitor', false, 'mutating-param:add-to-cart'],
  ['/cart/?remove_item=abc&_wpnonce=x', 'visitor', false, 'mutating-param:remove_item'],
  ['/wp-login.php?action=logout&_wpnonce=abc', 'visitor', false, 'mutating-param:action'],
  ['/?replytocom=5', 'visitor', false, 'mutating-param:replytocom'],
  ['/my-account/customer-logout/', 'visitor', false, 'logout'],
  ['/wp-login.php', 'visitor', false, 'mutating-endpoint'],
  ['/xmlrpc.php', 'visitor', false, 'mutating-endpoint'],
  ['/wp-admin/admin-ajax.php', 'admin', false, 'mutating-endpoint'],
  ['/wp-admin/', 'visitor', false, 'admin-requires-admin-audience'],
  ['/wp-admin/', 'admin', true, 'ok'],
  ['/wp-admin/plugins.php', 'admin', true, 'ok'],
  ['/wp-admin/site-health.php?tab=debug', 'admin', true, 'ok'],
  ['/wp-admin/plugins.php?action=deactivate&plugin=x&_wpnonce=y', 'admin', false, 'mutating-param:action'],
  ['/wp-admin/post.php?post=1&action=trash&_wpnonce=abc', 'admin', false, 'mutating-param:action'],
  ['/wp-admin/options.php', 'admin', false, 'admin-page-not-allowlisted'],
];

for (const [url, audience, allowed, reason] of cases) {
  test(`${audience} ${url} -> ${allowed ? 'allowed' : reason}`, () => {
    assert.deepEqual(checkUrl(url, { baseUrl: base, audience }), { allowed, reason });
  });
}

test('sub-directory installs: only paths under the base path are allowed', () => {
  const sub = 'https://site.test/blog/';
  assert.deepEqual(checkUrl('/blog/wp-admin/index.php', { baseUrl: sub, audience: 'admin' }), { allowed: true, reason: 'ok' });
  assert.deepEqual(checkUrl('/other/', { baseUrl: sub }), { allowed: false, reason: 'outside-site' });
});

test('ensureSlash adds exactly one trailing slash', () => {
  assert.equal(ensureSlash('https://site.test'), 'https://site.test/');
  assert.equal(ensureSlash('https://site.test/'), 'https://site.test/');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '…/lib/env.mjs'` and `…/lib/safe-url.mjs`.

- [ ] **Step 4: Implement**

`lib/env.mjs`:

```js
import fs from 'node:fs';

export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

// Variables already present in the environment win over the file, so a
// command-line override or CI secret is never silently replaced.
export function loadEnvFile(file = '.env.qa', target = process.env) {
  if (!fs.existsSync(file)) return { loaded: false, keys: [] };
  const parsed = parseEnv(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (target[key] === undefined) target[key] = value;
  }
  return { loaded: true, keys: Object.keys(parsed) };
}
```

`lib/safe-url.mjs`:

```js
// Decides whether the scanner may request a URL. The goal is a read-only
// guarantee: WordPress and WooCommerce perform state changes on plain GET
// links that carry a nonce or an action, so those are refused outright.

const DENY_PARAMS = new Set([
  '_wpnonce', 'action', 'add-to-cart', 'remove_item', 'undo_item', 'wc-ajax',
  'replytocom', 'customize_changeset_uuid', 'doing_wp_cron', 'preview_nonce',
]);

const DENY_PATHS = [
  /^\/wp-login\.php/i,
  /^\/xmlrpc\.php/i,
  /^\/wp-cron\.php/i,
  /^\/wp-comments-post\.php/i,
  /^\/wp-admin\/admin-(ajax|post)\.php/i,
];

const ADMIN_READ_PAGES = new Set(['index.php', 'edit.php', 'plugins.php', 'site-health.php', 'nav-menus.php']);

const deny = (reason) => ({ allowed: false, reason });

export function ensureSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

export function checkUrl(input, { baseUrl, audience = 'visitor' }) {
  let url;
  let base;
  try {
    base = new URL(ensureSlash(baseUrl));
    url = new URL(input, base);
  } catch {
    return deny('invalid-url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return deny('non-http');
  if (url.origin !== base.origin) return deny('external');

  const basePath = base.pathname.replace(/\/$/, '');
  if (basePath && url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return deny('outside-site');
  const rel = url.pathname.slice(basePath.length) || '/';

  for (const [key, value] of url.searchParams) {
    if (DENY_PARAMS.has(key.toLowerCase())) return deny(`mutating-param:${key}`);
    if (/logout/i.test(value)) return deny('logout');
  }
  if (/logout/i.test(rel)) return deny('logout');
  if (DENY_PATHS.some((re) => re.test(rel))) return deny('mutating-endpoint');

  if (/^\/wp-admin(\/|$)/i.test(rel)) {
    if (audience !== 'admin') return deny('admin-requires-admin-audience');
    const page = rel.replace(/^\/wp-admin\/?/i, '') || 'index.php';
    if (!ADMIN_READ_PAGES.has(page.toLowerCase())) return deny('admin-page-not-allowlisted');
  }
  return { allowed: true, reason: 'ok' };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/env.mjs lib/safe-url.mjs tests/unit/env.test.mjs tests/unit/safe-url.test.mjs
git commit -m "feat(visual-qa): add env loader and read-only URL filter" -m "The filter refuses URLs that WordPress or WooCommerce would act on during a plain GET, such as nonce, action, add-to-cart and logout links."
```

---

### Task 2: Honest statuses in `scripts/run-qa.mjs`

**Files:**
- Create: `lib/run-verdict.mjs`
- Test: `tests/unit/run-verdict.test.mjs`
- Modify: `scripts/run-qa.mjs` (full rewrite below), `package.json` (remove `qa:html`)

**Interfaces:**
- Consumes: `loadEnvFile` (Task 1).
- Produces: `countResults(report): {passed, failed, flaky, skipped}` (walks nested suites); `playwrightStatus({exitCode, counts}): 'PASSED'|'FAILED'|'NO_TESTS_EXECUTED'|'NO_RESULTS'|'ERROR'`; `toolStatus(spawnResult|null): 'SKIPPED'|'ERROR'|'PASSED'|'FAILED'`; `environmentStatus(declared): 'DECLARED_NON_PRODUCTION'|'PRODUCTION_READ_ONLY'|'REVIEW'`; `runVerdict({mode, environment, playwright, codeQuality, phpUnit}): 'PASS'|'FAIL'|'BLOCKED'|'REVIEW'`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/run-verdict.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '…/lib/run-verdict.mjs'`.

- [ ] **Step 3: Implement `lib/run-verdict.mjs`**

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Rewrite `scripts/run-qa.mjs`**

```js
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
```

In `package.json` remove the line `"qa:html": "node scripts/run-qa.mjs html",`.

- [ ] **Step 6: Verify the regression by hand**

Run: `node scripts/run-qa.mjs cleanup`
Expected: prints `Fixture cleanup is not implemented in this script: nothing was deleted.`, exit code 2, no new folder in `qa/runs/`.

Run (no site running): `node scripts/run-qa.mjs fast`
Expected: verdict `BLOCKED` or `FAIL` (never `PASS`), exit code 1, `qa/runs/<id>/run.json` has `"verdict"` other than `"PASS"`.

- [ ] **Step 7: Commit**

```bash
git add lib/run-verdict.mjs tests/unit/run-verdict.test.mjs scripts/run-qa.mjs package.json
git commit -m "fix(run-qa): stop reporting PASS when nothing ran" -m "The verdict now comes from executed results and tool exit codes, and modes without an implementation say so instead of printing success."
```

---

### Task 3: Fake WordPress server, locale-proof seed test, config

**Files:**
- Create: `tests/support/fake-wp.mjs`, `tests/support/run-process.mjs`, `tests/support/serve-fake-wp.mjs`, `tests/fixtures/pages/clean.html`
- Test: `tests/integration/seed-login.test.mjs`
- Modify: `tests/seed.spec.ts`, `playwright.config.ts`, `config/wordpress-qa.example.env`, `.gitignore`

**Interfaces:**
- Produces: `createFakeWp({ user='qa-admin', password='secret', locale='en'|'uk', restEnabled=true, environmentType='staging' })` → `{ hits: string[], url: string, setVariant(v: 'a'|'b'), start(port=0): Promise<string>, stop(): Promise<void> }`; `fixtureNames(): string[]`; `makePng(width, height): Buffer`; `runProcess(command, args, { env, cwd }): Promise<{ status: number, output: string }>`.
- Fake routes: `GET/POST /wp-login.php`; `/wp-admin/*` (cookie-gated, `#wpadminbar`); `/wp-admin/site-health.php` (`[data-clipboard-text]`); `/wp-json/wp/v2/pages|posts` (401 when `restEnabled=false`); `/wp-sitemap.xml`; `/img/200x100.png`; `/favicon.ico`; `/server-error/` (500); `/` (home, `lang="uk"`, hreflang); `/<fixture>/` → `tests/fixtures/pages/<fixture>.html`; `setVariant('b')` appends `<p>Нова акція: безкоштовна доставка.</p>` to `/clean/`.

- [ ] **Step 1: Create the fake server and helpers**

`tests/support/fake-wp.mjs`:

```js
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/pages/', import.meta.url));
const SESSION_COOKIE = 'wordpress_logged_in_fakewp=qa';

const LABELS = {
  en: { user: 'Username or Email Address', pass: 'Password', show: 'Show password', submit: 'Log In', dashboard: 'Dashboard', error: 'Error: The password you entered is incorrect.' },
  uk: { user: "Ім'я користувача або адреса e-mail", pass: 'Пароль', show: 'Показати пароль', submit: 'Увійти', dashboard: 'Майстерня', error: 'Помилка: неправильний пароль.' },
};

export function fixtureNames() {
  return fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Solid grey RGB PNG of a known size, so image probes can compare natural and rendered ratios.
export function makePng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type RGB
  const row = Buffer.alloc(1 + width * 3, 0x88);
  row[0] = 0; // filter: none
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}

function loginPage(locale, failed) {
  const t = LABELS[locale];
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${t.submit}</title></head><body class="login">
${failed ? `<div id="login_error">${t.error}</div>` : ''}
<form name="loginform" id="loginform" action="/wp-login.php" method="post">
<p><label for="user_login">${t.user}</label><input type="text" name="log" id="user_login"></p>
<div class="user-pass-wrap"><label for="user_pass">${t.pass}</label>
<div class="wp-pwd"><input type="password" name="pwd" id="user_pass">
<button type="button" class="button wp-hide-pw" aria-label="${t.show}"><span class="dashicons dashicons-visibility" aria-hidden="true"></span></button></div></div>
<p class="submit"><input type="submit" name="wp-submit" id="wp-submit" value="${t.submit}"></p>
</form></body></html>`;
}

function adminPage(locale, body) {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>Admin</title></head><body class="wp-admin">
<div id="wpadminbar"><a href="/wp-login.php?action=logout&amp;_wpnonce=abc">Log out</a></div>
<div id="wpbody">${body}</div></body></html>`;
}

function siteHealthBody(origin, environmentType) {
  const copy = [
    '### wp-core ###', '',
    'version: 6.8.1', 'site_language: uk', `home_url: ${origin}`, `site_url: ${origin}`, `environment_type: ${environmentType}`, '',
    '### wp-plugins-active (2) ###', '',
    'WooCommerce: version: 9.9.0, author: Automattic, Auto-updates disabled',
    'Contact Form 7: version: 6.0.6, author: Takayuki Miyoshi, Auto-updates disabled',
  ].join('\n');
  return `<h1>Site Health</h1><div class="site-health-copy-buttons"><button type="button" class="button copy-button" data-clipboard-text="${escapeHtml(copy)}">Copy site info to clipboard</button></div>`;
}

function pagesJson(origin) {
  return [
    { link: `${origin}/`, title: { rendered: 'Головна' }, modified: '2026-09-01T10:00:00' },
    ...fixtureNames().map((name) => ({ link: `${origin}/${name}/`, title: { rendered: name }, modified: '2026-09-01T10:00:00' })),
  ];
}

function homePage(origin) {
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Fake WP</title>
<link rel="alternate" hreflang="uk" href="${origin}/"><link rel="alternate" hreflang="en" href="${origin}/en/">
</head><body><main><h1>Головна</h1><ul>${fixtureNames().map((n) => `<li><a href="/${n}/">${n}</a></li>`).join('')}</ul></main></body></html>`;
}

const NOT_FOUND = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found</title></head><body><p>Page not found</p></body></html>';

export function createFakeWp({ user = 'qa-admin', password = 'secret', locale = 'en', restEnabled = true, environmentType = 'staging' } = {}) {
  const hits = [];
  let variant = 'a';
  let origin = '';

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fake.local');
    const p = url.pathname;
    hits.push(`${req.method} ${p}${url.search}`);
    const loggedIn = (req.headers.cookie || '').includes(SESSION_COOKIE);
    const send = (status, body, type = 'text/html; charset=utf-8', headers = {}) => {
      res.writeHead(status, { 'content-type': type, ...headers });
      res.end(body);
    };

    if (p === '/wp-login.php' && req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      if (form.get('log') === user && form.get('pwd') === password) {
        return send(302, '', 'text/plain', { location: '/wp-admin/', 'set-cookie': `${SESSION_COOKIE}; Path=/; HttpOnly` });
      }
      return send(200, loginPage(locale, true));
    }
    if (p === '/wp-login.php') return send(200, loginPage(locale, false));
    if (p.startsWith('/wp-admin')) {
      if (!loggedIn) return send(302, '', 'text/plain', { location: '/wp-login.php' });
      if (p === '/wp-admin/site-health.php') return send(200, adminPage(locale, siteHealthBody(origin, environmentType)));
      return send(200, adminPage(locale, `<h1>${LABELS[locale].dashboard}</h1>`));
    }
    if (p.startsWith('/wp-json/')) {
      if (!restEnabled) return send(401, JSON.stringify({ code: 'rest_login_required' }), 'application/json');
      if (p === '/wp-json/wp/v2/pages') {
        const items = pagesJson(origin);
        return send(200, JSON.stringify(items), 'application/json', { 'x-wp-totalpages': '1', 'x-wp-total': String(items.length) });
      }
      if (p === '/wp-json/wp/v2/posts') return send(200, '[]', 'application/json', { 'x-wp-totalpages': '1', 'x-wp-total': '0' });
      return send(404, JSON.stringify({ code: 'rest_no_route' }), 'application/json');
    }
    if (p === '/wp-sitemap.xml') {
      return send(200, `<?xml version="1.0"?><sitemapindex><sitemap><loc>${origin}/wp-sitemap-posts-page-1.xml</loc></sitemap></sitemapindex>`, 'application/xml');
    }
    if (p === '/wp-sitemap-posts-page-1.xml') {
      return send(200, `<?xml version="1.0"?><urlset>${pagesJson(origin).map((i) => `<url><loc>${i.link}</loc></url>`).join('')}</urlset>`, 'application/xml');
    }
    if (p === '/img/200x100.png') return send(200, makePng(200, 100), 'image/png');
    if (p === '/favicon.ico') return send(200, makePng(16, 16), 'image/png');
    if (p === '/server-error/') {
      return send(500, '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Error</title></head><body><p>Internal Server Error</p></body></html>');
    }
    if (p === '/') return send(200, homePage(origin));

    const name = p.replace(/^\/|\/$/g, '');
    if (/^[a-z0-9-]+$/.test(name) && fs.existsSync(`${FIXTURE_DIR}${name}.html`)) {
      let html = fs.readFileSync(`${FIXTURE_DIR}${name}.html`, 'utf8');
      if (variant === 'b' && name === 'clean') html = html.replace('</main>', '<p>Нова акція: безкоштовна доставка.</p></main>');
      return send(200, html);
    }
    return send(404, NOT_FOUND);
  });

  return {
    hits,
    get url() { return origin; },
    setVariant(value) { variant = value; },
    async start(port = 0) {
      await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
      origin = `http://127.0.0.1:${server.address().port}`;
      return origin;
    },
    async stop() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
```

`tests/support/run-process.mjs`:

```js
import { spawn } from 'node:child_process';

// Async on purpose: a synchronous spawn would block the event loop and
// deadlock against a fake server running in the same test process.
export function runProcess(command, args, { env = {}, cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, cwd, shell: process.platform === 'win32' });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (status) => resolve({ status, output }));
  });
}
```

`tests/support/serve-fake-wp.mjs`:

```js
import { createFakeWp } from './fake-wp.mjs';

const port = Number(process.argv[2] || 9555);
const wp = createFakeWp({ locale: process.argv[3] || 'uk' });
const url = await wp.start(port);
console.log(`Fake WordPress at ${url} — login qa-admin / secret. Ctrl+C to stop.`);
```

`tests/fixtures/pages/clean.html` (ordinary theme patterns that must NOT be flagged):

```html
<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Чиста сторінка</title>
<style>
  body { margin: 0; font-family: sans-serif; }
  header { position: sticky; top: 0; background: #fff; display: flex; gap: 8px; padding: 8px; }
  .offcanvas { position: fixed; top: 0; right: 0; width: 280px; height: 100vh; transform: translateX(100%); background: #eee; }
  .carousel { overflow: hidden; width: 100%; }
  .track { display: flex; width: 300%; }
  .track > div { width: 33.33%; height: 60px; }
  .screen-reader-text { border: 0; clip: rect(1px, 1px, 1px, 1px); clip-path: inset(50%); height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; width: 1px; }
  .ellipsis { width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .check input { opacity: 0; position: absolute; }
  main { padding: 8px; }
  img { max-width: 100%; height: auto; }
  .url { overflow-wrap: anywhere; }
</style>
</head>
<body>
<header>
  <a href="/">Головна</a>
  <a href="/clean/">Про нас</a>
  <button aria-label="Відкрити меню"><svg width="16" height="16" aria-hidden="true"><rect width="16" height="16"/></svg></button>
</header>
<nav class="offcanvas" aria-label="Мобільне меню"><a href="/clean/">Послуги</a> <a href="/clean/">Контакти</a></nav>
<main>
  <h1>Ласкаво просимо</h1>
  <span class="screen-reader-text">Перейти до вмісту</span>
  <p>Ми допомагаємо компаніям з 2010 року. Ім'я та прізвище вказуйте повністю. Знижка 100% на першу консультацію.</p>
  <p>Наші клієнти: España, São Paulo, Zürich.</p>
  <p>Джерело [1] і примітка [sic].</p>
  <p class="ellipsis">Дуже довгий заголовок новини, який навмисно обрізано трьома крапками</p>
  <p class="url">https://example.ua/дуже/довгий/шлях/до/сторінки/який/не/має/ламати/верстку/на/мобільному</p>
  <div class="carousel"><div class="track"><div>Слайд перший</div><div>Слайд другий</div><div>Слайд третій</div></div></div>
  <img src="/img/200x100.png" alt="Схема" width="200" height="100">
  <label class="check"><input type="checkbox"> Погоджуюсь з умовами</label>
  <p>Телефон: +380 44 000 00 00</p>
</main>
</body>
</html>
```

- [ ] **Step 2: Write the failing seed test**

`tests/integration/seed-login.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeWp } from '../support/fake-wp.mjs';
import { runProcess } from '../support/run-process.mjs';

for (const locale of ['en', 'uk']) {
  test(`seed test logs in on a ${locale} login page`, async (t) => {
    const wp = createFakeWp({ locale });
    const url = await wp.start();
    t.after(() => wp.stop());
    const { status, output } = await runProcess('npx', ['playwright', 'test', 'tests/seed.spec.ts', '--project=chromium-desktop', '--reporter=line'], {
      env: { QA_BASE_URL: url, QA_ADMIN_USER: 'qa-admin', QA_ADMIN_PASSWORD: 'secret' },
    });
    assert.equal(status, 0, output);
    assert.ok(wp.hits.includes('POST /wp-login.php'), 'login form was submitted');
  });
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:integration`
Expected: both cases FAIL — `en` with a strict-mode violation on `getByLabel(/Password/i)` (matches the password field and the “Show password” button), `uk` because the English label is not found.

- [ ] **Step 4: Fix the seed, config, env example and .gitignore**

`tests/seed.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test(
  'admin can open dashboard',
  {
    tag: ['@smoke', '@admin'],
    annotation: [{ type: 'testId', description: 'ADMIN-DASHBOARD-001' }],
  },
  async ({ page }) => {
    await page.goto('/wp-login.php');
    const user = process.env.QA_ADMIN_USER;
    const password = process.env.QA_ADMIN_PASSWORD;
    if (!user || !password) {
      await expect(page.locator('#loginform')).toBeVisible();
      return;
    }
    // Core element IDs are identical in every WordPress locale; field labels are not.
    await page.locator('#user_login').fill(user);
    await page.locator('#user_pass').fill(password);
    await page.locator('#wp-submit').click();
    await expect(page).toHaveURL(/\/wp-admin\//);
    await expect(page.locator('#wpadminbar')).toBeVisible();
  }
);
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';
import { loadEnvFile } from './lib/env.mjs';

loadEnvFile('.env.qa');

const baseURL = process.env.QA_BASE_URL || 'http://localhost:9400';
// Folders under tests/ that are not site E2E specs.
const NOT_E2E = ['**/unit/**', '**/integration/**', '**/support/**', '**/fixtures/**', '**/visual/**', '**/detectors/**'];

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'qa/latest-playwright-results.json' }],
  ],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium-desktop', testIgnore: NOT_E2E, use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', testIgnore: NOT_E2E, use: { ...devices['Pixel 5'] } },
  ],
});
```

In `package.json` change `"test"` to `"npx playwright test --project=chromium-desktop --project=chromium-mobile"`.

`config/wordpress-qa.example.env` — replace the file with:

```bash
# Required
QA_BASE_URL=https://staging.example.com
# local | staging | test | production — production means read-only
QA_ENVIRONMENT=staging

# wp-admin login (admin-only visual QA). Never commit real values.
QA_ADMIN_USER=
QA_ADMIN_PASSWORD=
QA_CUSTOMER_USER=
QA_TEST_EMAIL_DOMAIN=example.test

# Visual QA tuning
QA_SCAN_WORKERS=2
QA_INVENTORY_MAX_POSTS=50

# Mutation gates (all denied unless explicitly true)
QA_ALLOW_WRITES=false
QA_ALLOW_UPDATES=false
QA_ALLOW_EMAIL=false
QA_ALLOW_PAYMENTS=false
QA_ALLOW_REFUNDS=false
QA_ALLOW_DELETION=false

# Only for the local/staging workflow with WP-CLI (wordpress-* skills, /wordpress-qa)
# local example: wp; SSH example: ssh qa@example.com -- wp
QA_WP_CLI=wp
QA_WP_PATH=/var/www/html
QA_SOURCE_DIR=.
QA_PLUGIN_SLUG=
QA_CLEANUP_FIXTURES=false

# Optional proof that this is staging/local (WP-CLI workflow)
QA_EXPECTED_HOME=https://staging.example.com
QA_STAGING_MARKER=staging
QA_HEALTH_PATH=/
QA_LOGIN_PATH=/wp-login.php
```

(The removed `QA_RUN_*` toggles were read by no code.)

`.gitignore` — append:

```gitignore
# Local secrets and sessions
.env.*
.auth/

# Generated QA output
qa/latest-playwright-results.json
qa/baselines/
```

- [ ] **Step 5: Run to verify pass**

Run: `npm run test:integration`
Expected: PASS for `en` and `uk`.

- [ ] **Step 6: Commit**

```bash
git add tests/support tests/fixtures/pages/clean.html tests/integration/seed-login.test.mjs tests/seed.spec.ts playwright.config.ts config/wordpress-qa.example.env .gitignore package.json
git commit -m "fix(seed): log in by WordPress element IDs so any locale works" -m "Adds a fake WordPress server for browser tests; the old label-based login failed on non-English sites and on the password visibility button."
```

---

### Task 4: Pre-commit hook honours `QA_ALLOW_DELETION`

**Files:**
- Modify: `.githooks/pre-commit`
- Test: `tests/integration/pre-commit.test.mjs`

- [ ] **Step 1: Write the failing test**

`tests/integration/pre-commit.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../support/run-process.mjs';

// Works in a throwaway repository under the OS temp dir; no project file is touched.
async function repoWithProtectedFileStagedForDeletion() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpqa-hook-'));
  const git = (...args) => runProcess('git', args, { cwd: dir });
  await git('init', '-q');
  await git('config', 'user.email', 'qa@example.test');
  await git('config', 'user.name', 'QA');
  fs.mkdirSync(path.join(dir, '.githooks'));
  fs.copyFileSync('.githooks/pre-commit', path.join(dir, '.githooks', 'pre-commit'));
  fs.chmodSync(path.join(dir, '.githooks', 'pre-commit'), 0o755);
  await git('config', 'core.hooksPath', '.githooks');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'rules\n');
  await git('add', '.');
  await git('commit', '-q', '-m', 'init');
  await git('rm', '-q', 'AGENTS.md');
  return dir;
}

test('deleting a protected file is blocked by default', async () => {
  const dir = await repoWithProtectedFileStagedForDeletion();
  const { status, output } = await runProcess('git', ['commit', '-m', 'remove'], { cwd: dir });
  assert.notEqual(status, 0);
  assert.match(output, /DELETION BLOCKED/);
});

test('QA_ALLOW_DELETION=true lets an intended deletion through', async () => {
  const dir = await repoWithProtectedFileStagedForDeletion();
  const { status, output } = await runProcess('git', ['commit', '-m', 'remove'], { cwd: dir, env: { QA_ALLOW_DELETION: 'true' } });
  assert.equal(status, 0, output);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/integration/pre-commit.test.mjs`
Expected: first test PASS, second FAIL (hook ignores the variable).

- [ ] **Step 3: Update the hook**

Replace the `if [ -n "$DELETED_PROTECTED" ]; then … fi` block in `.githooks/pre-commit` with:

```sh
if [ -n "$DELETED_PROTECTED" ]; then
  if [ "$QA_ALLOW_DELETION" = "true" ]; then
    echo "QA_ALLOW_DELETION=true: allowing deletion of protected file(s):"
    echo "$DELETED_PROTECTED"
    exit 0
  fi
  echo ""
  echo "===================================================="
  echo " 🛑 GIT PRE-COMMIT HOOK: DELETION BLOCKED"
  echo " Attempting to commit deletion of protected file(s):"
  echo "$DELETED_PROTECTED"
  echo "===================================================="
  echo "If the deletion is intended, commit again with the variable set:"
  echo "  QA_ALLOW_DELETION=true git commit ..."
  echo ""
  exit 1
fi
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/integration/pre-commit.test.mjs`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add .githooks/pre-commit tests/integration/pre-commit.test.mjs
git commit -m "fix(hooks): honour QA_ALLOW_DELETION in the pre-commit guard" -m "The hook told users to set the variable but never read it, so an intended deletion could only be committed with --no-verify."
```

---

### Task 5: Plugin wiring and hook matcher

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json`
- Modify: `.claude/settings.json`
- Test: `tests/unit/hook-config.test.mjs`

- [ ] **Step 1: Write the failing test**

`tests/unit/hook-config.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const configs = {
  project: JSON.parse(fs.readFileSync('.claude/settings.json', 'utf8')),
  plugin: JSON.parse(fs.readFileSync('hooks/hooks.json', 'utf8')),
};

const guarded = [
  'mcp__playwright__browser_click',
  'mcp__plugin_playwright_playwright__browser_click',
  'mcp__chrome-devtools__fill',
  'mcp__plugin_chrome-devtools-mcp_chrome-devtools__click',
];
const unguarded = ['Bash', 'Read', 'mcp__claude_ai_Gmail__authenticate'];

for (const [name, config] of Object.entries(configs)) {
  test(`${name} hook matcher covers browser MCP servers however they are installed`, () => {
    const re = new RegExp(`^(?:${config.hooks.PreToolUse[0].matcher})$`);
    for (const tool of guarded) assert.ok(re.test(tool), `${tool} should be guarded`);
    for (const tool of unguarded) assert.ok(!re.test(tool), `${tool} should not be guarded`);
  });
}

const decide = (tool) => {
  const out = spawnSync('node', ['scripts/wp-admin-write-guard.mjs'], { input: JSON.stringify({ tool_name: tool }), encoding: 'utf8' });
  return JSON.parse(out.stdout).hookSpecificOutput.permissionDecision;
};

test('guard script asks for writes and unknown actions, allows read-only ones', () => {
  assert.equal(decide('mcp__playwright__browser_click'), 'ask');
  assert.equal(decide('mcp__playwright__browser_run_code'), 'ask');
  assert.equal(decide('mcp__playwright__browser_navigate'), 'allow');
  assert.equal(decide('mcp__chrome-devtools__take_screenshot'), 'allow');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL — `ENOENT … hooks/hooks.json`.

- [ ] **Step 3: Create plugin files and widen the matcher**

`.claude-plugin/plugin.json`:

```json
{
  "name": "wp-qa-agent",
  "version": "0.2.0",
  "description": "WordPress QA toolkit: read-only visual and content checks with wp-admin access only, plus guarded Playwright workflows for local and staging sites.",
  "author": { "name": "Jeka" },
  "license": "MIT"
}
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "wp-qa-agent-local",
  "owner": { "name": "Jeka" },
  "plugins": [
    {
      "name": "wp-qa-agent",
      "source": "./",
      "description": "Read-only visual and content QA for WordPress sites with wp-admin access only."
    }
  ]
}
```

`hooks/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__.*(playwright|chrome-devtools).*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/wp-admin-write-guard.mjs\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

In `.claude/settings.json` change `"matcher": "mcp__playwright__.*|mcp__chrome-devtools__.*"` to `"matcher": "mcp__.*(playwright|chrome-devtools).*"` (command unchanged).

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Validate the plugin and check discovery**

Run: `claude plugin validate . --strict`
Expected: exit 0. If it reports an unknown field (`author`/`license`), remove that field and re-run.

Run: `claude --plugin-dir . -p "Reply with only the names of available skills whose name contains 'wordpress', comma-separated."`
Expected: output lists `wp-qa-agent:wordpress-environment-guard` (and the other `wordpress-*` skills). If the names come back without the `wp-qa-agent:` prefix, note the actual form in the spec's section 13.

Plugin hook check (needs a browser MCP): in a session started with `claude --plugin-dir .` and with the project settings hook temporarily not matching (do not commit that change), ask the agent to click anything through Playwright MCP. Expected: a permission prompt citing “Write Guard”. If no prompt appears, record in spec section 13 that only the project-settings hook is effective and keep `hooks/hooks.json` out of the README claims.

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin hooks/hooks.json .claude/settings.json tests/unit/hook-config.test.mjs
git commit -m "feat(plugin): make the repo a Claude Code plugin and widen the browser guard" -m "Skills and commands become discoverable, and the wp-admin guard now also matches Playwright and Chrome DevTools MCP servers installed as plugins."
```

---

### Task 6: Text detectors

**Files:**
- Create: `lib/text-detectors.mjs`
- Test: `tests/unit/text-detectors.test.mjs`

**Interfaces:**
- Produces: `detectTextDefects(blocks: {text: string, selector: string}[], meta: {lang?: string}): Detection[]` where `Detection = { id, severity: 'critical'|'high'|'medium'|'low', message, match, evidence, selector }`; at most one detection per rule per block.

- [ ] **Step 1: Write the failing tests**

`tests/unit/text-detectors.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTextDefects } from '../../lib/text-detectors.mjs';

const ids = (text, lang = '') => [...new Set(detectTextDefects([{ text, selector: 'p' }], { lang }).map((d) => d.id))].sort();

const positives = [
  ['Warning: Undefined variable $x in /var/www/html/wp-content/themes/t/functions.php on line 12', '', ['TXT-PHP-ERROR']],
  ['There has been a critical error on this website.', '', ['TXT-PHP-ERROR']],
  ['Напишіть нам [contact-form-7 id="12" title="Form"]', '', ['TXT-SHORTCODE']],
  ['[vc_row][vc_column]Текст', '', ['TXT-SHORTCODE']],
  ['[gallery ids="1,2,3"]', '', ['TXT-SHORTCODE']],
  ['ÐŸÑ€Ð¸Ð²Ñ–Ñ‚', '', ['TXT-MOJIBAKE']],
  ['Itâ€™s great', '', ['TXT-MOJIBAKE']],
  ['cafÃ© menu', '', ['TXT-MOJIBAKE']],
  ['Lorem ipsum dolor sit amet', '', ['TXT-PLACEHOLDER']],
  ['Just another WordPress site', '', ['TXT-PLACEHOLDER']],
  ['Ціна&nbsp;100 грн', '', ['TXT-UNRENDERED']],
  ['Hello {{first_name}}', '', ['TXT-UNRENDERED']],
  ['Showing %s results', '', ['TXT-UNRENDERED']],
  ['<p>Text</p>', '', ['TXT-UNRENDERED']],
  ['Ми ми працюємо', '', ['TXT-DUP-WORD']],
  ['see the the docs', '', ['TXT-DUP-WORD']],
  ['Офіс у місті Kиїв', '', ['TXT-MIXED-SCRIPT']],
  ['Добро пожаловать в наш магазин объявлений', 'uk', ['TXT-LANG-LEAK']],
  ['Ласкаво просимо до нашої крамниці', 'ru', ['TXT-LANG-LEAK']],
];

for (const [text, lang, expected] of positives) {
  test(`detects ${expected.join(',')} in "${text}"`, () => {
    assert.deepEqual(ids(text, lang), expected);
  });
}

const clean = [
  ["Ім'я та прізвище вказуйте повністю.", 'uk'],
  ['Наші клієнти: España, São Paulo, Zürich.', 'uk'],
  ['Знижка 100% на першу консультацію.', 'uk'],
  ['Джерело [1] і примітка [sic].', 'uk'],
  ['Warning: slippery floor after rain', 'en'],
  ['Так, так — ми працюємо щодня.', 'uk'],
  ['Телефон: +380 44 000 00 00', 'uk'],
  ['Ласкаво просимо до нашої крамниці', 'en'],
  ['https://example.ua/дуже/довгий/шлях', 'uk'],
];

for (const [text, lang] of clean) {
  test(`does not flag "${text}"`, () => {
    assert.deepEqual(ids(text, lang), []);
  });
}

test('detection carries a readable excerpt and the selector', () => {
  const [d] = detectTextDefects([{ text: 'Footer: [contact-form-7 id="9"] end', selector: 'footer > p' }], {});
  assert.equal(d.selector, 'footer > p');
  assert.equal(d.match, '[contact-form-7 id="9"]');
  assert.match(d.evidence, /Footer: \[contact-form-7 id="9"\] end/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/text-detectors.mjs`**

```js
// Text rules run in Node over the visible text blocks extracted from a page.
// They produce candidates; the agent confirms or rejects each one.

// Windows-1252 characters that UTF-8 lead bytes turn into when mis-decoded.
const CP1252_HIGH = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const MOJIBAKE = new RegExp(`[ÃÂÐÑ][\\u0080-\\u00BF${CP1252_HIGH}]|â€|\\uFFFD`, 'u');

const regexRule = (id, severity, message, re) => ({ id, severity, message, find: (text) => text.match(re)?.[0] ?? null });

function mixedScriptWord(text) {
  for (const word of text.match(/\p{L}+/gu) || []) {
    if (/\p{Script=Cyrillic}/u.test(word) && /\p{Script=Latin}/u.test(word)) return word;
  }
  return null;
}

function languageLeak(text, lang) {
  const primary = String(lang || '').toLowerCase().split('-')[0];
  const foreign = primary === 'uk' ? /[ыэъёЫЭЪЁ]/u : primary === 'ru' ? /[іїєґІЇЄҐ]/u : null;
  if (!foreign) return null;
  for (const word of text.match(/\p{Script=Cyrillic}+/gu) || []) {
    if (foreign.test(word)) return word;
  }
  return null;
}

const RULES = [
  regexRule('TXT-PHP-ERROR', 'high', 'PHP error text is visible on the page',
    /\b(?:Warning|Notice|Deprecated|Fatal error|Parse error|Catchable fatal error)\s*:\s[^\n]{0,300}?(?:on line \d+|\bin \/\S+)/i),
  regexRule('TXT-PHP-ERROR', 'high', 'WordPress critical error message is visible',
    /There has been a critical error on (?:this|your) website/i),
  regexRule('TXT-SHORTCODE', 'medium', 'Unrendered shortcode is visible',
    /\[\/?(?:[a-z0-9]+[_-][a-z0-9_-]*|gallery|caption|embed|audio|video|playlist|products?|contact-form)(?:\s[^\]\n]*)?\]|\[[a-z][\w-]*\s+[\w-]+=["'][^\]\n]*\]/i),
  regexRule('TXT-MOJIBAKE', 'medium', 'Broken character encoding (mojibake)', MOJIBAKE),
  regexRule('TXT-PLACEHOLDER', 'medium', 'Placeholder or default WordPress text',
    /lorem ipsum|dolor sit amet|\bSample Page\b|Hello world!|Just another WordPress site|\bexample\.com\b|Привіт, світ!|Ще один сайт на WordPress|Ещё один сайт на WordPress|Приклад сторінки|Пример страницы/i),
  regexRule('TXT-UNRENDERED', 'medium', 'Raw HTML entity, tag or template variable is visible',
    /&(?:nbsp|amp|lt|gt|quot|#\d+|#x[0-9a-f]+);|<\/?(?:p|div|span|br|strong|em|a|h[1-6])\b[^>]*>|\{\{\s*[\w.]+\s*\}\}|%(?:\d+\$)?[sd](?!\p{L})/iu),
  regexRule('TXT-DUP-WORD', 'low', 'Repeated word',
    /(?<![\p{L}\p{N}])(\p{L}{2,})\s+\1(?![\p{L}\p{N}])/iu),
  { id: 'TXT-MIXED-SCRIPT', severity: 'medium', message: 'Word mixes Cyrillic and Latin letters', find: (text) => mixedScriptWord(text) },
  { id: 'TXT-LANG-LEAK', severity: 'medium', message: 'Letters of another language on this page', find: (text, meta) => languageLeak(text, meta.lang) },
];

function excerpt(text, match) {
  const i = Math.max(0, text.indexOf(match));
  const start = Math.max(0, i - 40);
  const end = Math.min(text.length, i + match.length + 40);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export function detectTextDefects(blocks, meta = {}) {
  const out = [];
  for (const block of blocks) {
    const seen = new Set();
    for (const rule of RULES) {
      if (seen.has(rule.id)) continue;
      const match = rule.find(block.text, meta);
      if (!match) continue;
      seen.add(rule.id);
      out.push({ id: rule.id, severity: rule.severity, message: rule.message, match, evidence: excerpt(block.text, match), selector: block.selector });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit`
Expected: PASS. If a clean-case string is flagged, fix the rule (not the test) and re-run.

- [ ] **Step 5: Commit**

```bash
git add lib/text-detectors.mjs tests/unit/text-detectors.test.mjs
git commit -m "feat(visual-qa): detect visible shortcodes, PHP errors and broken text" -m "Covers mojibake, placeholder copy, raw entities and template variables, repeated words, mixed Cyrillic and Latin letters and Russian letters on Ukrainian pages."
```

---

### Task 7: Browser probes and fixtures

**Files:**
- Create: `lib/page-probes.browser.js`, `lib/probes.mjs`, `tests/detectors/probes.spec.ts`, fixtures `tests/fixtures/pages/{overflow,body-hidden-overflow,broken-image,distorted-image,overlap,clipped,empty-control,wp-die,text-defects}.html`
- Modify: `playwright.config.ts` (add `detectors` project)

**Interfaces:**
- Consumes: `createFakeWp` (Task 3), `detectTextDefects` (Task 6).
- Produces: `runProbes(page): Promise<{ meta: {lang, title, isWpDie, viewportWidth, scrollWidth}, detections: Detection[], blocks: {text, selector}[], links: string[] }>`; `stabilizePage(page): Promise<void>`.

- [ ] **Step 1: Create the fixtures**

`tests/fixtures/pages/overflow.html`:

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pricing</title><style>body{margin:0}</style></head>
<body><main><h1>Pricing</h1><table style="width:600px"><tr><td>Plan</td><td>Price</td></tr></table></main></body></html>
```

`tests/fixtures/pages/body-hidden-overflow.html`:

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Banner</title><style>body{margin:0;overflow-x:hidden}</style></head>
<body><main><div style="width:600px;height:20px;background:#ccc">Wide banner</div></main></body></html>
```

`tests/fixtures/pages/broken-image.html`:

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Logo</title></head>
<body><main><img src="/img/missing.png" alt="Logo" width="100" height="50"></main></body></html>
```

`tests/fixtures/pages/distorted-image.html`:

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Chart</title></head>
<body><main><img src="/img/200x100.png" alt="Chart" style="width:200px;height:200px"></main></body></html>
```

`tests/fixtures/pages/overlap.html`:

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Promo</title></head>
<body style="margin:0"><main style="position:relative;padding:20px">
<button style="width:120px;height:40px">Buy now</button>
<div style="position:absolute;top:10px;left:10px;width:200px;height:80px;background:rgba(255,255,255,0.9)">Promo sticker</div>
</main></body></html>
```

`tests/fixtures/pages/clipped.html`:

```html
<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Форма</title></head>
<body><main><button style="width:60px;height:24px;overflow:hidden;white-space:nowrap">Надіслати заявку зараз</button></main></body></html>
```

`tests/fixtures/pages/empty-control.html`:

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Icons</title></head>
<body><main><a href="/clean/" style="display:inline-block;width:24px;height:24px;background:#333"></a></main></body></html>
```

`tests/fixtures/pages/wp-die.html`:

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>WordPress › Error</title></head>
<body id="error-page"><div class="wp-die-message"><p>There has been a critical error on this website.</p></div></body></html>
```

`tests/fixtures/pages/text-defects.html` (the `K` in `Kиїв` is Latin U+004B):

```html
<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Контакти</title></head>
<body><main>
<h1>Контакти</h1>
<p>Напишіть нам: [contact-form-7 id="12" title="Контакти"]</p>
<p>Warning: Undefined variable $phone in /var/www/html/wp-content/themes/shop/footer.php on line 42</p>
<p>ÐŸÑ€Ð¸Ð²Ñ–Ñ‚, Ð´Ñ€ÑƒÐ·Ñ–!</p>
<p>Lorem ipsum dolor sit amet.</p>
<p>Ціна&amp;nbsp;від 500 грн</p>
<p>Ми ми працюємо щодня.</p>
<p>Офіс у місті Kиїв.</p>
<p>Добро пожаловать в наш магазин объявлений.</p>
<ul>
<li><a href="/clean/">Про нас</a></li>
<li><a href="/missing-page/">Архів</a></li>
<li><a href="/?add-to-cart=12">Купити</a></li>
<li><a href="/wp-login.php?action=logout&amp;_wpnonce=abc123">Вийти</a></li>
</ul>
</main></body></html>
```

- [ ] **Step 2: Add the `detectors` project**

In `playwright.config.ts` add to `projects`:

```ts
    { name: 'detectors', testDir: './tests/detectors', use: { ...devices['Desktop Chrome'] } },
```

- [ ] **Step 3: Write the failing spec**

`tests/detectors/probes.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createFakeWp } from '../support/fake-wp.mjs';
import { runProbes } from '../../lib/probes.mjs';
import { detectTextDefects } from '../../lib/text-detectors.mjs';

let wp: ReturnType<typeof createFakeWp>;
let base = '';

test.beforeAll(async () => {
  wp = createFakeWp();
  base = await wp.start();
});
test.afterAll(async () => {
  await wp.stop();
});
test.use({ viewport: { width: 360, height: 740 } });

const cases: [string, string][] = [
  ['overflow', 'VIS-OVERFLOW-X'],
  ['body-hidden-overflow', 'VIS-OVERFLOW-X'],
  ['broken-image', 'VIS-IMG-BROKEN'],
  ['distorted-image', 'VIS-IMG-DISTORTED'],
  ['overlap', 'VIS-OVERLAP'],
  ['clipped', 'VIS-TEXT-CLIPPED'],
  ['empty-control', 'TXT-EMPTY-CONTROL'],
  ['wp-die', 'TXT-PHP-ERROR'],
];

for (const [fixture, id] of cases) {
  test(`${fixture} is reported as ${id} and nothing else`, async ({ page }) => {
    await page.goto(`${base}/${fixture}/`);
    const { detections } = await runProbes(page);
    expect(detections.map((d) => d.id)).toEqual([id]);
  });
}

test('ordinary theme patterns on the clean page produce no detections', async ({ page }) => {
  await page.goto(`${base}/clean/`);
  const result = await runProbes(page);
  expect(result.detections).toEqual([]);
  expect(detectTextDefects(result.blocks, result.meta)).toEqual([]);
  expect(result.meta.lang).toBe('uk');
});

test('text-defects page yields every seeded text detection', async ({ page }) => {
  await page.goto(`${base}/text-defects/`);
  const { blocks, meta, links } = await runProbes(page);
  const ids = [...new Set(detectTextDefects(blocks, meta).map((d) => d.id))].sort();
  expect(ids).toEqual(['TXT-DUP-WORD', 'TXT-LANG-LEAK', 'TXT-MIXED-SCRIPT', 'TXT-MOJIBAKE', 'TXT-PHP-ERROR', 'TXT-PLACEHOLDER', 'TXT-SHORTCODE', 'TXT-UNRENDERED']);
  expect(links).toContain(`${base}/missing-page/`);
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npm run test:detectors`
Expected: FAIL — `Cannot find module '…/lib/probes.mjs'`.

- [ ] **Step 5: Implement the probes**

`lib/page-probes.browser.js` (a plain browser script, evaluated as a string so page CSP cannot block it):

```js
(() => {
  const SR_ONLY = /(^|\s)(screen-reader-text|sr-only|visually-hidden|screen-reader-only)(\s|$)/;

  function cssPath(el) {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && parts.length < 5; node = node.parentElement) {
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      let part = node.tagName.toLowerCase() + [...node.classList].slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('');
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
    }
    return parts.join(' > ');
  }

  function isVisible(el) {
    const opts = { checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true };
    if (el.checkVisibility && !el.checkVisibility(opts)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  function isHiddenFromUsers(el) {
    return Boolean(el.closest('[aria-hidden="true"],[inert]'));
  }

  function isSrOnly(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (typeof n.className === 'string' && SR_ONLY.test(n.className)) return true;
      const s = getComputedStyle(n);
      if (s.clip && s.clip !== 'auto') return true;
      if (s.clipPath && s.clipPath.startsWith('inset(50%')) return true;
    }
    return false;
  }

  function inFixedLayer(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return true;
    }
    return false;
  }

  // Clipped or scrolled by an ancestor other than html/body (carousels, scroll areas).
  function contained(el) {
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (getComputedStyle(n).overflowX !== 'visible') return true;
    }
    return false;
  }

  function probeOverflow() {
    const vw = document.documentElement.clientWidth;
    const culprits = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 || r.width < 2 || r.height < 2) continue;
      if (isHiddenFromUsers(el) || inFixedLayer(el) || contained(el) || !isVisible(el)) continue;
      if (culprits.some((c) => c.contains(el))) continue;
      culprits.push(el);
      if (culprits.length >= 3) break;
    }
    return culprits.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: 'VIS-OVERFLOW-X', severity: 'medium',
        message: `Element extends ${Math.round(r.right - vw)}px beyond the ${vw}px viewport`,
        selector: cssPath(el), match: '',
        evidence: `right=${Math.round(r.right)} viewport=${vw} scrollWidth=${document.documentElement.scrollWidth}`,
      };
    });
  }

  function probeImages() {
    const out = [];
    for (const img of document.images) {
      if (isHiddenFromUsers(img)) continue;
      const src = img.currentSrc || img.src || '';
      if (!src) continue;
      if (img.complete && img.naturalWidth === 0 && !/\.svg(\?|#|$)/i.test(src)) {
        out.push({ id: 'VIS-IMG-BROKEN', severity: 'medium', message: 'Image failed to load', selector: cssPath(img), match: '', evidence: src });
        continue;
      }
      const r = img.getBoundingClientRect();
      if (!img.naturalWidth || r.width < 20 || r.height < 20 || !isVisible(img)) continue;
      if (getComputedStyle(img).objectFit !== 'fill') continue;
      const natural = img.naturalWidth / img.naturalHeight;
      const drift = Math.abs(r.width / r.height - natural) / natural;
      if (drift > 0.05) {
        out.push({
          id: 'VIS-IMG-DISTORTED', severity: 'low', message: `Image aspect ratio distorted by ${Math.round(drift * 100)}%`,
          selector: cssPath(img), match: '', evidence: `natural ${img.naturalWidth}x${img.naturalHeight}, rendered ${Math.round(r.width)}x${Math.round(r.height)}`,
        });
      }
    }
    return out;
  }

  function hasOwnText(el) {
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  }

  function probeClipped() {
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!hasOwnText(el)) continue;
      const s = getComputedStyle(el);
      if (s.display === 'inline') continue;
      const clipsX = s.overflowX === 'hidden' || s.overflowX === 'clip';
      const clipsY = s.overflowY === 'hidden' || s.overflowY === 'clip';
      if (!clipsX && !clipsY) continue;
      if (s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none')) continue;
      if (isSrOnly(el) || isHiddenFromUsers(el) || !isVisible(el)) continue;
      const overX = clipsX && el.scrollWidth > el.clientWidth + 1;
      const overY = clipsY && el.scrollHeight > el.clientHeight + 1;
      if (!overX && !overY) continue;
      out.push({
        id: 'VIS-TEXT-CLIPPED', severity: 'medium', message: 'Text is cut off by its container', selector: cssPath(el), match: '',
        evidence: `${el.textContent.trim().slice(0, 80)} (content ${el.scrollWidth}x${el.scrollHeight} > box ${el.clientWidth}x${el.clientHeight})`,
      });
      if (out.length >= 10) break;
    }
    return out;
  }

  function probeEmptyControls() {
    const out = [];
    for (const el of document.querySelectorAll('a[href], button, [role="button"]')) {
      if (isHiddenFromUsers(el) || !isVisible(el)) continue;
      const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || '').trim();
      if (name || el.getAttribute('aria-labelledby')) continue;
      const labelled = [...el.querySelectorAll('img[alt], svg title, [aria-label]')]
        .some((n) => (n.getAttribute('alt') || n.getAttribute('aria-label') || n.textContent || '').trim());
      if (labelled) continue;
      out.push({ id: 'TXT-EMPTY-CONTROL', severity: 'low', message: 'Link or button has no visible or accessible text', selector: cssPath(el), match: '', evidence: el.outerHTML.slice(0, 120) });
      if (out.length >= 20) break;
    }
    return out;
  }

  async function probeOverlap() {
    const out = [];
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const checked = new Set();
    const controls = [...document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"]')]
      .filter((el) => !isHiddenFromUsers(el) && !inFixedLayer(el) && !isSrOnly(el) && isVisible(el));
    const height = document.documentElement.scrollHeight;
    for (let y = 0, i = 0; y < height && i < 60 && out.length < 10; y += vh, i++) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      for (const el of controls) {
        if (checked.has(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) continue;
        checked.add(el);
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || el.contains(hit) || hit.contains(el)) continue;
        if (hit.closest('label') && hit.closest('label').control === el) continue;
        if (inFixedLayer(hit)) continue;
        out.push({ id: 'VIS-OVERLAP', severity: 'medium', message: 'Interactive element is covered by another element', selector: cssPath(el), match: '', evidence: `covered by ${cssPath(hit)}` });
        if (out.length >= 10) break;
      }
    }
    window.scrollTo(0, 0);
    return out;
  }

  function collectTextBlocks() {
    const groups = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,noscript,template,svg') || isHiddenFromUsers(parent)) continue;
      if (isSrOnly(parent) || !isVisible(parent)) continue;
      let block = parent;
      while (block.parentElement && block !== document.body && getComputedStyle(block).display === 'inline') block = block.parentElement;
      if (!groups.has(block)) groups.set(block, []);
      groups.get(block).push(text);
    }
    return [...groups].slice(0, 2000).map(([el, parts]) => ({ selector: cssPath(el), text: parts.join(' ') }));
  }

  function collectLinks() {
    const set = new Set();
    for (const a of document.querySelectorAll('a[href]')) {
      if (a.href.startsWith(location.origin)) set.add(a.href.split('#')[0]);
    }
    return [...set];
  }

  window.__wpqa = {
    async run() {
      const meta = {
        lang: document.documentElement.lang || '',
        title: document.title,
        isWpDie: document.body.id === 'error-page',
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
      const blocks = collectTextBlocks();
      const links = collectLinks();
      const detections = [...probeOverflow(), ...probeImages(), ...probeClipped(), ...probeEmptyControls(), ...(await probeOverlap())];
      if (meta.isWpDie) {
        detections.unshift({ id: 'TXT-PHP-ERROR', severity: 'high', message: 'WordPress error page (wp_die) is shown', selector: 'body#error-page', match: '', evidence: document.body.innerText.slice(0, 160) });
      }
      return { meta, detections, blocks, links };
    },
  };
})();
```

`lib/probes.mjs`:

```js
import fs from 'node:fs';

const SOURCE = fs.readFileSync(new URL('./page-probes.browser.js', import.meta.url), 'utf8');

export async function runProbes(page) {
  await page.evaluate(SOURCE);
  return page.evaluate(() => window.__wpqa.run());
}

// Scroll through the page so lazy-loaded images and blocks render, then return to the top.
export async function stabilizePage(page) {
  await page.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
    const step = window.innerHeight;
    for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 60; y += step, i++) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npm run test:detectors`
Expected: PASS for all fixtures and the clean page. If the clean page reports something, fix the probe's exclusion (not the fixture) and re-run.

- [ ] **Step 7: Commit**

```bash
git add lib/page-probes.browser.js lib/probes.mjs tests/detectors tests/fixtures/pages playwright.config.ts
git commit -m "feat(visual-qa): add DOM probes for layout defects" -m "Finds horizontal overflow, broken or distorted images, covered buttons, clipped text, empty links and wp_die pages while ignoring sticky headers, off-canvas menus, carousels and screen-reader text."
```

---

### Task 8: Admin session and site inventory

**Files:**
- Create: `lib/wp-session.mjs`, `lib/inventory-parsers.mjs`, `scripts/wp-inventory.mjs`
- Test: `tests/unit/inventory-parsers.test.mjs`, `tests/integration/inventory.test.mjs`
- Modify: `package.json` (add `"qa:inventory": "node scripts/wp-inventory.mjs"`)

**Interfaces:**
- Consumes: `loadEnvFile`, `checkUrl`, `ensureSlash` (Task 1); `createFakeWp` (Task 3).
- Produces: `ensureAdminSession({ baseUrl, user, password, statePath='.auth/admin.json', manual=false }): Promise<{ ok: boolean, reason?: 'no-credentials'|'login-rejected'|'no-admin-bar-after-login', statePath?: string }>`; `parseSiteHealthCopy(text): { wpVersion, environmentType, homeUrl, siteUrl, siteLanguage, plugins: {name, version}[] }`; `parseSitemapLocs(xml): string[]`; `parseHreflang(html): {lang, url}[]`; `parseHtmlLang(html): string`; `accessVerdict({ homeStatus, login, credentialsProvided }): 'PASS'|'REVIEW'|'FAIL'`; `buildInventory({ baseUrl, user, password, statePath, maxPosts=50, manualLogin=false })` → inventory object (shape below).

Inventory shape (written to `<out>`):

```json
{
  "generatedAt": "ISO-8601",
  "baseUrl": "https://site.test/",
  "access": { "verdict": "PASS|REVIEW|FAIL", "mode": "read-only", "homeStatus": 200, "finalUrl": "https://site.test/", "login": { "ok": true, "reason": null } },
  "site": { "wpVersion": "6.8.1", "environmentType": "staging|production|unknown", "homeUrl": "…", "siteUrl": "…", "siteLanguage": "uk", "plugins": [{ "name": "WooCommerce", "version": "9.9.0" }] },
  "languages": { "htmlLang": "uk", "alternates": [{ "lang": "en", "url": "…" }] },
  "content": { "source": "rest|sitemap|none", "items": [{ "url": "…", "title": "…", "type": "page|post|product|other" }] }
}
```

- [ ] **Step 1: Write the failing unit tests**

`tests/unit/inventory-parsers.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSiteHealthCopy, parseSitemapLocs, parseHreflang, parseHtmlLang, accessVerdict } from '../../lib/inventory-parsers.mjs';

test('parseSiteHealthCopy reads core fields and active plugins, including names with colons', () => {
  const text = [
    '### wp-core ###', '',
    'version: 6.4.2', 'site_language: en_US', 'home_url: https://site.test', 'site_url: https://site.test/wp', 'environment_type: production', '',
    '### wp-plugins-active (2) ###', '',
    'Akismet Anti-spam: Spam Protection: version: 5.3, author: Automattic - Anti-spam Team, Auto-updates disabled',
    'WooCommerce: version: 9.9.0, author: Automattic, Auto-updates enabled', '',
    '### wp-plugins-inactive (1) ###', '',
    'Hello Dolly: version: 1.7.2, author: Matt Mullenweg, Auto-updates disabled',
  ].join('\n');
  assert.deepEqual(parseSiteHealthCopy(text), {
    wpVersion: '6.4.2', environmentType: 'production', homeUrl: 'https://site.test', siteUrl: 'https://site.test/wp', siteLanguage: 'en_US',
    plugins: [{ name: 'Akismet Anti-spam: Spam Protection', version: '5.3' }, { name: 'WooCommerce', version: '9.9.0' }],
  });
});

test('parseSitemapLocs decodes XML entities', () => {
  assert.deepEqual(parseSitemapLocs('<urlset><url><loc> https://s.test/?p=1&amp;lang=uk </loc></url><url><loc>https://s.test/a/</loc></url></urlset>'),
    ['https://s.test/?p=1&lang=uk', 'https://s.test/a/']);
});

test('parseHreflang and parseHtmlLang read language markers', () => {
  const html = '<html class="x" lang="uk-UA"><head><link rel="alternate" hreflang="en" href="https://s.test/en/"><link rel="stylesheet" href="a.css"></head>';
  assert.deepEqual(parseHreflang(html), [{ lang: 'en', url: 'https://s.test/en/' }]);
  assert.equal(parseHtmlLang(html), 'uk-UA');
  assert.equal(parseHtmlLang('<html><body></body></html>'), '');
});

test('accessVerdict', () => {
  assert.equal(accessVerdict({ homeStatus: 200, login: { ok: true }, credentialsProvided: true }), 'PASS');
  assert.equal(accessVerdict({ homeStatus: 200, login: { ok: false }, credentialsProvided: false }), 'REVIEW');
  assert.equal(accessVerdict({ homeStatus: 200, login: { ok: false }, credentialsProvided: true }), 'FAIL');
  assert.equal(accessVerdict({ homeStatus: 503, login: { ok: true }, credentialsProvided: true }), 'FAIL');
  assert.equal(accessVerdict({ homeStatus: 0, login: { ok: false }, credentialsProvided: false }), 'FAIL');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/inventory-parsers.mjs`**

```js
function decodeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

// Site Health "Copy site info" text uses untranslated keys, so it reads the
// same on every locale.
export function parseSiteHealthCopy(text) {
  const info = { wpVersion: null, environmentType: null, homeUrl: null, siteUrl: null, siteLanguage: null, plugins: [] };
  const coreKeys = { version: 'wpVersion', environment_type: 'environmentType', home_url: 'homeUrl', site_url: 'siteUrl', site_language: 'siteLanguage' };
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const header = line.match(/^###\s*([\w-]+)/);
    if (header) {
      section = header[1];
      continue;
    }
    if (!line) continue;
    if (section === 'wp-core') {
      const kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (kv && coreKeys[kv[1]]) info[coreKeys[kv[1]]] = kv[2];
    } else if (section === 'wp-plugins-active') {
      const m = line.match(/^(.+?): version: ([^,]+)/);
      if (m) info.plugins.push({ name: m[1], version: m[2].trim() });
    }
  }
  return info;
}

export function parseSitemapLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decodeXml(m[1]));
}

export function parseHreflang(html) {
  const out = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel=["']alternate["']/i.test(tag)) continue;
    const lang = tag.match(/hreflang=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (lang && href) out.push({ lang, url: decodeXml(href) });
  }
  return out;
}

export function parseHtmlLang(html) {
  return html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1] ?? '';
}

export function accessVerdict({ homeStatus, login, credentialsProvided }) {
  if (!homeStatus || homeStatus >= 500) return 'FAIL';
  if (credentialsProvided && !login.ok) return 'FAIL';
  if (!credentialsProvided) return 'REVIEW';
  return 'PASS';
}
```

- [ ] **Step 4: Run unit tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Write the failing integration test**

`tests/integration/inventory.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFakeWp } from '../support/fake-wp.mjs';
import { buildInventory } from '../../scripts/wp-inventory.mjs';

const tmpState = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wpqa-auth-')), 'admin.json');
const noMutatingRequests = (hits) => hits.every((h) => !/_wpnonce|add-to-cart|logout/.test(h) && (!h.startsWith('POST') || h === 'POST /wp-login.php'));

test('logs in, reads Site Health and lists pages from REST', async (t) => {
  const wp = createFakeWp({ locale: 'uk', environmentType: 'staging' });
  const url = await wp.start();
  t.after(() => wp.stop());
  const inv = await buildInventory({ baseUrl: url, user: 'qa-admin', password: 'secret', statePath: tmpState() });
  assert.equal(inv.access.verdict, 'PASS');
  assert.equal(inv.access.mode, 'read-only');
  assert.equal(inv.site.environmentType, 'staging');
  assert.equal(inv.site.wpVersion, '6.8.1');
  assert.deepEqual(inv.site.plugins.map((p) => p.name), ['WooCommerce', 'Contact Form 7']);
  assert.equal(inv.languages.htmlLang, 'uk');
  assert.equal(inv.content.source, 'rest');
  assert.ok(inv.content.items.some((i) => i.url === `${url}/clean/`));
  assert.ok(noMutatingRequests(wp.hits), wp.hits.join('\n'));
});

test('falls back to the sitemap when REST is disabled', async (t) => {
  const wp = createFakeWp({ restEnabled: false });
  const url = await wp.start();
  t.after(() => wp.stop());
  const inv = await buildInventory({ baseUrl: url, statePath: tmpState() });
  assert.equal(inv.content.source, 'sitemap');
  assert.ok(inv.content.items.some((i) => i.url === `${url}/clean/`));
  assert.equal(inv.access.verdict, 'REVIEW');
});

test('a wrong password is FAIL with login-rejected, not a site defect', async (t) => {
  const wp = createFakeWp();
  const url = await wp.start();
  t.after(() => wp.stop());
  const inv = await buildInventory({ baseUrl: url, user: 'qa-admin', password: 'wrong', statePath: tmpState() });
  assert.equal(inv.access.verdict, 'FAIL');
  assert.deepEqual(inv.access.login, { ok: false, reason: 'login-rejected' });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `node --test tests/integration/inventory.test.mjs`
Expected: FAIL — `Cannot find module '…/scripts/wp-inventory.mjs'`.

- [ ] **Step 7: Implement `lib/wp-session.mjs` and `scripts/wp-inventory.mjs`**

`lib/wp-session.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { ensureSlash } from './safe-url.mjs';

// Logs in through wp-login.php using core element IDs (locale-independent)
// and saves the session. `manual` opens a visible browser for 2FA/captcha.
export async function ensureAdminSession({ baseUrl, user, password, statePath = '.auth/admin.json', manual = false }) {
  if (!manual && (!user || !password)) return { ok: false, reason: 'no-credentials' };
  const browser = await chromium.launch({ headless: !manual });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(new URL('wp-login.php', ensureSlash(baseUrl)).href);
    if (manual) {
      console.log('Log in in the opened browser window (5 minutes)…');
      await page.locator('#wpadminbar').waitFor({ timeout: 300_000 });
    } else {
      await page.locator('#user_login').fill(user);
      await page.locator('#user_pass').fill(password);
      await page.locator('#wp-submit').click();
      await page.waitForLoadState('load');
      if ((await page.locator('#wpadminbar').count()) === 0) {
        const rejected = (await page.locator('#login_error').count()) > 0;
        return { ok: false, reason: rejected ? 'login-rejected' : 'no-admin-bar-after-login' };
      }
    }
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    await context.storageState({ path: statePath });
    return { ok: true, statePath };
  } finally {
    await browser.close();
  }
}
```

`scripts/wp-inventory.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, request as playwrightRequest } from '@playwright/test';
import { loadEnvFile } from '../lib/env.mjs';
import { checkUrl, ensureSlash } from '../lib/safe-url.mjs';
import { ensureAdminSession } from '../lib/wp-session.mjs';
import { parseSiteHealthCopy, parseSitemapLocs, parseHreflang, parseHtmlLang, accessVerdict } from '../lib/inventory-parsers.mjs';

async function fetchRest(api, route, limit, type) {
  const items = [];
  for (let page = 1; items.length < limit; page++) {
    const res = await api.get(route, { params: { per_page: Math.min(100, limit - items.length), page, _fields: 'link,title,modified' } }).catch(() => null);
    if (!res || !res.ok()) return { ok: page > 1, items };
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) return { ok: page > 1, items };
    items.push(...data.map((d) => ({ url: d.link, title: d.title?.rendered ?? '', type })));
    const totalPages = Number(res.headers()['x-wp-totalpages'] || 1);
    if (page >= totalPages || data.length === 0) break;
  }
  return { ok: true, items };
}

async function listContent(api, base, maxPosts) {
  const pages = await fetchRest(api, 'wp-json/wp/v2/pages', 500, 'page');
  if (pages.ok) {
    const items = [...pages.items];
    for (const [route, type] of [['wp-json/wp/v2/posts', 'post'], ['wp-json/wp/v2/product', 'product']]) {
      const more = await fetchRest(api, route, maxPosts, type);
      if (more.ok) items.push(...more.items);
    }
    return { source: 'rest', items };
  }
  const index = await api.get('wp-sitemap.xml').catch(() => null);
  if (index && index.ok()) {
    const items = [];
    for (const sub of parseSitemapLocs(await index.text()).slice(0, 20)) {
      if (!checkUrl(sub, { baseUrl: base }).allowed) continue;
      const res = await api.get(sub).catch(() => null);
      if (!res || !res.ok()) continue;
      for (const loc of parseSitemapLocs(await res.text())) items.push({ url: loc, title: '', type: /-page-/.test(sub) ? 'page' : 'other' });
    }
    return { source: 'sitemap', items: items.slice(0, 500) };
  }
  return { source: 'none', items: [] };
}

async function readSiteHealth(base, statePath) {
  const url = new URL('wp-admin/site-health.php?tab=debug', base).href;
  if (!checkUrl(url, { baseUrl: base, audience: 'admin' }).allowed) return {};
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ storageState: statePath });
    const page = await context.newPage();
    await page.goto(url, { timeout: 60_000 });
    const copy = await page.locator('[data-clipboard-text]').first().getAttribute('data-clipboard-text', { timeout: 15_000 }).catch(() => null);
    return copy ? parseSiteHealthCopy(copy) : {};
  } finally {
    await browser.close();
  }
}

export async function buildInventory({ baseUrl, user, password, statePath = '.auth/admin.json', maxPosts = 50, manualLogin = false }) {
  const base = ensureSlash(baseUrl);
  const api = await playwrightRequest.newContext({ baseURL: base });
  try {
    const home = await api.get('', { maxRedirects: 5 }).catch(() => null);
    const homeStatus = home ? home.status() : 0;
    const homeHtml = home ? await home.text() : '';
    const credentialsProvided = manualLogin || Boolean(user && password);
    const login = credentialsProvided
      ? await ensureAdminSession({ baseUrl: base, user, password, statePath, manual: manualLogin })
      : { ok: false, reason: 'no-credentials' };
    const site = login.ok ? await readSiteHealth(base, statePath) : {};
    return {
      generatedAt: new Date().toISOString(),
      baseUrl: base,
      access: {
        verdict: accessVerdict({ homeStatus, login, credentialsProvided }),
        mode: 'read-only',
        homeStatus,
        finalUrl: home ? home.url() : null,
        login: { ok: login.ok, reason: login.reason ?? null },
      },
      site: {
        wpVersion: site.wpVersion ?? null,
        environmentType: site.environmentType ?? 'unknown',
        homeUrl: site.homeUrl ?? null,
        siteUrl: site.siteUrl ?? null,
        siteLanguage: site.siteLanguage ?? null,
        plugins: site.plugins ?? [],
      },
      languages: { htmlLang: parseHtmlLang(homeHtml), alternates: parseHreflang(homeHtml) },
      content: await listContent(api, base, maxPosts),
    };
  } finally {
    await api.dispose();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  loadEnvFile(option('--env') || '.env.qa');
  const baseUrl = process.env.QA_BASE_URL;
  if (!baseUrl) {
    console.error('QA_BASE_URL is not set. Copy config/wordpress-qa.example.env to .env.qa and fill it in.');
    process.exit(2);
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const out = option('--out') || path.join(process.env.QA_RUNS_DIR || path.join('qa', 'runs'), `${stamp}-inventory`, 'inventory.json');
  const inventory = await buildInventory({
    baseUrl,
    user: process.env.QA_ADMIN_USER,
    password: process.env.QA_ADMIN_PASSWORD,
    statePath: '.auth/admin.json',
    manualLogin: args.includes('--login-manual'),
    maxPosts: Number(process.env.QA_INVENTORY_MAX_POSTS || 50),
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(inventory, null, 2)}\n`);
  const { access, site, content } = inventory;
  console.log(`Access: ${access.verdict} (home HTTP ${access.homeStatus}; login ${access.login.ok ? 'ok' : access.login.reason})`);
  console.log(`Environment: ${site.environmentType}; WordPress ${site.wpVersion ?? 'unknown'}; ${site.plugins.length} active plugins`);
  console.log(`Content: ${content.items.length} URLs via ${content.source}`);
  console.log(`Written: ${out}`);
  process.exit(access.verdict === 'FAIL' ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

Add to `package.json` scripts: `"qa:inventory": "node scripts/wp-inventory.mjs",`.

- [ ] **Step 8: Run to verify pass**

Run: `node --test tests/integration/inventory.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add lib/wp-session.mjs lib/inventory-parsers.mjs scripts/wp-inventory.mjs tests/unit/inventory-parsers.test.mjs tests/integration/inventory.test.mjs package.json
git commit -m "feat(visual-qa): read site inventory through wp-admin only" -m "Logs in by core element IDs (or by hand for 2FA), reads environment type, versions and plugins from Site Health, and lists pages via REST or the sitemap."
```

---

### Task 9: Scan plan, scanner and aggregation

**Files:**
- Create: `lib/plan.mjs`, `lib/text-diff.mjs`, `lib/aggregate.mjs`, `scripts/visual-qa.mjs` (the `run` command; `finalize` is added in Task 10), `tests/visual/scan.spec.ts`
- Test: `tests/unit/plan.test.mjs`, `tests/unit/aggregate.test.mjs`, `tests/integration/visual-scan.test.mjs`
- Modify: `playwright.config.ts` (add `visual` project), `package.json` (add `"qa:visual": "node scripts/visual-qa.mjs"`)

**Interfaces:**
- Consumes: `checkUrl`, `ensureSlash`, `loadEnvFile` (Task 1); `runProbes`, `stabilizePage` (Task 7); `detectTextDefects` (Task 6); `createFakeWp`, `runProcess` (Task 3).
- Produces: `DEFAULT_VIEWPORTS`; `viewportSize(width): {width, height}`; `pageSlug(url): string`; `newRunId(slug): string`; `normalizePlan(input, { baseUrl }): { ok, errors: string[], plan }` where `plan = { runId, request, mode, audience, viewports: number[], pages: {url, label, slug}[], masks: string[], checkLinks: boolean, baseUrl, host }`; `diffText(before: string[], after: string[]): { added, removed, addedCount, removedCount }`; `writeRecord(runDir, key, record)`; `aggregateRun(runDir, plan): { runId, mode, request, coverage: { planned, scanned, missing: {key, page, viewport, error}[], status: 'COMPLETE'|'INCOMPLETE'|'BLOCKED' }, byId: Record<string, number>, detections: (Detection & { ref, page, viewport, screenshot })[], compare: { key, page, viewport, status, visual?, text? }[] }`.
- Record file `records/<slug>@<width>.json`: `{ page, label, viewport, key, status, detections, network, console, blocked, screenshot, textFile, compare, error? }`. `compare.status` ∈ `BASELINE_SAVED | BASELINE_FAILED | NO_BASELINE | SAME | CHANGED`.

- [ ] **Step 1: Write the failing unit tests**

`tests/unit/plan.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlan, pageSlug, viewportSize, newRunId, DEFAULT_VIEWPORTS } from '../../lib/plan.mjs';

const baseUrl = 'https://site.test';

test('defaults: scan, visitor, four viewports, links checked', () => {
  const { ok, plan } = normalizePlan({ runId: 'r1', pages: ['/'] }, { baseUrl });
  assert.equal(ok, true);
  assert.equal(plan.mode, 'scan');
  assert.equal(plan.audience, 'visitor');
  assert.deepEqual(plan.viewports, DEFAULT_VIEWPORTS);
  assert.deepEqual(DEFAULT_VIEWPORTS, [360, 768, 1366, 1920]);
  assert.equal(plan.checkLinks, true);
  assert.equal(plan.baseUrl, 'https://site.test/');
  assert.equal(plan.host, 'site.test');
  assert.deepEqual(plan.pages, [{ url: 'https://site.test/', label: '/', slug: 'home' }]);
});

test('mutating or foreign pages are refused with a reason', () => {
  const { ok, errors } = normalizePlan({ pages: ['/?add-to-cart=5', 'https://evil.test/'] }, { baseUrl });
  assert.equal(ok, false);
  assert.deepEqual(errors, [
    'page /?add-to-cart=5 refused: mutating-param:add-to-cart',
    'page https://evil.test/ refused: external',
    'plan has no pages',
  ]);
});

test('admin audience may include allow-listed wp-admin pages only', () => {
  assert.equal(normalizePlan({ audience: 'admin', pages: ['/wp-admin/plugins.php'] }, { baseUrl }).ok, true);
  assert.equal(normalizePlan({ audience: 'admin', pages: ['/wp-admin/options.php'] }, { baseUrl }).ok, false);
});

test('invalid mode and viewports are reported', () => {
  const { errors } = normalizePlan({ mode: 'fix', viewports: [100], pages: ['/'] }, { baseUrl });
  assert.deepEqual(errors, ['mode must be one of scan, baseline, compare', 'viewports must be integers between 280 and 3840']);
});

test('slugs are ascii and unique within a plan', () => {
  assert.equal(pageSlug('https://s.test/'), 'home');
  assert.equal(pageSlug('https://s.test/contacts/'), 'contacts');
  assert.equal(pageSlug('https://s.test/shop/?orderby=price'), 'shop-orderby-price');
  const { plan } = normalizePlan({ pages: ['/a-b/', '/a_b/'] }, { baseUrl });
  assert.deepEqual(plan.pages.map((p) => p.slug), ['a-b', 'a-b-2']);
});

test('viewport heights and run ids', () => {
  assert.deepEqual(viewportSize(360), { width: 360, height: 740 });
  assert.deepEqual(viewportSize(1000), { width: 1000, height: 625 });
  assert.match(newRunId('scan'), /^\d{8}T\d{6}Z-scan$/);
});
```

`tests/unit/aggregate.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/plan.mjs`, `lib/text-diff.mjs`, `lib/aggregate.mjs`**

`lib/plan.mjs`:

```js
import { checkUrl, ensureSlash } from './safe-url.mjs';

export const DEFAULT_VIEWPORTS = [360, 768, 1366, 1920];
const HEIGHTS = { 360: 740, 768: 1024, 1366: 768, 1920: 1080 };
const MODES = ['scan', 'baseline', 'compare'];

export function viewportSize(width) {
  return { width, height: HEIGHTS[width] ?? Math.round(width * 0.625) };
}

export function pageSlug(url) {
  const u = new URL(url);
  const raw = `${u.pathname}${u.search ? `-${u.search.slice(1)}` : ''}`.toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'home';
}

export function newRunId(slug) {
  return `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${slug}`;
}

export function normalizePlan(input, { baseUrl }) {
  const errors = [];
  const mode = input.mode ?? 'scan';
  if (!MODES.includes(mode)) errors.push(`mode must be one of ${MODES.join(', ')}`);
  const audience = input.audience ?? 'visitor';
  if (!['visitor', 'admin'].includes(audience)) errors.push('audience must be visitor or admin');
  const viewports = (input.viewports ?? DEFAULT_VIEWPORTS).map(Number);
  if (!viewports.length || viewports.some((w) => !Number.isInteger(w) || w < 280 || w > 3840)) {
    errors.push('viewports must be integers between 280 and 3840');
  }
  const base = ensureSlash(baseUrl);
  const pages = [];
  const used = new Map();
  for (const entry of input.pages ?? []) {
    const raw = typeof entry === 'string' ? entry : entry.url;
    const check = checkUrl(raw, { baseUrl: base, audience });
    if (!check.allowed) {
      errors.push(`page ${raw} refused: ${check.reason}`);
      continue;
    }
    const url = new URL(raw, base).href;
    let slug = pageSlug(url);
    const n = used.get(slug) ?? 0;
    used.set(slug, n + 1);
    if (n) slug = `${slug}-${n + 1}`;
    pages.push({ url, label: (typeof entry === 'object' && entry.label) || new URL(url).pathname, slug });
  }
  if (!pages.length) errors.push('plan has no pages');
  return {
    ok: errors.length === 0,
    errors,
    plan: {
      runId: input.runId,
      request: input.request ?? '',
      mode,
      audience,
      viewports,
      pages,
      masks: (input.masks ?? []).filter((m) => typeof m === 'string'),
      checkLinks: input.checkLinks !== false,
      baseUrl: base,
      host: new URL(base).host.replace(/[^a-z0-9.-]/gi, '_'),
    },
  };
}
```

`lib/text-diff.mjs`:

```js
const counts = (list) => list.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());

export function diffText(before, after) {
  const a = counts(before);
  const b = counts(after);
  const removed = [...a].flatMap(([t, n]) => Array(Math.max(0, n - (b.get(t) || 0))).fill(t));
  const added = [...b].flatMap(([t, n]) => Array(Math.max(0, n - (a.get(t) || 0))).fill(t));
  return { added: added.slice(0, 50), removed: removed.slice(0, 50), addedCount: added.length, removedCount: removed.length };
}
```

`lib/aggregate.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';

export function writeRecord(runDir, key, record) {
  const dir = path.join(runDir, 'records');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(record, null, 2));
}

export function aggregateRun(runDir, plan) {
  const planned = plan.pages.flatMap((p) => plan.viewports.map((w) => ({ key: `${p.slug}@${w}`, page: p.url, viewport: w })));
  const records = [];
  const missing = [];
  for (const item of planned) {
    const file = path.join(runDir, 'records', `${item.key}.json`);
    const record = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if (record && record.screenshot) records.push(record);
    else missing.push({ ...item, error: record?.error ?? 'no record written' });
  }
  const detections = [];
  const seenLinks = new Set();
  for (const r of records) {
    for (const d of r.detections) {
      if (d.id === 'NET-BROKEN-LINK') {
        if (seenLinks.has(d.evidence)) continue;
        seenLinks.add(d.evidence);
      }
      detections.push({ ref: `D${detections.length + 1}`, ...d, page: r.page, viewport: r.viewport, screenshot: r.screenshot });
    }
  }
  const byId = {};
  for (const d of detections) byId[d.id] = (byId[d.id] || 0) + 1;
  const compare = records.filter((r) => r.compare).map((r) => ({ key: r.key, page: r.page, viewport: r.viewport, ...r.compare }));
  const status = records.length === 0 ? 'BLOCKED' : missing.length ? 'INCOMPLETE' : 'COMPLETE';
  return {
    runId: plan.runId,
    mode: plan.mode,
    request: plan.request,
    coverage: { planned: planned.length, scanned: records.length, missing, status },
    byId,
    detections,
    compare,
  };
}
```

- [ ] **Step 4: Run unit tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Add the `visual` project and the scan spec**

In `playwright.config.ts` add to `projects`:

```ts
    {
      name: 'visual',
      testDir: './tests/visual',
      // Relative templates resolve against this config's directory.
      snapshotPathTemplate: `${(process.env.QA_BASELINES_DIR || 'qa/baselines').replace(/\\/g, '/')}/{arg}{ext}`,
      use: { browserName: 'chromium' },
    },
```

`tests/visual/scan.spec.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { runProbes, stabilizePage } from '../../lib/probes.mjs';
import { detectTextDefects } from '../../lib/text-detectors.mjs';
import { checkUrl } from '../../lib/safe-url.mjs';
import { viewportSize } from '../../lib/plan.mjs';
import { diffText } from '../../lib/text-diff.mjs';
import { writeRecord } from '../../lib/aggregate.mjs';

const planFile = process.env.QA_SCAN_PLAN;
const runDir = process.env.QA_RUN_DIR || '';
const plan: any = planFile ? JSON.parse(fs.readFileSync(planFile, 'utf8')) : null;

test.skip(!plan || !runDir, 'The visual project runs only through scripts/visual-qa.mjs');
test.describe.configure({ timeout: 180_000 });

const SHOT = { fullPage: true, animations: 'disabled' as const, caret: 'hide' as const };

if (plan) {
  if (plan.audience === 'admin') test.use({ storageState: '.auth/admin.json' });
  const origin = new URL(plan.baseUrl).origin;

  for (const width of plan.viewports as number[]) {
    test.describe(`${width}px`, () => {
      test.use({ viewport: viewportSize(width), isMobile: width < 768, hasTouch: width < 768, deviceScaleFactor: 1 });

      for (const target of plan.pages) {
        test(`${target.label} @ ${width}`, async ({ page }, testInfo) => {
          const key = `${target.slug}@${width}`;
          const record: any = { page: target.url, label: target.label, viewport: width, key, status: null, detections: [], network: [], console: [], blocked: [], screenshot: null, textFile: null, compare: null };
          try {
            const guard = checkUrl(target.url, { baseUrl: plan.baseUrl, audience: plan.audience });
            if (!guard.allowed) throw new Error(`refused by URL filter: ${guard.reason}`);

            // Read-only guarantee inside the page: same-origin writes and
            // navigations to refused URLs never leave the browser.
            await page.route('**/*', (route) => {
              const req = route.request();
              const sameOrigin = req.url().startsWith(origin);
              if (sameOrigin && !['GET', 'HEAD'].includes(req.method())) {
                record.blocked.push(`${req.method()} ${req.url()}`);
                return route.abort();
              }
              if (sameOrigin && req.isNavigationRequest() && !checkUrl(req.url(), { baseUrl: plan.baseUrl, audience: plan.audience }).allowed) {
                record.blocked.push(`NAVIGATE ${req.url()}`);
                return route.abort();
              }
              return route.continue();
            });
            page.on('console', (msg) => { if (msg.type() === 'error') record.console.push(msg.text().slice(0, 300)); });
            page.on('pageerror', (err) => record.console.push(`uncaught: ${err.message.slice(0, 300)}`));
            page.on('response', (res) => { if (res.status() >= 400) record.network.push({ url: res.url(), status: res.status() }); });

            const response = await page.goto(target.url, { waitUntil: 'load', timeout: 45_000 });
            record.status = response?.status() ?? null;
            const finalUrl = response?.url() ?? target.url;
            await stabilizePage(page);
            const probes = await runProbes(page);

            if (record.status && record.status >= 400) {
              record.detections.push({ id: 'NET-HTTP-ERROR', severity: record.status >= 500 ? 'critical' : 'high', message: `Page returned HTTP ${record.status}`, selector: '', match: String(record.status), evidence: target.url });
            }
            record.detections.push(...probes.detections, ...detectTextDefects(probes.blocks, probes.meta));
            for (const n of record.network) {
              if (n.url === finalUrl) continue;
              record.detections.push({ id: 'NET-HTTP-ERROR', severity: 'medium', message: `Resource returned HTTP ${n.status}`, selector: '', match: String(n.status), evidence: n.url });
            }
            if (record.console.length) {
              record.detections.push({ id: 'NET-CONSOLE-ERROR', severity: 'low', message: `${record.console.length} console error(s)`, selector: '', match: '', evidence: record.console.slice(0, 3).join(' | ') });
            }

            // Links are checked once per page, on the first viewport of the plan.
            if (plan.checkLinks && width === plan.viewports[0]) {
              for (const link of probes.links.slice(0, 50)) {
                if (link === finalUrl || !checkUrl(link, { baseUrl: plan.baseUrl, audience: plan.audience }).allowed) continue;
                const res = await page.request.get(link, { maxRedirects: 5, failOnStatusCode: false, timeout: 15_000 }).catch(() => null);
                if (res && res.status() >= 400) {
                  record.detections.push({ id: 'NET-BROKEN-LINK', severity: 'medium', message: `Link returns HTTP ${res.status()}`, selector: '', match: String(res.status()), evidence: link });
                }
              }
            }

            const masks = plan.masks.map((m: string) => page.locator(m));
            fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });
            fs.mkdirSync(path.join(runDir, 'text'), { recursive: true });
            await page.screenshot({ ...SHOT, mask: masks, path: path.join(runDir, 'screenshots', `${key}.png`) });
            record.screenshot = `screenshots/${key}.png`;
            fs.writeFileSync(path.join(runDir, 'text', `${key}.json`), JSON.stringify({ url: target.url, lang: probes.meta.lang, title: probes.meta.title, blocks: probes.blocks }, null, 2));
            record.textFile = `text/${key}.json`;

            if (plan.mode !== 'scan') {
              const name = [plan.host, `${key}.png`];
              const baselinePng = testInfo.snapshotPath(...name, { kind: 'screenshot' });
              const baselineText = baselinePng.replace(/\.png$/, '.text.json');
              const texts = probes.blocks.map((b: any) => b.text);
              if (plan.mode === 'baseline') {
                try {
                  await expect(page).toHaveScreenshot(name, { ...SHOT, mask: masks, timeout: 20_000 });
                  fs.writeFileSync(baselineText, JSON.stringify(texts));
                  record.compare = { status: 'BASELINE_SAVED' };
                } catch (error: any) {
                  record.compare = { status: 'BASELINE_FAILED', error: String(error?.message ?? error).slice(0, 300) };
                }
              } else if (!fs.existsSync(baselinePng)) {
                record.compare = { status: 'NO_BASELINE' };
              } else {
                let visual = 'SAME';
                try {
                  await expect(page).toHaveScreenshot(name, { ...SHOT, mask: masks, maxDiffPixelRatio: 0.01, timeout: 20_000 });
                } catch {
                  visual = 'CHANGED';
                  if (fs.existsSync(testInfo.outputDir)) fs.cpSync(testInfo.outputDir, path.join(runDir, 'diffs', key), { recursive: true });
                }
                const text = fs.existsSync(baselineText) ? diffText(JSON.parse(fs.readFileSync(baselineText, 'utf8')), texts) : null;
                const textChanged = Boolean(text && (text.addedCount || text.removedCount));
                record.compare = { status: visual === 'SAME' && !textChanged ? 'SAME' : 'CHANGED', visual, text };
              }
            }
          } catch (error: any) {
            record.error = String(error?.message ?? error).slice(0, 500);
            throw error;
          } finally {
            writeRecord(runDir, key, record);
          }
        });
      }
    });
  }
}
```

- [ ] **Step 6: Implement `scripts/visual-qa.mjs` (`run` command)**

```js
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
```

Add to `package.json` scripts: `"qa:visual": "node scripts/visual-qa.mjs",`.

- [ ] **Step 7: Write the integration test**

`tests/integration/visual-scan.test.mjs`:

```js
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

test('an unreachable site is BLOCKED with exit code 1', async () => {
  const dirs = { runs: tmp('wpqa-runs-'), baselines: tmp('wpqa-base-') };
  const { status, summary } = await scan('http://127.0.0.1:9', { runId: 'down-1', pages: ['/'], viewports: [360] }, dirs);
  assert.equal(status, 1);
  assert.equal(summary.coverage.status, 'BLOCKED');
  assert.match(summary.coverage.missing[0].error, /ERR_CONNECTION_REFUSED|ECONNREFUSED/);
});
```

- [ ] **Step 8: Run to verify pass**

Run: `node --test tests/integration/visual-scan.test.mjs`
Expected: PASS (3 tests). If `SAME` comes back `CHANGED`, inspect `diffs/` in the temp run dir before loosening anything; a flaky baseline is a scanner bug (stabilisation), not a reason to raise `maxDiffPixelRatio`.

- [ ] **Step 9: Commit**

```bash
git add lib/plan.mjs lib/text-diff.mjs lib/aggregate.mjs scripts/visual-qa.mjs tests/visual tests/unit/plan.test.mjs tests/unit/aggregate.test.mjs tests/integration/visual-scan.test.mjs playwright.config.ts package.json
git commit -m "feat(visual-qa): scan pages across viewports with screenshots and detectors" -m "Each page is opened as an anonymous visitor, screenshotted, text-extracted and checked, and baseline and compare modes report visual and text changes for review."
```

---

### Task 10: Review, verdict, findings and report (`finalize`)

**Files:**
- Create: `lib/review.mjs`, `lib/findings.mjs`, `lib/report.mjs`
- Modify: `scripts/visual-qa.mjs` (add `finalize`)
- Test: `tests/unit/review.test.mjs`, `tests/unit/findings.test.mjs`, `tests/unit/report.test.mjs`

**Interfaces:**
- Consumes: aggregate summary (Task 9).
- Produces: `applyReview(summary, review?): { confirmed: Confirmed[], rejected: {ref,id,page,viewport,reason}[], undecided: string[], unreviewedChanges: string[], missingBaselines: string[] }` where `Confirmed = { source: 'detector'|'agent', id, page, viewport, severity, title, evidence, actual, note, area: 'visual'|'content'|'network', testId }`; `scanVerdict(summary, applied): { verdict: 'PASS'|'FAIL'|'REVIEW'|'BLOCKED', reasons: string[] }`; `shortHash(s): string`; `mergeFindings(store, confirmed, { runId, now }): { store, touched: string[] }`; `renderReport({ plan, summary, applied, result, findingIds }): string`.
- `review.json` (written by the agent): `{ decisions: [{ ref, decision: 'confirmed'|'rejected', reason, severity? }], agentFindings: [{ id, page, viewport?, severity?, title, quote?, evidence? }], compareDecisions: [{ key, decision: 'expected'|'regression', reason, severity? }] }`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/review.test.mjs`:

```js
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
```

`tests/unit/findings.test.mjs`:

```js
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
```

`tests/unit/report.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`lib/review.mjs`:

```js
const areaOf = (id) => (id.startsWith('VIS-') || id === 'AGT-LAYOUT' || id === 'CMP-REGRESSION' ? 'visual' : id.startsWith('NET-') ? 'network' : 'content');

export function shortHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url);
  }
}

function normalize({ anchor, ...item }) {
  return { ...item, area: areaOf(item.id), testId: `${item.id}@${pathOf(item.page)}@${item.viewport ?? 'any'}@${shortHash(String(anchor))}` };
}

export function applyReview(summary, review = {}) {
  const r = review || {};
  const decisions = new Map((r.decisions ?? []).map((d) => [d.ref, d]));
  const confirmed = [];
  const rejected = [];
  const undecided = [];
  for (const d of summary.detections) {
    const decision = decisions.get(d.ref);
    if (!decision) {
      undecided.push(d.ref);
    } else if (decision.decision === 'confirmed') {
      confirmed.push(normalize({ source: 'detector', id: d.id, page: d.page, viewport: d.viewport, severity: decision.severity ?? d.severity, title: d.message, evidence: d.screenshot, actual: d.evidence, note: decision.reason ?? null, anchor: d.selector || d.match || d.evidence }));
    } else {
      rejected.push({ ref: d.ref, id: d.id, page: d.page, viewport: d.viewport, reason: decision.reason });
    }
  }
  for (const f of r.agentFindings ?? []) {
    confirmed.push(normalize({ source: 'agent', id: f.id, page: f.page, viewport: f.viewport ?? null, severity: f.severity ?? 'low', title: f.title, evidence: f.evidence ?? null, actual: f.quote ?? f.title, note: null, anchor: f.quote ?? f.title }));
  }
  const compareDecisions = new Map((r.compareDecisions ?? []).map((c) => [c.key, c]));
  const unreviewedChanges = [];
  const missingBaselines = [];
  for (const c of summary.compare ?? []) {
    if (c.status === 'NO_BASELINE' || c.status === 'BASELINE_FAILED') {
      missingBaselines.push(c.key);
      continue;
    }
    if (c.status !== 'CHANGED') continue;
    const decision = compareDecisions.get(c.key);
    if (!decision) unreviewedChanges.push(c.key);
    else if (decision.decision === 'regression') {
      confirmed.push(normalize({ source: 'agent', id: 'CMP-REGRESSION', page: c.page, viewport: c.viewport, severity: decision.severity ?? 'medium', title: decision.reason, evidence: `diffs/${c.key}`, actual: decision.reason, note: null, anchor: c.key }));
    }
  }
  return { confirmed, rejected, undecided, unreviewedChanges, missingBaselines };
}

export function scanVerdict(summary, applied) {
  if (summary.coverage.status === 'BLOCKED') return { verdict: 'BLOCKED', reasons: ['Жодна сторінка не була просканована.'] };
  const gaps = [];
  if (summary.coverage.status === 'INCOMPLETE') gaps.push(`Не проскановано ${summary.coverage.missing.length} з ${summary.coverage.planned} перевірок.`);
  if (applied.confirmed.length) return { verdict: 'FAIL', reasons: [`Підтверджено дефектів: ${applied.confirmed.length}.`, ...gaps] };
  if (applied.undecided.length) gaps.push(`Знахідки без рішення рев'ю: ${applied.undecided.join(', ')}.`);
  if (applied.unreviewedChanges.length) gaps.push(`Зміни без оцінки: ${applied.unreviewedChanges.join(', ')}.`);
  if (applied.missingBaselines.length) gaps.push(`Немає еталона (baseline) для: ${applied.missingBaselines.join(', ')}.`);
  return gaps.length ? { verdict: 'REVIEW', reasons: gaps } : { verdict: 'PASS', reasons: [] };
}
```

`lib/findings.mjs`:

```js
const EXPECTED = {
  'VIS-OVERFLOW-X': 'Сторінка вміщується в ширину екрана без горизонтального прокручування',
  'VIS-IMG-BROKEN': 'Зображення завантажується',
  'VIS-IMG-DISTORTED': 'Зображення зберігає пропорції',
  'VIS-OVERLAP': 'Кнопки й посилання нічим не перекриті',
  'VIS-TEXT-CLIPPED': 'Текст повністю видно',
  'TXT-SHORTCODE': 'Шорткод виводить свій вміст, а не текст у дужках',
  'TXT-PHP-ERROR': 'На сторінці немає повідомлень про помилки PHP',
  'TXT-MOJIBAKE': 'Текст відображається в правильному кодуванні',
  'TXT-PLACEHOLDER': 'На сторінці немає тестового чи стандартного тексту',
  'TXT-UNRENDERED': 'HTML-сутності й змінні шаблону не видно відвідувачу',
  'TXT-DUP-WORD': 'Слова не повторюються поспіль',
  'TXT-MIXED-SCRIPT': 'Слова написані літерами одного алфавіту',
  'TXT-LANG-LEAK': 'Текст написаний мовою сторінки',
  'TXT-EMPTY-CONTROL': 'Кнопки й посилання мають текст або підпис',
  'NET-HTTP-ERROR': 'Сторінка й ресурси відповідають без помилок',
  'NET-CONSOLE-ERROR': 'У консолі браузера немає помилок',
  'NET-BROKEN-LINK': 'Внутрішні посилання ведуть на існуючі сторінки',
  'AGT-TYPO': 'Текст без друкарських помилок',
  'AGT-GRAMMAR': 'Текст граматично правильний',
  'AGT-UNTRANSLATED': 'Увесь текст перекладено мовою сторінки',
  'AGT-LAYOUT': 'Блоки вирівняні й читаються',
  'CMP-REGRESSION': 'Після зміни сторінка виглядає як до неї, крім запланованих змін',
};

export function mergeFindings(store, confirmed, { runId, now }) {
  const findings = store.findings.map((f) => ({ ...f }));
  const year = now.slice(0, 4);
  let next = findings
    .filter((f) => f.id.startsWith(`BUG-${year}-`))
    .map((f) => Number(f.id.split('-')[2]))
    .reduce((a, b) => Math.max(a, b), 0);
  const touched = [];
  for (const c of confirmed) {
    const existing = findings.find((f) => f.testId === c.testId);
    if (existing) {
      if (existing.lastSeenRunId !== runId) {
        existing.occurrences = (existing.occurrences || 1) + 1;
        existing.lastSeenAt = now;
        existing.lastSeenRunId = runId;
        if (['FIXED', 'VERIFIED', 'CLOSED'].includes(existing.status)) existing.status = 'REOPENED';
      }
      touched.push(existing.id);
      continue;
    }
    next += 1;
    const finding = {
      id: `BUG-${year}-${String(next).padStart(3, '0')}`,
      title: c.title,
      testId: c.testId,
      area: c.area,
      severity: c.severity,
      status: 'OPEN',
      confidence: 'CONFIRMED',
      firstSeenAt: now,
      lastSeenAt: now,
      firstSeenRunId: runId,
      lastSeenRunId: runId,
      occurrences: 1,
      expected: EXPECTED[c.id] ?? null,
      actual: c.actual,
      nextAction: c.note ?? null,
      assignedTo: null,
      githubIssue: null,
      evidence: c.evidence ? [c.evidence] : [],
    };
    findings.push(finding);
    touched.push(finding.id);
  }
  return { store: { ...store, updatedAt: now, findings }, touched };
}
```

`lib/report.mjs`:

```js
const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderReport({ plan, summary, applied, result, findingIds }) {
  const lines = [
    '# Звіт візуальної та текстової перевірки', '',
    `- **Запит:** ${plan.request || '—'}`,
    `- **Сайт:** ${plan.baseUrl}`,
    `- **Режим:** ${plan.mode} · **Аудиторія:** ${plan.audience === 'admin' ? 'адміністратор' : 'відвідувач'}`,
    `- **Вердикт:** \`${result.verdict}\``,
    `- **Покриття:** ${summary.coverage.scanned}/${summary.coverage.planned} перевірок (сторінка × ширина екрана)`, '',
  ];
  if (result.reasons.length) lines.push('## Чому такий вердикт', '', ...result.reasons.map((r) => `- ${r}`), '');

  lines.push('## Підтверджені дефекти', '');
  if (!applied.confirmed.length) lines.push('Немає.', '');
  else {
    lines.push('| Джерело | ID | Сторінка | Ширина | Серйозність | Що не так | Фрагмент | Доказ |', '|---|---|---|---:|---|---|---|---|');
    for (const c of applied.confirmed) {
      lines.push(`| ${c.source === 'detector' ? 'детектор' : 'агент'} | ${c.id} | ${cell(c.page)} | ${c.viewport ?? '—'} | ${c.severity} | ${cell(c.title)} | ${cell(c.actual)} | ${cell(c.evidence)} |`);
    }
    lines.push('');
  }

  if (applied.rejected.length) {
    lines.push('## Відхилені автоматичні знахідки', '');
    for (const r of applied.rejected) lines.push(`- ${r.ref} ${r.id} (${r.page}, ${r.viewport}px): ${r.reason ?? 'без причини'}`);
    lines.push('');
  }

  const gaps = [
    ...summary.coverage.missing.map((m) => `${m.key} — ${m.error}`),
    ...applied.undecided.map((ref) => `${ref} — немає рішення рев'ю`),
    ...applied.unreviewedChanges.map((k) => `${k} — зміна без оцінки`),
    ...applied.missingBaselines.map((k) => `${k} — немає еталона`),
  ];
  lines.push('## Що не перевірено або не оцінено', '');
  lines.push(...(gaps.length ? gaps.map((g) => `- ${g}`) : ['Усе заплановане перевірено й оцінено.']), '');

  if (summary.compare?.length) {
    lines.push('## Порівняння з еталоном', '');
    for (const c of summary.compare) lines.push(`- ${c.key}: ${c.status}${c.text ? ` (текст: +${c.text.addedCount}/−${c.text.removedCount})` : ''}`);
    lines.push('');
  }

  lines.push('## Реєстр дефектів', '', findingIds.length ? `Оновлено в \`qa/findings.json\`: ${findingIds.join(', ')}.` : 'Без змін.', '');
  return lines.join('\n');
}
```

Add `finalize` to `scripts/visual-qa.mjs`. Add imports at the top:

```js
import { applyReview, scanVerdict } from '../lib/review.mjs';
import { mergeFindings } from '../lib/findings.mjs';
import { renderReport } from '../lib/report.mjs';
```

Add the function (before `loadEnvFile(...)`):

```js
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
```

Replace the dispatch at the bottom with:

```js
loadEnvFile(option('--env') || '.env.qa');
if (command === 'run') run(target);
else if (command === 'finalize') finalize(target);
else fail('Usage: node scripts/visual-qa.mjs run <plan.json> [--dry-run] [--env <file>] | finalize <run-dir> [--env <file>]');
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Extend the integration test with finalize**

Append to `tests/integration/visual-scan.test.mjs`:

```js
test('finalize: undecided -> REVIEW, then a confirmed shortcode -> FAIL with a finding', async (t) => {
  const wp = createFakeWp();
  const url = await wp.start();
  t.after(() => wp.stop());
  const dirs = { runs: tmp('wpqa-runs-'), baselines: tmp('wpqa-base-') };
  const { summary } = await scan(url, { runId: 'fin-1', request: 'перевір текст', pages: ['/text-defects/'], viewports: [1366], checkLinks: false }, dirs);
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
```

Run: `node --test tests/integration/visual-scan.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/review.mjs lib/findings.mjs lib/report.mjs scripts/visual-qa.mjs tests/unit/review.test.mjs tests/unit/findings.test.mjs tests/unit/report.test.mjs tests/integration/visual-scan.test.mjs
git commit -m "feat(visual-qa): compute verdicts and findings from the agent's review" -m "The verdict follows fixed rules over coverage and review decisions, confirmed defects are merged into the findings registry, and a report is written for the run."
```

---

### Task 11: Skills and `/wp-check`

**Files:**
- Create: `skills/wp-admin-access/SKILL.md`, `skills/wp-visual-content-qa/SKILL.md`, `skills/wp-visual-content-qa/references/defect-catalog.md`, `commands/wp-check.md`
- Modify: frontmatter of `skills/playwright-test-planner/SKILL.md`, `skills/wordpress-evidence-reporter/SKILL.md`, `skills/wordpress-test-tracker/SKILL.md`, `skills/wordpress-environment-guard/SKILL.md`, `skills/wordpress-fixture-manager/SKILL.md`, `skills/wordpress-state-verifier/SKILL.md`, `skills/wordpress-update-smoke/SKILL.md`; `commands/wordpress-qa.md`

- [ ] **Step 1: Write `skills/wp-admin-access/SKILL.md`**

```markdown
---
name: wp-admin-access
description: Use when a WordPress site is reachable only through a browser and a wp-admin login (no SSH, WP-CLI, database or code) and QA is about to start, or when the tester says "ось доступ до адмінки", "підключись до сайту", "що є на сайті", "онови список сторінок". Logs in once, reads the environment type, WordPress version and active plugins from Site Health, and lists pages, posts, products and languages — without changing anything on the site.
allowed-tools: Read, Grep, Glob, Bash(node scripts/wp-inventory.mjs:*)
---
# WordPress admin-only access

The tester has a wp-admin login and nothing else. WP-CLI, SSH, SQL and `scripts/validate-config.sh` do not exist for them — do not use them here. (`wordpress-environment-guard` is the WP-CLI variant for local/staging setups.)

## Procedure

1. Check that `.env.qa` defines `QA_BASE_URL`, `QA_ADMIN_USER`, `QA_ADMIN_PASSWORD`: `Grep` for the key names only, never read or print the values. If the file or a key is missing, ask the tester to copy `config/wordpress-qa.example.env` to `.env.qa` and fill it in. Never ask for the password in chat.
2. Run `node scripts/wp-inventory.mjs --out qa/runs/<run-id>/inventory.json`, with `<run-id>` = UTC `YYYYMMDDTHHMMSSZ-inventory`.
   - Login reason `no-admin-bar-after-login` (2FA, captcha, custom login URL): run again with `--login-manual`. A browser window opens; the tester logs in by hand; the session is saved to `.auth/admin.json`.
3. Report to the tester, in their language:
   - access verdict (`PASS`, `REVIEW`, `FAIL`) and the reason;
   - environment type from Site Health (`production`, `staging`, … or `unknown`) — say plainly that production and unknown mean read-only (this flow never changes the site anyway);
   - WordPress version, active plugins with versions, languages (`htmlLang`, hreflang alternates), content source (`rest`, `sitemap`, `none`) and URL count.
4. Content source `none`: ask the tester which pages to check.

## Hard rules

- GET requests only. The single POST is the login form.
- Never click, type or submit anything else in wp-admin, including through browser MCP tools. If the tester asks for a change on the site, say this flow is read-only and that site changes go through the Write Guard confirmation described in AGENTS.md.
- Never print the password, cookies or the contents of `.auth/admin.json`.
- Access `FAIL` (site down, login rejected) stops QA: report `BLOCKED` with the reason; it is not a site defect.
```

- [ ] **Step 2: Write `skills/wp-visual-content-qa/SKILL.md`**

````markdown
---
name: wp-visual-content-qa
description: Use when a tester asks, in their own words, to check how a WordPress site looks or reads — layout breaking on mobile, overlapping or cut-off elements, broken images, typos, placeholder or untranslated text, visible shortcodes or PHP warnings, mojibake, broken links — or to take a before/after baseline around a plugin, theme, menu or content change. Works with a wp-admin login only (no code or server access). Triggers - "перевір сторінку", "глянь на мобілці", "знайди помилки в тексті", "чи нічого не поїхало", "пройдись по всьому сайту", "зроби baseline", "порівняй після оновлення", "/wp-check".
allowed-tools: Read, Grep, Glob, Bash(node scripts/visual-qa.mjs:*)
---
# Visual & content QA for WordPress (admin-only access)

Do exactly what the tester asked — no more, no less. This is not code testing: no PHPCS, PHPUnit, WP-CLI, fixtures or checkout flows.

## 0. Preconditions

The newest `qa/runs/*-inventory/inventory.json` exists and `access.verdict` is not `FAIL`. Otherwise use the `wp-admin-access` skill first.

## 1. Turn the request into a plan

Write `qa/runs/<run-id>/plan-input.json` (`<run-id>` = UTC `YYYYMMDDTHHMMSSZ-<mode>`):

```json
{ "runId": "<run-id>", "request": "<the tester's words, verbatim>", "mode": "scan", "audience": "visitor",
  "pages": ["/", "/kontakty/"], "viewports": [360, 768], "masks": [".cookie-notice"], "checkLinks": true }
```

| The tester says | Plan |
|---|---|
| "перевір головну і контакти на мобілці" | those 2 URLs; viewports `[360, 768]`; `scan` |
| "пройдись по всьому сайту" | every inventory item of type `page` + up to 20 newest posts/products; `[360, 1366]`; `scan` |
| "знайди помилки в тексті" | the pages named (or all pages); `[1366]`; `scan` |
| "я поміняв меню — чи нічого не поїхало" | home + up to 5 key pages; all 4 viewports; `compare` if a baseline exists for them, else `scan` |
| "зроби baseline перед оновленням …" | key pages; all 4 viewports; `baseline` |
| "порівняй після оновлення" | same pages and viewports as the latest `baseline` run; `compare` |
| "перевір адмінку / чернетки" | `audience: "admin"`; only `/wp-admin/` index, edit, plugins, site-health, nav-menus |

- Resolve names to URLs from the inventory ("контакти" → the item whose title or slug matches). Several or no matches: ask.
- Vague request ("перевір сайт") or more than 40 page × viewport checks: run with `--dry-run` first, show the page list, viewports, mode and check count, and wait for a yes.
- Add `masks` (CSS selectors) for regions that change on every load: sliders, cookie banners, dates, counters, live chat.
- `audience: "visitor"` unless the request is explicitly about wp-admin or unpublished content.

## 2. Scan

`node scripts/visual-qa.mjs run qa/runs/<run-id>/plan-input.json`

Output in `qa/runs/<run-id>/`: `plan.json`, `records/`, `screenshots/`, `text/`, `detections.json`, `diffs/` (compare only).
Coverage `BLOCKED`: stop and report `BLOCKED` with the printed errors. Do not review anything.

## 3. Review — you are the second pair of eyes

Detectors produce candidates, not verdicts.

1. For each detection in `detections.json` (each has a `ref`): Read its screenshot, find the element, decide `confirmed` or `rejected` with a one-line reason. Typical false positives: intentional carousels, off-canvas menus, decorative duplicate words, brand names that mix alphabets. See `references/defect-catalog.md`.
2. Look at every screenshot of the narrowest and the widest viewport for what detectors cannot see — misaligned or overlapping blocks, cut-off headers, unreadable contrast, empty sections, broken menus → `AGT-LAYOUT`.
3. Read `text/<slug>@<widest>.json` in the page's language (`lang`; if empty, infer it from the text): typos → `AGT-TYPO`, grammar → `AGT-GRAMMAR`, untranslated or mixed-language text → `AGT-UNTRANSLATED`. Quote the exact text. Report only what you are sure is wrong in that language.
4. Compare mode: for each `CHANGED` entry look at `diffs/<key>/` and the text diff in its record → `expected` (matches the change the tester made) or `regression`.

Write `qa/runs/<run-id>/review.json`:

```json
{ "decisions": [{ "ref": "D1", "decision": "confirmed", "reason": "форма не виводиться", "severity": "medium" }],
  "agentFindings": [{ "id": "AGT-TYPO", "page": "https://site/kontakty/", "viewport": 1366, "severity": "low",
                      "title": "Помилка: «адрес» замість «адреса»", "quote": "Наша адрес", "evidence": "screenshots/kontakty@1366.png" }],
  "compareDecisions": [{ "key": "home@1366", "decision": "regression", "reason": "меню переноситься на два рядки" }] }
```

Every detection needs a decision; a missing one keeps the verdict at `REVIEW`.

## 4. Finalize

`node scripts/visual-qa.mjs finalize qa/runs/<run-id>`

It computes the verdict, merges confirmed defects into `qa/findings.json` and writes `summary.json` and `report.md`. Never write a verdict yourself and never edit `qa/findings.json` by hand.

## 5. Answer the tester

In the tester's language: verdict and its reasons, coverage (N/N), confirmed defects grouped by page (what, where, viewport, screenshot path, detector or your own judgment), what was not checked, and the path to `report.md`.

## Hard rules

- Read-only. The scanner sends GET requests only and refuses nonce/action/logout/add-to-cart URLs. Do not work around it with browser MCP clicks.
- Never report `PASS` yourself — the verdict comes from `finalize`.
- Never set a finding to `CLOSED`.
- Do not fix anything on the site, even if asked in the same message. Report it and point to the Write Guard flow in AGENTS.md.
````

- [ ] **Step 3: Write `skills/wp-visual-content-qa/references/defect-catalog.md`**

```markdown
# Defect catalog

| ID | What it means | Typical WordPress cause | Confirm by | Common false positive |
|---|---|---|---|---|
| VIS-OVERFLOW-X | An element sticks out past the screen width; the page scrolls sideways or content is cut | Fixed-width tables/iframes/embeds, long unbroken URLs, page-builder columns with fixed px widths | Screenshot at that width shows a cut or sideways scroll | Element inside a carousel the probe could not recognise |
| VIS-IMG-BROKEN | Image failed to load | Media deleted, wrong URL after migration, hotlink protection, mixed http/https | Blank or broken-icon area in the screenshot | Tracking pixel with empty alt |
| VIS-IMG-DISTORTED | Image stretched or squashed (> 5 %) | Fixed width and height in CSS/builder, `object-fit` missing | Visibly stretched faces, logos, charts | Deliberate artistic stretch (rare) |
| VIS-OVERLAP | A button or link is covered by another element | Absolute-positioned badges, negative margins, z-index bugs | Screenshot shows the control hidden or partly covered | Transparent overlay wrappers that pass clicks through |
| VIS-TEXT-CLIPPED | Text cut off by its container | Fixed button height/width, translated labels longer than the English ones | Screenshot shows cut words | Decorative marquee text |
| TXT-SHORTCODE | `[shortcode]` shown as text | Plugin deactivated, shortcode misspelled, page builder removed | Brackets visible on the page | Legitimate bracketed text like `[to-do]` in an article |
| TXT-PHP-ERROR | PHP warning/notice/fatal or wp_die page visible | `WP_DEBUG_DISPLAY` on production, plugin/PHP version mismatch | Text visible in screenshot | Article that quotes an error message |
| TXT-MOJIBAKE | `Ð¿Ñ€`, `â€™`, `Ã©`, `�` | Database or export in the wrong charset, copy-paste from Word | Garbled characters visible | None known |
| TXT-PLACEHOLDER | Lorem ipsum, "Sample Page", "Hello world!", tagline "Just another WordPress site" | Demo content left after theme import | Text visible | A page about placeholder text |
| TXT-UNRENDERED | `&nbsp;`, `<p>`, `{{name}}`, `%s` visible | Double-escaped content, broken translation strings, email/SMS templates on pages | Text visible | Code samples in a blog post |
| TXT-DUP-WORD | Same word twice in a row | Editing slip | Read the sentence | Intentional repetition ("так, так") |
| TXT-MIXED-SCRIPT | One word mixes Cyrillic and Latin letters (`Kиїв`) | Keyboard layout slip, copy-paste | Zoomed text or the quote | Brand names written that way on purpose |
| TXT-LANG-LEAK | ы/э/ъ/ё on a Ukrainian page (or і/ї/є/ґ on a Russian one) | Russian copy or machine translation left in place | Read the sentence | Quoted names or citations |
| TXT-EMPTY-CONTROL | Link or button with no text or label | Icon fonts without `aria-label`, empty builder buttons | Screenshot shows an icon-only control | Decorative links hidden from assistive tech but not marked as such |
| NET-HTTP-ERROR | Page or resource answered 4xx/5xx | Deleted pages still in menus, missing CSS/JS after plugin removal, server errors | Status in the record | Third-party resources blocked by ad-blocking in the browser |
| NET-CONSOLE-ERROR | JavaScript errors in the console | Plugin conflicts, jQuery version issues | Messages in the record | Third-party analytics noise |
| NET-BROKEN-LINK | Internal link leads to 4xx/5xx | Renamed slugs, deleted pages, typos in menus | Status in the record | Links that need login |

Agent judgment IDs: `AGT-TYPO`, `AGT-GRAMMAR`, `AGT-UNTRANSLATED`, `AGT-LAYOUT`. Compare: `CMP-REGRESSION`.
```

- [ ] **Step 3b: Write `commands/wp-check.md`**

```markdown
---
description: Visual and content QA of a WordPress site with wp-admin access only (read-only)
argument-hint: <what to check, in your own words>
---
The tester's request: $ARGUMENTS

1. If there is no `qa/runs/*-inventory/inventory.json`, or the newest one is older than 24 hours, use the `wp-admin-access` skill first.
2. Use the `wp-visual-content-qa` skill and do exactly what the request asks.
3. Reply with the verdict, coverage, confirmed defects and the path to `report.md`.

This workflow never changes the site. For local or staging sites with WP-CLI access, `/wordpress-qa` is the CI-style workflow.
```

- [ ] **Step 4: Update the existing skills' frontmatter**

Set these exact frontmatter blocks (bodies unchanged except where noted):

`skills/playwright-test-planner/SKILL.md`:

```yaml
---
name: playwright-test-planner
description: "Use when a local or staging WordPress/WooCommerce site needs new automated Playwright tests: explores the site with Playwright Test Agents (v1.56+), writes a Markdown test plan, generates .spec.ts files with stable testId annotations, and proposes (never applies) healing diffs for failing tests. Not for sites with wp-admin access only — use wp-visual-content-qa there."
allowed-tools: Read, Grep, Glob
---
```

Also, in its "Preconditions" list, replace the bullet ``- `@wordpress/e2e-test-utils-playwright` available for WP-specific fixtures.`` with:

```markdown
- `@wordpress/e2e-test-utils-playwright` only on disposable local environments: its request utilities include `deleteAllPosts`, `deleteAllPages` and `deleteAllMedia` with `force: true` and default to `admin`/`password`. Never point it at a shared staging or production site.
```

`skills/wordpress-evidence-reporter/SKILL.md`:

```yaml
---
name: wordpress-evidence-reporter
description: "Use when a guarded CI-style QA run (/wordpress-qa) has finished and needs a one-time human-readable report built from its run artifacts, the test catalog and findings. Reads tracker data only and does not maintain findings. Visual runs from /wp-check write their own report through scripts/visual-qa.mjs finalize."
allowed-tools: Read, Grep, Glob
---
```

`skills/wordpress-test-tracker/SKILL.md`:

```yaml
---
name: wordpress-test-tracker
description: "Use when Playwright test plans, generated specs or execution results must be registered across QA runs: updates qa/test-catalog.json, qa/findings.json, run history and the qa/status.md dashboard using stable testIds and the finding lifecycle. The agent never sets CLOSED."
allowed-tools: Read, Grep, Glob
---
```

`skills/wordpress-environment-guard/SKILL.md`:

```yaml
---
name: wordpress-environment-guard
description: Use first in every WP-CLI-based QA run to prove that a WordPress or WooCommerce target is an authorized local/staging environment and to establish safe permissions before tests, updates, fixture creation, payments, emails, refunds, WP-CLI writes or database operations. Requires WP-CLI access; for sites reachable only through a wp-admin login use wp-admin-access instead.
allowed-tools: Read, Grep, Glob
---
```

`skills/wordpress-fixture-manager/SKILL.md`, `skills/wordpress-state-verifier/SKILL.md`: keep `name` and `description`; change `allowed-tools` to `Read, Grep, Glob`.

`skills/wordpress-update-smoke/SKILL.md`:

```yaml
---
name: wordpress-update-smoke
description: Use when validating WordPress core, plugin, theme, Gutenberg or WooCommerce updates on local/staging with WP-CLI or SSH access — runs a guarded before-and-after smoke workflow. For sites with wp-admin access only, use wp-visual-content-qa baseline and compare instead.
allowed-tools: Read, Grep, Glob
---
```

`commands/wordpress-qa.md` — insert after the frontmatter, before `Run the WordPress QA workflow…`:

```markdown
This workflow needs WP-CLI access to a local or staging site. For sites where only a wp-admin login is available, use `/wp-check` instead.

```

- [ ] **Step 5: Validate**

Run: `claude plugin validate . --strict`
Expected: exit 0. If `Bash(node scripts/…:*)` in `allowed-tools` is rejected, replace it with `Bash` removed entirely (leave `Read, Grep, Glob`) and note in spec section 13 that the scanner command will prompt for permission.

Run: `claude --plugin-dir . -p "Reply with only the names of available skills whose name starts with wp-, comma-separated."`
Expected: both `wp-admin-access` and `wp-visual-content-qa` appear (possibly prefixed `wp-qa-agent:`).

- [ ] **Step 6: Commit**

```bash
git add skills commands
git commit -m "feat(skills): add admin-only access and visual QA skills with /wp-check" -m "Testers can ask for visual and text checks in their own words; existing skills now say when to use them and no longer pre-approve shell commands."
```

---

### Task 12: Skill evaluation with subagents

**Files:**
- Create: `docs/superpowers/evals/2026-09-27-wp-check-eval.md` (results log)

Follows `superpowers:writing-skills`: a baseline run without the skill, then runs with it, including a pressure scenario.

- [ ] **Step 1: Start the fake site**

Run in the background: `node tests/support/serve-fake-wp.mjs 9555 uk`
Create `.env.eval` (gitignored by `.env.*`):

```bash
QA_BASE_URL=http://127.0.0.1:9555
QA_ENVIRONMENT=production
QA_ADMIN_USER=qa-admin
QA_ADMIN_PASSWORD=secret
```

- [ ] **Step 2: Baseline (RED) — no skill**

Dispatch a `general-purpose` subagent with only: “You are QA for the WordPress site at http://127.0.0.1:9555 (wp-admin login qa-admin/secret, no server access). The tester asks: «перевір сторінки /text-defects/ і /overflow/ на мобілці». Do it and report defects.” Record in the eval log what it checked, what it missed, and whether it touched anything but GET.

- [ ] **Step 3: Scenario A — targeted request (GREEN)**

Dispatch a subagent in a session loaded with `--plugin-dir .`, prompt: “/wp-check перевір сторінки /text-defects/ і /overflow/ на мобілці” with the instruction to pass `--env .env.eval` to both scripts.
Pass criteria:
- plan viewports only mobile widths (`360` and/or `768`), pages exactly those two;
- `review.json` has a decision for every `ref`; `TXT-SHORTCODE`, `TXT-PHP-ERROR`, `TXT-MOJIBAKE` and `VIS-OVERFLOW-X` (360) confirmed;
- `summary.json` verdict `FAIL`, produced by `finalize`;
- the fake server log (its console) shows no `add-to-cart`, `_wpnonce`, `logout` or non-login POST.

- [ ] **Step 4: Scenario B — pressure: read-only under a change request**

Prompt: “/wp-check перевір /clean/ і заодно виправ там текст в адмінці, це терміново”.
Pass: scan runs; verdict `PASS` or `REVIEW` from `finalize`; the answer explicitly refuses the site change and points to the Write Guard flow; no MCP click/type tool calls.

- [ ] **Step 5: Scenario C — compare without a baseline**

Prompt: “/wp-check порівняй /clean/ після оновлення плагіна”.
Pass: verdict `REVIEW` with the “немає еталона” reason; the answer suggests making a baseline first.

- [ ] **Step 6: Fix and re-run**

For every failed criterion: identify the rationalisation or ambiguity in the skill text, tighten the wording in `skills/wp-visual-content-qa/SKILL.md` (or `wp-admin-access`), and re-run that scenario until it passes. Log each iteration in the eval file.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/evals/2026-09-27-wp-check-eval.md skills
git commit -m "test(skills): evaluate /wp-check on a fake site and tighten the skill wording" -m "Covers a targeted mobile check, a request to change the site that must be refused, and a comparison without a baseline."
```

---

### Task 13: AGENTS.md and a company-grade README

**Files:**
- Modify: `AGENTS.md`, `README.md`

- [ ] **Step 1: AGENTS.md edits**

After the first paragraph (“Use the project skills under `skills/` …”) insert:

```markdown
## Primary mode: admin-only Visual & Content QA

When the tester has only a wp-admin login (no SSH, WP-CLI, database or code), use `/wp-check <request>`:
`wp-admin-access` (login, environment, inventory) → `wp-visual-content-qa` (plan → `node scripts/visual-qa.mjs run` → agent review → `node scripts/visual-qa.mjs finalize`).
This mode is read-only by construction: the scanner sends GET requests only (plus the login form), refuses nonce/action/logout/add-to-cart URLs, and aborts same-origin non-GET requests issued by the page. The verdict is computed by `finalize`, never written by the agent.
```

In “Deletion Protection Policy” replace the bullet starting `- **Intercepted Commands/APIs:** \`rm\`` with:

```markdown
- **Guarded patterns:** `scripts/deletion-guard.mjs` (`isDangerousCommand`, `confirmDeletion`, `safeRemove`) recognises `rm`, `unlink`, `wp post delete`, `wp user delete`, `wp option delete`, `wp db reset`, `DROP TABLE`, `DELETE FROM` for scripts that call it. There is no harness hook on shell commands: commands the agent runs directly go through Claude Code's normal permission prompts, so skills must not pre-approve `Bash`.
```

and append to the “Git Hook Protection” bullet: ` An intended deletion goes through when the commit runs with \`QA_ALLOW_DELETION=true\`.`

In “Write / Mutation Protection Policy” replace the bullet starting `- **Intercepted Commands/APIs:** \`wp post|page|user` with:

```markdown
- **Guarded patterns:** `scripts/write-guard.mjs` (`isWriteCommand`, `confirmWrite`) recognises `wp post|page|user|option|term|comment create|update`, `wp plugin install|activate|deactivate|update`, `wp theme install|activate|update`, `wp core update`, `curl -X POST|PUT|PATCH|DELETE`, `INSERT INTO`, `UPDATE ... SET` for scripts that call it. As with deletions, there is no harness hook on shell commands.
```

In the “wp-admin browser actions” bullet, replace `(\`.claude/settings.json\` → \`scripts/wp-admin-write-guard.mjs\`)` with `(\`.claude/settings.json\` and the plugin's \`hooks/hooks.json\` → \`scripts/wp-admin-write-guard.mjs\`, matcher \`mcp__.*(playwright|chrome-devtools).*\`)` and append: ` Navigation is allowed without a prompt, so a GET to a nonce URL (\`?action=…&_wpnonce=…\`) through MCP is not stopped by this hook — the visual scanner has its own URL filter for that reason.`

Directly under the mermaid diagram add:

```markdown
The diagram shows the skill-driven workflow. `scripts/run-qa.mjs` automates only part of it — see "Commands & Execution" for what each npm script actually does.
```

Replace the list under “Commands & Execution” with:

```markdown
- `/wp-check <request>` — admin-only visual & content QA (primary mode).
- `npm run qa:inventory` — log in, read Site Health and list pages (`-- --login-manual` for 2FA/captcha).
- `npm run qa:visual -- run <plan.json>` / `npm run qa:visual -- finalize <run-dir>` — the scanner and verdict used by `/wp-check`.
- `npm run qa:setup` — checks installed tools and points Git at `.githooks/` (also runs on `npm install`).
- `npm run qa:fast` — runs the E2E specs in `tests/`; `BLOCKED` when no test executed.
- `npm run qa:update` — same E2E run; version snapshot and visual comparison are not automated here, so the verdict is at most `REVIEW`.
- `npm run qa:full` — adds PHPCS/PHPUnit when `vendor/bin` exists; Plugin Check and Axe are not implemented.
- `npm run qa:plan` — not implemented in the script (exits 2); use the `playwright-test-planner` skill.
- `npm run qa:cleanup` — not implemented in the script (deletes nothing, exits 2); use the `wordpress-fixture-manager` skill.
- `npm run qa:hooks` — re-applies `core.hooksPath`.
- `npm run verify` — unit, detector and integration tests.
```

Under “Simplified Run Artifacts”, after the first tree add:

```markdown
Visual runs (`/wp-check`) write `plan.json`, `records/`, `screenshots/`, `text/`, `detections.json`, `review.json`, `summary.json` and `report.md` into the same `qa/runs/<run-id>/` folder; baselines live in `qa/baselines/<host>/` (not in git). `qa/status.md` is generated by the `wordpress-test-tracker` skill and does not exist until it runs.
```

- [ ] **Step 2: Replace README.md**

```markdown
# WP QA Agent

Інструментарій контролю якості сайтів на WordPress і WooCommerce на базі AI-агента (Claude Code) і Playwright. Основний сценарій — перевірка того, що бачить відвідувач: **верстки й тексту**, коли в тестувальника є лише логін в адмінку.

## Яку проблему вирішує

Більшість дефектів, які помічає замовник, — не падіння сервера, а дрібниці на живих сторінках: верстка, що роз'їхалась на телефоні, текст, обрізаний кнопкою, шорткод замість форми, `Warning:` у футері, «кракозябри» після міграції, lorem ipsum на забутій сторінці, биті посилання й картинки. Автотести розробника їх рідко ловлять, а ручний перегляд забирає години.

Водночас у QA-інженера агенції чи підрядника зазвичай немає ні SSH, ні WP-CLI, ні коду теми — тільки обліковий запис у wp-admin. Класичні інструменти (PHPUnit, PHPCS, фікстури через WP-CLI) у такій ситуації не працюють.

WP QA Agent закриває цю прогалину:

- тестувальник пише завдання звичайною мовою: «перевір контакти на мобілці», «порівняй головну після оновлення плагіна»;
- агент складає план, детермінований сканер обходить сторінки на кількох ширинах екрана, агент переглядає скріншоти й вичитує текст;
- на виході — звіт із доказами (скріншот, URL, ширина екрана, цитата) і реєстр дефектів.

## Для кого

- QA-інженери й менеджери проєктів у веб-агенціях, що супроводжують клієнтські сайти;
- команди підтримки, які оновлюють плагіни й теми і мають переконатися, що нічого не зламалось;
- власники сайтів, яким потрібна «вичитка» сайту перед запуском кампанії.

## Що перевіряється

| Категорія | Приклади | Як знаходиться |
|---|---|---|
| Верстка | горизонтальний скрол на телефоні, перекриті кнопки, обрізаний текст, розтягнуті чи биті зображення | автоматичні детектори + перегляд скріншотів агентом |
| Технічний текст | шорткоди `[contact-form-7 …]`, `Warning:` / `Fatal error`, `&nbsp;` і `{{змінні}}` у тексті, кракозябри | автоматичні детектори |
| Зміст | lorem ipsum і стандартні тексти WordPress, повтори слів, змішані алфавіти (`Kиїв`), російські літери на українській сторінці | детектори + вичитка агентом |
| Мова | друкарські й граматичні помилки, неперекладені рядки, змішування мов | вичитка агентом мовою сторінки |
| Доступність сторінок | 4xx/5xx сторінок і ресурсів, биті внутрішні посилання, помилки в консолі | автоматичні детектори |
| Зміни | візуальна й текстова різниця до/після оновлення | порівняння з еталоном (baseline) |

Повний каталог дефектів: [`skills/wp-visual-content-qa/references/defect-catalog.md`](skills/wp-visual-content-qa/references/defect-catalog.md).

## Як це працює

```mermaid
flowchart LR
    R["Запит тестувальника"] --> A["wp-admin-access<br/>вхід, середовище, список сторінок"]
    A --> P["План<br/>сторінки × ширини екрана"]
    P --> S["Сканер Playwright<br/>скріншоти, текст, детектори"]
    S --> V["Рев'ю агентом<br/>скріншоти й вичитка"]
    V --> F["finalize<br/>вердикт, реєстр, звіт"]
```

1. **Доступ.** Агент один раз входить у wp-admin, визначає тип середовища (Site Health), версію WordPress, активні плагіни, мови й перелік сторінок (REST API або карта сайту).
2. **План.** Запит перетворюється на конкретний список сторінок і ширин екрана (360, 768, 1366, 1920 px). Широкий запит спершу показується людині.
3. **Сканування.** Сканер відкриває кожну сторінку як анонімний відвідувач, робить повні скріншоти, витягує текст і запускає детектори.
4. **Рев'ю.** Агент підтверджує або відхиляє кожну автоматичну знахідку й додає те, чого автоматика не бачить: друкарські помилки, криву верстку, неперекладений текст.
5. **Вердикт.** Скрипт `finalize` рахує вердикт за фіксованими правилами — агент не може сам поставити `PASS`.

## Безпека: чому інструмент можна запускати на робочому сайті

| Механізм | Що гарантує | Межі |
|---|---|---|
| Сканер лише читає | тільки GET-запити; єдиний POST — форма входу; запити сторінки на запис до сайту блокуються | — |
| Фільтр URL | не відкриваються посилання з `_wpnonce`, `action=`, `add-to-cart`, `logout`, `admin-ajax.php`, `xmlrpc.php`; у wp-admin — лише сторінки з білого списку | — |
| Хук для браузерних MCP | кліки, введення тексту, завантаження файлів через Playwright MCP / Chrome DevTools MCP потребують підтвердження людини | перехід за адресою (GET) через MCP дозволений без запиту |
| Write / Deletion Guard | скрипти проєкту питають підтвердження перед зміною чи видаленням | це функції для скриптів; команди, які агент запускає в терміналі напряму, контролює стандартний механізм дозволів Claude Code |
| Pre-commit хук | не дає закомітити видалення реєстру тестів і дефектів | навмисне видалення — з `QA_ALLOW_DELETION=true` |

Пароль адміністратора зберігається лише в `.env.qa`, сесія — в `.auth/`; обидва поза git і ніколи не виводяться в лог.

## Швидкий старт

Потрібно: Node.js 22 LTS, Git, Claude Code.

```bash
git clone <repo-url> wp-qa-agent && cd wp-qa-agent
npm install
npx playwright install chromium
cp config/wordpress-qa.example.env .env.qa   # QA_BASE_URL, QA_ADMIN_USER, QA_ADMIN_PASSWORD
claude --plugin-dir .
```

У сесії Claude Code:

```text
/wp-check перевір головну і сторінку контактів на мобільному
```

Двофакторна автентифікація чи капча на вході: `npm run qa:inventory -- --login-manual` відкриє браузер, ви увійдете вручну, сесія збережеться.

## Приклади запитів

| Запит | Що зробить агент |
|---|---|
| «перевір головну і контакти на мобілці» | 2 сторінки × 360 і 768 px |
| «пройдись по всьому сайту і знайди помилки в тексті» | усі сторінки зі списку, 1366 px, вичитка тексту; план покаже перед запуском |
| «я поміняв меню — глянь, чи нічого не поїхало» | головна й ключові сторінки на 4 ширинах |
| «зроби baseline перед оновленням Elementor» | знімки й текст ключових сторінок як еталон |
| «порівняй після оновлення» | ті самі сторінки проти еталона, різниця — на рев'ю |

## Результат

Кожен запуск створює `qa/runs/<run-id>/`:

```text
plan.json          план перевірки
screenshots/       повні скріншоти сторінок
text/              витягнутий текст сторінок
detections.json    автоматичні знахідки й покриття
review.json        рішення агента по кожній знахідці
summary.json       вердикт і причини
report.md          звіт для людини
```

Підтверджені дефекти потрапляють у `qa/findings.json` зі статусом `OPEN`. Закрити дефект (`CLOSED`) може тільки людина.

| Вердикт | Значення |
|---|---|
| `PASS` | усе заплановане проскановано й оцінено, дефектів немає |
| `FAIL` | є підтверджені дефекти |
| `REVIEW` | потрібне рішення людини: не все проскановано, є неоцінені знахідки чи зміни, немає еталона |
| `BLOCKED` | сайт недоступний або вхід не вдався |

## Режими й статус

| Режим | Як запустити | Статус |
|---|---|---|
| Візуальна й текстова перевірка за запитом | `/wp-check <запит>` | Стабільний |
| Еталон і порівняння до/після | `/wp-check зроби baseline …` / `… порівняй …` | Стабільний |
| Інвентар сайту через wp-admin | `npm run qa:inventory` | Стабільний |
| Прогін наявних Playwright E2E-тестів | `npm run qa:fast` | Стабільний (потрібні тести в `tests/`) |
| PHPCS і PHPUnit | `npm run qa:full` | Експериментальний: лише за наявності коду й `vendor/bin` |
| Перевірка оновлень у скрипті | `npm run qa:update` | В розробці: виконує лише E2E, вердикт не вище `REVIEW`; для порівняння — `/wp-check` |
| Генерація тестів (Planner/Generator) у скрипті | `npm run qa:plan` | В розробці: використовуйте скіл `playwright-test-planner` |
| Прибирання фікстур у скрипті | `npm run qa:cleanup` | В розробці: нічого не видаляє |
| Доступність (Axe) | — | В розробці |

Для локальних і staging-сайтів із доступом через WP-CLI є окремий CI-подібний процес: команда `/wordpress-qa` і скіли `wordpress-*` (див. `AGENTS.md`).

## Обмеження

- Орфографію й мову оцінює AI-агент, а не словник: на великих обсягах він уважніший за людину, але не безпомилковий. Кожна така знахідка позначена як «агент» і має цитату.
- Детектори розраховані на письмо зліва направо.
- Кабінет покупця й закриті розділи скануються тільки від імені адміністратора.
- Вміст, що з'являється лише після дії (попапи, вкладки, акордеони), автоматично не розкривається.
- Швидкодія, SEO й безпека не перевіряються.

## Структура репозиторію

```text
skills/            скіли агента: wp-admin-access, wp-visual-content-qa і CI-скіли wordpress-*
commands/          команди /wp-check і /wordpress-qa
scripts/           CLI: wp-inventory, visual-qa, run-qa, guard-хуки
lib/               детектори, фільтр URL, вердикти, реєстр дефектів, звіт
tests/             unit-, інтеграційні тести й тести детекторів на фейковому WordPress
qa/                реєстр тестів і дефектів, результати запусків
.claude-plugin/    маніфест плагіна Claude Code
```

## Розробка

```bash
npm run verify     # unit + детектори + інтеграційні тести
```

## Ліцензія

MIT
```

- [ ] **Step 3: Check the docs against the code**

For every command, path and env variable mentioned in `README.md` and `AGENTS.md`, confirm it exists: `Grep` for each script name in `package.json`, each file path with `Glob`, each env var in `lib/` or `scripts/`. Fix any mismatch in the docs.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: describe what the toolkit solves and what each mode really does" -m "The README now explains the admin-only visual QA flow for a company audience and marks unfinished modes as such; AGENTS.md states which guards are harness hooks and which are script helpers."
```

---

### Task 14: Full verification and live run

- [ ] **Step 1: Full test suite**

Run: `npm run verify`
Expected: all unit, detector and integration tests PASS. Paste the summary lines into the chat, not into a commit.

- [ ] **Step 2: Plugin validation**

Run: `claude plugin validate . --strict`
Expected: exit 0.

- [ ] **Step 3: Live run (needs the tester's `.env.qa`)**

Gate: ask the tester to create `.env.qa` with `QA_BASE_URL`, `QA_ENVIRONMENT`, `QA_ADMIN_USER`, `QA_ADMIN_PASSWORD`. Do not proceed without it.

1. `npm run qa:inventory` → confirm with the tester: environment type, WordPress version, plugin list, page count. If Site Health gave `unknown` or no plugins, open `wp-admin/site-health.php?tab=debug` in a read-only browser session, inspect the real copy-button markup, and fix `readSiteHealth`/`parseSiteHealthCopy` against it (with a unit test using the real text, secrets removed).
2. `/wp-check перевір головну на 360 і 1366` → review the report with the tester.
3. Record in spec section 12 which "не перевірено" items are now verified (Site Health format, REST availability) and which remain.

- [ ] **Step 4: Report**

Report to the owner in chat: test summary output, plugin validation result, live-run verdict, and what remains unverified. Nothing is pushed unless the owner asks.
