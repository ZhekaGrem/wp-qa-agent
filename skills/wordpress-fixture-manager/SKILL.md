---
name: wordpress-fixture-manager
description: Plans, creates, inventories, and cleans deterministic WordPress or WooCommerce test fixtures through WP-CLI or approved APIs. Use after environment guard PASS when tests need users, posts, pages, products, coupons, carts, orders, or known content states.
allowed-tools: Read, Grep, Glob, Bash
---
# WordPress Fixture Manager

## Preconditions

- Read the latest `00-environment.json`.
- Refuse to continue unless verdict is PASS.
- Default to `PLAN_ONLY` when `QA_ALLOW_WRITES` is not `true`.
- Even when `QA_ALLOW_WRITES=true`, every mutating call must pass the Write Guard interactive confirmation (`scripts/write-guard.mjs` → `confirmWrite()`) before it executes — see AGENTS.md "Write / Mutation Protection Policy".

## Principles

- Fixtures must be deterministic, namespaced by run ID, idempotent, and removable.
- Prefer public WordPress/WooCommerce APIs or WP-CLI over direct SQL.
- Never reuse real customer data.
- Never delete entities that do not carry this workflow's fixture marker.

## Procedure

1. Translate requested scenarios into the smallest fixture plan.
2. Produce stable fixture keys such as `qa_<run-id>_customer` and metadata `qa_fixture_run=<run-id>`.
3. Record the exact create, lookup, and cleanup operation for every entity.
4. In PLAN_ONLY mode, write the plan but execute nothing.
5. In APPLY mode, require `QA_ALLOW_WRITES=true`, execute one operation at a time, and capture IDs.
6. Verify every created fixture through a second read channel when possible.
7. Write `qa/runs/<run-id>/10-fixtures.json`.

## Minimum fixture types

- WordPress: user, post, page, category, media placeholder.
- WooCommerce when installed: simple product, variable product if required, coupon, customer, shipping-compatible address.
- Do not pre-create orders unless the scenario explicitly tests order administration rather than checkout creation.

## Cleanup

Cleanup is a separate explicit phase. It may remove only recorded fixture IDs with the matching marker. If marker or ownership cannot be proved, leave the entity and report REVIEW.

## Output

Include mode, requested scenarios, fixture IDs, verification status, cleanup commands, and errors. Never print credentials or personal data.
