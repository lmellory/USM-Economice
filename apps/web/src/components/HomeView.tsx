import React from 'react';
import {
  ArrowUpRight,
  Ban,
  Bell,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Clock3,
  Coffee,
  Droplets,
  MapPin,
  Moon,
  RotateCcw,
  Sunrise,
  Utensils,
  Wind,
} from 'lucide-react';
import {
  ClassItem,
  RoutineResult,
  shortDays,
} from '../lib/plan.js';
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
  studyWeekLabel: string;
  settings: any;
  routine: RoutineResult | null;
  nowMinutes: number;
  dayTasks: any[];
  nextTasks: any[];
  deadlines: any[];
  dayNames: string[];
  navigate: (view: any) => void;
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
}: HomeViewProps) {
  const headerTime = new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  const currentHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date())
  );

  const tgFirstName =
    typeof window !== 'undefined'
      ? window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name?.trim()
      : undefined;

  let timeOfDayGreeting = 'Доброе утро';
  if (currentHour >= 5 && currentHour < 12) {
    timeOfDayGreeting = 'Доброе утро';
  } else if (currentHour >= 12 && currentHour < 18) {
    timeOfDayGreeting = 'Добрый день';
  } else if (currentHour >= 18 && currentHour < 23) {
    timeOfDayGreeting = 'Добрый вечер';
  } else {
    timeOfDayGreeting = 'Доброй ночи';
  }

  const personalizedGreeting = tgFirstName
    ? `${timeOfDayGreeting}, ${tgFirstName}.`
    : `${timeOfDayGreeting}.`;

  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

  return (
    <>
      <section className="greeting">
        <div>
          <div className="eyebrow">
            {dayNames[dateParts(new Date()).weekday - 1]} ·{' '}
            {fmtDate(todayKey, { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <h1>{personalizedGreeting}</h1>
        </div>
        <div className="clock">
          <Clock3 size={15} />
          {headerTime}
          <small>Кишинёв</small>
        </div>
      </section>

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
          <span className="week-corner">I семестр · 2026/27</span>
        </div>
      </section>

      <div className="section-heading">
        <div>
          <span className="eyebrow">{dayNames[selectedInfo.weekday - 1]}</span>
          <h2>{fmtDate(selectedInfo.key, { day: 'numeric', month: 'long' })}</h2>
        </div>
        {selectedInfo.key !== todayKey && (
          <button type="button" className="today-link" onClick={() => setSelected(new Date())}>
            Сегодня
          </button>
        )}
      </div>

      {dayTasks.length > 0 && (
        <section
          className="deadline-banner"
          onClick={() => {
            vibrate();
            navigate('hw');
          }}
        >
          <div className="deadline-icon">
            <Bell size={15} />
          </div>
          <div className="deadline-body">
            <strong>Сдать сегодня ({dayTasks.length})</strong>
            <p>
              {dayTasks
                .slice(0, 2)
                .map((x: any) => x.title)
                .join(' · ')}
              {dayTasks.length > 2 ? ` и ещё ${dayTasks.length - 2}` : ''}
            </p>
          </div>
          <ChevronRight size={16} className="deadline-arrow" />
        </section>
      )}

      {routine && routine.freeMinutes > 0 && (
        <section className="free-time-banner">
          <div className="free-time-badge-icon">
            <Coffee size={15} />
          </div>
          <div className="free-time-body">
            <strong>Свободно {routine.freeTimeFormatted}</strong>
            <span>до {routine.leave ? `выхода в ${routine.leave}` : `пары в ${routine.first.start}`}</span>
          </div>
        </section>
      )}

      <section className="classes">
        {daySchedule.classes.length ? (
          daySchedule.classes.map((c, i) => {
            const isSelectedToday = selectedInfo.key === todayKey;
            const startM = min(c.start);
            const endM = c.end ? min(c.end) : startM + 90;
            const isNow = !c.isCancelled && isSelectedToday && nowMinutes >= startM && nowMinutes < endM;

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

      <section className="bottom-grid">
        <div className="widget sleep">
          <div className="widget-top">
            <span className="icon-chip lavender">
              <Moon size={16} />
            </span>
            <span className="widget-label">ТВОЁ УТРО</span>
          </div>
          {routine ? (
            <>
              <b>Подъём в {routine.wake}</b>
              <p>
                Сон: отбой в {routine.bed} · цель {settings.sleep_hours || 8} ч
              </p>
              <div className="morning-timeline-strip">
                <div className="morning-step">
                  <Droplets size={12} />
                  <span>Душ {routine.wash}</span>
                </div>
                <div className="morning-step">
                  <Utensils size={12} />
                  <span>Завтрак {routine.breakfast}</span>
                </div>
                <div className="morning-step">
                  <Clock3 size={12} />
                  <span>Сборы {routine.getready}</span>
                </div>
                {routine.leave && (
                  <div className="morning-step accent">
                    <ArrowUpRight size={12} />
                    <span>Выйти {routine.leave}</span>
                  </div>
                )}
              </div>
              {routine.warning && (
                <small className="warn-text">
                  <CircleAlert size={12} /> {routine.warning}
                </small>
              )}
            </>
          ) : (
            <>
              <b>Завтра свободно</b>
              <p>В расписании пока нет занятий.</p>
            </>
          )}
        </div>
      </section>

      {nextTasks.length > 0 && (
        <section className="next-due">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">НЕ ЗАБУДЬ</span>
              <h2>Ближайшие сроки</h2>
            </div>
            <button type="button" className="today-link" onClick={() => navigate('hw')}>
              Все <ChevronRight size={14} />
            </button>
          </div>
          {nextTasks.map((x: any) => (
            <div className="due-row" key={x.id}>
              <div className="due-marker" />
              <div>
                <strong>{x.title}</strong>
                <span>{x.subject || 'Без предмета'}</span>
              </div>
              <time>
                {x.due_date === todayKey
                  ? 'Сегодня'
                  : fmtDate(x.due_date, { day: 'numeric', month: 'short' })}
                {x.due_at &&
                  ` · ${new Date(x.due_at).toLocaleTimeString('ru-RU', {
                    timeZone: TZ,
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`}
              </time>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
