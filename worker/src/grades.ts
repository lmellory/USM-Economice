import { validateGrade } from '@usm/shared';
import { createDb } from './db.js';
import { json } from './homework.js';
import { Env } from './types.js';

const columns = 'id,subject,title,kind,score,weight,date,note';
export async function handleGrades(
  request: Request,
  env: Env,
  userId: string,
  id?: string
): Promise<Response> {
  const db = createDb(env);
  if (request.method === 'GET' && !id)
    return json(
      (
        await db
          .prepare(
            'SELECT ' +
              columns +
              ' FROM grades WHERE user_id=? ORDER BY date DESC,created_at DESC,id'
          )
          .bind(userId)
          .all()
      ).results
    );
  if (request.method === 'POST' || request.method === 'PUT') {
    let body: any, input;
    try {
      body = await request.json();
      input = validateGrade(body);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Проверь данные оценки.' }, 400);
    }
    const recordId = request.method === 'PUT' ? id : body.id || crypto.randomUUID();
    if (typeof recordId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(recordId))
      return json({ error: 'Некорректная запись.' }, 400);
    const args = [
      input.subject,
      input.title,
      input.kind,
      input.score,
      input.weight,
      input.date,
      input.note,
    ];
    if (request.method === 'POST') {
      await db
        .prepare(
          'INSERT INTO grades(subject,title,kind,score,weight,date,note,id,user_id) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET subject=excluded.subject,title=excluded.title,kind=excluded.kind,score=excluded.score,weight=excluded.weight,date=excluded.date,note=excluded.note,updated_at=CURRENT_TIMESTAMP WHERE grades.user_id=excluded.user_id'
        )
        .bind(...args, recordId, userId)
        .run();
    } else {
      const result = await db
        .prepare(
          'UPDATE grades SET subject=?,title=?,kind=?,score=?,weight=?,date=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?'
        )
        .bind(...args, recordId, userId)
        .run();
      if (!result.meta.changes) return json({ error: 'Оценка не найдена.' }, 404);
    }
    const result = await db
      .prepare('SELECT ' + columns + ' FROM grades WHERE id=? AND user_id=?')
      .bind(recordId, userId)
      .first();
    return result ? json(result) : json({ error: 'Оценка не найдена.' }, 404);
  }
  if (request.method === 'DELETE' && id) {
    const r = await db
      .prepare('DELETE FROM grades WHERE id=? AND user_id=?')
      .bind(id, userId)
      .run();
    return r.meta.changes ? json({ deleted: true }) : json({ error: 'Оценка не найдена.' }, 404);
  }
  return json({ error: 'Метод не поддерживается.' }, 405);
}
