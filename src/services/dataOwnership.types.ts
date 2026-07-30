import type { BackupManifest } from '../utils/backupManifest';

export interface RestorePreview {
  manifest: BackupManifest;
  valid: true;
}
