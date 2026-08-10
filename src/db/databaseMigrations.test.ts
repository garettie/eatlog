import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  CURRENT_DATABASE_VERSION,
  migrateDatabase,
  type MigrationDatabase,
} from './databaseMigrations';
import { createSyntheticSchemaV4Fixture } from './testFixtures/schemaV4';

class NodeMigrationDatabase implements MigrationDatabase {
  constructor(readonly db: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async getFirstAsync<T>(sql: string): Promise<T | null> {
    return (this.db.prepare(sql).get() as T | undefined) ?? null;
  }

  async getAllAsync<T>(sql: string): Promise<T[]> {
    return this.db.prepare(sql).all() as T[];
  }

  async withExclusiveTransactionAsync(task: (transaction: NodeMigrationDatabase) => Promise<void>): Promise<void> {
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

function rows(db: DatabaseSync, sql: string): Array<Record<string, unknown>> {
  return db.prepare(sql).all().map((row) => ({ ...row }));
}

test('real sequential v4-to-current migration preserves every supported fixture relationship', async () => {
  const db = new DatabaseSync(':memory:');
  createSyntheticSchemaV4Fixture(db);

  await migrateDatabase(new NodeMigrationDatabase(db));

  assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, CURRENT_DATABASE_VERSION);
  assert.deepEqual(rows(db, 'SELECT id, display_name, birth_date, target_weight_kg, analytics_intro_dismissed FROM profile'), [{
    id: 1,
    display_name: 'Synthetic Tester',
    birth_date: '1990-02-03',
    target_weight_kg: 65,
    analytics_intro_dismissed: 1,
  }]);
  assert.deepEqual(rows(db, 'SELECT id, effective_date, calculation_method FROM daily_targets ORDER BY id'), [
    { id: 5, effective_date: '2026-07-01', calculation_method: 'initial_estimate' },
    { id: 6, effective_date: '2026-07-29', calculation_method: 'adaptive' },
  ]);
  assert.deepEqual(rows(db, 'SELECT id, review_date, resulting_target_id, status FROM adaptive_reviews'), [{
    id: 7,
    review_date: '2026-07-29',
    resulting_target_id: 6,
    status: 'accepted',
  }]);
  assert.deepEqual(rows(db, 'SELECT id, name, log_date, photo_uri FROM meals'), [{
    id: 11,
    name: 'Synthetic Café bowl',
    log_date: '2026-07-30',
    photo_uri: 'file:///synthetic/meal-11.jpg',
  }]);
  assert.deepEqual(rows(db, 'SELECT id, name, meal_id, source, data_type FROM food_logs ORDER BY id'), [
    { id: 21, name: 'Synthetic arroz café', meal_id: 11, source: 'manual', data_type: 'manual' },
    { id: 22, name: 'Synthetic toast', meal_id: null, source: 'usda', data_type: 'Foundation' },
  ]);
  assert.deepEqual(rows(db, 'SELECT id, log_date, origin, revision FROM weight_logs ORDER BY id'), [
    { id: 31, log_date: '2026-07-01', origin: 'eatlog', revision: 1 },
    { id: 32, log_date: '2026-07-29', origin: 'eatlog', revision: 1 },
  ]);
  assert.deepEqual(rows(db, 'SELECT id, name, normalizedName, source FROM food_cache'), [{
    id: 41,
    name: 'Synthetic soup',
    normalizedName: 'synthetic soup',
    source: 'describe',
  }]);
  assert.deepEqual(rows(db, 'SELECT food_key FROM pinned_foods'), [{ food_key: 'usda:synthetic-100' }]);
  assert.deepEqual(rows(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name"), [
    { name: 'idx_adaptive_intake_confirmations_status_date' },
    { name: 'idx_adaptive_reviews_status_date' },
    { name: 'idx_daily_targets_effective_date' },
    { name: 'idx_food_cache_normalized' },
    { name: 'idx_food_logs_date' },
    { name: 'idx_weight_logs_date' },
    { name: 'idx_weight_logs_origin_date' },
  ]);
  assert.deepEqual(rows(db, 'PRAGMA foreign_key_check'), []);
  assert.doesNotThrow(() => db.prepare(`
    INSERT INTO food_logs
      (log_date, name, source, data_type, calories, protein_g, carbs_g, fat_g)
    VALUES ('2026-08-01', 'Synthetic survey food', 'usda', 'Survey (FNDDS)', 10, 1, 1, 0)
  `).run());
  assert.doesNotThrow(() => db.prepare(`
    INSERT INTO daily_targets
      (effective_date, tdee_estimate, target_calories, target_protein_g, target_fat_g, target_carbs_g, calculation_method)
    VALUES ('2026-08-01', 2050, 2050, 105, 68, 254.5, 'manual')
  `).run());
  db.close();
});

test('real fresh-database path reaches the complete current empty schema', async () => {
  const db = new DatabaseSync(':memory:');
  await migrateDatabase(new NodeMigrationDatabase(db));

  assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, CURRENT_DATABASE_VERSION);
  assert.deepEqual(rows(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"), [
    { name: 'adaptive_intake_day_confirmations' },
    { name: 'adaptive_reviews' },
    { name: 'daily_targets' },
    { name: 'food_cache' },
    { name: 'food_logs' },
    { name: 'health_connect_state' },
    { name: 'health_connect_weight_exports' },
    { name: 'meals' },
    { name: 'pinned_foods' },
    { name: 'profile' },
    { name: 'weight_logs' },
  ]);
  assert.deepEqual(rows(db, 'SELECT enabled, last_sync_at FROM health_connect_state'), [{ enabled: 0, last_sync_at: null }]);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM profile').get()?.count, 0);
  assert.deepEqual(rows(db, 'PRAGMA foreign_key_check'), []);
  db.close();
});

test('future schema is rejected before any statement mutates it', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE future_sentinel (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO future_sentinel VALUES (1, 'unchanged');
    PRAGMA user_version = ${CURRENT_DATABASE_VERSION + 1};
  `);
  const schemaBefore = rows(db, "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");
  const dataBefore = rows(db, 'SELECT * FROM future_sentinel');

  await assert.rejects(
    migrateDatabase(new NodeMigrationDatabase(db)),
    /newer than supported/,
  );

  assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, CURRENT_DATABASE_VERSION + 1);
  assert.deepEqual(rows(db, "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"), schemaBefore);
  assert.deepEqual(rows(db, 'SELECT * FROM future_sentinel'), dataBefore);
  db.close();
});
