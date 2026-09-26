#!/usr/bin/env bash
set -euo pipefail
ENV_FILE="${1:-.env.qa}"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE. Copy config/wordpress-qa.example.env first." >&2; exit 2; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
: "${QA_BASE_URL:?QA_BASE_URL is required}"
: "${QA_ENVIRONMENT:?QA_ENVIRONMENT is required}"
: "${QA_WP_CLI:?QA_WP_CLI is required}"
case "$QA_ENVIRONMENT" in local|development|dev|staging|test) ;; *) echo "Denied environment: $QA_ENVIRONMENT" >&2; exit 3;; esac
case "$QA_BASE_URL" in *localhost*|*127.0.0.1*|*.local*|*staging*|*stage*|*test*|*dev*) ;; *)
  if [[ "${QA_STAGING_MARKER:-}" == "" ]]; then
    echo "URL has no obvious non-production marker and QA_STAGING_MARKER is empty." >&2
    exit 4
  fi
;; esac

echo "=== System & Runtimes Check ==="
command -v node >/dev/null && echo "node: $(node --version)" || echo "WARNING: node not found"
command -v npm >/dev/null && echo "npm: $(npm --version)" || echo "WARNING: npm not found"
if command -v npx >/dev/null 2>&1; then
  PW_VER=$(npx playwright --version 2>/dev/null || true)
  echo "playwright: ${PW_VER:-not installed}"
fi
command -v php >/dev/null && echo "php: $(php --version | head -1)" || echo "WARNING: php not found"
command -v composer >/dev/null && echo "composer: $(composer --version 2>/dev/null | head -1)" || echo "WARNING: composer not found"

if command -v wp >/dev/null 2>&1; then
  echo "wp-cli: available ($(wp --version 2>/dev/null || true))"
else
  echo "WARNING: wp-cli binary not found in PATH."
fi

echo "=== Binaries & Tools Check ==="
[[ -x "vendor/bin/phpunit" ]] && echo "phpunit: vendor/bin/phpunit found" || echo "INFO: vendor/bin/phpunit not found"
[[ -x "vendor/bin/phpcs" ]] && echo "phpcs: vendor/bin/phpcs found" || echo "INFO: vendor/bin/phpcs not found"

echo "=== NPM Packages Check ==="
npm list @playwright/test --depth=0 2>/dev/null || echo "INFO: @playwright/test not in npm list"
npm list @wordpress/scripts --depth=0 2>/dev/null || echo "INFO: @wordpress/scripts not in npm list"
npm list @axe-core/playwright --depth=0 2>/dev/null || echo "INFO: @axe-core/playwright not in npm list"
npm list @wordpress/e2e-test-utils-playwright --depth=0 2>/dev/null || echo "INFO: @wordpress/e2e-test-utils-playwright not in npm list"

# playwright-cli check
if command -v playwright-cli >/dev/null 2>&1; then
  echo "playwright-cli: available"
else
  echo "WARNING: playwright-cli not found. Install with: npm install -g @playwright/cli@latest"
fi

# Seed test check
if [[ -f "tests/seed.spec.ts" ]]; then
  echo "Seed test: found (tests/seed.spec.ts)"
else
  echo "WARNING: tests/seed.spec.ts not found. Create a seed test for Playwright agents."
fi

# qa/ directory structure
mkdir -p qa/runs
if [[ ! -f "qa/test-catalog.json" ]]; then
  echo '{"version":1,"updatedAt":"","tests":[]}' | jq . > qa/test-catalog.json
  echo "Created empty qa/test-catalog.json"
fi
if [[ ! -f "qa/findings.json" ]]; then
  echo '{"version":1,"updatedAt":"","findings":[]}' | jq . > qa/findings.json
  echo "Created empty qa/findings.json"
fi

echo "Configuration shape is valid. This does not yet prove the target environment is safe."
