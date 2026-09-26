# 🚀 WordPress QA Agent

**WordPress QA Agent** — це сучасний захищений інструментарій та автономна система для автоматизованого тестування WordPress та WooCommerce за допомогою AI-агентів (Claude Code, Gemini CLI, Cursor, Copilot) та **Playwright Test Agents**.

---

## 📌 Основні можливості

- 🛡️ **Захист середовища (Environment Guard):** Автоматичне блокування руйнівних дій та тестування на продакшені за замовчуванням.
- 🛑 **Захист від видалення (Deletion Protection Hook):** Будь-які операції видалення (файли, тести, записи БД, фікстури) **перехоплюються та блокуються** за замовчуванням і вимагають явного підтвердження користувача.
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
3. **Git Pre-commit Hook:** Автоматичний хук у `.git/hooks/pre-commit` блокує випадкове видалення критичних файлів каталогу (`qa/test-catalog.json`, `qa/findings.json`, `tests/seed.spec.ts`).

---

## 🛠️ Встановлення та Налаштування

### 1. Встановлення залежностей
```bash
npm install
```

### 2. Створення конфігураційного файлу
```bash
cp config/wordpress-qa.example.env .env.qa
```
*Відредагуйте `.env.qa`, вказавши `QA_BASE_URL` (наприклад: `http://localhost:9400` або `https://staging.example.com`).*

### 3. Підключення MCP серверів (для Claude Code / AI-агентів)
```bash
# Playwright MCP
claude mcp add playwright -- npx -y @playwright/mcp@latest

# Chrome DevTools MCP
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

## 🎮 Команди — Що роблять і для чого

| Команда | Опис та призначення | Коли використовувати |
|---|---|---|
| **`npm run qa:setup`** | **Валідація та Встановлення Хуків:** Перевіряє інструментарій (Node, PHP, WP-CLI, Playwright) та встановлює Git-хук захисту від видалення у `.git/hooks/pre-commit`. | При першому запуску або оновленні проекту. |
| **`npm run qa:fast`** | ⚡ **Швидкий режим (Fast Mode):** Виконує Guard → підготовку фікстур → запуск E2E Playwright тестів → перевірку стану БД тільки для мутаційних дій → підсумковий звіт. | Для щоденного smoke/E2E тестування. |
| **`npm run qa:update`** | 🔄 **Режим оновлень (Update Mode):** Виконує Guard → Snapshot версій → критичні E2E тести → візуальне порівняння скріншотів (Visual Regression) → звіт. | Перед та після оновлення плагінів, тем або ядра WP. |
| **`npm run qa:full`** | 🛡️ **Повний аудит (Full Mode):** Проганяє Guard → статичний аналіз коду (PHPCS, ESLint, Stylelint) → PHPUnit → Plugin Check → всі E2E тести → Axe A11y → Visual → звіт. | Перед релізом проєкту або під час повного QA аудиту. |
| **`npm run qa:plan`** | 🗺️ **Режим планування (Planner Mode):** Playwright Planner досліджує сайт → генерує `test-plan.md` з `testId` → Generator створює `.spec.ts` тести. | При підключенні нового сайту або нових фіч. |
| **`npm run qa:cleanup`** | 🧹 **Безпечна чистка фікстур:** Запускає процедуру чистки з обов'язковим запитом підтвердження від користувача. | Для видалення створених під час тестів сутностей. |
| **`npm run qa:hooks`** | ⚓ **Оновлення Git-хуків:** Оновлює хуки захисту від видалення у `.git/hooks/`. | Для перевірки та поновлення захисту Git. |
| **`npm test`** | **Прямий запуск Playwright:** Запускає `npx playwright test`. | Для точкового запуску окремих спеків. |

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
