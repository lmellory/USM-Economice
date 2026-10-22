import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { zonedIso, assessmentReminderKey } from '@usm/shared';
import { notificationTick, buildMorningWeatherMessage } from '../src/notifications.js';
import { quietUntil, dailyDue } from '../src/notification-preferences.js';
import { validatedSettings, dbSettings } from '../src/settings.js';
import { sqliteD1 } from './helpers/sqlite.js';
let sqlite: DatabaseSync, env: any, sent: any[];
const instant = (date: string, time: string) => new Date(zonedIso(date, time));
const setTime = (date: string, time: string) => vi.setSystemTime(instant(date, time));
const exam = (extra: any = {}) => {
  const item = {
    id: 'exam',
    kind: 'exam',
    subject: 'Экономика',
    title: 'Экзамен',
    date: '2026-10-23',
    time: '10:00',
    place: '145',
    topics: [],
    completed: false,
    reminderMinutes: 1440,
    ...extra,
  };
  sqlite
    .prepare(
      'INSERT INTO assessments(id,user_id,kind,subject,title,date,time,place,topics_json,completed,reminder_minutes) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
    )
    .run(
      item.id,
      '1',
      item.kind,
      item.subject,
      item.title,
      item.date,
      item.time,
      item.place,
      '[]',
      Number(item.completed),
      item.reminderMinutes
    );
  return item;
};
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir)
    .filter((x) => x.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(new URL(file, dir), 'utf8'));
  sqlite.exec(
    "INSERT INTO users(id,first_name) VALUES('1','Анна');INSERT INTO settings(user_id,schedule_initialized) VALUES('1',1);"
  );
  env = { DB: sqliteD1(sqlite), BOT_TOKEN: 'test' };
  sent = [];
  vi.useFakeTimers();
  setTime('2026-10-22', '07:00');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: any) => {
      if (url.includes('open-meteo'))
        return new Response(
          JSON.stringify({
            current: {
              temperature_2m: 14,
              apparent_temperature: 13,
              weather_code: 1,
              wind_speed_10m: 10,
            },
            hourly: {
              temperature_2m: Array(24).fill(14),
              apparent_temperature: Array(24).fill(13),
              weather_code: Array(24).fill(1),
              precipitation_probability: Array(24).fill(0),
            },
          })
        );
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
  sqlite.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('Personal notification consent and quiet hours', () => {
  it('supports a homework reminder at the deadline without losing a one-minute queue delay',async()=>{
    sqlite.exec("UPDATE settings SET reminders_enabled=1,reminder_minutes=0");
    sqlite.prepare('INSERT INTO homework(id,user_id,title,due_at,due_date,telegram_reminder) VALUES(?,?,?,?,?,1)').run('hw','1','Сдать задание',zonedIso('2026-10-22','08:00'),'2026-10-22');
    setTime('2026-10-22','08:00');await notificationTick(env);
    setTime('2026-10-22','08:01');await notificationTick(env);await notificationTick(env);
    expect(sent).toHaveLength(1);expect(sent[0].text).toContain('Сдать задание');
  });

  it('does not send default weather or daily summaries', async () => {
    await notificationTick(env);
    setTime('2026-10-22', '21:00');
    await notificationTick(env);
    expect(sent).toHaveLength(0);
  });
  it('sends weather only at the selected time, once per day and without forced wishes', async () => {
    sqlite.exec("UPDATE settings SET weather_enabled=1,weather_time='08:30'");
    await notificationTick(env);
    expect(sent).toHaveLength(0);
    setTime('2026-10-22', '08:30');
    await notificationTick(env);
    await notificationTick(env);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('Погода');
    expect(sent[0].text).not.toContain('Пожелание на день');
  });
  it('sends the daily plan at its chosen time and does not repeat it', async () => {
    sqlite.exec(
      "UPDATE settings SET daily_summary_enabled=1,daily_summary_time='19:15';INSERT INTO classes(id,user_id,day,start,end,title,place) VALUES('c','1',5,'12:00','13:30','Экономика','145');"
    );
    setTime('2026-10-22', '19:00');
    await notificationTick(env);
    expect(sent).toHaveLength(0);
    setTime('2026-10-22', '19:15');
    await notificationTick(env);
    await notificationTick(env);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('Экономика');
  });
  it('includes wishes only after opting in', async () => {
    const first = await buildMorningWeatherMessage(env, '1', '2026-10-22', 'Анна');
    expect(first).not.toContain('Пожелание на день');
    sqlite.exec('UPDATE settings SET daily_wishes=1');
    expect(await buildMorningWeatherMessage(env, '1', '2026-10-22', 'Анна')).toContain(
      'Пожелание на день'
    );
  });
  it('defers an event reminder until quiet hours end and sends it only once', async () => {
    const item = exam();
    sqlite.exec("UPDATE settings SET quiet_hours_enabled=1,quiet_start='09:00',quiet_end='12:00'");
    setTime('2026-10-22', '10:01');
    await notificationTick(env);
    expect(sent).toHaveLength(0);
    const row = sqlite.prepare('SELECT * FROM notification_log').get() as any;
    expect(row.event_key).toBe(assessmentReminderKey(item));
    expect(row.next_attempt).toBe(instant('2026-10-22', '12:00').toISOString());
    setTime('2026-10-22', '12:00');
    await notificationTick(env);
    await notificationTick(env);
    expect(sent).toHaveLength(1);
  });
  it('does not send an event that has already started by the end of quiet hours', async () => {
    exam({ date: '2026-10-22', time: '11:00', reminderMinutes: 60 });
    sqlite.exec("UPDATE settings SET quiet_hours_enabled=1,quiet_start='09:00',quiet_end='12:00'");
    setTime('2026-10-22', '10:01');
    await notificationTick(env);
    setTime('2026-10-22', '12:00');
    await notificationTick(env);
    expect(sent).toHaveLength(0);
  });
  it('cancels queued automatic weather if the setting is switched off', async () => {
    sqlite
      .prepare('INSERT INTO notification_log(user_id,event_key,next_attempt) VALUES(?,?,?)')
      .run('1', 'morning_weather:2026-10-22:07-00', new Date().toISOString());
    await notificationTick(env);
    expect(sent).toHaveLength(0);
    expect(
      (sqlite.prepare('SELECT sent_at FROM notification_log').get() as any).sent_at
    ).toBeTruthy();
  });
  it('skips wake messages that fall inside quiet hours', async () => {
    sqlite.exec(
      "UPDATE settings SET wake_reminder=1,quiet_hours_enabled=1,quiet_start='23:00',quiet_end='08:00'"
    );
    sqlite
      .prepare('INSERT INTO notification_log(user_id,event_key,next_attempt) VALUES(?,?,?)')
      .run('1', 'wake:2026-10-22:07-00', new Date().toISOString());
    await notificationTick(env);
    setTime('2026-10-22', '08:00');
    await notificationTick(env);
    expect(sent).toHaveLength(0);
  });
  it('calculates overnight quiet windows in Chisinau across the time change', () => {
    const prefs = { quiet_hours_enabled: true, quiet_start: '23:00', quiet_end: '08:00' };
    expect(quietUntil(prefs, instant('2026-10-24', '23:30'))?.toISOString()).toBe(
      instant('2026-10-25', '08:00').toISOString()
    );
    expect(quietUntil(prefs, instant('2026-10-25', '08:00'))).toBeNull();
    expect(
      quietUntil({ ...prefs, quiet_hours_enabled: false }, instant('2026-10-24', '23:30'))
    ).toBeNull();
  });
  it('validates preference times and returns booleans', () => {
    expect(() => validatedSettings({ weather_time: '25:00' })).toThrow();
    expect(() => validatedSettings({ quiet_end: '09:70' })).toThrow();
    expect(
      validatedSettings({
        weather_enabled: true,
        daily_summary_enabled: false,
        quiet_start: '22:30',
      })
    ).toMatchObject({ weather_enabled: 1, daily_summary_enabled: 0, quiet_start: '22:30' });
    expect(dbSettings({ weather_enabled: 1, quiet_hours_enabled: 0 })).toMatchObject({
      weather_enabled: true,
      quiet_hours_enabled: false,
    });
    expect(dailyDue('08:30', '07:00', instant('2026-10-22', '08:34'))).toBe(true);
  });
});
