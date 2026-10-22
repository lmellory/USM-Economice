import React from 'react';
import { Toggle } from './Toggle.js';
export function NotificationControls({
  settings,
  save,
}: {
  settings: any;
  save: (patch: any) => Promise<void>;
}) {
  const time = (key: string, label: string, fallback: string) => (
    <label className="setting-field">
      {label}
      <input
        type="time"
        aria-label={label}
        value={settings[key] ?? fallback}
        onChange={(e) => {
          if (e.target.value) void save({ [key]: e.target.value });
        }}
      />
    </label>
  );
  return (
    <div className="notification-controls">
      <Toggle
        label="Тихие часы"
        value={Boolean(settings.quiet_hours_enabled)}
        onChange={(value: boolean) => save({ quiet_hours_enabled: value })}
      />
      {settings.quiet_hours_enabled && (
        <>
          <div className="setting-grid">
            {time('quiet_start', 'Не беспокоить с', '23:00')}
            {time('quiet_end', 'До', '08:00')}
          </div>
          <p className="notification-note">
            Сроки напомним после тихих часов, если они ещё актуальны. Напоминания о подъёме, сне и
            выходе в это время пропускаются. Одинаковое время отключает тихие часы.
          </p>
        </>
      )}
      <Toggle
        label="Ежедневный план на завтра"
        value={Boolean(settings.daily_summary_enabled)}
        onChange={(value: boolean) => save({ daily_summary_enabled: value })}
      />
      {settings.daily_summary_enabled && time('daily_summary_time', 'Время плана', '21:00')}
      <Toggle
        label="Присылать погоду"
        value={Boolean(settings.weather_enabled)}
        onChange={(value: boolean) => save({ weather_enabled: value })}
      />
      {settings.weather_enabled && (
        <>
          {time('weather_time', 'Время погоды', '07:00')}
          <Toggle
            label="Добавлять пожелание к погоде"
            value={Boolean(settings.daily_wishes)}
            onChange={(value: boolean) => save({ daily_wishes: value })}
          />
        </>
      )}
      <p className="notification-note">
        Время — по Кишинёву. Погода и план приходят только после включения. Команды /weather и /plan
        доступны в любое время.
      </p>
    </div>
  );
}
