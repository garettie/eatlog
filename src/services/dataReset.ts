import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import {
  closeDatabase,
  DATABASE_NAME,
  initDatabase,
  LEGACY_DATABASE_NAME,
  resetDatabaseConnection,
} from '../db/database';
import { clearFoodEstimateActions } from './foodScan';
import { deleteAllMealPhotos } from '../utils/mealPhotos';
import type { OwnershipProgressListener, OwnershipResult } from './dataOwnership.types';
import { waitForHealthConnectIdle } from './healthConnect';
import { clearRemoteEstimateConsent } from './remoteEstimateConsent';
import { userApiKeyStore } from './userApiKey';

/**
 * Everything else was deleted, but the credential store refused to erase the user's Google key.
 * The key and its Manok consent stay together, so the app never holds a key without consent.
 */
export class KeyRemovalError extends Error {
  constructor() {
    super("Everything else was deleted, but Eatlog couldn't remove your Google key from this phone. It's still saved.");
    this.name = 'KeyRemovalError';
  }
}

const TEMP_PREFIXES = [
  'eatlog-backup-stage-', 'eatlog-restore-stage-', 'eatlog-restore-safety-', 'eatlog-export-',
  'marco-backup-stage-', 'marco-restore-stage-', 'marco-restore-safety-', 'marco-export-',
];

export async function resetLocalData(onProgress?: OwnershipProgressListener): Promise<OwnershipResult> {
  await waitForHealthConnectIdle();
  onProgress?.({ operation: 'reset', phase: 'photos', completed: 0, total: 3, message: 'Removing meal photos', cancellable: false });
  await deleteAllMealPhotos();
  await clearRemoteEstimateConsent();
  // Estimate identities are memory only, so nothing is stored to erase — but one left behind
  // would outlive the data it belonged to.
  clearFoodEstimateActions();

  const cache = new Directory(Paths.cache);
  for (const entry of cache.list()) {
    const name = decodeURIComponent(entry.uri.split('/').filter(Boolean).pop() ?? '');
    if (TEMP_PREFIXES.some((prefix) => name.startsWith(prefix)) && entry.exists) entry.delete();
  }

  onProgress?.({ operation: 'reset', phase: 'database', completed: 1, total: 3, message: 'Erasing local database', cancellable: false });
  await closeDatabase();
  resetDatabaseConnection();
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
  // expo-sqlite reports its directory as a plain path; the file API needs a file URI, and throws
  // on a bare path before anything after this line (the fresh database, the key) is reached.
  const legacyDatabase = new File(`file://${encodeURI(SQLite.defaultDatabaseDirectory)}`, LEGACY_DATABASE_NAME);
  if (legacyDatabase.exists) await SQLite.deleteDatabaseAsync(LEGACY_DATABASE_NAME);

  onProgress?.({ operation: 'reset', phase: 'initialize', completed: 2, total: 3, message: 'Preparing a fresh Eatlog database', cancellable: false });
  await initDatabase();

  // Last, so a refusal here never keeps the rest of the data.
  try {
    await userApiKeyStore.remove();
  } catch {
    throw new KeyRemovalError();
  }
  return { operation: 'reset', completedAt: new Date().toISOString(), summary: 'All local Eatlog data was deleted.' };
}
