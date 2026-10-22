export const REMINDER_OPTIONS = [
  { minutes: 60, label: 'За час' },
  { minutes: 120, label: 'За 2 часа' },
  { minutes: 180, label: 'За 3 часа' },
  { minutes: 360, label: 'За 6 часов' },
  { minutes: 720, label: 'За 12 часов' },
  { minutes: 1440, label: 'За день' },
  { minutes: 2880, label: 'За 2 дня' },
  { minutes: 4320, label: 'За 3 дня' },
  { minutes: 10080, label: 'За неделю' },
] as const;

// Keep existing saved offsets readable without silently changing their time.
export function reminderLabel(minutes: number): string {
  const preset = REMINDER_OPTIONS.find((o) => o.minutes === minutes);
  if (preset) return preset.label;
  if (minutes === 0) return 'В момент срока';
  const hours = minutes / 60;
  const unit =
    hours % 1 !== 0
      ? 'часа'
      : hours % 100 >= 11 && hours % 100 <= 14
        ? 'часов'
        : hours % 10 === 1
          ? 'час'
          : hours % 10 >= 2 && hours % 10 <= 4
            ? 'часа'
            : 'часов';
  return 'За ' + hours.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ' + unit;
}

export function validReminderMinutes(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10080;
}
