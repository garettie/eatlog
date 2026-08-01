import { Directory, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { closeDatabase, initDatabase, resetDatabaseConnection } from '../db/database';
import { deleteAllMealPhotos } from '../utils/mealPhotos';
import type { OwnershipProgressListener, OwnershipResult } from './dataOwnership.types';
import { waitForHealthConnectIdle } from './healthConnect';

const TEMP_PREFIXES = ['marco-backup-stage-', 'marco-restore-stage-', 'marco-restore-safety-', 'marco-export-'];

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
  await SQLite.deleteDatabaseAsync('marco.db');

  onProgress?.({ operation: 'reset', phase: 'initialize', completed: 2, total: 3, message: 'Preparing a fresh Marco database', cancellable: false });
  await initDatabase();
  return { operation: 'reset', completedAt: new Date().toISOString(), summary: 'All local Marco data was deleted.' };
}
