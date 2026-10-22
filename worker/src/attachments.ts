import { attachmentMime, MAX_HOMEWORK_ATTACHMENTS, MAX_USER_ATTACHMENT_BYTES } from '@usm/shared';
import { createDb } from './db.js';
import { Env } from './types.js';
import { json } from './homework.js';
import { readUpload, matchesFile, fileSignature, sameSignature } from './attachment-storage.js';

const fields = 'id,name,mime,size';
export async function handleHomeworkAttachments(
  request: Request,
  env: Env,
  userId: string,
  homeworkId: string
): Promise<Response> {
  const db = createDb(env);
  const owner = await db
    .prepare('SELECT id FROM homework WHERE id=? AND user_id=?')
    .bind(homeworkId, userId)
    .first();
  if (!owner) return json({ error: 'Задание не найдено.' }, 404);
  if (request.method === 'GET')
    return json(
      (
        await db
          .prepare(
            'SELECT ' +
              fields +
              ' FROM homework_attachments WHERE homework_id=? AND user_id=? AND ready=1 ORDER BY created_at,id'
          )
          .bind(homeworkId, userId)
          .all()
      ).results
    );
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается.' }, 405);
  if (!env.HOMEWORK_FILES) return json({ error: 'Хранилище файлов временно недоступно.' }, 503);
  const id = request.headers.get('x-upload-id') || '';
  if (!/^[a-f0-9-]{36}$/i.test(id))
    return json({ error: 'Не удалось подготовить загрузку. Выбери файл заново.' }, 400);
  const old = await db
    .prepare('SELECT ' + fields + ',user_id,homework_id,ready FROM homework_attachments WHERE id=?')
    .bind(id)
    .first<any>();
  if (old) {
    if (old.user_id !== userId || old.homework_id !== homeworkId)
      return json({ error: 'Вложение не найдено.' }, 404);
    return old.ready
      ? json({ id: old.id, name: old.name, mime: old.mime, size: old.size })
      : json({ error: 'Файл ещё загружается. Попробуй немного позже.' }, 409);
  }
  let name: string;
  try {
    name = decodeURIComponent(request.headers.get('x-file-name') || '')
      .replace(/[\x00-\x1f\x7f/\\]/g, '')
      .trim();
  } catch {
    return json({ error: 'Проверь имя файла.' }, 400);
  }
  if (!name || name.length > 180)
    return json({ error: 'Имя файла должно быть короче 180 символов.' }, 400);
  const mime = attachmentMime(name);
  if (!mime)
    return json(
      { error: 'Можно прикрепить JPG, PNG, WebP, PDF, Word, Excel, PowerPoint или TXT.' },
      400
    );
  let data: Uint8Array;
  try {
    data = await readUpload(request);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Не удалось прочитать файл.' }, 400);
  }
  if (!matchesFile(mime, data))
    return json({ error: 'Содержимое не соответствует расширению файла.' }, 400);
  const key = 'homework/' + userId + '/' + id;
  const inserted = await db
    .prepare(
      'INSERT INTO homework_attachments(id,user_id,homework_id,name,mime,size,storage_key) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM homework_attachments WHERE homework_id=? AND user_id=?)<? AND (SELECT COALESCE(SUM(size),0) FROM homework_attachments WHERE user_id=?)+?<=? ON CONFLICT(id) DO NOTHING'
    )
    .bind(
      id,
      userId,
      homeworkId,
      name,
      mime,
      data.byteLength,
      key,
      homeworkId,
      userId,
      MAX_HOMEWORK_ATTACHMENTS,
      userId,
      data.byteLength,
      MAX_USER_ATTACHMENT_BYTES
    )
    .run();
  if (!inserted.meta.changes)
    return json(
      {
        error:
          'До 5 файлов на задание и до 100 МБ на профиль. Удали ненужные вложения или дождись завершения текущей загрузки.',
      },
      409
    );
  try {
    await env.HOMEWORK_FILES.put(key, data.buffer as ArrayBuffer);
    const done = await db
      .prepare('UPDATE homework_attachments SET ready=1 WHERE id=? AND user_id=? AND homework_id=?')
      .bind(id, userId, homeworkId)
      .run();
    if (!done.meta.changes) throw new Error('homework_removed');
    return json({ id, name, mime, size: data.byteLength });
  } catch {
    // Keep a tombstone until cron confirms the object has been removed.
    await db
      .prepare('UPDATE homework_attachments SET homework_id=NULL WHERE id=? AND user_id=?')
      .bind(id, userId)
      .run();
    try {
      await env.HOMEWORK_FILES.delete(key);
      await db
        .prepare('DELETE FROM homework_attachments WHERE id=? AND user_id=?')
        .bind(id, userId)
        .run();
    } catch {
      console.warn('attachment_upload_cleanup_deferred');
    }
    return json(
      { error: 'Не удалось загрузить файл. Задание сохранено — попробуй загрузить ещё раз.' },
      503
    );
  }
}

export async function handleAttachment(
  request: Request,
  env: Env,
  userId: string,
  id: string,
  link = false
): Promise<Response> {
  const db = createDb(env);
  const row = await db
    .prepare(
      'SELECT * FROM homework_attachments WHERE id=? AND user_id=? AND homework_id IS NOT NULL AND ready=1'
    )
    .bind(id, userId)
    .first<any>();
  if (!row) return json({ error: 'Вложение не найдено.' }, 404);
  if (request.method === 'DELETE' && !link) {
    await db
      .prepare('UPDATE homework_attachments SET homework_id=NULL WHERE id=? AND user_id=?')
      .bind(id, userId)
      .run();
    try {
      if (env.HOMEWORK_FILES) {
        await env.HOMEWORK_FILES.delete(row.storage_key);
        await db
          .prepare(
            'DELETE FROM homework_attachments WHERE id=? AND user_id=? AND homework_id IS NULL'
          )
          .bind(id, userId)
          .run();
      }
    } catch {
      console.warn('attachment_delete_deferred');
    }
    return json({ deleted: true });
  }
  if (request.method !== 'GET') return json({ error: 'Метод не поддерживается.' }, 405);
  if (link) {
    const expires = Math.floor(Date.now() / 1000) + 300;
    const signature = await fileSignature(env, id, userId, expires);
    const url = new URL('/api/file-download/' + id, request.url);
    url.searchParams.set('expires', String(expires));
    url.searchParams.set('signature', signature);
    return json({ url: url.href, name: row.name });
  }
  return fileResponse(env, row);
}

async function fileResponse(env: Env, row: any, head = false): Promise<Response> {
  if (!env.HOMEWORK_FILES) return json({ error: 'Файл временно недоступен.' }, 503);
  const data = await env.HOMEWORK_FILES.get(row.storage_key, 'arrayBuffer');
  if (!data)
    return json({ error: 'Файл ещё сохраняется. Попробуй открыть его через минуту.' }, 503);
  return new Response(head ? null : data, {
    headers: {
      'content-type': row.mime,
      'content-length': String(data.byteLength),
      'content-disposition':
        'attachment; filename="file"; filename*=UTF-8\'\'' +
        encodeURIComponent(row.name).replace(/'/g, '%27'),
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'access-control-allow-origin': 'https://web.telegram.org',
    },
  });
}
export async function handleSignedDownload(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method))
    return json({ error: 'Метод не поддерживается.' }, 405);
  const url = new URL(request.url),
    expires = Number(url.searchParams.get('expires')),
    signature = url.searchParams.get('signature') || '';
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(expires) || expires <= now || expires > now + 300)
    return json({ error: 'Ссылка устарела. Открой файл из задания заново.' }, 403);
  const row = await createDb(env)
    .prepare(
      'SELECT * FROM homework_attachments WHERE id=? AND homework_id IS NOT NULL AND ready=1'
    )
    .bind(id)
    .first<any>();
  if (!row || !sameSignature(signature, await fileSignature(env, id, row.user_id, expires)))
    return json({ error: 'Файл недоступен.' }, 403);
  return fileResponse(env, row, request.method === 'HEAD');
}
