ALTER TABLE settings ADD COLUMN schedule_initialized INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('custom','weather','evening')),
  message TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL,
  create_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_deliveries (
  broadcast_id TEXT NOT NULL REFERENCES admin_broadcasts(id),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','unknown')),
  error TEXT,
  started_at INTEGER,
  sent_at TEXT,
  PRIMARY KEY (broadcast_id,user_id)
);
CREATE INDEX IF NOT EXISTS admin_deliveries_pending ON admin_deliveries(broadcast_id,status);
CREATE INDEX IF NOT EXISTS admin_broadcasts_owner ON admin_broadcasts(admin_id,created_at);
