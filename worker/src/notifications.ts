import {
  baseSchedule,
  calculateMorningRoutine,
  calculateWeekParity,
  ClassItem,
  dateShift,
  localInstant,
  toChisinauDate,
} from '@usm/shared';
import { Env } from './types.js';

export async function telegram(env: Env, method: string, body: unknown): Promise<any> {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Telegram HTTP ${r.status}`);
  return r.json();
}

export async function buildEveningDigest(
  env: Env,
  userId: string,
  tomorrowDate: string
): Promise<string | null> {
  const u = await env.DB.prepare(
    'SELECT s.*,c.schedule FROM settings s LEFT JOIN schedule_overrides c ON c.user_id=s.user_id WHERE s.user_id=?'
  )
    .bind(userId)
    .first<any>();

  const tomorrowWeekday = new Date(`${tomorrowDate}T12:00:00Z`).getUTCDay() || 7;
  const parity = calculateWeekParity(tomorrowDate, u?.semester_start, u?.first_week_parity);

  const allCl = (u?.schedule ? JSON.parse(String(u.schedule)) : baseSchedule) as ClassItem[];
  const tomorrowCl = allCl
    .filter((c) => c.day === tomorrowWeekday && (!c.parity || (parity && c.parity === parity)))
    .sort((a, b) => a.start.localeCompare(b.start));

  const dayFmt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Chisinau',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${tomorrowDate}T12:00:00Z`));
  const dayNameCap = dayFmt.charAt(0).toUpperCase() + dayFmt.slice(1);

  if (!tomorrowCl.length) {
    return `🌙 Вечерний план на завтра (${dayNameCap})\n\n✨ Занятий нет — свободный день! Можно спокойно отдохнуть и выспаться.`;
  }

  const routine = calculateMorningRoutine(tomorrowCl, {
    sleep_hours: u?.sleep_hours ?? 8,
    sleep_latency: u?.sleep_latency ?? 15,
    wash_minutes: u?.wash_minutes ?? 15,
    breakfast_minutes: u?.breakfast_minutes ?? 20,
    get_ready_minutes: u?.get_ready_minutes ?? 15,
    travel_buffer: u?.travel_buffer ?? 10,
    travel_minutes: u?.travel_minutes ?? 35,
    english_duration: u?.english_duration ?? 60,
  });

  const first = tomorrowCl[0];
  const targetCampus = first.online ? tomorrowCl.find((c) => !c.online) : first;

  const tomorrowHw = await env.DB.prepare(
    'SELECT title FROM homework WHERE user_id=? AND completed=0 AND due_date=?'
  )
    .bind(userId, tomorrowDate)
    .all<any>();

  const hwLines = tomorrowHw.results?.length
    ? `\n📝 Сдать завтра:\n${tomorrowHw.results.map((x: any) => `• ${x.title}`).join('\n')}\n`
    : '';

  const travelTime = Number(u?.travel_minutes || 35);
  const travelBuffer = Number(u?.travel_buffer || 10);

  return (
    `🌙 Вечерний план на завтра (${dayNameCap})\n\n` +
    `📚 Первая пара:\n• ${first.start} — ${first.title}${first.kind ? ` (${first.kind})` : ''}\n  📍 ${first.place}` +
    (targetCampus && targetCampus !== first
      ? `\n\n🏛 Первая очная пара:\n• ${targetCampus.start} — ${targetCampus.title}\n  📍 ${targetCampus.place}\n`
      : '\n') +
    `\n⏰ Тайминг:\n• 🛏 Отбой: около ${routine?.bed ?? '23:00'} (сон ${u?.sleep_hours || 8} ч)\n` +
    `• 🌅 Подъём: ${routine?.wake ?? '07:30'}\n` +
    (routine?.leave
      ? `• 🚶 Выход: ${routine.leave} (дорога ~${travelTime} мин, запас ${travelBuffer} мин)\n`
      : '') +
    `${hwLines}\nСпокойного вечера и хорошего сна! ✨`
  );
}

export async function notificationTick(env: Env): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const today = toChisinauDate(now);

  const chParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Chisinau',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const curHour = Number(chParts.find((p) => p.type === 'hour')?.value || 0);
  const curMin = Number(chParts.find((p) => p.type === 'minute')?.value || 0);

  // Trigger 21:00 evening digest
  if (curHour === 21 && curMin <= 2) {
    const tomorrow = dateShift(today, 1);
    const notifyUsers = await env.DB.prepare('SELECT id AS user_id FROM users').all<any>();
    for (const u of notifyUsers.results) {
      const key = `evening:${today}:${tomorrow}`;
      await env.DB.prepare(
        'INSERT INTO notification_log(user_id,event_key,next_attempt) VALUES(?,?,?) ON CONFLICT(user_id,event_key) DO NOTHING'
      )
        .bind(u.user_id, key, nowIso)
        .run();
    }
  }

  // Optimize cron: check if anyone has active notification preferences
  const activeCount = await env.DB.prepare(
    'SELECT COUNT(*) as c FROM settings WHERE reminders_enabled=1 OR wake_reminder=1 OR sleep_reminder=1 OR leave_reminder=1'
  ).first<{ c: number }>();

  // Check pending notifications queue first
  const pending = await env.DB.prepare(
    'SELECT * FROM notification_log WHERE sent_at IS NULL AND next_attempt<=? ORDER BY id LIMIT 20'
  )
    .bind(nowIso)
    .all<any>();

  // If no users have reminders enabled and no pending queue messages, early return
  if (!activeCount?.c && !pending.results?.length) {
    return;
  }

  // Process Homework reminders
  const due = await env.DB.prepare(
    'SELECT h.id,h.user_id,h.title,h.due_at,h.due_date,s.reminder_minutes FROM homework h JOIN settings s ON s.user_id=h.user_id WHERE h.completed=0 AND h.telegram_reminder=1 AND s.reminders_enabled=1 AND h.due_date IS NOT NULL AND h.due_date>=?'
  )
    .bind(today)
    .all<any>();

  for (const h of due.results) {
    const target = h.due_at
      ? Date.parse(h.due_at) - Number(h.reminder_minutes) * 60000
      : localInstant(h.due_date, 9 * 60);

    if (!Number.isFinite(target) || target > now.getTime() || target < now.getTime() - 120000) {
      continue;
    }
    const key = `homework:${h.id}:${h.due_at || h.due_date}`;
    await env.DB.prepare(
      'INSERT INTO notification_log(user_id,event_key,next_attempt) VALUES(?,?,?) ON CONFLICT(user_id,event_key) DO NOTHING'
    )
      .bind(h.user_id, key, nowIso)
      .run();
  }

  // Process Morning / Sleep / Leave reminders
  const plans = await env.DB.prepare(
    'SELECT s.*,u.id AS telegram_id,c.schedule FROM settings s JOIN users u ON u.id=s.user_id JOIN schedule_overrides c ON c.user_id=s.user_id WHERE s.wake_reminder=1 OR s.sleep_reminder=1 OR s.leave_reminder=1'
  ).all<any>();

  for (const u of plans.results) {
    const classes = JSON.parse(String(u.schedule)) as ClassItem[];
    for (const offset of [0, 1]) {
      const date = dateShift(today, offset);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
      const parity = calculateWeekParity(date, u.semester_start, u.first_week_parity);

      const daily = classes
        .filter((c) => c.day === weekday && (!c.parity || (parity && c.parity === parity)))
        .sort((a, b) => a.start.localeCompare(b.start));

      if (!daily.length) continue;

      const routine = calculateMorningRoutine(daily, {
        sleep_hours: u.sleep_hours,
        sleep_latency: u.sleep_latency,
        wash_minutes: u.wash_minutes,
        breakfast_minutes: u.breakfast_minutes,
        get_ready_minutes: u.get_ready_minutes,
        travel_buffer: u.travel_buffer,
        travel_minutes: u.travel_minutes,
        english_duration: u.english_duration,
      });

      if (!routine) continue;

      const targetCampus = daily[0].online ? daily.find((c) => !c.online) : daily[0];

      const triggers = [
        ['wake', Boolean(u.wake_reminder), routine.wakeMin],
        ['sleep', Boolean(u.sleep_reminder), routine.bedMin],
        ['leave', Boolean(u.leave_reminder && routine.leaveMin !== null), routine.leaveMin],
      ] as const;

      for (const [kind, on, minute] of triggers) {
        if (!on || minute === null) continue;
        const target = localInstant(date, minute);
        if (target > Date.now() || target < Date.now() - 120000) continue;

        const timeStr = `${String(Math.floor((((minute % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}-${String((((minute % 1440) + 1440) % 1440) % 60).padStart(2, '0')}`;
        const key =
          kind === 'leave' && targetCampus
            ? `leave:${date}:${timeStr}:${encodeURIComponent(targetCampus.title)}:${encodeURIComponent(targetCampus.place || '')}:${targetCampus.start}:${Number(u.travel_minutes || 35)}:${Number(u.travel_buffer || 10)}`
            : `${kind}:${date}:${timeStr}`;

        await env.DB.prepare(
          'INSERT INTO notification_log(user_id,event_key,next_attempt) VALUES(?,?,?) ON CONFLICT(user_id,event_key) DO NOTHING'
        )
          .bind(u.user_id, key, nowIso)
          .run();
      }
    }
  }

  // Deliver queued notifications
  for (const n of pending.results) {
    const pieces = String(n.event_key).split(':');
    let message = '';

    if (pieces[0] === 'homework') {
      const h = await env.DB.prepare(
        'SELECT title,due_at,due_date FROM homework WHERE id=? AND user_id=? AND completed=0'
      )
        .bind(pieces[1], n.user_id)
        .first<any>();

      if (!h) {
        await env.DB.prepare('UPDATE notification_log SET sent_at=? WHERE id=?')
          .bind(nowIso, n.id)
          .run();
        continue;
      }
      message = `Напоминание о задании: ${h.title}\nСрок: ${
        h.due_at
          ? new Intl.DateTimeFormat('ru-RU', {
              timeZone: 'Europe/Chisinau',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(h.due_at))
          : new Intl.DateTimeFormat('ru-RU', {
              timeZone: 'Europe/Chisinau',
              day: 'numeric',
              month: 'long',
            }).format(new Date(`${h.due_date}T12:00:00Z`))
      }.`;
    } else if (pieces[0] === 'wake') {
      message = `Расчётное время подъёма — ${pieces[2].replace('-', ':')}. Поставь будильник на телефоне: Telegram-напоминание его не заменяет.`;
    } else if (pieces[0] === 'sleep') {
      message = `По плану сна пора готовиться ко сну: лечь около ${pieces[2].replace('-', ':')}.`;
    } else if (pieces[0] === 'evening') {
      const tomorrowDate = pieces[2];
      message = (await buildEveningDigest(env, n.user_id, tomorrowDate)) || '';
      if (!message) {
        await env.DB.prepare('UPDATE notification_log SET sent_at=? WHERE id=?')
          .bind(nowIso, n.id)
          .run();
        continue;
      }
    } else if (pieces[0] === 'leave') {
      const title = decodeURIComponent(pieces[3] || 'Занятие');
      const place = decodeURIComponent(pieces[4] || '');
      const start = pieces[5] || '';
      message =
        `🚶 Пора собираться и выходить! В ${start} — ${title}${place ? ` (${place})` : ''}.\n` +
        `Расчётное время выхода: ${pieces[2].replace('-', ':')}. Дорога (~${pieces[6] || '35'} мин) и запас времени (${pieces[7] || '10'} мин) учтены.`;
    } else {
      continue;
    }

    try {
      await telegram(env, 'sendMessage', { chat_id: n.user_id, text: message });
      await env.DB.prepare(
        'UPDATE notification_log SET sent_at=?,attempts=attempts+1,next_attempt=NULL WHERE id=?'
      )
        .bind(nowIso, n.id)
        .run();
    } catch {
      const attempts = Number(n.attempts) + 1;
      const delay = Math.min(3600, 30 * 2 ** Math.min(Number(n.attempts), 7));
      await env.DB.prepare('UPDATE notification_log SET attempts=?,next_attempt=? WHERE id=?')
        .bind(attempts, new Date(now.getTime() + delay * 1000).toISOString(), n.id)
        .run();
    }
  }
}
