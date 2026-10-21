import React, { useState } from 'react';
import { Ban, Calendar, Clock, Edit2, MapPin, Plus, Sunrise, Trash2, X } from 'lucide-react';
import { ClassItem, dayNames, ScheduleException, shortDays } from '../lib/plan.js';
import { dateParts, fmtDate } from '../lib/time.js';

interface ScheduleViewProps {
  schedule: ClassItem[];
  exceptions: ScheduleException[];
  onAddClass: (day: number) => void;
  onEditClass: (item: ClassItem) => void;
  onDeleteClass: (id: string) => void;
  onDeleteException: (id: string) => void;
  vibrate: () => void;
}

export function ScheduleView({
  schedule,
  exceptions,
  onAddClass,
  onEditClass,
  onDeleteClass,
  onDeleteException,
  vibrate,
}: ScheduleViewProps) {
  const [selectedDay, setSelectedDay] = useState(dateParts(new Date()).weekday);

  const dayClasses = schedule
    .filter((c) => c.day === selectedDay)
    .sort((a, b) => a.start.localeCompare(b.start));

  const upcomingExceptions = exceptions
    .filter((item) => item.date >= dateParts(new Date()).key)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="schedule-view">
      <header className="schedule-header">
        <div>
          <span className="eyebrow">НЕДЕЛЬНАЯ СЕТКА</span>
          <h2>Расписание пар</h2>
        </div>
        <button
          type="button"
          className="primary-button-small"
          onClick={() => {
            vibrate();
            onAddClass(selectedDay);
          }}
        >
          <Plus size={16} /> Добавить
        </button>
      </header>

      {/* Day of Week Selector */}
      <div className="schedule-days-strip">
        {shortDays.map((d, index) => {
          const dayNumber = index + 1;
          const count = schedule.filter((c) => c.day === dayNumber).length;
          const isChosen = dayNumber === selectedDay;

          return (
            <button
              key={d}
              type="button"
              className={`schedule-day-pill ${isChosen ? 'active' : ''}`}
              onClick={() => {
                setSelectedDay(dayNumber);
                vibrate();
              }}
            >
              <span>{d}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>

      <div className="section-heading" style={{ marginTop: 16 }}>
        <div>
          <span className="eyebrow">ДЕНЬ {selectedDay} ИЗ 7</span>
          <h2>{dayNames[selectedDay - 1]}</h2>
        </div>
      </div>

      <div className="classes" style={{ marginTop: 8 }}>
        {dayClasses.length > 0 ? (
          dayClasses.map((c, index) => (
            <article
              className={`class-card ${c.online ? 'online' : ''}`}
              key={c.id || `${c.start}-${c.title}-${index}`}
            >
              <div className="time-col">
                <strong>{c.start}</strong>
                <span>{c.end || 'уточнить'}</span>
                <i className="timeline-dot" />
              </div>

              <div className="class-content">
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
                      <span>{c.place}</span>
                    </>
                  ) : (
                    <span>
                      <MapPin size={14} /> {c.place}
                    </span>
                  )}
                </div>

                <div className="class-tags-row">
                  {c.parity === 'odd' && (
                    <span className="parity-badge odd">Нечётная неделя (I)</span>
                  )}
                  {c.parity === 'even' && (
                    <span className="parity-badge even">Чётная неделя (II)</span>
                  )}
                  {!c.parity && <span className="parity-badge all">Каждую неделю</span>}
                </div>
              </div>

              <div className="class-card-actions">
                <button
                  type="button"
                  className="icon-action-button"
                  onClick={() => {
                    vibrate();
                    onEditClass(c);
                  }}
                  title="Редактировать пару"
                  aria-label="Редактировать пару"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  type="button"
                  className="icon-action-button delete"
                  onClick={() => {
                    vibrate();
                    if (window.confirm(`Удалить пару «${c.title}»?`)) {
                      onDeleteClass(c.id!);
                    }
                  }}
                  title="Удалить пару"
                  aria-label="Удалить пару"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-day">
            <span className="empty-sun">☼</span>
            <b>В этот день пар нет</b>
            <p>Нажми «Добавить», чтобы внести пару в расписание.</p>
          </div>
        )}
      </div>

      {upcomingExceptions.length > 0 && (
        <section className="exceptions-section">
          <div className="section-heading" style={{ marginTop: 24 }}>
            <div>
              <span className="eyebrow">ТОЧЕЧНЫЕ ИЗМЕНЕНИЯ</span>
              <h2>Переносы и отмены</h2>
            </div>
          </div>

          <div className="exceptions-list">
            {upcomingExceptions.map((exc) => {
              const relatedClass = schedule.find((c) => c.id === exc.class_id);
              const isCancel = exc.type === 'cancel';

              return (
                <div key={exc.id} className={`exception-item-card ${isCancel ? 'cancel' : 'move'}`}>
                  <div className="exception-item-icon">
                    {isCancel ? <Ban size={18} /> : <Clock size={18} />}
                  </div>
                  <div className="exception-item-info">
                    <div className="exception-item-header">
                      <strong>{relatedClass?.title || 'Пара'}</strong>
                      <span className="exception-item-date">
                        <Calendar size={13} style={{ display: 'inline', marginRight: 3 }} />
                        {fmtDate(exc.date, { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <p>
                      {isCancel
                        ? `Отменена на этот день${exc.note ? ` (${exc.note})` : ''}`
                        : `Перенесена на ${exc.new_start || ''}${
                            exc.new_place ? ` · ${exc.new_place}` : ''
                          }${exc.note ? ` (${exc.note})` : ''}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="exception-remove-btn"
                    onClick={() => {
                      vibrate();
                      onDeleteException(exc.id);
                    }}
                    title="Сбросить исключение"
                    aria-label="Сбросить исключение"
                  >
                    <X size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
