# 🚀 WordPress QA Agent

**WordPress QA Agent** — це сучасний захищений інструментарій та автономна система для автоматизованого тестування WordPress та WooCommerce за допомогою AI-агентів (Claude Code, Gemini CLI, Cursor, Copilot) та **Playwright Test Agents**.

> Ціль тут — реальний прод-сайт, доступ до якого є лише через браузер (без SSH/коду на сервері). Тому PHP, Composer та WP-CLI — опційні: без них просто недоступні кроки Full Mode, що вимагають коду (PHPCS, PHPUnit, Plugin Check).

---

## 🎮 Режими роботи — що запускати і коли

| Команда | Що робить | Коли запускати |
|---|---|---|
| **`npm run qa:fast`** ⚡ | Guard → (опційно) фікстури → Playwright E2E → перевірка стану лише для мутаційних дій → короткий звіт. | Щодня / після будь-якої зміни на сайті — швидкий smoke-тест. |
| **`npm run qa:update`** 🔄 | Guard → снапшот версій плагінів/теми (через wp-admin UI, без WP-CLI) → критичні E2E тести → візуальне порівняння скріншотів → звіт. | До і після оновлення плагіна, теми чи ядра WP. |
| **`npm run qa:full`** 🛡️ | Guard → (якщо є доступ до коду) PHPCS/PHPUnit/Plugin Check → повний Playwright → Axe A11y → Visual → звіт. Без коду сервера — кроки PHPCS/PHPUnit/Plugin Check автоматично пропускаються. | Перед релізом / повний аудит. Найдовший режим. |
| **`npm run qa:plan`** 🗺️ | Playwright Planner досліджує сайт → генерує `test-plan.md` → людина затверджує план → Generator створює `.spec.ts`. | При підключенні нового сайту чи нової фічі, коли тестів ще немає. |
| `npm run qa:cleanup` 🧹 | Чистка тестових фікстур із обов'язковим запитом підтвердження. | Прибрати сутності, створені під час тестів. |
| `npm run qa:setup` | Перевіряє інструментарій і підключає версійований `.githooks/` (`git config core.hooksPath`). | Один раз при першому запуску — хоча `npm install` вже робить це сам. |
| `npm run qa:hooks` | Повторно виставляє `core.hooksPath`, якщо його хтось скинув. | Якщо `git config core.hooksPath` злетів (наприклад після `git config --unset`). |
| `npm test` | Прямий `npx playwright test` без обгортки qa-runner. | Точковий запуск окремого спека під час дебагу. |

**Практичне правило:** день у день — `qa:fast`; перед/після апдейту плагіна — `qa:update`; перед релізом — `qa:full`; для нового сайту, де ще немає тестів, — спочатку `qa:plan`.

---

## 📌 Основні можливості

- 🛡️ **Захист середовища (Environment Guard):** Автоматичне блокування руйнівних дій та тестування на продакшені за замовчуванням.
- 🛑 **Захист від видалення (Deletion Protection Hook):** Будь-які операції видалення (файли, тести, записи БД, фікстури) **перехоплюються та блокуються** за замовчуванням і вимагають явного підтвердження користувача.
- ✋ **Захист від запису (Write Protection Hook):** Будь-яка зміна даних на сайті (пости, опції, юзери, плагіни, форми, оплати) теж заблокована за замовчуванням і питає підтвердження перед виконанням — навіть якщо `QA_ALLOW_WRITES=true`.
- ⚡ **3 Модульні режими тестування:** Виконує тільки ті перевірки, які потрібні зараз (без зайвого очікування та витрати токенів).
- 🧠 **Playwright Test Agents (v1.56+):** Автоматичне дослідження сайту (Planner), генерація спеків (Generator) та інтерактивна пропозиція виправлень тестів (Healer).
- 📊 **Трекінг дефектів та каталогу:** Збереження постійної історії тестів (`qa/test-catalog.json`) та життєвого циклу багів (`qa/findings.json`).
- 🔌 **Підтримка MCP (Model Context Protocol):** Пряма інтеграція з Playwright MCP, Chrome DevTools MCP та Filesystem MCP.
- 💻 **Кросплатформеність:** Працює на Node.js без обов'язкової залежності від Linux Bash (повна підтримка Windows PowerShell).

---

## 🛡️ Політика Захисту від Видалення (Deletion Protection)

Система містить спеціальний **Deletion Guard Hook** ([scripts/deletion-guard.mjs](file:///f:/Progect/2026/skills/wp-qa-agent/scripts/deletion-guard.mjs)), який блокує будь-які спроби несанкціонованого видалення:

1. **Інтерактивне підтвердження:** При спробі видалити фікстури, бази даних чи файли виводиться запит:
   `❓ Do you confirm deleting "<target>"? (y/N)`
2. **Перехоплення небезпечних команд:** Перехоплюються команди `rm`, `unlink`, `wp post delete`, `wp user delete`, `wp option delete`, `wp db reset`, `DROP TABLE`.
3. **Git Pre-commit Hook:** Хук лежить у версійованому `.githooks/pre-commit` (а не в непідконтрольному git `.git/hooks/`), тож він реально приїжджає разом з репозиторієм при клонуванні. `npm install` сам виконує `git config core.hooksPath .githooks` (через `prepare`-скрипт) — нічого додатково запускати не треба. Блокує випадкове видалення критичних файлів каталогу (`qa/test-catalog.json`, `qa/findings.json`, `tests/seed.spec.ts`, `AGENTS.md`).

## ✋ Політика Захисту від Запису (Write Protection)

Аналогічний **Write Guard Hook** ([scripts/write-guard.mjs](file:///f:/Progect/2026/skills/wp-qa-agent/scripts/write-guard.mjs)) стоїть перед будь-якою зміною даних на сайті — щоб агент ніколи не редагував прод мовчки:

1. **Інтерактивне підтвердження:** Перед створенням/зміною поста, опції, юзера, плагіна, форми чи оплати виводиться запит:
   `❓ Do you confirm this change on the site: "<action>"? (y/N)`
2. **Перехоплення команд запису:** `wp post/option/user create|update`, `wp plugin install|activate|update`, `wp theme install|activate`, `wp core update`, `curl -X POST/PUT/PATCH`, `INSERT INTO`, `UPDATE ... SET`.
3. **Автоматизований запуск (CI):** без інтерактивного терміналу зміна відхиляється, поки в `.env.qa` явно не виставлено `QA_ALLOW_WRITES=true` (і окремо `QA_ALLOW_UPDATES`/`QA_ALLOW_EMAIL`/`QA_ALLOW_PAYMENTS`/`QA_ALLOW_REFUNDS` для відповідних категорій).
4. **Діє й при `QA_ALLOW_WRITES=true`:** прапорець лише дозволяє запит підтвердження з'явитися в CI; в інтерактивному режимі підтвердження людини потрібне завжди.
5. **Дії в самій wp-admin (через браузер):** `write-guard.mjs` бачить лише shell/WP-CLI/curl команди, а не кліки в браузері. Для дій через Playwright MCP / Chrome DevTools MCP (клік, введення тексту, drag, вибір опції, завантаження файлу, виконання JS) стоїть окремий **PreToolUse хук Claude Code** (`.claude/settings.json` → `scripts/wp-admin-write-guard.mjs`) — він на рівні харнесу вимагає підтвердження людини перед виконанням цих інструментів. Read-only дії (навігація, скріншот, snapshot, читання консолі/мережі) дозволені без запиту. Це працює навіть якщо агент "вирішить" цього не робити — хук не залежить від інструкцій у промпті.

---

## 🛠️ Встановлення та Налаштування

### 0. Що встановити на комп'ютері (версії)

Мінімальний набір для роботи через браузер, без доступу до коду сервера:

| Інструмент | Версія | Навіщо |
|---|---|---|
| Node.js | LTS 20.x або 22.x (мінімум `>=18`, як у `package.json`) | Рушій агента, npm |
| npm | що йде разом з Node (10.x+) | Встановлення пакетів |
| Git | будь-яка сучасна (2.4x+) | Deletion/Write Guard git-хуки, версіонування |
| Playwright | `^1.56.0` (з `package.json`) + браузери через `npx playwright install` | E2E тести, скріншоти, трейси |
| Google Chrome (звичайний, stable) | остання стабільна | Потрібен окремо для `chrome-devtools-mcp` — цей MCP керує реальним Chrome, не браузером із комплекту Playwright |
| Claude Code CLI | остання версія | Сам агент і `claude mcp` команди нижче |
| `@axe-core/playwright` | остання (додати в `devDependencies`, зараз відсутній) | A11y-перевірки в Full Mode, працює через браузер |

PHP, Composer, WP-CLI — **не потрібні**, якщо є лише браузерний доступ до прод-сайту (без SSH/коду). Вони потрібні тільки якщо колись з'явиться доступ до вихідного коду плагіна/теми для PHPCS/PHPUnit/Plugin Check.

### 1. Встановлення залежностей
```bash
npm install
npx playwright install
```
*`npm install` автоматично підключає версійовані Git-хуки з `.githooks/` (нічого додатково запускати не треба).*

### 2. Створення конфігураційного файлу
```bash
cp config/wordpress-qa.example.env .env.qa
```
*Відредагуйте `.env.qa`, вказавши `QA_BASE_URL` (наприклад: `http://localhost:9400` або `https://staging.example.com`).*

### 3. Підключення MCP серверів (для Claude Code / AI-агентів)

Кожна команда нижче при першому запуску сама довантажує пакет через `npx` (потрібен доступ до `registry.npmjs.org`) — окремо встановлювати MCP-пакети не треба, але **для Chrome DevTools MCP на комп'ютері має бути встановлений сам Google Chrome**.

```bash
# Playwright MCP — використовує браузери Playwright (встановлені кроком 1)
claude mcp add playwright -- npx -y @playwright/mcp@latest

# Chrome DevTools MCP — керує реальним встановленим Chrome, не Playwright-браузером
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest

# Filesystem MCP
claude mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem "$(pwd)"

# Перевірка підключених MCP
claude mcp list
```

### 4. Первинна валідація налаштувань та встановлення Git-хуків
```bash
npm run qa:setup
```

---

## 📂 Структура артефактів (`qa/`)

```text
qa/
├── test-catalog.json          # Постійний реєстр усіх тестів
├── findings.json              # Реєстр дефектів та їхній життєвий цикл (OPEN -> VERIFIED -> CLOSED)
├── status.md                  # Згенерований огляд стану QA
└── runs/
    └── <run-id>/              # Ізольована папка конкретного запуску
        ├── run.json           # Головний маніфест з агрегованими результатами
        ├── playwright-results.json # Сирі результати Playwright
        ├── report.md          # Короткий підсумковий Markdown-звіт
        ├── raw/               # Логи PHPCS, PHPUnit, Axe
        ├── screenshots/       # Скріншоти помилок та візуальних порівнянь
        └── traces/            # Traces Playwright для відладки
```
