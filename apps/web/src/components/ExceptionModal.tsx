import React, { useState } from 'react';
import { Ban, Clock, RotateCcw, X } from 'lucide-react';
import { ClassItem, ScheduleException } from '../lib/plan.js';
import { fmtDate } from '../lib/time.js';

interface ExceptionModalProps {
  classItem: ClassItem;
  date: string; // YYYY-MM-DD
  existingException: ScheduleException | null;
  onClose: () => void;
  onSave: (payload: {
    date: string;
    class_id: string;
    type: 'cancel' | 'move';
    new_start?: string | null;
    new_end?: string | null;
    new_place?: string | null;
    note?: string | null;
  }) => void;
  onDelete?: (exceptionId: string) => void;
}

export function ExceptionModal({
  classItem,
  date,
  existingException,
  onClose,
  onSave,
  onDelete,
}: ExceptionModalProps) {
  const [type, setType] = useState<'cancel' | 'move'>(existingException?.type || 'cancel');
  const [newStart, setNewStart] = useState(existingException?.new_start || classItem.start);
  const [newEnd, setNewEnd] = useState(existingException?.new_end || classItem.end || '');
  const [newPlace, setNewPlace] = useState(existingException?.new_place || classItem.place || '');
  const [note, setNote] = useState(existingException?.note || '');
  const [error, setError] = useState('');

  const dateFormatted = fmtDate(date, { day: 'numeric', month: 'long', weekday: 'short' });

  const handleSave = () => {
    if (type === 'move') {
      if (!newStart.match(/^\d{2}:\d{2}$/)) {
        setError('Укажи корректное время начала переноса (ЧЧ:ММ)');
        return;
      }
    }

    onSave({
      date,
      class_id: classItem.id!,
      type,
      new_start: type === 'move' ? newStart.trim() : null,
      new_end: type === 'move' && newEnd.trim() ? newEnd.trim() : null,
      new_place: type === 'move' && newPlace.trim() ? newPlace.trim() : null,
      note: note.trim() || null,
    });
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <section className="modal">
        <div className="modal-grab" />
        <header>
          <div>
            <span className="eyebrow">{dateFormatted.toUpperCase()}</span>
            <h2>Исключение для пары</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <X size={19} />
          </button>
        </header>

        {error && <div className="modal-error-banner">{error}</div>}

        <div className="exception-target-card">
          <strong>{classItem.title}</strong>
          <span>
            {classItem.start}
            {classItem.end ? `–${classItem.end}` : ''} · {classItem.place}
          </span>
        </div>

        <label>
          Действие на этот день
          <div className="type-toggle-row">
            <button
              type="button"
              className={type === 'cancel' ? 'on' : ''}
              onClick={() => setType('cancel')}
            >
              <Ban size={16} /> Отменить
            </button>
            <button
              type="button"
              className={type === 'move' ? 'on' : ''}
              onClick={() => setType('move')}
            >
              <Clock size={16} /> Перенести
            </button>
          </div>
        </label>

        {type === 'move' && (
          <>
            <div className="form-row">
              <label>
                Новое начало
                <input
                  type="time"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  required
                />
              </label>
              <label>
                Новое окончание
                <input
                  type="time"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                />
              </label>
            </div>

            <label>
              Новая аудитория / корпус
              <input
                value={newPlace}
                onChange={(e) => setNewPlace(e.target.value)}
                placeholder="Например, 214 · корпус 4А"
                maxLength={100}
              />
            </label>
          </>
        )}

        <label>
          Причина или заметка <span className="optional">необязательно</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              type === 'cancel'
                ? 'Например, преподаватель на конференции'
                : 'Например, перенос по договорённости с группой'
            }
            maxLength={200}
          />
        </label>

        <div className="modal-actions" style={{ marginTop: 20 }}>
          {existingException && onDelete && (
            <button
              type="button"
              className="delete-button"
              onClick={() => onDelete(existingException.id)}
              style={{ marginRight: 'auto' }}
            >
              <RotateCcw size={16} /> Сбросить
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="primary" onClick={handleSave}>
            Применить
          </button>
        </div>
      </section>
    </div>
  );
}
