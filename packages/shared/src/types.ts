export type WeekParity = 'odd' | 'even';

export interface ClassItem {
  day: number; // 1 = Пн, 7 = Вс
  start: string; // "HH:MM"
  end?: string; // "HH:MM"
  title: string;
  kind?: string;
  place: string;
  parity?: WeekParity;
  online?: boolean;
  durationUnknown?: boolean;
}

export interface RoutineSettings {
  sleep_hours: number;
  sleep_latency: number;
  wash_minutes: number;
  breakfast_minutes: number;
  get_ready_minutes: number;
  travel_buffer: number;
  travel_minutes: number;
  english_duration?: number | null;
}

export interface RoutineResult {
  first: ClassItem;
  firstCampus: boolean;
  wake: string;
  bed: string;
  wash: string;
  breakfast: string;
  getready: string;
  leave: string | null;
  arrive: string | null;
  commuteUncertain: boolean;
  warning?: string;
  onlineFirst: boolean;
  wakeMin: number;
  bedMin: number;
  leaveMin: number | null;
}
