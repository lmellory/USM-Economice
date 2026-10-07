import React from 'react';
import {
  ArrowUpRight,
  Ban,
  Bell,
  Bus,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Clock3,
  Coffee,
  Droplets,
  Footprints,
  MapPin,
  Moon,
  RotateCcw,
  RotateCw,
  Settings2,
  Sparkles,
  Sunrise,
  Utensils,
  Wind,
} from 'lucide-react';
import {
  ClassItem,
  CommuteOption,
  CommuteOptionResult,
  DestinationType,
  RoutineResult,
  TrackedTrolleySummary,
  LiveTrackedVehicle,
  shortDays,
} from '../lib/plan.js';
import { dateParts, fmtDate, min, TZ } from '../lib/time.js';
import { TransitMiniMap } from './TransitMiniMap.js';

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
  onOpenExceptionModal?: (item: ClassItem) => void;
  onDeleteException?: (id: string) => void;
  commuteOptions?: CommuteOption[];
  onOpenCommuteSettings?: () => void;
  request?: (path: string, options?: any) => Promise<any>;
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
  onOpenExceptionModal,
  onDeleteException,
  commuteOptions,
  onOpenCommuteSettings,
  request,
}: HomeViewProps) {
  const headerTime = new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  const targetCampus = daySchedule.classes.find((c) => !c.online);
  const isSports = Boolean(
    targetCampus &&
      (targetCampus.destination === 'sports' ||
        targetCampus.place.includes('Ismail') ||
        targetCampus.title.includes('Физкультура'))
  );
  const campusDestination = targetCampus
    ? isSports
      ? 'Спорткомплекс (Ismail 1)'
      : 'Центральный корпус USM'
    : 'Сегодня очных пар нет';

  const [commuteLive, setCommuteLive] = React.useState<{
    options: CommuteOptionResult[];
    trackedTrolleys?: TrackedTrolleySummary[];
    liveVehicles?: LiveTrackedVehicle[];
    liveStatus?: any;
    updatedAt: number;
  } | null>(null);
  const [loadingCommute, setLoadingCommute] = React.useState(false);
  const [secondsAgo, setSecondsAgo] = React.useState(0);

  const fetchCommute = React.useCallback(async () => {
    if (!request || !targetCampus) return;
    setLoadingCommute(true);
    try {
      const destType = isSports ? 'sports' : 'university';
      const res = await request(
        `/api/transit/commute?destination=${destType}&time=${encodeURIComponent(targetCampus.start)}`
      );
      setCommuteLive({
        options: res.options || [],
        trackedTrolleys: res.trackedTrolleys || [],
        liveVehicles: res.liveVehicles || [],
        liveStatus: res.liveStatus,
        updatedAt: Date.now(),
      });
      setSecondsAgo(0);
    } catch {
      // ignore
    } finally {
      setLoadingCommute(false);
    }
  }, [request, targetCampus, isSports]);

  React.useEffect(() => {
    fetchCommute();
    // Auto-refresh real-time vehicles every 25 seconds
    const interval = setInterval(() => {
      fetchCommute();
    }, 25000);
    return () => clearInterval(interval);
  }, [fetchCommute]);

  React.useEffect(() => {
    const t = setInterval(() => {
      if (commuteLive?.updatedAt) {
        setSecondsAgo(Math.floor((Date.now() - commuteLive.updatedAt) / 1000));
      }
    }, 5000);
    return () => clearInterval(t);
  }, [commuteLive?.updatedAt]);

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

      {routine && routine.freeMinutes > 0 && (
        <section className="free-time-banner">
          <div className="free-time-badge-icon">
            <Coffee size={18} />
          </div>
          <div className="free-time-body">
            <div className="free-time-header">
              <strong>Свободное время: {routine.freeTimeFormatted}</strong>
              <span className="free-time-span">до {routine.leave ? `выхода в ${routine.leave}` : `пары в ${routine.first.start}`}</span>
            </div>
            <p>
              После душа, завтрака и сборов можно спокойно чиллить и ничего не делать! ✨
            </p>
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
        <div className="widget journey">
          <div className="widget-top">
            <span className="icon-chip peach">
              <Bus size={16} />
            </span>
            <span className="widget-label">ДОРОГА</span>
            <span
              className={`live-badge ${commuteLive?.liveStatus?.available || transit.available ? 'on' : ''}`}
            >
              <i />
              {commuteLive?.liveStatus?.available || transit.available
                ? `${commuteLive?.liveStatus?.vehicleCount ?? transit.liveVehicleCount ?? 0} онлайн`
                : 'оценка'}
            </span>
          </div>
          <p className="journey-target">{campusDestination}</p>

          {targetCampus ? (
            <div className="commute-options-container">
              {commuteLive?.trackedTrolleys && commuteLive.trackedTrolleys.length > 0 && (
                <div className="tracked-trolleys-box">
                  <div className="tracked-trolleys-title">
                    <span className="live-pulse-dot" />
                    <span>Троллейбусы на линии</span>
                  </div>
                  <div className="tracked-trolleys-grid">
                    {commuteLive.trackedTrolleys.map((t) => (
                      <div key={t.route_short_name} className="tracked-trolley-chip">
                        <div className="trolley-chip-top">
                          <strong className="trolley-badge">№{t.route_short_name}</strong>
                          <span className="trolley-online-count">
                            {t.vehiclesOnLineCount} на рейсе
                          </span>
                        </div>
                        <div className="trolley-chip-body">
                          <span className="trolley-marker-info">
                            📍 {t.nearbyVehiclesCount > 0 ? `${t.nearbyVehiclesCount} у метки` : 'нет у метки'}
                          </span>
                          {t.closestDistanceMeters != null ? (
                            <span className="trolley-closest-info">
                              {t.closestDistanceMeters} м (~{t.closestEtaMinutes} мин){t.closestVehicleLabel ? ` · борт ${t.closestVehicleLabel}` : ''}
                            </span>
                          ) : (
                            <span className="trolley-closest-none">ожидание GPS</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Interactive Real-Time Transit Mini-Map */}
              <TransitMiniMap
                vehicles={commuteLive?.liveVehicles || []}
                boardStop={
                  commuteLive?.options?.[0]?.legs?.[0]?.boardStopName
                    ? {
                        stop_id: 101,
                        stop_name: commuteLive.options[0].legs[0].boardStopName,
                        stop_lat: 46.9825,
                        stop_lon: 28.865,
                      }
                    : undefined
                }
                theme={settings.theme || 'light'}
                onRefresh={fetchCommute}
              />

              {commuteLive?.options && commuteLive.options.length > 0 ? (
                <div className={`commute-options-grid ${isSports ? 'single' : 'double'}`}>
                  {commuteLive.options.map((opt) => (
                    <div
                      key={opt.id}
                      className={`commute-card ${opt.isRecommended ? 'recommended' : ''} ${!opt.isConfigured ? 'unconfigured' : ''}`}
                    >
                      <div className="commute-card-head">
                        <b>{opt.name}</b>
                        {opt.isRecommended && <span className="rec-badge">Быстрее</span>}
                      </div>

                      {!opt.isConfigured ? (
                        <div className="commute-unconfigured-content">
                          <small>Остановки не подтверждены</small>
                          {onOpenCommuteSettings && (
                            <button
                              type="button"
                              className="commute-setup-btn"
                              onClick={() => {
                                vibrate();
                                onOpenCommuteSettings();
                              }}
                            >
                              <Settings2 size={13} /> Настрой дорогу
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="commute-metric-row">
                            <span className="metric-label">Выход из дома:</span>
                            <b className="metric-value">
                              {opt.leaveInMinutes <= 0
                                ? 'сейчас'
                                : `через ${opt.leaveInMinutes} мин`}
                            </b>
                          </div>

                          <div className="commute-metric-row">
                            <span className="metric-label">В пути:</span>
                            <span className="metric-value">~{opt.totalDurationMinutes} мин</span>
                          </div>

                          <div className="commute-metric-row">
                            <span className="metric-label">Прибудешь:</span>
                            <span className="metric-value">около {opt.arrivalEstimated}</span>
                          </div>

                          <div className="commute-live-telemetry">
                            <div className="telemetry-item">
                              <span className="telemetry-label">На рейсе:</span>
                              <strong className="telemetry-val">
                                {opt.vehiclesOnLineCount ?? 0} машин
                              </strong>
                            </div>
                            <div className="telemetry-item">
                              <span className="telemetry-label">У метки:</span>
                              <strong className="telemetry-val">
                                {opt.nearbyVehiclesCount ?? 0} шт.
                              </strong>
                            </div>
                          </div>

                          {opt.closestVehicleDistanceMeters != null && (
                            <div className="commute-closest-vehicle-bar">
                              <span>Ближайший: <b>{opt.closestVehicleDistanceMeters} м</b> (~{opt.closestVehicleEtaMinutes} мин)</span>
                              {opt.closestVehicleLabel && (
                                <span className="vehicle-fleet-num">борт {opt.closestVehicleLabel}</span>
                              )}
                            </div>
                          )}

                          <div className="commute-card-footer">
                            <span className={`source-pill ${opt.source}`}>
                              {opt.sourceLabel}
                            </span>
                            {opt.legs && opt.legs.length > 0 && (
                              <span className="legs-summary">
                                {opt.legs
                                  .map((l) =>
                                    l.mode === 'any_trolleybus'
                                      ? `пересадка (${l.chosenRouteName})`
                                      : `№${l.chosenRouteName}`
                                  )
                                  .join(' → ')}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="commute-loading-box">
                  <small>Оцениваем маршруты и позиции RTEC/PUA…</small>
                </div>
              )}

              <div className="commute-refresh-bar">
                <span className="refresh-time">
                  {secondsAgo < 5 ? 'обновлено только что' : `обновлено ${secondsAgo} с назад`}
                </span>
                <button
                  type="button"
                  className={`refresh-action-btn ${loadingCommute ? 'spinning' : ''}`}
                  onClick={() => {
                    vibrate();
                    fetchCommute();
                  }}
                  aria-label="Обновить позиции"
                >
                  <RotateCw size={12} /> Обновить
                </button>
              </div>
            </div>
          ) : (
            <div className="journey-line">
              <Footprints size={14} />
              <i />
              <Bus size={15} />
              <i />
              <MapPin size={14} />
            </div>
          )}
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
                Сон: отбой в {routine.bed} · цель {settings.sleep_hours || 8} ч
              </p>
              <div className="mini-plan">
                <span>
                  <Droplets size={13} /> Душ и голова {routine.wash}–{routine.washEnd} ({settings.wash_minutes || 20} мин)
                </span>
                <span>
                  <Wind size={13} /> Сушка волос {routine.hairDry}–{routine.hairDryEnd} ({settings.hair_dry_minutes || 5} мин)
                </span>
                <span>
                  <Utensils size={13} /> Завтрак {routine.breakfast}–{routine.breakfastEnd} ({settings.breakfast_minutes || 30} мин)
                </span>
                <span>
                  <Clock3 size={13} /> Сборы {routine.getready}–{routine.getreadyEnd} ({settings.get_ready_minutes || 10} мин)
                </span>
                {routine.freeMinutes > 0 && (
                  <span className="mini-plan-free">
                    <Coffee size={13} /> Свободно {routine.readyAt}–{routine.leave || routine.first.start} ({routine.freeTimeFormatted})
                  </span>
                )}
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
