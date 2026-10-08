-- Migration 0009: Application key-value state table for high-volume caching (stops_json, timestamps)
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
