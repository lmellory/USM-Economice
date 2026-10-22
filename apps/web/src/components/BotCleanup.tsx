import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';
import { request } from '../lib/api.js';

export function BotCleanup() {
  const [open, setOpen] = useState(false);
  return (
    <section className="setting-card cleanup-card">
      <button
        type="button"
        className="cleanup-heading"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Trash2 size={17} />
        <span>Очистка</span>
        <ChevronRight size={17} />
      </button>
      {open && <CleanupControls />}
    </section>
  );
}
function CleanupControls() {
  const [stats, setStats] = useState<{ eligible: number; expired: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controller = useRef(new AbortController());
  const options = () => ({
    signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(20000)]),
  });
  const load = async (clearError = true) => {
    try {
      const data = await request('/api/bot/cleanup', options());
      if (alive.current) {
        setStats(data);
        if (clearError) setError('');
      }
    } catch (e: any) {
      if (alive.current) setError(e.message);
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      controller.current.abort();
      clearTimeout(timer.current);
    };
  }, []);
  const clean = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setConfirm(false);
    setError('');
    let processed = 0;
    let snapshotAt: number | undefined;
    try {
      while (alive.current) {
        const response = await fetchCleanup(snapshotAt, options());
        snapshotAt = response.snapshotAt;
        processed += response.processed;
        if (!alive.current) return;
        setStatus(`Обработано сообщений: ${processed}`);
        if (!response.remaining) break;
        if (!response.processed) throw new Error('Очистка остановилась. Попробуй ещё раз.');
      }
      if (alive.current) {
        setStats((prev) => (prev ? { ...prev, eligible: 0 } : null));
        setStatus(
          processed
            ? 'Очистка завершена. Ответы на /start сохранены.'
            : 'Подходящих сообщений для очистки нет.'
        );
      }
    } catch (e: any) {
      if (alive.current) {
        setError(e.message);
        setStatus(processed ? `Уже обработано: ${processed}. Можно продолжить очистку.` : '');
        if (e.retryAfter) {
          setBlocked(true);
          timer.current = setTimeout(() => setBlocked(false), e.retryAfter * 1000);
        }
        await load(false);
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <div className="cleanup-body">
      <p>
        Удалить сообщения бота за последние 48 часов. Ответы на /start и твои сообщения останутся.
      </p>
      <p className="cleanup-note">
        Доступны сообщения, отправленные после обновления с функцией очистки. Более старые сообщения
        Telegram придётся удалить вручную.
      </p>
      {stats ? (
        <p>
          Доступно для очистки: <b>{stats.eligible}</b>
          {stats.expired > 0 && <span> · Старше 48 часов: {stats.expired}</span>}
        </p>
      ) : (
        !error && <p role="status">Проверяем сообщения…</p>
      )}
      {status && (
        <p role="status" aria-live="polite">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!stats && error && (
        <button type="button" onClick={() => void load()}>
          Повторить проверку
        </button>
      )}
      {confirm ? (
        <div className="cleanup-confirm">
          <p>Удалить доступные сообщения бота из твоего чата?</p>
          <button type="button" className="cleanup-delete" onClick={() => void clean()}>
            Удалить сообщения
          </button>
          <button type="button" onClick={() => setConfirm(false)}>
            Отмена
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="cleanup-delete"
          disabled={!stats?.eligible || busy || blocked}
          onClick={() => setConfirm(true)}
        >
          {busy ? 'Очищаем…' : blocked ? 'Подожди перед повтором' : 'Очистить сообщения'}
        </button>
      )}
    </div>
  );
}
async function fetchCleanup(
  snapshotAt: number | undefined,
  options: RequestInit
): Promise<{ processed: number; remaining: number; snapshotAt: number }> {
  // Preserve Telegram's retry-after in addition to the normal API error message.
  const { apiBase, tg } = await import('../lib/api.js');
  const response = await fetch(apiBase + '/api/bot/cleanup', {
    ...options,
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-init-data': tg?.initData || '' },
    body: JSON.stringify({ confirm: true, snapshotAt }),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = Object.assign(new Error(result.error || 'Не удалось очистить сообщения.'), {
      retryAfter: Math.min(3600, Math.max(0, Number(result.retryAfter) || 0)),
    });
    throw error;
  }
  return result;
}
