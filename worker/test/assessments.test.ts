import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import {
  Assessment,
  assessmentInstant,
  assessmentReminderKey,
  validateAssessment,
  zonedIso,
} from '@usm/shared';
import {
  handleAssessments,
  queueAssessmentReminders,
  assessmentReminderMessage,
} from '../src/assessments.js';
import { createDb } from '../src/db.js';
import worker from '../src/index.js';
import { notificationTick } from '../src/notifications.js';
import { sqliteD1 } from './helpers/sqlite.js';
let sqlite: DatabaseSync;
let env: any;
const input = (extra: any = {}) => ({
  kind: 'exam',
  subject: 'Экономика',
  title: 'Спрос и предложение',
  date: '2026-11-10',
  time: '10:00',
  place: '145',
  topics: [{ id: 'topic-1', title: 'Эластичность', done: false }],
  completed: false,
  reminderMinutes: 1440,
  ...extra,
});
const req = (method: string, body?: any) =>
  new Request('https://test/api/assessments', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
const create = async (extra: any = {}) =>
  (await (await handleAssessments(req('POST', input(extra)), env, 'u1')).json()) as Assessment;
function auth(id: number) {
  const p = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id, first_name: 'Студент' }),
  });
  const data = [...p.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();
  p.set('hash', createHmac('sha256', secret).update(data).digest('hex'));
  return p.toString();
}
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(new URL(name, dir), 'utf8'));
  sqlite.exec(
    "INSERT INTO users(id,first_name) VALUES('u1','Саша'),('u2','Даша'); INSERT INTO settings(user_id) VALUES('u1'),('u2');"
  );
  env = { DB: sqliteD1(sqlite), BOT_TOKEN: 'local-test-token', ASSETS: { fetch: vi.fn() } };
});
afterEach(() => {
  sqlite.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('Assessments using real SQLite', () => {
  it('creates, edits topics, completes and deletes only owned records', async () => {
    const item = await create();
    expect(item).toMatchObject(input());
    expect(
      ((await (await handleAssessments(req('GET'), env, 'u1')).json()) as any).assessments
    ).toHaveLength(1);
    expect(
      ((await (await handleAssessments(req('GET'), env, 'u2')).json()) as any).assessments
    ).toHaveLength(0);
    expect(
      (await handleAssessments(req('PUT', input({ subject: 'Чужое' })), env, 'u2', item.id)).status
    ).toBe(404);
    expect((await handleAssessments(req('DELETE'), env, 'u2', item.id)).status).toBe(404);
    const updated = (await (
      await handleAssessments(
        req(
          'PUT',
          input({ topics: [{ id: 'topic-1', title: 'Эластичность', done: true }], completed: true })
        ),
        env,
        'u1',
        item.id
      )
    ).json()) as any;
    expect(updated.topics[0].done).toBe(true);
    expect(updated.completed).toBe(true);
    expect((await handleAssessments(req('DELETE'), env, 'u1', item.id)).status).toBe(200);
  });
  it.each([
    { date: '2026-02-30' },
    { date: '' },
    { time: '25:00' },
    { subject: '' },
    { kind: 'other' },
    { reminderMinutes: 30 },
    { topics: [{ id: 'a', title: '', done: false }] },
    {
      topics: [
        { id: 'a', title: 'x', done: false },
        { id: 'a', title: 'y', done: false },
      ],
    },
  ])('rejects invalid input %j', async (patch) => {
    expect((await handleAssessments(req('POST', input(patch)), env, 'u1')).status).toBe(400);
  });
  it('handles Chisinau DST and rejects non-existent local times', () => {
    expect(() => validateAssessment(input({ date: '2026-03-29', time: '03:30' }))).toThrow();
    expect(assessmentInstant(input())).toBe(Date.parse(zonedIso('2026-11-10', '10:00')));
  });
  it('deduplicates cron with homework reminders disabled and protects recipient', async () => {
    const item = await create();
    const db = createDb(env);
    const now = new Date(zonedIso('2026-11-09', '10:01'));
    await queueAssessmentReminders(db, now);
    await queueAssessmentReminders(db, now);
    const rows = sqlite.prepare('SELECT * FROM notification_log').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe('u1');
    const text = await assessmentReminderMessage(db, 'u1', rows[0].event_key, now);
    expect(text).toContain('Экзамен: Экономика');
    expect(text).toContain('Эластичность');
    expect(await assessmentReminderMessage(db, 'u2', rows[0].event_key, now)).toBeNull();
    expect(rows[0].event_key).toBe(assessmentReminderKey(item));
  });
  it.each([
    { date: '2026-11-15' },
    { completed: true },
    { reminderMinutes: null },
    { reminderMinutes: 4320 },
  ])('suppresses queued reminders after edit %j', async (patch) => {
    const item = await create();
    const db = createDb(env);
    const now = new Date(zonedIso('2026-11-09', '10:01'));
    await queueAssessmentReminders(db, now);
    await handleAssessments(req('PUT', input(patch)), env, 'u1', item.id);
    expect(await assessmentReminderMessage(db, 'u1', assessmentReminderKey(item), now)).toBeNull();
  });
  it('skips completed, disabled, past events and catches up before event starts', async () => {
    await create({ completed: true });
    await create({ reminderMinutes: null });
    await create({ date: '2026-10-01' });
    await queueAssessmentReminders(createDb(env), new Date(zonedIso('2026-11-09', '11:00')));
    expect(sqlite.prepare('SELECT * FROM notification_log').all()).toHaveLength(0);
    await create();
    await queueAssessmentReminders(createDb(env), new Date(zonedIso('2026-11-09', '11:00')));
    expect(sqlite.prepare('SELECT * FROM notification_log').all()).toHaveLength(1);
  });
  it('sends through actual notification tick without homework reminder preference', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(zonedIso('2026-11-09', '10:01')));
    await create();
    const send = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 })
      );
    vi.stubGlobal('fetch', send);
    await notificationTick(env);
    await notificationTick(env);
    expect(send).toHaveBeenCalledTimes(1);
    const body = JSON.parse(send.mock.calls[0][1].body);
    expect(body.chat_id).toBe('u1');
    expect(body.text).toContain('Экзамен: Экономика');
  });
  it('authenticates HTTP routes and includes assessments in bootstrap', async () => {
    expect((await worker.fetch(new Request('https://test/api/assessments'), env)).status).toBe(401);
    const headers = { 'x-telegram-init-data': auth(123), 'content-type': 'application/json' };
    const response = await worker.fetch(
      new Request('https://test/api/assessments', {
        method: 'POST',
        headers,
        body: JSON.stringify(input()),
      }),
      env
    );
    expect(response.status).toBe(201);
    const boot = await worker.fetch(new Request('https://test/api/bootstrap', { headers }), env);
    expect(boot.status).toBe(200);
    expect(((await boot.json()) as any).assessments).toHaveLength(1);
  });
});
