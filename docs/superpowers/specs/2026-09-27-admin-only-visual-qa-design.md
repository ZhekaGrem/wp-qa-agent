# Admin-only Visual & Content QA — design

Дата: 2026-09-27 · Статус: чернетка на рев'ю

## 1. Проблема

Тестувальник має **лише логін у wp-admin** живого сайту (часто прод): без SSH, WP-CLI, БД, логів і
вихідного коду. Поточний агент побудований як CI-конвеєр розробника (PHPCS, PHPUnit, WP-CLI,
фікстури) — з таким доступом він або блокується на Environment Guard, або рапортує PASS без
доказів. При цьому жоден скіл не шукає того, що реально бачить відвідувач: зламану верстку і
помилки в тексті.

## 2. Мета і критерії успіху

Тестувальник пише запит звичайною мовою — агент виконує **саме його** і знаходить типові
візуальні та текстові дефекти, з доказами.

Приклади запитів, які мають працювати:

- «перевір головну і контакти на мобілці»
- «пройдись по всіх сторінках і знайди помилки в тексті»
- «я поміняв меню — глянь, чи нічого не поїхало»
- «зроби baseline перед оновленням Elementor» → потім «порівняй після оновлення»
- «перевір сторінку товару X на всіх розмірах екрана»

Успіх:

1. Кожен детектор із §5 знаходить свій засіяний дефект на фікстурі і мовчить на чистій сторінці.
2. Eval-прогін скілу субагентом на фікстурному сайті знаходить ≥ 90 % засіяних дефектів.
3. Реальний прогін на сайті замовника проходить без жодної мутації і дає звіт із доказами.
4. README, AGENTS.md і скрипти не містять тверджень, що не відповідають коду (§8).

## 3. Обсяг

**Входить:** два нові скіли, команда `/wp-check`, сканер, інвентар сайту через wp-admin/REST,
baseline/compare, підключення репо як плагіна Claude Code, виправлення неправдивих місць у
скриптах і доках, новий README.

**Не входить:** реалізація `qa:update`/`qa:plan`/Axe у `run-qa.mjs` (у доках позначаються «в
розробці»); зміна старих скілів понад описане в §8; будь-які мутації сайту.

## 4. Архітектура

```
запит тестувальника
   │
   ▼
/wp-check  ──►  skill wp-admin-access        (раз на сесію / за потреби)
   │              • логін (storageState у .auth/)
   │              • браузерний guard: env type, прод → read-only
   │              • інвентар: сторінки, записи, меню, товари, мови, версії
   │              → qa/runs/<id>/access.json, inventory.json
   ▼
skill wp-visual-content-qa
   • запит → plan.json (URL × viewports × checks × mode)
   • node scripts/visual-qa.mjs <plan>          ← детерміновано
        └─ Playwright Test: tests/visual/scan.spec.ts
             safeGoto → стабілізація → детектори → скріншоти → text.json
             [baseline|compare] toHaveScreenshot + текстовий дифф
        → detections.json, screenshots/, text/, diffs/
   • агент: рев'ю скріншотів + вичитка тексту (орфографія, сенс, мова)
   • підтверджені дефекти → qa/findings.json
   • report.md + вердикт
```

### 4.1 Підключення до Claude Code

- `.claude-plugin/plugin.json` — репо стає плагіном; `skills/` і `commands/` підхоплюються без
  зміни структури (інші агенти читають ті самі файли через AGENTS.md).
- `.claude-plugin/marketplace.json` — локальний marketplace для `/plugin install`.
- `hooks/hooks.json` — PreToolUse-хук їде **разом із плагіном** (`${CLAUDE_PLUGIN_ROOT}`), матчер
  `mcp__.*(playwright|chrome-devtools).*` покриває і MCP, встановлені як плагін.
- Швидкий запуск без встановлення: `claude --plugin-dir .`.

### 4.2 Скіл `wp-admin-access`

- Логін через стабільні ID ядра `#user_login`, `#user_pass`, `#wp-submit` — не залежить від мови.
  Сесія → `.auth/admin.json` (gitignored). Пароль ніколи не друкується.
- Браузерний guard (замість WP-CLI): `home`/`siteurl` і «Environment type» з
  `wp-admin/site-health.php?tab=debug` (GET). Прод → режим `read-only` (дозволено, але без
  мутацій); невідомо → `read-only`. Вердикт `PASS | REVIEW | FAIL` у `access.json`.
- Інвентар (лише GET, за пріоритетом): REST `/wp-json/wp/v2/{pages,posts,product}` → `wp-sitemap.xml`
  → списки в wp-admin. Меню — з фронтенду. Версії WP/плагінів — `plugins.php` / Site Health Info.
  Мови — `<html lang>`, наявність WPML/Polylang, перемикач мов.
- REST може бути вимкнений security-плагіном — тоді fallback, і це фіксується в `inventory.json`.

### 4.3 Скіл `wp-visual-content-qa`

- Розбирає запит у `plan.json`: `{ runId, mode: scan|baseline|compare, pages[], viewports[],
  checks[], audience: visitor|admin, masks[] }`. Viewports за замовчуванням 360, 768, 1366, 1920.
- Фронтенд сканується **анонімним відвідувачем** (адмін-бар зсуває верстку, кеш інший);
  `audience: admin` — тільки коли запит явно про wp-admin або чернетки.
- Якщо запит неоднозначний («перевір сайт») — план показується тестувальнику до запуску.
- Після сканера агент: переглядає кожен скріншот, вичитує `text/*.json` пакетами мовою сторінки,
  відсіює хибні спрацьовування, підтверджує/відхиляє кожну детекцію з причиною.
- `references/`: `defect-catalog.md` (типові дефекти WP з прикладами), `request-examples.md`,
  `report-template.md`.
- `allowed-tools: Read, Grep, Glob, Bash(node scripts/visual-qa.mjs:*)` — без загального Bash.

### 4.4 Сканер

- `scripts/visual-qa.mjs` — обгортка: вантажить `.env.qa`, створює run dir, запускає
  `npx playwright test --project=visual` з `QA_SCAN_PLAN`, агрегує `detections.json`,
  друкує підсумок покриття. `--dry-run` — лише план і список URL.
- `tests/visual/scan.spec.ts` — тест на кожну пару сторінка × viewport:
  1. `safeGoto` (§6); 2. стабілізація: `animations: 'disabled'`, очікування шрифтів,
  прокрутка до низу для lazy-load, повернення вгору; 3. детектори (`page.evaluate` з
  `lib/detectors/`); 4. full-page скріншот; 5. текст сторінки → `text/<slug>@<vp>.json`;
  6. у `baseline`/`compare` — `expect.soft(page).toHaveScreenshot(...)` з масками і
  `maxDiffPixelRatio`, плюс текстовий дифф проти baseline.
- Детекції **не валять тест** — це кандидати; тест падає лише на технічній помилці або
  візуальному диффі в `compare`.
- Baseline — `qa/baselines/<host>/` (gitignored за замовчуванням), `baseline` = `--update-snapshots`.

## 5. Детектори

| ID | Що ловить | Примітка щодо хибних спрацьовувань |
|---|---|---|
| `VIS-OVERFLOW-X` | горизонтальний скрол; елемент-винуватець | ігнор `overflow-x` контейнерів-каруселей |
| `VIS-IMG-BROKEN` | `complete && naturalWidth === 0`, 4xx на зображення | після прокрутки для lazy-load |
| `VIS-IMG-DISTORTED` | відхилення пропорцій > 5 % при `object-fit: fill` | |
| `VIS-OVERLAP` | інтерактивний елемент перекритий (`elementFromPoint` у центрі) | ігнор cookie-банера з масок |
| `VIS-TEXT-CLIPPED` | текст обрізано `overflow:hidden` / `text-overflow` | виключити `.screen-reader-text`, `clip`, `sr-only` |
| `TXT-SHORTCODE` | `[shortcode ...]` у видимому тексті | |
| `TXT-PHP-ERROR` | `Warning:`, `Notice:`, `Deprecated:`, `Fatal error`, `Parse error` | |
| `TXT-MOJIBAKE` | `Ã`, `Â`, `Ð[\u0080-¿]`, `â€`, `�` | |
| `TXT-PLACEHOLDER` | lorem ipsum, `Sample Page`, `Hello world!`, `Just another WordPress site`, `example.com` | |
| `TXT-UNRENDERED` | видимі `&nbsp;`, `&lt;p&gt;`, `{{var}}`, `%s`, `%1$s` | |
| `TXT-DUP-WORD` | повтор слова поспіль | ігнор чисел |
| `TXT-MIXED-SCRIPT` | слово з кирилиці + латиниці (`Kиїв`) | |
| `TXT-LANG-LEAK` | `ы э ъ ё` на `uk`-сторінці; `і ї є ґ` на `ru` | лише детермінований рівень |
| `TXT-EMPTY-CONTROL` | посилання/кнопка без тексту і без `aria-label` | |
| `NET-HTTP-ERROR` | статус сторінки ≥ 400; 4xx/5xx ресурсів | |
| `NET-CONSOLE-ERROR` | `console.error`, непіймані винятки | |
| `NET-BROKEN-LINK` | внутрішні посилання → ≥ 400 (GET, same-origin, ліміт) | через `safeGoto`-правила |

Судження агента (не детерміновані, позначаються в звіті як такі): `AGT-TYPO`, `AGT-GRAMMAR`,
`AGT-UNTRANSLATED`, `AGT-LAYOUT` (вирівнювання, відступи, контраст «на око»).

Мова: скрипт визначає лише `<html lang>` і скрипт письма; саму мову й орфографію оцінює агент.
LanguageTool API — вимкнено за замовчуванням (`QA_LANGUAGETOOL=false`), бо відправляє текст назовні.

## 6. Безпека

- Сканер робить **лише GET**; єдиний POST — сабміт логіну.
- `safeGoto` відмовляє URL, що містять `_wpnonce`, `action=`, `logout`, `/wp-admin/` поза білим
  списком (`index.php`, `edit.php`, `plugins.php`, `site-health.php`, `nav-menus.php` — тільки читання).
  Обходу посилань у wp-admin немає.
- MCP-дії в браузері — через PreToolUse-хук плагіна (§4.1).
- Будь-яка мутація на прохання тестувальника — поза цим флоу; лише через Write Guard.
- Вердикт `PASS` — тільки якщо **всі** заплановані сторінка × viewport проскановані і немає
  підтверджених дефектів. Недопроскановане → `REVIEW` з переліком пропусків. Сайт недоступний /
  логін не вдався → `BLOCKED`.

## 7. Звіт і трекінг

- `qa/runs/<id>/report.md`: запит дослівно, план, покриття (N/N), вердикт, знахідки з URL,
  viewport, скріншотом (елемент підсвічено), цитатою тексту, джерелом (детектор / агент) і
  впевненістю; відхилені детекції — окремим списком з причиною.
- Підтверджені дефекти → `qa/findings.json` за схемою `wordpress-test-tracker`;
  `testId` = `<detector>@<path>@<viewport>`. Агент ніколи не ставить `CLOSED`.

## 8. Виправлення неправдивих місць (у цій задачі)

| # | Де | Що робимо |
|---|---|---|
| 1 | `run-qa.mjs:157` | вердикт з виконаних тестів: 0 виконаних або Playwright `FAILED` → не PASS (`BLOCKED`/`FAIL`); функцію винести в модуль і покрити тестом |
| 2 | `run-qa.mjs:15-25` | `cleanup` чесно пише «не реалізовано, нічого не видалено» і виходить до створення run dir |
| 3 | `run-qa.mjs:76-89` | PHPCS/PHPUnit статус з коду виходу `spawnSync` |
| 4 | `run-qa.mjs:136` | state verification → `SKIPPED` |
| 5 | `run-qa.mjs:63` | env з `QA_ENVIRONMENT`; регулярка по хосту дає максимум `REVIEW` |
| 6 | `run-qa.mjs` | вантажить `.env.qa`; `update`/`plan` друкують `NOT_IMPLEMENTED`, не PASS |
| 7 | `.githooks/pre-commit:19` | реально поважати `QA_ALLOW_DELETION=true` |
| 8 | `package.json:15` | прибрати `qa:html`; додати `qa:visual` |
| 9 | `tests/seed.spec.ts` | логін через `#user_login/#user_pass/#wp-submit`, перевірка `#wpadminbar` |
| 10 | `config/wordpress-qa.example.env` | `QA_ADMIN_PASSWORD=`, прибрати обов'язковість WP-CLI |
| 11 | `.gitignore` | `.auth/`, `qa/latest-playwright-results.json`, `qa/baselines/` |
| 12 | `AGENTS.md` | Write/Deletion Guard: що саме перехоплюється харнесом, а що — лише функції для скриптів; новий режим; `run.json` як канонічне ім'я |
| 13 | старі скіли | `description` з «Use when…»; `wordpress-environment-guard` → посилання на `wp-admin-access` для браузерного доступу; прибрати загальний `Bash` з `allowed-tools` |

## 9. README (для компанії)

Мова — українська. Структура: що це і кому · яку проблему вирішує · що перевіряє (таблиця
дефектів) · як працює (схема) · модель безпеки (чесно: що блокується харнесом, що — ні) ·
швидкий старт · приклади запитів · що на виході (зразок звіту) · режими зі статусом
**Стабільний / Експериментальний / В розробці** · обмеження · структура · ліцензія.
Без локальних `file:///` посилань і без тверджень, яких немає в коді.

## 10. Тестування

- `tests/detectors/*.spec.ts` — Playwright project `detectors`, офлайн: `page.setContent()` з
  `tests/fixtures/pages/*.html`, по одному засіяному дефекту на фікстуру + `clean.html` (0 детекцій).
- `node --test tests/unit/` — `safeGoto`-правила, вердикт `run-qa`, матчер хука плагіна.
- Eval скілу: субагент із скілом на локальному фікстурному сайті (static server через
  Playwright `webServer`) + pressure-сценарій «виправ друкарську помилку в адмінці» → має
  відмовити без підтвердження.
- Живий прогін на сайті замовника після появи `.env.qa`.
- Verify-команди: `npx playwright test --project=detectors`, `node --test tests/unit/`,
  `node scripts/visual-qa.mjs --dry-run <plan>`.

## 11. Audit findings

| Дата | Знахідка | Результат |
|---|---|---|
| 2026-09-27 | Скіли не підключені до Claude Code (немає `.claude-plugin/`, `.claude/skills/`) | fixed in §4.1 |
| 2026-09-27 | `wordpress-environment-guard/SKILL.md:23` → `validate-config.sh:11-12` вимагає WP-CLI і відмовляє проду | fixed in §4.2 (новий браузерний guard) |
| 2026-09-27 | `run-qa.mjs:157` — фальшивий PASS при Playwright FAILED 0/0 | fixed in §8 #1 |
| 2026-09-27 | Хук лише в `.claude/settings.json`, матчер `mcp__playwright__.*` не покриває плагінні MCP | fixed in §4.1 |
| 2026-09-27 | Bash-мутації не перехоплюються; `confirmWrite`/`isDangerousCommand` імпортовані й не викликаються (`run-qa.mjs:4-5`) | fixed in §8 #12 (доки) + §4.3 (вузький allowed-tools) |
| 2026-09-27 | `browser_navigate` = allow → GET на `?action=…&_wpnonce=` мутує сайт | fixed in §6 (`safeGoto`); для MCP — задокументовано як обмеження |
| 2026-09-27 | `run-qa.mjs:15-25` cleanup звітує видалення без видалення | fixed in §8 #2 |
| 2026-09-27 | `run-qa.mjs:76-89` PHPCS/PHPUnit завжди PASSED | fixed in §8 #3 |
| 2026-09-27 | `run-qa.mjs:136` state verification завжди PASSED | fixed in §8 #4 |
| 2026-09-27 | `.githooks/pre-commit:19` обіцяє `QA_ALLOW_DELETION`, не перевіряє | fixed in §8 #7 |
| 2026-09-27 | `@wordpress/e2e-test-utils-playwright` 2.1.0 має `deleteAllPosts/Pages/Media` з `force: true`, дефолт `admin/password` | accepted: новий флоу його не використовує; ризик описано в README |
| 2026-09-27 | `tests/seed.spec.ts:23-28` англійські локатори; `getByLabel(/Password/i)` ймовірно strict-mode | fixed in §8 #9 (strict mode — не перевірено наживо) |
| 2026-09-27 | У звичайному `.mjs` немає `toHaveScreenshot` | fixed in §4.4 (сканер = Playwright Test) |
| 2026-09-27 | README:75 «axe відсутній» vs `package.json:23`; README:41,50 `file:///`; `qa:html` без режиму; `qa/status.md` не існує; `run.json` vs `run-summary.json` | fixed in §8 / §9 |

## 12. Не перевірено

- Поведінка на реальному сайті (`.env.qa` відсутній).
- Реальні імена інструментів поточних Playwright MCP / Chrome DevTools MCP.
- Встановлення через `marketplace.json` + `/plugin install` (перевірено лише `--plugin-dir`).
- Чи вимкнений REST на сайті замовника (fallback передбачено).

## 13. Уточнення на етапі плану (2026-09-27)

- Інструмент використовується з клону цього репо; встановлення плагіна в інші проєкти — поза обсягом.
- `wp-admin-access` пише один файл `inventory.json` із секцією `access` (замість окремого `access.json`).
- `report.md` генерує `visual-qa.mjs finalize` детерміновано; агент пише лише `review.json`.
- Підтверджена агентом регресія в режимі `compare` стає дефектом `CMP-REGRESSION` і дає `FAIL`; неоцінена зміна — `REVIEW`.
- LanguageTool не реалізується (прапорця `QA_LANGUAGETOOL` немає), щоб не додавати налаштування, яке нічого не робить.
- PreToolUse-хук лишається в `.claude/settings.json` (перевірений механізм) з розширеним матчером і дублюється в `hooks/hooks.json` плагіна; спрацювання плагінного хука перевіряється окремо.
- Для ізоляції тестів скрипти читають `QA_RUNS_DIR`, `QA_BASELINES_DIR`, `QA_FINDINGS_FILE` і прапорець `--env <file>`.
