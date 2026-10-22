export const GRADE_KINDS = {
  homework: 'ДЗ',
  test: 'Контрольная',
  exam: 'Экзамен',
  other: 'Другое',
} as const;
export interface Grade {
  id: string;
  subject: string;
  title: string;
  kind: keyof typeof GRADE_KINDS;
  score: number;
  weight: number;
  date: string;
  note: string;
}
export type GradeInput = Omit<Grade, 'id'>;
export function validateGrade(value: unknown): GradeInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Проверь данные оценки.');
  const v = value as Record<string, unknown>;
  const text = (key: string, max: number, required = false) => {
    const raw = v[key];
    if (raw != null && typeof raw !== 'string') throw new Error('Проверь текстовые поля.');
    const result = String(raw ?? '').trim();
    if ((required && !result) || result.length > max)
      throw new Error('Укажи предмет и название работы; сократи длинный текст.');
    return result;
  };
  if (typeof v.kind !== 'string' || !Object.hasOwn(GRADE_KINDS, v.kind))
    throw new Error('Выбери тип работы.');
  if (
    typeof v.score !== 'number' ||
    !Number.isFinite(v.score) ||
    v.score < 1 ||
    v.score > 10 ||
    Math.abs(v.score * 100 - Math.round(v.score * 100)) > 0.000001
  )
    throw new Error('Оценка должна быть от 1 до 10, максимум два знака после запятой.');
  if (
    typeof v.weight !== 'number' ||
    !Number.isFinite(v.weight) ||
    v.weight < 0.1 ||
    v.weight > 10 ||
    Math.abs(v.weight * 10 - Math.round(v.weight * 10)) > 0.000001
  )
    throw new Error('Вес оценки — от 0,1 до 10 с шагом 0,1.');
  const date = text('date', 10, true);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date < '2000-01-01' ||
    date > '2100-12-31' ||
    !Number.isFinite(Date.parse(date + 'T12:00:00Z')) ||
    new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date
  )
    throw new Error('Укажи корректную дату.');
  return {
    subject: text('subject', 120, true),
    title: text('title', 200, true),
    kind: v.kind as Grade['kind'],
    score: v.score,
    weight: v.weight,
    date,
    note: text('note', 1000),
  };
}
export function gradeAverage(items: Pick<Grade, 'score' | 'weight'>[]): number | null {
  const total = items.reduce((n, g) => n + g.weight, 0);
  return total > 0
    ? Math.round((items.reduce((n, g) => n + g.score * g.weight, 0) / total) * 100) / 100
    : null;
}
export const formatGrade = (score: number) =>
  score.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
