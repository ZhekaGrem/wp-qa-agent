---
name: wp-admin-access
description: Use when a WordPress site is reachable only through a browser and a wp-admin login (no SSH, WP-CLI, database or code) and QA is about to start, or when the tester says "ось доступ до адмінки", "підключись до сайту", "що є на сайті", "онови список сторінок". Logs in once, reads the environment type, WordPress version and active plugins from Site Health, and lists pages, posts, products and languages — without changing anything on the site.
allowed-tools: Read, Grep, Glob, Bash(node scripts/wp-inventory.mjs:*)
---
# WordPress admin-only access

The tester has a wp-admin login and nothing else. WP-CLI, SSH, SQL and `scripts/validate-config.sh` do not exist for them — do not use them here. (`wordpress-environment-guard` is the WP-CLI variant for local/staging setups.)

## Procedure

1. Check that `.env.qa` defines `QA_BASE_URL`, `QA_ADMIN_USER`, `QA_ADMIN_PASSWORD`: `Grep` for the key names only, never read or print the values. If the file or a key is missing, ask the tester to copy `config/wordpress-qa.example.env` to `.env.qa` and fill it in. Never ask for the password in chat.
2. Run `node scripts/wp-inventory.mjs --out qa/runs/<run-id>/inventory.json`, with `<run-id>` = UTC `YYYYMMDDTHHMMSSZ-inventory`.
   - Login reason `no-admin-bar-after-login` (2FA, captcha, custom login URL): run again with `--login-manual`. A browser window opens; the tester logs in by hand; the session is saved to `.auth/admin.json`.
3. Report to the tester, in their language:
   - access verdict (`PASS`, `REVIEW`, `FAIL`) and the reason;
   - environment type from Site Health (`production`, `staging`, … or `unknown`) — say plainly that production and unknown mean read-only (this flow never changes the site anyway);
   - WordPress version, active plugins with versions, languages (`htmlLang`, hreflang alternates), content source (`rest`, `sitemap`, `none`) and URL count.
4. Content source `none`: ask the tester which pages to check.

## Hard rules

- GET requests only. The single POST is the login form.
- Never click, type or submit anything else in wp-admin, including through browser MCP tools. If the tester asks for a change on the site, say this flow is read-only and that site changes go through the Write Guard confirmation described in AGENTS.md.
- Never print the password, cookies or the contents of `.auth/admin.json`.
- Access `FAIL` (site down, login rejected) stops QA: report `BLOCKED` with the reason; it is not a site defect.
