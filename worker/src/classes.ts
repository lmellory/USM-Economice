import { baseSchedule, ClassItem, min, ScheduleException } from '@usm/shared';
import { json } from './homework.js';
import { Env } from './types.js';
import { createDb } from './db.js';

export function mapClassRow(row: any): ClassItem {
  return {
    id: row.id,
    user_id: row.user_id,
    day: Number(row.day),
    start: row.start,
    end: row.end || undefined,
    title: row.title,
    kind: row.kind || undefined,
    place: row.place || '',
    parity: row.parity || undefined,
    online: Boolean(row.online),
    durationUnknown: Boolean(row.duration_unknown),
    duration_unknown: Boolean(row.duration_unknown),
    destination: row.destination === 'sports' ? 'sports' : 'university',
    position: row.position !== undefined ? Number(row.position) : undefined,
  };
}

export function mapExceptionRow(row: any): ScheduleException {
  return {
    id: row.id,
    user_id: row.user_id,
    date: row.date,
    class_id: row.class_id,
    type: row.type,
    new_start: row.new_start || null,
    new_end: row.new_end || null,
    new_place: row.new_place || null,
    note: row.note || null,
    created_at: row.created_at,
  };
}

export async function ensureClassesPopulated(env: Env, userId: string): Promise<void> {
  const db = createDb(env);
  const initialized = await db
    .prepare('SELECT schedule_initialized FROM settings WHERE user_id=?')
    .bind(userId)
    .first<{ schedule_initialized: number }>();
  if (initialized?.schedule_initialized) return;
  const countRow = await db
    .prepare('SELECT COUNT(*) as c FROM classes WHERE user_id=?')
    .bind(userId)
    .first<{ c: number }>();

  if (countRow && countRow.c > 0) {
    await db
      .prepare('UPDATE settings SET schedule_initialized=1 WHERE user_id=?')
      .bind(userId)
      .run();
    return;
  }

  // Check existing schedule_overrides
  const override = await db
    .prepare('SELECT schedule FROM schedule_overrides WHERE user_id=?')
    .bind(userId)
    .first<any>();

  let sourceSchedule = baseSchedule;
  if (override?.schedule) {
    try {
      const parsed = JSON.parse(String(override.schedule));
      if (Array.isArray(parsed) && parsed.length > 0) {
        sourceSchedule = parsed;
      }
    } catch {
      // fallback to baseSchedule
    }
  }

  const batch = sourceSchedule.map((c, index) => {
    const classId = c.id || crypto.randomUUID();
    const isSport =
      c.destination === 'sports' ||
      (c.place && c.place.includes('Ismail')) ||
      (c.title && (c.title.includes('физ') || c.title.includes('спорт')));
    const dest = isSport ? 'sports' : 'university';
    return db
      .prepare(
        'INSERT INTO classes(id,user_id,day,start,end,title,kind,place,parity,online,duration_unknown,destination,position) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM settings WHERE user_id=? AND schedule_initialized=0)'
      )
      .bind(
        classId,
        userId,
        c.day,
        c.start,
        c.end || null,
        c.title,
        c.kind || null,
        c.place || '',
        c.parity || null,
        c.online ? 1 : 0,
        c.durationUnknown || c.duration_unknown ? 1 : 0,
        dest,
        c.position !== undefined ? c.position : index,
        userId
      );
  });

  batch.push(db.prepare('UPDATE settings SET schedule_initialized=1 WHERE user_id=?').bind(userId));
  await db.batch(batch);
}

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateTime(t: string): boolean {
  if (!TIME_RE.test(t)) return false;
  const [h, m] = t.split(':').map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60;
}

export async function handleClasses(
  request: Request,
  env: Env,
  userId: string,
  id?: string
): Promise<Response> {
  const db = createDb(env);
  if (request.method === 'GET') {
    await ensureClassesPopulated(env, userId);
    const rows = await db
      .prepare('SELECT * FROM classes WHERE user_id=? ORDER BY day ASC, start ASC, position ASC')
      .bind(userId)
      .all();
    return json((rows.results || []).map(mapClassRow));
  }

  if (request.method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Некорректные данные JSON.' }, 400);
    }

    if (!body.title?.trim()) {
      return json({ error: 'Укажи название предмета.' }, 400);
    }
    if (body.title.trim().length > 100) {
      return json({ error: 'Название предмета слишком длинное (до 100 символов).' }, 400);
    }

    const day = Number(body.day);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      return json({ error: 'День недели должен быть от 1 (Пн) до 7 (Вс).' }, 400);
    }

    if (!body.start || !validateTime(body.start)) {
      return json({ error: 'Укажи корректное время начала в формате ЧЧ:ММ.' }, 400);
    }

    if (body.end && !validateTime(body.end)) {
      return json({ error: 'Время окончания должно быть в формате ЧЧ:ММ.' }, 400);
    }

    if (body.end && min(body.end) <= min(body.start)) {
      return json({ error: 'Время окончания должно быть позже времени начала.' }, 400);
    }

    const classId = crypto.randomUUID();
    const parity = body.parity === 'odd' || body.parity === 'even' ? body.parity : null;
    const online = body.online ? 1 : 0;
    const durationUnknown = body.durationUnknown || body.duration_unknown ? 1 : 0;
    const place = (body.place || '').trim().slice(0, 100);
    const kind = body.kind ? body.kind.trim().slice(0, 50) : null;
    const position = Number.isInteger(body.position) ? body.position : 0;
    const destination = body.destination === 'sports' ? 'sports' : 'university';

    await db
      .prepare(
        'INSERT INTO classes(id,user_id,day,start,end,title,kind,place,parity,online,duration_unknown,destination,position) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'
      )
      .bind(
        classId,
        userId,
        day,
        body.start,
        body.end || null,
        body.title.trim(),
        kind,
        place,
        parity,
        online,
        durationUnknown,
        destination,
        position
      )
      .run();

    const created = await db
      .prepare('SELECT * FROM classes WHERE id=? AND user_id=?')
      .bind(classId, userId)
      .first();

    return json(mapClassRow(created));
  }

  if (request.method === 'PUT' && id) {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Некорректные данные JSON.' }, 400);
    }

    const existing = await db
      .prepare('SELECT * FROM classes WHERE id=? AND user_id=?')
      .bind(id, userId)
      .first();

    if (!existing) {
      return json({ error: 'Пара не найдена.' }, 404);
    }

    if (!body.title?.trim()) {
      return json({ error: 'Укажи название предмета.' }, 400);
    }
    if (body.title.trim().length > 100) {
      return json({ error: 'Название предмета слишком длинное (до 100 символов).' }, 400);
    }

    const day = Number(body.day);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      return json({ error: 'День недели должен быть от 1 (Пн) до 7 (Вс).' }, 400);
    }

    if (!body.start || !validateTime(body.start)) {
      return json({ error: 'Укажи корректное время начала в формате ЧЧ:ММ.' }, 400);
    }

    if (body.end && !validateTime(body.end)) {
      return json({ error: 'Время окончания должно быть в формате ЧЧ:ММ.' }, 400);
    }

    if (body.end && min(body.end) <= min(body.start)) {
      return json({ error: 'Время окончания должно быть позже времени начала.' }, 400);
    }

    const parity = body.parity === 'odd' || body.parity === 'even' ? body.parity : null;
    const online = body.online ? 1 : 0;
    const durationUnknown = body.durationUnknown || body.duration_unknown ? 1 : 0;
    const place = (body.place || '').trim().slice(0, 100);
    const kind = body.kind ? body.kind.trim().slice(0, 50) : null;
    const position = Number.isInteger(body.position) ? body.position : 0;
    const destination = body.destination === 'sports' ? 'sports' : 'university';

    await db
      .prepare(
        'UPDATE classes SET day=?,start=?,end=?,title=?,kind=?,place=?,parity=?,online=?,duration_unknown=?,destination=?,position=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?'
      )
      .bind(
        day,
        body.start,
        body.end || null,
        body.title.trim(),
        kind,
        place,
        parity,
        online,
        durationUnknown,
        destination,
        position,
        id,
        userId
      )
      .run();

    const updated = await db
      .prepare('SELECT * FROM classes WHERE id=? AND user_id=?')
      .bind(id, userId)
      .first();

    return json(mapClassRow(updated));
  }

  if (request.method === 'DELETE' && id) {
    const res = await db
      .prepare('DELETE FROM classes WHERE id=? AND user_id=?')
      .bind(id, userId)
      .run();

    if (res.meta.changes === 0) {
      return json({ error: 'Пара не найдена.' }, 404);
    }

    return json({ ok: true });
  }

  return json({ error: 'Метод не поддерживается.' }, 405);
}

export async function handleScheduleExceptions(
  request: Request,
  env: Env,
  userId: string,
  id?: string
): Promise<Response> {
  const db = createDb(env);
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');

    let query = 'SELECT * FROM schedule_exceptions WHERE user_id=?';
    const params: any[] = [userId];

    if (dateParam) {
      if (!DATE_RE.test(dateParam)) {
        return json({ error: 'Некорректная дата (ожидается ГГГГ-ММ-ДД).' }, 400);
      }
      query += ' AND date=?';
      params.push(dateParam);
    } else {
      query += ' ORDER BY date ASC, created_at ASC';
    }

    const rows = await db
      .prepare(query)
      .bind(...params)
      .all();
    return json((rows.results || []).map(mapExceptionRow));
  }

  if (request.method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Некорректные данные JSON.' }, 400);
    }

    if (!body.date || !DATE_RE.test(body.date)) {
      return json({ error: 'Укажи дату в формате ГГГГ-ММ-ДД.' }, 400);
    }

    if (!body.class_id) {
      return json({ error: 'Укажи ID пары (class_id).' }, 400);
    }

    const classRow = await db
      .prepare('SELECT id FROM classes WHERE id=? AND user_id=?')
      .bind(body.class_id, userId)
      .first();

    if (!classRow) {
      return json({ error: 'Указанная пара не найдена.' }, 404);
    }

    if (body.type !== 'cancel' && body.type !== 'move') {
      return json({ error: 'Тип исключения должен быть cancel или move.' }, 400);
    }

    if (body.type === 'move') {
      if (body.new_start && !validateTime(body.new_start)) {
        return json({ error: 'Время переноса должно быть в формате ЧЧ:ММ.' }, 400);
      }
      if (body.new_end && !validateTime(body.new_end)) {
        return json({ error: 'Время окончания переноса должно быть в формате ЧЧ:ММ.' }, 400);
      }
    }

    const newStart = body.type === 'move' ? body.new_start || null : null;
    const newEnd = body.type === 'move' ? body.new_end || null : null;
    const newPlace = body.type === 'move' ? (body.new_place || null)?.slice(0, 100) : null;
    const note = body.note ? String(body.note).trim().slice(0, 200) : null;

    // Check if exception already exists for this (user_id, date, class_id)
    const existing = await db
      .prepare('SELECT id FROM schedule_exceptions WHERE user_id=? AND date=? AND class_id=?')
      .bind(userId, body.date, body.class_id)
      .first<{ id: string }>();

    let excId: string;
    if (existing) {
      excId = existing.id;
      await db
        .prepare(
          'UPDATE schedule_exceptions SET type=?,new_start=?,new_end=?,new_place=?,note=? WHERE id=? AND user_id=?'
        )
        .bind(body.type, newStart, newEnd, newPlace, note, excId, userId)
        .run();
    } else {
      excId = crypto.randomUUID();
      await db
        .prepare(
          'INSERT INTO schedule_exceptions(id,user_id,date,class_id,type,new_start,new_end,new_place,note) VALUES(?,?,?,?,?,?,?,?,?)'
        )
        .bind(excId, userId, body.date, body.class_id, body.type, newStart, newEnd, newPlace, note)
        .run();
    }

    const created = await db
      .prepare('SELECT * FROM schedule_exceptions WHERE id=? AND user_id=?')
      .bind(excId, userId)
      .first();

    return json(mapExceptionRow(created));
  }

  if (request.method === 'DELETE' && id) {
    const res = await db
      .prepare('DELETE FROM schedule_exceptions WHERE id=? AND user_id=?')
      .bind(id, userId)
      .run();

    if (res.meta.changes === 0) {
      return json({ error: 'Исключение не найдено.' }, 404);
    }

    return json({ ok: true });
  }

  return json({ error: 'Метод не поддерживается.' }, 405);
}
