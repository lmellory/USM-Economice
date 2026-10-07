import {
  CommuteLeg,
  CommuteLegResult,
  CommuteOption,
  CommuteOptionResult,
  DestinationType,
  EstimateSource,
  TransitStop,
  TripStopTime,
  VehiclePosition,
  TrackedTrolleySummary,
  LiveTrackedVehicle,
} from './types.js';

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function parseTimeToMinutes(timeStr?: string | null): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

export function formatMinutesToTime(totalMin: number): string {
  const normalized = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Official GTFS route_id mapping for Chișinău RTEC (Regia Transport Electric Chișinău) from Tranzy OpenData.
 */
export const CHISINAU_RTEC_ROUTE_MAP: Record<string, number> = {
  '1': 13,
  '2': 9,
  '3': 12,
  '4': 20,
  '5': 3,
  '7': 14,
  '8': 7,
  '9': 15,
  '10': 4,
  '12': 5,
  '13': 11,
  '16': 32,
  '17': 16,
  '20': 27,
  '21': 10,
  '22': 8,
  '23': 6,
  '24': 28,
  '25': 17,
  '26': 18,
  '27': 19,
  '28': 33,
  '29': 21,
  '30': 22,
  '32': 24,
  '33': 37,
  '34': 25,
  '35': 26,
  '36': 29,
  '37': 30,
  '38': 31,
};

export const CHISINAU_RTEC_ROUTE_ID_TO_NAME: Record<number, string> = {
  9: '2',
  20: '4',
  16: '17',
  8: '22',
  4: '10',
  28: '24',
  13: '1',
  12: '3',
  3: '5',
  14: '7',
  7: '8',
  15: '9',
  5: '12',
  11: '13',
  32: '16',
  27: '20',
  10: '21',
  6: '23',
  17: '25',
  18: '26',
  19: '27',
  33: '28',
  21: '29',
  22: '30',
  24: '32',
  37: '33',
  25: '34',
  26: '35',
  29: '36',
  30: '37',
  31: '38',
};

export interface CommuteCalculationContext {
  nowMs: number;
  nowMinuteOfDay: number;
  vehicles: VehiclePosition[];
  stops?: TransitStop[];
  stopTimes?: TripStopTime[];
  candidateTrolleyRoutes?: { route_id: number; route_short_name: string }[];
  defaultCommuteMinutes?: number;
}

/**
 * Calculates live wait time and ride time for a single leg of travel.
 */
export function calculateLegWaitTime(
  leg: CommuteLeg,
  legIndex: number,
  passengerReadyMinute: number,
  context: CommuteCalculationContext
): CommuteLegResult {
  const defaultFallbackRide = 14; // minutes
  const defaultFallbackWait = 6; // minutes
  const boardName = leg.board_stop_name || `Остановка #${leg.board_stop_id}`;
  const alightName = leg.alight_stop_name || `Остановка #${leg.alight_stop_id}`;
  const nowMs = context.nowMs;

  // 1. Filter live vehicles matching this leg:
  // - Position must not be older than 2 minutes (120 000 ms)
  const validVehicles = (context.vehicles || []).filter((v) => {
    const ageMs = nowMs - Date.parse(v.timestamp);
    if (isNaN(ageMs) || ageMs > 120_000 || ageMs < -60_000) {
      return false; // Stale GPS or invalid timestamp
    }
    if (leg.mode === 'fixed_route') {
      const canonicalId = leg.route_short_name ? CHISINAU_RTEC_ROUTE_MAP[leg.route_short_name] : undefined;
      if (canonicalId != null && v.route_id === canonicalId) return true;
      if (leg.route_id != null && v.route_id === leg.route_id) return true;
      if (
        leg.route_short_name &&
        context.candidateTrolleyRoutes?.some(
          (r) => r.route_id === v.route_id && r.route_short_name === leg.route_short_name
        )
      ) {
        return true;
      }
      if (leg.route_short_name && v.route_id === Number(leg.route_short_name)) return true;
      if (
        leg.route_short_name &&
        (v.label === leg.route_short_name || v.label === `TR-${leg.route_short_name}`)
      ) {
        return true;
      }
      return false;
    }
    if (leg.mode === 'any_trolleybus') {
      // Must be trolleybus (type 11) or in candidate trolleybus routes
      if (v.vehicle_type === 11) return true;
      if (context.candidateTrolleyRoutes?.some((r) => r.route_id === v.route_id)) return true;
      return false;
    }
    return false;
  });

  // 2. Schedule lookup for travel duration between board and alight
  let scheduledRideMinutes: number | null = null;
  const stopTimes = context.stopTimes || [];
  if (stopTimes.length > 0) {
    const boardEntries = stopTimes.filter((st) => st.stop_id === leg.board_stop_id);
    for (const b of boardEntries) {
      const a = stopTimes.find(
        (st) => st.trip_id === b.trip_id && st.stop_id === leg.alight_stop_id
      );
      if (a && a.stop_sequence > b.stop_sequence) {
        const diff = parseTimeToMinutes(a.arrival_time) - parseTimeToMinutes(b.arrival_time);
        if (diff > 0 && diff < 120) {
          scheduledRideMinutes = diff;
          break;
        }
      }
    }
  }

  const travelMinutes = scheduledRideMinutes ?? defaultFallbackRide;

  // 3. If live vehicles exist, find the closest one arriving at or after passengerReadyMinute
  type CandidateArrival = {
    vehicle: VehiclePosition;
    etaMinutesFromNow: number;
    etaMinuteOfDay: number;
    source: EstimateSource;
    routeName: string;
  };

  const candidates: CandidateArrival[] = [];

  for (const v of validVehicles) {
    let etaFromNow: number | null = null;
    let source: EstimateSource = 'live';

    // Trip stop_times matching
    if (v.trip_id && stopTimes.length > 0) {
      const tripStops = stopTimes
        .filter((st) => st.trip_id === v.trip_id)
        .sort((a, b) => a.stop_sequence - b.stop_sequence);

      const boardSt = tripStops.find((st) => st.stop_id === leg.board_stop_id);
      if (boardSt) {
        // Find vehicle's current stop sequence
        let curSeq = 0;
        let minDistance = Infinity;

        if (context.stops && context.stops.length > 0) {
          for (const ts of tripStops) {
            const stopInfo = context.stops.find((s) => s.stop_id === ts.stop_id);
            if (stopInfo) {
              const d = haversineDistanceMeters(
                v.latitude,
                v.longitude,
                stopInfo.stop_lat,
                stopInfo.stop_lon
              );
              if (d < minDistance) {
                minDistance = d;
                curSeq = ts.stop_sequence;
              }
            }
          }
        }

        if (curSeq > 0) {
          if (curSeq > boardSt.stop_sequence) {
            // Already passed board stop on this trip
            continue;
          }
          const curSt = tripStops.find((st) => st.stop_sequence === curSeq);
          if (curSt && curSt.arrival_time && boardSt.arrival_time) {
            const delta =
              parseTimeToMinutes(boardSt.arrival_time) - parseTimeToMinutes(curSt.arrival_time);
            if (delta >= 0) {
              etaFromNow = Math.max(0, delta);
            }
          }
          // If no delta or delta 0 with remaining stops, use 2 min per stop
          if (etaFromNow === null) {
            const stopsLeft = Math.max(0, boardSt.stop_sequence - curSeq);
            etaFromNow = stopsLeft * 2;
            source = 'rough';
          }
        }
      }
    }

    // Fallback GPS distance estimate if trip_id wasn't in stop_times but board stop coords exist
    if (etaFromNow === null && context.stops) {
      const boardStop = context.stops.find((s) => s.stop_id === leg.board_stop_id);
      if (boardStop) {
        const distMeters = haversineDistanceMeters(
          v.latitude,
          v.longitude,
          boardStop.stop_lat,
          boardStop.stop_lon
        );
        // Vehicle moving towards stop at ~20 km/h (~333 m/min)
        if (distMeters <= 200) {
          etaFromNow = 1;
        } else if (distMeters <= 5000) {
          etaFromNow = Math.max(1, Math.round(distMeters / 350));
          source = 'live';
        }
      }
    }

    if (etaFromNow !== null) {
      const etaMinuteOfDay = context.nowMinuteOfDay + etaFromNow;
      // Route name: either short name from context or fallback
      let routeName = leg.route_short_name || '';
      if (!routeName && context.candidateTrolleyRoutes) {
        const found = context.candidateTrolleyRoutes.find((r) => r.route_id === v.route_id);
        if (found) routeName = found.route_short_name;
      }
      if (!routeName) routeName = String(v.route_id || 'троллейбус');

      candidates.push({
        vehicle: v,
        etaMinutesFromNow: etaFromNow,
        etaMinuteOfDay,
        source,
        routeName,
      });
    }
  }

  // Sort candidates by arrival time at boarding stop
  candidates.sort((a, b) => a.etaMinuteOfDay - b.etaMinuteOfDay);

  const vehiclesOnLineCount = validVehicles.length;

  // Calculate distance of valid vehicles to the boarding stop
  const boardStop = context.stops?.find((s) => s.stop_id === leg.board_stop_id);
  let nearbyVehiclesCount = 0;
  let minBoardDist = Infinity;

  if (boardStop) {
    for (const v of validVehicles) {
      const d = haversineDistanceMeters(
        v.latitude,
        v.longitude,
        boardStop.stop_lat,
        boardStop.stop_lon
      );
      if (d < minBoardDist) {
        minBoardDist = d;
      }
      if (d <= 2500) {
        nearbyVehiclesCount++;
      }
    }
  }

  // Pick vehicle that arrives at or after passengerReadyMinute
  // (or closest one if all are slightly early but passenger is already on the way)
  const chosen =
    candidates.find((c) => c.etaMinuteOfDay >= passengerReadyMinute) || candidates[0];

  if (chosen) {
    const waitMin = Math.max(0, chosen.etaMinuteOfDay - passengerReadyMinute);
    return {
      legIndex,
      mode: leg.mode,
      chosenRouteName: chosen.routeName,
      boardStopName: boardName,
      alightStopName: alightName,
      waitingMinutes: waitMin,
      travelMinutes,
      firstVehicleEtaMinutes: chosen.etaMinutesFromNow,
      vehicleLabel: chosen.vehicle.label,
      closestVehicleDistanceMeters: minBoardDist < Infinity ? Math.round(minBoardDist) : undefined,
      vehiclesOnLineCount,
      nearbyVehiclesCount,
      source: chosen.source,
    };
  }

  // 4. Fallback if no live GPS vehicles found
  const fallbackRouteName =
    leg.route_short_name || (leg.mode === 'any_trolleybus' ? 'любой' : '2');
  const source: EstimateSource = scheduledRideMinutes ? 'schedule' : 'rough';

  return {
    legIndex,
    mode: leg.mode,
    chosenRouteName: fallbackRouteName,
    boardStopName: boardName,
    alightStopName: alightName,
    waitingMinutes: defaultFallbackWait,
    travelMinutes,
    vehiclesOnLineCount: 0,
    nearbyVehiclesCount: 0,
    source,
  };
}

/**
 * Calculates a complete commute option (including multiple legs, walking, transfer buffer).
 */
export function calculateCommuteOption(
  option: CommuteOption,
  targetClassStartStr: string | null,
  context: CommuteCalculationContext
): CommuteOptionResult {
  const walkBefore = option.walk_before_minutes ?? 7;
  const walkAfter = option.walk_after_minutes ?? 5;
  const defaultTotal = context.defaultCommuteMinutes ?? 30;

  if (!option.is_configured || !option.legs || option.legs.length === 0) {
    const arrivalMin = context.nowMinuteOfDay + defaultTotal;
    return {
      id: option.id,
      name: option.name,
      destination: option.destination,
      isConfigured: false,
      totalDurationMinutes: defaultTotal,
      walkBeforeMinutes: walkBefore,
      walkAfterMinutes: walkAfter,
      totalWaitMinutes: 0,
      totalRideMinutes: defaultTotal - walkBefore - walkAfter,
      leaveInMinutes: 0,
      arrivalEstimated: formatMinutesToTime(arrivalMin),
      source: 'rough',
      sourceLabel: 'примерно',
      summaryNote: 'Маршрут не настроен. Настрой остановки в параметрах дороги.',
      legs: [],
    };
  }

  const legResults: CommuteLegResult[] = [];
  let currentMinuteOfDay = context.nowMinuteOfDay + walkBefore;
  let totalWait = 0;
  let totalRide = 0;
  let optionSource: EstimateSource = 'schedule';

  for (let i = 0; i < option.legs.length; i++) {
    const leg = option.legs[i];
    // If transferring (leg 2+), add 1 min transfer buffer before passenger is ready to board
    if (i > 0) {
      currentMinuteOfDay += 1;
    }

    const legRes = calculateLegWaitTime(leg, i, currentMinuteOfDay, context);
    legResults.push(legRes);

    totalWait += legRes.waitingMinutes;
    totalRide += legRes.travelMinutes;
    currentMinuteOfDay += legRes.waitingMinutes + legRes.travelMinutes;

    if (legRes.source === 'live') {
      optionSource = 'live';
    } else if (legRes.source === 'rough' && optionSource !== 'live') {
      optionSource = 'rough';
    }
  }

  const totalDurationMinutes = walkBefore + totalWait + totalRide + walkAfter;
  const targetClassMin = targetClassStartStr ? parseTimeToMinutes(targetClassStartStr) : null;

  let leaveInMinutes = 0;
  if (targetClassMin != null) {
    // Arrival target is 10 minutes before class
    const targetArrivalMin = targetClassMin - 10;
    const departureMin = targetArrivalMin - totalDurationMinutes;
    leaveInMinutes = Math.max(0, departureMin - context.nowMinuteOfDay);
  }

  const estimatedArrivalMin = context.nowMinuteOfDay + leaveInMinutes + totalDurationMinutes;

  const sourceLabel =
    optionSource === 'live' ? 'по GPS' : optionSource === 'schedule' ? 'по расписанию' : 'примерно';

  const firstLeg = legResults[0];

  return {
    id: option.id,
    name: option.name,
    destination: option.destination,
    isConfigured: true,
    totalDurationMinutes,
    walkBeforeMinutes: walkBefore,
    walkAfterMinutes: walkAfter,
    totalWaitMinutes: totalWait,
    totalRideMinutes: totalRide,
    leaveInMinutes,
    arrivalEstimated: formatMinutesToTime(estimatedArrivalMin),
    source: optionSource,
    sourceLabel,
    legs: legResults,
    vehiclesOnLineCount: firstLeg ? firstLeg.vehiclesOnLineCount : 0,
    nearbyVehiclesCount: firstLeg ? firstLeg.nearbyVehiclesCount : 0,
    closestVehicleDistanceMeters: firstLeg?.closestVehicleDistanceMeters,
    closestVehicleEtaMinutes: firstLeg?.firstVehicleEtaMinutes,
    closestVehicleLabel: firstLeg?.vehicleLabel,
  };
}

/**
 * Calculates commute options for a given destination and recommends the best option.
 */
export function calculateCommuteOptionsForDestination(
  options: CommuteOption[],
  destination: DestinationType,
  targetClassStartStr: string | null,
  context: CommuteCalculationContext
): CommuteOptionResult[] {
  const filtered = options.filter((o) => o.destination === destination && o.enabled);
  if (!filtered.length) return [];

  const results = filtered.map((opt) =>
    calculateCommuteOption(opt, targetClassStartStr, context)
  );

  // Recommend configured option with lowest total duration (or earliest arrival)
  let bestIdx = -1;
  let minDuration = Infinity;

  results.forEach((r, idx) => {
    if (r.isConfigured && r.totalDurationMinutes < minDuration) {
      minDuration = r.totalDurationMinutes;
      bestIdx = idx;
    }
  });

  if (bestIdx >= 0) {
    results[bestIdx].isRecommended = true;
  } else if (results.length > 0) {
    results[0].isRecommended = true;
  }

  return results;
}

/**
 * Summarizes real-time status of user-relevant trolleybuses (e.g. Route 2, 17, 4, 22).
 * Answers the user questions: "how many on duty/line?" and "how many near the marker/stop?"
 */
export function summarizeTrackedTrolleys(
  options: CommuteOption[],
  context: CommuteCalculationContext
): TrackedTrolleySummary[] {
  const baseTracked = [
    { route_short_name: '2', destination: 'university' as DestinationType, label: '№2 до USM' },
    { route_short_name: '17', destination: 'sports' as DestinationType, label: '№17 Спорт' },
    { route_short_name: '4', destination: 'university' as DestinationType, label: '№4 Центр' },
    { route_short_name: '22', destination: 'university' as DestinationType, label: '№22 Дачия' },
  ];

  // Include any extra routes configured in user's commute options
  for (const opt of options) {
    for (const leg of opt.legs || []) {
      if (
        leg.route_short_name &&
        !baseTracked.some((b) => b.route_short_name === leg.route_short_name)
      ) {
        baseTracked.push({
          route_short_name: leg.route_short_name,
          destination: opt.destination,
          label: `№${leg.route_short_name}`,
        });
      }
    }
  }

  const nowMs = context.nowMs;
  const validVehicles = (context.vehicles || []).filter((v) => {
    const ageMs = nowMs - Date.parse(v.timestamp);
    return !isNaN(ageMs) && ageMs <= 180_000 && ageMs >= -60_000;
  });

  const results: TrackedTrolleySummary[] = [];

  for (const item of baseTracked) {
    const canonicalId = CHISINAU_RTEC_ROUTE_MAP[item.route_short_name];
    const routeVehicles = validVehicles.filter((v) => {
      if (canonicalId != null && v.route_id === canonicalId) return true;
      if (
        context.candidateTrolleyRoutes?.some(
          (r) => r.route_id === v.route_id && r.route_short_name === item.route_short_name
        )
      ) {
        return true;
      }
      if (v.route_id === Number(item.route_short_name)) return true;
      if (v.label === item.route_short_name || v.label === `TR-${item.route_short_name}`) return true;
      return false;
    });

    // Reference boarding stop for this destination
    let boardStop = context.stops?.find((s) => s.stop_id === 101); // Dacia / Cuza Vodă default
    const matchingOption = options.find((o) => o.destination === item.destination);
    if (matchingOption?.legs?.[0]?.board_stop_id) {
      const found = context.stops?.find((s) => s.stop_id === matchingOption.legs[0].board_stop_id);
      if (found) boardStop = found;
    }

    let nearbyCount = 0;
    let minDistance = Infinity;
    let closestVeh: VehiclePosition | undefined;

    if (boardStop) {
      for (const v of routeVehicles) {
        const d = haversineDistanceMeters(
          v.latitude,
          v.longitude,
          boardStop.stop_lat,
          boardStop.stop_lon
        );
        if (d < minDistance) {
          minDistance = d;
          closestVeh = v;
        }
        if (d <= 2500) {
          nearbyCount++;
        }
      }
    }

    let etaMin: number | undefined;
    if (minDistance < Infinity) {
      if (minDistance <= 200) etaMin = 1;
      else if (minDistance <= 5000) etaMin = Math.max(1, Math.round(minDistance / 350));
    }

    results.push({
      route_short_name: item.route_short_name,
      destination: item.destination,
      label: item.label,
      vehiclesOnLineCount: routeVehicles.length,
      nearbyVehiclesCount: nearbyCount,
      closestDistanceMeters: minDistance < Infinity ? Math.round(minDistance) : undefined,
      closestEtaMinutes: etaMin,
      closestVehicleLabel: closestVeh?.label,
      boardStopName: boardStop?.stop_name || 'Cuza Vodă',
    });
  }

  return results;
}

/**
 * Extracts live vehicles matching the user's tracked routes for real-time map rendering.
 */
export function getLiveTrackedVehicles(
  options: CommuteOption[],
  context: CommuteCalculationContext
): LiveTrackedVehicle[] {
  const baseRoutes = ['2', '17', '4', '22', '10', '24'];

  for (const opt of options) {
    for (const leg of opt.legs || []) {
      if (leg.route_short_name && !baseRoutes.includes(leg.route_short_name)) {
        baseRoutes.push(leg.route_short_name);
      }
    }
  }

  const nowMs = context.nowMs;
  const validVehicles = (context.vehicles || []).filter((v) => {
    const ageMs = nowMs - Date.parse(v.timestamp);
    return !isNaN(ageMs) && ageMs <= 180_000 && ageMs >= -60_000;
  });

  const liveList: LiveTrackedVehicle[] = [];

  for (const v of validVehicles) {
    let matchedName: string | undefined;

    // Check canonical route id
    if (v.route_id != null && CHISINAU_RTEC_ROUTE_ID_TO_NAME[v.route_id]) {
      const name = CHISINAU_RTEC_ROUTE_ID_TO_NAME[v.route_id];
      if (baseRoutes.includes(name)) {
        matchedName = name;
      }
    }

    if (!matchedName && context.candidateTrolleyRoutes) {
      const found = context.candidateTrolleyRoutes.find((r) => r.route_id === v.route_id);
      if (found && baseRoutes.includes(found.route_short_name)) {
        matchedName = found.route_short_name;
      }
    }

    if (!matchedName) {
      for (const r of baseRoutes) {
        if (v.route_id === Number(r) || v.label === r || v.label === `TR-${r}`) {
          matchedName = r;
          break;
        }
      }
    }

    if (matchedName) {
      liveList.push({
        id: v.id,
        label: v.label,
        route_id: v.route_id,
        route_short_name: matchedName,
        latitude: v.latitude,
        longitude: v.longitude,
        speed: v.speed ?? 0,
        timestamp: v.timestamp,
      });
    }
  }

  return liveList;
}

