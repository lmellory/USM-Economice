import { describe, expect, it } from 'vitest';
import {
  applyScheduleExceptions,
  calculateMorningRoutine,
  calculateWeekParity,
  hm,
  localInstant,
  min,
  ScheduleException,
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

    // Wake up: 08:00 (480) - (15 wash + 5 hair_dry + 20 breakfast + 15 get_ready = 55 prep) = 425 min = 07:05
    expect(routine.wake).toBe('07:05');

    // Bedtime: 07:05 - 8 hours - 15 min = 22:50
    expect(routine.bed).toBe('22:50');

    // Online first is true
    expect(routine.onlineFirst).toBe(true);

    // Leave for campus at 11:30: safe departure is 11:30 - 35 min travel - 10 min buffer = 10:45
    expect(routine.leave).toBe('10:45');
    expect(routine.arrive).toBe('11:20');
  });

  it('calculates routine for in-person first class with target bedtime and free time', () => {
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
    expect(routine.leave).toBe('12:30');
    expect(routine.arrive).toBe('13:05');

    // Natural wake up with target bedtime ~00:15 + 8 hours = 08:15!
    expect(routine.wake).toBe('08:15');
    expect(routine.bed).toBe('00:00');

    // Free time until departure at 12:30:
    // Ready at: 08:15 + 55 prep = 09:10
    // Free time: 12:30 - 09:10 = 200 min = 3 ч 20 мин!
    expect(routine.freeMinutes).toBe(200);
    expect(routine.freeTimeFormatted).toBe('3 ч 20 мин');
  });

  it('calculates detailed timeline with custom shower, hair drying, breakfast and free time', () => {
    const userSettings = {
      sleep_hours: 8,
      sleep_latency: 15,
      wash_minutes: 20, // душ и помыть голову
      hair_dry_minutes: 5, // высушить голову
      breakfast_minutes: 30, // завтрак
      get_ready_minutes: 10, // сборы
      travel_buffer: 10,
      travel_minutes: 35,
      target_bedtime: '00:15', // сон в полночь – 00:30
    };

    const classes = [
      {
        day: 2,
        start: '11:30',
        end: '13:00',
        title: 'Предпринимательское право',
        place: '145 · Центральный корпус',
      },
    ];

    const routine = calculateMorningRoutine(classes, userSettings);
    expect(routine).not.toBeNull();
    if (!routine) return;

    // Bedtime: 00:00 (falling asleep at 00:15)
    expect(routine.bed).toBe('00:00');
    // Wake: 08:15
    expect(routine.wake).toBe('08:15');

    // Detailed steps:
    expect(routine.wash).toBe('08:15');
    expect(routine.washEnd).toBe('08:35'); // 20 min
    expect(routine.hairDry).toBe('08:35');
    expect(routine.hairDryEnd).toBe('08:40'); // 5 min
    expect(routine.breakfast).toBe('08:40');
    expect(routine.breakfastEnd).toBe('09:10'); // 30 min
    expect(routine.getready).toBe('09:10');
    expect(routine.getreadyEnd).toBe('09:20'); // 10 min
    expect(routine.readyAt).toBe('09:20');

    // Leave for campus 11:30: arrival 11:20, leave 10:45
    expect(routine.leave).toBe('10:45');

    // Free time: 10:45 - 09:20 = 85 minutes = 1 ч 25 мин
    expect(routine.freeMinutes).toBe(85);
    expect(routine.freeTimeFormatted).toBe('1 ч 25 мин');
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

describe('applyScheduleExceptions', () => {
  const sampleClasses = [
    {
      id: 'c-1',
      day: 1,
      start: '13:15',
      end: '14:45',
      title: 'Румынский язык',
      place: '214 · корпус 4А',
    },
    {
      id: 'c-2',
      day: 1,
      start: '15:00',
      end: '16:30',
      title: 'Экономическая теория',
      place: '145 · Центральный корпус',
    },
  ];

  it('marks a class as cancelled when cancel exception exists', () => {
    const exceptions: ScheduleException[] = [
      {
        id: 'e-1',
        user_id: 'u-1',
        date: '2026-10-12',
        class_id: 'c-1',
        type: 'cancel',
        note: 'Преподаватель на конференции',
      },
    ];

    const updated = applyScheduleExceptions(sampleClasses, exceptions, '2026-10-12');
    expect(updated[0].isCancelled).toBe(true);
    expect(updated[0].exceptionId).toBe('e-1');
    expect(updated[0].exceptionNote).toBe('Преподаватель на конференции');
    expect(updated[1].isCancelled).toBeUndefined();

    // Routine calculation ignores cancelled class:
    const routine = calculateMorningRoutine(updated, {
      sleep_hours: 8,
      sleep_latency: 15,
      wash_minutes: 15,
      breakfast_minutes: 20,
      get_ready_minutes: 15,
      travel_buffer: 10,
      travel_minutes: 35,
    });
    expect(routine).not.toBeNull();
    // First active class is now c-2 (15:00) instead of c-1 (13:15)
    expect(routine?.first.id).toBe('c-2');
  });

  it('overrides start, end, and place when move exception exists', () => {
    const exceptions: ScheduleException[] = [
      {
        id: 'e-2',
        user_id: 'u-1',
        date: '2026-10-12',
        class_id: 'c-2',
        type: 'move',
        new_start: '10:00',
        new_end: '11:30',
        new_place: 'Аудитория 101',
        note: 'Перенос на первую пару',
      },
    ];

    const updated = applyScheduleExceptions(sampleClasses, exceptions, '2026-10-12');
    expect(updated[1].isMoved).toBe(true);
    expect(updated[1].start).toBe('10:00');
    expect(updated[1].end).toBe('11:30');
    expect(updated[1].place).toBe('Аудитория 101');
    expect(updated[1].exceptionNote).toBe('Перенос на первую пару');
  });

  it('does nothing when exception date does not match target date', () => {
    const exceptions: ScheduleException[] = [
      {
        id: 'e-3',
        user_id: 'u-1',
        date: '2026-10-19',
        class_id: 'c-1',
        type: 'cancel',
      },
    ];

    const updated = applyScheduleExceptions(sampleClasses, exceptions, '2026-10-12');
    expect(updated[0].isCancelled).toBeUndefined();
  });
});
