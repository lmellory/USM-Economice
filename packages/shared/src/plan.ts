import {
  ClassItem,
  RoutineResult,
  RoutineSettings,
  ScheduleException,
  WeekParity,
} from './types.js';
import { hm, localNoon, min } from './time.js';

export const baseSchedule: ClassItem[] = [
  {
    day: 1,
    start: '13:15',
    end: '14:45',
    title: 'Румынский язык',
    place: '214 · корпус 4А',
    parity: 'odd',
  },
  {
    day: 1,
    start: '15:00',
    end: '16:30',
    title: 'Экономическая теория I',
    kind: 'лекция',
    place: '145 · Центральный корпус',
  },
  {
    day: 1,
    start: '16:45',
    end: '18:15',
    title: 'Экономическая математика',
    kind: 'лекция',
    place: '145 · Центральный корпус',
  },
  {
    day: 2,
    start: '11:30',
    end: '13:00',
    title: 'Предпринимательское право',
    kind: 'лекция',
    place: '145 · Центральный корпус',
  },
  {
    day: 2,
    start: '13:15',
    end: '14:45',
    title: 'Деньги и кредит',
    kind: 'семинар',
    place: '4 · 1-й этаж, Анекс',
  },
  {
    day: 2,
    start: '15:00',
    end: '16:30',
    title: 'Румынский язык',
    place: '414 · Центральный корпус',
  },
  {
    day: 2,
    start: '16:45',
    end: '18:15',
    title: 'Информационные технологии',
    kind: 'лабораторная',
    place: '311/321 · Центральный корпус',
  },
  {
    day: 3,
    start: '08:00',
    end: '09:00',
    title: 'Английский с репетитором',
    kind: 'онлайн',
    place: 'Дистанционно (дома)',
    online: true,
  },
  {
    day: 3,
    start: '09:45',
    end: '11:15',
    title: 'Физкультура',
    place: 'Спорткомплекс ГосУниверситета · Strada Ismail 1, Chișinău',
    parity: 'even',
  },
  {
    day: 3,
    start: '13:15',
    end: '14:45',
    title: 'Менеджмент',
    kind: 'семинар',
    place: '217 · корпус 4А',
  },
  {
    day: 3,
    start: '15:00',
    end: '16:30',
    title: 'Предпринимательское право',
    kind: 'семинар',
    place: '217 · корпус 4А',
  },
  {
    day: 3,
    start: '16:45',
    end: '18:15',
    title: 'Деньги и кредит',
    kind: 'лекция',
    place: '145 · Центральный корпус',
  },
  {
    day: 4,
    start: '13:15',
    end: '14:45',
    title: 'Информационные технологии',
    kind: 'лабораторная',
    place: '311/321 · Центральный корпус',
  },
  {
    day: 4,
    start: '15:00',
    end: '16:30',
    title: 'Экономическая теория I',
    kind: 'семинар',
    place: '332 · Центральный корпус',
  },
  {
    day: 5,
    start: '08:00',
    end: '09:00',
    title: 'Английский с репетитором',
    kind: 'онлайн',
    place: 'Дистанционно (дома)',
    online: true,
  },
  {
    day: 5,
    start: '11:30',
    end: '13:00',
    title: 'Менеджмент',
    kind: 'лекция',
    place: '145 · Центральный корпус',
    parity: 'even',
  },
  {
    day: 5,
    start: '13:15',
    end: '14:45',
    title: 'Экономическая теория I',
    kind: 'семинар',
    place: '414 · Центральный корпус',
  },
  {
    day: 5,
    start: '15:00',
    end: '16:30',
    title: 'Экономическая математика',
    kind: 'семинар',
    place: '413 · Центральный корпус',
  },
  {
    day: 5,
    start: '16:45',
    end: '18:15',
    title: 'Менеджмент',
    kind: 'лекция',
    place: '145 · Центральный корпус',
  },
];

export const dayNames = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
];
export const shortDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const calculateWeekParity = (
  targetDateStr: string,
  semesterStart: string | null,
  firstWeekParity: WeekParity | null
): WeekParity | null => {
  if (!semesterStart || !firstWeekParity) return null;
  const targetDate = localNoon(targetDateStr);
  const targetWeekday = ((targetDate.getUTCDay() + 6) % 7) + 1;
  const targetMonday = new Date(targetDate.getTime() - (targetWeekday - 1) * 86400000);

  const start = localNoon(semesterStart);
  const startWeekday = ((start.getUTCDay() + 6) % 7) + 1;
  const startMonday = new Date(start.getTime() - (startWeekday - 1) * 86400000);

  const diffMs = targetMonday.getTime() - startMonday.getTime();
  const weeks = Math.floor(diffMs / (7 * 86400000));
  const isEvenShift = Math.abs(weeks) % 2 === 0;

  return isEvenShift ? firstWeekParity : firstWeekParity === 'odd' ? 'even' : 'odd';
};

export function formatFreeTime(minutes: number): string {
  if (minutes <= 0) return '0 мин';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} ч ${m} мин`;
  if (h > 0) return `${h} ч`;
  return `${m} мин`;
}

export const calculateMorningRoutine = (
  classes: ClassItem[],
  settings: RoutineSettings,
  transitMinutes?: number
): RoutineResult | null => {
  const activeClasses = classes.filter((c) => !c.isCancelled);
  if (!activeClasses.length) return null;

  const sorted = [...activeClasses].sort((a, b) => min(a.start) - min(b.start));
  const first = sorted[0];
  const firstCampus = !first.online;

  const travelDuration = Number(settings.travel_minutes ?? transitMinutes ?? 35);
  const travelBuffer = Number(settings.travel_buffer ?? 10);

  const washTime = Number(settings.wash_minutes ?? 20);
  const hairDryTime = Number(settings.hair_dry_minutes ?? 5);
  const breakfastTime = Number(settings.breakfast_minutes ?? 30);
  const getReadyTime = Number(settings.get_ready_minutes ?? 10);
  const prep = washTime + hairDryTime + breakfastTime + getReadyTime;

  let wakeAt: number;
  let leaveAt: number | null = null;
  let arriveAt: number | null = null;
  let commuteUncertain = false;
  let warning: string | undefined;

  const eventAt = min(first.start);

  if (first.online) {
    const campus = sorted.find((c) => !c.online);
    if (campus) {
      const lessonEnd = first.end
        ? min(first.end)
        : eventAt + Number(settings.english_duration || 60);
      const lastSafeLeave = min(campus.start) - travelDuration - travelBuffer;
      leaveAt = Math.max(lessonEnd, lastSafeLeave);
      arriveAt = leaveAt + travelDuration;
      if (lessonEnd > lastSafeLeave) {
        commuteUncertain = true;
        warning = `После урока остаётся мало времени: дорога занимает ~${travelDuration} мин, плюс запас ${travelBuffer} мин.`;
      }
    }
  } else {
    const campusEvent = eventAt - travelBuffer;
    leaveAt = campusEvent - travelDuration;
    arriveAt = campusEvent;
  }

  const deadlineForPrep = first.online ? eventAt : (leaveAt ?? eventAt);
  const latestWakeAt = deadlineForPrep - prep;

  const sleepHours = Number(settings.sleep_hours || 8);
  const sleepLatency = Number(settings.sleep_latency ?? 15);

  const targetBedStr = settings.target_bedtime || '00:15';
  const clockBedMin = min(targetBedStr);
  // An evening bedtime belongs to the day before the morning routine.
  const targetBedMin = clockBedMin >= 12 * 60 ? clockBedMin - 24 * 60 : clockBedMin;
  const naturalWakeMin = targetBedMin + Math.round(sleepHours * 60);

  let bedtime: number;
  let freeMinutes = 0;

  if (naturalWakeMin <= latestWakeAt) {
    wakeAt = naturalWakeMin;
    bedtime = targetBedMin - sleepLatency;
    const readyAtMin = wakeAt + prep;
    freeMinutes = Math.max(0, deadlineForPrep - readyAtMin);
  } else {
    wakeAt = latestWakeAt;
    bedtime = wakeAt - Math.round(sleepHours * 60) - sleepLatency;
    freeMinutes = 0;
    if (wakeAt < naturalWakeMin) {
      const earlyWarn = `Раннее занятие (${first.start}): чтобы выспаться ${sleepHours} ч, отбой около ${hm(bedtime)}`;
      warning = warning ? `${earlyWarn}. ${warning}` : earlyWarn;
    }
  }

  const washStart = wakeAt;
  const washEnd = washStart + washTime;
  const hairDryStart = washEnd;
  const hairDryEnd = hairDryStart + hairDryTime;
  const breakfastStart = hairDryEnd;
  const breakfastEnd = breakfastStart + breakfastTime;
  const readyStart = breakfastEnd;
  const readyEnd = readyStart + getReadyTime;

  return {
    first,
    firstCampus,
    wake: hm(wakeAt),
    bed: hm(bedtime),
    wash: hm(washStart),
    washEnd: hm(washEnd),
    hairDry: hm(hairDryStart),
    hairDryEnd: hm(hairDryEnd),
    breakfast: hm(breakfastStart),
    breakfastEnd: hm(breakfastEnd),
    getready: hm(readyStart),
    getreadyEnd: hm(readyEnd),
    readyAt: hm(readyEnd),
    leave: leaveAt === null ? null : hm(leaveAt),
    arrive: arriveAt === null ? null : hm(arriveAt),
    freeMinutes,
    freeTimeFormatted: formatFreeTime(freeMinutes),
    commuteUncertain,
    warning,
    onlineFirst: Boolean(first.online),
    wakeMin: wakeAt,
    bedMin: bedtime,
    leaveMin: leaveAt,
  };
};

export const applyScheduleExceptions = (
  classes: ClassItem[],
  exceptions: ScheduleException[],
  targetDate: string
): ClassItem[] => {
  const dateExceptions = exceptions.filter((e) => e.date === targetDate);
  if (!dateExceptions.length) return classes;

  return classes.map((item) => {
    const exc = dateExceptions.find((e) => e.class_id === item.id);
    if (!exc) return item;

    if (exc.type === 'cancel') {
      return {
        ...item,
        isCancelled: true,
        exceptionId: exc.id,
        exceptionNote: exc.note ?? null,
      };
    }

    if (exc.type === 'move') {
      return {
        ...item,
        start: exc.new_start || item.start,
        end: exc.new_end !== undefined && exc.new_end !== null ? exc.new_end : item.end,
        place: exc.new_place !== undefined && exc.new_place !== null ? exc.new_place : item.place,
        isMoved: true,
        exceptionId: exc.id,
        exceptionNote: exc.note ?? null,
      };
    }

    return item;
  });
};
