ALTER TABLE settings ADD COLUMN IF NOT EXISTS travel_minutes INTEGER DEFAULT 35;
DO $$ BEGIN
  ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_theme_check;
  ALTER TABLE settings ADD CONSTRAINT settings_theme_check CHECK(theme IN ('light','dark','pink'));
END $$;
