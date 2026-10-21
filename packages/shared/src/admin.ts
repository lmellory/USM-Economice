export const ADMIN_MESSAGE_LIMIT = 4096;
export type BroadcastType = 'custom' | 'weather' | 'evening';
export interface BroadcastInput {
  requestId: string;
  type: BroadcastType;
  message: string;
  audience: 'self' | 'selected' | 'all';
  targetUserIds: string[];
}
export interface AdminUser {
  id: string;
  first_name: string;
  created_at: string;
}
export interface BroadcastSummary {
  id: string;
  type: BroadcastType;
  message: string;
  created_at: string;
  totalTargeted: number;
  sentCount: number;
  failedCount: number;
  unknownCount: number;
  pendingCount: number;
  sendingCount: number;
  complete: boolean;
  input: BroadcastInput;
}
export interface BroadcastResult extends BroadcastSummary {
  failed: { id: string; name: string; error: string; status: string }[];
}
