const bool = (v: unknown): boolean => v === true || v === 1;

export const settingsColumns: Record<string, string> = {
  semesterStart: 'semester_start',
  semester_start: 'semester_start',
  firstWeekParity: 'first_week_parity',
  first_week_parity: 'first_week_parity',
  englishDuration: 'english_duration',
  english_duration: 'english_duration',
  sleepHours: 'sleep_hours',
  sleep_hours: 'sleep_hours',
  sleepLatency: 'sleep_latency',
  sleep_latency: 'sleep_latency',
  washMinutes: 'wash_minutes',
  wash_minutes: 'wash_minutes',
  breakfastMinutes: 'breakfast_minutes',
  breakfast_minutes: 'breakfast_minutes',
  getReadyMinutes: 'get_ready_minutes',
  get_ready_minutes: 'get_ready_minutes',
  travelBuffer: 'travel_buffer',
  travel_buffer: 'travel_buffer',
  travelMinutes: 'travel_minutes',
  travel_minutes: 'travel_minutes',
  targetBedtime: 'target_bedtime',
  target_bedtime: 'target_bedtime',
  hairDryMinutes: 'hair_dry_minutes',
  hair_dry_minutes: 'hair_dry_minutes',
  homeAddress: 'home_address',
  home_address: 'home_address',
  universityAddress: 'university_address',
  university_address: 'university_address',
  theme: 'theme',
  remindersEnabled: 'reminders_enabled',
  reminders_enabled: 'reminders_enabled',
  reminderMinutes: 'reminder_minutes',
  reminder_minutes: 'reminder_minutes',
  wakeReminder: 'wake_reminder',
  wake_reminder: 'wake_reminder',
  sleepReminder: 'sleep_reminder',
  sleep_reminder: 'sleep_reminder',
  leaveReminder: 'leave_reminder',
  leave_reminder: 'leave_reminder',
};

export function dbSettings(s: any): any {
  if (!s) return null;
  return {
    ...s,
    wash_minutes: s.wash_minutes ?? 20,
    hair_dry_minutes: s.hair_dry_minutes ?? 5,
    breakfast_minutes: s.breakfast_minutes ?? 30,
    get_ready_minutes: s.get_ready_minutes ?? 10,
    target_bedtime: s.target_bedtime ?? '00:15',
    reminders_enabled: bool(s.reminders_enabled),
    wake_reminder: bool(s.wake_reminder),
    sleep_reminder: bool(s.sleep_reminder),
    leave_reminder: bool(s.leave_reminder),
  };
}

export function validatedSettings(body: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [rawKey, rawValue] of Object.entries(body ?? {})) {
    const col = settingsColumns[rawKey];
    if (!col) continue;

    let val = rawValue;

    if (col === 'english_duration') {
      if (val === null || val === undefined || val === '' || val === 0) {
        val = null;
      } else {
        const num = Math.round(Number(val));
        if (!Number.isFinite(num) || num < 1 || num > 240) {
          throw new Error('Длительность английского должна быть от 1 до 240 минут.');
        }
        val = num;
      }
    } else if (col === 'theme') {
      if (val !== undefined && !['light', 'dark', 'pink'].includes(String(val))) {
        throw new Error('Некорректная тема.');
      }
    } else if (col === 'target_bedtime') {
      if (val === '' || val === null) val = null;
      else if (!/^\d{2}:\d{2}$/.test(String(val))) {
        throw new Error('Время отбоя должно быть в формате ЧЧ:ММ.');
      }
    } else if (col === 'first_week_parity') {
      if (
        val !== undefined &&
        val !== null &&
        val !== '' &&
        !['odd', 'even'].includes(String(val))
      ) {
        throw new Error('Некорректная чётность недели.');
      }
      if (val === '') val = null;
    } else if (col === 'semester_start') {
      if (val === '') val = null;
      else if (val !== null && val !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(val))) {
        throw new Error('Некорректная дата семестра.');
      }
    } else if (col === 'home_address' || col === 'university_address') {
      if (typeof val === 'string' && val.length > 300) {
        throw new Error('Адрес слишком длинный.');
      }
      val = val ? String(val).trim() : null;
    } else if (
      ['reminders_enabled', 'wake_reminder', 'sleep_reminder', 'leave_reminder'].includes(col)
    ) {
      val = bool(val) ? 1 : 0;
    } else if (
      [
        'sleep_hours',
        'sleep_latency',
        'wash_minutes',
        'hair_dry_minutes',
        'breakfast_minutes',
        'get_ready_minutes',
        'travel_buffer',
        'travel_minutes',
        'reminder_minutes',
      ].includes(col)
    ) {
      if (val !== null && val !== undefined && val !== '') {
        const num = Number(val);
        if (!Number.isFinite(num) || num < 0) {
          throw new Error('Значение должно быть положительным числом.');
        }
        val = col === 'sleep_hours' ? Number(num.toFixed(1)) : Math.round(num);
      }
    }

    out[col] = val;
  }

  return out;
}
