import React from 'react';
import { Assessment, assessmentLabel } from '@usm/shared';
import {
  ArrowUpRight,
  Ban,
  Bell,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Clock3,
  Droplets,
  MapPin,
  Moon,
  RotateCcw,
  Sunrise,
  Utensils,
} from 'lucide-react';
import { ClassItem, RoutineResult, shortDays } from '../lib/plan.js';
import { dateParts, fmtDate, min, TZ } from '../lib/time.js';

interface HomeViewProps {
  selected: Date;
  setSelected: (d: Date) => void;
  weekOffset: number;
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>;
  weekDates: Date[];
  todayKey: string;
  selectedInfo: ReturnType<typeof dateParts>;
  daySchedule: { parity: string | null; classes: ClassItem[] };
  tomorrow: { key: string; classes: ClassItem[]; routine: RoutineResult | null };
  studyWeekLabel: string;
  settings: any;
  routine: RoutineResult | null;
  nowMinutes: number;
  dayTasks: any[];
  nextTasks: any[];
  assessments: Assessment[];
  onOpenAssessment: (item: Assessment) => void;
  onOpenHomework: (item: any) => void;
  onAddHomework: (item: ClassItem) => void;
  deadlines: any[];
  dayNames: string[];
  navigate: (view: any, homeworkTab?: string) => void;
  vibrate: () => void;
  onOpenExceptionModal?: (item: ClassItem) => void;
  onDeleteException?: (id: string) => void;
}

export function HomeView({
  selected,
  setSelected,
  weekOffset,
  setWeekOffset,
  weekDates,
  todayKey,
  selectedInfo,
  daySchedule,
  tomorrow,
  studyWeekLabel,
  settings,
  routine,
  nowMinutes,
  dayTasks,
  nextTasks,
  deadlines,
  dayNames,
  navigate,
  vibrate,
  onOpenExceptionModal,
  onDeleteException,
  assessments,
  onOpenAssessment,
  onOpenHomework,
  onAddHomework,
}: HomeViewProps) {
  const isToday = selectedInfo.key === todayKey;
  const upcoming = daySchedule.classes.find(
    (item) =>
      !item.isCancelled &&
      (!isToday || nowMinutes < (item.end ? min(item.end) : min(item.start) + 90))
  );
  const focusTomorrow = isToday && !upcoming;
  const focusClass =
    upcoming || (focusTomorrow ? tomorrow.classes.find((item) => !item.isCancelled) : null);
  const focusRoutine = focusTomorrow ? tomorrow.routine : routine;
  const morningRoutine = focusRoutine;
  const morningKey = focusTomorrow ? tomorrow.key : selectedInfo.key;
  const currentlyInClass = isToday && !!upcoming && nowMinutes >= min(upcoming.start);
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
  const semesterYear = Number(String(settings.semester_start || todayKey).slice(0, 4));
  const semesterMonth = Number(String(settings.semester_start || todayKey).slice(5, 7));
  const academicYear = semesterMonth >= 8 ? semesterYear : semesterYear - 1;
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name?.trim();
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(
      new Date()
    )
  );
  const greeting =
    hour >= 5 && hour < 12
      ? 'Доброе утро'
      : hour < 18 && hour >= 12
        ? 'Добрый день'
        : hour >= 18 && hour < 23
          ? 'Добрый вечер'
          : 'Доброй ночи';
  const pendingHomework = nextTasks.filter((x) => x.due_date >= todayKey);
  const pendingEvents = assessments.filter((x) => !x.completed && x.date >= todayKey);
  const nearest = [
    ...pendingHomework.map((x) => ({
      id: x.id,
      title: x.title,
      date: x.due_date,
      time: x.due_at
        ? new Date(x.due_at).toLocaleTimeString('ru-RU', {
            timeZone: TZ,
            hour: '2-digit',
            minute: '2-digit',
          })
        : '',
      label: 'ДЗ',
      open: () => onOpenHomework(x),
    })),
    ...pendingEvents.map((x) => ({
      id: x.id,
      title: x.subject,
      date: x.date,
      time: x.time || '',
      label: assessmentLabel(x.kind),
      open: () => onOpenAssessment(x),
    })),
  ].sort((a, b) =>
    `${a.date}${a.time || '23:59'}`.localeCompare(`${b.date}${b.time || '23:59'}`)
  )[0];
  const overdue = deadlines.filter((x) => x.due_date < todayKey).length;
  const dateLabel = (date: string) =>
    date === todayKey ? 'Сегодня' : fmtDate(date, { day: 'numeric', month: 'short' });
  const leavePassed =
    isToday &&
    !focusTomorrow &&
    focusRoutine?.leaveMin != null &&
    nowMinutes > focusRoutine.leaveMin;
  return (
    <div className="calm-home">
      <section className="home-greeting">
        <p>
          {greeting}
          {user ? `, ${user}` : ''}
        </p>
        <h1>
          {isToday ? 'Твой день' : fmtDate(selectedInfo.key, { day: 'numeric', month: 'long' })}
        </h1>
        <span>
          {fmtDate(todayKey, { weekday: 'long', day: 'numeric', month: 'long' })} · Кишинёв
        </span>
      </section>
      <button
        type="button"
        className="home-next-class"
        aria-label="Открыть расписание ближайшего занятия"
        onClick={() => navigate('schedule')}
      >
        <span className="home-card-label">
          <GraduationCap size={16} />
          {currentlyInClass
            ? 'Сейчас идёт'
            : focusTomorrow
              ? 'Завтра'
              : isToday
                ? 'Следующая пара'
                : 'В этот день'}
          <ArrowUpRight size={16} />
        </span>
        {focusClass ? (
          <>
            <div className="home-class-line">
              <h2>{focusClass.title}</h2>
              <strong>{focusClass.start}</strong>
            </div>
            <p>
              <MapPin size={14} />
              {focusClass.online ? 'Онлайн' : focusClass.place || 'Аудитория уточняется'}
            </p>
            {currentlyInClass && <small>До {focusClass.end || 'конца занятия'}</small>}
          </>
        ) : (
          <>
            <h2>Можно выдохнуть</h2>
            <p>Занятий {focusTomorrow ? 'сегодня и завтра' : 'в этот день'} нет.</p>
          </>
        )}
      </button>
      {focusClass && (
        <button
          type="button"
          className="home-quick-homework"
          onClick={() => onAddHomework(focusClass)}
        >
          + ДЗ по этой паре
        </button>
      )}
      <div className="home-essentials">
        <details className="home-leave-card">
          <summary>
            <span className="home-card-label">
              <ArrowUpRight size={15} />
              {focusTomorrow ? 'Выход завтра' : 'Выход из дома'}
            </span>
            <strong>{focusRoutine?.leave || 'Не нужен'}</strong>
            <small>
              {leavePassed
                ? 'По плану · время уже прошло'
                : focusRoutine?.leave
                  ? 'Дорога и запас учтены'
                  : 'Можно остаться дома'}
            </small>
          </summary>
          <p>
            Дорога {settings.travel_minutes ?? 35} мин + запас {settings.travel_buffer ?? 10} мин.
          </p>
          <button type="button" onClick={() => navigate('settings')}>
            Изменить время дороги <ChevronRight size={13} />
          </button>
        </details>
        <button
          type="button"
          className="home-deadline-card"
          onClick={() => (nearest ? nearest.open() : navigate('hw'))}
        >
          <span className="home-card-label">
            <Bell size={15} />
            Ближайший срок
          </span>
          <strong>{nearest ? dateLabel(nearest.date) : 'Всё спокойно'}</strong>
          <small>
            {nearest
              ? `${nearest.label}${nearest.time ? ` · ${nearest.time}` : ''}`
              : 'Заданий со сроком нет'}
          </small>
          {nearest && <span className="home-deadline-name">{nearest.title}</span>}
        </button>
      </div>
      {overdue > 0 && (
        <button type="button" className="home-overdue" onClick={() => navigate('hw', 'Просрочено')}>
          <CircleAlert size={14} />
          Просроченные задания: {overdue}
          <ChevronRight size={14} />
        </button>
      )}
      <details className="home-disclosure" id="home-day-schedule">
        <summary>
          <CalendarDays size={18} />
          <span>
            Расписание на день
            <small>
              {daySchedule.classes.filter((c) => !c.isCancelled).length
                ? `Занятий: ${daySchedule.classes.filter((c) => !c.isCancelled).length}`
                : 'Свободный день'}{' '}
              · {fmtDate(selectedInfo.key, { day: 'numeric', month: 'short' })}
            </small>
          </span>
          <ChevronRight size={17} />
        </summary>
        <div className="home-disclosure-body">
          <section className="week-card">
            <div className="week-head">
              <div>
                <b>
                  {weekOffset === 0
                    ? 'Эта неделя'
                    : weekOffset < 0
                      ? `${Math.abs(weekOffset)} нед. назад`
                      : `Через ${weekOffset} нед.`}
                </b>
                <span>
                  {fmtDate(dateParts(weekDates[0]).key, { day: 'numeric', month: 'short' })} —{' '}
                  {fmtDate(dateParts(weekDates[6]).key, { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <div className="week-arrows">
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset((x) => x - 1);
                    setSelected(addDays(selected, -7));
                  }}
                  aria-label="Предыдущая неделя"
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset((x) => x + 1);
                    setSelected(addDays(selected, 7));
                  }}
                  aria-label="Следующая неделя"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            <div className="week-strip">
              {weekDates.map((d, i) => {
                const dp = dateParts(d);
                const isToday = dp.key === todayKey;
                const chosen = dp.key === selectedInfo.key;
                const hasDeadlines = deadlines.some((t) => t.due_date === dp.key);

                return (
                  <button
                    key={dp.key}
                    type="button"
                    className={`date-pill ${chosen ? 'chosen' : ''} ${isToday ? 'today' : ''}`}
                    aria-pressed={chosen}
                    aria-label={fmtDate(dp.key, { weekday: 'long', day: 'numeric', month: 'long' })}
                    onClick={() => {
                      setSelected(d);
                      vibrate();
                    }}
                  >
                    <span>{shortDays[i]}</span>
                    <strong>{dp.day}</strong>
                    <i className={hasDeadlines ? 'dot due' : 'dot'} />
                  </button>
                );
              })}
            </div>

            <div className="parity-row">
              <span className={`parity-dot ${daySchedule.parity || 'unset'}`} />
              <span>{studyWeekLabel}</span>
              {(!settings.semester_start || !settings.first_week_parity) && (
                <button type="button" onClick={() => navigate('settings')}>
                  Указать семестр <ArrowUpRight size={13} />
                </button>
              )}
              <span className="week-corner">
                {academicYear}/{String(academicYear + 1).slice(2)}
              </span>
            </div>
          </section>

          <div className="section-heading">
            <div>
              <span className="eyebrow">{dayNames[selectedInfo.weekday - 1]}</span>
              <h2>{fmtDate(selectedInfo.key, { day: 'numeric', month: 'long' })}</h2>
            </div>
            {selectedInfo.key !== todayKey && (
              <button
                type="button"
                className="today-link"
                onClick={() => {
                  setSelected(new Date());
                  setWeekOffset(0);
                }}
              >
                Сегодня
              </button>
            )}
          </div>

          <section className="classes">
            {daySchedule.classes.length ? (
              daySchedule.classes.map((c, i) => {
                const isSelectedToday = selectedInfo.key === todayKey;
                const startM = min(c.start);
                const endM = c.end ? min(c.end) : startM + 90;
                const isNow =
                  !c.isCancelled && isSelectedToday && nowMinutes >= startM && nowMinutes < endM;

                return (
                  <article
                    className={`class-card ${c.online ? 'online' : ''} ${isNow ? 'current' : ''} ${
                      c.isCancelled ? 'cancelled' : ''
                    } ${c.isMoved ? 'moved' : ''}`}
                    key={`${c.start}-${c.title}-${i}`}
                  >
                    <div className="time-col">
                      <strong>{c.start}</strong>
                      <span>{c.end || 'время уточнить'}</span>
                      <i className="timeline-dot" />
                    </div>
                    <div className="class-content">
                      {isNow && (
                        <div className="current-badge">
                          <i className="current-dot" />
                          <span style={{ marginLeft: 4 }}>Сейчас идёт</span>
                        </div>
                      )}

                      {c.isCancelled && (
                        <div className="exception-badge cancel">
                          <Ban size={13} />
                          <span>Пара отменена на этот день</span>
                        </div>
                      )}

                      {c.isMoved && (
                        <div className="exception-badge move">
                          <Clock size={13} />
                          <span>Пара перенесена на этот день</span>
                        </div>
                      )}

                      <div className={`class-title ${c.isCancelled ? 'strikethrough' : ''}`}>
                        {c.title}
                        {c.kind && <span className="kind">{c.kind}</span>}
                      </div>

                      {c.exceptionNote && (
                        <div className="exception-note-text">«{c.exceptionNote}»</div>
                      )}

                      <div className="class-meta">
                        {c.online ? (
                          <>
                            <span>
                              <Sunrise size={14} /> Онлайн
                            </span>
                            <span>
                              {c.durationUnknown && settings.english_duration
                                ? `${settings.english_duration} мин`
                                : c.durationUnknown
                                  ? 'Длительность не указана'
                                  : c.place}
                            </span>
                          </>
                        ) : (
                          <span>
                            <MapPin size={14} />
                            {c.place}
                          </span>
                        )}
                      </div>
                      {c.online && c.durationUnknown && !settings.english_duration && (
                        <button
                          type="button"
                          className="inline-warn"
                          onClick={() => navigate('settings')}
                        >
                          <CircleAlert size={13} /> Укажи длительность урока
                        </button>
                      )}

                      <div className="class-card-footer-actions">
                        {!c.isCancelled && (
                          <button
                            type="button"
                            className="class-homework-action"
                            onClick={() => onAddHomework(c)}
                          >
                            + ДЗ по этой паре
                          </button>
                        )}
                        {c.isCancelled || c.isMoved ? (
                          <button
                            type="button"
                            className="exception-reset-link"
                            onClick={() => {
                              vibrate();
                              if (c.exceptionId && onDeleteException) {
                                onDeleteException(c.exceptionId);
                              }
                            }}
                          >
                            <RotateCcw size={12} /> Вернуть как обычно
                          </button>
                        ) : (
                          onOpenExceptionModal && (
                            <button
                              type="button"
                              className="exception-action-link"
                              onClick={() => {
                                vibrate();
                                onOpenExceptionModal(c);
                              }}
                            >
                              <CalendarClock size={13} /> Изменить на эту дату
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    <div className={`class-index c${i % 4}`}>{String(i + 1).padStart(2, '0')}</div>
                  </article>
                );
              })
            ) : (
              <div className="empty-day">
                <span className="empty-sun">☼</span>
                <b>Занятий нет</b>
                <p>Можно выдохнуть и заняться своими делами.</p>
              </div>
            )}
          </section>
        </div>
      </details>
      <details className="home-disclosure">
        <summary>
          <Moon size={18} />
          <span>
            Сон и сборы
            <small>
              {morningRoutine
                ? `Подъём ${morningRoutine.wake} · отбой ${morningRoutine.bed}`
                : 'В расписании пока нет занятий'}
            </small>
          </span>
          <ChevronRight size={17} />
        </summary>
        <div className="home-disclosure-body home-morning">
          {morningRoutine ? (
            <>
              <p>
                План на {fmtDate(morningKey, { day: 'numeric', month: 'long' })} · цель сна{' '}
                {settings.sleep_hours ?? 8} ч
              </p>
              <div className="home-routine-steps">
                <span>
                  <Droplets size={15} />
                  Душ <b>{morningRoutine.wash}</b>
                </span>
                <span>
                  <Utensils size={15} />
                  Завтрак <b>{morningRoutine.breakfast}</b>
                </span>
                <span>
                  <Clock3 size={15} />
                  Сборы <b>{morningRoutine.getready}</b>
                </span>
                {morningRoutine.leave && (
                  <span>
                    <ArrowUpRight size={15} />
                    Выход <b>{morningRoutine.leave}</b>
                  </span>
                )}
              </div>
              {morningRoutine.freeMinutes > 0 && (
                <p>После сборов свободно: {morningRoutine.freeTimeFormatted}</p>
              )}
              {morningRoutine.warning && <p className="warn-text">{morningRoutine.warning}</p>}
            </>
          ) : (
            <p>Когда появятся занятия, здесь будет план утра.</p>
          )}
        </div>
      </details>
    </div>
  );
}
