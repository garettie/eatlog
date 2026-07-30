export interface BackupManifest {
  formatVersion: 1;
  createdAt: string;
  appVersion: string;
  databaseVersion: number;
  databaseFile: 'database.sqlite';
  photoFiles: Array<{ archivePath: string; mealId: number; originalFileName: string }>;
  counts: { foodLogs: number; meals: number; weightLogs: number; dailyTargets: number; photos: number };
}

export function validateBackupManifest(value: unknown, databaseVersion: number): BackupManifest {
  if (!value || typeof value !== 'object') throw new Error('Backup manifest is missing.');
  const manifest = value as Partial<BackupManifest>;
  if (manifest.formatVersion !== 1) throw new Error('This backup format is not supported.');
  if (manifest.databaseVersion == null || manifest.databaseVersion > databaseVersion) throw new Error('This backup uses a newer database version.');
  if (manifest.databaseFile !== 'database.sqlite' || !Array.isArray(manifest.photoFiles) || !manifest.counts) throw new Error('Backup manifest is incomplete.');
  const paths = new Set<string>();
  for (const photo of manifest.photoFiles) {
    if (!photo || !Number.isInteger(photo.mealId) || !photo.archivePath.startsWith('photos/') || photo.archivePath.includes('..') || paths.has(photo.archivePath)) throw new Error('Backup contains an invalid photo path.');
    paths.add(photo.archivePath);
  }
  return manifest as BackupManifest;
}
