import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { sqliteD1 } from './helpers/sqlite.js';
import { telegram, TelegramApiError } from '../src/telegram.js';
import { handleWebhook, botKeyboard } from '../src/webhook.js';
import { handleBotCleanup } from '../src/bot-cleanup.js';
import worker from '../src/index.js';
import { miniAppBase } from '../src/bot-menu.js';
let sqlite: DatabaseSync, env: any, send: ReturnType<typeof vi.fn>;
const cleanup = (body: any = { confirm: true }) =>
  new Request('https://test/api/bot/cleanup', { method: 'POST', body: JSON.stringify(body) });
const record = (id: number, user = '123', keep = 0, age = 1000) =>
  sqlite
    .prepare('INSERT INTO bot_messages(user_id,message_id,sent_at,keep) VALUES(?,?,?,?)')
    .run(user, id, Date.now() - age, keep);
const hook = (text: string, secret = 'secret') =>
  new Request('https://app.test/telegram/webhook', {
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify({
      message: { text, from: { id: 123 }, chat: { id: 123, type: 'private' } },
    }),
  });
function auth() {
  const p = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 123, first_name: 'Студент' }),
  });
  const data = [...p.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  p.set(
    'hash',
    createHmac('sha256', createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest())
      .update(data)
      .digest('hex')
  );
  return p.toString();
}
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(new URL(name, dir), 'utf8'));
  env = {
    DB: sqliteD1(sqlite),
    BOT_TOKEN: 'test',
    TELEGRAM_WEBHOOK_SECRET: 'secret',
    MINI_APP_URL: 'https://app.test/?existing=1',
    ASSETS: { fetch: vi.fn() },
  };
  let id = 900;
  send = vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        ok: true,
        result: body.message_ids
          ? true
          : {
              message_id: ++id,
              date: Math.floor(Date.now() / 1000),
              chat: { id: Number(body.chat_id), type: 'private' },
            },
      })
    );
  });
  vi.stubGlobal('fetch', send);
});
afterEach(() => {
  sqlite.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('Telegram keyboard, protected greetings and safe cleanup', () => {
  it.each(['/start', '/start welcome', '/start@USM_bot payload'])(
    'keeps both /start replies and launches authenticated apps from inline buttons for %s',
    async (text) => {
      expect((await handleWebhook(hook(text), env)).status).toBe(200);
      const body = JSON.parse(send.mock.calls[0][1].body);
      expect(body.reply_markup.is_persistent).toBe(true);
      expect(body.reply_markup.resize_keyboard).toBe(true);
      expect(body.reply_markup.keyboard.flat().every((b: any) => typeof b === 'string')).toBe(true);
      const inline = JSON.parse(send.mock.calls[1][1].body);
      const buttons = inline.reply_markup.inline_keyboard.flat();
      expect(buttons.map((b: any) => new URL(b.web_app.url).searchParams.get('view'))).toEqual([
        'home',
        'schedule',
        'hw',
        'study',
        'settings',
      ]);
      expect(
        buttons.every((b: any) => new URL(b.web_app.url).searchParams.get('existing') === '1')
      ).toBe(true);
      expect(sqlite.prepare('SELECT keep FROM bot_messages').all()).toEqual([
        { keep: 1 },
        { keep: 1 },
      ]);
      await handleBotCleanup(cleanup(), env, '123');
      expect(send).toHaveBeenCalledTimes(2);
    }
  );
  it.each([
    ['📅 Сегодня', 'home'],
    ['🎓 Расписание', 'schedule'],
    ['📚 ДЗ', 'hw'],
    ['📝 Учёба', 'study'],
    ['⚙️ Настройки', 'settings'],
  ])('answers %s with an inline app launch for %s', async (label, view) => {
    await handleWebhook(hook(label), env);
    const body = JSON.parse(send.mock.calls[0][1].body);
    expect(body.chat_id).toBe(123);
    expect(
      new URL(body.reply_markup.inline_keyboard[0][0].web_app.url).searchParams.get('view')
    ).toBe(view);
    expect(body.reply_markup.keyboard).toBeUndefined();
    expect(sqlite.prepare('SELECT keep FROM bot_messages').get()).toMatchObject({ keep: 0 });
    const response = await worker.fetch(
      new Request('https://app.test/api/bootstrap', {
        headers: { 'x-telegram-init-data': auth() },
      }),
      env
    );
    expect(response.status).toBe(200);
  });
  it('rejects missing keyboard-launch identity instead of accepting an unsigned user ID', async () => {
    const response = await worker.fetch(
      new Request('https://app.test/api/bootstrap', {
        headers: { 'x-telegram-init-data': '', 'x-user-id': '123' },
      }),
      env
    );
    expect(response.status).toBe(401);
  });
  it('does not treat a link to the bot as the app URL', () => {
    expect(miniAppBase('https://t.me/examplebot', 'https://app.test')).toBe('https://app.test');
    expect(miniAppBase('invalid', 'https://app.test')).toBe('https://app.test');
  });
  it('rejects untrusted webhook updates and cleanup HTTP requests', async () => {
    expect((await handleWebhook(hook('/start', 'wrong'), env)).status).toBe(403);
    expect(send).not.toHaveBeenCalled();
    expect((await worker.fetch(cleanup(), env)).status).toBe(401);
  });
  it('records acknowledged ordinary sends without retaining message text', async () => {
    await telegram(env, 'sendMessage', { chat_id: '123', text: 'Личное напоминание' });
    const row = sqlite.prepare('SELECT * FROM bot_messages').get() as any;
    expect(row.keep).toBe(0);
    expect(row.message_id).toBe(901);
    expect(Object.values(row)).not.toContain('Личное напоминание');
  });
  it('does not record rejected sends and surfaces Telegram retry-after', async () => {
    send.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 30 } }))
    );
    await expect(telegram(env, 'sendMessage', { chat_id: '123', text: 'x' })).rejects.toMatchObject(
      { code: 429, retryAfter: 30 }
    );
    expect(sqlite.prepare('SELECT * FROM bot_messages').all()).toHaveLength(0);
  });
  it('deletes only recent outgoing messages belonging to the authenticated user', async () => {
    record(1);
    record(2, '123', 1);
    record(3, 'other');
    record(4, '123', 0, 49 * 3600000);
    const request = cleanup();
    request.headers.set('x-telegram-init-data', auth());
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ processed: 1, remaining: 0 });
    const body = JSON.parse(send.mock.calls[0][1].body);
    expect(body).toEqual({ chat_id: '123', message_ids: [1] });
    expect(
      sqlite.prepare('SELECT message_id FROM bot_messages WHERE cleared_at IS NOT NULL').all()
    ).toEqual([{ message_id: 1 }]);
    await handleBotCleanup(cleanup(), env, '123');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('paginates in batches of 100 and preserves newer messages during continuation', async () => {
    for (let i = 1; i <= 102; i++) record(i);
    const first: any = await (await handleBotCleanup(cleanup(), env, '123')).json();
    expect(first).toMatchObject({ processed: 100, remaining: 2 });
    sqlite
      .prepare('INSERT INTO bot_messages(user_id,message_id,sent_at) VALUES(?,?,?)')
      .run('123', 200, first.snapshotAt + 1);
    const second: any = await (
      await handleBotCleanup(cleanup({ confirm: true, snapshotAt: first.snapshotAt }), env, '123')
    ).json();
    expect(second).toMatchObject({ processed: 2, remaining: 0 });
    expect(
      (sqlite.prepare('SELECT cleared_at FROM bot_messages WHERE message_id=200').get() as any)
        .cleared_at
    ).toBeNull();
  });
  it('does not mark failed or ambiguous deletions as cleared', async () => {
    record(1);
    send.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 20 } }))
    );
    const response = await handleBotCleanup(cleanup(), env, '123');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ retryAfter: 20 });
    expect(
      (sqlite.prepare('SELECT cleared_at FROM bot_messages').get() as any).cleared_at
    ).toBeNull();
  });
  it('requires confirmation and returns only the current user message counts', async () => {
    record(1);
    record(2, '123', 1);
    record(3, 'other');
    record(4, '123', 0, 49 * 3600000);
    expect((await handleBotCleanup(cleanup({}), env, '123')).status).toBe(400);
    expect(await (await handleBotCleanup(new Request('https://test'), env, '123')).json()).toEqual({
      eligible: 1,
      expired: 1,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
