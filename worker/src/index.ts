import { handleGrades } from './grades.js';
import {
  handleHomeworkAttachments,
  handleAttachment,
  handleSignedDownload,
} from './attachments.js';
import { reclaimAttachments } from './attachment-storage.js';
import { handleBotCleanup } from './bot-cleanup.js';
import { handleAssessments, mapAssessment } from './assessments.js';
import { baseSchedule } from '@usm/shared';
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
import { notificationTick } from './notifications.js';
import { dbSettings, validatedSettings } from './settings.js';
import { transit } from './transit.js';
import { handleTransitRoutes } from './commute.js';
import { handleTripPlan } from './trip-plan.js';
import { Env } from './types.js';
import { handleWebhook } from './webhook.js';
import {
  handleAdminBroadcast,
  handleAdminHistory,
  handleAdminStats,
  isUserAdmin,
} from './admin.js';

async function apiRequest(request: Request, env: Env, path: string): Promise<Response> {
  const db = createDb(env);

  if (path === '/health') {
    // Public health checks are read-only. Broadcasts require authenticated admin routes.
    if (request.method !== 'GET') return json({ error: 'Метод не поддерживается.' }, 405);
    let t: any = null;
    let routesCount = 0;
    let stopsPresent = false;
    let dbStatus = 'ok';
    try {
      t = await db.prepare('SELECT * FROM transit_state WHERE id=1').first<any>();
      const routes = await db
        .prepare('SELECT route_id, route_short_name, route_type FROM tranzy_routes LIMIT 50')
        .all<any>();
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
      dbStatus: dbStatus === 'ok' ? 'ok' : 'unavailable',
      transit: t ? { available: Boolean(t.available), checkedAt: t.checked_at } : null,
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

  const download = path.match(/^\/api\/file-download\/([a-zA-Z0-9_-]+)$/);
  if (download) return handleSignedDownload(request, env, download[1]);

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
      db
        .prepare(
          'INSERT INTO users(id,first_name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name'
        )
        .bind(String(user.id), user.first_name || ''),
      db
        .prepare(
          'INSERT INTO settings(user_id,home_address) VALUES(?,NULL) ON CONFLICT(user_id) DO NOTHING'
        )
        .bind(String(user.id)),
    ]);
  } catch (userDbErr) {
    console.warn('Failed to ensure user/settings in DB:', userDbErr);
  }

  if (path === '/api/bootstrap' && request.method === 'GET') {
    let settingsRow: any = null;
    let homeworkResults: any[] = [];
    let assessmentsList: any[] = [];
    let classesList: any[] = [];
    let exceptionsList: any[] = [];

    try {
      await ensureClassesPopulated(env, String(user.id));

      const [sRow, homework, classRows, excRows, assessments] = await Promise.all([
        db.prepare('SELECT * FROM settings WHERE user_id=?').bind(String(user.id)).first(),
        db
          .prepare(
            'SELECT * FROM homework WHERE user_id=? ORDER BY completed ASC, CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, created_at DESC'
          )
          .bind(String(user.id))
          .all(),
        db
          .prepare(
            'SELECT * FROM classes WHERE user_id=? ORDER BY day ASC, start ASC, position ASC'
          )
          .bind(String(user.id))
          .all(),
        db
          .prepare('SELECT * FROM schedule_exceptions WHERE user_id=? ORDER BY date ASC')
          .bind(String(user.id))
          .all(),
        db
          .prepare('SELECT * FROM assessments WHERE user_id=? ORDER BY date,time')
          .bind(String(user.id))
          .all(),
      ]);

      settingsRow = sRow;
      homeworkResults = homework.results || [];
      assessmentsList = assessments.results.map(mapAssessment);
      classesList = (classRows.results || []).map(mapClassRow);
      exceptionsList = (excRows.results || []).map(mapExceptionRow);
    } catch (d1Err) {
      console.warn('DB bootstrap query failed:', d1Err);
      return json(
        { error: 'Не удалось загрузить твои данные. Попробуй открыть приложение ещё раз.' },
        503
      );
    }

    return json({
      settings: dbSettings(settingsRow),
      homework: homeworkResults,
      assessments: assessmentsList,
      schedule: classesList,
      classes: classesList,
      exceptions: exceptionsList,
      isAdmin: isUserAdmin(env, String(user.id)),
    });
  }

  if (path === '/api/bot/cleanup') return handleBotCleanup(request, env, String(user.id));

  if (path === '/api/admin/stats' && request.method === 'GET') {
    return handleAdminStats(request, env, String(user.id));
  }

  if (path === '/api/admin/broadcasts' && request.method === 'GET') {
    return handleAdminHistory(request, env, String(user.id));
  }

  if (path === '/api/admin/broadcast' && request.method === 'POST') {
    return handleAdminBroadcast(request, env, String(user.id));
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
            await db.prepare('SELECT * FROM settings WHERE user_id=?').bind(String(user.id)).first()
          )
        );
      }
      const sets = entries.map(([col]) => `${col}=?`).join(',');
      await db
        .prepare(`UPDATE settings SET ${sets},updated_at=CURRENT_TIMESTAMP WHERE user_id=?`)
        .bind(...entries.map(([, v]) => v), String(user.id))
        .run();
      return json(
        dbSettings(
          await db.prepare('SELECT * FROM settings WHERE user_id=?').bind(String(user.id)).first()
        )
      );
    } catch (err: any) {
      return json({ error: err instanceof Error ? err.message : 'Некорректные настройки.' }, 400);
    }
  }

  const gradePath = path.match(/^\/api\/grades(?:\/([^/]+))?$/);
  if (gradePath) return handleGrades(request, env, String(user.id), gradePath[1]);
  const hwFiles = path.match(/^\/api\/homework\/([^/]+)\/attachments$/);
  if (hwFiles) return handleHomeworkAttachments(request, env, String(user.id), hwFiles[1]);
  const file = path.match(/^\/api\/files\/([^/]+)(\/link)?$/);
  if (file) return handleAttachment(request, env, String(user.id), file[1], Boolean(file[2]));

  const assessmentPath = path.match(/^\/api\/assessments(?:\/([^/]+))?$/);
  if (assessmentPath) return handleAssessments(request, env, String(user.id), assessmentPath[1]);

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
    ctx.waitUntil(notificationTick(env));
    ctx.waitUntil(reclaimAttachments(env));
  },
};
