import {
  applyScheduleExceptions,
  baseSchedule,
  calculateMorningRoutine,
  calculateWeekParity,
  ClassItem,
  dateShift,
  localInstant,
  toChisinauDate,
} from '@usm/shared';
import { mapClassRow, mapExceptionRow } from './classes.js';
import { evaluateUserCommute } from './commute.js';
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

  const [classRows, excRows] = await Promise.all([
    env.DB.prepare('SELECT * FROM classes WHERE user_id=? ORDER BY day ASC, start ASC, position ASC')
      .bind(userId)
      .all(),
    env.DB.prepare('SELECT * FROM schedule_exceptions WHERE user_id=? AND date=?')
      .bind(userId, tomorrowDate)
      .all(),
  ]);

  let allCl: ClassItem[];
  if (classRows.results && classRows.results.length > 0) {
    allCl = classRows.results.map(mapClassRow);
  } else {
    allCl = (u?.schedule ? JSON.parse(String(u.schedule)) : baseSchedule) as ClassItem[];
  }
  const exceptions = (excRows.results || []).map(mapExceptionRow);

  const rawTomorrow = allCl.filter(
    (c) => c.day === tomorrowWeekday && (!c.parity || (parity && c.parity === parity))
  );
  const tomorrowCl = applyScheduleExceptions(rawTomorrow, exceptions, tomorrowDate).sort((a, b) =>
    a.start.localeCompare(b.start)
  );

  const activeTomorrow = tomorrowCl.filter((c) => !c.isCancelled);

  const dayFmt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Chisinau',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${tomorrowDate}T12:00:00Z`));
  const dayNameCap = dayFmt.charAt(0).toUpperCase() + dayFmt.slice(1);

  if (!activeTomorrow.length) {
    return `🌙 Вечерний план на завтра (${dayNameCap})\n\n✨ Занятий нет — свободный день! Можно спокойно отдохнуть и выспаться.`;
  }

  const routine = calculateMorningRoutine(activeTomorrow, {
    sleep_hours: u?.sleep_hours ?? 8,
    sleep_latency: u?.sleep_latency ?? 15,
    wash_minutes: u?.wash_minutes ?? 20,
    hair_dry_minutes: u?.hair_dry_minutes ?? 5,
    breakfast_minutes: u?.breakfast_minutes ?? 30,
    get_ready_minutes: u?.get_ready_minutes ?? 10,
    travel_buffer: u?.travel_buffer ?? 10,
    travel_minutes: u?.travel_minutes ?? 35,
    english_duration: u?.english_duration ?? 60,
    target_bedtime: u?.target_bedtime ?? '00:15',
  });

  const first = activeTomorrow[0];
  const targetCampus = first.online ? activeTomorrow.find((c) => !c.online) : first;

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
    `\n⏰ Тайминг:\n• 🛏 Отбой: около ${routine?.bed ?? '00:00'} (сон ${u?.sleep_hours || 8} ч)\n` +
    `• 🌅 Подъём: ${routine?.wake ?? '08:15'}\n` +
    `• 🚿 Душ и сушка: ${Number(u?.wash_minutes ?? 20) + Number(u?.hair_dry_minutes ?? 5)} мин · 🍳 Завтрак: ${u?.breakfast_minutes ?? 30} мин\n` +
    (routine?.freeMinutes && routine.freeMinutes > 0
      ? `• ☕ Свободное время: ${routine.freeTimeFormatted} (можно спокойно отдохнуть)\n`
      : '') +
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
    'SELECT s.*,u.id AS telegram_id,c.schedule FROM settings s JOIN users u ON u.id=s.user_id LEFT JOIN schedule_overrides c ON c.user_id=s.user_id WHERE s.wake_reminder=1 OR s.sleep_reminder=1 OR s.leave_reminder=1'
  ).all<any>();

  for (const u of plans.results) {
    const userClassesRows = await env.DB.prepare(
      'SELECT * FROM classes WHERE user_id=? ORDER BY day ASC, start ASC, position ASC'
    )
      .bind(u.user_id)
      .all();

    let classes: ClassItem[];
    if (userClassesRows.results && userClassesRows.results.length > 0) {
      classes = userClassesRows.results.map(mapClassRow);
    } else {
      classes = (u.schedule ? JSON.parse(String(u.schedule)) : baseSchedule) as ClassItem[];
    }

    for (const offset of [0, 1]) {
      const date = dateShift(today, offset);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
      const parity = calculateWeekParity(date, u.semester_start, u.first_week_parity);

      const excRows = await env.DB.prepare(
        'SELECT * FROM schedule_exceptions WHERE user_id=? AND date=?'
      )
        .bind(u.user_id, date)
        .all();
      const exceptions = (excRows.results || []).map(mapExceptionRow);

      const rawDaily = classes.filter(
        (c) => c.day === weekday && (!c.parity || (parity && c.parity === parity))
      );
      const daily = applyScheduleExceptions(rawDaily, exceptions, date).sort((a, b) =>
        a.start.localeCompare(b.start)
      );

      const activeDaily = daily.filter((c) => !c.isCancelled);
      if (!activeDaily.length) continue;

      const targetCampus = activeDaily[0].online ? activeDaily.find((c) => !c.online) : activeDaily[0];

      let actualCommuteMinutes = Number(u.travel_minutes || 35);
      let vehicleNote = '';

      if (targetCampus) {
        const dest = (targetCampus.destination ||
          (targetCampus.place?.includes('Ismail') || targetCampus.title?.includes('физ')
            ? 'sports'
            : 'university')) as 'university' | 'sports';
        try {
          const evalRes = await evaluateUserCommute(env, u.user_id, dest, targetCampus.start);
          const best = evalRes.options.find((o) => o.isRecommended) || evalRes.options[0];
          if (best && best.isConfigured) {
            actualCommuteMinutes = best.totalDurationMinutes;
            const leg0 = best.legs[0];
            if (leg0?.firstVehicleEtaMinutes != null) {
              if (dest === 'sports') {
                vehicleNote = `17-й через ${leg0.firstVehicleEtaMinutes} мин`;
              } else {
                vehicleNote = `Ближайший: ${leg0.chosenRouteName} через ${leg0.firstVehicleEtaMinutes} мин`;
              }
            }
          }
        } catch {
          // fallback to user setting
        }
      }

      const routine = calculateMorningRoutine(
        activeDaily,
        {
          sleep_hours: u.sleep_hours,
          sleep_latency: u.sleep_latency,
          wash_minutes: u.wash_minutes ?? 20,
          hair_dry_minutes: u.hair_dry_minutes ?? 5,
          breakfast_minutes: u.breakfast_minutes ?? 30,
          get_ready_minutes: u.get_ready_minutes ?? 10,
          travel_buffer: u.travel_buffer,
          travel_minutes: actualCommuteMinutes,
          english_duration: u.english_duration,
          target_bedtime: u.target_bedtime ?? '00:15',
        },
        actualCommuteMinutes
      );

      if (!routine) continue;

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
            ? `leave:${date}:${timeStr}:${encodeURIComponent(targetCampus.title)}:${encodeURIComponent(targetCampus.place || '')}:${targetCampus.start}:${actualCommuteMinutes}:${Number(u.travel_buffer || 10)}:${encodeURIComponent(vehicleNote)}`
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
      const travelMins = pieces[6] || '35';
      const travelBuffer = pieces[7] || '10';
      const vehInfo = pieces[8] ? decodeURIComponent(pieces[8]) : '';
      message =
        `🚶 Пора собираться и выходить! В ${start} — ${title}${place ? ` (${place})` : ''}.\n` +
        `Расчётное время выхода: ${pieces[2].replace('-', ':')}. Дорога (~${travelMins} мин) и запас времени (${travelBuffer} мин) учтены.` +
        (vehInfo ? `\n🚌 ${vehInfo}` : '');
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
