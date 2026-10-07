import {
  applyScheduleExceptions,
  baseSchedule,
  calculateMorningRoutine,
  calculateWeekParity,
  ClassItem,
  CommuteLeg,
  CommuteOption,
  CommuteOptionResult,
  dayNames,
  DestinationType,
  formatFreeTime,
  min,
  RoutineResult,
  RoutineSettings,
  ScheduleException,
  shortDays,
  TransitStop,
  WeekParity,
} from '@usm/shared';

export type {
  ClassItem,
  CommuteLeg,
  CommuteOption,
  CommuteOptionResult,
  DestinationType,
  RoutineResult,
  RoutineSettings,
  ScheduleException,
  TransitStop,
  WeekParity,
};
export {
  applyScheduleExceptions,
  baseSchedule,
  calculateMorningRoutine,
  calculateWeekParity,
  dayNames,
  formatFreeTime,
  shortDays,
};

export interface DayScheduleResult {
  parity: WeekParity | null;
  classes: ClassItem[];
}

export function getDaySchedule(
  schedule: ClassItem[],
  dayWeekday: number,
  parity: WeekParity | null,
  exceptions: ScheduleException[] = [],
  targetDateStr?: string
): DayScheduleResult {
  let filtered = schedule
    .filter((c) => c.day === dayWeekday && (!c.parity || (parity && c.parity === parity)))
    .sort((a, b) => min(a.start) - min(b.start));

  if (targetDateStr && exceptions.length) {
    filtered = applyScheduleExceptions(filtered, exceptions, targetDateStr);
    filtered.sort((a, b) => min(a.start) - min(b.start));
  }

  return { parity, classes: filtered };
}

