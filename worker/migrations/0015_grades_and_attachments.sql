CREATE TABLE grades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('homework','test','exam','other')),
  score REAL NOT NULL CHECK (score >= 1 AND score <= 10),
  weight REAL NOT NULL DEFAULT 1 CHECK (weight >= 0.1 AND weight <= 10),
  date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX grades_user_subject ON grades(user_id,subject,date);
CREATE TABLE homework_attachments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  homework_id TEXT REFERENCES homework(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 5242880),
  storage_key TEXT NOT NULL UNIQUE,
  ready INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX attachments_homework ON homework_attachments(user_id,homework_id);
