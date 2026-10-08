-- Migration 0009: Rate limiting for trip plan API (30 requests/hour per user)

CREATE TABLE IF NOT EXISTS trip_plan_rate_limit (
  user_id TEXT NOT NULL,
  window_hour INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, window_hour)
);

CREATE INDEX IF NOT EXISTS idx_trip_rate_limit_window ON trip_plan_rate_limit(window_hour);
