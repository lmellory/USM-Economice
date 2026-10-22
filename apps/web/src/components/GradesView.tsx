import React, { useEffect, useRef, useState } from 'react';
import { Award, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  Grade,
  GradeInput,
  GRADE_KINDS,
  formatGrade,
  gradeAverage,
  validateGrade,
} from '@usm/shared';
import { request, vibrate } from '../lib/api.js';
import { dateParts, fmtDate } from '../lib/time.js';

type Draft = {
  id: string;
  existing: boolean;
  subject: string;
  title: string;
  kind: Grade['kind'];
  score: string;
  weight: string;
  date: string;
  note: string;
};
const blank = (subject = ''): Draft => ({
  id: crypto.randomUUID(),
  existing: false,
  subject,
  title: '',
  kind: 'test',
  score: '',
  weight: '1',
  date: dateParts(new Date()).key,
  note: '',
});
export function GradesView({ subjects }: { subjects: string[] }) {
  const [items, setItems] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [confirm, setConfirm] = useState('');
  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setItems(await request<Grade[]>('/api/grades'));
    } catch (e: any) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (draft) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [draft?.id]);
  const allSubjects = [...new Set([...subjects, ...items.map((g) => g.subject)])].sort((a, b) =>
    a.localeCompare(b, 'ru')
  );
  const grouped = [...new Set(items.map((g) => g.subject))]
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .filter((s) => !filter || s === filter);
  const patch = (part: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...part } : d));
  const add = (subject = '') => {
    setError('');
    setConfirm('');
    setDraft(blank(subject || filter));
  };
  const edit = (item: Grade) => {
    setError('');
    setConfirm('');
    setDraft({ ...item, existing: true, score: String(item.score), weight: String(item.weight) });
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || lock.current) return;
    let input: GradeInput;
    try {
      input = validateGrade({
        ...draft,
        score: Number(draft.score.replace(',', '.')),
        weight: Number(draft.weight.replace(',', '.')),
      });
    } catch (e: any) {
      setError(e.message);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await request<Grade>(
        draft.existing ? '/api/grades/' + draft.id : '/api/grades',
        {
          method: draft.existing ? 'PUT' : 'POST',
          body: JSON.stringify({ ...input, id: draft.id }),
        }
      );
      setItems((all) =>
        [...all.filter((g) => g.id !== saved.id), saved].sort((a, b) =>
          b.date.localeCompare(a.date)
        )
      );
      setDraft(null);
      vibrate();
    } catch (e: any) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const remove = async (item: Grade) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await request('/api/grades/' + item.id, { method: 'DELETE' });
      setItems((all) => all.filter((g) => g.id !== item.id));
      setConfirm('');
      if (draft?.id === item.id) setDraft(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="grades-view" aria-label="Оценки по предметам">
      <div className="grades-heading">
        <div>
          <h2>Мои оценки</h2>
          <p>Шкала от 1 до 10 · записей: {items.length}</p>
        </div>
        <button
          type="button"
          className="study-add"
          onClick={() => add()}
          disabled={busy || loading || Boolean(loadError)}
          aria-label="Добавить оценку"
        >
          <Plus size={22} />
        </button>
      </div>
      {loading && <p role="status">Загружаем оценки…</p>}
      {loadError && (
        <div className="notice" role="alert">
          {loadError}
          <button type="button" onClick={() => void load()}>
            Попробовать ещё раз
          </button>
        </div>
      )}
      {!loading && !loadError && allSubjects.length > 0 && (
        <label className="setting-field">
          Предмет
          <select
            aria-label="Предмет для оценок"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Все предметы</option>
            {allSubjects.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      {draft && (
        <form ref={formRef} className="grade-form" onSubmit={save}>
          <div className="grades-heading">
            <h3>{draft.existing ? 'Изменить оценку' : 'Новая оценка'}</h3>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setDraft(null)}
              disabled={busy}
              aria-label="Отменить ввод оценки"
            >
              <X size={20} />
            </button>
          </div>
          <fieldset disabled={busy}>
            <label>
              Предмет
              <input
                list="grade-subjects"
                value={draft.subject}
                onChange={(e) => patch({ subject: e.target.value })}
                maxLength={120}
                placeholder="Например, экономика"
                required
              />
            </label>
            <datalist id="grade-subjects">
              {allSubjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <label>
              Название работы
              <input
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                maxLength={200}
                placeholder="Например, контрольная по теме 2"
                required
              />
            </label>
            <label>
              Тип работы
              <select
                aria-label="Тип работы"
                value={draft.kind}
                onChange={(e) => patch({ kind: e.target.value as Grade['kind'] })}
              >
                {Object.entries(GRADE_KINDS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Оценка от 1 до 10
              <input
                type="text"
                inputMode="decimal"
                value={draft.score}
                onChange={(e) => patch({ score: e.target.value })}
                maxLength={5}
                placeholder="Например, 8,5"
                required
              />
            </label>
            <div className="grade-score-chips" aria-label="Быстрый выбор оценки">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => (
                <button
                  type="button"
                  key={score}
                  aria-pressed={Number(draft.score.replace(',', '.')) === score}
                  onClick={() => patch({ score: String(score) })}
                >
                  {score}
                </button>
              ))}
            </div>
            <div className="grade-fields">
              <label>
                Дата результата
                <input
                  type="date"
                  value={draft.date}
                  onChange={(e) => patch({ date: e.target.value })}
                  required
                />
              </label>
              <label>
                Вес оценки
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.weight}
                  onChange={(e) => patch({ weight: e.target.value })}
                  maxLength={4}
                  required
                />
              </label>
            </div>
            <p className="assessment-hint">
              Обычная оценка имеет вес 1. Вес 2 учитывает результат как две обычные оценки. Можно
              указать от 0,1 до 10.
            </p>
            <label>
              Заметка <span className="optional">необязательно</span>
              <textarea
                rows={2}
                maxLength={1000}
                value={draft.note}
                onChange={(e) => patch({ note: e.target.value })}
                placeholder="Что стоит повторить или уточнить"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="primary-btn">
              {busy ? 'Сохраняем…' : 'Сохранить оценку'}
            </button>
          </fieldset>
        </form>
      )}
      {!draft && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !loadError && grouped.length === 0 && !draft && (
        <div className="grades-empty">
          <Award size={30} />
          <h3>{filter ? 'Оценок по этому предмету пока нет' : 'Здесь будут твои результаты'}</h3>
          <p>Добавь первую оценку — средний балл посчитается автоматически.</p>
          <button type="button" className="primary-btn" onClick={() => add()}>
            Добавить оценку
          </button>
        </div>
      )}
      <div className="grade-subject-list">
        {grouped.map((subject) => {
          const rows = items.filter((g) => g.subject === subject),
            average = gradeAverage(rows)!;
          return (
            <details className="grade-subject" key={subject} open={Boolean(filter) || undefined}>
              <summary>
                <span>
                  <b>{subject}</b>
                  <small>
                    Оценок: {rows.length} ·{' '}
                    {rows.some((g) => g.weight !== 1) ? 'с учётом веса' : 'средний балл'}
                  </small>
                </span>
                <strong>
                  {formatGrade(average)}
                  <small>/ 10</small>
                </strong>
                <ChevronDown size={17} />
              </summary>
              <div className="grade-results">
                {rows.map((item) => (
                  <article className="grade-result" key={item.id}>
                    <div className="grade-result-heading">
                      <span className="grade-result-score">{formatGrade(item.score)}</span>
                      <div>
                        <b>{item.title}</b>
                        <small>
                          {GRADE_KINDS[item.kind]} · {fmtDate(item.date)}
                          {item.weight !== 1 ? ' · вес ' + formatGrade(item.weight) : ''}
                        </small>
                      </div>
                    </div>
                    {item.note && <p>{item.note}</p>}
                    <div className="grade-actions">
                      <button type="button" onClick={() => edit(item)} disabled={busy}>
                        <Pencil size={15} /> Изменить
                      </button>
                      <button
                        type="button"
                        aria-label={'Удалить оценку: ' + item.title}
                        onClick={() => setConfirm(item.id)}
                        disabled={busy}
                      >
                        <Trash2 size={15} /> Удалить
                      </button>
                    </div>
                    {confirm === item.id && (
                      <div className="grade-delete-confirm">
                        <span>Удалить оценку?</span>
                        <button type="button" disabled={busy} onClick={() => void remove(item)}>
                          Да, удалить
                        </button>
                        <button type="button" disabled={busy} onClick={() => setConfirm('')}>
                          Отмена
                        </button>
                      </div>
                    )}
                  </article>
                ))}
                <button
                  type="button"
                  className="grade-add-subject"
                  onClick={() => add(subject)}
                  disabled={busy}
                >
                  <Plus size={16} /> Добавить оценку по предмету
                </button>
              </div>
            </details>
          );
        })}
      </div>
      {items.length > 0 && (
        <p className="grades-foot">
          Средний балл считается по добавленным оценкам и их весам. Это ориентир, а не официальная
          итоговая оценка университета.
        </p>
      )}
    </section>
  );
}
