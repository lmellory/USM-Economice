import {
  calculateCommuteOptionsForDestination,
  summarizeTrackedTrolleys,
  CommuteOption,
  CommuteOptionResult,
  DestinationType,
  TransitStop,
  VehiclePosition,
  TrackedTrolleySummary,
} from '@usm/shared';
import { json } from './homework.js';
import { Env } from './types.js';

const VEHICLES_CACHE_TTL = 30; // seconds

/**
 * Fetches live vehicles from Tranzy OpenData, protected by a 30-second Cache API window.
 */
export async function fetchLiveVehicles(env: Env): Promise<{
  vehicles: VehiclePosition[];
  available: boolean;
  source: string;
  note?: string;
}> {
  if (!env.TRANZY_API_KEY) {
    return {
      vehicles: [],
      available: false,
      source: 'Tranzy OpenData (не настроен)',
      note: 'Секрет TRANZY_API_KEY не задан в Worker.',
    };
  }

  const vehiclesUrl = (
    env.TRANZY_VEHICLES_URL || 'https://api.tranzy.ai/v1/opendata/vehicles'
  ).trim();

  const cacheKey = new Request('https://cache.local/tranzy/vehicles');
  const cache = (caches as any).default;

  try {
    const cachedResp = await cache.match(cacheKey);
    if (cachedResp) {
      const data: any = await cachedResp.json();
      return {
        vehicles: data.vehicles || [],
        available: true,
        source: data.source || 'Tranzy OpenData (RTEC/PUA)',
      };
    }
  } catch {
    // Cache miss or unsupported in local mock
  }

  try {
    let agencyId = env.TRANZY_AGENCY_ID?.trim();
    if (!agencyId) {
      const baseUrl = vehiclesUrl.replace(/\/vehicles(?:\?.*)?$/, '');
      const ar = await fetch(`${baseUrl}/agency`, {
        headers: { 'X-API-KEY': env.TRANZY_API_KEY },
        signal: AbortSignal.timeout(6000),
      });
      if (ar.ok) {
        const agencies: any = await ar.json();
        const list = Array.isArray(agencies) ? agencies : [];
        const matched =
          list.find(
            (a: any) =>
              String(a.agency_timezone || '')
                .toLowerCase()
                .includes('chisinau') ||
              /chisinau|chișinău|rtec|pua/i.test(String(a.agency_name || ''))
          ) || list[0];
        if (matched) {
          agencyId = String(matched.agency_id);
        }
      }
    }

    const headers: Record<string, string> = { 'X-API-KEY': env.TRANZY_API_KEY };
    if (agencyId) headers['X-Agency-Id'] = agencyId;

    const r = await fetch(vehiclesUrl, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      return {
        vehicles: [],
        available: false,
        source: 'Tranzy OpenData',
        note: `Tranzy ответил HTTP ${r.status}. Используется резервная оценка.`,
      };
    }

    const raw: any = await r.json();
    const list: any[] = Array.isArray(raw) ? raw : (raw.data ?? raw.vehicles ?? []);

    const vehicles: VehiclePosition[] = list.map((v) => ({
      id: String(v.id || v.label || ''),
      label: String(v.label || v.id || ''),
      route_id: Number(v.route_id),
      trip_id: v.trip_id ? String(v.trip_id) : undefined,
      latitude: Number(v.latitude),
      longitude: Number(v.longitude),
      speed: Number(v.speed || 0),
      timestamp: v.timestamp ? String(v.timestamp) : new Date().toISOString(),
      vehicle_type: Number(v.vehicle_type || 11),
    }));

    // Cache the result for 30s
    try {
      const respToCache = new Response(
        JSON.stringify({ vehicles, source: 'Tranzy OpenData (RTEC/PUA)' }),
        {
          headers: {
            'content-type': 'application/json',
            'cache-control': `public, max-age=${VEHICLES_CACHE_TTL}`,
          },
        }
      );
      await cache.put(cacheKey, respToCache);
    } catch {
      // cache storage warning ignored
    }

    return {
      vehicles,
      available: true,
      source: 'Tranzy OpenData (RTEC/PUA)',
    };
  } catch (err: any) {
    return {
      vehicles: [],
      available: false,
      source: 'Tranzy OpenData',
      note: 'Не удалось получить данные Tranzy OpenData.',
    };
  }
}

/**
 * Ensures stops table in D1 is populated.
 */
export async function ensureStopsPopulated(env: Env): Promise<void> {
  const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM tranzy_stops').first<{
    c: number;
  }>();
  if (countRow && countRow.c > 0) return;

  // Default seed stops for Chisinau route 2, 4, 17, university and sports
  const seedStops: TransitStop[] = [
    { stop_id: 101, stop_name: 'Dacia / Cuza Vodă', stop_lat: 46.9825, stop_lon: 28.865 },
    { stop_id: 102, stop_name: 'Strada Cuza Vodă', stop_lat: 46.983, stop_lon: 28.864 },
    { stop_id: 103, stop_name: 'Bulevardul Traian', stop_lat: 46.987, stop_lon: 28.857 },
    { stop_id: 104, stop_name: 'Bulevardul Decebal', stop_lat: 46.995, stop_lon: 28.851 },
    { stop_id: 105, stop_name: 'Gara Feroviară', stop_lat: 47.0125, stop_lon: 28.859 },
    { stop_id: 201, stop_name: 'Teatrul Mihai Eminescu', stop_lat: 47.021, stop_lon: 28.837 },
    { stop_id: 202, stop_name: 'Parcul Ștefan cel Mare', stop_lat: 47.0245, stop_lon: 28.8322 },
    { stop_id: 203, stop_name: 'Piața Marii Adunări Naționale', stop_lat: 47.023, stop_lon: 28.834 },
    { stop_id: 301, stop_name: 'Universitatea de Stat (USM)', stop_lat: 47.0185, stop_lon: 28.824 },
    { stop_id: 302, stop_name: 'Strada Mihail Kogălniceanu', stop_lat: 47.019, stop_lon: 28.827 },
    { stop_id: 303, stop_name: 'Strada Alexei Mateevici', stop_lat: 47.018, stop_lon: 28.823 },
    { stop_id: 401, stop_name: 'Strada Ismail (Gara)', stop_lat: 47.011, stop_lon: 28.852 },
    { stop_id: 404, stop_name: 'Complexul Sportiv USM (Ismail 1)', stop_lat: 47.012, stop_lon: 28.847 },
  ];

  const nowSec = Math.floor(Date.now() / 1000);
  const stmts = seedStops.map((s) =>
    env.DB.prepare(
      'INSERT OR IGNORE INTO tranzy_stops(stop_id, stop_name, stop_desc, stop_lat, stop_lon, updated_at) VALUES(?,?,?,?,?,?)'
    ).bind(s.stop_id, s.stop_name, s.stop_desc || null, s.stop_lat, s.stop_lon, nowSec)
  );

  await env.DB.batch(stmts);
}

/**
 * Searches stops by query string.
 */
export async function searchStops(env: Env, query: string): Promise<TransitStop[]> {
  await ensureStopsPopulated(env);
  const q = query.trim().toLowerCase();
  if (!q) {
    const all = await env.DB.prepare('SELECT * FROM tranzy_stops LIMIT 20').all<any>();
    return (all.results || []).map((r) => ({
      stop_id: Number(r.stop_id),
      stop_name: String(r.stop_name),
      stop_desc: r.stop_desc || undefined,
      stop_lat: Number(r.stop_lat),
      stop_lon: Number(r.stop_lon),
    }));
  }

  const rows = await env.DB.prepare(
    'SELECT * FROM tranzy_stops WHERE LOWER(stop_name) LIKE ? LIMIT 20'
  )
    .bind(`%${q}%`)
    .all<any>();

  return (rows.results || []).map((r) => ({
    stop_id: Number(r.stop_id),
    stop_name: String(r.stop_name),
    stop_desc: r.stop_desc || undefined,
    stop_lat: Number(r.stop_lat),
    stop_lon: Number(r.stop_lon),
  }));
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
    searchStops(env, ''),
  ]);

  const candidateTrolleyRoutes = [
    { route_id: 2, route_short_name: '2' },
    { route_id: 4, route_short_name: '4' },
    { route_id: 10, route_short_name: '10' },
    { route_id: 17, route_short_name: '17' },
    { route_id: 22, route_short_name: '22' },
    { route_id: 24, route_short_name: '24' },
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

  return {
    destination,
    options: results,
    trackedTrolleys,
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

  // GET /api/transit/stops?q=...
  if (subpath === '/stops' && request.method === 'GET') {
    const q = url.searchParams.get('q') || '';
    const stops = await searchStops(env, q);
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
      const isConfigured = body.is_configured ? 1 : 1; // Marking confirmed

      await env.DB.prepare(
        'UPDATE commute_options SET walk_before_minutes=?, walk_after_minutes=?, legs=?, is_configured=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
      )
        .bind(walkBefore, walkAfter, legsJson, isConfigured, optionId)
        .run();

      const updated = await env.DB.prepare(
        'SELECT * FROM commute_options WHERE id=?'
      )
        .bind(optionId)
        .first<any>();

      return json({
        success: true,
        option: updated
          ? {
              ...updated,
              is_configured: Boolean(updated.is_configured),
              legs: JSON.parse(updated.legs || '[]'),
            }
          : null,
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
