import { describe, expect, it } from 'vitest';
import {
  calculateMorningRoutine,
  calculateWeekParity,
  hm,
  localInstant,
  min,
  toChisinauDate,
  zonedIso,
} from '../src/index.js';

describe('calculateWeekParity', () => {
  it('calculates parity correctly from semester start', () => {
    // Semester starts 2026-09-01 (Tuesday of week 1). First week is odd.
    const start = '2026-09-01';

    // Same week (e.g. Wednesday 2026-09-02) -> odd
    expect(calculateWeekParity('2026-09-02', start, 'odd')).toBe('odd');

    // Next week (Monday 2026-09-07) -> even
    expect(calculateWeekParity('2026-09-07', start, 'odd')).toBe('even');

    // 2 weeks later (Wednesday 2026-09-16) -> odd
    expect(calculateWeekParity('2026-09-16', start, 'odd')).toBe('odd');
  });

  it('returns null if settings are incomplete', () => {
    expect(calculateWeekParity('2026-09-02', null, 'odd')).toBeNull();
    expect(calculateWeekParity('2026-09-02', '2026-09-01', null)).toBeNull();
  });
});

describe('calculateMorningRoutine', () => {
  const baseSettings = {
    sleep_hours: 8,
    sleep_latency: 15,
    wash_minutes: 15,
    breakfast_minutes: 20,
    get_ready_minutes: 15,
    travel_buffer: 10,
    travel_minutes: 35,
    english_duration: 60,
  };

  it('calculates routine for first online class (home)', () => {
    // Friday: 08:00 online English, 11:30 in-person Management
    const classes = [
      {
        day: 5,
        start: '08:00',
        end: '09:00',
        title: 'Английский с репетитором',
        place: 'Дистанционно (дома)',
        online: true,
      },
      {
        day: 5,
        start: '11:30',
        end: '13:00',
        title: 'Менеджмент',
        place: '145 · Центральный корпус',
      },
    ];

    const routine = calculateMorningRoutine(classes, baseSettings);
    expect(routine).not.toBeNull();
    if (!routine) return;

    // Wake up: 08:00 (480) - (15 + 20 + 15 = 50) = 430 min = 07:10
    expect(routine.wake).toBe('07:10');

    // Bedtime: 07:10 - 8 hours - 15 min = 22:55
    expect(routine.bed).toBe('22:55');

    // Online first is true
    expect(routine.onlineFirst).toBe(true);

    // Leave for campus at 11:30: safe departure is 11:30 - 35 min travel - 10 min buffer = 10:45
    expect(routine.leave).toBe('10:45');
    expect(routine.arrive).toBe('11:20');
  });

  it('calculates routine for in-person first class', () => {
    // Monday: 13:15 in-person Romanian
    const classes = [
      {
        day: 1,
        start: '13:15',
        end: '14:45',
        title: 'Румынский язык',
        place: '214 · корпус 4А',
      },
    ];

    const routine = calculateMorningRoutine(classes, baseSettings);
    expect(routine).not.toBeNull();
    if (!routine) return;

    // 13:15 is 795 min.
    // Campus arrival: 13:15 - 10 buffer = 13:05 (785 min)
    // Leave home: 13:05 - 35 travel = 12:30 (750 min)
    // Wake up: 12:30 - 50 prep = 11:40 (700 min)
    expect(routine.leave).toBe('12:30');
    expect(routine.arrive).toBe('13:05');
    expect(routine.wake).toBe('11:40');
    expect(routine.bed).toBe('03:25');
  });

  it('handles tight schedule warning after online lesson', () => {
    const classes = [
      {
        day: 3,
        start: '08:00',
        end: '09:00',
        title: 'Английский с репетитором',
        place: 'Дистанционно (дома)',
        online: true,
      },
      {
        day: 3,
        start: '09:15',
        end: '10:45',
        title: 'Физкультура',
        place: 'Спорткомплекс',
      },
    ];

    const routine = calculateMorningRoutine(classes, baseSettings);
    expect(routine?.commuteUncertain).toBe(true);
    expect(routine?.warning).toContain('мало времени');
  });
});

describe('Daylight saving transitions (Europe/Chisinau)', () => {
  it('correctly parses winter time and summer time', () => {
    // Chișinău is UTC+3 in summer (EEST) and UTC+2 in winter (EET).
    // Summer date: 2026-07-01 at 12:00 Chișinău time -> 09:00 UTC
    const summerIso = zonedIso('2026-07-01', '12:00');
    expect(summerIso).toBe('2026-07-01T09:00:00.000Z');

    // Winter date: 2026-01-15 at 12:00 Chișinău time -> 10:00 UTC
    const winterIso = zonedIso('2026-01-15', '12:00');
    expect(winterIso).toBe('2026-01-15T10:00:00.000Z');
  });

  it('handles localInstant across daylight saving switch correctly', () => {
    // In March, clock springs forward at 02:00 -> 03:00.
    // 09:00 in Chișinău on 2026-03-30 (after DST change) is UTC+3
    const postDst = localInstant('2026-03-30', 9 * 60);
    const postIso = new Date(postDst).toISOString();
    expect(postIso).toBe('2026-03-30T06:00:00.000Z');

    // 09:00 in Chișinău on 2026-03-25 (before DST change) is UTC+2
    const preDst = localInstant('2026-03-25', 9 * 60);
    const preIso = new Date(preDst).toISOString();
    expect(preIso).toBe('2026-03-25T07:00:00.000Z');
  });
});
