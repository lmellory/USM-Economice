import { dateShift, toChisinauDate } from '@usm/shared';
import { json } from './homework.js';
import { buildEveningDigest, telegram } from './notifications.js';
import { Env } from './types.js';

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (
    !env.TELEGRAM_WEBHOOK_SECRET ||
    request.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET
  ) {
    return json({ error: 'Forbidden' }, 403);
  }

  const update: any = await request.json();
  const m = update.message;

  if (
    m?.text === '/start' &&
    m.from?.id &&
    m.chat?.type === 'private' &&
    String(m.chat.id) === String(m.from.id)
  ) {
    const url = env.MINI_APP_URL;
    const reply: any = {
      chat_id: m.chat.id,
      text: `Твоё расписание и план дня — по кнопке ниже. Если ботом пользуешься только ты, сохрани свой Telegram ID: ${m.from.id}.`,
    };
    if (url) {
      reply.reply_markup = {
        inline_keyboard: [[{ text: 'Открыть расписание', web_app: { url } }]],
      };
    }
    await telegram(env, 'sendMessage', reply);
    return json({ ok: true });
  }

  if ((m?.text === '/digest' || m?.text === '/plan') && m.from?.id && m.chat?.type === 'private') {
    const tomorrow = dateShift(toChisinauDate(new Date()), 1);
    const digestMsg = await buildEveningDigest(env, String(m.from.id), tomorrow);
    if (digestMsg) {
      await telegram(env, 'sendMessage', { chat_id: m.chat.id, text: digestMsg });
    }
    return json({ ok: true });
  }

  return json({ ok: true });
}
