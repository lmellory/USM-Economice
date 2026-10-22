import React, { useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { ClassItem, dayNames, WeekParity } from '../lib/plan.js';
import { Toggle } from './Toggle.js';

interface ClassModalProps {
  item: ClassItem | null;
  initialDay?: number;
  onClose: () => void;
  onSave: (payload: Partial<ClassItem>) => Promise<void>;
  onDelete?: (id: string) => void;
}

const KIND_PRESETS = ['лекция', 'семинар', 'лабораторная', 'онлайн', 'консультация'];

export function ClassModal({ item, initialDay = 1, onClose, onSave, onDelete }: ClassModalProps) {
  const [title, setTitle] = useState(item?.title || '');
  const [day, setDay] = useState(item?.day || initialDay);
  const [start, setStart] = useState(item?.start || '13:15');
  const [end, setEnd] = useState(item?.end || '14:45');
  const [kind, setKind] = useState(item?.kind || 'лекция');
  const [place, setPlace] = useState(item?.place || '');
  const [parity, setParity] = useState<WeekParity | 'all'>(item?.parity || 'all');
  const [online, setOnline] = useState(Boolean(item?.online));
  const [customKind, setCustomKind] = useState(
    Boolean(item?.kind && !KIND_PRESETS.includes(item.kind))
  );
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (savingRef.current) return;
    if (!title.trim()) {
      setError('Укажи название предмета');
      return;
    }
    if (!start.match(/^\d{2}:\d{2}$/)) {
      setError('Укажи корректное время начала (ЧЧ:ММ)');
      return;
    }
    if (end && !end.match(/^\d{2}:\d{2}$/)) {
      setError('Укажи корректное время окончания (ЧЧ:ММ)');
      return;
    }

    if (end && end <= start) {
      setError('Окончание должно быть позже начала');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave({
        id: item?.id,
        day: Number(day),
        start: start.trim(),
        end: end.trim() || undefined,
        title: title.trim(),
        kind: (customKind ? kind : kind) || undefined,
        place: online ? 'Дистанционно (дома)' : place.trim(),
        parity: parity === 'all' ? undefined : parity,
        online,
        destination: item?.destination || 'university',
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
            <span className="eyebrow">{item ? 'РЕДАКТИРОВАНИЕ ПАРЫ' : 'НОВАЯ ПАРА'}</span>
            <h2>{item ? 'Пара' : 'Добавить пару'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <X size={19} />
          </button>
        </header>

        {error && <div className="modal-error-banner">{error}</div>}

        <label>
          Предмет
          <input
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError('');
            }}
            placeholder="Например, Экономическая математика"
            maxLength={100}
          />
        </label>

        <label>
          День недели
          <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {dayNames.map((name, idx) => (
              <option key={name} value={idx + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <div className="form-row">
          <label>
            Начало
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label>
            Окончание
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>

        <label>
          Тип занятия
          <div className="subject-chips">
            {KIND_PRESETS.map((k) => (
              <button
                key={k}
                type="button"
                className={!customKind && kind === k ? 'on' : ''}
                onClick={() => {
                  setKind(k);
                  setCustomKind(false);
                }}
              >
                {k}
              </button>
            ))}
            <button
              type="button"
              className={customKind ? 'on' : ''}
              onClick={() => setCustomKind(true)}
            >
              Свой
            </button>
          </div>
          {customKind && (
            <input
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              placeholder="Например, коллоквиум"
              maxLength={50}
              style={{ marginTop: 8 }}
            />
          )}
        </label>

        <div style={{ marginTop: 12, marginBottom: 8 }}>
          <Toggle
            label="Онлайн-занятие (дистанционно)"
            value={online}
            onChange={(val) => {
              setOnline(val);
              if (val && !place) {
                setPlace('Дистанционно (дома)');
              }
            }}
          />
        </div>

        {!online && (
          <>
            <label>
              Аудитория / Корпус
              <input
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="Например, 145 · Центральный корпус"
                maxLength={100}
              />
            </label>
          </>
        )}

        <label>
          Периодичность (чётность)
          <div className="parity-segmented">
            <button
              type="button"
              className={parity === 'all' ? 'active' : ''}
              onClick={() => setParity('all')}
            >
              Каждую неделю
            </button>
            <button
              type="button"
              className={parity === 'odd' ? 'active' : ''}
              onClick={() => setParity('odd')}
            >
              Нечётная I
            </button>
            <button
              type="button"
              className={parity === 'even' ? 'active' : ''}
              onClick={() => setParity('even')}
            >
              Чётная II
            </button>
          </div>
        </label>

        <div className="modal-actions" style={{ marginTop: 20 }}>
          {item && onDelete && (
            <button
              type="button"
              className="delete-button"
              onClick={() => {
                if (window.confirm('Удалить эту пару из расписания?')) {
                  onDelete(item.id!);
                }
              }}
              style={{ marginRight: 'auto' }}
            >
              <Trash2 size={16} /> Удалить
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </section>
    </div>
  );
}
