import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleAdminBroadcast, handleAdminHistory } from '../src/admin.js';
import { telegram, TelegramApiError } from '../src/notifications.js';
import worker from '../src/index.js';
import { sqliteD1 } from './helpers/sqlite.js';

vi.mock('../src/notifications.js', async (original) => ({
  ...(await original<typeof import('../src/notifications.js')>()),
  telegram: vi.fn(),
}));
const OWNER = '5067848442';
const sendMock = vi.mocked(telegram);
let sqlite: DatabaseSync;
let env: any;
const request = (body: any) =>
  new Request('https://test/api/admin/broadcast', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const input = (extra: any = {}) => ({
  requestId: crypto.randomUUID(),
  type: 'custom',
  message: 'Новое объявление',
  audience: 'all',
  targetUserIds: [],
  ...extra,
});
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE users(id TEXT PRIMARY KEY,first_name TEXT,created_at TEXT); CREATE TABLE settings(user_id TEXT PRIMARY KEY);'
  );
  sqlite.exec(
    readFileSync(new URL('../migrations/0010_admin_broadcasts.sql', import.meta.url), 'utf8')
  );
  for (const id of [OWNER, '2', '3', '4', '5', '6', '7'])
    sqlite.prepare('INSERT INTO users VALUES(?,?,?)').run(id, 'Студент ' + id, '2026-10-01');
  env = { DB: sqliteD1(sqlite), BOT_TOKEN: 'test', ASSETS: { fetch: vi.fn() } };
  sendMock.mockReset().mockResolvedValue({ ok: true, result: { message_id: 1 } });
});
afterEach(() => {
  sqlite.close();
  vi.restoreAllMocks();
});
describe('Admin message delivery with a real local SQLite database', () => {
  it('rejects unauthorized sends and history reads before accessing a database', async () => {
    expect((await handleAdminBroadcast(request(input()), {} as any, '999')).status).toBe(403);
    expect((await handleAdminHistory(new Request('https://test'), {} as any, '999')).status).toBe(
      403
    );
    expect(sendMock).not.toHaveBeenCalled();
  });
  it('sends the current exact message only to the selected recipient', async () => {
    const body = input({
      audience: 'selected',
      targetUserIds: ['2'],
      message: 'Текст для второго пользователя',
    });
    const response = await handleAdminBroadcast(request(body), env, OWNER);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sentCount: 1, totalTargeted: 1, complete: true });
    expect(sendMock).toHaveBeenCalledWith(env, 'sendMessage', { chat_id: '2', text: body.message });
  });
  it('sends a self test only to the authenticated administrator', async () => {
    const body = input({ audience: 'self', targetUserIds: ['2'] });
    await handleAdminBroadcast(request(body), env, OWNER);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(env, 'sendMessage', {
      chat_id: OWNER,
      text: body.message,
    });
  });
  it('continues batches and never resends confirmed deliveries on retry', async () => {
    const body = input();
    const first: any = await (await handleAdminBroadcast(request(body), env, OWNER)).json();
    expect(first).toMatchObject({
      sentCount: 5,
      totalTargeted: 7,
      pendingCount: 2,
      complete: false,
    });
    const second: any = await (await handleAdminBroadcast(request(body), env, OWNER)).json();
    expect(second).toMatchObject({ sentCount: 7, pendingCount: 0, complete: true });
    await handleAdminBroadcast(request(body), env, OWNER);
    expect(sendMock).toHaveBeenCalledTimes(7);
    expect(new Set(sendMock.mock.calls.map((call) => (call[2] as any).chat_id)).size).toBe(7);
    const history: any = await (
      await handleAdminHistory(new Request('https://test'), env, OWNER)
    ).json();
    expect(history.broadcasts).toHaveLength(1);
    expect(history.broadcasts[0]).toMatchObject({
      id: body.requestId,
      sentCount: 7,
      complete: true,
    });
  });
  it('refuses changed text under the same request identifier', async () => {
    const body = input({ audience: 'self' });
    await handleAdminBroadcast(request(body), env, OWNER);
    expect(
      (await handleAdminBroadcast(request({ ...body, message: 'Другой текст' }), env, OWNER)).status
    ).toBe(409);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { message: '' },
    { message: 123 },
    { message: 'x'.repeat(4097) },
    { audience: undefined },
    { audience: 'selected', targetUserIds: [] },
    { audience: 'selected', targetUserIds: ['not-an-id'] },
    { requestId: 'bad' },
  ])('validates invalid input without sending: %j', async (extra) => {
    expect((await handleAdminBroadcast(request(input(extra)), env, OWNER)).status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });
  it('rejects nonexistent recipients and sends to nobody', async () => {
    expect(
      (
        await handleAdminBroadcast(
          request(input({ audience: 'selected', targetUserIds: ['2', '999'] })),
          env,
          OWNER
        )
      ).status
    ).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });
  it('records a Telegram rejection without calling it a delivery or retrying it', async () => {
    sendMock.mockRejectedValueOnce(new TelegramApiError(403, 'Пользователь заблокировал бота.'));
    const body = input({ audience: 'selected', targetUserIds: ['2'] });
    const data: any = await (await handleAdminBroadcast(request(body), env, OWNER)).json();
    expect(data).toMatchObject({ sentCount: 0, failedCount: 1, unknownCount: 0, complete: true });
    expect(data.failed[0].error).toContain('заблокировал');
    await handleAdminBroadcast(request(body), env, OWNER);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
  it('does not repeat a message when the Telegram response was lost', async () => {
    sendMock.mockRejectedValueOnce(new TypeError('Network error'));
    const body = input({ audience: 'self' });
    const data: any = await (await handleAdminBroadcast(request(body), env, OWNER)).json();
    expect(data).toMatchObject({ sentCount: 0, unknownCount: 1, complete: true });
    await handleAdminBroadcast(request(body), env, OWNER);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
  it('atomically claims deliveries for concurrent retry requests', async () => {
    const body = input({ audience: 'selected', targetUserIds: ['2', '3'] });
    await handleAdminBroadcast(request(body), env, OWNER);
    sqlite
      .prepare("UPDATE admin_deliveries SET status='pending' WHERE broadcast_id=?")
      .run(body.requestId);
    sendMock.mockClear();
    const responses = await Promise.all([
      handleAdminBroadcast(request(body), env, OWNER),
      handleAdminBroadcast(request(body), env, OWNER),
    ]);
    expect(responses.every((res) => res.ok)).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
  it('expires interrupted sends as unknown, without automatic resending', async () => {
    const body = input({ audience: 'self' });
    await handleAdminBroadcast(request(body), env, OWNER);
    sqlite
      .prepare("UPDATE admin_deliveries SET status='sending',started_at=? WHERE broadcast_id=?")
      .run(Date.now() - 121000, body.requestId);
    sendMock.mockClear();
    const data: any = await (await handleAdminBroadcast(request(body), env, OWNER)).json();
    expect(data).toMatchObject({ unknownCount: 1, sentCount: 0, complete: true });
    expect(sendMock).not.toHaveBeenCalled();
  });
  it('public health query parameters cannot trigger a broadcast or external requests', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No external requests allowed'));
    const res = await worker.fetch(
      new Request('https://test/health?broadcast_weather=1&refresh=1&refresh_stops=1'),
      env
    );
    expect(res.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
