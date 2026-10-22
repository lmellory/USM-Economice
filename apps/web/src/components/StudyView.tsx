import { GradesView } from './GradesView.js';
import React, { useState } from 'react';
import {
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  ClipboardList,
  GraduationCap,
  Plus,
} from 'lucide-react';
import { Assessment, assessmentLabel, ClassItem } from '@usm/shared';
import { dateParts, fmtDate } from '../lib/time.js';

interface Props {
  items: Assessment[];
  schedule: ClassItem[];
  homework: any[];
  busy: Set<string>;
  onAdd: () => void;
  onEdit: (item: Assessment) => void;
  onSave: (item: Assessment) => Promise<void>;
  onHomework: () => void;
}
export function StudyView({
  items,
  schedule,
  homework,
  busy,
  onAdd,
  onEdit,
  onSave,
  onHomework,
}: Props) {
  const [section, setSection] = useState<'events' | 'grades'>('events');
  const [archive, setArchive] = useState(false);
  const [subject, setSubject] = useState('');
  const today = dateParts(new Date()).key;
  const upcoming = items
    .filter((x) => !x.completed && x.date >= today)
    .sort((a, b) => `${a.date}${a.time || '23:59'}`.localeCompare(`${b.date}${b.time || '23:59'}`));
  const past = items
    .filter((x) => x.completed || x.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const shown = (archive ? past : upcoming).filter((x) => !subject || x.subject === subject);
  const subjects = [
    ...new Set([...schedule.map((x) => x.title), ...items.map((x) => x.subject)]),
  ].sort((a, b) => a.localeCompare(b, 'ru'));
  const next = upcoming[0];
  const plural = (n: number, forms: [string, string, string]) =>
    forms[
      n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2
    ];
  const testsCount = upcoming.filter((x) => x.kind === 'test').length;
  const examsCount = upcoming.filter((x) => x.kind === 'exam').length;
  const homeworkCount = homework.filter((x) => !x.completed).length;
  return (
    <div className="study-view">
      <div className="study-heading">
        <div>
          <h1>Учёба</h1>
          <p>
            {section === 'events'
              ? 'Предстоящих событий: ' + upcoming.length + '.'
              : 'Оценки по десятибалльной шкале'}
          </p>
        </div>
        {section === 'events' && (
          <button
            className="study-add"
            type="button"
            onClick={onAdd}
            aria-label="Добавить контрольную или экзамен"
          >
            <Plus size={22} />
          </button>
        )}
      </div>
      <div className="study-tabs study-main-tabs" role="group" aria-label="Раздел учёбы">
        <button
          type="button"
          aria-pressed={section === 'events'}
          className={section === 'events' ? 'selected' : ''}
          onClick={() => setSection('events')}
        >
          События
        </button>
        <button
          type="button"
          aria-pressed={section === 'grades'}
          className={section === 'grades' ? 'selected' : ''}
          onClick={() => setSection('grades')}
        >
          Оценки
        </button>
      </div>
      {section === 'grades' ? (
        <GradesView
          subjects={[...new Set([...subjects, ...homework.map((x) => x.subject).filter(Boolean)])]}
        />
      ) : (
        <>
          {next ? (
            <button type="button" className="study-next" onClick={() => onEdit(next)}>
              <span className="study-kicker">
                <CalendarDays size={15} /> Ближайшее событие <ArrowUpRight size={16} />
              </span>
              <strong>{next.subject}</strong>
              <span>
                {assessmentLabel(next.kind)} · {fmtDate(next.date)}
                {next.time ? `, ${next.time}` : ''}
              </span>
              <small>{next.title}</small>
            </button>
          ) : (
            <div className="study-welcome">
              <BookOpenCheck size={28} />
              <strong>Контрольных и экзаменов пока нет</strong>
              <p>Добавь событие, дату и темы подготовки.</p>
              <button type="button" className="primary-btn" onClick={onAdd}>
                Добавить событие
              </button>
            </div>
          )}
          <div className="study-counters">
            <span>
              <ClipboardList size={18} />
              <b>{testsCount}</b>{' '}
              {plural(testsCount, ['контрольная', 'контрольные', 'контрольных'])}
            </span>
            <span>
              <GraduationCap size={18} />
              <b>{examsCount}</b> {plural(examsCount, ['экзамен', 'экзамена', 'экзаменов'])}
            </span>
          </div>
          <div className="study-section-title">
            <h2>По предметам</h2>
            <button type="button" onClick={onHomework}>
              Все сроки <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="study-subjects" aria-label="Фильтр по предмету">
            <button
              type="button"
              aria-pressed={!subject}
              className={!subject ? 'selected' : ''}
              onClick={() => setSubject('')}
            >
              Все предметы
            </button>
            {subjects.map((s) => (
              <button
                type="button"
                key={s}
                aria-pressed={subject === s}
                className={subject === s ? 'selected' : ''}
                onClick={() => setSubject(subject === s ? '' : s)}
              >
                {s}
                <small>{upcoming.filter((x) => x.subject === s).length}</small>
              </button>
            ))}
          </div>
          <div className="study-tabs" role="group" aria-label="События">
            <button
              type="button"
              aria-pressed={!archive}
              className={!archive ? 'selected' : ''}
              onClick={() => setArchive(false)}
            >
              Предстоит <span>{upcoming.length}</span>
            </button>
            <button
              type="button"
              aria-pressed={archive}
              className={archive ? 'selected' : ''}
              onClick={() => setArchive(true)}
            >
              Архив <span>{past.length}</span>
            </button>
          </div>
          <div className="assessment-list">
            {shown.map((item) => {
              const prepared = item.topics.filter((t) => t.done).length;
              const days = Math.round(
                (Date.parse(item.date + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000
              );
              return (
                <article className={`assessment-card ${item.kind}`} key={item.id}>
                  <div className="assessment-meta">
                    <span className="assessment-kind">
                      {item.kind === 'exam' ? (
                        <GraduationCap size={14} />
                      ) : (
                        <ClipboardList size={14} />
                      )}{' '}
                      {assessmentLabel(item.kind)}
                    </span>
                    <span>
                      {item.completed
                        ? 'Завершено'
                        : days < 0
                          ? 'Прошло'
                          : days === 0
                            ? 'Сегодня'
                            : days === 1
                              ? 'Завтра'
                              : `Через ${days} дн.`}
                    </span>
                  </div>
                  <button type="button" className="assessment-open" onClick={() => onEdit(item)}>
                    <h3>{item.subject}</h3>
                    <p>{item.title}</p>
                    <span>
                      <CalendarDays size={14} />
                      {fmtDate(item.date)}
                      {item.time ? ` · ${item.time}` : ' · время уточняется'}
                    </span>
                    {item.place && <small>{item.place}</small>}
                  </button>
                  {item.topics.length > 0 && (
                    <details className="preparation">
                      <summary>
                        <span>
                          Подготовка{' '}
                          <b>
                            {prepared}/{item.topics.length}
                          </b>
                        </span>
                        <progress
                          max={item.topics.length}
                          value={prepared}
                          aria-label="Прогресс подготовки"
                        />
                      </summary>
                      <div className="preparation-list">
                        {item.topics.map((t) => (
                          <label key={t.id} className={t.done ? 'done' : ''}>
                            <input
                              type="checkbox"
                              checked={t.done}
                              disabled={busy.has(item.id)}
                              onChange={() => {
                                void onSave({
                                  ...item,
                                  topics: item.topics.map((x) =>
                                    x.id === t.id ? { ...x, done: !x.done } : x
                                  ),
                                }).catch(() => {});
                              }}
                            />
                            <span>{t.title}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                  <div className="assessment-actions">
                    <button type="button" onClick={() => onEdit(item)}>
                      Подробнее <ArrowUpRight size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={busy.has(item.id)}
                      onClick={() => {
                        void onSave({ ...item, completed: !item.completed }).catch(() => {});
                      }}
                    >
                      <Check size={15} />
                      {item.completed ? 'Вернуть' : 'Завершить'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {!shown.length && (
            <div className="study-empty">
              <CalendarDays size={24} />
              <p>
                {archive
                  ? 'Здесь появятся прошедшие и завершённые события.'
                  : subject
                    ? 'По этому предмету событий пока нет.'
                    : 'Предстоящих событий пока нет.'}
              </p>
              {!archive && (
                <button type="button" onClick={onAdd}>
                  + Добавить контрольную или экзамен
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
