import React, { useEffect, useState } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  CircleAlert,
  House,
  Moon,
  Sparkles,
  Sunrise,
} from 'lucide-react';
import { Toggle } from './Toggle.js';

interface SettingsViewProps {
  settings: any;
  transit: any;
  save: (patch: any) => Promise<void>;
  onBack: () => void;
}

export function SettingsView({ settings, transit, save, onBack }: SettingsViewProps) {
  const [dur, setDur] = useState<string>(
    settings.english_duration != null ? String(settings.english_duration) : ''
  );

  useEffect(() => {
    setDur(settings.english_duration != null ? String(settings.english_duration) : '');
  }, [settings.english_duration]);

  const applyDuration = (valStr: string) => {
    const trimmed = valStr.trim();
    if (!trimmed || trimmed === '0') {
      setDur('');
      save({ english_duration: null, englishDuration: null });
      return;
    }
    const n = Math.round(Number(trimmed));
    if (Number.isFinite(n) && n >= 1 && n <= 240) {
      setDur(String(n));
      save({ english_duration: n, englishDuration: n });
    } else {
      setDur(settings.english_duration != null ? String(settings.english_duration) : '');
    }
  };

  const field = (key: string, label: string, unit: string = '', step = '1') => (
    <label className="setting-field">
      {label}
      <div>
        <input
          type="number"
          min="0"
          step={step}
          value={settings[key] ?? ''}
          onChange={(e) => save({ [key]: Number(e.target.value) })}
        />
        <span>{unit}</span>
      </div>
    </label>
  );

  return (
    <>
      <div className="settings-head">
        <button type="button" onClick={onBack}>
          <ChevronLeft size={18} /> Назад
        </button>
        <span className="eyebrow">ЛИЧНОЕ</span>
        <h1>Настройки</h1>
        <p>Твои данные видны только тебе.</p>
      </div>

      <section className="setting-card">
        <h3>
          <Sunrise size={17} /> Внешний вид
        </h3>
        <p>Выбери тему приложения — она сохранится в твоём профиле.</p>
        <div className="theme-picker">
          <button
            type="button"
            className={!settings.theme || settings.theme === 'light' ? 'selected' : ''}
            onClick={() => save({ theme: 'light' })}
          >
            <Sunrise size={16} /> Светлая
          </button>
          <button
            type="button"
            className={settings.theme === 'dark' ? 'selected' : ''}
            onClick={() => save({ theme: 'dark' })}
          >
            <Moon size={16} /> Тёмная
          </button>
          <button
            type="button"
            className={settings.theme === 'pink' ? 'selected' : ''}
            onClick={() => save({ theme: 'pink' })}
          >
            <Sparkles size={16} /> Розовая
          </button>
        </div>
      </section>

      <section className="setting-card">
        <h3>
          <CalendarDays size={17} /> Учебный календарь
        </h3>
        <p>Для чётных и нечётных недель нужна точка отсчёта.</p>
        <label className="setting-field">
          Первый день семестра
          <input
            type="date"
            value={settings.semester_start || ''}
            onChange={(e) =>
              save({
                semesterStart: e.target.value || null,
                semester_start: e.target.value || null,
              })
            }
          />
        </label>
        <label className="setting-field">
          Первая неделя семестра
          <select
            value={settings.first_week_parity || ''}
            onChange={(e) =>
              save({
                firstWeekParity: e.target.value || null,
                first_week_parity: e.target.value || null,
              })
            }
          >
            <option value="">Выбери чётность</option>
            <option value="odd">Нечётная</option>
            <option value="even">Чётная</option>
          </select>
        </label>
      </section>

      <section className="setting-card">
        <h3>
          <Sunrise size={17} /> Английский и дорога
        </h3>
        <p>
          Укажи длительность урока с репетитором (среда и пятница). Мы рассчитаем, успеваешь ли ты
          на пары и когда выходить из дома.
        </p>
        <label className="setting-field">
          Длительность онлайн-урока
          <div>
            <input
              type="number"
              min="1"
              max="240"
              placeholder="Например, 90"
              value={dur}
              onChange={(e) => setDur(e.target.value)}
              onBlur={(e) => applyDuration(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyDuration((e.target as HTMLInputElement).value);
              }}
            />
            <span>мин</span>
          </div>
        </label>
        <div className="duration-chips">
          {[45, 60, 80, 90, 120].map((m) => (
            <button
              key={m}
              type="button"
              className={Number(dur) === m ? 'on' : ''}
              onClick={() => {
                setDur(String(m));
                save({ english_duration: m, englishDuration: m });
              }}
            >
              {m} мин
            </button>
          ))}
          {dur && (
            <button type="button" className="clear" onClick={() => applyDuration('')}>
              Сбросить
            </button>
          )}
        </div>
        <div className="notice">
          <CircleAlert size={15} />
          {transit.available
            ? `Tranzy отвечает: получено ${transit.liveVehicleCount ?? 0} позиций. Прибытие, маршрут и пересадки не подтверждены.`
            : `${transit.note || 'Tranzy пока недоступен.'} Последняя проверка: ${
                transit.checkedAt
                  ? new Date(transit.checkedAt).toLocaleString('ru-RU', {
                      timeZone: 'Europe/Chisinau',
                    })
                  : 'нет данных'
              }.`}
        </div>
      </section>

      <section className="setting-card">
        <h3>
          <Moon size={17} /> Режим сна
        </h3>
        <p>Подъём рассчитывается по первому событию дня. Telegram не заменяет будильник.</p>
        <div className="setting-grid">
          {field('sleep_hours', 'Цель сна', 'ч', '0.5')}
          {field('sleep_latency', 'На засыпание', 'мин')}
          {field('wash_minutes', 'Умыться', 'мин')}
          {field('breakfast_minutes', 'Завтрак', 'мин')}
          {field('get_ready_minutes', 'Собраться', 'мин')}
          {field('travel_minutes', 'Время в дороге', 'мин')}
          {field('travel_buffer', 'Запас на дорогу', 'мин')}
        </div>
      </section>

      <section className="setting-card">
        <h3>
          <House size={17} /> Адреса
        </h3>
        <p>Сохраняются в приватных настройках профиля и не попадают в логи.</p>
        <label className="setting-field">
          Дом
          <input
            value={settings.home_address || ''}
            placeholder="Введи адрес дома"
            onBlur={(e) =>
              save({
                homeAddress: e.target.value || null,
                home_address: e.target.value || null,
              })
            }
          />
        </label>
        <label className="setting-field">
          Университет
          <input
            value={settings.university_address || ''}
            placeholder="Введи адрес университета"
            onBlur={(e) =>
              save({
                universityAddress: e.target.value || null,
                university_address: e.target.value || null,
              })
            }
          />
        </label>
      </section>

      <section className="setting-card">
        <h3>
          <Bell size={17} /> Telegram-напоминания
        </h3>
        <p>Сообщения придут только после включения.</p>
        <Toggle
          label="Напоминания о сроках ДЗ"
          value={Boolean(settings.reminders_enabled)}
          onChange={(v: boolean) => save({ remindersEnabled: v, reminders_enabled: v })}
        />
        <label className="setting-field">
          За сколько до срока
          <div>
            <input
              type="number"
              min="0"
              value={settings.reminder_minutes ?? 60}
              onChange={(e) =>
                save({
                  reminderMinutes: Number(e.target.value),
                  reminder_minutes: Number(e.target.value),
                })
              }
            />
            <span>мин</span>
          </div>
        </label>
        <Toggle
          label="Напомнить о подъёме"
          value={Boolean(settings.wake_reminder)}
          onChange={(v: boolean) => save({ wakeReminder: v, wake_reminder: v })}
        />
        <Toggle
          label="Напомнить о времени сна"
          value={Boolean(settings.sleep_reminder)}
          onChange={(v: boolean) => save({ sleepReminder: v, sleep_reminder: v })}
        />
        <Toggle
          label="Напомнить о выходе из дома"
          value={Boolean(settings.leave_reminder)}
          onChange={(v: boolean) => save({ leaveReminder: v, leave_reminder: v })}
        />
        <div className="notice">
          Время подъёма и выхода рассчитывается заранее — Telegram напомнит, когда пора собираться и
          выходить.
        </div>
      </section>
    </>
  );
}
