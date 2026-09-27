---
name: playwright-test-planner
description: "Use when a local or staging WordPress/WooCommerce site needs new automated Playwright tests: explores the site with Playwright Test Agents (v1.56+), writes a Markdown test plan, generates .spec.ts files with stable testId annotations, and proposes (never applies) healing diffs for failing tests. Not for sites with wp-admin access only — use wp-visual-content-qa there."
allowed-tools: Read, Grep, Glob
---
# Playwright Test Planner

## Goal

Explore a WordPress site using Playwright Test Agents, produce a test plan, generate `.spec.ts` files, and optionally propose healing diffs. This skill does **not** track results, history, findings, or dashboards — that is the job of `wordpress-test-tracker`.

## Preconditions

- Environment guard PASS.
- Playwright v1.56 or later (`npm install -D @playwright/test@latest`).
- Playwright browsers installed (`npx playwright install`).
- Playwright Test Agents initialized (`npx playwright init-agents --loop=<client>`).
  Supported clients: `claude`, `vscode`, `codex`, `opencode`, `copilot`.
- `@wordpress/e2e-test-utils-playwright` only on disposable local environments: its request utilities include `deleteAllPosts`, `deleteAllPages` and `deleteAllMedia` with `force: true` and default to `admin`/`password`. Never point it at a shared staging or production site.

## Setup: seed test

Before running the agents, ensure a **seed test** exists at `tests/seed.spec.ts`. The agents use this as a blueprint for:

- Environment setup (base URL, auth state).
- Authentication flow (WP admin login, customer login).
- Fixture patterns (how to create/clean test data).
- Project coding conventions (imports, assertions, locator style).

If no seed test exists, create one that logs in as admin and verifies the dashboard loads.

## Phase 1 — Planner (explore → test plan)

Invoke the Playwright **planner** agent. It:

1. Explores the target site through MCP.
2. Discovers pages, forms, navigation flows, login gates, interactive elements, AJAX endpoints.
3. Produces a Markdown test plan organized by area:
   - **Public**: homepage, archives, single posts, search, 404.
   - **Auth**: login, logout, password reset, registration.
   - **Admin**: dashboard, post editor, media library, plugin/theme management, settings.
   - **WooCommerce** (when installed): shop, product pages, cart, checkout, my-account, order management.
   - **Forms**: contact forms, comment forms, custom forms.
   - **API**: REST API endpoint health.
4. Each test case must include a **stable testId** using the convention:
   - `PUB-HOME-001`, `AUTH-LOGIN-001`, `ADMIN-POST-001`, `WOO-CHECKOUT-001`, etc.
5. Each test case: testId, title, area, priority (critical/high/medium/low), preconditions, steps, expected outcome.
6. Output: `test-plan.md` saved to `qa/runs/<run-id>/`.

**Human review checkpoint**: review and approve the plan before proceeding to generation.

## Phase 2 — Generator (plan → .spec.ts)

Feed the approved test plan into the Playwright **generator** agent. It:

1. Converts each test case into a `.spec.ts` file.
2. Every generated test **must** include the stable `testId` as a Playwright annotation:

```ts
test(
  'guest completes checkout',
  {
    tag: ['@critical', '@woocommerce'],
    annotation: [
      { type: 'testId', description: 'WOO-CHECKOUT-001' },
    ],
  },
  async ({ page }) => {
    // ...
  }
);
```

3. Uses role-based locators (`getByRole`, `getByLabel`, `getByText`) — not CSS/XPath.
4. Imports `@wordpress/e2e-test-utils-playwright` for authenticated WP flows.
5. Groups tests by area: `tests/public.spec.ts`, `tests/auth.spec.ts`, `tests/admin.spec.ts`, `tests/woocommerce.spec.ts`.
6. Output: `.spec.ts` files + `spec-mapping.json` in `qa/runs/<run-id>/`.

## Phase 3 — Healer (propose diffs only)

After running specs (`npx playwright test`), if tests fail, the Playwright **healer** agent:

1. Diagnoses the cause: stale selector, timeout, assertion mismatch, navigation error, UI change.
2. Inspects the live page through MCP to find the correct locator or flow.
3. **Proposes** a repair as a before/after diff. Does **not** auto-apply.
4. Human reviews the diff. Approved changes are applied manually or by the agent after explicit approval.
5. Re-run goes through normal Playwright execution. The result is PASSED or FAILED — never HEALED.

HEALED is a characteristic of the **change** to the test, not a test result. The re-run result is always PASSED or FAILED.

**Never delete or weaken a test to make it pass.**

## Output

This skill produces:

| File | Location | Description |
|---|---|---|
| `test-plan.md` | `qa/runs/<run-id>/` | Markdown plan for this run |
| `spec-mapping.json` | `qa/runs/<run-id>/` | testId → .spec.ts mapping |
| `tests/*.spec.ts` | `tests/` | Generated specs with testId annotations |
| `tests/seed.spec.ts` | `tests/` | Seed test (created if missing) |

## What this skill does NOT do

- Track test catalog across runs → `wordpress-test-tracker`
- Track findings/defects → `wordpress-test-tracker`
- Generate dashboards → `wordpress-test-tracker`
- Import Playwright results → `wordpress-test-tracker`
- Decide CLOSED/VERIFIED status → human decision

## Rules

- Always provide or verify a seed test before running agents.
- Always include stable `testId` in every generated test.
- Always review the test plan before generation.
- Re-run `npx playwright init-agents` after Playwright updates.
- Never weaken assertions to make tests pass.
- Never treat a broken locator as a product defect without verification.
