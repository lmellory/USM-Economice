import { afterEach, describe, expect, it, vi } from 'vitest';
import { telegram, TelegramApiError } from '../src/notifications.js';
afterEach(() => vi.restoreAllMocks());
describe('Telegram API acknowledgement', () => {
  it('rejects an API error even when HTTP status is 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error_code: 403 }), { status: 200 })
    );
    await expect(telegram({ BOT_TOKEN: 'test' } as any, 'sendMessage', {})).rejects.toBeInstanceOf(
      TelegramApiError
    );
  });
  it('returns a successful Telegram acknowledgement', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 12 } }))
    );
    expect(await telegram({ BOT_TOKEN: 'test' } as any, 'sendMessage', {})).toMatchObject({
      ok: true,
    });
  });
});
