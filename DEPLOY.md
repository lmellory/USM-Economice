# Развёртывание расписания через GitHub и Cloudflare

Инструкция для Windows 10. Она относится к проекту расписания в этой папке. Файл `password-vault/docs/DEPLOY.md`, который ты приложила, описывает другой проект — менеджер паролей; его команды и настройку Google Drive переносить сюда нельзя.

## Что потребуется

- Аккаунт [GitHub](https://github.com/) и приложение [GitHub Desktop](https://desktop.github.com/). GitHub Desktop поддерживает Windows 10 64-bit ([системные требования](https://docs.github.com/en/desktop/overview/supported-operating-systems-for-github-desktop)).
- Аккаунт [Cloudflare](https://dash.cloudflare.com/).
- Аккаунт Telegram и бот от [@BotFather](https://t.me/BotFather).
- Домен покупать не нужно: Cloudflare выдаёт HTTPS адрес `https://usm-life.<твой-поддомен>.workers.dev` ([как работают workers.dev адреса](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)).

**Google Cloud Console не понадобится:** текущий проект не использует Google Drive или Google OAuth. Данные хранятся в Cloudflare D1. Не создавай Google OAuth-ключи для этой настройки.

## 1. Создай бота и сохрани необходимые значения

В Telegram открой [@BotFather](https://t.me/BotFather), отправь `/newbot`, задай имя и username, сохрани токен `BOT_TOKEN` в менеджере паролей. 
Никому не пересылай его.

Узнай свой числовой Telegram ID через доверенный способ. Ещё создай длинный webhook secret из латинских букв, цифр, `_` и `-` (от 32 символов). Он должен отличаться от bot token.

## 2. Создай приватный GitHub-репозиторий из проекта

1. Установи GitHub Desktop и войди в свой аккаунт.
2. Выбери **File → Add Local Repository…** и укажи папку проекта `C:\Users\mellory\Desktop\USM`.
3. Если GitHub Desktop сообщает, что репозиторий ещё не создан, выбери **create a repository**. Название, например, `usm-life`; выбери **Private**.
4. Убедись, что в списке изменений нет `.env`, `.env.local` или видео из `demovideo/`. Эти файлы исключены через `.gitignore`.
5. Нажми **Commit to main**, затем **Publish repository**. Проверь, что переключатель **Keep this code private** включён.

Не добавляй секреты в файлы проекта, описание коммита или сообщения GitHub.

## 3. Создай базу данных Cloudflare D1

В Cloudflare Dashboard открой **Workers & Pages → D1 SQL Database → Create database**. Назови базу `usm-life`.

Открой созданную базу → **Console**. Открой локальный файл `worker/migrations/0001_initial.sql`, скопируй всё содержимое в Console и нажми **Execute**. SQL создаёт личные настройки, занятия, ДЗ, отметки уведомлений и состояние транспорта. Cloudflare описывает запуск SQL через D1 Console в [руководстве D1](https://developers.cloudflare.com/d1/get-started/).

Скопируй `database_id` этой базы и открой `worker/wrangler.toml` в проекте. Замени `REPLACE_WITH_D1_DATABASE_ID` на скопированный ID, сохрани файл и отправь изменение в GitHub через GitHub Desktop (**Commit to main → Push origin**).

## 4. Подключи GitHub к Cloudflare Workers Builds

1. В Cloudflare открой **Workers & Pages → Create application → Get started → Import a repository**.
2. Разреши Cloudflare доступ только к приватному репозиторию `usm-life`, выбери его и ветку `main`.
3. Имя Worker задай точно `usm-life` — оно совпадает с `name` в `worker/wrangler.toml`.
4. Укажи корневую папку репозитория `/`.
5. Настрой сборку:

   - **Build command:** `npm ci && npm run build -w @usm/web`
   - **Deploy command:** `npx wrangler deploy --config worker/wrangler.toml`

Cloudflare запускает команду сборки, затем публикацию Worker из выбранной ветки; подробнее — [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/). При первом подключении дай Cloudflare создать собственный токен сборки. Не вставляй личный API token в файлы GitHub.

## 5. Добавь переменные Worker в Cloudflare

В Cloudflare открой Worker `usm-life` → **Settings → Variables and Secrets**. Добавь runtime-переменные:

| Имя | Значение |
|---|---|
| `BOT_TOKEN` | токен из BotFather, тип Secret |
| `TELEGRAM_WEBHOOK_SECRET` | созданный webhook secret, тип Secret |
| `ADMIN_TELEGRAM_ID` | твой числовой Telegram ID, тип Secret |
| `MINI_APP_URL` | `https://usm-life.<твой-поддомен>.workers.dev` |

В разделе **Bindings** должен быть D1 binding `DB`, привязанный к базе `usm-life`. Он описан в `worker/wrangler.toml`; если Cloudflare предложит подтверждение binding, выбери именно созданную базу.

Узнать точный `<твой-поддомен>` можно на странице **Workers & Pages** в Cloudflare. Включи маршрут `workers.dev` для Worker. После добавления или изменения переменных нажми **Deploy** либо отправь новый commit, чтобы Cloudflare опубликовал актуальную версию.

## 6. Проверь публикацию

Открой `https://usm-life.<твой-поддомен>.workers.dev/health`. Должен появиться JSON с `"ok":true`. Открой основной URL: Mini App должен показывать интерфейс, но API работает только в Telegram с валидным `initData`.

## 7. Подключи Telegram webhook

В корне проекта скопируй `.env.local.example` в `.env.local`, заполни `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` и `WORKER_URL` (`https://usm-life.<твой-поддомен>.workers.dev`). Этот файл исключён из Git.

Установи Node.js 20+ с [официального сайта](https://nodejs.org/) и открой PowerShell в корне проекта. Выполни:

```powershell
node --env-file=.env.local scripts/set-webhook.mjs
```

Ожидаемый ответ — `Webhook подключён.` Скрипт отправляет токен и секрет непосредственно в запросе к Telegram Bot API и не печатает их в консоль.

## 8. Привяжи Mini App в BotFather

В [@BotFather](https://t.me/BotFather) открой `/mybots` → выбери бота → **Bot Settings → Menu Button → Configure menu button**. Укажи заголовок `Открыть расписание` и тот же HTTPS URL Worker. Если Telegram попросит домен — используй поддомен `workers.dev`, назначенный Cloudflare. Затем отправь боту `/start` и открой Mini App.

После проверки каждое изменение в `main` можно отправлять кнопкой **Push origin** в GitHub Desktop; Workers Builds автоматически пересоберёт и развернёт приложение.

## Tranzy, приватность и ограничения

- Ключ Tranzy не нужен для первого запуска. Пока он не настроен, показывается примерная оценка около 30 минут, без вымышленных отправлений и пробок. Не добавляй ключ, пока не проверишь текущие условия и разрешённую частоту запросов поставщика. После проверки добавляй его как Secret в Worker; интервал регулируется runtime-переменной `TRANZY_REFRESH_MINUTES`.
- Текущая интеграция может проверить доступность endpoint и число позиций, но не рассчитывает подтверждённое прибытие, путь до остановки или пересадки.
- D1 хранит расписание, домашние задания, настройки и адреса отдельно по Telegram ID. Адреса не выводятся в логи приложения. Данные не защищены мастер-паролем на телефоне, поэтому не храни здесь пароли или платёжные сведения.
- Для D1 существуют суточные квоты на бесплатном тарифе; при превышении запросы могут временно перестать выполняться ([лимиты D1](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)). Настрой резервное копирование D1 до хранения важных данных.
- Cron Worker отправляет включённые напоминания о ДЗ, сне и подъёме. Telegram не заменяет системный будильник. Напоминания о выходе из дома и изменениях маршрута ещё не подключены.
- В приложении укажи дату начала семестра и чётность первой недели, а также фактическую длительность английского, когда узнаешь её.

## Если возникла ошибка

- **Сборка не найдена:** проверь корневую папку `/`, имя Worker `usm-life` и build/deploy команды.
- **Ошибка D1:** проверь, что ID в `worker/wrangler.toml` соответствует базе, а SQL миграции выполнен в её Console.
- **401 в Mini App:** открывай приложение через Telegram-бота, не обычной вкладкой браузера.
- **403:** проверь `ADMIN_TELEGRAM_ID` среди переменных Worker.
- **Бот не отвечает:** проверь webhook в Cloudflare Logs и `getWebhookInfo` Telegram; проверь совпадение webhook secret.
- Просматривай Worker Logs в Cloudflare Dashboard, не записывай туда токен, адреса, Telegram `initData` или тексты ДЗ.
