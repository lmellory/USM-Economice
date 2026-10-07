import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bus,
  Check,
  ChevronRight,
  Footprints,
  MapPin,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { CommuteLeg, CommuteOption, TransitStop } from '../lib/plan.js';

interface CommuteSettingsModalProps {
  options: CommuteOption[];
  onClose: () => void;
  onSaveOption: (optionId: string, payload: Partial<CommuteOption>) => Promise<void>;
  request: (path: string, options?: any) => Promise<any>;
}

export function CommuteSettingsModal({
  options,
  onClose,
  onSaveOption,
  request,
}: CommuteSettingsModalProps) {
  const [selectedId, setSelectedId] = useState<string>(options[0]?.id || 'univ-a');
  const activeOpt = options.find((o) => o.id === selectedId) || options[0];

  const [walkBefore, setWalkBefore] = useState<number>(activeOpt?.walk_before_minutes ?? 7);
  const [walkAfter, setWalkAfter] = useState<number>(activeOpt?.walk_after_minutes ?? 5);
  const [legs, setLegs] = useState<CommuteLeg[]>(activeOpt?.legs ? [...activeOpt.legs] : []);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TransitStop[]>([]);
  const [activeSearchTarget, setActiveSearchTarget] = useState<{
    legIdx: number;
    field: 'board' | 'alight';
  } | null>(null);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [successNotice, setSuccessNotice] = useState(false);

  useEffect(() => {
    if (activeOpt) {
      setWalkBefore(activeOpt.walk_before_minutes ?? 7);
      setWalkAfter(activeOpt.walk_after_minutes ?? 5);
      setLegs(activeOpt.legs ? JSON.parse(JSON.stringify(activeOpt.legs)) : []);
      setError('');
      setSuccessNotice(false);
    }
  }, [selectedId, activeOpt]);

  // Autocomplete search
  useEffect(() => {
    if (!activeSearchTarget) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await request(
          `/api/transit/stops?q=${encodeURIComponent(searchQuery.trim())}`
        );
        setSearchResults(res.stops || []);
      } catch {
        setSearchResults([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, activeSearchTarget, request]);

  const selectStop = (stop: TransitStop) => {
    if (!activeSearchTarget) return;
    const { legIdx, field } = activeSearchTarget;
    const nextLegs = [...legs];
    if (!nextLegs[legIdx]) return;

    if (field === 'board') {
      nextLegs[legIdx].board_stop_id = stop.stop_id;
      nextLegs[legIdx].board_stop_name = stop.stop_name;
    } else {
      nextLegs[legIdx].alight_stop_id = stop.stop_id;
      nextLegs[legIdx].alight_stop_name = stop.stop_name;
    }

    setLegs(nextLegs);
    setActiveSearchTarget(null);
    setSearchQuery('');
    setError('');
  };

  const handleSave = async () => {
    if (!activeOpt) return;
    setError('');

    // Verification
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (!leg.board_stop_name || !leg.board_stop_id) {
        setError(`Укажи остановку посадки на участке ${i + 1}`);
        return;
      }
      if (!leg.alight_stop_name || !leg.alight_stop_id) {
        setError(`Укажи остановку выхода на участке ${i + 1}`);
        return;
      }
      if (leg.board_stop_id === leg.alight_stop_id) {
        setError(`Остановка посадки и выхода не могут совпадать на участке ${i + 1}`);
        return;
      }
    }

    setSaving(true);
    try {
      await onSaveOption(activeOpt.id, {
        walk_before_minutes: Number(walkBefore) || 7,
        walk_after_minutes: Number(walkAfter) || 5,
        legs,
        is_configured: true,
      });
      setSuccessNotice(true);
      setTimeout(() => setSuccessNotice(false), 2500);
    } catch (e: any) {
      setError(e.message || 'Не удалось сохранить настройки');
    } finally {
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
      <section className="modal commute-settings-modal">
        <div className="modal-grab" />
        <header>
          <div>
            <span className="eyebrow">ТРАНСПОРТ И МАРШРУТЫ</span>
            <h2>Настройка дороги</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <X size={19} />
          </button>
        </header>

        {error && (
          <div className="modal-error-banner">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {successNotice && (
          <div className="modal-success-banner">
            <Check size={15} /> Остановки подтверждены и сохранены!
          </div>
        )}

        {/* Options tabs */}
        <div className="duration-chips" style={{ marginBottom: 14 }}>
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={opt.id === selectedId ? 'on' : ''}
              onClick={() => setSelectedId(opt.id)}
            >
              {opt.name}
              {opt.is_configured ? ' ✓' : ' (черновик)'}
            </button>
          ))}
        </div>

        {activeOpt && (
          <div className="commute-option-form">
            <div className="commute-status-pill">
              {activeOpt.is_configured ? (
                <span className="status-badge configured">
                  <Check size={12} /> Настроено (живые данные активны)
                </span>
              ) : (
                <span className="status-badge draft">
                  <AlertCircle size={12} /> Черновик — подтверди остановки ниже
                </span>
              )}
            </div>

            <div className="commute-times-row">
              <label>
                🚶 Пешком до остановки
                <input
                  type="number"
                  min="1"
                  max="45"
                  value={walkBefore}
                  onChange={(e) => setWalkBefore(Number(e.target.value))}
                />
                <small>минут</small>
              </label>

              <label>
                🏫 Пешком до аудитории
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={walkAfter}
                  onChange={(e) => setWalkAfter(Number(e.target.value))}
                />
                <small>минут</small>
              </label>
            </div>

            <div className="legs-list">
              <h4>Участки движения:</h4>
              {legs.map((leg, idx) => (
                <div key={idx} className="leg-card">
                  <div className="leg-header">
                    <b>Участок {idx + 1}</b>
                    <span className="leg-mode-tag">
                      {leg.mode === 'any_trolleybus'
                        ? 'Любой троллейбус (пересадка)'
                        : `Троллейбус №${leg.route_short_name || '2'}`}
                    </span>
                  </div>

                  <div className="leg-stop-picker">
                    <span className="stop-label">Посадка:</span>
                    <button
                      type="button"
                      className="stop-select-btn"
                      onClick={() => {
                        setActiveSearchTarget({ legIdx: idx, field: 'board' });
                        setSearchQuery('');
                      }}
                    >
                      <MapPin size={13} />
                      {leg.board_stop_name || 'Выбрать остановку посадки…'}
                    </button>
                  </div>

                  <div className="leg-arrow-divider">↓</div>

                  <div className="leg-stop-picker">
                    <span className="stop-label">Выход:</span>
                    <button
                      type="button"
                      className="stop-select-btn"
                      onClick={() => {
                        setActiveSearchTarget({ legIdx: idx, field: 'alight' });
                        setSearchQuery('');
                      }}
                    >
                      <MapPin size={13} />
                      {leg.alight_stop_name || 'Выбрать остановку выхода…'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Stop Autocomplete Modal / Subsheet */}
            {activeSearchTarget && (
              <div className="stop-search-box">
                <div className="search-box-head">
                  <Search size={15} />
                  <input
                    autoFocus
                    placeholder="Поиск остановки (напр. Cuza Voda, Stefan cel Mare)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setActiveSearchTarget(null)}
                    aria-label="Закрыть поиск"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="search-results-list">
                  {searchResults.map((s) => (
                    <button
                      key={s.stop_id}
                      type="button"
                      className="stop-item-btn"
                      onClick={() => selectStop(s)}
                    >
                      <MapPin size={14} />
                      <div>
                        <b>{s.stop_name}</b>
                        {s.stop_desc && <small>{s.stop_desc}</small>}
                      </div>
                    </button>
                  ))}
                  {searchResults.length === 0 && (
                    <div className="empty-search-text">
                      Остановок не найдено. Начни вводить название.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSave}
                disabled={saving}
                style={{ width: '100%' }}
              >
                {saving ? 'Сохранение…' : 'Подтвердить и сохранить маршрут'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
