import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Bus,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  Eye,
  Loader2,
  MessageSquare,
  Moon,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';
import { request, vibrate } from '../lib/api.js';

interface AdminViewProps {
  onBack: () => void;
}

export function AdminView({ onBack }: AdminViewProps) {
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Broadcast state
  const [customMsg, setCustomMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedUserForSingle, setSelectedUserForSingle] = useState<string>('');

  const loadStats = async () => {
    setLoadingStats(true);
    setError(null);
    try {
      const res = await request('/api/admin/stats');
      setStats(res);
    } catch (e: any) {
      setError(e.message || 'Ошибка загрузки статистики');
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleBroadcast = async (type: 'custom' | 'weather' | 'evening', targetUserId?: string) => {
    if (type === 'custom' && !customMsg.trim()) {
      alert('Введи текст сообщения');
      return;
    }

    const confirmText =
      type === 'custom'
        ? `Отправить сообщение ${targetUserId ? 'выбранному студенту' : `ВСЕМ студентам (${stats?.totalUsers || 0} чел.)`}?`
        : type === 'weather'
          ? `Разослать утреннюю сводку погоды ВСЕМ (${stats?.totalUsers || 0} чел.) прямо сейчас?`
          : `Разослать вечерний план на завтра ВСЕМ (${stats?.totalUsers || 0} чел.) прямо сейчас?`;

    if (!window.confirm(confirmText)) return;

    setSending(true);
    setBroadcastResult(null);
    vibrate();

    try {
      const res = await request('/api/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type,
          message: customMsg.trim(),
          targetUserId: targetUserId || undefined,
        }),
      });
      setBroadcastResult(res);
      if (type === 'custom' && !targetUserId) {
        setCustomMsg('');
      }
    } catch (err: any) {
      alert(err.message || 'Ошибка отправки рассылки');
    } finally {
      setSending(false);
    }
  };

  const addPrefix = (prefix: string) => {
    setCustomMsg((prev) => `${prefix} ${prev}`.trim());
    vibrate();
  };

  return (
    <div className="admin-container">
      {/* Top Header */}
      <div className="admin-top-bar">
        <button className="admin-back-btn" onClick={onBack} title="Назад">
          <ArrowLeft size={18} />
          <span>Назад</span>
        </button>
        <div className="admin-badge-pill">
          <Crown size={14} className="crown-icon" />
          <span>Панель администратора</span>
        </div>
      </div>

      <div className="admin-hero">
        <h2>Управление USM Life</h2>
        <p>Рассылка объявлений, триггеры сводок и контроль пользователей.</p>
      </div>

      {/* Stats Cards */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-icon users">
            <Users size={20} />
          </div>
          <div className="admin-stat-content">
            <div className="stat-label">Студентов в боте</div>
            <div className="stat-value">
              {loadingStats ? <Loader2 size={16} className="spin" /> : stats?.totalUsers ?? '—'}
            </div>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon transit">
            <Bus size={20} />
          </div>
          <div className="admin-stat-content">
            <div className="stat-label">Машин на линии</div>
            <div className="stat-value">
              {loadingStats ? (
                <Loader2 size={16} className="spin" />
              ) : (
                stats?.transit?.vehicleCount ?? '—'
              )}
            </div>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon system">
            <Sparkles size={20} />
          </div>
          <div className="admin-stat-content">
            <div className="stat-label">Система</div>
            <div className="stat-value-badge">
              <span className="dot-pulse" />
              <span>В сети</span>
            </div>
          </div>
        </div>
      </div>

      {/* Broadcast Result Toast */}
      {broadcastResult && (
        <div className="admin-result-banner">
          <CheckCircle2 size={18} className="success-icon" />
          <div>
            <b>Рассылка завершена:</b> успешно доставлено{' '}
            <span className="highlight">{broadcastResult.sentCount}</span> из{' '}
            {broadcastResult.totalTargeted} чел.
            {broadcastResult.failedCount > 0 && (
              <span className="error-note"> ({broadcastResult.failedCount} ошибок)</span>
            )}
          </div>
          <button className="close-banner-btn" onClick={() => setBroadcastResult(null)}>
            ×
          </button>
        </div>
      )}

      {/* Custom Broadcast Section */}
      <section className="admin-section">
        <div className="section-title-wrap">
          <MessageSquare size={18} className="title-icon" />
          <h3>Кастомная рассылка студентам</h3>
        </div>
        <p className="section-desc">
          Сообщение придёт в Telegram от бота всем зарегистрированным пользователям.
        </p>

        {/* Quick Tag Chips */}
        <div className="admin-chips">
          <button type="button" onClick={() => addPrefix('📢 [Объявление]')}>
            📢 Объявление
          </button>
          <button type="button" onClick={() => addPrefix('⚠️ [Важно]')}>
            ⚠️ Важно
          </button>
          <button type="button" onClick={() => addPrefix('🎉 [Новость]')}>
            🎉 Новость
          </button>
          <button type="button" onClick={() => addPrefix('📚 [Деканат]')}>
            📚 Деканат
          </button>
          <button type="button" onClick={() => addPrefix('⏰ [Перенос пары]')}>
            ⏰ Перенос пары
          </button>
        </div>

        {/* Text Area */}
        <div className="admin-textarea-wrap">
          <textarea
            className="admin-textarea"
            rows={4}
            placeholder="Введи текст сообщения для всех студентов группы..."
            value={customMsg}
            onChange={(e) => setCustomMsg(e.target.value)}
          />
          <div className="textarea-footer">
            <span>{customMsg.length} символов</span>
            {customMsg.length > 0 && (
              <button
                type="button"
                className="preview-toggle"
                onClick={() => setPreviewMode(!previewMode)}
              >
                <Eye size={13} />
                <span>{previewMode ? 'Скрыть превью' : 'Предпросмотр'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Preview Box */}
        {previewMode && customMsg.trim() && (
          <div className="telegram-preview-box">
            <div className="preview-label">Превью в Telegram:</div>
            <div className="preview-bubble">{customMsg}</div>
          </div>
        )}

        <button
          className="admin-action-btn primary"
          disabled={sending || !customMsg.trim()}
          onClick={() => handleBroadcast('custom')}
        >
          {sending ? (
            <>
              <Loader2 size={16} className="spin" /> Отправка...
            </>
          ) : (
            <>
              <Send size={16} /> Отправить всем ({stats?.totalUsers || 0} чел.)
            </>
          )}
        </button>
      </section>

      {/* Instant System Triggers */}
      <section className="admin-section">
        <div className="section-title-wrap">
          <Clock size={18} className="title-icon" />
          <h3>Мгновенный запуск сводок</h3>
        </div>
        <p className="section-desc">
          Принудительно протестировать отправку ботом утренней или вечерней сводки.
        </p>

        <div className="triggers-grid">
          <div className="trigger-card">
            <div className="trigger-icon weather">
              <Sun size={20} />
            </div>
            <div className="trigger-info">
              <b>Утренняя сводка погоды</b>
              <p>Погода сейчас + к выходу + что надеть + пожелание на день</p>
            </div>
            <button
              className="admin-action-btn secondary"
              disabled={sending}
              onClick={() => handleBroadcast('weather')}
            >
              <Send size={14} /> Запустить тест
            </button>
          </div>

          <div className="trigger-card">
            <div className="trigger-icon evening">
              <Moon size={20} />
            </div>
            <div className="trigger-info">
              <b>Вечерний план на завтра</b>
              <p>Первая пара, аудитория, время подъёма, сон и ДЗ</p>
            </div>
            <button
              className="admin-action-btn secondary"
              disabled={sending}
              onClick={() => handleBroadcast('evening')}
            >
              <Send size={14} /> Запустить тест
            </button>
          </div>
        </div>
      </section>

      {/* Users List */}
      <section className="admin-section">
        <div className="section-title-wrap">
          <Users size={18} className="title-icon" />
          <h3>Список пользователей ({stats?.totalUsers || 0})</h3>
          <button className="refresh-icon-btn" onClick={loadStats} title="Обновить список">
            <RefreshCw size={14} className={loadingStats ? 'spin' : ''} />
          </button>
        </div>

        {loadingStats ? (
          <div className="admin-loading-box">
            <Loader2 size={24} className="spin" />
            <span>Загрузка списка пользователей...</span>
          </div>
        ) : stats?.users?.length ? (
          <div className="admin-users-list">
            {stats.users.map((u: any) => (
              <div key={u.id} className="admin-user-item">
                <div className="user-avatar">
                  {(u.first_name?.[0] || 'С').toUpperCase()}
                </div>
                <div className="user-info">
                  <div className="user-name">
                    <b>{u.first_name || 'Без имени'}</b>
                    {String(u.id) === '5067848442' && (
                      <span className="owner-badge">Владелец</span>
                    )}
                  </div>
                  <div className="user-id">ID: {u.id}</div>
                </div>
                <button
                  className="send-single-btn"
                  title="Отправить личное сообщение через бота"
                  onClick={() => {
                    const text = window.prompt(`Сообщение для ${u.first_name} (ID: ${u.id}):`);
                    if (text && text.trim()) {
                      setCustomMsg(text);
                      handleBroadcast('custom', u.id);
                    }
                  }}
                >
                  <Send size={13} />
                  <span>Написать</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-empty">Нет зарегистрированных пользователей</div>
        )}
      </section>
    </div>
  );
}
