CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('test','exam')),
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  place TEXT NOT NULL DEFAULT '',
  topics_json TEXT NOT NULL DEFAULT '[]',
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  reminder_minutes INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS assessments_user_date ON assessments(user_id,date);
CREATE INDEX IF NOT EXISTS assessments_reminders ON assessments(completed,date) WHERE reminder_minutes IS NOT NULL;
