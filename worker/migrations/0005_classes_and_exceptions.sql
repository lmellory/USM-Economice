-- Migration 0005: Classes and schedule exceptions tables
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK(day BETWEEN 1 AND 7),
  start TEXT NOT NULL,
  end TEXT,
  title TEXT NOT NULL,
  kind TEXT,
  place TEXT NOT NULL DEFAULT '',
  parity TEXT CHECK(parity IN ('odd', 'even')),
  online INTEGER NOT NULL DEFAULT 0,
  duration_unknown INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_classes_user_day ON classes(user_id, day);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('cancel', 'move')),
  new_start TEXT,
  new_end TEXT,
  new_place TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exceptions_user_date ON schedule_exceptions(user_id, date);
