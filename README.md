# Тихий план — Telegram Mini App

Личное расписание, домашние задания, утренний план и транспорт. Для публикации проект использует React/Vite, Cloudflare Worker и D1. Worker обслуживает интерфейс и API, проверяет Telegram `initData`, принимает webhook бота и запускает фоновые проверки по Cron.

Пошаговый деплой из Windows 10 через приватный GitHub-репозиторий и Cloudflare Workers Builds — в [DEPLOY.md](DEPLOY.md). Домен и Google Cloud Console не нужны.

## Основные части

- `apps/web` — React Mini App на русском, поддерживает темы Telegram, переключатель светлой/тёмной темы, календарь, расписание, вкладку ДЗ, настройки и план утра.
- `worker/src/index.ts` — Cloudflare Worker: проверка Telegram `initData`, API приложения, webhook и задачи по Cron.
- `worker/migrations` — SQLite миграции для Cloudflare D1.
- `worker/wrangler.toml` — имя Worker, статика приложения, D1 binding, Cron и настройки транспортного адаптера.
- `scripts/set-webhook.mjs` — подключение webhook к опубликованному Worker из Windows PowerShell.
- `apps/api` и Docker-файлы — предыдущий Fastify/PostgreSQL вариант для VPS; инструкция Cloudflare их не использует.

## Сборка и ограничения

`npm run typecheck` проверяет TypeScript для API, интерфейса и Worker. `npm run build -w @usm/web` собирает интерфейс для Cloudflare Assets. Для публикации нужен доступ Cloudflare Workers Builds к приватному GitHub репозиторию.

Данные из Mini App сохраняются только при запуске через Telegram. Без Telegram `initData` API возвращает отказ авторизации. Локальный браузерный предпросмотр не является отдельной тестовой учётной записью.

Оценка поездки около 30 минут помечается как приблизительная; пока не подключён проверенный маршрутизатор с остановками и пересадками. Живые позиции транспорта не считаются доказательством пробок или ETA.
# USM-Economice
