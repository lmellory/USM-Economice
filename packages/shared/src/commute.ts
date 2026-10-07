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
      if (leg.route_id != null && v.route_id === leg.route_id) return true;
      if (leg.route_short_name && String(v.label || '').includes(leg.route_short_name)) return true;
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
