import {
  CHISINAU_RTEC_ROUTE_MAP,
  CHISINAU_RTEC_ROUTE_ID_TO_NAME,
  calculateTrafficLevel,
  findNearestStop,
  formatMinutesToTime,
  haversineDistanceMeters,
  isWithinChisinauBounds,
  parseDurationSeconds,
  TransitStop,
  TripPlanResult,
  TripRouteOption,
  TripStep,
  VehiclePosition,
} from '@usm/shared';
import { fetchLiveVehicles } from './tranzy.js';
import { searchStops } from './commute.js';
import { json } from './homework.js';
import { Env } from './types.js';

const IN_MEMORY_CACHE = new Map<string, { expiresAt: number; data: TripPlanResult }>();

/**
 * Checks and increments rate limit in D1: maximum 30 requests per hour per user.
 */
export async function checkTripPlanRateLimit(
  db: D1Database,
  userId: string,
  limitPerHour = 30
): Promise<{ allowed: boolean; remaining: number }> {
  const windowHour = Math.floor(Date.now() / 3600000);

  // Periodically clean up old windows (> 24 hours)
  try {
    await db
      .prepare('DELETE FROM trip_plan_rate_limit WHERE window_hour < ?')
      .bind(windowHour - 24)
      .run();
  } catch {
    // Non-fatal cleanup
  }

  const row = await db
    .prepare('SELECT request_count FROM trip_plan_rate_limit WHERE user_id = ? AND window_hour = ?')
    .bind(userId, windowHour)
    .first<{ request_count: number }>();

  const currentCount = row?.request_count ?? 0;
  if (currentCount >= limitPerHour) {
    return { allowed: false, remaining: 0 };
  }

  await db
    .prepare(
      'INSERT INTO trip_plan_rate_limit(user_id, window_hour, request_count) VALUES(?, ?, 1) ON CONFLICT(user_id, window_hour) DO UPDATE SET request_count = request_count + 1'
    )
    .bind(userId, windowHour)
    .run();

  return { allowed: true, remaining: limitPerHour - (currentCount + 1) };
}

function formatSecondsToDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

/**
 * Estimates arrival of nearest live trolleybus for a given route to the departure stop.
 */
function estimateNextVehicleForStep(
  routeShortName: string,
  stopName: string,
  stopLat: number | undefined,
  stopLon: number | undefined,
  liveVehicles: VehiclePosition[],
  allStops: TransitStop[]
): {
  nextVehicleEtaMinutes?: number;
  nextVehicleDistanceMeters?: number;
  nextVehicleSource?: 'polyline' | 'approximate';
} {
  const canonicalRouteId = CHISINAU_RTEC_ROUTE_MAP[routeShortName];
  if (!canonicalRouteId && !routeShortName) {
    return {};
  }

  // Filter vehicles on this route
  const matching = liveVehicles.filter((v) => {
    if (canonicalRouteId && v.route_id === canonicalRouteId) return true;
    if (v.label === routeShortName || v.label === `TR-${routeShortName}`) return true;
    if (v.route_id === Number(routeShortName)) return true;
    return false;
  });

  if (matching.length === 0) {
    return {};
  }

  // Determine departure stop coordinates
  let targetLat = stopLat;
  let targetLon = stopLon;
  if (targetLat == null || targetLon == null) {
    const matchedStop = allStops.find((s) =>
      s.stop_name.toLowerCase().includes(stopName.toLowerCase().trim())
    );
    if (matchedStop) {
      targetLat = matchedStop.stop_lat;
      targetLon = matchedStop.stop_lon;
    }
  }

  if (targetLat == null || targetLon == null) {
    return {};
  }

  let minDistance = Infinity;
  let bestVehicle: VehiclePosition | null = null;

  for (const v of matching) {
    const d = haversineDistanceMeters(v.latitude, v.longitude, targetLat, targetLon);
    if (d < minDistance) {
      minDistance = d;
      bestVehicle = v;
    }
  }

  if (!bestVehicle || minDistance > 6000) {
    return {};
  }

  // Speed-adjusted ETA: minimum ~20 km/h (333 m/min) when moving, fallback 350 m/min
  const vehicleSpeed = bestVehicle.speed ?? 0;
  const speedMpm = vehicleSpeed > 3 ? (vehicleSpeed * 1000) / 60 : 333;
  const etaMin = Math.max(1, Math.round(minDistance / speedMpm));

  return {
    nextVehicleEtaMinutes: etaMin,
    nextVehicleDistanceMeters: Math.round(minDistance),
    nextVehicleSource: 'approximate',
  };
}

/**
 * Handles GET /api/trip/plan
 */
export async function handleTripPlan(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const url = new URL(request.url);

  const fromLatRaw = url.searchParams.get('fromLat');
  const fromLonRaw = url.searchParams.get('fromLon');
  const toLatRaw = url.searchParams.get('toLat');
  const toLonRaw = url.searchParams.get('toLon');

  if (!fromLatRaw || !fromLonRaw || !toLatRaw || !toLonRaw) {
    return json(
      { error: 'Параметры fromLat, fromLon, toLat, toLon обязательны.' },
      400
    );
  }

  const fromLat = parseFloat(fromLatRaw);
  const fromLon = parseFloat(fromLonRaw);
  const toLat = parseFloat(toLatRaw);
  const toLon = parseFloat(toLonRaw);

  if (
    !isWithinChisinauBounds(fromLat, fromLon) ||
    !isWithinChisinauBounds(toLat, toLon)
  ) {
    return json(
      {
        error:
          'Координаты должны быть внутри Кишинёва (широта 46.9–47.1, долгота 28.7–28.95).',
      },
      400
    );
  }

  // 1. Rate limiting check (30 requests/hour per user)
  const rateLimit = await checkTripPlanRateLimit(env.DB, userId, 30);
  if (!rateLimit.allowed) {
    return json(
      { error: 'Превышен лимит планирования поездок: не более 30 запросов в час.' },
      429
    );
  }

  // 2. 2-minute Cache Check (rounded to 4 decimal places)
  const cacheKeyStr = `${fromLat.toFixed(4)}_${fromLon.toFixed(4)}_${toLat.toFixed(4)}_${toLon.toFixed(4)}`;
  const nowMs = Date.now();

  const memCached = IN_MEMORY_CACHE.get(cacheKeyStr);
  if (memCached && memCached.expiresAt > nowMs) {
    return json(memCached.data);
  }

  // Also check Cloudflare Cache API if available
  const cacheReq = new Request(`https://cache.local/trip-plan/${cacheKeyStr}`);
  let edgeCache: any = null;
  try {
    edgeCache = (caches as any).default;
    const match = await edgeCache.match(cacheReq);
    if (match) {
      const cachedJson = await match.json();
      return json(cachedJson);
    }
  } catch {
    // Cache miss / local mock
  }

  // 3. Load stops and live vehicles
  const [allStops, liveData] = await Promise.all([
    searchStops(env, '', 1500),
    fetchLiveVehicles(env),
  ]);

  const fromNearest = findNearestStop(fromLat, fromLon, allStops, 400);
  const toNearest = findNearestStop(toLat, toLon, allStops, 400);

  // 4. Check Google Maps Server Key
  if (!env.GOOGLE_MAPS_SERVER_KEY) {
    const fallbackResult: TripPlanResult = {
      from: { lat: fromLat, lon: fromLon, nearestStop: fromNearest?.stop || null },
      to: { lat: toLat, lon: toLon, nearestStop: toNearest?.stop || null },
      routes: [],
      source: 'tranzy_only',
      notice: 'Серверный ключ Google Maps не настроен.',
    };
    return json(fallbackResult);
  }

  // 5. Query Routes API in parallel: TRANSIT and DRIVE (TRAFFIC_AWARE)
  const routesApiUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';

  const transitPromise = fetch(routesApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.GOOGLE_MAPS_SERVER_KEY,
      'X-Goog-FieldMask':
        'routes.duration,routes.legs.steps.travelMode,routes.legs.steps.transitDetails,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: fromLat, longitude: fromLon } } },
      destination: { location: { latLng: { latitude: toLat, longitude: toLon } } },
      travelMode: 'TRANSIT',
      computeAlternativeRoutes: true,
      languageCode: 'ru',
    }),
    signal: AbortSignal.timeout(8000),
  });

  const drivePromise = fetch(routesApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.GOOGLE_MAPS_SERVER_KEY,
      'X-Goog-FieldMask': 'routes.duration,routes.staticDuration',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: fromLat, longitude: fromLon } } },
      destination: { location: { latLng: { latitude: toLat, longitude: toLon } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
    }),
    signal: AbortSignal.timeout(8000),
  });

  let transitResp: Response | null = null;
  let driveResp: Response | null = null;

  try {
    const results = await Promise.all([transitPromise, drivePromise]);
    transitResp = results[0];
    driveResp = results[1];
  } catch {
    // Network or timeout error
    const fallbackResult: TripPlanResult = {
      from: { lat: fromLat, lon: fromLon, nearestStop: fromNearest?.stop || null },
      to: { lat: toLat, lon: toLon, nearestStop: toNearest?.stop || null },
      routes: [],
      source: 'tranzy_only',
      notice: 'Google недоступен, показываю только позиции машин',
    };
    return json(fallbackResult);
  }

  if (!transitResp || !transitResp.ok) {
    const fallbackResult: TripPlanResult = {
      from: { lat: fromLat, lon: fromLon, nearestStop: fromNearest?.stop || null },
      to: { lat: toLat, lon: toLon, nearestStop: toNearest?.stop || null },
      routes: [],
      source: 'tranzy_only',
      notice: 'Google недоступен, показываю только позиции машин',
    };
    return json(fallbackResult);
  }

  let transitData: any;
  try {
    transitData = await transitResp.json();
  } catch {
    transitData = {};
  }

  // Parse Drive traffic data
  let trafficDurationSec: number | null = null;
  let trafficStaticDurationSec: number | null = null;

  if (driveResp && driveResp.ok) {
    try {
      const driveData: any = await driveResp.json();
      const driveRoute = driveData.routes?.[0];
      if (driveRoute) {
        trafficDurationSec = parseDurationSeconds(driveRoute.duration);
        trafficStaticDurationSec = parseDurationSeconds(driveRoute.staticDuration);
      }
    } catch {
      // Ignore traffic parse error
    }
  }

  const trafficInfo = calculateTrafficLevel(
    trafficDurationSec || 0,
    trafficStaticDurationSec
  );

  // Time calculations
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

  const rawRoutes: any[] = Array.isArray(transitData.routes) ? transitData.routes : [];
  const processedRoutes: TripRouteOption[] = [];

  for (let rIdx = 0; rIdx < rawRoutes.length; rIdx++) {
    const r = rawRoutes[rIdx];
    const totalDurationSec = parseDurationSeconds(r.duration) || 0;
    const arrivalMinuteOfDay = nowMinuteOfDay + Math.round(totalDurationSec / 60);

    const steps: TripStep[] = [];
    const legs = Array.isArray(r.legs) ? r.legs : [];

    for (const leg of legs) {
      const rawSteps = Array.isArray(leg.steps) ? leg.steps : [];
      for (const st of rawSteps) {
        if (st.travelMode === 'TRANSIT') {
          const td = st.transitDetails || {};
          const lineShort = td.transitLine?.nameShort || '';
          const vehicleType = td.transitLine?.vehicle?.type || 'TROLLEYBUS';
          const depStop = td.stopDetails?.departureStop?.name || '';
          const arrStop = td.stopDetails?.arrivalStop?.name || '';
          const depLat = td.stopDetails?.departureStop?.location?.latLng?.latitude;
          const depLon = td.stopDetails?.departureStop?.location?.latLng?.longitude;

          const tranzyRouteId = CHISINAU_RTEC_ROUTE_MAP[lineShort];
          const nextVeh = estimateNextVehicleForStep(
            lineShort,
            depStop,
            depLat,
            depLon,
            liveData.vehicles,
            allStops
          );

          steps.push({
            travelMode: 'TRANSIT',
            lineShortName: lineShort,
            vehicleType,
            departureStopName: depStop,
            arrivalStopName: arrStop,
            departureTime: td.localizedValues?.departureTime?.time?.text,
            arrivalTime: td.localizedValues?.arrivalTime?.time?.text,
            tranzyRouteId,
            nextVehicleEtaMinutes: nextVeh.nextVehicleEtaMinutes,
            nextVehicleDistanceMeters: nextVeh.nextVehicleDistanceMeters,
            nextVehicleSource: nextVeh.nextVehicleSource,
          });
        } else {
          // Walk step
          const walkSec = parseDurationSeconds(st.staticDuration || st.duration) || 120;
          steps.push({
            travelMode: 'WALK',
            durationSeconds: walkSec,
          });
        }
      }
    }

    processedRoutes.push({
      id: `route-${rIdx + 1}`,
      totalDurationSeconds: totalDurationSec,
      totalDurationFormatted: formatSecondsToDuration(totalDurationSec),
      arrivalTimeFormatted: formatMinutesToTime(arrivalMinuteOfDay),
      encodedPolyline: r.polyline?.encodedPolyline,
      steps,
      traffic: trafficInfo,
    });
  }

  const finalResult: TripPlanResult = {
    from: { lat: fromLat, lon: fromLon, nearestStop: fromNearest?.stop || null },
    to: { lat: toLat, lon: toLon, nearestStop: toNearest?.stop || null },
    routes: processedRoutes,
    source: processedRoutes.length > 0 ? 'google_and_tranzy' : 'tranzy_only',
    notice:
      processedRoutes.length === 0
        ? 'Прямых маршрутов транспорта не найдено.'
        : undefined,
  };

  // Cache in memory for 2 minutes
  IN_MEMORY_CACHE.set(cacheKeyStr, {
    expiresAt: nowMs + 120_000,
    data: finalResult,
  });

  // Cache in Edge Cache API for 120s
  if (edgeCache) {
    try {
      const respToCache = new Response(JSON.stringify(finalResult), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=120',
        },
      });
      await edgeCache.put(cacheReq, respToCache);
    } catch {
      // Edge cache warning ignored
    }
  }

  return json(finalResult);
}
