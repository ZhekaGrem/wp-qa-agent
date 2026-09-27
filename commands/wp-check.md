---
description: Visual and content QA of a WordPress site with wp-admin access only (read-only)
argument-hint: <what to check, in your own words>
---
The tester's request: $ARGUMENTS

1. If there is no `qa/runs/*-inventory/inventory.json`, or the newest one is older than 24 hours, use the `wp-admin-access` skill first.
2. Use the `wp-visual-content-qa` skill and do exactly what the request asks.
3. Reply with the verdict, coverage, confirmed defects and the path to `report.md`.

This workflow never changes the site. For local or staging sites with WP-CLI access, `/wordpress-qa` is the CI-style workflow.
