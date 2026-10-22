import { dateShift, localInstant, toChisinauDate } from '@usm/shared';
export function localMinutes(now: Date): number {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Chisinau',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  return (
    Number(p.find((x) => x.type === 'hour')?.value || 0) * 60 +
    Number(p.find((x) => x.type === 'minute')?.value || 0)
  );
}
export function timeMinutes(time: unknown, fallback: string): number {
  const v = typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback;
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
}
export function quietUntil(settings: any, now: Date): Date | null {
  if (!settings?.quiet_hours_enabled) return null;
  const start = timeMinutes(settings.quiet_start, '23:00'),
    end = timeMinutes(settings.quiet_end, '08:00'),
    minute = localMinutes(now);
  if (start === end) return null;
  const active = start < end ? minute >= start && minute < end : minute >= start || minute < end;
  if (!active) return null;
  const date = toChisinauDate(now);
  return new Date(localInstant(start > end && minute >= start ? dateShift(date, 1) : date, end));
}
export function dailyDue(time: unknown, fallback: string, now: Date): boolean {
  const delta = localMinutes(now) - timeMinutes(time, fallback);
  return delta >= 0 && delta <= 5;
}
