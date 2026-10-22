import { Assessment, ClassItem, ScheduleException } from '@usm/shared';
import { calculateWeekParity, getDaySchedule } from './plan.js';
import { dateParts, dateShift, localNoon, TZ } from './time.js';
export type DeadlineKind = 'homework' | 'test' | 'exam';
export interface DeadlineRow {
  id: string;
  kind: DeadlineKind;
  title: string;
  subject: string;
  date: string;
  time: string;
  completed: boolean;
  source: any;
}
export function collectDeadlines(homework: any[], assessments: Assessment[]): DeadlineRow[] {
  return [
    ...homework.map((x) => ({
      id: 'homework:' + x.id,
      kind: 'homework' as const,
      title: x.title,
      subject: x.subject || '',
      date: x.due_date || '',
      time: x.due_at
        ? new Date(x.due_at).toLocaleTimeString('ru-RU', {
            timeZone: TZ,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          })
        : '',
      completed: Boolean(x.completed),
      source: x,
    })),
    ...assessments.map((x) => ({
      id: x.kind + ':' + x.id,
      kind: x.kind,
      title: x.title,
      subject: x.subject,
      date: x.date,
      time: x.time || '',
      completed: x.completed,
      source: x,
    })),
  ].sort(
    (a, b) =>
      (a.date || '9999').localeCompare(b.date || '9999') ||
      (a.time || '23:59').localeCompare(b.time || '23:59') ||
      a.title.localeCompare(b.title, 'ru')
  );
}
export function deadlineGroup(row: DeadlineRow, today: string): string {
  if (row.completed) return 'Завершённые';
  if (!row.date) return 'Без срока';
  if (row.date < today) return row.kind === 'homework' ? 'Просрочено' : 'Прошедшие события';
  if (row.date === today) return 'Сегодня';
  if (row.date === dateShift(today, 1)) return 'Завтра';
  return 'Позже';
}
export function nextSubjectClass(
  schedule: ClassItem[],
  exceptions: ScheduleException[],
  settings: any,
  subject: string,
  now: Date
): { date: string; time: string } | null {
  if (!subject) return null;
  const today = dateParts(now).key;
  const clock = now.toLocaleTimeString('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  for (let offset = 0; offset < 60; offset++) {
    const date = dateShift(today, offset),
      weekday = dateParts(localNoon(date)).weekday;
    const parity = calculateWeekParity(date, settings.semester_start, settings.first_week_parity);
    const found = getDaySchedule(schedule, weekday, parity, exceptions, date).classes.find(
      (c) => c.title === subject && !c.isCancelled && (offset > 0 || c.start > clock)
    );
    if (found) return { date, time: found.start };
  }
  return null;
}
