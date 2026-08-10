import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { CURRENT_DATABASE_VERSION, migrateDatabase, type MigrationDatabase } from '../db/databaseMigrations';
import { createSyntheticSchemaV4Fixture } from '../db/testFixtures/schemaV4';
import { createBackupManifestV2, validateExtractedBackupPaths, type BackupManifest } from '../utils/backupManifest';
import {
  readBackupCounts,
  validateBackupDatabase,
  type BackupValidationDatabase,
} from './backupDatabaseValidation';

class NodeDatabase implements BackupValidationDatabase, MigrationDatabase {
  constructor(readonly db: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> { this.db.exec(sql); }

  async getFirstAsync<T>(sql: string): Promise<T | null> {
    return (this.db.prepare(sql).get() as T | undefined) ?? null;
  }

  async getAllAsync<T>(sql: string): Promise<T[]> {
    return this.db.prepare(sql).all() as T[];
  }

  async withExclusiveTransactionAsync(task: (transaction: NodeDatabase) => Promise<void>): Promise<void> {
    this.db.exec('BEGIN EXCLUSIVE');
    try {
      await task(this);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

async function manifestFor(db: NodeDatabase, databaseVersion: number, photoFiles: BackupManifest['photoFiles']) {
  return createBackupManifestV2({
    createdAt: '2026-08-10T00:00:00.000Z',
    appVersion: '1.1.0',
    appBuild: '1',
    databaseVersion,
    databaseFile: 'database.sqlite',
    files: [
      { archivePath: 'database.sqlite', size: 4096, md5: 'a'.repeat(32) },
      ...photoFiles.map((photo, index) => ({
        archivePath: photo.archivePath,
        size: 128 + index,
        md5: String(index + 1).repeat(32),
      })),
    ],
    photoFiles,
    counts: await readBackupCounts(db),
  });
}

test('validates a current database with Unicode and multiple photo relationships', async () => {
  const db = new DatabaseSync(':memory:');
  const adapter = new NodeDatabase(db);
  await migrateDatabase(adapter);
  db.exec(`
    INSERT INTO profile
      (id, display_name, sex, height_cm, birth_date, activity_level, goal_type,
       goal_rate_kg_per_week, protein_preference, weight_unit, target_weight_kg)
    VALUES (1, 'Synthetic Zoë 食事', 'female', 165, '1990-02-03', 'moderate', 'maintain', 0, 'moderate', 'kg', 65);
    INSERT INTO daily_targets
      (id, effective_date, tdee_estimate, target_calories, target_protein_g, target_fat_g, target_carbs_g, calculation_method)
    VALUES (5, '2026-08-01', 2050, 2050, 105, 68, 254.5, 'manual');
    INSERT INTO meals (id, name, log_date, meal_type, photo_uri) VALUES
      (11, 'Café bowl', '2026-08-01', 'lunch', 'file:///device/café.jpg'),
      (12, '食事 bowl', '2026-08-02', 'dinner', 'file:///device/食事.jpg');
  `);
  const photos = [
    { archivePath: 'photos/11-café.jpg', mealId: 11, originalFileName: 'café.jpg' },
    { archivePath: 'photos/12-食事.jpg', mealId: 12, originalFileName: '食事.jpg' },
  ];
  await assert.doesNotReject(validateBackupDatabase(
    adapter,
    await manifestFor(adapter, CURRENT_DATABASE_VERSION, photos),
  ));
  db.close();
});

test('archive format and database validation are platform-neutral in all source/destination pairs', async () => {
  const db = new DatabaseSync(':memory:');
  const adapter = new NodeDatabase(db);
  await migrateDatabase(adapter);
  const manifest = await manifestFor(adapter, CURRENT_DATABASE_VERSION, []);
  const pairs = [
    ['android', 'android'],
    ['android', 'ios'],
    ['ios', 'ios'],
    ['ios', 'android'],
  ] as const;
  for (const [source, destination] of pairs) {
    assert.doesNotThrow(
      () => validateExtractedBackupPaths(['manifest.json', 'database.sqlite'], manifest),
      `${source} to ${destination} format`,
    );
    await assert.doesNotReject(
      validateBackupDatabase(adapter, manifest),
      `${source} to ${destination} database`,
    );
  }
  db.close();
});

test('validates a schema-v4 backup before running the real restore migration path', async () => {
  const db = new DatabaseSync(':memory:');
  createSyntheticSchemaV4Fixture(db);
  const adapter = new NodeDatabase(db);
  const photos = [{ archivePath: 'photos/11-meal-11.jpg', mealId: 11, originalFileName: 'meal-11.jpg' }];
  const counts = await readBackupCounts(adapter);
  const legacyMarco: BackupManifest = {
    formatVersion: 1,
    createdAt: '2026-07-30T00:00:00.000Z',
    appVersion: '1.0.0',
    databaseVersion: 4,
    databaseFile: 'database.sqlite',
    photoFiles: photos,
    counts: {
      foodLogs: counts.foodLogs,
      meals: counts.meals,
      weightLogs: counts.weightLogs,
      dailyTargets: counts.dailyTargets,
      photos: counts.photos,
    },
  };
  await assert.doesNotReject(validateBackupDatabase(adapter, legacyMarco));

  await migrateDatabase(adapter);
  assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, CURRENT_DATABASE_VERSION);
  assert.equal(db.prepare('SELECT name FROM meals WHERE id = 11').get()?.name, 'Synthetic Café bowl');
  db.close();
});

test('rejects integrity, foreign-key, version, count, and photo mapping failures', async () => {
  const valid: BackupManifest = {
    formatVersion: 1,
    createdAt: '2026-08-10T00:00:00.000Z',
    appVersion: '1.0.0',
    databaseVersion: 4,
    databaseFile: 'database.sqlite',
    photoFiles: [{ archivePath: 'photos/1.jpg', mealId: 1, originalFileName: '1.jpg' }],
    counts: { foodLogs: 0, meals: 1, weightLogs: 0, dailyTargets: 0, photos: 1 },
  };
  const responses = new Map<string, unknown>([
    ['PRAGMA integrity_check', { integrity_check: 'ok' }],
    ['PRAGMA user_version', { user_version: 4 }],
    ['SELECT COUNT(*) AS count FROM profile', { count: 1 }],
    ['SELECT COUNT(*) AS count FROM food_logs', { count: 0 }],
    ['SELECT COUNT(*) AS count FROM meals', { count: 1 }],
    ['SELECT COUNT(*) AS count FROM weight_logs', { count: 0 }],
    ['SELECT COUNT(*) AS count FROM daily_targets', { count: 0 }],
    ['SELECT COUNT(*) AS count FROM adaptive_reviews', { count: 0 }],
    ['SELECT COUNT(*) AS count FROM meals WHERE photo_uri IS NOT NULL', { count: 1 }],
  ]);
  const arrays = new Map<string, unknown[]>([
    ['PRAGMA foreign_key_check', []],
    ['SELECT id FROM meals WHERE photo_uri IS NOT NULL', [{ id: 1 }]],
    ['SELECT id FROM meals', [{ id: 1 }]],
  ]);
  const fake: BackupValidationDatabase = {
    getFirstAsync: async <T>(sql: string) => responses.get(sql) as T ?? null,
    getAllAsync: async <T>(sql: string) => arrays.get(sql) as T[] ?? [],
  };

  responses.set('PRAGMA integrity_check', { integrity_check: 'damaged' });
  await assert.rejects(validateBackupDatabase(fake, valid), /integrity/);
  responses.set('PRAGMA integrity_check', { integrity_check: 'ok' });
  arrays.set('PRAGMA foreign_key_check', [{ table: 'food_logs' }]);
  await assert.rejects(validateBackupDatabase(fake, valid), /broken references/);
  arrays.set('PRAGMA foreign_key_check', []);
  responses.set('PRAGMA user_version', { user_version: 5 });
  await assert.rejects(validateBackupDatabase(fake, valid), /version does not match/);
  responses.set('PRAGMA user_version', { user_version: 4 });
  responses.set('SELECT COUNT(*) AS count FROM meals', { count: 2 });
  await assert.rejects(validateBackupDatabase(fake, valid), /row counts/);
  responses.set('SELECT COUNT(*) AS count FROM meals', { count: 1 });
  arrays.set('SELECT id FROM meals WHERE photo_uri IS NOT NULL', [{ id: 2 }]);
  await assert.rejects(validateBackupDatabase(fake, valid), /photo mappings/);
  arrays.set('SELECT id FROM meals WHERE photo_uri IS NOT NULL', [{ id: 1 }]);
  arrays.set('SELECT id FROM meals', []);
  await assert.rejects(validateBackupDatabase(fake, valid), /missing meal/);
});
