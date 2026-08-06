import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';
import { getUncompressedSize, unzip, zip } from 'react-native-zip-archive';

import {
  clearHealthConnectDeviceState,
  closeDatabase,
  getDatabaseVersion,
  getDb,
  getMealPhotoReferences,
  initDatabase,
  resetDatabaseConnection,
} from '../db/database';
import {
  type BackupCountsV2,
  type BackupFileEntry,
  type BackupManifest,
  type BackupManifestV2,
  validateBackupCounts,
  validateBackupFileIntegrity,
  validateBackupManifest,
  isSupportedBackupFileName,
} from '../utils/backupManifest';
import { getMealPhotoDirectory } from '../utils/mealPhotos';
import { getApplicationInfo } from '../utils/applicationInfo';
import type { OwnershipProgressListener, OwnershipResult, RestorePreview } from './dataOwnership.types';
import { waitForHealthConnectIdle } from './healthConnect';

const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;

function nativePath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

function baseName(uri: string): string {
  const name = decodeURIComponent(uri.split('/').pop() ?? '');
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new Error('A meal photo has an invalid filename.');
  }
  return name;
}

function abortIfRequested(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Operation cancelled.');
}

async function snapshotCounts(db: SQLite.SQLiteDatabase): Promise<BackupCountsV2> {
  const count = async (table: string, where = ''): Promise<number> => {
    try {
      const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}${where}`);
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  };
  const [profile, foodLogs, meals, weightLogs, dailyTargets, adaptiveReviews, photos] = await Promise.all([
    count('profile'), count('food_logs'), count('meals'), count('weight_logs'),
    count('daily_targets'), count('adaptive_reviews'), count('meals', ' WHERE photo_uri IS NOT NULL'),
  ]);
  return { profile, foodLogs, meals, weightLogs, dailyTargets, adaptiveReviews, photos };
}

function fileMetadata(file: File, archivePath: string): BackupFileEntry {
  const info = file.info({ md5: true });
  if (!info.exists || info.size == null || !info.md5) throw new Error(`Could not verify ${archivePath}.`);
  return { archivePath, size: info.size, md5: info.md5 };
}

export async function createBackup(
  onProgress?: OwnershipProgressListener,
  signal?: AbortSignal,
): Promise<File> {
  const stamp = Date.now();
  const stage = new Directory(Paths.cache, `eatlog-backup-stage-${stamp}`);
  const photoStage = new Directory(stage, 'photos');
  const archive = new File(Paths.cache, `eatlog-${stamp}.eatlog-backup`);
  stage.create({ intermediates: true });
  photoStage.create();
  const snapshot = await SQLite.openDatabaseAsync('database.sqlite', undefined, stage.uri);
  try {
    onProgress?.({ operation: 'backup', phase: 'database', completed: 0, total: 3, message: 'Creating a consistent database snapshot', cancellable: true });
    abortIfRequested(signal);
    await SQLite.backupDatabaseAsync({ sourceDatabase: await getDb(), destDatabase: snapshot });

    const references = await getMealPhotoReferences();
    const photoFiles: BackupManifestV2['photoFiles'] = [];
    const files: BackupFileEntry[] = [];
    for (let index = 0; index < references.length; index += 1) {
      abortIfRequested(signal);
      const reference = references[index];
      const source = new File(reference.uri);
      if (!source.exists) {
        await snapshot.runAsync('UPDATE meals SET photo_uri = NULL WHERE id = ?', [reference.mealId]);
        continue;
      }
      const originalFileName = baseName(reference.uri);
      const archivedName = `${reference.mealId}-${originalFileName}`;
      const destination = new File(photoStage, archivedName);
      await LegacyFileSystem.copyAsync({ from: source.uri, to: destination.uri });
      const archivePath = `photos/${archivedName}`;
      photoFiles.push({ archivePath, mealId: reference.mealId, originalFileName });
      files.push(fileMetadata(destination, archivePath));
      onProgress?.({
        operation: 'backup', phase: 'photos', completed: index + 1, total: Math.max(references.length, 1),
        message: `Staging photos ${index + 1} of ${references.length}`, cancellable: true,
      });
    }

    await snapshot.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
    const counts = await snapshotCounts(snapshot);
    await snapshot.closeAsync();
    const databaseFile = new File(stage, 'database.sqlite');
    files.unshift(fileMetadata(databaseFile, 'database.sqlite'));
    const application = getApplicationInfo();
    const manifest: BackupManifestV2 = {
      formatVersion: 2,
      createdAt: new Date().toISOString(),
      appVersion: application.appVersion,
      appBuild: application.appBuild,
      databaseVersion: getDatabaseVersion(),
      databaseFile: 'database.sqlite',
      files,
      photoFiles,
      counts,
    };
    new File(stage, 'manifest.json').write(JSON.stringify(manifest, null, 2));
    abortIfRequested(signal);
    onProgress?.({ operation: 'backup', phase: 'archive', completed: 2, total: 3, message: 'Packaging your backup', cancellable: false });
    await zip(nativePath(stage.uri), nativePath(archive.uri));
    return archive;
  } catch (error) {
    if (archive.exists) archive.delete();
    try { await snapshot.closeAsync(); } catch { /* already closed */ }
    throw error;
  } finally {
    if (stage.exists) stage.delete();
  }
}

export async function shareBackup(onProgress?: OwnershipProgressListener, signal?: AbortSignal): Promise<OwnershipResult> {
  const archive = await createBackup(onProgress, signal);
  try {
    if (!await Sharing.isAvailableAsync()) throw new Error('Android sharing is unavailable.');
    onProgress?.({ operation: 'backup', phase: 'share', completed: 3, total: 3, message: 'Choose where to save your backup', cancellable: false });
    await Sharing.shareAsync(archive.uri, {
      mimeType: 'application/octet-stream',
      dialogTitle: 'Save Eatlog backup',
      UTI: 'public.archive',
    });
    return { operation: 'backup', completedAt: new Date().toISOString(), summary: 'Backup created.' };
  } finally {
    if (archive.exists) archive.delete();
  }
}

async function validateStagedDatabase(databaseFile: File, manifest: BackupManifest): Promise<void> {
  const directory = new Directory(databaseFile.uri.slice(0, databaseFile.uri.lastIndexOf('/') + 1));
  const db = await SQLite.openDatabaseAsync(baseName(databaseFile.uri), undefined, directory.uri);
  try {
    const integrity = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
    if (integrity?.integrity_check !== 'ok') throw new Error('Backup database integrity check failed.');
    const foreignKeys = await db.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
    if (foreignKeys.length > 0) throw new Error('Backup database contains broken references.');
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) !== manifest.databaseVersion) throw new Error('Backup database version does not match its manifest.');

    const counts = await snapshotCounts(db);
    validateBackupCounts(manifest.counts, counts);

    const databasePhotoMeals = await db.getAllAsync<{ id: number }>('SELECT id FROM meals WHERE photo_uri IS NOT NULL');
    const manifestMealIds = new Set(manifest.photoFiles.map((photo) => photo.mealId));
    if (databasePhotoMeals.some((meal) => !manifestMealIds.has(meal.id))) {
      throw new Error('Backup photo mappings do not match its database.');
    }
    for (const photo of manifest.photoFiles) {
      const meal = await db.getFirstAsync<{ id: number }>('SELECT id FROM meals WHERE id = ?', [photo.mealId]);
      if (!meal) throw new Error('Backup contains a photo for a missing meal.');
    }
  } finally {
    await db.closeAsync();
  }
}

export async function validateBackupFile(file: File, onProgress?: OwnershipProgressListener, originalName?: string): Promise<RestorePreview> {
  if (!isSupportedBackupFileName(originalName ?? file.uri)) {
    throw new Error('Choose an .eatlog-backup or legacy .marco-backup file.');
  }
  if (!file.exists || file.size <= 0 || file.size > MAX_ARCHIVE_BYTES) throw new Error('This backup file is empty or too large.');
  const uncompressedSize = await getUncompressedSize(nativePath(file.uri));
  if (uncompressedSize <= 0 || uncompressedSize > MAX_UNCOMPRESSED_BYTES) throw new Error('This backup expands beyond the supported size limit.');

  const stage = new Directory(Paths.cache, `eatlog-restore-stage-${Date.now()}`);
  stage.create({ intermediates: true });
  try {
    onProgress?.({ operation: 'inspect', phase: 'extract', completed: 0, total: 3, message: 'Opening backup safely', cancellable: false });
    await unzip(nativePath(file.uri), nativePath(stage.uri));
    const manifestFile = new File(stage, 'manifest.json');
    const databaseFile = new File(stage, 'database.sqlite');
    if (!manifestFile.exists || !databaseFile.exists) throw new Error('Backup is missing its manifest or database.');
    const manifest = validateBackupManifest(JSON.parse(await manifestFile.text()), getDatabaseVersion());

    onProgress?.({ operation: 'inspect', phase: 'files', completed: 1, total: 3, message: 'Verifying files and photos', cancellable: false });
    for (const photo of manifest.photoFiles) {
      if (!new File(stage, photo.archivePath).exists) throw new Error('Backup is missing a referenced photo.');
    }
    if (manifest.formatVersion === 2) {
      for (const expected of manifest.files) {
        const actual = new File(stage, expected.archivePath);
        if (!actual.exists) throw new Error(`Backup is missing ${expected.archivePath}.`);
        const info = actual.info({ md5: true });
        validateBackupFileIntegrity(expected, info);
      }
    }

    onProgress?.({ operation: 'inspect', phase: 'database', completed: 2, total: 3, message: 'Checking database integrity', cancellable: false });
    await validateStagedDatabase(databaseFile, manifest);
    return { manifest, valid: true, stagingDirectoryUri: stage.uri, databaseUri: databaseFile.uri };
  } catch (error) {
    if (stage.exists) stage.delete();
    throw error;
  }
}

export async function pickAndInspectBackup(onProgress?: OwnershipProgressListener): Promise<RestorePreview | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  return validateBackupFile(new File(result.assets[0].uri), onProgress, result.assets[0].name);
}

export function discardRestorePreview(preview: RestorePreview): void {
  const stage = new Directory(preview.stagingDirectoryUri);
  if (stage.exists) stage.delete();
}

async function copyRestoredPhotos(
  preview: RestorePreview,
  stagedDb: SQLite.SQLiteDatabase,
  onProgress?: OwnershipProgressListener,
): Promise<void> {
  const liveDirectory = new Directory(getMealPhotoDirectory());
  if (liveDirectory.exists) liveDirectory.delete();
  if (preview.manifest.photoFiles.length === 0) return;
  liveDirectory.create({ intermediates: true });
  for (let index = 0; index < preview.manifest.photoFiles.length; index += 1) {
    const photo = preview.manifest.photoFiles[index];
    const source = new File(preview.stagingDirectoryUri, photo.archivePath);
    const restoredName = `${photo.mealId}-${photo.originalFileName}`;
    const destination = new File(liveDirectory, restoredName);
    await LegacyFileSystem.copyAsync({ from: source.uri, to: destination.uri });
    await stagedDb.runAsync('UPDATE meals SET photo_uri = ? WHERE id = ?', [destination.uri, photo.mealId]);
    onProgress?.({
      operation: 'restore', phase: 'photos', completed: 1, total: 4,
      message: `Restoring photos ${index + 1} of ${preview.manifest.photoFiles.length}`, cancellable: false,
    });
  }
}

export async function restoreBackup(preview: RestorePreview, onProgress?: OwnershipProgressListener): Promise<OwnershipResult> {
  const safetyDirectory = new Directory(Paths.cache, `eatlog-restore-safety-${Date.now()}`);
  const safetyPhotos = new Directory(safetyDirectory, 'meal-photos');
  safetyDirectory.create({ intermediates: true });
  const safetyDb = await SQLite.openDatabaseAsync('database.sqlite', undefined, safetyDirectory.uri);
  const stagedDirectory = new Directory(preview.stagingDirectoryUri);
  const stagedDb = await SQLite.openDatabaseAsync('database.sqlite', undefined, stagedDirectory.uri);
  let safetyHasPhotos = false;
  try {
    await waitForHealthConnectIdle();
    onProgress?.({ operation: 'restore', phase: 'safety', completed: 0, total: 4, message: 'Creating an internal safety copy', cancellable: false });
    await SQLite.backupDatabaseAsync({ sourceDatabase: await getDb(), destDatabase: safetyDb });
    const livePhotos = new Directory(getMealPhotoDirectory());
    if (livePhotos.exists) {
      livePhotos.copy(safetyPhotos);
      safetyHasPhotos = true;
    }

    await copyRestoredPhotos(preview, stagedDb, onProgress);
    await stagedDb.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');

    onProgress?.({ operation: 'restore', phase: 'database', completed: 2, total: 4, message: 'Replacing local data', cancellable: false });
    await closeDatabase();
    const destination = await getDb();
    await SQLite.backupDatabaseAsync({ sourceDatabase: stagedDb, destDatabase: destination });
    await closeDatabase();
    resetDatabaseConnection();
    await initDatabase();
    await clearHealthConnectDeviceState();

    onProgress?.({ operation: 'restore', phase: 'verify', completed: 4, total: 4, message: 'Verifying restored data', cancellable: false });
    const live = await getDb();
    const integrity = await live.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
    if (integrity?.integrity_check !== 'ok') throw new Error('Restored database integrity check failed.');
    return { operation: 'restore', completedAt: new Date().toISOString(), summary: 'Backup restored.' };
  } catch (error) {
    try {
      await closeDatabase();
      const live = await getDb();
      await SQLite.backupDatabaseAsync({ sourceDatabase: safetyDb, destDatabase: live });
      await closeDatabase();
      const livePhotos = new Directory(getMealPhotoDirectory());
      if (livePhotos.exists) livePhotos.delete();
      if (safetyHasPhotos && safetyPhotos.exists) safetyPhotos.copy(livePhotos);
      resetDatabaseConnection();
      await initDatabase();
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Restore failed and Eatlog could not complete its automatic rollback.');
    }
    throw error;
  } finally {
    try { await safetyDb.closeAsync(); } catch { /* already closed */ }
    try { await stagedDb.closeAsync(); } catch { /* already closed */ }
    if (safetyDirectory.exists) safetyDirectory.delete();
    if (stagedDirectory.exists) stagedDirectory.delete();
  }
}
