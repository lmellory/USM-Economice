-- Migration 0003: Add travel_minutes column and support pink theme
CREATE TABLE IF NOT EXISTS settings_new (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  semester_start TEXT,
  first_week_parity TEXT CHECK(first_week_parity IN ('even','odd')),
  english_duration INTEGER CHECK(english_duration BETWEEN 1 AND 240),
  sleep_hours REAL NOT NULL DEFAULT 8,
  sleep_latency INTEGER NOT NULL DEFAULT 15,
  wash_minutes INTEGER NOT NULL DEFAULT 15,
  breakfast_minutes INTEGER NOT NULL DEFAULT 20,
  get_ready_minutes INTEGER NOT NULL DEFAULT 15,
  travel_buffer INTEGER NOT NULL DEFAULT 10,
  home_address TEXT DEFAULT 'strada Tudor Strișcă 8/7, Chișinău',
  university_address TEXT DEFAULT 'strada Alexei Mateevici 60, Chișinău',
  theme TEXT NOT NULL DEFAULT 'light' CHECK(theme IN ('light','dark','pink')),
  reminders_enabled INTEGER NOT NULL DEFAULT 0,
  reminder_minutes INTEGER NOT NULL DEFAULT 60,
  wake_reminder INTEGER NOT NULL DEFAULT 0,
  sleep_reminder INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leave_reminder INTEGER DEFAULT 0,
  travel_minutes INTEGER DEFAULT 35
);

INSERT OR REPLACE INTO settings_new (
  user_id, semester_start, first_week_parity, english_duration, sleep_hours, sleep_latency,
  wash_minutes, breakfast_minutes, get_ready_minutes, travel_buffer, home_address, university_address,
  theme, reminders_enabled, reminder_minutes, wake_reminder, sleep_reminder, updated_at, leave_reminder, travel_minutes
)
SELECT
  user_id, semester_start, first_week_parity, english_duration, sleep_hours, sleep_latency,
  wash_minutes, breakfast_minutes, get_ready_minutes, travel_buffer, home_address, university_address,
  theme, reminders_enabled, reminder_minutes, wake_reminder, sleep_reminder, updated_at,
  COALESCE(leave_reminder, 0), 35
FROM settings;

DROP TABLE settings;

ALTER TABLE settings_new RENAME TO settings;
