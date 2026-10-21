import {
  Assessment,
  assessmentInstant,
  assessmentLabel,
  assessmentReminderKey,
  validateAssessment,
} from '@usm/shared';
import { createDb, Database } from './db.js';
import { json } from './homework.js';
import { Env } from './types.js';

export function mapAssessment(row: any): Assessment {
  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    title: row.title,
    date: row.date,
    time: row.time,
    place: row.place,
    topics: JSON.parse(row.topics_json),
    completed: Boolean(row.completed),
    reminderMinutes: row.reminder_minutes == null ? null : Number(row.reminder_minutes),
  };
}
export async function handleAssessments(request: Request, env: Env, userId: string, id?: string) {
  const db = createDb(env);
  if (!id && request.method === 'GET') {
    const rows = await db
      .prepare('SELECT * FROM assessments WHERE user_id=? ORDER BY date,time,created_at')
      .bind(userId)
      .all();
    return json({ assessments: rows.results.map(mapAssessment) });
  }
  if ((id && request.method === 'PUT') || (!id && request.method === 'POST')) {
    let item;
    try {
      item = validateAssessment(await request.json());
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Проверь поля.' }, 400);
    }
    const values = [
      item.kind,
      item.subject,
      item.title,
      item.date,
      item.time,
      item.place,
      JSON.stringify(item.topics),
      Number(item.completed),
      item.reminderMinutes,
    ];
    const itemId = id || crypto.randomUUID();
    if (id) {
      const result = await db
        .prepare(
          'UPDATE assessments SET kind=?,subject=?,title=?,date=?,time=?,place=?,topics_json=?,completed=?,reminder_minutes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?'
        )
        .bind(...values, id, userId)
        .run();
      if (!result.meta.changes) return json({ error: 'Запись не найдена.' }, 404);
    } else {
      await db
        .prepare(
          'INSERT INTO assessments(kind,subject,title,date,time,place,topics_json,completed,reminder_minutes,id,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
        )
        .bind(...values, itemId, userId)
        .run();
    }
    const row = await db
      .prepare('SELECT * FROM assessments WHERE id=? AND user_id=?')
      .bind(itemId, userId)
      .first();
    return json(mapAssessment(row), id ? 200 : 201);
  }
  if (id && request.method === 'DELETE') {
    const result = await db
      .prepare('DELETE FROM assessments WHERE id=? AND user_id=?')
      .bind(id, userId)
      .run();
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Запись не найдена.' }, 404);
  }
  return json({ error: 'Метод не поддерживается.' }, 405);
}

export async function queueAssessmentReminders(db: Database, now: Date) {
  // Each event has its own explicit opt-in, independent of homework and morning reminders.
  const rows = await db
    .prepare(
      'SELECT * FROM assessments WHERE completed=0 AND reminder_minutes IS NOT NULL AND date>=?'
    )
    .bind(
      now.toLocaleDateString('en-CA', {
        timeZone: 'Europe/Chisinau',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    )
    .all();
  const inserts = [];
  for (const row of rows.results) {
    const item = mapAssessment(row);
    const start = assessmentInstant(item);
    const trigger = start - item.reminderMinutes! * 60000;
    // Catch up after a missed cron, but never send a reminder after the event starts.
    if (trigger > now.getTime() || start <= now.getTime()) continue;
    inserts.push(
      db
        .prepare(
          'INSERT INTO notification_log(user_id,event_key,next_attempt) VALUES(?,?,?) ON CONFLICT(user_id,event_key) DO NOTHING'
        )
        .bind(row.user_id, assessmentReminderKey(item), now.toISOString())
    );
  }
  if (inserts.length) await db.batch(inserts);
}
export async function assessmentReminderMessage(
  db: Database,
  userId: string,
  key: string,
  now: Date
): Promise<string | null> {
  const id = key.split(':')[1];
  const row = await db
    .prepare('SELECT * FROM assessments WHERE id=? AND user_id=?')
    .bind(id, userId)
    .first();
  if (!row) return null;
  const item = mapAssessment(row);
  if (
    item.completed ||
    item.reminderMinutes === null ||
    assessmentReminderKey(item) !== key ||
    assessmentInstant(item) <= now.getTime()
  )
    return null;
  const date = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Chisinau',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${item.date}T12:00:00Z`));
  const left = item.topics
    .filter((t) => !t.done)
    .map((t) => `• ${t.title}`)
    .join('\n');
  // Leave room below Telegram's 4096-character limit even for a long checklist.
  return `${assessmentLabel(item.kind)}: ${item.subject}\n${item.title}\n${date}${item.time ? ` в ${item.time}` : ' · время уточняется'}${item.place ? `\n${item.place}` : ''}${left ? `\n\nОсталось повторить:\n${left}` : ''}`.slice(
    0,
    3900
  );
}
