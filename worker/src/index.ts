import { baseSchedule } from '@usm/shared';
import { verifyInitData } from './auth.js';
import {
  ensureClassesPopulated,
  handleClasses,
  handleScheduleExceptions,
  mapClassRow,
  mapExceptionRow,
} from './classes.js';
import { handleHomework, json } from './homework.js';
import { notificationTick } from './notifications.js';
import { dbSettings, validatedSettings } from './settings.js';
import { saveTransit, transit } from './transit.js';
import { getUserCommuteOptions, handleTransitRoutes } from './commute.js';
import { Env } from './types.js';
import { handleWebhook } from './webhook.js';

async function apiRequest(request: Request, env: Env, path: string): Promise<Response> {
  if (path === '/health') {
    return json({ ok: true, service: 'usm-life-worker' });
  }

  if (path === '/telegram/webhook' && request.method === 'POST') {
    return handleWebhook(request, env);
  }

  if (!path.startsWith('/api/')) {
    return env.ASSETS.fetch(request);
  }

  const user = await verifyInitData(
    request.headers.get('x-telegram-init-data') || '',
    env.BOT_TOKEN
  );
  if (!user) {
    return json(
      { error: 'Не удалось подтвердить Telegram-сессию. Открой приложение из бота.' },
      401
    );
  }

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO users(id,first_name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name'
    ).bind(String(user.id), user.first_name || ''),
    env.DB.prepare('INSERT INTO settings(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING').bind(
      String(user.id)
    ),
  ]);

  if (path === '/api/bootstrap' && request.method === 'GET') {
    await ensureClassesPopulated(env, String(user.id));

    const [settingsRow, homework, classRows, excRows, transitRow] = await Promise.all([
      env.DB.prepare('SELECT * FROM settings WHERE user_id=?').bind(String(user.id)).first(),
      env.DB.prepare(
        'SELECT * FROM homework WHERE user_id=? ORDER BY completed ASC, CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, created_at DESC'
      )
        .bind(String(user.id))
        .all(),
      env.DB.prepare('SELECT * FROM classes WHERE user_id=? ORDER BY day ASC, start ASC, position ASC')
        .bind(String(user.id))
        .all(),
      env.DB.prepare('SELECT * FROM schedule_exceptions WHERE user_id=? ORDER BY date ASC')
        .bind(String(user.id))
        .all(),
      env.DB.prepare('SELECT * FROM transit_state WHERE id=1').first<any>(),
    ]);

    const classesList = (classRows.results || []).map(mapClassRow);
    const exceptionsList = (excRows.results || []).map(mapExceptionRow);

    const t = transitRow
      ? {
          available: Boolean(transitRow.available),
          source: transitRow.source,
          checkedAt: transitRow.checked_at,
          note: transitRow.note,
          route: null,
          estimateMinutes: transitRow.estimate_minutes,
          liveVehicleCount: transitRow.vehicle_count ?? undefined,
          routesSummary: transitRow.routes_summary ?? undefined,
        }
      : {
          available: false,
          source: 'Tranzy OpenData',
          checkedAt: new Date().toISOString(),
          note: 'Проверка транспорта запускается на сервере.',
          route: null,
          estimateMinutes: 30,
        };

    return json({
      settings: dbSettings(settingsRow),
      homework: homework.results,
      schedule: classesList,
      classes: classesList,
      exceptions: exceptionsList,
      transit: t,
      commuteOptions: await getUserCommuteOptions(env, String(user.id)),
    });
  }

  if (path.startsWith('/api/transit/')) {
    const subpath = path.slice('/api/transit'.length);
    return handleTransitRoutes(request, env, String(user.id), subpath);
  }

  if (path === '/api/transit' && request.method === 'GET') {
    const t = await env.DB.prepare('SELECT * FROM transit_state WHERE id=1').first<any>();
    if (!t) return json(await transit(env));
    return json({
      available: Boolean(t.available),
      source: t.source,
      checkedAt: t.checked_at,
      note: t.note,
      route: null,
      estimateMinutes: t.estimate_minutes,
      liveVehicleCount: t.vehicle_count ?? undefined,
    });
  }

  if (path === '/api/settings' && request.method === 'PUT') {
    try {
      const patch = validatedSettings(await request.json());
      const entries = Object.entries(patch);
      if (!entries.length) {
        return json(
          dbSettings(
            await env.DB.prepare('SELECT * FROM settings WHERE user_id=?')
              .bind(String(user.id))
              .first()
          )
        );
      }
      const sets = entries.map(([col]) => `${col}=?`).join(',');
      await env.DB.prepare(
        `UPDATE settings SET ${sets},updated_at=CURRENT_TIMESTAMP WHERE user_id=?`
      )
        .bind(...entries.map(([, v]) => v), String(user.id))
        .run();
      return json(
        dbSettings(
          await env.DB.prepare('SELECT * FROM settings WHERE user_id=?')
            .bind(String(user.id))
            .first()
        )
      );
    } catch (err: any) {
      return json({ error: err instanceof Error ? err.message : 'Некорректные настройки.' }, 400);
    }
  }

  const homeworkPath = path.match(/^\/api\/homework(?:\/([^/]+))?$/);
  if (homeworkPath) {
    return handleHomework(request, env, String(user.id), homeworkPath[1]);
  }

  const classesPath = path.match(/^\/api\/classes(?:\/([^/]+))?$/);
  if (classesPath) {
    return handleClasses(request, env, String(user.id), classesPath[1]);
  }

  const exceptionsPath = path.match(/^\/api\/schedule-exceptions(?:\/([^/]+))?$/);
  if (exceptionsPath) {
    return handleScheduleExceptions(request, env, String(user.id), exceptionsPath[1]);
  }

  return json({ error: 'Не найдено.' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (
        url.pathname.startsWith('/api/') ||
        url.pathname === '/telegram/webhook' ||
        url.pathname === '/health'
      ) {
        return await apiRequest(request, env, url.pathname);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      const requestId = crypto.randomUUID();
      const detail = error instanceof Error ? error.message : 'unknown error';
      console.error(
        'worker_request_failed',
        JSON.stringify({
          requestId,
          method: request.method,
          path: url.pathname,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          detail: detail.slice(0, 240),
        })
      );
      return json({ error: 'Временная ошибка сервера. Попробуй ещё раз.', requestId }, 500);
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      Promise.allSettled([
        (async () => {
          const last = await env.DB.prepare(
            'SELECT checked_at FROM transit_state WHERE id=1'
          ).first<{
            checked_at: string;
          }>();
          const minutes = Math.max(1, Number(env.TRANZY_REFRESH_MINUTES) || 5);
          if (!last || Date.now() - Date.parse(last.checked_at) >= minutes * 60000) {
            await saveTransit(env);
          }
        })(),
        notificationTick(env),
      ])
    );
  },
};
