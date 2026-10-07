import { ClassItem } from '@usm/shared';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  MINI_APP_URL: string;
  TRANZY_API_KEY?: string;
  TRANZY_VEHICLES_URL?: string;
  TRANZY_AGENCY_ID?: string;
  TRANZY_REFRESH_MINUTES?: string;
  TZ?: string;
}

export interface TelegramUser {
  id: number;
  first_name?: string;
}

export type { ClassItem };

export interface TransitState {
  available: boolean;
  source: string;
  checkedAt: string;
  note: string;
  route: null;
  estimateMinutes: number;
  liveVehicleCount?: number;
  trolleyCount?: number;
  busCount?: number;
  routesSummary?: string;
}
