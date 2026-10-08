-- Migration 0008: Real Tranzy route IDs and cleanup fake stop IDs

-- 1. Update initial commute_options drafts with real Tranzy RTEC route IDs:
-- Route 2 -> route_id: 9
-- Route 4 -> route_id: 20
-- Route 17 -> route_id: 16
-- Clear fake dummy stop IDs (101, 202, 303, 404) so that user confirms real stops in modal

UPDATE commute_options
SET legs = '[{"mode":"fixed_route","route_id":9,"route_short_name":"2","board_stop_id":null,"board_stop_name":"Dacia / Cuza Vodă","alight_stop_id":null,"alight_stop_name":"Parcul Ștefan cel Mare"},{"mode":"any_trolleybus","route_id":null,"route_short_name":"любой троллейбус","board_stop_id":null,"board_stop_name":"Parcul Ștefan cel Mare","alight_stop_id":null,"alight_stop_name":"Universitatea de Stat"}]'
WHERE id LIKE 'univ-a%';

UPDATE commute_options
SET legs = '[{"mode":"fixed_route","route_id":20,"route_short_name":"4","board_stop_id":null,"board_stop_name":"Dacia / Cuza Vodă","alight_stop_id":null,"alight_stop_name":"Universitatea de Stat"}]'
WHERE id LIKE 'univ-b%';

UPDATE commute_options
SET legs = '[{"mode":"fixed_route","route_id":16,"route_short_name":"17","board_stop_id":null,"board_stop_name":"Strada Cuza Vodă","alight_stop_id":null,"alight_stop_name":"Complexul Sportiv USM (Ismail 1)"}]'
WHERE id LIKE 'sports-17%';

-- 2. Remove previously hardcoded fake stops with mock IDs (101..606)
DELETE FROM tranzy_stops
WHERE stop_id IN (
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117,
  200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216,
  301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313,
  401, 404, 405,
  501, 502, 503, 504, 505, 506, 507, 508,
  601, 602, 603, 604, 605, 606
);
