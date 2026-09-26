# Output contract

## qa/runs/<run-id>/report.md

One-time report generated from tracker data and run artifacts.

Follows the template in `report-template.md` but populated with real data from:

- `qa/runs/<run-id>/run-summary.json`
- `qa/test-catalog.json`
- `qa/findings.json`

This file does NOT replace or duplicate the tracker's `qa/findings.json` or `qa/status.md`.
