-- Migration 0004: Finalize schema and clean up runtime bootstrap patches
-- Settings table supports 'light', 'dark', 'pink' themes, leave_reminder, travel_minutes.
-- Runtime ALTER TABLE calls removed from worker bootstrap.
SELECT 1;
