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
  backupFileNameFromUri,
  type BackupFileEntry,
  createBackupManifestV2,
  validateBackupArchiveSizes,
  validateExtractedBackupPaths,
  validateBackupFileIntegrity,
  validateBackupManifest,
  validateRestoreSpace,
  isSupportedBackupFileName,
  restoreSpaceNeeded,
} from '../utils/backupManifest';
import { getMealPhotoDirectory } from '../utils/mealPhotos';
import { getApplicationInfo } from '../utils/applicationInfo';
import type { OwnershipProgressListener, OwnershipResult, RestorePreview } from './dataOwnership.types';
import { waitForHealthConnectIdle } from './healthConnect';
import { readBackupCounts, validateBackupDatabase } from './backupDatabaseValidation';
import { executeRestoreTransaction } from './restoreTransaction';
import { assertBackupNotCancelled } from './backupCancellation';

function nativePath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

function fileMetadata(file: File, archivePath: string): BackupFileEntry {
  const info = file.info({ md5: true });
  if (!info.exists || info.size == null || !info.md5) throw new Error(`Could not verify ${archivePath}.`);
  return { archivePath, size: info.size, md5: info.md5 };
}

async function createBackup(
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
    assertBackupNotCancelled(signal);
    await SQLite.backupDatabaseAsync({ sourceDatabase: await getDb(), destDatabase: snapshot });

    const references = await getMealPhotoReferences();
    const photoFiles: Array<{ archivePath: string; mealId: number; originalFileName: string }> = [];
    const files: BackupFileEntry[] = [];
    for (let index = 0; index < references.length; index += 1) {
      assertBackupNotCancelled(signal);
      const reference = references[index];
      const source = new File(reference.uri);
      if (!source.exists) {
        await snapshot.runAsync('UPDATE meals SET photo_uri = NULL WHERE id = ?', [reference.mealId]);
        continue;
      }
      const originalFileName = backupFileNameFromUri(reference.uri);
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
    const counts = await readBackupCounts(snapshot);
    await snapshot.closeAsync();
    const databaseFile = new File(stage, 'database.sqlite');
    files.unshift(fileMetadata(databaseFile, 'database.sqlite'));
    const application = getApplicationInfo();
    const manifest = createBackupManifestV2({
      createdAt: new Date().toISOString(),
      appVersion: application.appVersion,
      appBuild: application.appBuild,
      databaseVersion: getDatabaseVersion(),
      databaseFile: 'database.sqlite',
      files,
      photoFiles,
      counts,
    });
    new File(stage, 'manifest.json').write(JSON.stringify(manifest, null, 2));
    assertBackupNotCancelled(signal);
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
    if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable on this device.');
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

async function validateStagedDatabase(databaseFile: File, manifest: ReturnType<typeof validateBackupManifest>): Promise<void> {
  const directory = new Directory(databaseFile.uri.slice(0, databaseFile.uri.lastIndexOf('/') + 1));
  const db = await SQLite.openDatabaseAsync(backupFileNameFromUri(databaseFile.uri), undefined, directory.uri);
  try {
    await validateBackupDatabase(db, manifest);
  } finally {
    await db.closeAsync();
  }
}

function listExtractedFiles(directory: Directory, prefix = ''): string[] {
  const paths: string[] = [];
  for (const entry of directory.list()) {
    const name = backupFileNameFromUri(entry.uri);
    const archivePath = prefix ? `${prefix}/${name}` : name;
    if (entry instanceof File) paths.push(archivePath);
    else paths.push(...listExtractedFiles(entry, archivePath));
  }
  return paths;
}

// Unmeasurable sizes skip the free-space check: failing to measure is no reason to refuse a restore.
function livePhotoBytes(): number {
  try {
    const livePhotos = new Directory(getMealPhotoDirectory());
    return livePhotos.exists ? livePhotos.size ?? 0 : 0;
  } catch {
    return 0;
  }
}

function availableDiskBytes(): number {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return Number.NaN;
  }
}

async function validateBackupFile(file: File, onProgress?: OwnershipProgressListener, originalName?: string): Promise<RestorePreview> {
  if (!isSupportedBackupFileName(originalName ?? file.uri)) {
    throw new Error('Choose an .eatlog-backup or legacy .marco-backup file.');
  }
  if (!file.exists) throw new Error("Couldn't open that backup file. Try choosing it again.");
  validateBackupArchiveSizes(file.size);
  const uncompressedSize = await getUncompressedSize(nativePath(file.uri));
  validateBackupArchiveSizes(file.size, uncompressedSize);
  validateRestoreSpace(restoreSpaceNeeded(uncompressedSize, livePhotoBytes()), availableDiskBytes());

  const stage = new Directory(Paths.cache, `eatlog-restore-stage-${Date.now()}`);
  stage.create({ intermediates: true });
  try {
    onProgress?.({ operation: 'inspect', phase: 'extract', completed: 0, total: 3, message: 'Opening backup safely', cancellable: false });
    await unzip(nativePath(file.uri), nativePath(stage.uri));
    const manifestFile = new File(stage, 'manifest.json');
    const databaseFile = new File(stage, 'database.sqlite');
    if (!manifestFile.exists || !databaseFile.exists) throw new Error('Backup is missing its manifest or database.');
    const manifest = validateBackupManifest(JSON.parse(await manifestFile.text()), getDatabaseVersion());
    validateExtractedBackupPaths(listExtractedFiles(stage), manifest);

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
  // The picker's cache copy is as large as the backup and is not needed once unpacked.
  const picked = new File(result.assets[0].uri);
  try {
    return await validateBackupFile(picked, onProgress, result.assets[0].name);
  } finally {
    try { if (picked.exists) picked.delete(); } catch { /* the cache is cleared eventually */ }
  }
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
  const stagedDirectory = new Directory(preview.stagingDirectoryUri);
  let safetyDb: SQLite.SQLiteDatabase | null = null;
  let stagedDb: SQLite.SQLiteDatabase | null = null;
  let safetyHasPhotos = false;
  try {
    safetyDb = await SQLite.openDatabaseAsync('database.sqlite', undefined, safetyDirectory.uri);
    stagedDb = await SQLite.openDatabaseAsync('database.sqlite', undefined, stagedDirectory.uri);
    const activeSafetyDb = safetyDb;
    const activeStagedDb = stagedDb;
    await waitForHealthConnectIdle();
    await executeRestoreTransaction({
      captureSafetyCopy: async () => {
        onProgress?.({ operation: 'restore', phase: 'safety', completed: 0, total: 4, message: 'Creating an internal safety copy', cancellable: false });
        await SQLite.backupDatabaseAsync({ sourceDatabase: await getDb(), destDatabase: activeSafetyDb });
        const livePhotos = new Directory(getMealPhotoDirectory());
        if (livePhotos.exists) {
          livePhotos.copy(safetyPhotos);
          safetyHasPhotos = true;
        }
      },
      replaceAndVerify: async () => {
        await copyRestoredPhotos(preview, activeStagedDb, onProgress);
        await activeStagedDb.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');

        onProgress?.({ operation: 'restore', phase: 'database', completed: 2, total: 4, message: 'Replacing local data', cancellable: false });
        await closeDatabase();
        const destination = await getDb();
        await SQLite.backupDatabaseAsync({ sourceDatabase: activeStagedDb, destDatabase: destination });
        await closeDatabase();
        resetDatabaseConnection();
        await initDatabase();
        await clearHealthConnectDeviceState();

        onProgress?.({ operation: 'restore', phase: 'verify', completed: 4, total: 4, message: 'Verifying restored data', cancellable: false });
        const live = await getDb();
        const integrity = await live.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
        if (integrity?.integrity_check !== 'ok') throw new Error('Restored database integrity check failed.');
      },
      restoreSafetyCopy: async () => {
        await closeDatabase();
        const live = await getDb();
        await SQLite.backupDatabaseAsync({ sourceDatabase: activeSafetyDb, destDatabase: live });
        await closeDatabase();
        const livePhotos = new Directory(getMealPhotoDirectory());
        if (livePhotos.exists) livePhotos.delete();
        if (safetyHasPhotos && safetyPhotos.exists) safetyPhotos.copy(livePhotos);
        resetDatabaseConnection();
        await initDatabase();
      },
    });
    return { operation: 'restore', completedAt: new Date().toISOString(), summary: 'Backup restored.' };
  } finally {
    try { await safetyDb?.closeAsync(); } catch { /* already closed */ }
    try { await stagedDb?.closeAsync(); } catch { /* already closed */ }
    if (safetyDirectory.exists) safetyDirectory.delete();
    if (stagedDirectory.exists) stagedDirectory.delete();
  }
}
