import React, { useEffect, useRef, useState } from 'react';
import { Bell, Plus, Trash2, X } from 'lucide-react';
import {
  Assessment,
  AssessmentInput,
  PreparationTopic,
  assessmentLabel,
  validateAssessment,
} from '@usm/shared';

export function AssessmentModal({
  item,
  subjects,
  onClose,
  onSave,
  onDelete,
}: {
  item: Assessment | null;
  subjects: string[];
  onClose: () => void;
  onSave: (input: AssessmentInput & { id?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<'test' | 'exam'>(item?.kind || 'test');
  const [subject, setSubject] = useState(item?.subject || '');
  const [title, setTitle] = useState(item?.title || '');
  const [date, setDate] = useState(item?.date || '');
  const [time, setTime] = useState(item?.time || '');
  const [place, setPlace] = useState(item?.place || '');
  const [topics, setTopics] = useState<PreparationTopic[]>(item?.topics || []);
  const [newTopic, setNewTopic] = useState('');
  const [reminder, setReminder] = useState<number | null>(item ? item.reminderMinutes : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lock = useRef(false);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    section.current?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !lock.current) onClose();
      if (e.key !== 'Tab') return;
      const controls = section.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]'
      );
      if (!controls?.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === section.current)
      ) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keyboard);
      prior?.focus();
    };
  }, []);
  const addTopic = () => {
    if (!newTopic.trim() || topics.length >= 50) return;
    setTopics((all) => [...all, { id: crypto.randomUUID(), title: newTopic.trim(), done: false }]);
    setNewTopic('');
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lock.current) return;
    setError('');
    try {
      const pending = newTopic.trim()
        ? [...topics, { id: crypto.randomUUID(), title: newTopic.trim(), done: false }]
        : topics;
      const input = validateAssessment({
        kind,
        subject,
        title,
        date,
        time: time || null,
        place,
        topics: pending,
        completed: item?.completed || false,
        reminderMinutes: reminder,
      });
      lock.current = true;
      setSaving(true);
      await onSave({ ...input, id: item?.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!item || lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      await onDelete(item.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  return (
    <div
      className="modal-backdrop assessment-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <section
        ref={section}
        tabIndex={-1}
        className="modal assessment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-title"
      >
        <div className="modal-grab" />
        <header>
          <div>
            <span className="eyebrow">{item ? 'ТВОЯ УЧЁБА' : 'НОВОЕ СОБЫТИЕ'}</span>
            <h2 id="assessment-title">{item ? 'Изменить событие' : 'Запланировать'}</h2>
          </div>
          <button type="button" disabled={saving} aria-label="Закрыть" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={save}>
          <fieldset disabled={saving} className="assessment-fields">
            <div className="study-tabs" role="group" aria-label="Тип события">
              {(['test', 'exam'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  className={kind === k ? 'selected' : ''}
                  onClick={() => setKind(k)}
                >
                  {assessmentLabel(k)}
                </button>
              ))}
            </div>
            <label>
              Предмет
              <input
                required
                maxLength={120}
                list="assessment-subjects"
                value={subject}
                placeholder="Например, микроэкономика"
                onChange={(e) => setSubject(e.target.value)}
              />
              <datalist id="assessment-subjects">
                {subjects.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label>
              Тема или название
              <input
                required
                maxLength={200}
                value={title}
                placeholder="Например, спрос и предложение"
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="assessment-date-row">
              <label>
                Дата
                <input
                  required
                  type="date"
                  min="2000-01-01"
                  max="2100-12-31"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                Время <span className="optional">необязательно</span>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
            </div>
            <label>
              Где <span className="optional">необязательно</span>
              <input
                maxLength={200}
                value={place}
                placeholder="Аудитория или онлайн"
                onChange={(e) => setPlace(e.target.value)}
              />
            </label>
            <div className="topic-editor">
              <h3>
                Что повторить{' '}
                <span>
                  {topics.filter((t) => t.done).length}/{topics.length}
                </span>
              </h3>
              {topics.map((t) => (
                <div key={t.id} className="topic-edit-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() =>
                        setTopics((all) =>
                          all.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x))
                        )
                      }
                    />
                    <span>{t.title}</span>
                  </label>
                  <button
                    type="button"
                    aria-label={`Убрать тему: ${t.title}`}
                    onClick={() => setTopics((all) => all.filter((x) => x.id !== t.id))}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <div className="add-topic">
                <input
                  aria-label="Новая тема подготовки"
                  maxLength={200}
                  value={newTopic}
                  placeholder="Добавь тему подготовки"
                  onChange={(e) => setNewTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTopic();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={!newTopic.trim() || topics.length >= 50}
                  aria-label="Добавить тему"
                  onClick={addTopic}
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
            <label>
              <span className="inline-label">
                <Bell size={15} /> Напомнить в Telegram
              </span>
              <select
                value={reminder ?? ''}
                onChange={(e) => setReminder(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">Без напоминания</option>
                <option value="60">За час</option>
                <option value="180">За 3 часа</option>
                <option value="1440">За день</option>
                <option value="4320">За 3 дня</option>
                <option value="10080">За неделю</option>
              </select>
            </label>
            {reminder !== null && (
              <p className="assessment-hint">
                {time
                  ? 'Время — по Кишинёву.'
                  : 'Время события не указано: отсчёт от 09:00 по Кишинёву.'}{' '}
                Если до события осталось меньше выбранного интервала, напомним при ближайшей
                проверке.
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="primary-btn">
              {saving ? 'Сохраняем…' : item ? 'Сохранить изменения' : 'Добавить событие'}
            </button>
            {item && (
              <div className="assessment-delete">
                {confirmDelete ? (
                  <>
                    <span>Удалить это событие?</span>
                    <button type="button" onClick={remove}>
                      Удалить
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)}>
                      Отмена
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)}>
                    <Trash2 size={15} /> Удалить событие
                  </button>
                )}
              </div>
            )}
          </fieldset>
        </form>
      </section>
    </div>
  );
}
