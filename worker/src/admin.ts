import { dateShift, toChisinauDate } from '@usm/shared';
import { createDb } from './db.js';
import { json } from './homework.js';
import { buildEveningDigest, buildMorningWeatherMessage, telegram } from './notifications.js';
import { Env } from './types.js';

export function isUserAdmin(env: Env, userId: string): boolean {
  if (String(userId) === '5067848442') return true;
  if (env.ADMIN_USER_ID && String(env.ADMIN_USER_ID) === String(userId)) return true;
  return false;
}

export async function handleAdminStats(
  _request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  if (!isUserAdmin(env, userId)) {
    return json({ error: 'Доступ запрещён. Вы не являетесь администратором.' }, 403);
  }

  const db = createDb(env);

  try {
    const [usersRes, transitRes] = await Promise.all([
      db.prepare('SELECT id, first_name, created_at FROM users ORDER BY created_at DESC').all<any>(),
      db.prepare('SELECT * FROM transit_state WHERE id=1').first<any>(),
    ]);

    const users = usersRes.results || [];

    return json({
      ok: true,
      totalUsers: users.length,
      users,
      transit: transitRes
        ? {
            available: Boolean(transitRes.available),
            source: transitRes.source,
            checkedAt: transitRes.checked_at,
            vehicleCount: transitRes.vehicle_count,
            note: transitRes.note,
          }
        : null,
      serverTime: new Date().toISOString(),
    });
  } catch (err: any) {
    return json({ error: err?.message || 'Database error' }, 500);
  }
}

export async function handleAdminBroadcast(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  if (!isUserAdmin(env, userId)) {
    return json({ error: 'Доступ запрещён. Вы не являетесь администратором.' }, 403);
  }

  const body: any = await request.json().catch(() => ({}));
  const { type, message, targetUserId } = body;

  if (!type || !['custom', 'weather', 'evening'].includes(type)) {
    return json({ error: 'Неверный тип рассылки (custom, weather, evening)' }, 400);
  }

  if (type === 'custom' && (!message || !message.trim())) {
    return json({ error: 'Текст сообщения не может быть пустым' }, 400);
  }

  const db = createDb(env);
  let usersToNotify: any[] = [];

  if (targetUserId) {
    const singleUser = await db
      .prepare('SELECT id, first_name FROM users WHERE id=?')
      .bind(String(targetUserId))
      .first<any>();
    if (singleUser) usersToNotify = [singleUser];
  } else {
    const allUsers = await db.prepare('SELECT id, first_name FROM users').all<any>();
    usersToNotify = allUsers.results || [];
  }

  if (!usersToNotify.length) {
    return json({ error: 'Пользователи для отправки не найдены' }, 404);
  }

  const today = toChisinauDate(new Date());
  const tomorrow = dateShift(today, 1);
  const sent: any[] = [];
  const failed: any[] = [];

  for (const u of usersToNotify) {
    let textToSend = '';
    try {
      if (type === 'weather') {
        textToSend = await buildMorningWeatherMessage(env, String(u.id), today, u.first_name);
      } else if (type === 'evening') {
        textToSend =
          (await buildEveningDigest(env, String(u.id), tomorrow)) ||
          '🌙 Завтра занятий нет — свободный день!';
      } else if (type === 'custom') {
        textToSend = message.trim();
      }

      if (!textToSend) {
        failed.push({ id: u.id, name: u.first_name, error: 'Пустое сообщение' });
        continue;
      }

      await telegram(env, 'sendMessage', { chat_id: u.id, text: textToSend });
      sent.push({ id: u.id, name: u.first_name });
    } catch (err: any) {
      failed.push({ id: u.id, name: u.first_name, error: err?.message || 'Telegram error' });
    }
  }

  return json({
    ok: true,
    type,
    totalTargeted: usersToNotify.length,
    sentCount: sent.length,
    failedCount: failed.length,
    sent,
    failed,
  });
}
