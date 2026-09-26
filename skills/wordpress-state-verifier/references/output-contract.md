# Output contract

```json
{
  "runId": "string",
  "scenario": "string",
  "correlation": {"type": "string", "value": "redacted-or-safe-value"},
  "expected": {},
  "observations": [{"channel": "browser|api|wp-cli|mail|cron|webhook|db", "status": "PASS|FAIL|REVIEW", "evidence": "string"}],
  "negativeGuarantees": [{"name": "string", "status": "PASS|FAIL|REVIEW"}],
  "verdict": "PASS|FAIL|REVIEW"
}
```
