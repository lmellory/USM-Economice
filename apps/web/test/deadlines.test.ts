import { describe, it, expect } from 'vitest';
import { collectDeadlines, deadlineGroup, nextSubjectClass } from '../src/lib/deadlines.js';
import { zonedIso } from '@usm/shared';
describe('Unified deadline list and class homework defaults', () => {
  it('combines events and homework in chronological order without colliding IDs', () => {
    const rows = collectDeadlines(
      [
        {
          id: 'same',
          title: 'ДЗ',
          due_date: '2026-10-22',
          due_at: zonedIso('2026-10-22', '13:00'),
          completed: 0,
        },
        { id: 'none', title: 'Без даты', completed: 0 },
      ],
      [
        {
          id: 'same',
          kind: 'exam',
          subject: 'Экономика',
          title: 'Экзамен',
          date: '2026-10-22',
          time: '09:00',
          topics: [],
          completed: false,
          place: '145',
          reminderMinutes: null,
        },
      ]
    );
    expect(rows.map((r) => r.title)).toEqual(['Экзамен', 'ДЗ', 'Без даты']);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
  });
  it('separates overdue homework, past events, undated and completed items', () => {
    const rows = collectDeadlines(
      [
        { id: '1', title: 'x', due_date: '2026-10-21', completed: 0 },
        { id: '2', title: 'y', completed: 1 },
      ],
      [
        {
          id: '3',
          kind: 'test',
          subject: 'Статистика',
          title: 'x',
          date: '2026-10-21',
          time: null,
          topics: [],
          completed: false,
          place: '214',
          reminderMinutes: null,
        },
      ]
    );
    expect(rows.map((r) => deadlineGroup(r, '2026-10-22'))).toEqual(
      expect.arrayContaining(['Прошедшие события', 'Просрочено', 'Завершённые'])
    );
  });
  const schedule: any[] = [
    { id: 'math', day: 1, start: '10:00', end: '11:30', title: 'Математика', place: '145' },
  ];
  it('prefills the next lesson and skips a lesson already in progress', () => {
    expect(
      nextSubjectClass(schedule, [], {}, 'Математика', new Date(zonedIso('2026-10-19', '09:00')))
    ).toEqual({ date: '2026-10-19', time: '10:00' });
    expect(
      nextSubjectClass(schedule, [], {}, 'Математика', new Date(zonedIso('2026-10-19', '10:01')))
    ).toEqual({ date: '2026-10-26', time: '10:00' });
  });
  it('respects cancelled lessons and odd/even weeks', () => {
    const exceptions: any[] = [{ id: 'e', class_id: 'math', date: '2026-10-19', type: 'cancel' }];
    expect(
      nextSubjectClass(
        schedule,
        exceptions,
        {},
        'Математика',
        new Date(zonedIso('2026-10-19', '09:00'))
      )?.date
    ).toBe('2026-10-26');
    expect(
      nextSubjectClass(
        [{ ...schedule[0], parity: 'odd' }],
        exceptions,
        { semester_start: '2026-10-19', first_week_parity: 'odd' },
        'Математика',
        new Date(zonedIso('2026-10-19', '09:00'))
      )?.date
    ).toBe('2026-11-02');
  });
  it('does not invent a deadline when the subject is absent', () =>
    expect(
      nextSubjectClass(
        schedule,
        [],
        {},
        'Другой предмет',
        new Date(zonedIso('2026-10-19', '09:00'))
      )
    ).toBeNull());
});
