---
name: wordpress-test-tracker
description: "Use when Playwright test plans, generated specs or execution results must be registered across QA runs: updates qa/test-catalog.json, qa/findings.json, run history and the qa/status.md dashboard using stable testIds and the finding lifecycle. The agent never sets CLOSED."
allowed-tools: Read, Grep, Glob
---
# WordPress Test Tracker

## Goal

Maintain a persistent, deduplicated record of:

- Which tests exist and their automation status.
- When every test was last executed and what result it produced.
- What defects were found and their lifecycle.
- What action is required next.

## Canonical files

| File | Purpose | In Git |
|---|---|---|
| `qa/test-catalog.json` | Persistent test registry | Yes |
| `qa/findings.json` | Defect registry with lifecycle | Yes |
| `qa/status.md` | Generated human dashboard | Yes |
| `qa/runs/<run-id>/run-summary.json` | Immutable run result | Optional |
| `qa/runs/<run-id>/playwright-results.json` | Raw Playwright JSON report | CI artifact |
| `qa/runs/<run-id>/spec-mapping.json` | Plan → spec mapping from generator | CI artifact |
| `qa/runs/<run-id>/healing-report.json` | Healer diffs and outcomes | CI artifact |
| `qa/runs/<run-id>/screenshots/` | Failure evidence | CI artifact |
| `qa/runs/<run-id>/traces/` | Playwright traces | CI artifact |

**JSON files are canonical. Markdown is generated output.**

## Test catalog schema

`qa/test-catalog.json`:

```json
{
  "version": 1,
  "updatedAt": "ISO-8601",
  "tests": [
    {
      "id": "WOO-CHECKOUT-001",
      "title": "Guest completes checkout using sandbox payment",
      "area": "woocommerce",
      "priority": "critical",
      "automationStatus": "AUTOMATED",
      "specFile": "tests/woocommerce/checkout.spec.ts",
      "testName": "guest completes checkout",
      "preconditions": [
        "WooCommerce is enabled",
        "Sandbox payment is configured",
        "Simple product is in stock"
      ],
      "expected": "Exactly one order is created with the expected totals",
      "lastRunAt": "ISO-8601",
      "lastResult": "PASSED",
      "lastRunId": "20260926T132000Z-plugin-update",
      "openFindings": [],
      "nextAction": null
    }
  ]
}
```

### TestId convention

Every test gets a stable ID that survives renames:

```
PUB-HOME-001      AUTH-LOGIN-001     ADMIN-POST-001
FORM-CONTACT-001  API-REST-001       WOO-CART-001
WOO-CHECKOUT-001  WOO-REFUND-001
```

**Never use test title as the primary identifier.** Titles change; testId does not.

### Automation statuses

```
PLANNED → GENERATING → AUTOMATED → NEEDS_REVIEW → BLOCKED → DEPRECATED
```

### Test results

```
PASSED  FAILED  FLAKY  SKIPPED  NOT_RUN
```

These are separate dimensions. A test can be `AUTOMATED` with `lastResult: FAILED`.

## Run summary schema

`qa/runs/<run-id>/run-summary.json`:

```json
{
  "runId": "20260926T132000Z-plugin-update",
  "startedAt": "ISO-8601",
  "finishedAt": "ISO-8601",
  "target": "https://staging.example.com",
  "environment": "staging",
  "trigger": "PLUGIN_UPDATE",
  "change": {
    "type": "plugin",
    "name": "woocommerce",
    "fromVersion": "10.1.0",
    "toVersion": "10.2.0"
  },
  "summary": {
    "total": 28,
    "passed": 24,
    "failed": 2,
    "flaky": 1,
    "skipped": 1,
    "notRun": 0
  },
  "results": [
    {
      "testId": "WOO-CHECKOUT-001",
      "specFile": "tests/woocommerce/checkout.spec.ts",
      "result": "FAILED",
      "durationMs": 18500,
      "attempts": 2,
      "error": "Order confirmation was not displayed",
      "findingId": "BUG-2026-014",
      "trace": "traces/WOO-CHECKOUT-001.zip",
      "screenshot": "screenshots/WOO-CHECKOUT-001.png"
    }
  ],
  "verdict": "FAIL"
}
```

## Findings schema

`qa/findings.json`:

```json
{
  "version": 1,
  "updatedAt": "ISO-8601",
  "findings": [
    {
      "id": "BUG-2026-014",
      "title": "Checkout does not reach order confirmation",
      "testId": "WOO-CHECKOUT-001",
      "area": "woocommerce",
      "severity": "high",
      "status": "OPEN",
      "confidence": "CONFIRMED",
      "firstSeenAt": "ISO-8601",
      "lastSeenAt": "ISO-8601",
      "firstSeenRunId": "20260926T132000Z-plugin-update",
      "lastSeenRunId": "20260926T132000Z-plugin-update",
      "occurrences": 2,
      "expected": "Exactly one order is created and confirmation is shown",
      "actual": "Checkout remains on processing state",
      "nextAction": "Inspect failed Store API request and PHP logs",
      "assignedTo": null,
      "githubIssue": null,
      "evidence": [
        "qa/runs/20260926T132000Z-plugin-update/traces/WOO-CHECKOUT-001.zip"
      ]
    }
  ]
}
```

### Finding lifecycle

```
OPEN → IN_PROGRESS → FIXED → VERIFIED → CLOSED
                                      → REOPENED
              → WONT_FIX
              → DUPLICATE
```

Rules:

- First failure creates `OPEN`.
- Repeated failure updates `lastSeenAt` and `occurrences`.
- Test passes after fix → `VERIFIED`.
- Defect reappears → `REOPENED`.
- **Agent never sets `CLOSED`** — that is a human decision.

### What is NOT a product defect

Do not create a finding for:

- Broken test code (stale locator, wrong assertion).
- Invalid fixture or missing test data.
- Missing environment configuration.
- Temporary infrastructure failure (network timeout, CI flake).

## Workflow operations

### 1. Register plan

1. Read `test-plan.md` from the current run.
2. Match test cases by stable `testId`.
3. Add new tests to `qa/test-catalog.json` with `automationStatus: PLANNED`.
4. Update changed tests without duplicating.
5. **Never remove tests automatically.** Mark obsolete tests `DEPRECATED`.

### 2. Register generated specs

1. Read `spec-mapping.json` from the current run.
2. Match by `testId`.
3. Update: `automationStatus`, `specFile`, `testName`.
4. Unmapped generated tests → `NEEDS_REVIEW`.

### 3. Import execution results

1. Read the Playwright JSON report (`playwright-results.json`).
2. Extract `testId` from the `testId` annotation on each test.
3. Update the catalog entry: `lastRunAt`, `lastRunId`, `lastResult`.
4. Write immutable `run-summary.json`.
5. **Never change a failed result to passed because healing was attempted.**

Use the Playwright JSON reporter:

```bash
PLAYWRIGHT_JSON_OUTPUT_FILE="qa/runs/$RUN_ID/playwright-results.json" \
npx playwright test --reporter=json
```

Or configure in `playwright.config.ts`:

```ts
reporter: [
  ['list'],
  ['html', { outputFolder: 'playwright-report' }],
  ['json', { outputFile: 'qa/latest-playwright-results.json' }],
]
```

### 4. Track findings

1. Create a finding only for a **confirmed product defect**.
2. Deduplicate by `testId`, failure signature, and affected behavior.
3. Update `lastSeenAt` and `occurrences` for recurring findings.
4. Mark `VERIFIED` only after the regression test passes.
5. **Never auto-close findings.**

### 5. Generate dashboard

Regenerate `qa/status.md` entirely from JSON sources:

```markdown
# WordPress QA Status

Updated: 2026-09-26 16:30 EEST

## Current status

- Total test cases: 42
- Automated: 28
- Planned: 9
- Blocked: 5
- Last run: `20260926T132000Z-plugin-update`
- Last verdict: FAIL
- Open findings: 4
- Critical/high findings: 2

## Needs attention

| Priority | Test | Status | Finding | Next action |
|---|---|---|---|---|
| Critical | WOO-CHECKOUT-001 | Failed | BUG-2026-014 | Inspect Store API |

## Recent runs

| Date | Trigger | Passed | Failed | Verdict |
|---|---|---:|---:|---|
| 2026-09-26 | WooCommerce update | 24 | 2 | FAIL |

## Planned tests

- `WOO-REFUND-001` — Sandbox refund.
- `AUTH-RESET-001` — Password reset email.
```

This file is **fully generated** from JSON. Never edit it manually.

## Rules

- Stable `testId` is mandatory for all operations.
- Never use test title as the primary identifier.
- Never overwrite historical run directories.
- Never delete findings automatically.
- Never classify a broken locator as a product bug without verification.
- Never allow healer changes to weaken assertions.
- Keep raw Playwright JSON output separate from normalized tracker output.
- HEALED is a change characteristic, not a test result. Re-run result is PASSED or FAILED.
