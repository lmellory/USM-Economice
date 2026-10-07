import { describe, expect, it } from 'vitest';
import {
  calculateCommuteOption,
  calculateCommuteOptionsForDestination,
  calculateLegWaitTime,
  CommuteLeg,
  CommuteOption,
  haversineDistanceMeters,
  TransitStop,
  TripStopTime,
  VehiclePosition,
} from '../src/index.js';

describe('Tranzy Commute Calculations', () => {
  const baseNowMs = 1700000000000; // Fixed timestamp for reproducibility
  const baseNowMin = 8 * 60 + 15; // 08:15 in the morning

  const stopCuzaVoda: TransitStop = {
    stop_id: 101,
    stop_name: 'Dacia / Cuza Vodă',
    stop_lat: 46.9825,
    stop_lon: 28.865,
  };

  const stopStefan: TransitStop = {
    stop_id: 202,
    stop_name: 'Parcul Ștefan cel Mare',
    stop_lat: 47.0245,
    stop_lon: 28.8322,
  };

  const stopUSM: TransitStop = {
    stop_id: 303,
    stop_name: 'Universitatea de Stat',
    stop_lat: 47.0185,
    stop_lon: 28.824,
  };

  const stopSportIsmail: TransitStop = {
    stop_id: 404,
    stop_name: 'Complexul Sportiv USM (Ismail 1)',
    stop_lat: 47.012,
    stop_lon: 28.847,
  };

  const stops = [stopCuzaVoda, stopStefan, stopUSM, stopSportIsmail];

  // 1. Тест: Машина прямо перед остановкой
  it('1. should calculate immediate ETA when vehicle is right before stop (distance <= 200m)', () => {
    const leg: CommuteLeg = {
      mode: 'fixed_route',
      route_id: 2,
      route_short_name: '2',
      board_stop_id: 101,
      board_stop_name: 'Dacia / Cuza Vodă',
      alight_stop_id: 202,
      alight_stop_name: 'Parcul Ștefan cel Mare',
    };

    const liveVehicle: VehiclePosition = {
      id: 'veh-2-1',
      label: '2024',
      route_id: 2,
      latitude: 46.9826, // ~15m from stopCuzaVoda
      longitude: 28.8651,
      timestamp: new Date(baseNowMs - 15000).toISOString(), // 15s ago
    };

    const res = calculateLegWaitTime(leg, 0, baseNowMin, {
      nowMs: baseNowMs,
      nowMinuteOfDay: baseNowMin,
      vehicles: [liveVehicle],
      stops,
    });

    expect(res.source).toBe('live');
    expect(res.waitingMinutes).toBe(1);
    expect(res.chosenRouteName).toBe('2');
  });

  // 2. Тест: Машина далеко
  it('2. should estimate realistic wait time when vehicle is far from stop', () => {
    const leg: CommuteLeg = {
      mode: 'fixed_route',
      route_id: 2,
      route_short_name: '2',
      board_stop_id: 101,
      board_stop_name: 'Dacia / Cuza Vodă',
      alight_stop_id: 202,
      alight_stop_name: 'Parcul Ștefan cel Mare',
    };

    const farVehicle: VehiclePosition = {
      id: 'veh-2-far',
      label: '2025',
      route_id: 2,
      latitude: 46.96, // ~2.5 km away
      longitude: 28.865,
      timestamp: new Date(baseNowMs - 20000).toISOString(),
    };

    const res = calculateLegWaitTime(leg, 0, baseNowMin, {
      nowMs: baseNowMs,
      nowMinuteOfDay: baseNowMin,
      vehicles: [farVehicle],
      stops,
    });

    expect(res.source).toBe('live');
    expect(res.waitingMinutes).toBeGreaterThanOrEqual(5);
    expect(res.waitingMinutes).toBeLessThanOrEqual(15);
  });

  // 3. Тест: Устаревшая позиция (> 2 минут)
  it('3. should ignore vehicles with stale GPS positions (> 2 minutes old)', () => {
    const leg: CommuteLeg = {
      mode: 'fixed_route',
      route_id: 2,
      route_short_name: '2',
      board_stop_id: 101,
      board_stop_name: 'Dacia / Cuza Vodă',
      alight_stop_id: 202,
      alight_stop_name: 'Parcul Ștefan cel Mare',
    };

    const staleVehicle: VehiclePosition = {
      id: 'veh-stale',
      label: '2001',
      route_id: 2,
      latitude: 46.9825,
      longitude: 28.865,
      timestamp: new Date(baseNowMs - 150000).toISOString(), // 2.5 min ago (>120s)
    };

    const res = calculateLegWaitTime(leg, 0, baseNowMin, {
      nowMs: baseNowMs,
      nowMinuteOfDay: baseNowMin,
      vehicles: [staleVehicle],
      stops,
    });

    // Stale vehicle must be discarded -> fallback to schedule or rough
    expect(res.source).not.toBe('live');
    expect(res.waitingMinutes).toBe(6); // Default fallback wait
  });

  // 4. Тест: Рейс без данных
  it('4. should gracefully fallback to rough/schedule estimate when no vehicle data is available', () => {
    const leg: CommuteLeg = {
      mode: 'fixed_route',
      route_id: 4,
      route_short_name: '4',
      board_stop_id: 101,
      board_stop_name: 'Dacia / Cuza Vodă',
      alight_stop_id: 303,
      alight_stop_name: 'Universitatea de Stat',
    };

    const res = calculateLegWaitTime(leg, 0, baseNowMin, {
      nowMs: baseNowMs,
      nowMinuteOfDay: baseNowMin,
      vehicles: [], // No live data
      stops,
    });

    expect(res.source).toBe('rough');
    expect(res.travelMinutes).toBe(14);
    expect(res.waitingMinutes).toBe(6);
  });

  // 5. Тест: Пересадка с ожиданием (Вариант А)
  it('5. should calculate transfer with buffer and waiting at transfer stop', () => {
    const optionA: CommuteOption = {
      id: 'univ-a',
      name: 'Университет · А',
      destination: 'university',
      position: 1,
      enabled: true,
      is_configured: true,
      walk_before_minutes: 7,
      walk_after_minutes: 5,
      legs: [
        {
          mode: 'fixed_route',
          route_id: 2,
          route_short_name: '2',
          board_stop_id: 101,
          board_stop_name: 'Dacia / Cuza Vodă',
          alight_stop_id: 202,
          alight_stop_name: 'Parcul Ștefan cel Mare',
        },
        {
          mode: 'any_trolleybus',
          board_stop_id: 202,
          board_stop_name: 'Parcul Ștefan cel Mare',
          alight_stop_id: 303,
          alight_stop_name: 'Universitatea de Stat',
        },
      ],
    };

    const res = calculateCommuteOption(optionA, '09:45', {
      nowMs: baseNowMs,
      nowMinuteOfDay: baseNowMin, // 08:15
      vehicles: [],
      stops,
    });

    expect(res.isConfigured).toBe(true);
    expect(res.legs).toHaveLength(2);
    expect(res.walkBeforeMinutes).toBe(7);
    expect(res.walkAfterMinutes).toBe(5);
    expect(res.totalDurationMinutes).toBeGreaterThan(30);
    expect(res.leaveInMinutes).toBeGreaterThanOrEqual(0);
  });

  // 6. Тест: Пересадка, где подходят несколько маршрутов (any_trolleybus) и выбирается ближайший
  it('6. should select the earliest arriving vehicle among candidate trolleybus routes for transfer', () => {
    const legTransfer: CommuteLeg = {
      mode: 'any_trolleybus',
      board_stop_id: 202,
      board_stop_name: 'Parcul Ștefan cel Mare',
      alight_stop_id: 303,
      alight_stop_name: 'Universitatea de Stat',
    };

    // Passenger arrives at Parcul Stefan cel Mare at 08:40 (8 * 60 + 40 = 520)
    const passengerArrival = 8 * 60 + 40;

    // Vehicle for route 10 arrives at 08:48 (8 min wait)
    const veh10: VehiclePosition = {
      id: 'v-10',
      label: '1001',
      route_id: 10,
      vehicle_type: 11,
      latitude: 47.035, // ~1.5 km
      longitude: 28.832,
      timestamp: new Date(baseNowMs - 30000).toISOString(),
    };

    // Vehicle for route 22 arrives at 08:43 (3 min wait -> closer!)
    const veh22: VehiclePosition = {
      id: 'v-22',
      label: '2201',
      route_id: 22,
      vehicle_type: 11,
      latitude: 47.026, // ~200m from Parcul Stefan cel Mare
      longitude: 28.8322,
      timestamp: new Date(baseNowMs - 20000).toISOString(),
    };

    const res = calculateLegWaitTime(legTransfer, 1, passengerArrival, {
      nowMs: baseNowMs,
      nowMinuteOfDay: baseNowMin,
      vehicles: [veh10, veh22],
      stops,
      candidateTrolleyRoutes: [
        { route_id: 10, route_short_name: '10' },
        { route_id: 22, route_short_name: '22' },
      ],
    });

    expect(res.source).toBe('live');
    expect(res.chosenRouteName).toBe('22'); // Earliest trolleybus chosen
    expect(res.vehicleLabel).toBe('2201');
  });

  // 7. Тест: Поездка на физкультуру по маршруту 17
  it('7. should calculate sports complex trip via route 17 with walk to Cuza Voda', () => {
    const sportsOption: CommuteOption = {
      id: 'sports-17',
      name: 'Физкультура',
      destination: 'sports',
      position: 1,
      enabled: true,
      is_configured: true,
      walk_before_minutes: 12, // Road to Cuza Vodă
      walk_after_minutes: 3,
      legs: [
        {
          mode: 'fixed_route',
          route_id: 17,
          route_short_name: '17',
          board_stop_id: 101,
          board_stop_name: 'Strada Cuza Vodă',
          alight_stop_id: 404,
          alight_stop_name: 'Complexul Sportiv USM',
        },
      ],
    };

    const live17: VehiclePosition = {
      id: 'v-17-live',
      label: '1705',
      route_id: 17,
      latitude: 46.985,
      longitude: 28.865,
      timestamp: new Date(baseNowMs - 10000).toISOString(),
    };

    const optionsRes = calculateCommuteOptionsForDestination(
      [sportsOption],
      'sports',
      '09:45',
      {
        nowMs: baseNowMs,
        nowMinuteOfDay: baseNowMin,
        vehicles: [live17],
        stops,
      }
    );

    expect(optionsRes).toHaveLength(1);
    const item = optionsRes[0];
    expect(item.name).toBe('Физкультура');
    expect(item.destination).toBe('sports');
    expect(item.walkBeforeMinutes).toBe(12);
    expect(item.walkAfterMinutes).toBe(3);
    expect(item.legs[0].chosenRouteName).toBe('17');
    expect(item.isRecommended).toBe(true);
  });
});
