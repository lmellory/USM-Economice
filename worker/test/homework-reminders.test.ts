import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { zonedIso, reminderLabel, validateAssessment } from '@usm/shared';
import { notificationTick } from '../src/notifications.js';
import { handleHomework } from '../src/homework.js';
import { validatedSettings } from '../src/settings.js';
import { sqliteD1 } from './helpers/sqlite.js';
let sql: DatabaseSync, env: any, sent: any[];
const time = (date: string, hour: string) => vi.setSystemTime(new Date(zonedIso(date, hour)));
const homework = (id: string, date: string, hour: string | null, offset: number | null) => {
  sql
    .prepare(
      'INSERT INTO homework(id,user_id,title,due_date,due_at,telegram_reminder,reminder_minutes) VALUES(?,?,?,?,?,1,?)'
    )
    .run(id, '1', id, date, hour ? zonedIso(date, hour) : null, offset);
};
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir)
    .filter((x) => x.endsWith('.sql'))
    .sort())
    sql.exec(readFileSync(new URL(file, dir), 'utf8'));
  sql.exec(
    "INSERT INTO users(id,first_name) VALUES('1','Анна'),('2','Другая');INSERT INTO settings(user_id,reminders_enabled,reminder_minutes) VALUES('1',1,60)"
  );
  env = { DB: sqliteD1(sql), BOT_TOKEN: 'test' };
  sent = [];
  vi.useFakeTimers();
  time('2026-11-01', '10:00');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options: any) => {
      sent.push(JSON.parse(options.body));
      return new Response(
        JSON.stringify({
          ok: true,
          result: { message_id: sent.length, date: Math.floor(Date.now() / 1000) },
        })
      );
    })
  );
});
afterEach(() => {
  sql.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('sends separate homework offsets one day and two hours before the deadline, once', async () => {
  homework('Day', '2026-11-02', '10:00', 1440);
  homework('Hours', '2026-11-01', '12:00', 120);
  await notificationTick(env);
  await notificationTick(env);
  await notificationTick(env);
  expect(sent).toHaveLength(2);
  expect(sent.map((x) => x.text).join(' ')).toContain('Day');
  expect(sent.map((x) => x.text).join(' ')).toContain('Hours');
});
it('uses 09:00 on the previous day when no deadline time is supplied', async () => {
  homework('No time', '2026-11-02', null, 1440);
  time('2026-11-01', '08:59');
  await notificationTick(env);
  await notificationTick(env);
  expect(sent).toHaveLength(0);
  time('2026-11-01', '09:00');
  await notificationTick(env);
  await notificationTick(env);
  expect(sent).toHaveLength(1);
});
it('inherits the global default for old tasks and keeps individual overrides', async () => {
  homework('Default', '2026-11-02', '10:00', null);
  homework('Override', '2026-11-02', '10:00', 1440);
  await notificationTick(env);
  await notificationTick(env);
  expect(sent).toHaveLength(1);
  expect(sent[0].text).toContain('Override');
  time('2026-11-02', '09:00');
  await notificationTick(env);
  await notificationTick(env);
  expect(sent).toHaveLength(2);
  expect(sent[1].text).toContain('Default');
});
it('replaces a pending interval instead of sending a stale queued reminder', async () => {
  homework('Changed', '2026-11-02', '10:00', 1440);
  await notificationTick(env);
  sql.exec("UPDATE homework SET reminder_minutes=120 WHERE id='Changed'");
  await notificationTick(env);
  expect(sent).toHaveLength(0);
  time('2026-11-02', '08:00');
  await notificationTick(env);
  await notificationTick(env);
  expect(sent).toHaveLength(1);
});
it('catches up a newly added task within the chosen interval, but never a completed or expired task', async () => {
  homework('Catch up', '2026-11-01', '12:00', 1440);
  homework('Expired', '2026-11-01', '09:00', 1440);
  homework('Completed', '2026-11-01', '12:00', 1440);
  sql.exec("UPDATE homework SET completed=1 WHERE id='Completed'");
  await notificationTick(env);
  await notificationTick(env);
  expect(sent).toHaveLength(1);
  expect(sent[0].text).toContain('Catch up');
});
it('saves an individual interval through the API and protects ownership on updates', async () => {
  const request = (method: string, body: any) =>
    new Request('https://test/api/homework', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const created = await handleHomework(
    request('POST', { title: 'Essay', telegramReminder: true, reminderMinutes: 2880 }),
    env,
    '1'
  );
  expect(created.status).toBe(200);
  const item = (await created.json()) as any;
  expect(item.reminder_minutes).toBe(2880);
  expect(
    (await handleHomework(request('PUT', { reminderMinutes: 720 }), env, '2', item.id)).status
  ).toBe(404);
  const updated = await handleHomework(request('PUT', { reminderMinutes: 720 }), env, '1', item.id);
  expect(((await updated.json()) as any).reminder_minutes).toBe(720);
  await handleHomework(request('PUT', { completed: true }), env, '1', item.id);
  expect(
    (sql.prepare('SELECT reminder_minutes FROM homework WHERE id=?').get(item.id) as any)
      .reminder_minutes
  ).toBe(720);
  for (const value of [-1, 10081, '1440', 1.5]) {
    expect(
      (
        await handleHomework(
          request('POST', { title: 'Invalid', reminderMinutes: value }),
          env,
          '1'
        )
      ).status
    ).toBe(400);
  }
});
it('preserves old API clients without an explicit homework interval', async () => {
  const r = await handleHomework(
    new Request('https://test', { method: 'POST', body: JSON.stringify({ title: 'Old client' }) }),
    env,
    '1'
  );
  expect(r.status).toBe(200);
  expect(((await r.json()) as any).reminder_minutes).toBeNull();
});
it('supports hours and days consistently without exposing minute labels', () => {
  expect(reminderLabel(1440)).toBe('За день');
  expect(reminderLabel(2880)).toBe('За 2 дня');
  expect(reminderLabel(240)).toBe('За 4 часа');
  expect(reminderLabel(30)).toBe('За 0,5 часа');
  expect(reminderLabel(0)).toBe('В момент срока');
  expect(validatedSettings({ reminder_minutes: 2880 })).toMatchObject({ reminder_minutes: 2880 });
  expect(() => validatedSettings({ reminder_minutes: 10081 })).toThrow();
  for (const reminderMinutes of [120, 360, 720, 2880])
    expect(
      validateAssessment({
        kind: 'test',
        title: 'Test',
        subject: 'Math',
        date: '2026-11-02',
        time: '12:00',
        place: '145',
        topics: [],
        completed: false,
        reminderMinutes,
      }).reminderMinutes
    ).toBe(reminderMinutes);
});
it('migrates delivered legacy queue keys without sending the same reminder again', async () => {
  const old = new DatabaseSync(':memory:');
  try {
    const dir = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(dir)
      .filter((x) => x.endsWith('.sql') && !x.startsWith('0014'))
      .sort())
      old.exec(readFileSync(new URL(file, dir), 'utf8'));
    old.exec(
      "INSERT INTO users(id,first_name) VALUES('1','Анна');INSERT INTO settings(user_id,reminders_enabled,reminder_minutes) VALUES('1',1,1440)"
    );
    const due = zonedIso('2026-11-02', '10:00');
    old
      .prepare(
        'INSERT INTO homework(id,user_id,title,due_at,due_date,telegram_reminder) VALUES(?,?,?,?,?,1)'
      )
      .run('old', '1', 'Already sent', due, '2026-11-02');
    old
      .prepare('INSERT INTO notification_log(user_id,event_key,sent_at) VALUES(?,?,?)')
      .run('1', 'homework:old:' + due, new Date().toISOString());
    old.exec(readFileSync(new URL('0014_homework_reminder_interval.sql', dir), 'utf8'));
    expect((old.prepare('SELECT event_key FROM notification_log').get() as any).event_key).toBe(
      'homework:old:' + due + ':1440'
    );
    await notificationTick({ DB: sqliteD1(old), BOT_TOKEN: 'test' } as any);
    await notificationTick({ DB: sqliteD1(old), BOT_TOKEN: 'test' } as any);
    expect(sent).toHaveLength(0);
  } finally {
    old.close();
  }
});
