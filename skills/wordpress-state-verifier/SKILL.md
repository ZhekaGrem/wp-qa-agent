---
name: wordpress-state-verifier
description: Verifies the real server-side result of critical WordPress and WooCommerce actions after browser or API tests. Use after publishing, form submission, checkout, stock changes, coupons, order status changes, cron, email, webhooks, refunds, or cache invalidation.
allowed-tools: Read, Grep, Glob
---
# WordPress State Verifier

## Goal

Prove that the expected side effect occurred exactly as intended. A toast, redirect, or HTTP 200 is not sufficient.

## Preconditions

- Environment guard PASS.
- Expected transition and correlation key are known.
- Read-only verification is preferred.

## Procedure

1. Describe the expected transition as `before -> action -> after`.
2. Identify a correlation key: fixture marker, post ID, order ID, email recipient, idempotency key, or run ID.
3. Verify through at least two layers when available:
   - Browser-visible state.
   - REST/API response.
   - WP-CLI entity state.
   - WooCommerce order/stock state.
   - Mail catcher or email log.
   - Cron/action scheduler entry.
   - Webhook receiver log.
   - Read-only SQL as a last diagnostic channel.
4. Check negative guarantees: no duplicate order, no duplicate email, no unauthorized state change, no stock below expected level.
5. Retry only for documented asynchronous behavior; use a bounded timeout and record attempts.
6. Write `qa/runs/<run-id>/40-state-verification.json`.

## Common checks

- Post: ID, status, author, slug, modified time, metadata.
- Form: server-side record plus mail sink, not only UI success.
- Checkout: one order, correct lines/totals/status, stock transition, payment sandbox evidence.
- Coupon: expected discount and usage count transition exactly once.
- Refund: sandbox only; order/refund records and stock behavior.
- Cron/action scheduler: scheduled/completed/failed state and error output.

## Verdict

PASS requires matching expected state and negative guarantees. Conflicting channels produce REVIEW. A missing or incorrect side effect is FAIL.
