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

    return {
      available: true,
      source: `Tranzy OpenData${agencyName}`,
      checkedAt,
      note: 'Данные RTEC/PUA Кишинёва поступают в реальном времени.',
      route: null,
      estimateMinutes: 30,
      liveVehicleCount: list.length,
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
}
