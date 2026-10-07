import React from 'react';
import {
  ArrowUpRight,
  Bell,
  Bus,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Footprints,
  MapPin,
  Moon,
  Sunrise,
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
  studyWeekLabel: string;
  settings: any;
  transit: any;
  routine: RoutineResult | null;
  nowMinutes: number;
  dayTasks: any[];
  nextTasks: any[];
  deadlines: any[];
  dayNames: string[];
  navigate: (view: any) => void;
  vibrate: () => void;
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
  transit,
  routine,
  nowMinutes,
  dayTasks,
  nextTasks,
  deadlines,
  dayNames,
  navigate,
  vibrate,
}: HomeViewProps) {
  const headerTime = new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  const targetCampus = daySchedule.classes.find((c) => !c.online);
  const isSports = Boolean(
    targetCampus &&
    (targetCampus.place.includes('Ismail') || targetCampus.title.includes('Физкультура'))
  );
  const campusDestination = targetCampus
    ? isSports
      ? 'Спорткомплекс (Ismail 1)'
      : 'Центральный корпус USM'
    : 'Сегодня очных пар нет';
  const campusRoutes = isSports
    ? ['1', '4', '8', '17', '22', '30']
    : ['2', '3', '7', '10', '12', '24', '46'];

  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

  return (
    <>
      <section className="greeting">
        <div>
          <div className="eyebrow">
            {dayNames[dateParts(new Date()).weekday - 1]} ·{' '}
            {fmtDate(todayKey, { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <h1>
            Твой день,
            <br />
            <em>без спешки.</em>
          </h1>
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
        <section className="deadline-banner">
          <div className="deadline-icon">
            <Bell size={17} />
          </div>
          <div>
            <strong>Сдать сегодня</strong>
            <p>
              {dayTasks
                .slice(0, 2)
                .map((x: any) => x.title)
                .join(' · ')}
              {dayTasks.length > 2 ? ` и ещё ${dayTasks.length - 2}` : ''}
            </p>
          </div>
          <button type="button" onClick={() => navigate('hw')} aria-label="Открыть задания">
            <ChevronRight size={18} />
          </button>
        </section>
      )}

      <section className="classes">
        {daySchedule.classes.length ? (
          daySchedule.classes.map((c, i) => {
            const isSelectedToday = selectedInfo.key === todayKey;
            const startM = min(c.start);
            const endM = c.end ? min(c.end) : startM + 90;
            const isNow = isSelectedToday && nowMinutes >= startM && nowMinutes < endM;

            return (
              <article
                className={`class-card ${c.online ? 'online' : ''} ${isNow ? 'current' : ''}`}
                key={`${c.start}-${c.title}`}
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
                  <div className="class-title">
                    {c.title}
                    {c.kind && <span className="kind">{c.kind}</span>}
                  </div>
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
        <div className="widget journey">
          <div className="widget-top">
            <span className="icon-chip peach">
              <Bus size={16} />
            </span>
            <span className="widget-label">ДОРОГА</span>
            <span className={`live-badge ${transit.available ? 'on' : ''}`}>
              <i />
              {transit.available ? `${transit.liveVehicleCount || 0} онлайн` : 'оценка'}
            </span>
          </div>
          <b>~{settings.travel_minutes || transit.estimateMinutes || 35} минут</b>
          <p className="journey-target">{campusDestination}</p>
          {targetCampus ? (
            <>
              <div className="leave-row">
                <span>
                  {routine?.leave ? `Выход в ${routine.leave}` : `Начало в ${targetCampus.start}`}
                </span>
                <small>запас {settings.travel_buffer || 10} мин</small>
              </div>
              <div className="route-pills">
                {campusRoutes.slice(0, 5).map((r) => (
                  <span key={r}>№{r}</span>
                ))}
              </div>
            </>
          ) : (
            <div className="journey-line">
              <Footprints size={14} />
              <i />
              <Bus size={15} />
              <i />
              <MapPin size={14} />
            </div>
          )}
          <small>
            {transit.available
              ? 'RTEC / PUA на линии в Кишинёве'
              : `Время в пути: ~${settings.travel_minutes || 35} мин`}
          </small>
        </div>

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
                Лечь в {routine.bed} · сон {settings.sleep_hours} ч
              </p>
              <div className="mini-plan">
                <span>
                  <Sunrise size={13} /> Умыться {routine.wash}
                </span>
                <span>
                  <Clock3 size={13} /> Позавтракать {routine.breakfast}
                </span>
                <span>
                  <Clock3 size={13} /> Собраться {routine.getready}
                </span>
                {routine.leave && (
                  <span>
                    <ArrowUpRight size={13} /> Выйти {routine.leave}
                  </span>
                )}
                {routine.arrive && (
                  <span>
                    <MapPin size={13} /> Прибыть {routine.arrive}
                  </span>
                )}
              </div>
              {routine.commuteUncertain && (
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
