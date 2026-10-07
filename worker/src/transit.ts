import { Env, TransitState } from './types.js';

export async function transit(env: Env): Promise<TransitState> {
  const checkedAt = new Date().toISOString();

  if (!env.TRANZY_API_KEY) {
    return {
      available: false,
      source: 'Tranzy OpenData (не настроен)',
      checkedAt,
      note: 'Секрет TRANZY_API_KEY не найден в Worker. Используется оценка около 30 минут.',
      route: null,
      estimateMinutes: 30,
    };
  }

  try {
    let vehiclesUrl = (
      env.TRANZY_VEHICLES_URL || 'https://api.tranzy.ai/v1/opendata/vehicles'
    ).trim();
    if (vehiclesUrl.endsWith('/v1/opendata/vehicle')) {
      vehiclesUrl = vehiclesUrl.replace(/\/v1\/opendata\/vehicle$/, '/v1/opendata/vehicles');
    }

    let agencyId = env.TRANZY_AGENCY_ID?.trim();
    let agencyName = '';

    if (!agencyId) {
      const baseUrl = vehiclesUrl.replace(/\/vehicles(?:\?.*)?$/, '');
      const agencyEndpoint = `${baseUrl}/agency`;
      const ar = await fetch(agencyEndpoint, {
        headers: { 'X-API-KEY': env.TRANZY_API_KEY },
        signal: AbortSignal.timeout(6000),
      });

      if (!ar.ok) {
        let reason = `HTTP ${ar.status}`;
        if (ar.status === 403) reason = 'HTTP 403 (доступ запрещён: неверный TRANZY_API_KEY)';
        else if (ar.status === 429) reason = 'HTTP 429 (превышен лимит запросов к Tranzy)';

        return {
          available: false,
          source: 'Tranzy OpenData',
          checkedAt,
          note: `Tranzy /agency ответил ${reason}. Используется оценка около 30 минут.`,
          route: null,
          estimateMinutes: 30,
        };
      }

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
        agencyName = matched.agency_name ? ` (${matched.agency_name})` : '';
      }
    }

    const headers: Record<string, string> = { 'X-API-KEY': env.TRANZY_API_KEY };
    if (agencyId) headers['X-Agency-Id'] = agencyId;

    const r = await fetch(vehiclesUrl, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      let reason = `HTTP ${r.status}`;
      if (r.status === 403) reason = 'HTTP 403 (доступ запрещён)';
      else if (r.status === 404) reason = 'HTTP 404 (маршрут не найден)';
      else if (r.status === 429) reason = 'HTTP 429 (превышен лимит запросов)';

      return {
        available: false,
        source: 'Tranzy OpenData',
        checkedAt,
        note: `Tranzy ответил ${reason}. Используется оценка около 30 минут.`,
        route: null,
        estimateMinutes: 30,
      };
    }

    const data: any = await r.json();
    const list = Array.isArray(data) ? data : (data.data ?? data.vehicles ?? []);

    let routesSummary = '';
    try {
      const routesUrl = vehiclesUrl.replace(/\/vehicles(?:\?.*)?$/, '/routes');
      const rr = await fetch(routesUrl, { headers, signal: AbortSignal.timeout(6000) });
      if (rr.ok) {
        const routesData: any = await rr.json();
        const routesList: any[] = Array.isArray(routesData) ? routesData : (routesData.data ?? []);
        if (routesList.length > 0) {
          const nowSec = Math.floor(Date.now() / 1000);
          const stmts = routesList.slice(0, 100).map((item: any) =>
            env.DB.prepare(
              'INSERT OR REPLACE INTO tranzy_routes(route_id, route_short_name, route_long_name, route_type, route_color, updated_at) VALUES(?,?,?,?,?,?)'
            ).bind(
              Number(item.route_id),
              String(item.route_short_name || ''),
              item.route_long_name ? String(item.route_long_name) : null,
              Number(item.route_type ?? 11),
              item.route_color ? String(item.route_color) : null,
              nowSec
            )
          );
          for (let i = 0; i < stmts.length; i += 25) {
            await env.DB.batch(stmts.slice(i, i + 25));
          }
        }
        const trolleyCountsByRoute: Record<string, number> = {};
        for (const v of list) {
          if (v.vehicle_type === 11 && v.route_id != null) {
            trolleyCountsByRoute[String(v.route_id)] =
              (trolleyCountsByRoute[String(v.route_id)] || 0) + 1;
          }
        }
        routesSummary = JSON.stringify({
          routesCount: routesList.length,
          activeOnRoute: {
            '№2 (к USM)': trolleyCountsByRoute['9'] || 0,
            '№17 (к Спорту)': trolleyCountsByRoute['16'] || 0,
            '№4': trolleyCountsByRoute['20'] || 0,
            '№22': trolleyCountsByRoute['8'] || 0,
            '№10': trolleyCountsByRoute['4'] || 0,
            '№24': trolleyCountsByRoute['28'] || 0,
          },
        });
      }
    } catch (e: any) {
      routesSummary = JSON.stringify({ err: String(e?.message) });
    }

    return {
      available: true,
      source: `Tranzy OpenData${agencyName}`,
      checkedAt,
      note: 'Данные RTEC/PUA Кишинёва поступают в реальном времени.',
      route: null,
      estimateMinutes: 30,
      liveVehicleCount: list.length,
      routesSummary,
    };
  } catch {
    return {
      available: false,
      source: 'Tranzy OpenData',
      checkedAt,
      note: 'Не удалось получить данные Tranzy. Используется оценка около 30 минут.',
      route: null,
      estimateMinutes: 30,
    };
  }
}

export async function syncTranzyStops(env: Env): Promise<{ count: number; error?: string }> {
  if (!env.TRANZY_API_KEY) {
    return { count: 0, error: 'No TRANZY_API_KEY' };
  }
  try {
    const vehiclesUrl = (
      env.TRANZY_VEHICLES_URL || 'https://api.tranzy.ai/v1/opendata/vehicles'
    ).trim();
    const baseUrl = vehiclesUrl.replace(/\/vehicles(?:\?.*)?$/, '');

    let agencyId = env.TRANZY_AGENCY_ID?.trim();
    if (!agencyId) {
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
        if (matched) agencyId = String(matched.agency_id);
      }
    }

    const headers: Record<string, string> = { 'X-API-KEY': env.TRANZY_API_KEY };
    if (agencyId) headers['X-Agency-Id'] = agencyId;

    const stopsRes = await fetch(`${baseUrl}/stops`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!stopsRes.ok) {
      return { count: 0, error: `HTTP ${stopsRes.status}` };
    }

    const stopsData: any = await stopsRes.json();
    const stopsList: any[] = Array.isArray(stopsData) ? stopsData : (stopsData.data ?? []);
    if (stopsList.length === 0) {
      return { count: 0 };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const stmts = stopsList.map((s: any) =>
      env.DB.prepare(
        'INSERT OR REPLACE INTO tranzy_stops(stop_id, stop_name, stop_desc, stop_lat, stop_lon, updated_at) VALUES(?,?,?,?,?,?)'
      ).bind(
        Number(s.stop_id),
        String(s.stop_name || ''),
        s.stop_desc ? String(s.stop_desc) : null,
        Number(s.stop_lat),
        Number(s.stop_lon),
        nowSec
      )
    );

    for (let i = 0; i < stmts.length; i += 50) {
      await env.DB.batch(stmts.slice(i, i + 50));
    }

    return { count: stopsList.length };
  } catch (err: any) {
    return { count: 0, error: String(err?.message) };
  }
}

export async function saveTransit(env: Env): Promise<void> {
  const t = await transit(env);
  await env.DB.prepare(
    'INSERT INTO transit_state(id,available,source,checked_at,note,estimate_minutes,vehicle_count,routes_summary) VALUES(1,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET available=excluded.available,source=excluded.source,checked_at=excluded.checked_at,note=excluded.note,estimate_minutes=excluded.estimate_minutes,vehicle_count=excluded.vehicle_count,routes_summary=excluded.routes_summary'
  )
    .bind(
      Number(t.available),
      t.source,
      t.checkedAt,
      t.note,
      t.estimateMinutes,
      t.liveVehicleCount ?? null,
      (t as any).routesSummary ?? null
    )
    .run();

  try {
    const countRow = await env.DB.prepare('SELECT count(*) as cnt FROM tranzy_stops').first<{ cnt: number }>();
    if (!countRow || countRow.cnt < 30) {
      await syncTranzyStops(env);
    }
  } catch {
    // Non-fatal if stops sync fails
  }
}

