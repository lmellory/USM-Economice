import { zonedIso } from '@usm/shared';

export function homeworkOffset(item: any, defaultMinutes: number): number {
  return Number(item.reminder_minutes ?? defaultMinutes);
}
export function homeworkDeadline(item: any): number {
  return item.due_at
    ? Date.parse(item.due_at)
    : item.due_date
      ? Date.parse(zonedIso(item.due_date, '09:00'))
      : NaN;
}
export function homeworkReminderAt(item: any, defaultMinutes: number): number {
  return homeworkDeadline(item) - homeworkOffset(item, defaultMinutes) * 60000;
}
export function legacyHomeworkKey(item: any): string {
  return `homework:${item.id}:${item.due_at || item.due_date}`;
}
export function homeworkReminderKey(item: any, defaultMinutes: number): string {
  return `${legacyHomeworkKey(item)}:${homeworkOffset(item, defaultMinutes)}`;
}
