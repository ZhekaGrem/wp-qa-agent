# Output contract

## qa/test-catalog.json

See SKILL.md for full schema. Key fields per test:

```json
{
  "id": "WOO-CHECKOUT-001",
  "automationStatus": "PLANNED|GENERATING|AUTOMATED|NEEDS_REVIEW|BLOCKED|DEPRECATED",
  "lastResult": "PASSED|FAILED|FLAKY|SKIPPED|NOT_RUN"
}
```

These are separate dimensions. A test can be AUTOMATED with lastResult FAILED.

## qa/findings.json

See SKILL.md for full schema. Key lifecycle:

```
OPEN → IN_PROGRESS → FIXED → VERIFIED → CLOSED
                                      → REOPENED
              → WONT_FIX
              → DUPLICATE
```

Agent never sets CLOSED.

## qa/runs/<run-id>/run-summary.json

Immutable per run. See SKILL.md for full schema.

## qa/status.md

Fully generated from JSON. Never edit manually.
Regenerated after every tracker operation.
