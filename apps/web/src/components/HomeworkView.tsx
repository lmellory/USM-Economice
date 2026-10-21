import React from 'react';
import { Check, ChevronRight, Pencil, Plus } from 'lucide-react';
import { dateParts, fmtDate, TZ } from '../lib/time.js';

interface HomeworkViewProps {
  items: any[];
  tab: string;
  setTab: (tab: string) => void;
  onAdd: () => void;
  onEdit: (item: any) => void;
  onDone: (item: any) => void;
}

export function HomeworkView({ items, tab, setTab, onAdd, onEdit, onDone }: HomeworkViewProps) {
  const todayKey = dateParts(new Date()).key;
  const tabs = ['На сегодня', 'Просрочено', 'Скоро', 'Без срока', 'Выполненные'];

  const lists: Record<string, any[]> = {
    'На сегодня': items.filter((x) => !x.completed && x.due_date === todayKey),
    Просрочено: items
      .filter((x) => !x.completed && x.due_date && x.due_date < todayKey)
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))),
    Скоро: items
      .filter((x) => !x.completed && x.due_date && x.due_date > todayKey)
      .sort((a, b) => String(a.due_at || a.due_date).localeCompare(String(b.due_at || b.due_date))),
    'Без срока': items.filter((x) => !x.completed && !x.due_date),
    Выполненные: items.filter((x) => x.completed),
  };

  const currentList = lists[tab] || [];

  return (
    <>
      <section className="hw-header">
        <div className="eyebrow">ТВОИ ЗАДАЧИ</div>
        <h1>Всё по полочкам.</h1>
        <p>Маленький шаг за раз — ты справишься.</p>
      </section>

      <button type="button" className="add-task" onClick={onAdd}>
        <span>
          <Plus size={19} />
        </span>
        <div>
          <b>Добавить задание</b>
          <small>Пара секунд — и готово</small>
        </div>
        <ChevronRight size={18} />
      </button>

      <div className="hw-tabs">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={tab === t ? 'selected' : ''}
            aria-pressed={tab === t}
          >
            {t}
            {lists[t].length > 0 && <i>{lists[t].length}</i>}
          </button>
        ))}
      </div>

      <div className="hw-list">
        {currentList.length ? (
          currentList.map((x) => (
            <article
              className={`task-card ${x.completed ? 'done' : ''} ${!x.completed && x.due_date < todayKey ? 'overdue' : ''}`}
              key={x.id}
            >
              <button
                type="button"
                className={`check-task ${x.completed ? 'checked' : ''}`}
                onClick={() => onDone(x)}
                aria-label={x.completed ? 'Снять отметку' : 'Отметить выполненным'}
              >
                {x.completed && <Check size={14} />}
              </button>
              <div className="task-main" onClick={() => onEdit(x)}>
                <b>{x.title}</b>
                {x.subject && <span>{x.subject}</span>}
                {x.note && <p>{x.note}</p>}
                <small>
                  {!x.completed && x.due_date && x.due_date < todayKey && 'Просрочено · '}
                  {x.due_date
                    ? x.due_date === todayKey
                      ? 'Сегодня'
                      : fmtDate(x.due_date, { day: 'numeric', month: 'long' })
                    : 'Без срока'}
                  {x.due_at &&
                    ` · ${new Date(x.due_at).toLocaleTimeString('ru-RU', {
                      timeZone: TZ,
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`}
                </small>
              </div>
              <button
                type="button"
                className="edit-task"
                onClick={() => onEdit(x)}
                aria-label="Редактировать задание"
              >
                <Pencil size={15} />
              </button>
            </article>
          ))
        ) : (
          <div className="hw-empty">
            <span>{tab === 'Выполненные' ? '✓' : '✦'}</span>
            <b>
              {tab === 'На сегодня'
                ? 'На сегодня заданий нет'
                : tab === 'Просрочено'
                  ? 'Просроченных заданий нет'
                  : tab === 'Скоро'
                    ? 'Пока нет ближайших сроков'
                    : tab === 'Без срока'
                      ? 'Заданий без срока нет'
                      : 'Здесь появятся выполненные'}
            </b>
            <p>
              {tab === 'Выполненные'
                ? 'Когда закончишь задание, отметь его галочкой.'
                : 'Добавь только то, что задали — сроки можно не указывать.'}
            </p>
            {tab !== 'Выполненные' && (
              <button type="button" onClick={onAdd}>
                <Plus size={16} /> Добавить задание
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
