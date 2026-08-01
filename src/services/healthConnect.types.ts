export type HealthConnectStatusKind =
  | 'unavailable'
  | 'provider_update_required'
  | 'disconnected'
  | 'partial'
  | 'paused'
  | 'syncing'
  | 'connected'
  | 'error';

export interface HealthConnectStatus {
  kind: HealthConnectStatusKind;
  canRead: boolean;
  canWrite: boolean;
  enabled: boolean;
  lastSyncAt: string | null;
  message: string;
}

export interface HealthSyncResult {
  read: boolean;
  wrote: boolean;
  imported: number;
  updated: number;
  deleted: number;
  exported: number;
  exportDeletions: number;
  skippedManual: number;
  completedAt: string;
}

export interface HealthConnectResetResult {
  attempted: boolean;
  deleted: boolean;
  warning: string | null;
}
