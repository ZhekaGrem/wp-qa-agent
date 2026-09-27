---
name: wp-visual-content-qa
description: Use when a tester asks, in their own words, to check how a WordPress site looks or reads — layout breaking on mobile, overlapping or cut-off elements, broken images, typos, placeholder or untranslated text, visible shortcodes or PHP warnings, mojibake, broken links — or to take a before/after baseline around a plugin, theme, menu or content change. Works with a wp-admin login only (no code or server access). Triggers - "перевір сторінку", "глянь на мобілці", "знайди помилки в тексті", "чи нічого не поїхало", "пройдись по всьому сайту", "зроби baseline", "порівняй після оновлення", "/wp-check".
allowed-tools: Read, Grep, Glob, Bash(node scripts/visual-qa.mjs:*)
---
# Visual & content QA for WordPress (admin-only access)

Do exactly what the tester asked — no more, no less. This is not code testing: no PHPCS, PHPUnit, WP-CLI, fixtures or checkout flows.

## 0. Preconditions

The newest `qa/runs/*-inventory/inventory.json` exists and `access.verdict` is not `FAIL`. Otherwise use the `wp-admin-access` skill first.

## 1. Turn the request into a plan

Write `qa/runs/<run-id>/plan-input.json` (`<run-id>` = UTC `YYYYMMDDTHHMMSSZ-<mode>`):

```json
{ "runId": "<run-id>", "request": "<the tester's words, verbatim>", "mode": "scan", "audience": "visitor",
  "pages": ["/", "/kontakty/"], "viewports": [360, 768], "masks": [".cookie-notice"], "checkLinks": true }
```

| The tester says | Plan |
|---|---|
| "перевір головну і контакти на мобілці" | those 2 URLs; viewports `[360, 768]`; `scan` |
| "пройдись по всьому сайту" | every inventory item of type `page` + up to 20 newest posts/products; `[360, 1366]`; `scan` |
| "знайди помилки в тексті" | the pages named (or all pages); `[1366]`; `scan` |
| "я поміняв меню — чи нічого не поїхало" | home + up to 5 key pages; all 4 viewports; `compare` if a baseline exists for them, else `scan` |
| "зроби baseline перед оновленням …" | key pages; all 4 viewports; `baseline` |
| "порівняй після оновлення" | same pages and viewports as the latest `baseline` run; `compare`. No `baseline` run exists at all (for these pages or for any page): still use `compare`, never substitute `scan` — pick the named page(s) (or key pages) and the default viewports. The scanner itself reports "no baseline" per page/viewport; only `compare` mode carries that into the verdict, so swapping it for `scan` turns a missing baseline into a false `PASS`. |
| "перевір адмінку / чернетки" | `audience: "admin"`; only `/wp-admin/` index, edit, plugins, site-health, nav-menus |

- Resolve names to URLs from the inventory ("контакти" → the item whose title or slug matches). Several or no matches: ask.
- Vague request ("перевір сайт") or more than 40 page × viewport checks: run with `--dry-run` first, show the page list, viewports, mode and check count, and wait for a yes.
- Add `masks` (CSS selectors) for regions that change on every load: sliders, cookie banners, dates, counters, live chat.
- `audience: "visitor"` unless the request is explicitly about wp-admin or unpublished content.

## 2. Scan

`node scripts/visual-qa.mjs run qa/runs/<run-id>/plan-input.json`

Output in `qa/runs/<run-id>/`: `plan.json`, `records/`, `screenshots/`, `text/`, `detections.json`, `diffs/` (compare only).
Coverage `BLOCKED`: stop and report `BLOCKED` with the printed errors. Do not review anything.
Coverage `INCOMPLETE`: some page × viewport checks were not scanned (each listed as `not scanned: <key> — <error>` and in `detections.json` → `coverage.missing`). Continue with the review of what was scanned, and name every missing check with its error in your answer. One specific case: `page navigated away to <url> during the scan` means the page redirected itself to another address — tell the tester which address, and that the page was not checked. The verdict will be at best `REVIEW`.

## 3. Review — you are the second pair of eyes

Detectors produce candidates, not verdicts.

1. For each detection in `detections.json` (each has a `ref`): Read its screenshot, find the element, decide `confirmed` or `rejected` with a one-line reason. A detection seen at several widths is listed once, with all of them in `viewports` (and `screenshots`); one decision covers every width. Typical false positives: intentional carousels, off-canvas menus, decorative duplicate words, brand names that mix alphabets. See `references/defect-catalog.md`.
2. Look at every screenshot of the narrowest and the widest viewport for what detectors cannot see — misaligned or overlapping blocks, cut-off headers, unreadable contrast, empty sections, broken menus → `AGT-LAYOUT`.
3. Read `text/<slug>@<widest>.json` (`<slug>` is the page's `slug` in `plan.json`: a readable part plus a hash of the URL, e.g. `kontakty-1a2b3c4d`) in the page's language (`lang`; if empty, infer it from the text): typos → `AGT-TYPO`, grammar → `AGT-GRAMMAR`, untranslated or mixed-language text → `AGT-UNTRANSLATED`. Quote the exact text. Report only what you are sure is wrong in that language.
4. Compare mode: for each `CHANGED` entry look at `diffs/<key>/` and the text diff in its record → `expected` (matches the change the tester made) or `regression`.

Write `qa/runs/<run-id>/review.json`:

```json
{ "decisions": [{ "ref": "D1", "decision": "confirmed", "reason": "форма не виводиться", "severity": "medium" }],
  "agentFindings": [{ "id": "AGT-TYPO", "page": "https://site/kontakty/", "viewport": 1366, "severity": "low",
                      "title": "Помилка: «адрес» замість «адреса»", "quote": "Наша адрес", "evidence": "screenshots/kontakty-1a2b3c4d@1366.png" }],
  "compareDecisions": [{ "key": "home-5e6f7a8b@1366", "decision": "regression", "reason": "меню переноситься на два рядки" }] }
```

Every detection needs a decision; a missing one keeps the verdict at `REVIEW`. Use exactly `confirmed`/`rejected` (and `expected`/`regression` for compare) — any other value counts as no decision.

## 4. Finalize

`node scripts/visual-qa.mjs finalize qa/runs/<run-id>`

It computes the verdict, merges confirmed defects into `qa/findings.json` and writes `summary.json` and `report.md`. Never write a verdict yourself and never edit `qa/findings.json` by hand.

## 5. Answer the tester

In the tester's language: verdict and its reasons, coverage (N/N), confirmed defects grouped by page (what, where, every viewport it was seen at, screenshot path, detector or your own judgment), what was not checked, and the path to `report.md`.

Missing baseline (`REVIEW` with "немає еталона"): tell the tester to ask for one through this same workflow — a request like "зроби baseline перед оновленням" (see the plan table above), which runs `mode: "baseline"`. Do not point to `npm run qa:plan` or any other script — that runs the unrelated site-exploration Planner mode, not a baseline.

## Hard rules

- Read-only. The scanner sends GET requests only and refuses nonce/action/logout/add-to-cart URLs. Do not work around it with browser MCP clicks.
- Never report `PASS` yourself — the verdict comes from `finalize`.
- Never set a finding to `CLOSED`.
- Do not fix anything on the site, even if asked in the same message. Report it and point to the Write Guard flow in AGENTS.md.
