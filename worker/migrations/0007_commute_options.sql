-- Migration 0007: Commute options and Tranzy transit data

CREATE TABLE IF NOT EXISTS commute_options (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1,
  destination TEXT NOT NULL CHECK(destination IN ('university', 'sports')),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_configured INTEGER NOT NULL DEFAULT 0,
  walk_before_minutes INTEGER NOT NULL DEFAULT 7,
  walk_after_minutes INTEGER NOT NULL DEFAULT 5,
  legs TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commute_options_user ON commute_options(user_id, destination);

-- Add destination column to classes table
ALTER TABLE classes ADD COLUMN destination TEXT NOT NULL DEFAULT 'university' CHECK(destination IN ('university', 'sports'));

-- Update existing sports/PE classes
UPDATE classes SET destination = 'sports'
WHERE title LIKE '%физ%'
   OR title LIKE '%спорт%'
   OR title LIKE '%Educația fizică%'
   OR title LIKE '%Educatia fizica%';

-- Tranzy local stops and routes cache tables
CREATE TABLE IF NOT EXISTS tranzy_stops (
  stop_id INTEGER PRIMARY KEY,
  stop_name TEXT NOT NULL,
  stop_desc TEXT,
  stop_lat REAL,
  stop_lon REAL,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tranzy_routes (
  route_id INTEGER PRIMARY KEY,
  route_short_name TEXT NOT NULL,
  route_long_name TEXT,
  route_type INTEGER NOT NULL,
  route_color TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- Seed unconfirmed drafts for default user (is_configured = 0 until user confirms stops)
INSERT OR IGNORE INTO commute_options (
  id, user_id, destination, name, position, enabled, is_configured, walk_before_minutes, walk_after_minutes, legs
) VALUES
(
  'univ-a',
  1,
  'university',
  'Университет · А',
  1,
  1,
  0,
  7,
  5,
  '[{"mode":"fixed_route","route_id":2,"route_short_name":"2","board_stop_id":101,"board_stop_name":"Dacia / Cuza Vodă","alight_stop_id":202,"alight_stop_name":"Parcul Ștefan cel Mare"},{"mode":"any_trolleybus","route_id":null,"route_short_name":"любой троллейбус","board_stop_id":202,"board_stop_name":"Parcul Ștefan cel Mare","alight_stop_id":303,"alight_stop_name":"Universitatea de Stat"}]'
),
(
  'univ-b',
  1,
  'university',
  'Университет · Б',
  2,
  1,
  0,
  7,
  5,
  '[{"mode":"fixed_route","route_id":4,"route_short_name":"4","board_stop_id":101,"board_stop_name":"Dacia / Cuza Vodă","alight_stop_id":303,"alight_stop_name":"Universitatea de Stat"}]'
),
(
  'sports-17',
  1,
  'sports',
  'Физкультура',
  1,
  1,
  0,
  12,
  3,
  '[{"mode":"fixed_route","route_id":17,"route_short_name":"17","board_stop_id":101,"board_stop_name":"Strada Cuza Vodă","alight_stop_id":404,"alight_stop_name":"Complexul Sportiv USM (Ismail 1)"}]'
);
