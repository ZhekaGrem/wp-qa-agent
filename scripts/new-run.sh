#!/usr/bin/env bash
set -euo pipefail
slug="${1:-wordpress-qa}"
slug="$(printf '%s' "$slug" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9_-')"
run_id="$(date -u +%Y%m%dT%H%M%SZ)-${slug:-wordpress-qa}"
base="qa/runs/$run_id"
mkdir -p "$base"/{code-quality,unit,integration,playwright,accessibility,visual,html,traces,screenshots}
printf '%s\n' "$run_id"
