# Output contract

```json
{
  "runId": "string",
  "timestamp": "ISO-8601",
  "target": {"requestedUrl": "string", "finalUrl": "string", "home": "string", "siteurl": "string"},
  "environment": "local|staging|test|unknown|production",
  "requestedCapabilities": ["read"],
  "allowedCapabilities": ["read"],
  "wordpress": {"version": "string", "activeTheme": "string", "activePlugins": []},
  "backup": {"required": false, "verified": false, "evidence": null},
  "checks": [{"id": "string", "status": "PASS|FAIL|REVIEW", "evidence": "string"}],
  "verdict": "PASS|FAIL|REVIEW",
  "blockers": []
}
```
