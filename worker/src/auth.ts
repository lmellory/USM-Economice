import { TelegramUser } from './types.js';

async function hmac(key: Uint8Array | CryptoKey, data: string): Promise<Uint8Array> {
  const cryptoKey =
    key instanceof CryptoKey
      ? key
      : await crypto.subtle.importKey(
          'raw',
          new Uint8Array(key).buffer,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data).buffer)
  );
}

function hex(a: Uint8Array): string {
  return [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function verifyInitData(raw: string, token: string): Promise<TelegramUser | null> {
  try {
    const p = new URLSearchParams(raw);
    const hash = p.get('hash');
    const auth = Number(p.get('auth_date'));

    if (
      !hash ||
      !Number.isFinite(auth) ||
      auth > Date.now() / 1000 + 30 ||
      Date.now() / 1000 - auth > 86400
    ) {
      return null;
    }

    const user = JSON.parse(p.get('user') || 'null') as TelegramUser | null;
    if (!user?.id) return null;

    p.delete('hash');
    const entries: [string, string][] = [];
    p.forEach((v, k) => entries.push([k, v]));
    const data = entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secret = await hmac(new TextEncoder().encode('WebAppData'), token);
    const actual = hex(await hmac(secret, data));

    if (actual.length !== hash.length) return null;

    let mismatch = 0;
    for (let i = 0; i < actual.length; i++) {
      mismatch |= actual.charCodeAt(i) ^ hash.charCodeAt(i);
    }

    return mismatch === 0 ? user : null;
  } catch {
    return null;
  }
}
