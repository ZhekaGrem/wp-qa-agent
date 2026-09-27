---
name: wordpress-environment-guard
description: Use first in every WP-CLI-based QA run to prove that a WordPress or WooCommerce target is an authorized local/staging environment and to establish safe permissions before tests, updates, fixture creation, payments, emails, refunds, WP-CLI writes or database operations. Requires WP-CLI access; for sites reachable only through a wp-admin login use wp-admin-access instead.
allowed-tools: Read, Grep, Glob
---
# WordPress Environment Guard

## Goal

Return exactly one verdict: `PASS`, `REVIEW`, or `FAIL`. Never infer that a target is safe from its hostname alone.

## Inputs

- Target URL.
- `.env.qa` configuration.
- Requested operations.
- Available WP-CLI access.

## Procedure

1. Create a run ID in UTC: `YYYYMMDDTHHMMSSZ-shortslug`.
2. Load `.env.qa` without printing secrets.
3. Run `./scripts/validate-config.sh`.
4. Resolve the target URL and follow redirects with `curl`; record final URL and HTTP status.
5. Run read-only WP-CLI checks using `${QA_WP_CLI} --path=${QA_WP_PATH}`:
   - `core is-installed`
   - `option get home`
   - `option get siteurl`
   - `core version`
   - `plugin list --status=active --format=json`
   - `theme list --status=active --format=json`
6. Compare `home` and `siteurl` against `QA_EXPECTED_HOME` when configured.
7. Search for explicit staging proof: configured marker, environment type, hosting indicator, or disposable local environment.
8. Classify requested capabilities: read, fixture writes, updates, email, payments, refunds, database writes.
9. Check the corresponding `QA_ALLOW_*` flags. A missing flag means denied.
10. Confirm backup/snapshot evidence before updates or destructive fixture cleanup. If evidence cannot be verified, return REVIEW.
11. Write `qa/runs/<run-id>/00-environment.json` using the schema in `references/output-contract.md`.

## Verdict rules

Return `FAIL` when:

- Target is production or may be production and no independent staging proof exists.
- `home`/`siteurl` do not match the expected target.
- The user lacks authorization.
- Real payment/refund/email is requested without an explicitly isolated provider/sink.
- A destructive operation is requested without a disposable target and backup.

Return `REVIEW` when safety cannot be proved but no explicit production evidence exists.

Return `PASS` only when target identity, permissions, requested capabilities, and rollback requirements are all satisfied.

## Hard prohibitions

Never mutate the site while this skill runs. Never display secrets. Never change options to make the target appear safe.
