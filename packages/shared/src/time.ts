export const TZ = 'Europe/Chisinau';

export const min = (t: string): number => {
  const [a, b] = t.split(':').map(Number);
  return a * 60 + b;
};

export const hm = (n: number): string => {
  const norm = ((n % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const diffMin = (a: string, b: string): number => min(b) - min(a);

export const toChisinauDate = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

export const dateParts = (
  d: Date
): {
  key: string;
  weekday: number;
  year: number;
  month: number;
  day: number;
} => {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const date = new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
  return {
    key: `${p.year}-${p.month}-${p.day}`,
    weekday: ((date.getUTCDay() + 6) % 7) + 1,
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
  };
};

export const localNoon = (key: string): Date => new Date(`${key}T12:00:00Z`);

export const dateShift = (dateStr: string, days: number): string => {
  const d = localNoon(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toChisinauDate(d);
};

export const localInstant = (dateStr: string, minutes: number, tz = TZ): number => {
  const base = Date.parse(`${dateStr}T00:00:00Z`) + minutes * 60000;
  let stamp = base;
  for (let i = 0; i < 4; i++) {
    const f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(stamp));
    const p = Object.fromEntries(f.map((x) => [x.type, x.value]));
    stamp +=
      base -
      Date.UTC(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        Number(p.hour),
        Number(p.minute)
      );
  }
  return stamp;
};

export const zonedIso = (dateStr: string, timeStr: string, tz = TZ): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, hh, mm);
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date(candidate))
        .map((x) => [x.type, x.value])
    );
    const represented = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute)
    );
    candidate += target - represented;
  }
  return new Date(candidate).toISOString();
};

export const fmtDate = (
  key: string,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
): string => new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, ...opts }).format(localNoon(key));
