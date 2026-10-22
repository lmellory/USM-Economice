CREATE TABLE IF NOT EXISTS bot_messages (
  user_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  keep INTEGER NOT NULL DEFAULT 0 CHECK(keep IN (0,1)),
  cleared_at INTEGER,
  PRIMARY KEY(user_id,message_id)
);
CREATE INDEX IF NOT EXISTS bot_messages_cleanup ON bot_messages(user_id,keep,cleared_at,sent_at);
