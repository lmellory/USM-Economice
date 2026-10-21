import {
  ADMIN_MESSAGE_LIMIT,
  BroadcastInput,
  BroadcastResult,
  BroadcastSummary,
  dateShift,
  toChisinauDate,
} from '@usm/shared';
import { createDb, Database } from './db.js';
import { json } from './homework.js';
import {
  buildEveningDigest,
  buildMorningWeatherMessage,
  telegram,
  TelegramApiError,
} from './notifications.js';
import { Env } from './types.js';

export function isUserAdmin(env: Env, userId: string): boolean {
  // Preserve the owner and grant additional admins only through server configuration.
  const owner = env.ADMIN_USER_ID?.trim() || '5067848442';
  const additionalAdmins = (env.ADMIN_USER_IDS || '')
    .split(/[\s,;]+/)
    .filter((id) => /^\d+$/.test(id));
  return new Set([owner, ...additionalAdmins]).has(String(userId));
}
const forbidden = () => json({ error: 'Доступ запрещён. Вы не являетесь администратором.' }, 403);

export async function handleAdminStats(
  _request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  if (!isUserAdmin(env, userId)) return forbidden();
  const db = createDb(env);
  const [usersRes, transitRes] = await Promise.all([
    db.prepare('SELECT id, first_name, created_at FROM users ORDER BY created_at DESC').all<any>(),
    db.prepare('SELECT * FROM transit_state WHERE id=1').first<any>(),
  ]);
  return json({
    ok: true,
    currentUserId: userId,
    totalUsers: usersRes.results.length,
    users: usersRes.results.map((u) => ({ ...u, id: String(u.id) })),
    transit: transitRes
      ? {
          available: Boolean(transitRes.available),
          checkedAt: transitRes.checked_at,
          vehicleCount: transitRes.vehicle_count,
        }
      : null,
  });
}

function parseInput(body: any): BroadcastInput {
  if (!body || !['custom', 'weather', 'evening'].includes(body.type))
    throw new Error('Выбери тип сообщения.');
  if (body.type === 'custom' && (typeof body.message !== 'string' || !body.message.trim()))
    throw new Error('Текст сообщения не может быть пустым.');
  if (typeof body.message === 'string' && body.message.trim().length > ADMIN_MESSAGE_LIMIT)
    throw new Error('Сообщение не может превышать 4096 символов.');
  if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(body.requestId))
    throw new Error('Отсутствует корректный идентификатор отправки.');
  if (!['self', 'selected', 'all'].includes(body.audience))
    throw new Error('Выбери получателей сообщения.');
  const ids: string[] = Array.isArray(body.targetUserIds)
    ? [...new Set<string>(body.targetUserIds.map((id: unknown) => String(id)))].sort()
    : [];
  if (
    body.audience === 'selected' &&
    (!ids.length || ids.length > 100 || ids.some((id) => !/^\d+$/.test(id)))
  )
    throw new Error('Выбери от 1 до 100 пользователей из списка.');
  return {
    requestId: body.requestId,
    type: body.type,
    message: body.type === 'custom' ? body.message.trim() : '',
    audience: body.audience,
    targetUserIds: body.audience === 'selected' ? ids : [],
  };
}

function summary(row: any): BroadcastSummary {
  const value = (key: string) => Number(row[key] || 0);
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    created_at: row.created_at,
    totalTargeted: value('totalTargeted'),
    sentCount: value('sentCount'),
    failedCount: value('failedCount'),
    unknownCount: value('unknownCount'),
    pendingCount: value('pendingCount'),
    sendingCount: value('sendingCount'),
    complete: value('pendingCount') === 0 && value('sendingCount') === 0,
    input: JSON.parse(row.payload_json),
  };
}
const SUMMARY_SQL = `SELECT b.*,
  COUNT(d.user_id) AS totalTargeted,
  SUM(CASE WHEN d.status='sent' THEN 1 ELSE 0 END) AS sentCount,
  SUM(CASE WHEN d.status='failed' THEN 1 ELSE 0 END) AS failedCount,
  SUM(CASE WHEN d.status='unknown' THEN 1 ELSE 0 END) AS unknownCount,
  SUM(CASE WHEN d.status='pending' THEN 1 ELSE 0 END) AS pendingCount,
  SUM(CASE WHEN d.status='sending' THEN 1 ELSE 0 END) AS sendingCount
  FROM admin_broadcasts b LEFT JOIN admin_deliveries d ON d.broadcast_id=b.id`;

async function expireInterrupted(db: Database, userId: string) {
  // Telegram has no idempotency key: an interrupted send must never be resent automatically.
  await db
    .prepare(
      `UPDATE admin_deliveries SET status='unknown', error=?
    WHERE status='sending' AND started_at < ? AND broadcast_id IN
    (SELECT id FROM admin_broadcasts WHERE admin_id=?)`
    )
    .bind(
      'Отправка прервалась. Доставка не подтверждена; автоматического повтора нет.',
      Date.now() - 120000,
      userId
    )
    .run();
}
export async function handleAdminHistory(
  _request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  if (!isUserAdmin(env, userId)) return forbidden();
  const db = createDb(env);
  await expireInterrupted(db, userId);
  const rows = await db
    .prepare(
      SUMMARY_SQL +
        ' WHERE b.admin_id=? GROUP BY b.id ORDER BY b.created_at DESC,b.id DESC LIMIT 20'
    )
    .bind(userId)
    .all<any>();
  return json({ broadcasts: rows.results.map(summary) });
}
async function result(db: Database, requestId: string, userId: string): Promise<BroadcastResult> {
  const row = await db
    .prepare(SUMMARY_SQL + ' WHERE b.id=? AND b.admin_id=? GROUP BY b.id')
    .bind(requestId, userId)
    .first<any>();
  const failures = await db
    .prepare(
      `SELECT user_id AS id,name,error,status FROM admin_deliveries
    WHERE broadcast_id=? AND status IN ('failed','unknown') ORDER BY user_id LIMIT 100`
    )
    .bind(requestId)
    .all<any>();
  return { ...summary(row), failed: failures.results };
}

export async function handleAdminBroadcast(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  if (!isUserAdmin(env, userId)) return forbidden();
  let input: BroadcastInput;
  try {
    input = parseInput(await request.json());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Некорректные данные.' }, 400);
  }
  const db = createDb(env);
  const serialized = JSON.stringify(input);
  const existing = await db
    .prepare('SELECT * FROM admin_broadcasts WHERE id=?')
    .bind(input.requestId)
    .first<any>();
  if (existing && (existing.admin_id !== userId || existing.payload_json !== serialized))
    return json({ error: 'Этот идентификатор уже используется другой отправкой.' }, 409);
  if (!existing) {
    const token = crypto.randomUUID();
    const filter =
      input.audience === 'self'
        ? 'WHERE id=?'
        : input.audience === 'selected'
          ? 'WHERE id IN (' + input.targetUserIds.map(() => '?').join(',') + ')'
          : '';
    const params =
      input.audience === 'self'
        ? [userId]
        : input.audience === 'selected'
          ? input.targetUserIds
          : [];
    const count = await db
      .prepare('SELECT COUNT(*) AS count FROM users ' + filter)
      .bind(...params)
      .first<{ count: number }>();
    if (!count?.count) return json({ error: 'Пользователи для отправки не найдены.' }, 404);
    if (input.audience === 'selected' && Number(count.count) !== input.targetUserIds.length)
      return json(
        { error: 'Один из выбранных пользователей больше недоступен. Обнови список.' },
        400
      );
    await db.batch([
      db
        .prepare(
          `INSERT INTO admin_broadcasts(id,admin_id,type,message,payload_json,create_token)
        VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`
        )
        .bind(input.requestId, userId, input.type, input.message, serialized, token),
      db
        .prepare(
          `INSERT INTO admin_deliveries(broadcast_id,user_id,name)
        SELECT ?,id,first_name FROM users ${filter}
        ${filter ? 'AND' : 'WHERE'} EXISTS (SELECT 1 FROM admin_broadcasts WHERE id=? AND create_token=?)
        ON CONFLICT(broadcast_id,user_id) DO NOTHING`
        )
        .bind(input.requestId, ...params, input.requestId, token),
    ]);
    const created = await db
      .prepare('SELECT * FROM admin_broadcasts WHERE id=?')
      .bind(input.requestId)
      .first<any>();
    if (created?.admin_id !== userId || created?.payload_json !== serialized)
      return json({ error: 'Этот идентификатор уже используется другой отправкой.' }, 409);
  }
  await expireInterrupted(db, userId);
  const pending = await db
    .prepare(
      `SELECT user_id,name FROM admin_deliveries
    WHERE broadcast_id=? AND status='pending' ORDER BY user_id LIMIT 5`
    )
    .bind(input.requestId)
    .all<any>();
  const today = toChisinauDate(new Date());
  for (const recipient of pending.results) {
    const claim = await db
      .prepare(
        `UPDATE admin_deliveries SET status='sending',started_at=?
      WHERE broadcast_id=? AND user_id=? AND status='pending'`
      )
      .bind(Date.now(), input.requestId, recipient.user_id)
      .run();
    if (!claim.meta.changes) continue;
    let attemptedSend = false;
    try {
      const text =
        input.type === 'weather'
          ? await buildMorningWeatherMessage(env, String(recipient.user_id), today, recipient.name)
          : input.type === 'evening'
            ? (await buildEveningDigest(env, String(recipient.user_id), dateShift(today, 1))) ||
              'Завтра занятий нет — свободный день!'
            : input.message;
      if (!text.trim() || text.length > ADMIN_MESSAGE_LIMIT)
        throw new Error('Сообщение пустое или слишком длинное.');
      attemptedSend = true;
      await telegram(env, 'sendMessage', { chat_id: recipient.user_id, text });
      await db
        .prepare(
          `UPDATE admin_deliveries SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE broadcast_id=? AND user_id=?`
        )
        .bind(input.requestId, recipient.user_id)
        .run();
    } catch (error) {
      const status = attemptedSend && !(error instanceof TelegramApiError) ? 'unknown' : 'failed';
      const detail =
        error instanceof TelegramApiError
          ? error.message
          : attemptedSend
            ? 'Доставка не подтверждена. Автоматического повтора нет.'
            : 'Не удалось подготовить сообщение.';
      await db
        .prepare('UPDATE admin_deliveries SET status=?,error=? WHERE broadcast_id=? AND user_id=?')
        .bind(status, detail, input.requestId, recipient.user_id)
        .run();
    }
    // Keep each short batch below Telegram's broadcast rate limits.
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return json(await result(db, input.requestId, userId));
}
