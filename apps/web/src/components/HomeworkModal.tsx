import React, { useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { TZ, zonedIso } from '../lib/time.js';

interface HomeworkModalProps {
  item: any | null;
  reminderMinutes: number;
  subjects: string[];
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
}

export function HomeworkModal({
  item,
  subjects,
  reminderMinutes,
  onClose,
  onSave,
}: HomeworkModalProps) {
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(item?.title || '');
  const [subject, setSubject] = useState(item?.subject || '');
  const [dueDate, setDueDate] = useState(item?.due_date || '');
  const [dueTime, setDueTime] = useState(
    item?.due_at
      ? new Date(item.due_at).toLocaleTimeString('ru-RU', {
          timeZone: TZ,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : ''
  );
  const [note, setNote] = useState(item?.note || '');
  const [remind, setRemind] = useState(item?.telegram_reminder || false);
  const [custom, setCustom] = useState(Boolean(item?.subject && !subjects.includes(item.subject)));

  const handleSave = async () => {
    if (!title.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave({
        id: item?.id,
        title: title.trim(),
        subject: subject || null,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        dueAt: dueDate && dueTime ? zonedIso(dueDate, dueTime) : null,
        note: note || null,
        telegramReminder: remind,
        completed: item?.completed || false,
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
            <span className="eyebrow">{item ? 'ИЗМЕНИ ЗАДАНИЕ' : 'НОВОЕ ЗАДАНИЕ'}</span>
            <h2>{item ? 'Редактировать' : 'Добавить ДЗ'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <X size={19} />
          </button>
        </header>

        <label>
          Что нужно сделать?
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например, решить задачи 1–5"
            maxLength={200}
          />
        </label>

        <label>
          Предмет <span className="optional">необязательно</span>
          <div className="subject-chips">
            {subjects.map((s) => (
              <button
                key={s}
                type="button"
                className={subject === s ? 'on' : ''}
                onClick={() => {
                  setSubject(subject === s ? '' : s);
                  setCustom(false);
                }}
              >
                {s}
              </button>
            ))}
            <button type="button" className={custom ? 'on' : ''} onClick={() => setCustom(true)}>
              Свой
            </button>
          </div>
          {custom && (
            <input
              value={subjects.includes(subject) ? '' : subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Введи предмет"
            />
          )}
        </label>

        <label>
          Дата срока <span className="optional">можно не указывать</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>

        {dueDate && (
          <label>
            Время сдачи <span className="optional">необязательно</span>
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </label>
        )}

        <label>
          Заметка <span className="optional">необязательно</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Страница, тема или другие детали"
            rows={2}
          />
        </label>

        {dueDate && (
          <button
            type="button"
            className={`reminder-setting ${remind ? 'on' : ''}`}
            onClick={() => setRemind(!remind)}
          >
            <Bell size={16} />
            <span>
              <b>Напомнить в Telegram</b>
              <small>
                {dueTime ? `За ${reminderMinutes} мин до срока` : 'Утром в 09:00 по Кишинёву'}
              </small>
            </span>
            <span className="switch" />
          </button>
        )}

        <button
          type="button"
          className="primary-btn"
          disabled={!title.trim() || saving}
          onClick={handleSave}
        >
          {saving ? 'Сохраняем…' : item ? 'Сохранить' : 'Добавить задание'}
        </button>

        <p className="modal-foot">Без срока — значит без срока. Я ничего не назначу сама.</p>
      </section>
    </div>
  );
}
