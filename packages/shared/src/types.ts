export type WeekParity = 'odd' | 'even';

export interface ClassItem {
  id?: string;
  user_id?: string;
  day: number; // 1 = Пн, 7 = Вс
  start: string; // "HH:MM"
  end?: string; // "HH:MM"
  title: string;
  kind?: string;
  place: string;
  parity?: WeekParity;
  online?: boolean;
  durationUnknown?: boolean;
  duration_unknown?: boolean;
  position?: number;
  // Dynamic fields after applying exception:
  isCancelled?: boolean;
  isMoved?: boolean;
  exceptionId?: string;
  exceptionNote?: string | null;
}

export interface ScheduleException {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  class_id: string;
  type: 'cancel' | 'move';
  new_start?: string | null;
  new_end?: string | null;
  new_place?: string | null;
  note?: string | null;
  created_at?: string;
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
