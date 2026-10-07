-- Migration 0006: Target bedtime, hair dry minutes, and enhanced morning routine
ALTER TABLE settings ADD COLUMN target_bedtime TEXT DEFAULT '00:15';
ALTER TABLE settings ADD COLUMN hair_dry_minutes INTEGER NOT NULL DEFAULT 5;

-- Update defaults for existing rows to user preferences
UPDATE settings SET 
  wash_minutes = 20,
  hair_dry_minutes = 5,
  breakfast_minutes = 30,
  get_ready_minutes = 10,
  target_bedtime = '00:15'
WHERE target_bedtime IS NULL OR target_bedtime = '';
