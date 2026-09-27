# WordPress QA project rules

Use the project skills under `skills/` for WordPress and WooCommerce QA following a modular, 3-mode testing architecture with strict Deletion Protection Hooks.

## Deletion Protection Policy (Mandatory Hook)

**Any operation that deletes files, database entries, posts, users, plugins, options, or test fixtures IS BLOCKED BY DEFAULT** and requires explicit human confirmation.

- **Interactive Execution:** Asks user confirmation: `Do you confirm deleting "<target>"? (y/N)`
- **Automated / CI Execution:** Refuses execution unless `QA_ALLOW_DELETION=true` is explicitly set in `.env.qa`.
- **Intercepted Commands/APIs:** `rm`, `unlink`, `wp post delete`, `wp user delete`, `wp option delete`, `wp db reset`, `DROP TABLE`, `DELETE FROM`.
- **Git Hook Protection:** Pre-commit hook lives at `.githooks/pre-commit` — version-controlled and shipped with the repo, not generated into the untracked `.git/hooks/` folder. `npm install` runs `scripts/install-hooks.mjs` via the `prepare` lifecycle script, which sets `git config core.hooksPath .githooks` so every clone/CI checkout gets it automatically. It blocks committing deletions of protected QA files (`qa/test-catalog.json`, `qa/findings.json`, `qa/status.md`, `tests/seed.spec.ts`, `AGENTS.md`).

---

## Write / Mutation Protection Policy (Mandatory Hook)

**Any operation that changes data on the target site** — creating/updating posts, pages, users, options, settings, comments; installing/activating/updating plugins or themes; submitting forms, checkout, or payment flows — **IS BLOCKED BY DEFAULT** and requires explicit human confirmation, exactly like deletions. Read-only browsing, screenshots, and GET requests are never blocked.

- **Interactive Execution:** Asks user confirmation before every mutating action: `Do you confirm this change on the site: "<action>"? (y/N)` (`scripts/write-guard.mjs` → `confirmWrite()`).
- **Automated / CI Execution:** Refuses execution unless `QA_ALLOW_WRITES=true` is explicitly set in `.env.qa`.
- **Intercepted Commands/APIs:** `wp post|page|user|option|term|comment create|update`, `wp plugin install|activate|deactivate|update`, `wp theme install|activate|update`, `wp core update`, `curl -X POST|PUT|PATCH|DELETE`, `INSERT INTO`, `UPDATE ... SET`.
- **Related toggles:** `QA_ALLOW_UPDATES` (plugin/theme/core updates), `QA_ALLOW_EMAIL`, `QA_ALLOW_PAYMENTS`, `QA_ALLOW_REFUNDS` — each stays `false` by default and gates its own category of mutation.
- **Scope:** applies everywhere, including production. Since this project only has browser-level access to the live site (no WP-CLI/SSH), fixture creation and state changes go through the WordPress REST API or wp-admin UI automation — both still pass through the same confirmation gate before anything is written.
- **wp-admin browser actions (Playwright MCP / Chrome DevTools MCP):** `scripts/write-guard.mjs` only sees shell/WP-CLI/curl commands. The actual path the agent uses to touch wp-admin is browser automation through the MCP tools (`mcp__playwright__*`, `mcp__chrome-devtools__*`), which never goes through Bash. This is gated separately by a **PreToolUse hook** (`.claude/settings.json` → `scripts/wp-admin-write-guard.mjs`): any click, type, fill, drag, select, file upload, dialog handling, or script evaluation on those tools is routed to `permissionDecision: "ask"` — the agent cannot save/change anything in wp-admin without a human approving that specific tool call. Read-only actions (navigate, screenshot, snapshot, console/network inspection) are explicitly allowed and never prompt. An unrecognized/new MCP tool action defaults to `ask` (fail-safe). This is a harness-level control, independent of what the agent decides to do — it cannot be bypassed by instructions in a prompt.

---

## Workflow Modes

Instead of a single compulsory 17-step pipeline on every run, the workflow is split into 3 practical execution modes plus an opt-in Planner mode:

```mermaid
flowchart TD
    Start{"Choose Mode"} --> Fast["npm run qa:fast"]
    Start --> Update["npm run qa:update"]
    Start --> Full["npm run qa:full"]
    Start --> Plan["npm run qa:plan"]

    subgraph FastMode["Fast Mode (Daily Smoke/E2E)"]
        F1["Environment Guard"] --> F2["Optional Fixtures"]
        F2 --> F3["Playwright E2E Tests"]
        F3 --> F4["State Verifier (Mutations Only)"]
        F4 --> F5["Update Tracker & Short Report"]
    end

    subgraph UpdateMode["Update Mode (Plugin/Theme/WP Update)"]
        U1["Environment Guard"] --> U2["Version Snapshot & Backup"]
        U2 --> U3["Fixtures"]
        U3 --> U4["Critical Playwright Tests"]
        U4 --> U5["Visual Comparison"]
        U5 --> U6["State Verifier"]
        U6 --> U7["Tracker & Report"]
    end

    subgraph FullMode["Full Mode (Release & Pre-audit)"]
        L1["Environment Guard"] --> L2["Static Analysis (PHPCS/ESLint/Stylelint)"]
        L2 --> L3["PHPUnit Tests"]
        L3 --> L4["Plugin Check (if plugin)"]
        L4 --> L5["Full Playwright"]
        L5 --> L6["Axe Accessibility & Visual"]
        L6 --> L7["State Verifier & Comprehensive Report"]
    end

    subgraph PlanMode["Planner Mode (Site Exploration)"]
        P1["Environment Guard"] --> P2["Playwright Planner (Explore Site)"]
        P2 --> P3["Human Gate: Approve Test Plan"]
        P3 --> P4["Register Plan in Catalog"]
        P4 --> P5["Playwright Generator (Generate Specs)"]
        P5 --> P6["Validate Specs & Human Code Review"]
    end

    Fast --> FastMode
    Update --> UpdateMode
    Full --> FullMode
    Plan --> PlanMode
```

---

## Commands & Execution

- `npm run qa:setup` — Validates environment, runtimes (Node, PHP, WP-CLI, Playwright), and points Git at the tracked `.githooks/` directory (also runs automatically on `npm install` via the `prepare` script).
- `npm run qa:fast` — Daily smoke & E2E test run (fast, focused, minimal token overhead).
- `npm run qa:update` — Plugin/theme update verification with visual comparisons and critical regression checks.
- `npm run qa:full` — Comprehensive pre-release audit (PHPCS, PHPUnit, Plugin Check, Playwright, Axe A11y, Visual).
- `npm run qa:plan` — Explores a new site or feature to generate test plans and `.spec.ts` files.
- `npm run qa:cleanup` — Safely cleans fixtures with Deletion Guard confirmation prompt.
- `npm run qa:hooks` — Re-runs the `core.hooksPath` configuration if it was ever reset (e.g. `git config --unset core.hooksPath`).

`scripts/write-guard.mjs` (`confirmWrite`, `isWriteCommand`) is the Write Guard counterpart to `scripts/deletion-guard.mjs` — any skill or script performing a mutating action on the target site imports it and asks for confirmation first.

---

## Simplified Run Artifacts

Each run produces **3 core files** in `qa/runs/<run-id>/`:

```text
qa/runs/<run-id>/
├── run.json                  # Aggregated technical status of the run
├── playwright-results.json   # Raw Playwright JSON results
├── report.md                 # Human-readable Markdown summary
├── raw/                      # Raw tool logs (phpcs.json, junit.xml, axe.json) — read only on demand
├── screenshots/              # Failure screenshots
└── traces/                   # Playwright execution traces
```

Global persistent tracking files:

```text
qa/
├── test-catalog.json         # Persistent test catalog (automationStatus + lastResult)
├── findings.json             # Persistent defect lifecycle tracker (OPEN -> VERIFIED -> CLOSED by human)
└── status.md                 # Generated QA dashboard overview
```

---

## Failure Classifier (3 Categories)

When a test fails, classify the cause into one of 3 distinct categories:

1. **`PRODUCT_BUG`** — Confirmed application defect (e.g., checkout returns HTTP 500).
   * *Action:* Register a defect in `qa/findings.json`. **Do NOT alter the test or locator.**
2. **`TEST_BUG`** — Stale locator, changed label, or test data mismatch.
   * *Action:* Invoke **Healer Agent** to propose a diff.
   * *Gate:* Human reviews and approves the diff before application. Re-run changed test (`PASSED` / `FAILED`).
3. **`ENVIRONMENT_FAILURE`** — Target site down, database error, or missing dependency.
   * *Action:* Mark run as `BLOCKED`.

---

## Safety & Evidence Rules

- **All deletions must pass Deletion Guard confirmation.**
- **All data-mutating actions must pass Write Guard confirmation** — no exceptions for production.
- Never report `PASS` without empirical evidence.
- Production is denied by default. All write operations require staging/local confirmation.
- Agent never sets `CLOSED` on findings — closing defects is a human decision.
