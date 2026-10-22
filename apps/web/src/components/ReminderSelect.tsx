import React from 'react';
import { REMINDER_OPTIONS, reminderLabel } from '@usm/shared';

export function ReminderSelect({
  value,
  onChange,
  label = 'Когда напомнить',
  allowOff = false,
  disabled = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  label?: string;
  allowOff?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="setting-field">
      {label}
      <select
        aria-label={label}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        {allowOff && <option value="">Без напоминания</option>}
        {value !== null && !REMINDER_OPTIONS.some((o) => o.minutes === value) && (
          <option value={value}>{reminderLabel(value)}</option>
        )}
        {REMINDER_OPTIONS.map((option) => (
          <option key={option.minutes} value={option.minutes}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
