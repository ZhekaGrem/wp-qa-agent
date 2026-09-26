---
name: wordpress-evidence-reporter
description: "Generates a one-time QA report for a specific run by reading tracker data (test catalog, findings, run summary) and run artifacts. Does NOT maintain its own findings store — that is the job of wordpress-test-tracker."
allowed-tools: Read, Grep, Glob, Bash
---
# WordPress Evidence Reporter

## Goal

Produce a factual, human-readable report for a single QA run. This skill **reads** data from the test tracker and run artifacts — it does not maintain its own findings database.

## Inputs

Read from the current run directory `qa/runs/<run-id>/`:

- `00-environment.json`
- `10-fixtures.json`
- `20-baseline.json`
- `30-smoke.json`
- `40-state-verification.json`
- `run-summary.json`
- `playwright-results.json`
- `spec-mapping.json`
- `healing-report.json`
- `screenshots/`, `traces/`

Read from persistent tracker files:

- `qa/test-catalog.json` — test statuses and automation coverage.
- `qa/findings.json` — current finding lifecycle states.

## Procedure

1. Validate artifact presence and JSON shape. Missing required evidence is not PASS.
2. Cross-reference run results with the test catalog to identify coverage gaps.
3. Separate pre-existing baseline problems from regressions introduced during the run.
4. For each finding from `qa/findings.json` that is linked to this run:
   - Include environment, role, viewport, test data marker, exact steps, expected, actual, evidence paths, confidence.
5. Assign severity if not already set:
   - Critical: security breach, data loss/corruption, real payment risk, site unavailable.
   - High: critical journey blocked, checkout/admin publishing broken.
   - Medium: significant degraded behavior with workaround.
   - Low: minor defect without meaningful business impact.
6. Redact secrets, cookies, auth headers, nonces, personal data, and payment data.
7. Produce `qa/runs/<run-id>/report.md`.

## What this skill does NOT do

- Does NOT create or update `qa/findings.json` — that is `wordpress-test-tracker`.
- Does NOT create or update `qa/test-catalog.json` — that is `wordpress-test-tracker`.
- Does NOT generate `qa/status.md` — that is `wordpress-test-tracker`.
- Does NOT produce `50-findings.json` — findings live in `qa/findings.json`.

## Overall verdict

- FAIL when any confirmed Critical/High defect exists or a required critical scenario failed.
- REVIEW when evidence is incomplete, visual judgment is required, or only probable findings remain.
- PASS only when every required scenario and state assertion passed.

Do not hide flaky tests. Mark them flaky with observed frequency and preserve failed artifacts. Do not call an unexecuted scenario PASS.
