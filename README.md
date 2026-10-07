# Тихий план — Telegram Mini App

Личное расписание, домашние задания, утренний план и дорога до университета. Приложение построено на React 19 + Vite, Cloudflare Worker и базе данных Cloudflare D1 (SQLite). Worker отдаёт интерфейс и API, проверяет Telegram `initData`, обрабатывает webhook бота и запускает проверки по расписанию (Cron).

## Структура проекта

- `apps/web` — React 19 + Vite Mini App: интерфейс расписания, домашние задания, утренний план, настройки, темы (светлая, тёмная, розовая).
- `packages/shared` — чистые функции расчёта подъёма, сна, выхода, чётности недели и часового пояса Кишинёва с тестами `vitest`.
- `worker` — Cloudflare Worker: роутер API, авторизация Telegram `initData`, webhook, крон-уведомления и интеграция с Tranzy.
- `worker/migrations` — SQL-миграции Cloudflare D1.

## Команды

```bash
# Установка зависимостей
npm install

# Запуск тестов
npm test

# Проверка типов TypeScript во всех пакетах
npm run typecheck

# Сборка веб-приложения
npm run build

# Форматирование кода
npm run format

# Деплой в Cloudflare
npm run deploy:cloudflare

# Применение миграций D1
npm run migrate:cloudflare
```
