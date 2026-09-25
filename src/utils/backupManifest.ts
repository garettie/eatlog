export interface BackupCountsV1 {
  foodLogs: number;
  meals: number;
  weightLogs: number;
  dailyTargets: number;
  photos: number;
}

export interface BackupManifestV1 {
  formatVersion: 1;
  createdAt: string;
  appVersion: string;
  databaseVersion: number;
  databaseFile: 'database.sqlite';
  photoFiles: Array<{ archivePath: string; mealId: number; originalFileName: string }>;
  counts: BackupCountsV1;
}

export interface BackupCountsV2 extends BackupCountsV1 {
  profile: number;
  adaptiveReviews: number;
}

export interface BackupFileEntry {
  archivePath: string;
  size: number;
  md5: string;
}

export interface BackupManifestV2 {
  formatVersion: 2;
  createdAt: string;
  appVersion: string;
  appBuild: string;
  databaseVersion: number;
  databaseFile: 'database.sqlite';
  files: BackupFileEntry[];
  photoFiles: Array<{ archivePath: string; mealId: number; originalFileName: string }>;
  counts: BackupCountsV2;
}

export type BackupManifest = BackupManifestV1 | BackupManifestV2;

// No fixed size cap: a long-time user's photos can pass any round number, and a backup the app
// created must always restore. Real backups are mostly JPEGs that barely compress, while a zip
// bomb expands hundreds of times over, so the expansion ratio is what separates them.
export const MAX_BACKUP_EXPANSION_RATIO = 20;
/** Below this an archive may expand freely: a photo-less backup's database compresses well. */
export const ALWAYS_ALLOWED_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const RESTORE_SPACE_HEADROOM_BYTES = 200 * 1024 * 1024;

export function createBackupManifestV2(value: Omit<BackupManifestV2, 'formatVersion'>): BackupManifestV2 {
  return { formatVersion: 2, ...value };
}

export function validateBackupArchiveSizes(archiveBytes: number, uncompressedBytes?: number): void {
  if (!Number.isSafeInteger(archiveBytes) || archiveBytes <= 0) {
    throw new Error('This backup file is empty.');
  }
  if (uncompressedBytes !== undefined
    && (!Number.isSafeInteger(uncompressedBytes) || uncompressedBytes <= 0
      || uncompressedBytes > Math.max(ALWAYS_ALLOWED_UNCOMPRESSED_BYTES, archiveBytes * MAX_BACKUP_EXPANSION_RATIO))) {
    throw new Error("This backup file is damaged and can't be opened.");
  }
}

/**
 * Free space a restore needs at its peak: the unpacked staging copy, the restored photos copied
 * out of it, and the safety copy of the current photos kept until the restore is verified.
 */
export function restoreSpaceNeeded(uncompressedBytes: number, livePhotoBytes: number): number {
  return uncompressedBytes * 2 + livePhotoBytes + RESTORE_SPACE_HEADROOM_BYTES;
}

/** Fails before unpacking, so a full phone gets a clear message rather than a failed restore. */
export function validateRestoreSpace(neededBytes: number, availableBytes: number): void {
  if (!Number.isFinite(availableBytes) || availableBytes >= neededBytes) return;
  const gigabytes = Math.max(0.1, Math.ceil((neededBytes / 1024 ** 3) * 10) / 10);
  throw new Error(`Restoring this backup needs about ${gigabytes} GB of free space. Free up some space and try again.`);
}

export function validateExtractedBackupPaths(
  paths: string[],
  manifest: { databaseFile: string; photoFiles: ReadonlyArray<{ archivePath: string }> },
): void {
  const actual = new Set<string>();
  for (const path of paths) {
    if (!isSafeArchivePath(path)) throw new Error('Backup contains an unsafe archive path.');
    if (actual.has(path)) throw new Error('Backup contains a duplicate archive path.');
    actual.add(path);
  }
  const expected = new Set([
    'manifest.json',
    manifest.databaseFile,
    ...manifest.photoFiles.map((photo) => photo.archivePath),
  ]);
  if (expected.size !== actual.size || [...expected].some((path) => !actual.has(path))) {
    throw new Error('Backup archive contents do not match its manifest.');
  }
}

export function isSupportedBackupFileName(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.endsWith('.eatlog-backup') || normalized.endsWith('.marco-backup');
}

export function backupFileNameFromUri(uri: string): string {
  const name = decodeURIComponent(uri.replace(/\/+$/, '').split('/').pop() ?? '');
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new Error('A meal photo has an invalid filename.');
  }
  return name;
}

export function isSafeArchivePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.startsWith('/') || path.includes('\\')) return false;
  return path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function isSafeFileName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..'
    && !name.includes('/') && !name.includes('\\');
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function validateCounts(counts: unknown, requireV2: boolean): void {
  if (!counts || typeof counts !== 'object') throw new Error('Backup manifest counts are missing.');
  const value = counts as Record<string, unknown>;
  const names = ['foodLogs', 'meals', 'weightLogs', 'dailyTargets', 'photos'];
  if (requireV2) names.push('profile', 'adaptiveReviews');
  if (names.some((name) => !isNonNegativeInteger(value[name]))) {
    throw new Error('Backup manifest contains invalid row counts.');
  }
}

export function validateBackupCounts(
  expected: BackupCountsV1 | BackupCountsV2,
  actual: BackupCountsV2,
): void {
  const names: Array<keyof BackupCountsV2> = ['foodLogs', 'meals', 'weightLogs', 'dailyTargets', 'photos'];
  if ('profile' in expected) names.push('profile', 'adaptiveReviews');
  const expectedCounts = expected as Partial<BackupCountsV2>;
  if (names.some((name) => actual[name] !== expectedCounts[name])) {
    throw new Error('Backup row counts do not match its manifest.');
  }
}

export function validateBackupFileIntegrity(
  expected: BackupFileEntry,
  actual: { size?: number; md5?: string | null },
): void {
  if (actual.size !== expected.size || actual.md5?.toLowerCase() !== expected.md5.toLowerCase()) {
    throw new Error(`Backup integrity check failed for ${expected.archivePath}.`);
  }
}

export function validateBackupManifest(value: unknown, databaseVersion: number): BackupManifest {
  if (!value || typeof value !== 'object') throw new Error('Backup manifest is missing.');
  const formatVersion = (value as { formatVersion?: unknown }).formatVersion;
  if (formatVersion !== 1 && formatVersion !== 2) {
    throw new Error('This backup format is not supported.');
  }
  const manifest = value as BackupManifest;
  if (typeof manifest.appVersion !== 'string' || manifest.appVersion.length === 0) {
    throw new Error('Backup manifest is incomplete.');
  }
  if (!isNonNegativeInteger(manifest.databaseVersion) || manifest.databaseVersion > databaseVersion) {
    throw new Error('This backup uses a newer database version.');
  }
  if (manifest.databaseFile !== 'database.sqlite' || !Array.isArray(manifest.photoFiles)) {
    throw new Error('Backup manifest is incomplete.');
  }
  if (typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt))) {
    throw new Error('Backup manifest has an invalid creation date.');
  }

  validateCounts(manifest.counts, manifest.formatVersion === 2);
  const paths = new Set<string>(['database.sqlite']);
  const mealIds = new Set<number>();
  for (const photo of manifest.photoFiles) {
    if (!photo || !Number.isInteger(photo.mealId) || !isSafeArchivePath(photo.archivePath)
      || !photo.archivePath.startsWith('photos/') || paths.has(photo.archivePath)
      || mealIds.has(photo.mealId) || !isSafeFileName(photo.originalFileName)) {
      throw new Error('Backup contains an invalid photo path.');
    }
    paths.add(photo.archivePath);
    mealIds.add(photo.mealId);
  }
  if (manifest.photoFiles.length !== manifest.counts.photos) throw new Error('Backup photo count does not match its manifest.');

  if (manifest.formatVersion === 2) {
    if (!Array.isArray(manifest.files) || typeof manifest.appBuild !== 'string') {
      throw new Error('Backup manifest is incomplete.');
    }
    const filePaths = new Set<string>();
    for (const file of manifest.files) {
      if (!file || !isSafeArchivePath(file.archivePath) || filePaths.has(file.archivePath)
        || !isNonNegativeInteger(file.size) || typeof file.md5 !== 'string'
        || !/^[a-f0-9]{32}$/i.test(file.md5)) {
        throw new Error('Backup manifest contains invalid file metadata.');
      }
      filePaths.add(file.archivePath);
    }
    for (const requiredPath of paths) {
      if (!filePaths.has(requiredPath)) throw new Error('Backup manifest is missing file metadata.');
    }
    if (filePaths.size !== paths.size) throw new Error('Backup manifest contains unexpected file metadata.');
  }
  return manifest as BackupManifest;
}
