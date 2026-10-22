import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { gradeAverage, validateGrade, MAX_ATTACHMENT_BYTES } from '@usm/shared';
import { sqliteD1 } from './helpers/sqlite.js';
import { handleGrades } from '../src/grades.js';
import {
  handleHomeworkAttachments,
  handleAttachment,
  handleSignedDownload,
} from '../src/attachments.js';
import { reclaimAttachments } from '../src/attachment-storage.js';
import { handleHomework } from '../src/homework.js';
import worker from '../src/index.js';
let sql: DatabaseSync, env: any, objects: Map<string, ArrayBuffer>;
const input = {
  subject: 'Экономика',
  title: 'Контрольная',
  kind: 'test',
  score: 8.5,
  weight: 1,
  date: '2026-10-22',
  note: '',
};
const jsonRequest = (method: string, body?: any) =>
  new Request('https://test/api/grades', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const upload = (
  name = 'Задание.pdf',
  body: BodyInit = new TextEncoder().encode('%PDF-1.7\nhello'),
  id = crypto.randomUUID(),
  extra: Record<string, string> = {}
) =>
  handleHomeworkAttachments(
    new Request('https://test/api/homework/hw/attachments', {
      method: 'POST',
      headers: { 'x-file-name': encodeURIComponent(name), 'x-upload-id': id, ...extra },
      body,
    }),
    env,
    '1',
    'hw'
  );
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sql.exec(readFileSync(new URL(file, dir), 'utf8'));
  sql.exec(
    "INSERT INTO users(id,first_name) VALUES('1','Анна'),('2','Другая');INSERT INTO settings(user_id) VALUES('1'),('2');INSERT INTO homework(id,user_id,title) VALUES('hw','1','Задача')"
  );
  objects = new Map();
  env = {
    DB: sqliteD1(sql),
    BOT_TOKEN: 'fake-bot-token',
    HOMEWORK_FILES: {
      put: vi.fn(async (key: string, value: ArrayBuffer) => {
        objects.set(key, value.slice(0));
      }),
      get: vi.fn(async (key: string) => objects.get(key) || null),
      delete: vi.fn(async (key: string) => {
        objects.delete(key);
      }),
    },
  };
});
afterEach(() => {
  sql.close();
  vi.useRealTimers();
});
it('saves fractional scores on a 10-point scale, updates and deletes only owned grades', async () => {
  let r = await handleGrades(jsonRequest('POST', { ...input, id: 'g1' }), env, '1');
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ id: 'g1', score: 8.5, weight: 1 });
  expect(
    (await handleGrades(jsonRequest('PUT', { ...input, score: 10 }), env, '2', 'g1')).status
  ).toBe(404);
  expect((await handleGrades(jsonRequest('DELETE'), env, '2', 'g1')).status).toBe(404);
  r = await handleGrades(jsonRequest('PUT', { ...input, score: 10, weight: 2 }), env, '1', 'g1');
  expect(await r.json()).toMatchObject({ score: 10, weight: 2 });
  expect(await (await handleGrades(jsonRequest('GET'), env, '2')).json()).toEqual([]);
  expect((await handleGrades(jsonRequest('DELETE'), env, '1', 'g1')).status).toBe(200);
  expect(await (await handleGrades(jsonRequest('GET'), env, '1')).json()).toEqual([]);
});
it('rejects scores outside 1–10, invalid dates, weights and nonnumeric input', async () => {
  for (const part of [
    { score: 0 },
    { score: 11 },
    { score: '8' },
    { score: 8.555 },
    { weight: 0 },
    { weight: 11 },
    { weight: 0.15 },
    { date: '2026-02-30' },
    { kind: 'admin' },
  ])
    expect((await handleGrades(jsonRequest('POST', { ...input, ...part }), env, '1')).status).toBe(
      400
    );
  expect(() => validateGrade(null)).toThrow();
  expect(validateGrade({ ...input, score: 1, weight: 0.1 }).score).toBe(1);
  expect(validateGrade({ ...input, score: 10 }).score).toBe(10);
});
it('does not duplicate a grade when a POST is retried, including across users', async () => {
  for (let i = 0; i < 2; i++)
    expect(
      (await handleGrades(jsonRequest('POST', { ...input, id: 'same' }), env, '1')).status
    ).toBe(200);
  expect((await handleGrades(jsonRequest('POST', { ...input, id: 'same' }), env, '2')).status).toBe(
    404
  );
  expect((sql.prepare('SELECT COUNT(*) AS c FROM grades').get() as any).c).toBe(1);
});
it('calculates a precise weighted average without rounding individual grades', () => {
  expect(gradeAverage([])).toBeNull();
  expect(
    gradeAverage([
      { score: 8, weight: 1 },
      { score: 10, weight: 1 },
    ])
  ).toBe(9);
  expect(
    gradeAverage([
      { score: 8, weight: 1 },
      { score: 10, weight: 2 },
    ])
  ).toBe(9.33);
  expect(
    gradeAverage([
      { score: 7.25, weight: 0.1 },
      { score: 9.75, weight: 0.3 },
    ])
  ).toBe(9.13);
});
it('uploads, lists and downloads only the owner’s private file', async () => {
  const r = await upload();
  expect(r.status).toBe(200);
  const file = (await r.json()) as any;
  expect(file).toMatchObject({ name: 'Задание.pdf', mime: 'application/pdf' });
  expect(file.storage_key).toBeUndefined();
  const list = await handleHomeworkAttachments(new Request('https://test'), env, '1', 'hw');
  expect(await list.json()).toEqual([file]);
  expect(
    (await handleHomeworkAttachments(new Request('https://test'), env, '2', 'hw')).status
  ).toBe(404);
  expect((await handleAttachment(new Request('https://test'), env, '2', file.id)).status).toBe(404);
  expect(
    (await handleAttachment(new Request('https://test', { method: 'DELETE' }), env, '2', file.id))
      .status
  ).toBe(404);
  const content = await handleAttachment(new Request('https://test'), env, '1', file.id);
  expect(content.status).toBe(200);
  expect(await content.text()).toContain('%PDF-1.7');
  expect(content.headers.get('cache-control')).toContain('no-store');
  expect(content.headers.get('content-disposition')).toContain('filename*=');
  expect(content.headers.get('x-content-type-options')).toBe('nosniff');
});
it('deduplicates a retried upload without rewriting immutable file bytes', async () => {
  const id = crypto.randomUUID();
  const first = await (await upload('task.pdf', '%PDF-1.7\nhello', id)).json();
  const second = await (await upload('task.pdf', '%PDF-1.7\nhello', id)).json();
  expect(second).toEqual(first);
  expect(env.HOMEWORK_FILES.put).toHaveBeenCalledTimes(1);
});
it('checks content signatures, empty files, extensions and size even without Content-Length', async () => {
  for (const [name, body] of [
    ['bad.svg', '<svg/>'],
    ['bad.pdf', 'not a PDF'],
    ['empty.txt', ''],
  ])
    expect((await upload(name, body)).status).toBe(400);
  expect(
    (
      await upload('huge.txt', 'small', crypto.randomUUID(), {
        'content-length': String(MAX_ATTACHMENT_BYTES + 1),
      })
    ).status
  ).toBe(400);
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(MAX_ATTACHMENT_BYTES));
      c.enqueue(new Uint8Array(1));
      c.close();
    },
  });
  const request = new Request('https://test', {
    method: 'POST',
    headers: { 'x-file-name': 'big.txt', 'x-upload-id': crypto.randomUUID() },
    body: stream,
    duplex: 'half',
  } as any);
  expect((await handleHomeworkAttachments(request, env, '1', 'hw')).status).toBe(400);
  expect(objects.size).toBe(0);
});
it('atomically enforces five attachments under simultaneous uploads', async () => {
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) => upload('task' + i + '.pdf'))
  );
  expect(results.filter((r) => r.status === 200)).toHaveLength(5);
  expect(results.filter((r) => r.status === 409)).toHaveLength(1);
  expect(objects.size).toBe(5);
});
it('enforces a per-profile quota and preserves the homework after storage failure', async () => {
  for (let i = 0; i < 20; i++)
    sql
      .prepare(
        "INSERT INTO homework_attachments(id,user_id,homework_id,name,mime,size,storage_key,ready) VALUES(?,'1',NULL,'old.pdf','application/pdf',5242880,?,1)"
      )
      .run('old' + i, 'key' + i);
  expect((await upload()).status).toBe(409);
  await reclaimAttachments(env);
  env.HOMEWORK_FILES.put.mockRejectedValueOnce(new Error('storage unavailable'));
  expect((await upload()).status).toBe(503);
  expect(sql.prepare("SELECT id FROM homework WHERE id='hw'").get()).toBeTruthy();
  expect((sql.prepare('SELECT COUNT(*) c FROM homework_attachments').get() as any).c).toBe(0);
});
it('revokes deleted files immediately and retries failed object cleanup later', async () => {
  const file = (await (await upload()).json()) as any;
  const link = (await (
    await handleAttachment(new Request('https://test'), env, '1', file.id, true)
  ).json()) as any;
  env.HOMEWORK_FILES.delete.mockRejectedValueOnce(new Error('temporary'));
  expect(
    (await handleAttachment(new Request('https://test', { method: 'DELETE' }), env, '1', file.id))
      .status
  ).toBe(200);
  expect((await handleSignedDownload(new Request(link.url), env, file.id)).status).toBe(403);
  expect(objects.size).toBe(1);
  await reclaimAttachments(env);
  expect(objects.size).toBe(0);
  expect((sql.prepare('SELECT COUNT(*) c FROM homework_attachments').get() as any).c).toBe(0);
});
it('cleans file objects after homework deletion and abandons crashed old uploads', async () => {
  await upload();
  await handleHomework(new Request('https://test', { method: 'DELETE' }), env, '1', 'hw');
  expect(
    (sql.prepare('SELECT homework_id FROM homework_attachments').get() as any).homework_id
  ).toBeNull();
  sql
    .prepare(
      "INSERT INTO homework_attachments(id,user_id,name,mime,size,storage_key,created_at) VALUES('stale','1','a.txt','text/plain',1,'stale','2000-01-01')"
    )
    .run();
  objects.set('stale', new ArrayBuffer(1));
  await reclaimAttachments(env);
  expect(objects.size).toBe(0);
});
it('accepts only short-lived signed downloads, supports HEAD, and rejects tampering', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-22T08:00:00Z'));
  const file = (await (await upload()).json()) as any;
  const link = (await (
    await handleAttachment(new Request('https://test'), env, '1', file.id, true)
  ).json()) as any;
  expect((await handleSignedDownload(new Request(link.url), env, file.id)).status).toBe(200);
  const head = await handleSignedDownload(new Request(link.url, { method: 'HEAD' }), env, file.id);
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
  const altered = new URL(link.url);
  altered.searchParams.set('signature', 'a'.repeat(64));
  expect((await handleSignedDownload(new Request(altered), env, file.id)).status).toBe(403);
  altered.searchParams.set('expires', String(Math.floor(Date.now() / 1000) + 100000));
  expect((await handleSignedDownload(new Request(altered), env, file.id)).status).toBe(403);
  vi.advanceTimersByTime(301000);
  expect((await handleSignedDownload(new Request(link.url), env, file.id)).status).toBe(403);
});
it('keeps all new private API routes behind Telegram authentication', async () => {
  for (const path of [
    '/api/grades',
    '/api/homework/hw/attachments',
    '/api/files/random',
    '/api/files/random/link',
  ])
    expect((await worker.fetch(new Request('https://test' + path), env)).status).toBe(401);
});

it('retries a homework save after a lost response without duplicating the task or changing another owner', async () => {
  const requestId = crypto.randomUUID();
  for (const title of ['Draft', 'Final']) {
    const r = await handleHomework(jsonRequest('POST', { title, requestId }), env, '1');
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).id).toBe(requestId);
  }
  expect((sql.prepare('SELECT COUNT(*) c FROM homework WHERE id=?').get(requestId) as any).c).toBe(
    1
  );
  expect((sql.prepare('SELECT title FROM homework WHERE id=?').get(requestId) as any).title).toBe(
    'Final'
  );
  expect(
    (await handleHomework(jsonRequest('POST', { title: 'Unauthorized', requestId }), env, '2'))
      .status
  ).toBe(404);
});
