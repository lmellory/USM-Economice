import { dateParts, zonedIso } from './time.js';

export type AssessmentKind = 'test' | 'exam';
export interface PreparationTopic {
  id: string;
  title: string;
  done: boolean;
}
export interface Assessment {
  id: string;
  kind: AssessmentKind;
  subject: string;
  title: string;
  date: string;
  time: string | null;
  place: string;
  topics: PreparationTopic[];
  completed: boolean;
  reminderMinutes: number | null;
}
export type AssessmentInput = Omit<Assessment, 'id'>;
export const assessmentLabel = (kind: AssessmentKind) =>
  kind === 'exam' ? 'Экзамен' : 'Контрольная';
export const assessmentInstant = (item: Pick<Assessment, 'date' | 'time'>): number =>
  Date.parse(zonedIso(item.date, item.time || '09:00'));
export const assessmentReminderKey = (item: Assessment): string =>
  `assessment:${item.id}:${assessmentInstant(item)}:${item.reminderMinutes}`;

// Reject normalized invalid dates and local times that do not exist at the DST change.
export function validateAssessment(value: unknown): AssessmentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Некорректная запись.');
  const v = value as Record<string, unknown>;
  const text = (key: string, max: number, required = false): string => {
    if (v[key] != null && typeof v[key] !== 'string') throw new Error('Проверь текстовые поля.');
    const result = String(v[key] ?? '').trim();
    if ((required && !result) || result.length > max)
      throw new Error('Укажи предмет и название; сократи слишком длинный текст.');
    return result;
  };
  if (v.kind !== 'test' && v.kind !== 'exam') throw new Error('Выбери контрольную или экзамен.');
  const date = text('date', 10, true);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date < '2000-01-01' ||
    date > '2100-12-31' ||
    !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error('Укажи корректную дату.');
  const time = text('time', 5) || null;
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Укажи корректное время.');
  if (time) {
    const stamp = new Date(zonedIso(date, time));
    const local = stamp.toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Chisinau',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    if (dateParts(stamp).key !== date || local !== time)
      throw new Error('Это время недоступно из-за перевода часов. Выбери другое.');
  }
  if (typeof v.completed !== 'boolean') throw new Error('Некорректный статус.');
  if (
    v.reminderMinutes !== null &&
    (!Number.isInteger(v.reminderMinutes) ||
      ![60, 180, 1440, 4320, 10080].includes(v.reminderMinutes as number))
  )
    throw new Error('Выбери время напоминания.');
  if (!Array.isArray(v.topics) || v.topics.length > 50)
    throw new Error('Можно добавить до 50 тем.');
  const ids = new Set<string>();
  const topics = v.topics.map((t: any) => {
    if (
      !t ||
      typeof t.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(t.id) ||
      ids.has(t.id) ||
      typeof t.title !== 'string' ||
      !t.title.trim() ||
      t.title.trim().length > 200 ||
      typeof t.done !== 'boolean'
    )
      throw new Error('Проверь список тем подготовки.');
    ids.add(t.id);
    return { id: t.id, title: t.title.trim(), done: t.done };
  });
  return {
    kind: v.kind,
    subject: text('subject', 120, true),
    title: text('title', 200, true),
    date,
    time,
    place: text('place', 200),
    topics,
    completed: v.completed,
    reminderMinutes: v.reminderMinutes as number | null,
  };
}
