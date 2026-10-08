import { baseSchedule, toChisinauDate } from '@usm/shared';
import { verifyInitData } from './auth.js';
import {
  ensureClassesPopulated,
  handleClasses,
  handleScheduleExceptions,
  mapClassRow,
  mapExceptionRow,
} from './classes.js';
import { createDb } from './db.js';
import { handleHomework, json } from './homework.js';
import { buildMorningWeatherMessage, notificationTick, telegram } from './notifications.js';
import { dbSettings, validatedSettings } from './settings.js';
import { saveTransit, syncTranzyStops, transit } from './transit.js';
import { getUserCommuteOptions, handleTransitRoutes } from './commute.js';
import { handleTripPlan } from './trip-plan.js';
import { Env } from './types.js';
import { handleWebhook } from './webhook.js';

async function apiRequest(request: Request, env: Env, path: string): Promise<Response> {
  const db = createDb(env);

  if (path === '/health') {
    const url = new URL(request.url);
    if (url.searchParams.has('refresh')) {
      try { await saveTransit(env); } catch {}
    }
    if (url.searchParams.has('refresh_stops')) {
      try { await syncTranzyStops(env); } catch {}
    }
    if (url.searchParams.has('broadcast_weather')) {
      const today = toChisinauDate(new Date());
      const usersRes = await db.prepare('SELECT id, first_name FROM users').all<any>();
      const sent: any[] = [];
      const errors: any[] = [];
      for (const u of usersRes.results || []) {
        try {
          const msg = await buildMorningWeatherMessage(env, String(u.id), today, u.first_name);
          await telegram(env, 'sendMessage', { chat_id: u.id, text: msg });
          sent.push({ id: u.id, name: u.first_name });
        } catch (err: any) {
          errors.push({ id: u.id, error: err?.message || String(err) });
        }
      }
      return json({ ok: true, broadcast: 'morning_weather', sent, errors, usersTotal: usersRes.results?.length ?? 0 });
    }
    let t: any = null;
    let routesCount = 0;
    let stopsPresent = false;
    let dbStatus = 'ok';
    try {
      t = await db.prepare('SELECT * FROM transit_state WHERE id=1').first<any>();
      const routes = await db.prepare('SELECT route_id, route_short_name, route_type FROM tranzy_routes LIMIT 50').all<any>();
      routesCount = routes.results?.length ?? 0;
      const stopsRow = await db.prepare('SELECT 1 FROM tranzy_stops LIMIT 1').all<any>();
      stopsPresent = (stopsRow.results?.length ?? 0) > 0;
    } catch (dbErr: any) {
      dbStatus = dbErr?.message || 'db_error';
    }

    return json({
      ok: true,
      service: 'usm-life-worker',
      dbBackend: db.backend,
      dbStatus,
      d1Status: dbStatus,
      transit: t,
      routesCount,
      stopsPresent,
      routes: [],
    });
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

  try {
    await db.batch([
      db.prepare(
        'INSERT INTO users(id,first_name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name'
      ).bind(String(user.id), user.first_name || ''),
      db.prepare('INSERT INTO settings(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING').bind(
        String(user.id)
      ),
    ]);
  } catch (userDbErr) {
    console.warn('Failed to ensure user/settings in DB:', userDbErr);
  }

  if (path === '/api/bootstrap' && request.method === 'GET') {
    let settingsRow: any = null;
    let homeworkResults: any[] = [];
    let classesList: any[] = [];
    let exceptionsList: any[] = [];
    let transitRow: any = null;
    let commuteOptions: any[] = [];

    try {
      await ensureClassesPopulated(env, String(user.id));

      const [sRow, homework, classRows, excRows, tRow] = await Promise.all([
        db.prepare('SELECT * FROM settings WHERE user_id=?').bind(String(user.id)).first(),
        db.prepare(
          'SELECT * FROM homework WHERE user_id=? ORDER BY completed ASC, CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, created_at DESC'
        )
          .bind(String(user.id))
          .all(),
        db.prepare('SELECT * FROM classes WHERE user_id=? ORDER BY day ASC, start ASC, position ASC')
          .bind(String(user.id))
          .all(),
        db.prepare('SELECT * FROM schedule_exceptions WHERE user_id=? ORDER BY date ASC')
          .bind(String(user.id))
          .all(),
        db.prepare('SELECT * FROM transit_state WHERE id=1').first<any>(),
      ]);

      settingsRow = sRow;
      homeworkResults = homework.results || [];
      classesList = (classRows.results || []).map(mapClassRow);
      exceptionsList = (excRows.results || []).map(mapExceptionRow);
      transitRow = tRow;
      commuteOptions = await getUserCommuteOptions(env, String(user.id));
    } catch (d1Err) {
      console.warn('DB bootstrap query failed:', d1Err);
    }

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
      homework: homeworkResults,
      schedule: classesList.length > 0 ? classesList : baseSchedule,
      classes: classesList.length > 0 ? classesList : baseSchedule,
      exceptions: exceptionsList,
      transit: t,
      commuteOptions,
      mapsBrowserKey: env.GOOGLE_MAPS_BROWSER_KEY || '',
    });
  }

  if (path === '/api/trip/plan' && request.method === 'GET') {
    return handleTripPlan(request, env, String(user.id));
  }

  if (path.startsWith('/api/transit/')) {
    const subpath = path.slice('/api/transit'.length);
    return handleTransitRoutes(request, env, String(user.id), subpath);
  }

  if (path === '/api/transit' && request.method === 'GET') {
    try {
      const t = await db.prepare('SELECT * FROM transit_state WHERE id=1').first<any>();
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
    } catch {
      return json(await transit(env));
    }
  }

  if (path === '/api/settings' && request.method === 'PUT') {
    try {
      const patch = validatedSettings(await request.json());
      const entries = Object.entries(patch);
      if (!entries.length) {
        return json(
          dbSettings(
            await db.prepare('SELECT * FROM settings WHERE user_id=?')
              .bind(String(user.id))
              .first()
          )
        );
      }
      const sets = entries.map(([col]) => `${col}=?`).join(',');
      await db.prepare(
        `UPDATE settings SET ${sets},updated_at=CURRENT_TIMESTAMP WHERE user_id=?`
      )
        .bind(...entries.map(([, v]) => v), String(user.id))
        .run();
      return json(
        dbSettings(
          await db.prepare('SELECT * FROM settings WHERE user_id=?')
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
    const db = createDb(env);
    ctx.waitUntil(
      Promise.allSettled([
        (async () => {
          const last = await db.prepare(
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
