---
name: wordpress-update-smoke
description: Use when validating WordPress core, plugin, theme, Gutenberg or WooCommerce updates on local/staging with WP-CLI or SSH access — runs a guarded before-and-after smoke workflow. For sites with wp-admin access only, use wp-visual-content-qa baseline and compare instead.
allowed-tools: Read, Grep, Glob
---
# WordPress Update Smoke

## Preconditions

- Environment guard PASS.
- `QA_ALLOW_UPDATES=true` for applying an update.
- Verified backup/snapshot and a documented rollback operation.
- Exact update target and version/range.

## Phases

### Baseline

1. Record WordPress/PHP/theme/plugin versions and active plugin state.
2. Check homepage, login, REST API, critical routes, and WooCommerce routes when present.
3. Capture console/network failures through browser tooling.
4. Capture deterministic screenshots for configured critical pages.
5. Record existing PHP/debug log errors separately from new errors.
6. Write `qa/runs/<run-id>/20-baseline.json`.

### Update

1. Refuse bulk updates unless explicitly requested.
2. Apply exactly one update target.
3. Capture command, exit code, output, resulting version, maintenance-mode status, and database-upgrade prompts.
4. On command failure, stop; do not continue pretending the update succeeded.

### Post-update smoke

1. Repeat the same baseline checks and viewports.
2. Run critical Playwright scenarios.
3. Compare screenshots while masking configured dynamic regions.
4. Compare console, network, HTTP, REST, PHP logs, cron, and version state.
5. Invoke `wordpress-state-verifier` for every critical mutation.
6. Write `qa/runs/<run-id>/30-smoke.json`.

## Verdict

- FAIL: fatal error, 5xx, broken critical journey, unexpected plugin deactivation, missing side effect, or new high-severity error.
- REVIEW: meaningful visual/performance/log difference needing human judgment.
- PASS: all configured critical checks pass with evidence.

Never roll forward with additional updates after a FAIL. Report the documented rollback command but do not execute it without explicit approval.
