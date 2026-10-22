import React, { useRef, useState } from 'react';
import { Check, ChevronRight, Plus, BookOpen, ClipboardList, GraduationCap } from 'lucide-react';
import { Assessment } from '@usm/shared';
import { collectDeadlines, deadlineGroup, DeadlineRow } from '../lib/deadlines.js';
import { dateParts, fmtDate } from '../lib/time.js';
interface Props {
  homework: any[];
  assessments: Assessment[];
  tab: string;
  setTab: (tab: string) => void;
  onAddHomework: () => void;
  onAddEvent: () => void;
  onEditHomework: (item: any) => void;
  onEditEvent: (item: Assessment) => void;
  onDoneHomework: (item: any) => Promise<void>;
  onDoneEvent: (item: Assessment) => Promise<void>;
}
export function DeadlinesView({
  homework,
  assessments,
  tab,
  setTab,
  onAddHomework,
  onAddEvent,
  onEditHomework,
  onEditEvent,
  onDoneHomework,
  onDoneEvent,
}: Props) {
  const today = dateParts(new Date()).key,
    all = collectDeadlines(homework, assessments);
  const tabs = ['Все', 'ДЗ', 'Контрольные', 'Экзамены', 'Просрочено', 'Завершённые'];
  const selected = tabs.includes(tab) ? tab : 'Все';
  const filter = (row: DeadlineRow) =>
    selected === 'Завершённые'
      ? row.completed
      : !row.completed &&
        (selected === 'Все' ||
          (selected === 'ДЗ' && row.kind === 'homework') ||
          (selected === 'Контрольные' && row.kind === 'test') ||
          (selected === 'Экзамены' && row.kind === 'exam') ||
          (selected === 'Просрочено' && deadlineGroup(row, today) === 'Просрочено'));
  const shown = all.filter(filter);
  const groups = [
    'Просрочено',
    'Сегодня',
    'Завтра',
    'Позже',
    'Без срока',
    'Прошедшие события',
    'Завершённые',
  ];
  const active = all.filter((x) => !x.completed),
    count = (group: string) => active.filter((x) => deadlineGroup(x, today) === group).length;
  const [busy, setBusy] = useState(new Set<string>());
  const locks = useRef(new Set<string>());
  const finish = async (row: DeadlineRow) => {
    if (locks.current.has(row.id)) return;
    locks.current.add(row.id);
    setBusy(new Set(locks.current));
    try {
      if (row.kind === 'homework') await onDoneHomework(row.source);
      else await onDoneEvent({ ...row.source, completed: !row.completed });
    } catch {
    } finally {
      locks.current.delete(row.id);
      setBusy(new Set(locks.current));
    }
  };
  return (
    <div className="deadlines-view">
      <header className="deadlines-heading">
        <h1>Сроки</h1>
        <p>
          Сегодня: {count('Сегодня')} · Завтра: {count('Завтра')} · Просрочено:{' '}
          {count('Просрочено')}
        </p>
      </header>
      <div className="deadline-add-actions">
        <button type="button" onClick={onAddHomework}>
          <Plus size={16} />
          Добавить ДЗ
        </button>
        <button type="button" onClick={onAddEvent}>
          <Plus size={16} />
          Контрольная / экзамен
        </button>
      </div>
      <div className="deadline-filters" role="group" aria-label="Вид сроков">
        {tabs.map((t) => (
          <button
            type="button"
            key={t}
            aria-pressed={selected === t}
            className={selected === t ? 'selected' : ''}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {groups.map((group) => {
        const entries = shown.filter((row) => deadlineGroup(row, today) === group);
        if (!entries.length) return null;
        const content = (
          <div className="deadline-entries">
            {entries.map((row) => (
              <article
                key={row.id}
                className={
                  'deadline-entry ' +
                  (row.completed ? 'completed ' : '') +
                  (group === 'Просрочено' ? 'overdue' : '')
                }
              >
                <button
                  type="button"
                  className="deadline-check"
                  aria-label={(row.completed ? 'Вернуть: ' : 'Завершить: ') + row.title}
                  disabled={busy.has(row.id)}
                  onClick={() => void finish(row)}
                >
                  {row.completed && <Check size={15} />}
                </button>
                <button
                  type="button"
                  className="deadline-content"
                  onClick={() =>
                    row.kind === 'homework' ? onEditHomework(row.source) : onEditEvent(row.source)
                  }
                >
                  <span className={'deadline-kind ' + row.kind}>
                    {row.kind === 'homework' ? (
                      <BookOpen size={13} />
                    ) : row.kind === 'exam' ? (
                      <GraduationCap size={13} />
                    ) : (
                      <ClipboardList size={13} />
                    )}{' '}
                    {row.kind === 'homework'
                      ? 'ДЗ'
                      : row.kind === 'test'
                        ? 'Контрольная'
                        : 'Экзамен'}
                  </span>
                  <strong>{row.title}</strong>
                  {row.subject && <span className="deadline-subject">{row.subject}</span>}
                  <small>
                    {row.date ? fmtDate(row.date, { day: 'numeric', month: 'long' }) : 'Без срока'}
                    {row.time ? ' · ' + row.time : ''}
                  </small>
                </button>
                <ChevronRight className="deadline-arrow" size={16} />
              </article>
            ))}
          </div>
        );
        return group === 'Прошедшие события' ? (
          <details className="deadline-past" key={group}>
            <summary>
              {group} · {entries.length}
            </summary>
            {content}
          </details>
        ) : (
          <section className="deadline-section" key={group}>
            <h2>
              {group}
              <span>{entries.length}</span>
            </h2>
            {content}
          </section>
        );
      })}
      {!shown.length && (
        <div className="deadline-empty">
          <ClipboardList size={26} />
          <strong>
            {selected === 'Завершённые' ? 'Завершённых дел пока нет' : 'В этом разделе сроков нет'}
          </strong>
          <p>Добавь задание или событие — оно появится здесь.</p>
        </div>
      )}
    </div>
  );
}
