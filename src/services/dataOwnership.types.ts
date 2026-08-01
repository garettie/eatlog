import type { BackupManifest } from '../utils/backupManifest';

export type OwnershipOperation = 'backup' | 'inspect' | 'restore' | 'export' | 'reset';

export interface OwnershipProgressEvent {
  operation: OwnershipOperation;
  phase: string;
  completed: number;
  total: number;
  message: string;
  cancellable: boolean;
}

export interface OwnershipResult {
  operation: OwnershipOperation;
  completedAt: string;
  summary: string;
}

export interface RestorePreview {
  manifest: BackupManifest;
  valid: true;
  stagingDirectoryUri: string;
  databaseUri: string;
}

export type OwnershipProgressListener = (event: OwnershipProgressEvent) => void;
