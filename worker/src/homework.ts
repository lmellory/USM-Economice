import { Env } from './types.js';
import { createDb } from './db.js';

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

export async function handleHomework(
  request: Request,
  env: Env,
  userId: string,
  id?: string
): Promise<Response> {
  const db = createDb(env);
  if (request.method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Некорректные данные.' }, 400);
    }

    if (!body.title?.trim()) {
      return json({ error: 'Укажи название задания.' }, 400);
    }
    if (body.title.length > 200) {
      return json({ error: 'Название задания не может превышать 200 символов.' }, 400);
    }
    if (body.note && String(body.note).length > 4000) {
      return json({ error: 'Заметка слишком длинная.' }, 400);
    }

    const idNew = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO homework(id,user_id,title,subject,due_at,due_date,note,completed,telegram_reminder) VALUES(?,?,?,?,?,?,?,?,?)'
    )
      .bind(
        idNew,
        userId,
        body.title.trim(),
        body.subject ?? null,
        body.dueAt ?? null,
        body.dueDate ?? null,
        body.note ?? null,
        Number(Boolean(body.completed)),
        Number(Boolean(body.telegramReminder))
      )
      .run();

    const created = await db.prepare('SELECT * FROM homework WHERE id=? AND user_id=?')
      .bind(idNew, userId)
      .first();

    return json(created);
  }

  if (request.method === 'PUT') {
    if (!id) return json({ error: 'Задание не найдено.' }, 404);

    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Некорректные данные.' }, 400);
    }

    if (typeof body.title === 'string' && (!body.title.trim() || body.title.length > 200)) {
      return json({ error: 'Проверь название задания.' }, 400);
    }
    if (body.note && String(body.note).length > 4000) {
      return json({ error: 'Заметка слишком длинная.' }, 400);
    }

    const cols: Record<string, string> = {
      title: 'title',
      subject: 'subject',
      dueAt: 'due_at',
      dueDate: 'due_date',
      note: 'note',
      completed: 'completed',
      telegramReminder: 'telegram_reminder',
    };

    const entries = Object.entries(body).filter(([k]) => k in cols);
    if (!entries.length) return json({ error: 'Нет изменений.' }, 400);

    const sets = entries.map(([k]) => `${cols[k]}=?`).join(',');
    const values = entries.map(([k, v]) =>
      k === 'completed' || k === 'telegramReminder' ? Number(Boolean(v)) : v
    );

    const result = await db.prepare(
      `UPDATE homework SET ${sets},updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`
    )
      .bind(...values, id, userId)
      .run();

    if (!result.meta.changes) return json({ error: 'Задание не найдено.' }, 404);

    const updated = await db.prepare('SELECT * FROM homework WHERE id=? AND user_id=?')
      .bind(id, userId)
      .first();

    return json(updated);
  }

  if (request.method === 'DELETE' && id) {
    const result = await db.prepare('DELETE FROM homework WHERE id=? AND user_id=?')
      .bind(id, userId)
      .run();
    return json({ deleted: Boolean(result.meta.changes) });
  }

  return json({ error: 'Метод не поддерживается.' }, 405);
}
