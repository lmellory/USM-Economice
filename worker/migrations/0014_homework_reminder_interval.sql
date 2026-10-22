-- NULL keeps existing homework tied to the user's default reminder interval.
ALTER TABLE homework ADD COLUMN reminder_minutes INTEGER
  CHECK (reminder_minutes IS NULL OR (reminder_minutes >= 0 AND reminder_minutes <= 10080));

-- Preserve delivered reminders when moving to interval-specific queue keys.
UPDATE notification_log SET event_key = event_key || ':' || COALESCE((SELECT reminder_minutes FROM settings WHERE settings.user_id=notification_log.user_id), 60) WHERE event_key LIKE 'homework:%';
