import { queueAssessmentReminders, assessmentReminderMessage } from './assessments.js';
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
import { Env } from './types.js';
import { createDb } from './db.js';

export class TelegramApiError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message);
    this.name = 'TelegramApiError';
  }
}
export async function telegram(env: Env, method: string, body: unknown): Promise<any> {
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
    throw new TelegramApiError(code, reason);
  }
  return payload;
}

export const DAILY_WISHES_31 = [
  'Пусть сегодня всё складывается легко, пары пролетят незаметно, а кофе будет идеальным! ☕✨',
  'Новый день — новые победы. Сохраняй бодрый настрой и верь в свои силы! 🌟',
  'Пусть мысли будут ясными, конспекты — понятными, а день принесёт приятные новости! 📚💪',
  'Отличного настроения! Даже самые сложные задачи сегодня решатся на одном дыхании. 🚀',
  'Пусть сегодня тебя окружают доброжелательные люди и вдохновляющие разговоры. Улыбнись! 😊☀️',
  'Продуктивного дня! Помни: каждый сделанный шаг приближает тебя к большим целям. 🎯',
  'Пусть сегодня найдётся время и для отличной учёбы, и для душевного отдыха! 🌿',
  'Вдохновения, уверенных ответов на парах и мощного заряда бодрости на весь день! ⚡📖',
  'Сегодня отличный день, чтобы узнать что-то новое и раскрыть свой потенциал. Вперёд! 💫',
  'Пусть этот день будет наполнен маленькими радостями, теплом и продуктивностью! ☕🥐',
  'Держи баланс между делами и отдыхом. Ты со всем справишься легко и уверенно! 🧘‍♂️✨',
  'Пусть преподаватели будут лояльными, одногруппники — на одной волне, а день — результативным! 🎓🤝',
  'Сегодня твой день! Пусть энергия бьёт ключом, а настроение держится на высоте. 🌈',
  'Успеха во всех делах! Двигайся уверенно в своём комфортном ритме к намеченным вершинам. 🎯💪',
  'Пусть этот день подарит полезные инсайты, новые знания и приятные совпадения! 💡',
  'Продуктивного и лёгкого дня! Пусть даже непростой материал усваивается с первого раза. 🧠✨',
  'Пусть утро начнётся бодро, дорога будет свободной, а день — насыщенным и интересным! 🚌☀️',
  'Помни, что ты делаешь большое дело для своего будущего. Гордись своими стараниями! 🏆',
  'Отличного учебного дня! Пусть всё задуманное на сегодня реализуется чётко и спокойно. 📝',
  'Пусть сегодня будет день маленьких побед, уютных пауз и отличного настроения! 🥨💛',
  'Держи фокус на главном и не переживай по пустякам — всё обязательно получится! 🎯✨',
  'Пусть лекции будут увлекательными, а практические задания даются легко и с интересом! 🔬📑',
  'Сил, бодрости и уверенности в каждом решении. Ты на правильном пути! 🚀',
  'Пусть этот день принесёт ощущение реального прогресса и радости от проделанной работы! 📈',
  'Хорошего дня! Пусть любимый горячий напиток согреет и зарядит бодростью на весь день. 🍵',
  'Откройся новому дню с уверенной улыбкой — и он обязательно порадует успехами! 😊🌟',
  'Пусть сегодня всё идёт по плану, а любые неожиданности оказываются приятными сюрпризами! 🍀',
  'Продуктивности и лёгкости! Твои знания и упорство сильнее любых дедлайнов. 🛡️🔥',
  'Пусть день будет полон интересных событий, полезных встреч и заслуженных успехов! 🌟',
  'Завершай дела с удовольствием и не забывай искренне хвалить себя за каждый результат! 👏🎉',
  'Пусть этот день станет одним из тех ярких дней, которые вспоминаются с гордостью и теплом! 🌅✨',
];

export function getWeatherConditionDesc(code: number): string {
  if (code === 0) return 'Ясно ☀️';
  if (code === 1) return 'В основном ясно 🌤️';
  if (code === 2) return 'Переменная облачность ⛅';
  if (code === 3) return 'Пасмурно ☁️';
  if (code >= 45 && code <= 48) return 'Туман 🌫️';
  if (code >= 51 && code <= 57) return 'Морось 🌧️';
  if (code >= 61 && code <= 67) return 'Дождь 🌧️';
  if (code >= 71 && code <= 77) return 'Снег ❄️';
  if (code >= 80 && code <= 82) return 'Ливень 🌧️';
  if (code >= 85 && code <= 86) return 'Снегопад 🌨️';
  if (code >= 95) return 'Гроза ⛈️';
  return 'Облачно 🌥️';
}

export function getClothingAdvice(temp: number, precipProb: number, code: number): string {
  const parts: string[] = [];
  if (temp < 0) {
    parts.push('Зимний пуховик или тёплая куртка, шапка, шарф и тёплая обувь ❄️');
  } else if (temp < 8) {
    parts.push('Тёплая куртка или пальто, плотный свитер 🧥');
  } else if (temp < 15) {
    parts.push('Куртка, ветровка или толстовка / худи 🧣');
  } else if (temp < 21) {
    parts.push('Джинсовка, лонгслив, рубашка или кардиган 👕');
  } else {
    parts.push('Лёгкая футболка и комфортные брюки или шорты ☀️');
  }

  const isRain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  if (isRain || precipProb >= 40) {
    parts.push('Обязательно захвати зонт ☂️ или дождевик!');
  } else if (precipProb >= 20) {
    parts.push('Возможен небольшой дождь, зонт лишним не будет 🌂');
  }

  return parts.join('. ');
}

export async function buildMorningWeatherMessage(
  env: Env,
  userId: string,
  todayDate: string,
  firstName?: string,
  requestedHour?: number
): Promise<string> {
  const db = createDb(env);
  const u = await db
    .prepare(
      'SELECT s.*,u.first_name,c.schedule FROM settings s JOIN users u ON u.id=s.user_id LEFT JOIN schedule_overrides c ON c.user_id=s.user_id WHERE u.id=?'
    )
    .bind(userId)
    .first<any>();

  const name = (firstName || u?.first_name || '').trim();
  const dayOfMonth = Number(todayDate.split('-')[2]) || new Date().getDate();
  const wish = DAILY_WISHES_31[(dayOfMonth - 1) % DAILY_WISHES_31.length];

  // Determine schedule and leave time for today
  const weekday = new Date(`${todayDate}T12:00:00Z`).getUTCDay() || 7;
  const parity = calculateWeekParity(todayDate, u?.semester_start, u?.first_week_parity);

  const [classRows, excRows] = await Promise.all([
    db
      .prepare('SELECT * FROM classes WHERE user_id=? ORDER BY day ASC, start ASC, position ASC')
      .bind(userId)
      .all(),
    db
      .prepare('SELECT * FROM schedule_exceptions WHERE user_id=? AND date=?')
      .bind(userId, todayDate)
      .all(),
  ]);

  let allClasses: ClassItem[];
  if (classRows.results && classRows.results.length > 0) {
    allClasses = classRows.results.map(mapClassRow);
  } else {
    allClasses = (u?.schedule ? JSON.parse(String(u.schedule)) : baseSchedule) as ClassItem[];
  }
  const exceptions = (excRows.results || []).map(mapExceptionRow);

  const rawDaily = allClasses.filter(
    (c) => c.day === weekday && (!c.parity || (parity && c.parity === parity))
  );
  const daily = applyScheduleExceptions(rawDaily, exceptions, todayDate).sort((a, b) =>
    a.start.localeCompare(b.start)
  );
  const activeDaily = daily.filter((c) => !c.isCancelled);

  let leaveTimeStr = '08:00';
  let leaveDetails = '';
  let leaveHour = 8;

  if (activeDaily.length > 0) {
    const first = activeDaily[0];
    const routine = calculateMorningRoutine(activeDaily, {
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

    if (routine?.leave) {
      leaveTimeStr = routine.leave;
      const [h, m] = routine.leave.split(':').map(Number);
      leaveHour = m >= 30 ? Math.min(23, h + 1) : h;
    }
    leaveDetails = ` · первая пара в ${first.start}`;
  } else {
    leaveTimeStr = '09:00';
    leaveHour = 9;
    leaveDetails = ' · сегодня пар нет';
  }

  if (requestedHour != null && requestedHour >= 12) {
    leaveHour = Math.min(23, requestedHour + 1);
    leaveTimeStr = `${String(leaveHour).padStart(2, '0')}:00`;
    leaveDetails = '';
  }

  const greetingLine = name ? `🌤 Доброе утро, ${name}.` : '🌤 Доброе утро.';

  // Fetch live weather from Open-Meteo for Chisinau
  try {
    const weatherResp = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=47.0186&longitude=28.8242&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code&timezone=Europe/Chisinau&forecast_days=1'
    );
    if (!weatherResp.ok) throw new Error(`Weather HTTP ${weatherResp.status}`);
    const weatherData: any = await weatherResp.json();

    const cur = weatherData.current;
    const curTemp = Math.round(cur.temperature_2m);
    const curApparent = Math.round(cur.apparent_temperature);
    const curDesc = getWeatherConditionDesc(cur.weather_code);
    const wind = Math.round(cur.wind_speed_10m);

    const safeLeaveHour = Math.max(0, Math.min(23, leaveHour));
    const hourly = weatherData.hourly;
    const leaveTemp = Math.round(hourly.temperature_2m[safeLeaveHour]);
    const leaveApparent = Math.round(hourly.apparent_temperature[safeLeaveHour]);
    const leavePrecip = hourly.precipitation_probability
      ? hourly.precipitation_probability[safeLeaveHour] || 0
      : 0;
    const leaveCode = hourly.weather_code[safeLeaveHour];
    const leaveDesc = getWeatherConditionDesc(leaveCode);

    const clothing = getClothingAdvice(leaveTemp, leavePrecip, leaveCode);

    const lines = [
      `${greetingLine} Погода в Кишинёве на сегодня:`,
      '',
      '🌡 Сейчас (07:00):',
      `• ${curDesc}`,
      `• Температура: ${curTemp > 0 ? `+${curTemp}` : curTemp}°C (ощущается как ${curApparent > 0 ? `+${curApparent}` : curApparent}°C)`,
      `• Ветер: ${wind} км/ч`,
      '',
      `🚶 На время выхода (~${leaveTimeStr}${leaveDetails}):`,
      `• ${leaveDesc}, ${leaveTemp > 0 ? `+${leaveTemp}` : leaveTemp}°C (ощущается как ${leaveApparent > 0 ? `+${leaveApparent}` : leaveApparent}°C)`,
      leavePrecip > 0 ? `• Вероятность осадков: ${leavePrecip}%` : null,
      '',
      '🧥 Что надеть:',
      `${clothing}`,
      '',
      '✨ Пожелание на день:',
      `${wish}`,
    ];

    return lines.filter((l) => l !== null).join('\n');
  } catch {
    return [
      `${greetingLine}`,
      '',
      'Не удалось загрузить детальный прогноз погоды, но в Кишинёве тебя ждёт отличный день!',
      '',
      '✨ Пожелание на день:',
      `${wish}`,
    ].join('\n');
  }
}

export async function buildEveningDigest(
  env: Env,
  userId: string,
  tomorrowDate: string
): Promise<string | null> {
  const db = createDb(env);
  const u = await db
    .prepare(
      'SELECT s.*,c.schedule FROM settings s LEFT JOIN schedule_overrides c ON c.user_id=s.user_id WHERE s.user_id=?'
    )
    .bind(userId)
    .first<any>();

  const tomorrowWeekday = new Date(`${tomorrowDate}T12:00:00Z`).getUTCDay() || 7;
  const parity = calculateWeekParity(tomorrowDate, u?.semester_start, u?.first_week_parity);

  const [classRows, excRows] = await Promise.all([
    db
      .prepare('SELECT * FROM classes WHERE user_id=? ORDER BY day ASC, start ASC, position ASC')
      .bind(userId)
      .all(),
    db
      .prepare('SELECT * FROM schedule_exceptions WHERE user_id=? AND date=?')
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

  const tomorrowHw = await db
    .prepare('SELECT title FROM homework WHERE user_id=? AND completed=0 AND due_date=?')
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

  const db = createDb(env);

  // Trigger 21:00 evening digest
  if (curHour === 21 && curMin <= 2) {
    const tomorrow = dateShift(today, 1);
    const notifyUsers = await db.prepare('SELECT id AS user_id FROM users').all<any>();
    if (notifyUsers.results && notifyUsers.results.length > 0) {
      const inserts = notifyUsers.results.map((u: any) =>
        db
          .prepare(
            'INSERT INTO notification_log(user_id,event_key,next_attempt) VALUES(?,?,?) ON CONFLICT(user_id,event_key) DO NOTHING'
          )
          .bind(u.user_id, `evening:${today}:${tomorrow}`, nowIso)
      );
      await db.batch(inserts);
    }
  }

  // Trigger 07:00 morning weather digest
  if (curHour === 7 && curMin <= 2) {
    const notifyUsers = await db.prepare('SELECT id AS user_id FROM users').all<any>();
    if (notifyUsers.results && notifyUsers.results.length > 0) {
      const inserts = notifyUsers.results.map((u: any) =>
        db
          .prepare(
            'INSERT INTO notification_log(user_id,event_key,next_attempt) VALUES(?,?,?) ON CONFLICT(user_id,event_key) DO NOTHING'
          )
          .bind(u.user_id, `morning_weather:${today}:07-00`, nowIso)
      );
      await db.batch(inserts);
    }
  }

  // Optimize cron: check if anyone has active notification preferences
  const activeCount = await db
    .prepare(
      'SELECT COUNT(*) as c FROM settings WHERE reminders_enabled=1 OR wake_reminder=1 OR sleep_reminder=1 OR leave_reminder=1'
    )
    .first<{ c: number }>();

  await queueAssessmentReminders(db, now);

  // Check pending notifications queue first
  const pending = await db
    .prepare(
      'SELECT * FROM notification_log WHERE sent_at IS NULL AND next_attempt<=? ORDER BY id LIMIT 20'
    )
    .bind(nowIso)
    .all<any>();

  // If no users have reminders enabled and no pending queue messages, early return
  if (!activeCount?.c && !pending.results?.length) {
    return;
  }

  // Process Homework reminders
  const due = await db
    .prepare(
      'SELECT h.id,h.user_id,h.title,h.due_at,h.due_date,s.reminder_minutes FROM homework h JOIN settings s ON s.user_id=h.user_id WHERE h.completed=0 AND h.telegram_reminder=1 AND s.reminders_enabled=1 AND h.due_date IS NOT NULL AND h.due_date>=?'
    )
    .bind(today)
    .all<any>();

  const hwInserts: any[] = [];
  for (const h of due.results) {
    const target = h.due_at
      ? Date.parse(h.due_at) - Number(h.reminder_minutes) * 60000
      : localInstant(h.due_date, 9 * 60);

    if (!Number.isFinite(target) || target > now.getTime() || target < now.getTime() - 120000) {
      continue;
    }
    const key = `homework:${h.id}:${h.due_at || h.due_date}`;
    hwInserts.push(
      db
        .prepare(
          'INSERT INTO notification_log(user_id,event_key,next_attempt) VALUES(?,?,?) ON CONFLICT(user_id,event_key) DO NOTHING'
        )
        .bind(h.user_id, key, nowIso)
    );
  }
  if (hwInserts.length > 0) {
    await db.batch(hwInserts);
  }

  // Process Morning / Sleep / Leave reminders
  const plans = await db
    .prepare(
      'SELECT s.*,u.id AS telegram_id,c.schedule FROM settings s JOIN users u ON u.id=s.user_id LEFT JOIN schedule_overrides c ON c.user_id=s.user_id WHERE s.wake_reminder=1 OR s.sleep_reminder=1 OR s.leave_reminder=1'
    )
    .all<any>();

  const planInserts: any[] = [];
  for (const u of plans.results) {
    const userClassesRows = await db
      .prepare('SELECT * FROM classes WHERE user_id=? ORDER BY day ASC, start ASC, position ASC')
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

      const excRows = await db
        .prepare('SELECT * FROM schedule_exceptions WHERE user_id=? AND date=?')
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

      const targetCampus = activeDaily[0].online
        ? activeDaily.find((c) => !c.online)
        : activeDaily[0];

      const actualCommuteMinutes = Number(u.travel_minutes ?? 35);
      const vehicleNote = '';

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

        planInserts.push(
          db
            .prepare(
              'INSERT INTO notification_log(user_id,event_key,next_attempt) VALUES(?,?,?) ON CONFLICT(user_id,event_key) DO NOTHING'
            )
            .bind(u.user_id, key, nowIso)
        );
      }
    }
  }

  if (planInserts.length > 0) {
    await db.batch(planInserts);
  }

  // Deliver queued notifications
  for (const n of pending.results) {
    const pieces = String(n.event_key).split(':');
    let message = '';

    if (pieces[0] === 'assessment') {
      message = (await assessmentReminderMessage(db, n.user_id, String(n.event_key), now)) || '';
      if (!message) {
        await db
          .prepare('UPDATE notification_log SET sent_at=?,next_attempt=NULL WHERE id=?')
          .bind(nowIso, n.id)
          .run();
        continue;
      }
    } else if (pieces[0] === 'homework') {
      const h = await db
        .prepare(
          'SELECT title,due_at,due_date FROM homework WHERE id=? AND user_id=? AND completed=0'
        )
        .bind(pieces[1], n.user_id)
        .first<any>();

      if (!h) {
        await db
          .prepare('UPDATE notification_log SET sent_at=? WHERE id=?')
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
        await db
          .prepare('UPDATE notification_log SET sent_at=? WHERE id=?')
          .bind(nowIso, n.id)
          .run();
        continue;
      }
    } else if (pieces[0] === 'morning_weather') {
      const u = await db
        .prepare('SELECT first_name FROM users WHERE id=?')
        .bind(n.user_id)
        .first<any>();
      message = (await buildMorningWeatherMessage(env, n.user_id, today, u?.first_name)) || '';
      if (!message) {
        await db
          .prepare('UPDATE notification_log SET sent_at=? WHERE id=?')
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
      await db
        .prepare(
          'UPDATE notification_log SET sent_at=?,attempts=attempts+1,next_attempt=NULL WHERE id=?'
        )
        .bind(nowIso, n.id)
        .run();
    } catch {
      const attempts = Number(n.attempts) + 1;
      const delay = Math.min(3600, 30 * 2 ** Math.min(Number(n.attempts), 7));
      await db
        .prepare('UPDATE notification_log SET attempts=?,next_attempt=? WHERE id=?')
        .bind(attempts, new Date(now.getTime() + delay * 1000).toISOString(), n.id)
        .run();
    }
  }
}
