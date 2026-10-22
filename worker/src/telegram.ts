import { createDb } from './db.js';
import { Env } from './types.js';

export class TelegramApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly retryAfter = 0
  ) {
    super(message);
    this.name = 'TelegramApiError';
  }
}
export async function telegram(
  env: Env,
  method: string,
  body: unknown,
  options: { keep?: boolean } = {}
): Promise<any> {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const payload = (await response.json()) as any;
  if (!response.ok || payload?.ok === false) {
    const code = Number(payload?.error_code || response.status);
    const reason =
      code === 403
        ? 'Пользователь заблокировал бота или не разрешил сообщения.'
        : code === 429
          ? 'Telegram ограничил частоту отправки. Попробуй позже.'
          : code === 400
            ? 'Telegram отклонил сообщение: проверь получателя и текст.'
            : 'Telegram отклонил отправку сообщения.';
    throw new TelegramApiError(code, reason, Number(payload?.parameters?.retry_after) || 0);
  }
  const chatId = String((body as any)?.chat_id || '');
  const result = payload?.result;
  if (
    method === 'sendMessage' &&
    /^\d+$/.test(chatId) &&
    Number.isInteger(result?.message_id) &&
    result.message_id > 0
  ) {
    try {
      await createDb(env)
        .prepare(
          'INSERT INTO bot_messages(user_id,message_id,sent_at,keep) VALUES(?,?,?,?) ON CONFLICT(user_id,message_id) DO UPDATE SET keep=MAX(bot_messages.keep,excluded.keep)'
        )
        .bind(
          chatId,
          result.message_id,
          Number(result.date) > 0 ? Number(result.date) * 1000 : Date.now(),
          Number(Boolean(options.keep))
        )
        .run();
    } catch {
      // An acknowledged send must never be retried because its tracking write failed.
      console.error('bot_message_tracking_failed', { chatId, messageId: result.message_id });
    }
  }
  return payload;
}
