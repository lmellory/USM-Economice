import { HomeworkAttachments, useHomeworkAttachments } from './HomeworkAttachments.js';
import { ReminderSelect } from './ReminderSelect.js';
import { reminderLabel } from '@usm/shared';
import React, { useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { TZ, zonedIso } from '../lib/time.js';

interface HomeworkModalProps {
  item: any | null;
  draft?: { subject: string; dueDate: string; dueTime: string } | null;
  reminderMinutes: number;
  remindersEnabled: boolean;
  nextClassFor: (subject: string) => { date: string; time: string } | null;
  subjects: string[];
  onClose: () => void;
  onSave: (payload: any) => Promise<any>;
  onBusyChange: (busy: boolean) => void;
}

export function HomeworkModal({
  item,
  draft,
  subjects,
  reminderMinutes,
  remindersEnabled,
  nextClassFor,
  onClose,
  onSave,
  onBusyChange,
}: HomeworkModalProps) {
  const requestId = useRef(crypto.randomUUID());
  const attachments = useHomeworkAttachments(item?.id);
  const [savedId, setSavedId] = useState<string | undefined>(item?.id);
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(item?.title || '');
  const [subject, setSubject] = useState(item?.subject || draft?.subject || '');
  const [dueDate, setDueDate] = useState(item?.due_date || draft?.dueDate || '');
  const [dueTime, setDueTime] = useState(
    item?.due_at
      ? new Date(item.due_at).toLocaleTimeString('ru-RU', {
          timeZone: TZ,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : draft?.dueTime || ''
  );
  const [note, setNote] = useState(item?.note || '');
  const [remind, setRemind] = useState(item?.telegram_reminder || false);
  const [offset, setOffset] = useState<number>(item?.reminder_minutes ?? reminderMinutes);
  const [custom, setCustom] = useState(Boolean(item?.subject && !subjects.includes(item.subject)));

  const nextClass = nextClassFor(subject);

  const handleSave = async () => {
    if (!title.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    onBusyChange(true);
    setSaveError('');
    try {
      const saved = await onSave({
        id: savedId,
        requestId: requestId.current,
        title: title.trim(),
        subject: subject || null,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        dueAt: dueDate && dueTime ? zonedIso(dueDate, dueTime) : null,
        note: note || null,
        telegramReminder: remind,
        reminderMinutes: offset,
        completed: item?.completed || false,
      });
      setSavedId(saved.id);
      await attachments.flush(saved.id);
      onClose();
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      onBusyChange(false);
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !savingRef.current && onClose()}
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
          <button type="button" onClick={onClose} disabled={saving} aria-label="Закрыть">
            <X size={19} />
          </button>
        </header>

        <fieldset className="hw-edit-fields" disabled={saving}>
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
                  aria-label={s}
                  aria-pressed={subject === s}
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

          {nextClass && (
            <button
              type="button"
              className="next-class-deadline"
              onClick={() => {
                setDueDate(nextClass.date);
                setDueTime(nextClass.time);
              }}
            >
              К следующей паре ·{' '}
              {new Date(nextClass.date + 'T12:00:00Z').toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
              })}
              , {nextClass.time}
            </button>
          )}

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
                <small>{reminderLabel(offset)}</small>
              </span>
              <span className="switch" />
            </button>
          )}

          {dueDate && remind && (
            <>
              <ReminderSelect
                value={offset}
                onChange={(v) => {
                  if (v !== null) setOffset(v);
                }}
              />
              {!remindersEnabled && (
                <p className="assessment-hint">
                  Уведомления о ДЗ выключены. Включи «Напоминания о сроках ДЗ» в настройках, чтобы
                  получать сообщения.
                </p>
              )}
              <p className="assessment-hint">
                {dueTime
                  ? 'Время — по Кишинёву.'
                  : 'Время сдачи не указано: отсчёт от 09:00 по Кишинёву.'}{' '}
                Если до срока осталось меньше выбранного интервала, напомним при ближайшей проверке.
              </p>
            </>
          )}

          <HomeworkAttachments files={attachments} disabled={saving} />
          {saveError && (
            <p className="form-error" role="alert">
              {saveError}
            </p>
          )}
          <button
            type="button"
            className="primary-btn"
            disabled={!title.trim() || saving}
            onClick={handleSave}
          >
            {saving
              ? 'Сохраняем…'
              : savedId && !item
                ? 'Сохранить и повторить загрузку'
                : item
                  ? 'Сохранить'
                  : 'Добавить задание'}
          </button>
        </fieldset>
        <p className="modal-foot">Срок можно изменить или оставить пустым.</p>
      </section>
    </div>
  );
}
