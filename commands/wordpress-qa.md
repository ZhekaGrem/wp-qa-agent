---
description: Run the guarded WordPress QA workflow for a local or staging target
argument-hint: <target-url> [scope]
---
Run the WordPress QA workflow for `$ARGUMENTS`.

1. Invoke `wordpress-environment-guard` and stop if its verdict is not PASS.
2. Determine whether fixtures are required. If yes, invoke `wordpress-fixture-manager`; default to PLAN_ONLY unless writes are explicitly allowed.
3. Invoke `playwright-test-planner` to explore the target and produce a test plan.
4. Invoke `wordpress-test-tracker` to register the plan into `qa/test-catalog.json`.
5. After human review of the plan, invoke `playwright-test-planner` generator to produce `.spec.ts` files with stable testId annotations.
6. Invoke `wordpress-test-tracker` to register generated specs.
7. Run specs: `PLAYWRIGHT_JSON_OUTPUT_FILE="qa/runs/$RUN_ID/playwright-results.json" npx playwright test --reporter=json`.
8. If tests fail, invoke `playwright-test-planner` healer to **propose** diffs. Apply only after human review.
9. Re-run fixed specs through normal Playwright execution.
10. Invoke `wordpress-state-verifier` for every critical mutation detected during execution.
11. Invoke `wordpress-test-tracker` to import execution results, update findings, and regenerate `qa/status.md`.
12. Invoke `wordpress-evidence-reporter` and return the report path plus the final PASS/FAIL/REVIEW verdict.

Do not skip a gate. Do not perform destructive actions or real payments/emails/refunds.
