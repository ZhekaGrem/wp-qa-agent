# Output contract

```json
{
  "runId": "string",
  "mode": "PLAN_ONLY|APPLY|CLEANUP",
  "fixtures": [{"key": "string", "type": "string", "id": null, "marker": "string", "status": "PLANNED|CREATED|VERIFIED|FAILED"}],
  "operations": [{"description": "string", "destructive": false, "status": "PLANNED|DONE|FAILED"}],
  "cleanup": [{"fixtureKey": "string", "status": "PLANNED|DONE|SKIPPED"}],
  "verdict": "PASS|FAIL|REVIEW"
}
```
