import {
  ClassItem,
  RoutineSettings,
  RoutineResult,
  WeekParity,
  baseSchedule,
  dayNames,
  shortDays,
  calculateWeekParity,
  calculateMorningRoutine,
  min,
} from '@usm/shared';

export type { ClassItem, RoutineSettings, RoutineResult, WeekParity };
export { baseSchedule, dayNames, shortDays, calculateWeekParity, calculateMorningRoutine };

export interface DayScheduleResult {
  parity: WeekParity | null;
  classes: ClassItem[];
}

export function getDaySchedule(
  schedule: ClassItem[],
  dayWeekday: number,
  parity: WeekParity | null
): DayScheduleResult {
  const filtered = schedule
    .filter((c) => c.day === dayWeekday && (!c.parity || (parity && c.parity === parity)))
    .sort((a, b) => min(a.start) - min(b.start));

  return { parity, classes: filtered };
}
