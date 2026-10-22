import { MAX_ATTACHMENT_BYTES } from '@usm/shared';
import { createDb } from './db.js';
import { Env } from './types.js';

export async function readUpload(request: Request): Promise<Uint8Array> {
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_ATTACHMENT_BYTES) throw new Error('Файл больше 25 МБ.');
  if (!request.body) throw new Error('Выбери непустой файл.');
  const reader = request.body.getReader(),
    parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_ATTACHMENT_BYTES) {
        await reader.cancel();
        throw new Error('Файл больше 25 МБ.');
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error('Файл пустой.');
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
export function matchesFile(mime: string, bytes: Uint8Array): boolean {
  const starts = (...prefix: number[]) => prefix.every((v, i) => bytes[i] === v);
  if (mime === 'image/jpeg') return starts(255, 216, 255);
  if (mime === 'image/png') return starts(137, 80, 78, 71, 13, 10, 26, 10);
  if (mime === 'image/webp')
    return starts(82, 73, 70, 70) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (mime === 'application/pdf') return starts(37, 80, 68, 70, 45);
  if (mime.includes('openxmlformats')) return starts(80, 75, 3, 4);
  if (
    ['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'].includes(
      mime
    )
  )
    return starts(208, 207, 17, 224, 161, 177, 26, 225);
  if (mime === 'text/plain') return !bytes.includes(0);
  return false;
}
export async function fileSignature(
  env: Env,
  id: string,
  userId: string,
  expires: number
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.BOT_TOKEN),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const result = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode('usm-file-v1:' + id + ':' + userId + ':' + expires)
  );
  return Array.from(new Uint8Array(result), (b) => b.toString(16).padStart(2, '0')).join('');
}
export function sameSignature(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(a) || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export async function reclaimAttachments(env: Env): Promise<void> {
  if (!env.HOMEWORK_FILES) return;
  const db = createDb(env);
  const rows = await db
    .prepare(
      "SELECT id,storage_key FROM homework_attachments WHERE homework_id IS NULL OR (ready=0 AND created_at<datetime('now','-1 hour')) LIMIT 20"
    )
    .all<any>();
  for (const row of rows.results) {
    try {
      await env.HOMEWORK_FILES.delete(row.storage_key);
      await db
        .prepare(
          "DELETE FROM homework_attachments WHERE id=? AND (homework_id IS NULL OR (ready=0 AND created_at<datetime('now','-1 hour')))"
        )
        .bind(row.id)
        .run();
    } catch {
      console.warn('attachment_cleanup_deferred');
    }
  }
}
