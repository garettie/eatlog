import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';
import { strToU8, unzipSync, zipSync } from 'fflate';

import { getDataCounts, getDatabaseVersion, getDb, getMealPhotoReferences } from '../db/database';
import { validateBackupManifest, type BackupManifest } from '../utils/backupManifest';
import type { RestorePreview } from './dataOwnership.types';

const APP_VERSION = '1.0.0';

function fileName(uri: string): string {
  const name = uri.split('/').pop();
  if (!name || name.includes('..')) throw new Error('A meal photo has an invalid filename.');
  return name;
}

export async function createBackup(): Promise<File> {
  const stamp = Date.now();
  const snapshot = await SQLite.openDatabaseAsync(`marco-backup-${stamp}.sqlite`, undefined, Paths.cache.uri);
  const snapshotFile = new File(snapshot.databasePath);
  const archive = new File(Paths.cache, `marco-${stamp}.marco-backup`);
  try {
    await SQLite.backupDatabaseAsync({ sourceDatabase: await getDb(), destDatabase: snapshot });
    const photos = await getMealPhotoReferences();
    const manifest: BackupManifest = {
      formatVersion: 1, createdAt: new Date().toISOString(), appVersion: APP_VERSION,
      databaseVersion: getDatabaseVersion(), databaseFile: 'database.sqlite',
      photoFiles: photos.map(({ mealId, uri }) => ({ archivePath: `photos/${fileName(uri)}`, mealId, originalFileName: fileName(uri) })),
      counts: await getDataCounts(),
    };
    const files: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify(manifest)), 'database.sqlite': await snapshotFile.bytes() };
    for (const [index, photo] of photos.entries()) files[manifest.photoFiles[index].archivePath] = await new File(photo.uri).bytes();
    archive.write(zipSync(files, { level: 6 }));
    return archive;
  } finally {
    await snapshot.closeAsync();
    if (snapshotFile.exists) snapshotFile.delete();
  }
}

export async function shareBackup(): Promise<void> {
  const archive = await createBackup();
  try {
    if (!await Sharing.isAvailableAsync()) throw new Error('Android sharing is unavailable.');
    await Sharing.shareAsync(archive.uri, { mimeType: 'application/zip', dialogTitle: 'Save Marco backup' });
  } finally {
    if (archive.exists) archive.delete();
  }
}

export async function validateBackupFile(file: File): Promise<RestorePreview> {
  const contents = unzipSync(await file.bytes());
  const manifestBytes = contents['manifest.json'];
  const database = contents['database.sqlite'];
  if (!manifestBytes || !database) throw new Error('Backup is missing its manifest or database.');
  const manifest = validateBackupManifest(JSON.parse(new TextDecoder().decode(manifestBytes)), getDatabaseVersion());
  const paths = new Set(Object.keys(contents));
  for (const photo of manifest.photoFiles) if (!paths.has(photo.archivePath)) throw new Error('Backup is missing a referenced photo.');
  return { manifest, valid: true };
}
