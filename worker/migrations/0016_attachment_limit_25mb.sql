-- Rebuild only metadata to widen the size check; keep IDs, object keys and links.
CREATE TABLE homework_attachments_25mb (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  homework_id TEXT REFERENCES homework(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 26214400),
  storage_key TEXT NOT NULL UNIQUE,
  ready INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO homework_attachments_25mb(id,user_id,homework_id,name,mime,size,storage_key,ready,created_at)
SELECT id,user_id,homework_id,name,mime,size,storage_key,ready,created_at FROM homework_attachments;
DROP TABLE homework_attachments;
ALTER TABLE homework_attachments_25mb RENAME TO homework_attachments;
CREATE INDEX attachments_homework ON homework_attachments(user_id,homework_id);
