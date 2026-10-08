import { VehiclePosition } from '@usm/shared';
import { Env } from './types.js';

let cachedAgency: { id: string; name: string } | null = null;

export function getTranzyBaseUrl(env: Env): string {
  const vehiclesUrl = (
    env.TRANZY_VEHICLES_URL || 'https://api.tranzy.ai/v1/opendata/vehicles'
  ).trim();
  return vehiclesUrl.replace(/\/vehicles(?:\?.*)?$/, '');
}

/**
 * Resolves agency ID and agency name.
 * Throws a clear error if no matching Chisinau agency is found (does NOT fallback to list[0]).
 */
export async function getTranzyAgency(env: Env): Promise<{ id: string; name: string }> {
  if (env.TRANZY_AGENCY_ID?.trim()) {
    return { id: env.TRANZY_AGENCY_ID.trim(), name: '' };
  }

  if (cachedAgency) {
    return cachedAgency;
  }

  if (!env.TRANZY_API_KEY) {
    throw new Error('Секрет TRANZY_API_KEY не задан в Worker.');
  }

  const baseUrl = getTranzyBaseUrl(env);
  const agencyEndpoint = `${baseUrl}/agency`;

  const resp = await fetch(agencyEndpoint, {
    headers: { 'X-API-KEY': env.TRANZY_API_KEY },
    signal: AbortSignal.timeout(6000),
  });

  if (!resp.ok) {
    let reason = `HTTP ${resp.status}`;
    if (resp.status === 403) reason = 'HTTP 403 (доступ запрещён: неверный TRANZY_API_KEY)';
    else if (resp.status === 429) reason = 'HTTP 429 (превышен лимит запросов к Tranzy)';
    throw new Error(`Tranzy /agency ответил ${reason}.`);
  }

  const data: any = await resp.json();
  const list = Array.isArray(data) ? data : [];
  const matched = list.find(
    (a: any) =>
      String(a.agency_timezone || '')
        .toLowerCase()
        .includes('chisinau') ||
      /chisinau|chișinău|rtec|pua/i.test(String(a.agency_name || ''))
  );

  if (!matched) {
    throw new Error('Подходящее транспортное агентство Кишинёва (RTEC/PUA) не найдено в Tranzy OpenData.');
  }

  cachedAgency = {
    id: String(matched.agency_id),
    name: matched.agency_name ? ` (${matched.agency_name})` : '',
  };

  return cachedAgency;
}

/**
 * Returns unified request headers for Tranzy OpenData API.
 */
export async function getTranzyHeaders(env: Env): Promise<{
  headers: Record<string, string>;
  agencyName: string;
  agencyId: string;
}> {
  if (!env.TRANZY_API_KEY) {
    throw new Error('Секрет TRANZY_API_KEY не задан в Worker.');
  }

  const agency = await getTranzyAgency(env);
  const headers: Record<string, string> = {
    'X-API-KEY': env.TRANZY_API_KEY,
    'X-Agency-Id': agency.id,
  };

  return {
    headers,
    agencyName: agency.name,
    agencyId: agency.id,
  };
}

/**
 * Fetches real-time vehicle positions with 30-second edge cache.
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

  const cacheKey = new Request('https://cache.local/tranzy/vehicles');
  let cache: any = null;
  try {
    cache = (caches as any).default;
    const cachedResp = await cache.match(cacheKey);
    if (cachedResp) {
      const cachedData: any = await cachedResp.json();
      return {
        vehicles: cachedData.vehicles || [],
        available: true,
        source: cachedData.source || 'Tranzy OpenData (RTEC/PUA)',
      };
    }
  } catch {
    // Cache miss or unsupported
  }

  try {
    const { headers, agencyName } = await getTranzyHeaders(env);
    const baseUrl = getTranzyBaseUrl(env);
    const vehiclesUrl = `${baseUrl}/vehicles`;

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

    const result = {
      vehicles,
      available: true,
      source: `Tranzy OpenData${agencyName}`,
    };

    if (cache) {
      try {
        const cachePayload = new Response(JSON.stringify(result), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=30',
          },
        });
        await cache.put(cacheKey, cachePayload);
      } catch {
        // Cache put non-fatal
      }
    }

    return result;
  } catch (err: any) {
    return {
      vehicles: [],
      available: false,
      source: 'Tranzy OpenData',
      note: err instanceof Error ? err.message : 'Не удалось подключиться к Tranzy.',
    };
  }
}

/**
 * Fetches raw stops from Tranzy OpenData.
 */
export async function fetchTranzyStopsRaw(env: Env): Promise<any[]> {
  const { headers } = await getTranzyHeaders(env);
  const baseUrl = getTranzyBaseUrl(env);
  const stopsRes = await fetch(`${baseUrl}/stops`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (!stopsRes.ok) {
    throw new Error(`Tranzy /stops ответил HTTP ${stopsRes.status}`);
  }

  const stopsData: any = await stopsRes.json();
  return Array.isArray(stopsData) ? stopsData : (stopsData.data ?? []);
}

/**
 * Fetches raw routes from Tranzy OpenData.
 */
export async function fetchTranzyRoutesRaw(env: Env): Promise<any[]> {
  const { headers } = await getTranzyHeaders(env);
  const baseUrl = getTranzyBaseUrl(env);
  const routesRes = await fetch(`${baseUrl}/routes`, {
    headers,
    signal: AbortSignal.timeout(6000),
  });

  if (!routesRes.ok) {
    throw new Error(`Tranzy /routes ответил HTTP ${routesRes.status}`);
  }

  const routesData: any = await routesRes.json();
  return Array.isArray(routesData) ? routesData : (routesData.data ?? []);
}

export function resetTranzyAgencyCache(): void {
  cachedAgency = null;
}
