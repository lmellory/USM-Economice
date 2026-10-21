import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import {
  ADMIN_MESSAGE_LIMIT,
  AdminUser,
  BroadcastInput,
  BroadcastResult,
  BroadcastSummary,
  BroadcastType,
} from '@usm/shared';
import { request, vibrate } from '../lib/api.js';
import { TZ } from '../lib/time.js';

interface Stats {
  totalUsers: number;
  currentUserId: string;
  users: AdminUser[];
}
const typeLabel = (type: BroadcastType) =>
  type === 'custom' ? 'Сообщение' : type === 'weather' ? 'Утренняя сводка' : 'План на завтра';
const formatDate = (date: string) =>
  new Date(date.includes('T') ? date : date.replace(' ', 'T') + 'Z').toLocaleString('ru-RU', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function AdminView({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<BroadcastInput['audience']>('self');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<BroadcastInput | null>(null);
  const [sending, setSending] = useState(false);
  const [activeInput, setActiveInput] = useState<BroadcastInput | null>(null);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [history, setHistory] = useState<BroadcastSummary[]>([]);
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (preview) previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [preview]);

  const loadHistory = async () => {
    try {
      const data = await request<{ broadcasts: BroadcastSummary[] }>('/api/admin/broadcasts');
      if (mountedRef.current) {
        setHistory(data.broadcasts);
        setHistoryError('');
      }
    } catch {
      if (mountedRef.current)
        setHistoryError(
          'Не удалось загрузить журнал. Проверь подключение и обновление базы данных.'
        );
    }
  };
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await request<Stats>('/api/admin/stats');
      if (mountedRef.current) setStats(data);
    } catch (e: any) {
      if (mountedRef.current) setError(e.message || 'Не удалось загрузить пользователей.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    await loadHistory();
  };
  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const validMessage = message.trim().length > 0 && message.trim().length <= ADMIN_MESSAGE_LIMIT;
  const recipientLabel = (input: BroadcastInput) =>
    input.audience === 'self'
      ? 'Только тебе'
      : input.audience === 'all'
        ? `Всем пользователям (${stats?.totalUsers ?? 0})`
        : input.targetUserIds.length === 1
          ? stats?.users.find((u) => u.id === input.targetUserIds[0])?.first_name ||
            'Выбранному пользователю'
          : `Выбранным пользователям (${input.targetUserIds.length})`;
  const prepare = (type: BroadcastType = 'custom', scope = audience) => {
    if (sendingRef.current || !stats || (type === 'custom' && !validMessage)) return;
    if (scope === 'selected' && !selectedIds.length) {
      setError('Выбери хотя бы одного получателя.');
      return;
    }
    setError('');
    setPreview({
      requestId: crypto.randomUUID(),
      type,
      message: type === 'custom' ? message.trim() : '',
      audience: scope,
      targetUserIds: scope === 'selected' ? [...selectedIds].sort() : [],
    });
  };
  const send = async (input: BroadcastInput) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    setPreview(null);
    setActiveInput(input);
    setResult(null);
    vibrate();
    try {
      let last: BroadcastResult;
      do {
        last = await request<BroadcastResult>('/api/admin/broadcast', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        if (mountedRef.current) setResult(last);
        if (!last.complete)
          await new Promise((resolve) => setTimeout(resolve, last.sendingCount ? 1500 : 200));
      } while (!last.complete && mountedRef.current);
      if (mountedRef.current && last.complete) setActiveInput(null);
    } catch (e: any) {
      if (mountedRef.current)
        setError(
          `${e.message || 'Отправка прервалась.'} Можно продолжить: подтверждённые отправки повторены не будут.`
        );
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) {
        setSending(false);
        await loadHistory();
      }
    }
  };
  const toggleUser = (id: string) => {
    setAudience('selected');
    setPreview(null);
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < 100 ? [...ids, id] : ids
    );
  };
  const query = search.trim().toLocaleLowerCase('ru');
  const filteredUsers =
    stats?.users.filter((u) => `${u.first_name} ${u.id}`.toLocaleLowerCase('ru').includes(query)) ??
    [];

  return (
    <div className="admin-container admin-messages">
      <header className="admin-top-bar">
        <button type="button" className="admin-back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Назад
        </button>
        <span className="admin-badge-pill">Администратор</span>
      </header>
      <div className="admin-hero">
        <span className="eyebrow">СВЯЗЬ С ПОЛЬЗОВАТЕЛЯМИ</span>
        <h1>Сообщения от бота</h1>
        <p>Личные сообщения и объявления — с проверкой получателей перед отправкой.</p>
      </div>
      {error && (
        <div className="admin-inline-error" role="alert">
          {error}
        </div>
      )}
      <div className="admin-overview">
        <Users size={20} />
        <div>
          <strong>{loading ? 'Загружаем…' : (stats?.totalUsers ?? '—')}</strong>
          <span>пользователей</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || sending}
          aria-label="Обновить список"
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {activeInput && !sending && (
        <div className="admin-section">
          <p>Отправка прервалась. Продолжить оставшимся получателям?</p>
          <button
            type="button"
            className="admin-action-btn secondary"
            onClick={() => void send(activeInput)}
          >
            Продолжить отправку
          </button>
        </div>
      )}
      <section className="admin-section">
        <h2>
          <MessageSquare size={18} /> Новое сообщение
        </h2>
        <label className="admin-field-label" htmlFor="admin-message">
          Текст сообщения
        </label>
        <textarea
          ref={composerRef}
          id="admin-message"
          className="admin-textarea"
          rows={5}
          placeholder="Напиши объявление или личное сообщение…"
          value={message}
          disabled={sending}
          maxLength={ADMIN_MESSAGE_LIMIT}
          onChange={(e) => {
            setMessage(e.target.value);
            setPreview(null);
          }}
        />
        <div className="admin-character-count">
          {message.length} / {ADMIN_MESSAGE_LIMIT}
        </div>
        <fieldset className="admin-audience" disabled={sending || loading || !stats}>
          <legend>Кому отправить</legend>
          {(
            [
              ['self', 'Только мне'],
              ['selected', `Выбранным (${selectedIds.length})`],
              ['all', 'Всем'],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={audience === value}
              className={audience === value ? 'selected' : ''}
              onClick={() => {
                setAudience(value);
                setPreview(null);
              }}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <p className="admin-recipient-note">
          {audience === 'self'
            ? 'Сообщение получишь только ты — удобно для проверки.'
            : audience === 'all'
              ? `Объявление получат все ${stats?.totalUsers ?? 0} пользователей бота.`
              : 'Отметь получателей в списке ниже. Можно искать по имени или Telegram ID.'}
        </p>
        <button
          type="button"
          className="admin-action-btn primary"
          disabled={
            sending ||
            loading ||
            !stats ||
            !validMessage ||
            (audience === 'selected' && !selectedIds.length)
          }
          onClick={() => prepare()}
        >
          <Eye size={17} /> Проверить перед отправкой
        </button>
      </section>
      {preview && (
        <section
          ref={previewRef}
          className="admin-section admin-confirmation"
          aria-labelledby="broadcast-preview-title"
        >
          <div className="admin-confirmation-head">
            <h2 id="broadcast-preview-title">Проверь сообщение</h2>
            <button
              type="button"
              onClick={() => setPreview(null)}
              aria-label="Закрыть предпросмотр"
            >
              <X size={20} />
            </button>
          </div>
          <p>
            <strong>Получатели:</strong> {recipientLabel(preview)}
          </p>
          {preview.audience === 'selected' && (
            <p className="admin-recipient-names">
              {preview.targetUserIds
                .map(
                  (id) =>
                    `${stats?.users.find((u) => u.id === id)?.first_name || 'Без имени'} · ${id}`
                )
                .join(', ')}
            </p>
          )}
          <div className="preview-bubble">
            {preview.type === 'custom'
              ? preview.message
              : `${typeLabel(preview.type)} будет рассчитана по личным настройкам получателя.`}
          </div>
          <button
            type="button"
            className="admin-action-btn primary"
            disabled={sending}
            onClick={() => void send(preview)}
          >
            <Send size={17} /> Подтвердить отправку
          </button>
          <button type="button" className="admin-cancel" onClick={() => setPreview(null)}>
            Вернуться к редактированию
          </button>
        </section>
      )}
      {(sending || result) && (
        <section className="admin-section" aria-live="polite">
          <h2>
            {sending ? <Loader2 size={18} className="spin" /> : <CheckCircle2 size={18} />}
            {sending
              ? 'Отправляем…'
              : result?.failedCount || result?.unknownCount
                ? 'Отправка завершена с замечаниями'
                : 'Отправка завершена'}
          </h2>
          {result && (
            <>
              <p>
                Telegram принял {result.sentCount} из {result.totalTargeted} сообщений.
              </p>
              <progress
                value={result.totalTargeted - result.pendingCount - result.sendingCount}
                max={Math.max(1, result.totalTargeted)}
              />
              {result.failedCount > 0 && <p>Не отправлено: {result.failedCount}</p>}
              {result.unknownCount > 0 && (
                <p>Доставка не подтверждена: {result.unknownCount}. Автоматического повтора нет.</p>
              )}
              {result.failed.map((item) => (
                <p className="admin-delivery-error" key={item.id}>
                  {item.name || item.id}: {item.error}
                </p>
              ))}
            </>
          )}
        </section>
      )}
      <section className="admin-section">
        <h2>
          <Users size={18} /> Пользователи
        </h2>
        <label className="admin-search">
          <Search size={17} />
          <input
            aria-label="Поиск пользователей"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Имя или Telegram ID"
          />
        </label>
        {loading ? (
          <p role="status">Загружаем список…</p>
        ) : !stats ? (
          <p>Список недоступен. Нажми кнопку обновления.</p>
        ) : !filteredUsers.length ? (
          <p>Никого не найдено.</p>
        ) : (
          <div className="admin-users-list">
            {filteredUsers.map((user) => (
              <div className="admin-user-item" key={user.id}>
                <label className="admin-user-check">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(user.id)}
                    disabled={
                      sending || (!selectedIds.includes(user.id) && selectedIds.length >= 100)
                    }
                    onChange={() => toggleUser(user.id)}
                    aria-label={`Выбрать ${user.first_name || user.id}`}
                  />
                  <span>
                    <strong>{user.first_name || 'Без имени'}</strong>
                    <small>
                      ID: {user.id}
                      {user.id === stats.currentUserId ? ' · это ты' : ''}
                    </small>
                  </span>
                </label>
                <button
                  type="button"
                  className="send-single-btn"
                  disabled={sending}
                  onClick={() => {
                    setSelectedIds([user.id]);
                    setAudience('selected');
                    setPreview(null);
                    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    composerRef.current?.focus();
                  }}
                >
                  <MessageSquare size={15} /> Написать
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="admin-section">
        <h2>Проверка автоматических сводок</h2>
        <p className="section-desc">Эти тесты отправляются только тебе.</p>
        <div className="admin-test-actions">
          <button
            type="button"
            disabled={sending || loading || !stats}
            onClick={() => prepare('weather', 'self')}
          >
            Утренняя сводка
          </button>
          <button
            type="button"
            disabled={sending || loading || !stats}
            onClick={() => prepare('evening', 'self')}
          >
            План на завтра
          </button>
        </div>
      </section>
      <section className="admin-section">
        <h2>Последние отправки</h2>
        {historyError && <p role="status">{historyError}</p>}
        {!history.length && !historyError && <p>Здесь появятся результаты отправки сообщений.</p>}
        {history.map((job) => (
          <article className="admin-history-item" key={job.id}>
            <div>
              <strong>{typeLabel(job.type)}</strong>
              <time>{formatDate(job.created_at)}</time>
            </div>
            <p>{job.message || typeLabel(job.type)}</p>
            <small>
              Принято Telegram: {job.sentCount}/{job.totalTargeted} · Ошибок: {job.failedCount}
              {job.unknownCount > 0 ? ` · Не подтверждено: ${job.unknownCount}` : ''}
            </small>
            {!job.complete && (
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setPreview(job.input);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                Проверить и продолжить ({job.pendingCount} осталось)
              </button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
