import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import {
  closeDatabase,
  DATABASE_NAME,
  initDatabase,
  LEGACY_DATABASE_NAME,
  resetDatabaseConnection,
} from '../db/database';
import { deleteAllMealPhotos } from '../utils/mealPhotos';
import type { OwnershipProgressListener, OwnershipResult } from './dataOwnership.types';
import { waitForHealthConnectIdle } from './healthConnect';

const TEMP_PREFIXES = [
  'eatlog-backup-stage-', 'eatlog-restore-stage-', 'eatlog-restore-safety-', 'eatlog-export-',
  'marco-backup-stage-', 'marco-restore-stage-', 'marco-restore-safety-', 'marco-export-',
];

export async function resetLocalData(onProgress?: OwnershipProgressListener): Promise<OwnershipResult> {
  await waitForHealthConnectIdle();
  onProgress?.({ operation: 'reset', phase: 'photos', completed: 0, total: 3, message: 'Removing meal photos', cancellable: false });
  await deleteAllMealPhotos();

  const cache = new Directory(Paths.cache);
  for (const entry of cache.list()) {
    const name = decodeURIComponent(entry.uri.split('/').filter(Boolean).pop() ?? '');
    if (TEMP_PREFIXES.some((prefix) => name.startsWith(prefix)) && entry.exists) entry.delete();
  }

  onProgress?.({ operation: 'reset', phase: 'database', completed: 1, total: 3, message: 'Erasing local database', cancellable: false });
  await closeDatabase();
  resetDatabaseConnection();
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
  const legacyDatabase = new File(SQLite.defaultDatabaseDirectory, LEGACY_DATABASE_NAME);
  if (legacyDatabase.exists) await SQLite.deleteDatabaseAsync(LEGACY_DATABASE_NAME);

  onProgress?.({ operation: 'reset', phase: 'initialize', completed: 2, total: 3, message: 'Preparing a fresh Eatlog database', cancellable: false });
  await initDatabase();
  return { operation: 'reset', completedAt: new Date().toISOString(), summary: 'All local Eatlog data was deleted.' };
}
