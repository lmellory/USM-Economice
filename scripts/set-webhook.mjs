const token = process.env.BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const workerUrl = process.env.WORKER_URL?.replace(/\/$/, '');
if (!token || !secret || !workerUrl) {
  console.error('Заполни BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET и WORKER_URL в .env.local.');
  process.exit(1);
}
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: `${workerUrl}/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ['message'],
  }),
});
const result = await response.json();
if (!response.ok || !result.ok) {
  console.error('Telegram не принял webhook:', result.description || response.status);
  process.exit(1);
}
console.log('Webhook подключён.');
