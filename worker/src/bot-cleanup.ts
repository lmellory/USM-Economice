import { createDb } from './db.js';
import { json } from './homework.js';
import { telegram, TelegramApiError } from './telegram.js';
import { Env } from './types.js';
const WINDOW = 48 * 60 * 60 * 1000;

export async function handleBotCleanup(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const db = createDb(env);
  const now = Date.now();
  // Leave a minute of margin so the oldest message does not expire during a Telegram request.
  const cutoff = now - WINDOW + 60000;
  if (request.method === 'GET') {
    const row = await db
      .prepare(
        'SELECT SUM(CASE WHEN keep=0 AND cleared_at IS NULL AND sent_at>? THEN 1 ELSE 0 END) AS eligible, SUM(CASE WHEN keep=0 AND cleared_at IS NULL AND sent_at<=? THEN 1 ELSE 0 END) AS expired FROM bot_messages WHERE user_id=?'
      )
      .bind(cutoff, cutoff, userId)
      .first<any>();
    return json({ eligible: Number(row?.eligible || 0), expired: Number(row?.expired || 0) });
  }
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается.' }, 405);
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Некорректный запрос.' }, 400);
  }
  if (body?.confirm !== true) return json({ error: 'Подтверди очистку сообщений.' }, 400);
  if (
    body.snapshotAt != null &&
    (!Number.isSafeInteger(body.snapshotAt) || body.snapshotAt <= 0 || body.snapshotAt > now)
  )
    return json({ error: 'Некорректное время очистки.' }, 400);
  const snapshotAt = body.snapshotAt ?? now;
  const rows = await db
    .prepare(
      'SELECT message_id FROM bot_messages WHERE user_id=? AND keep=0 AND cleared_at IS NULL AND sent_at>? AND sent_at<=? ORDER BY sent_at,message_id LIMIT 100'
    )
    .bind(userId, cutoff, snapshotAt)
    .all<{ message_id: number }>();
  const ids = rows.results.map((row) => Number(row.message_id));
  if (ids.length) {
    try {
      const result = await telegram(env, 'deleteMessages', { chat_id: userId, message_ids: ids });
      if (result.result !== true) throw new Error('Unconfirmed deletion');
    } catch (e) {
      return json(
        {
          error:
            e instanceof TelegramApiError && e.code === 429
              ? 'Telegram просит немного подождать. Повтори очистку позже.'
              : 'Telegram не подтвердил удаление. Попробуй ещё раз.',
          retryAfter: e instanceof TelegramApiError ? e.retryAfter : 0,
        },
        503
      );
    }
    // Mark only acknowledged identifiers, preserving both the welcome and newer messages.
    await db
      .prepare(
        `UPDATE bot_messages SET cleared_at=? WHERE user_id=? AND keep=0 AND message_id IN (${ids.map(() => '?').join(',')})`
      )
      .bind(now, userId, ...ids)
      .run();
  }
  const left = await db
    .prepare(
      'SELECT COUNT(*) AS n FROM bot_messages WHERE user_id=? AND keep=0 AND cleared_at IS NULL AND sent_at>? AND sent_at<=?'
    )
    .bind(userId, cutoff, snapshotAt)
    .first<{ n: number }>();
  return json({ processed: ids.length, remaining: Number(left?.n || 0), snapshotAt });
}
