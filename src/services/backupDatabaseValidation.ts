import type { BackupCountsV2, BackupManifest } from '../utils/backupManifest';
import { validateBackupCounts } from '../utils/backupManifest';

export interface BackupValidationDatabase {
  getFirstAsync<T>(sql: string): Promise<T | null>;
  getAllAsync<T>(sql: string): Promise<T[]>;
}

export async function readBackupCounts(db: BackupValidationDatabase): Promise<BackupCountsV2> {
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

export async function validateBackupDatabase(
  db: BackupValidationDatabase,
  manifest: BackupManifest,
): Promise<void> {
  const integrity = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  if (integrity?.integrity_check !== 'ok') throw new Error('Backup database integrity check failed.');
  const foreignKeys = await db.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
  if (foreignKeys.length > 0) throw new Error('Backup database contains broken references.');
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((version?.user_version ?? 0) !== manifest.databaseVersion) {
    throw new Error('Backup database version does not match its manifest.');
  }

  validateBackupCounts(manifest.counts, await readBackupCounts(db));

  const databasePhotoMeals = await db.getAllAsync<{ id: number }>('SELECT id FROM meals WHERE photo_uri IS NOT NULL');
  const allMeals = new Set((await db.getAllAsync<{ id: number }>('SELECT id FROM meals')).map((meal) => meal.id));
  const manifestMealIds = new Set(manifest.photoFiles.map((photo) => photo.mealId));
  if (databasePhotoMeals.some((meal) => !manifestMealIds.has(meal.id))) {
    throw new Error('Backup photo mappings do not match its database.');
  }
  if (manifest.photoFiles.some((photo) => !allMeals.has(photo.mealId))) {
    throw new Error('Backup contains a photo for a missing meal.');
  }
}
