import {
  calculateCommuteOptionsForDestination,
  summarizeTrackedTrolleys,
  getLiveTrackedVehicles,
  CommuteOption,
  CommuteOptionResult,
  DestinationType,
  TransitStop,
  TrackedTrolleySummary,
  LiveTrackedVehicle,
} from '@usm/shared';
import { json } from './homework.js';
import { Env } from './types.js';
import { fetchLiveVehicles, fetchTranzyStopsRaw } from './tranzy.js';

import { syncTranzyStops } from './transit.js';

export { fetchLiveVehicles };

let STOPS_CACHE: TransitStop[] | null = null;
let STOPS_CACHE_TIME = 0;
let LAST_D1_STOPS_ERROR_TIME = 0;
const D1_RETRY_COOLDOWN_MS = 60000;
const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60; // 604800 секунд

export function _resetStopsCacheForTesting(
  cache: TransitStop[] | null = null,
  cacheTime = 0,
  lastErrorTime = 0
): void {
  STOPS_CACHE = cache;
  STOPS_CACHE_TIME = cacheTime;
  LAST_D1_STOPS_ERROR_TIME = lastErrorTime;
}

/**
 * Ensures stops table in D1 is populated from Tranzy OpenData.
 * Syncs only if 'stops_synced_at' is absent or older than 7 days.
 */
export async function ensureStopsPopulated(env: Env): Promise<void> {
  const now = Date.now();
  if (now - LAST_D1_STOPS_ERROR_TIME < D1_RETRY_COOLDOWN_MS) {
    return;
  }
  try {
    const res = await env.DB.prepare(
      "SELECT value, updated_at FROM app_state WHERE key = 'stops_synced_at'"
    ).all<{ value: string; updated_at: number }>();
    const syncRow = res.results?.[0];
    const nowSec = Math.floor(now / 1000);
    const syncedAt = syncRow ? Number(syncRow.value || syncRow.updated_at) : 0;
    if (!syncedAt || nowSec - syncedAt > SEVEN_DAYS_SEC) {
      await syncTranzyStops(env);
    }
  } catch {
    LAST_D1_STOPS_ERROR_TIME = now;
    // Non-fatal if stops sync fails or quota exceeded
  }
}

/**
 * Searches stops by query string with in-memory caching to protect D1 read quota.
 * On cold start, reads only a single row ('stops_json') from app_state.
 */
export async function searchStops(env: Env, query: string, limit: number = 500): Promise<TransitStop[]> {
  const now = Date.now();
  if (!STOPS_CACHE || now - STOPS_CACHE_TIME > 3600000) {
    if (now - LAST_D1_STOPS_ERROR_TIME >= D1_RETRY_COOLDOWN_MS) {
      try {
        const res = await env.DB.prepare(
          "SELECT value FROM app_state WHERE key = 'stops_json'"
        ).all<{ value: string }>();
        const row = res.results?.[0];
        if (row?.value) {
          const parsed = JSON.parse(row.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            STOPS_CACHE = parsed;
            STOPS_CACHE_TIME = now;
          }
        }
      } catch {
        LAST_D1_STOPS_ERROR_TIME = now;
      }
    }

    // Если строки stops_json нет в app_state, запасной путь через Tranzy как сейчас
    if (!STOPS_CACHE || STOPS_CACHE.length === 0) {
      try {
        const rawStops = await fetchTranzyStopsRaw(env);
        if (rawStops && rawStops.length > 0) {
          STOPS_CACHE = rawStops.map((r: any) => ({
            stop_id: Number(r.stop_id),
            stop_name: String(r.stop_name),
            stop_desc: r.stop_desc || undefined,
            stop_lat: Number(r.stop_lat),
            stop_lon: Number(r.stop_lon),
          }));
          STOPS_CACHE_TIME = now;
        }
      } catch {
        // Игнорируем сетевые сбои
      }
    }
  }

  const allStops = STOPS_CACHE || [];
  const q = query.trim().toLowerCase();
  if (!q) {
    return allStops.slice(0, limit);
  }

  return allStops
    .filter((s) => s.stop_name.toLowerCase().includes(q))
    .slice(0, limit);
}

/**
 * Retrieves commute options for user.
 */
export async function getUserCommuteOptions(
  env: Env,
  userId: string
): Promise<CommuteOption[]> {
  const rows = await env.DB.prepare(
    'SELECT * FROM commute_options WHERE user_id=? ORDER BY destination ASC, position ASC'
  )
    .bind(userId)
    .all<any>();

  if (!rows.results || rows.results.length === 0) {
    // Seed default for user if none exist yet
    const seedRows = await env.DB.prepare(
      'SELECT * FROM commute_options WHERE user_id=1 ORDER BY destination ASC, position ASC'
    ).all<any>();
    if (seedRows.results && seedRows.results.length > 0) {
      const inserts = seedRows.results.map((r: any) =>
        env.DB.prepare(
          'INSERT OR IGNORE INTO commute_options(id, user_id, destination, name, position, enabled, is_configured, walk_before_minutes, walk_after_minutes, legs) VALUES(?,?,?,?,?,?,?,?,?,?)'
        ).bind(
          `${r.id}-${userId}`,
          userId,
          r.destination,
          r.name,
          r.position,
          r.enabled,
          r.is_configured,
          r.walk_before_minutes,
          r.walk_after_minutes,
          r.legs
        )
      );
      await env.DB.batch(inserts);
      return getUserCommuteOptions(env, userId);
    } else {
      const defaultLegsUnivA = JSON.stringify([
        { mode: 'fixed_route', route_id: 9, route_short_name: '2', board_stop_id: null, board_stop_name: 'Dacia / Cuza Vodă', alight_stop_id: null, alight_stop_name: 'Parcul Ștefan cel Mare' },
        { mode: 'any_trolleybus', route_id: null, route_short_name: 'любой троллейбус', board_stop_id: null, board_stop_name: 'Parcul Ștefan cel Mare', alight_stop_id: null, alight_stop_name: 'Universitatea de Stat' },
      ]);
      const defaultLegsUnivB = JSON.stringify([
        { mode: 'fixed_route', route_id: 20, route_short_name: '4', board_stop_id: null, board_stop_name: 'Dacia / Cuza Vodă', alight_stop_id: null, alight_stop_name: 'Universitatea de Stat' },
      ]);
      const defaultLegsSports = JSON.stringify([
        { mode: 'fixed_route', route_id: 16, route_short_name: '17', board_stop_id: null, board_stop_name: 'Strada Cuza Vodă', alight_stop_id: null, alight_stop_name: 'Complexul Sportiv USM (Ismail 1)' },
      ]);
      const fallbackInserts = [
        env.DB.prepare('INSERT OR IGNORE INTO commute_options(id, user_id, destination, name, position, enabled, is_configured, walk_before_minutes, walk_after_minutes, legs) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(`univ-a-${userId}`, userId, 'university', 'Университет · А', 1, 1, 0, 7, 5, defaultLegsUnivA),
        env.DB.prepare('INSERT OR IGNORE INTO commute_options(id, user_id, destination, name, position, enabled, is_configured, walk_before_minutes, walk_after_minutes, legs) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(`univ-b-${userId}`, userId, 'university', 'Университет · Б', 2, 1, 0, 7, 5, defaultLegsUnivB),
        env.DB.prepare('INSERT OR IGNORE INTO commute_options(id, user_id, destination, name, position, enabled, is_configured, walk_before_minutes, walk_after_minutes, legs) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(`sports-17-${userId}`, userId, 'sports', 'Физкультура', 1, 1, 0, 12, 3, defaultLegsSports),
      ];
      await env.DB.batch(fallbackInserts);
      return getUserCommuteOptions(env, userId);
    }
  }

  return (rows.results || []).map((r: any) => {
    let legs: any[] = [];
    try {
      legs = JSON.parse(r.legs || '[]');
    } catch {}
    return {
      id: String(r.id),
      user_id: String(r.user_id),
      destination: r.destination as DestinationType,
      name: String(r.name),
      position: Number(r.position),
      enabled: Boolean(r.enabled),
      is_configured: Boolean(r.is_configured),
      walk_before_minutes: Number(r.walk_before_minutes),
      walk_after_minutes: Number(r.walk_after_minutes),
      legs,
    };
  });
}

/**
 * Handles evaluation of commute options for destination.
 */
export async function evaluateUserCommute(
  env: Env,
  userId: string,
  destination: DestinationType,
  targetClassStartStr: string | null
): Promise<{
  destination: DestinationType;
  options: CommuteOptionResult[];
  trackedTrolleys: TrackedTrolleySummary[];
  liveVehicles: LiveTrackedVehicle[];
  stops: TransitStop[];
  liveStatus: { available: boolean; source: string; vehicleCount: number; checkedAt: string };
}> {
  const now = new Date();
  const chParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Chisinau',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const curHour = Number(chParts.find((p) => p.type === 'hour')?.value || 0);
  const curMin = Number(chParts.find((p) => p.type === 'minute')?.value || 0);
  const nowMinuteOfDay = curHour * 60 + curMin;

  const [options, live, stops] = await Promise.all([
    getUserCommuteOptions(env, userId),
    fetchLiveVehicles(env),
    searchStops(env, '', 500),
  ]);

  const routesRows = await env.DB.prepare(
    'SELECT route_id, route_short_name FROM tranzy_routes WHERE route_type=11'
  ).all<any>();

  const candidateTrolleyRoutes =
    routesRows.results && routesRows.results.length > 0
      ? routesRows.results.map((r: any) => ({
          route_id: Number(r.route_id),
          route_short_name: String(r.route_short_name),
        }))
      : [
          { route_id: 9, route_short_name: '2' },
          { route_id: 20, route_short_name: '4' },
          { route_id: 4, route_short_name: '10' },
          { route_id: 16, route_short_name: '17' },
          { route_id: 8, route_short_name: '22' },
          { route_id: 28, route_short_name: '24' },
        ];

  const calcContext = {
    nowMs: now.getTime(),
    nowMinuteOfDay,
    vehicles: live.vehicles,
    stops,
    candidateTrolleyRoutes,
  };

  const results = calculateCommuteOptionsForDestination(
    options,
    destination,
    targetClassStartStr,
    calcContext
  );

  const trackedTrolleys = summarizeTrackedTrolleys(options, calcContext);
  const liveVehicles = getLiveTrackedVehicles(options, calcContext);

  return {
    destination,
    options: results,
    trackedTrolleys,
    liveVehicles,
    stops,
    liveStatus: {
      available: live.available,
      source: live.source,
      vehicleCount: live.vehicles.length,
      checkedAt: now.toISOString(),
    },
  };
}

/**
 * API Handler for /api/transit/*
 */
export async function handleTransitRoutes(
  request: Request,
  env: Env,
  userId: string,
  subpath: string
): Promise<Response> {
  const url = new URL(request.url);

  // GET /api/transit/stops?q=...&limit=...
  if (subpath === '/stops' && request.method === 'GET') {
    const q = url.searchParams.get('q') || '';
    const limit = Number(url.searchParams.get('limit')) || 500;
    const stops = await searchStops(env, q, limit);
    return json({ stops });
  }

  // GET /api/transit/options
  if (subpath === '/options' && request.method === 'GET') {
    const options = await getUserCommuteOptions(env, userId);
    return json({ options });
  }

  // PUT /api/transit/options/:id
  if (subpath.startsWith('/options/') && request.method === 'PUT') {
    const optionId = subpath.replace('/options/', '');
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Некорректный JSON' }, 400);
    }

    try {
      const walkBefore = Number.isInteger(body.walk_before_minutes)
        ? body.walk_before_minutes
        : 7;
      const walkAfter = Number.isInteger(body.walk_after_minutes)
        ? body.walk_after_minutes
        : 5;
      const legsJson = JSON.stringify(body.legs || []);
      const isConfigured = body.is_configured ? 1 : 0;

      const updateResult = await env.DB.prepare(
        'UPDATE commute_options SET walk_before_minutes=?, walk_after_minutes=?, legs=?, is_configured=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?'
      )
        .bind(walkBefore, walkAfter, legsJson, isConfigured, optionId, userId)
        .run();

      const updated = await env.DB.prepare(
        'SELECT * FROM commute_options WHERE id=? AND user_id=?'
      )
        .bind(optionId, userId)
        .first<any>();

      if (!updated) {
        return json({ error: 'Маршрут не найден или нет доступа.' }, 404);
      }

      return json({
        success: true,
        option: {
          ...updated,
          is_configured: Boolean(updated.is_configured),
          legs: JSON.parse(updated.legs || '[]'),
        },
      });
    } catch (err: any) {
      return json({ error: err instanceof Error ? err.message : 'Ошибка сохранения маршрута.' }, 400);
    }
  }

  // GET /api/transit/commute?destination=university|sports&time=09:45
  if (subpath === '/commute' && request.method === 'GET') {
    try {
      const dest = (url.searchParams.get('destination') || 'university') as DestinationType;
      const time = url.searchParams.get('time') || null;
      const evaluated = await evaluateUserCommute(env, userId, dest, time);
      return json(evaluated);
    } catch (err: any) {
      return json({ error: err instanceof Error ? err.message : 'Ошибка оценки транспорта.' }, 400);
    }
  }

  return json({ error: 'Маршрут не найден.' }, 404);
}
