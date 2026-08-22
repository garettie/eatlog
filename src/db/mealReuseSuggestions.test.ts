import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { CURRENT_DATABASE_VERSION, migrateDatabase, type MigrationDatabase } from './databaseMigrations';
import {
  HAS_REUSABLE_MEALS_SQL,
  buildMealReuseSuggestionQuery,
} from './mealReuseSuggestions';

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

async function createDatabase(): Promise<DatabaseSync> {
  const db = new DatabaseSync(':memory:');
  await migrateDatabase(new NodeMigrationDatabase(db));
  assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, CURRENT_DATABASE_VERSION);
  return db;
}

function insertMeal(
  db: DatabaseSync,
  id: number,
  name: string,
  logDate: string,
  calories: number,
  loggedAt = `${logDate} 12:00:00`,
): void {
  db.prepare('INSERT INTO meals (id, name, log_date, meal_type) VALUES (?, ?, ?, ?)')
    .run(id, name, logDate, 'lunch');
  db.prepare(`INSERT INTO food_logs
    (log_date, name, source, meal, meal_id, calories, protein_g, carbs_g, fat_g, logged_at)
    VALUES (?, ?, 'manual', 'lunch', ?, ?, 10, 20, 5, ?)`)
    .run(logDate, `${name} component`, id, calories, loggedAt);
}

function suggestions(db: DatabaseSync, query: string, limit = 3): Array<Record<string, unknown>> {
  const built = buildMealReuseSuggestionQuery(query, limit);
  return db.prepare(built.sql).all(...built.params).map((row) => ({ ...row }));
}

test('blank suggestions rank pinned meals first, deduplicate titles, and stay bounded', async () => {
  const db = await createDatabase();
  insertMeal(db, 1, 'Chicken Bowl', '2026-08-01', 500);
  insertMeal(db, 2, 'chicken bowl', '2026-08-20', 620);
  insertMeal(db, 3, 'Recent Curry', '2026-08-21', 450);
  insertMeal(db, 4, 'Pinned Toast', '2026-07-01', 300);
  insertMeal(db, 5, 'Older Soup', '2026-06-01', 250);
  db.prepare('INSERT INTO pinned_foods (food_key) VALUES (?)').run('meal:pinned toast');

  const rows = suggestions(db, '', 99);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.meal_name), ['Pinned Toast', 'Recent Curry', 'chicken bowl']);
  assert.equal(rows.find((row) => row.meal_name === 'chicken bowl')?.meal_id, 2);
  assert.equal(rows.find((row) => row.meal_name === 'chicken bowl')?.log_date, '2026-08-20');
  db.close();
});

test('text suggestions rank exact, prefix, and substring matches before pin and recency ties', async () => {
  const db = await createDatabase();
  insertMeal(db, 1, 'Rice Bowl', '2026-08-22', 500);
  insertMeal(db, 2, 'Bowl Special', '2026-08-10', 450);
  insertMeal(db, 3, 'Bowl', '2026-07-01', 300);
  db.prepare('INSERT INTO pinned_foods (food_key) VALUES (?)').run('meal:rice bowl');

  assert.deepEqual(
    suggestions(db, 'BoWl').map((row) => row.meal_name),
    ['Bowl', 'Bowl Special', 'Rice Bowl'],
  );
  db.close();
});

test('percent and underscore searches are literal and empty history stays empty', async () => {
  const emptyDb = await createDatabase();
  assert.deepEqual(suggestions(emptyDb, ''), []);
  assert.equal(
    emptyDb.prepare(HAS_REUSABLE_MEALS_SQL).get()?.has_reusable_meals,
    0,
  );
  emptyDb.close();

  const db = await createDatabase();
  insertMeal(db, 1, '100% Beef', '2026-08-20', 500);
  insertMeal(db, 2, 'A_B Bowl', '2026-08-21', 450);
  insertMeal(db, 3, 'Plain Rice', '2026-08-22', 300);

  assert.deepEqual(suggestions(db, '%').map((row) => row.meal_name), ['100% Beef']);
  assert.deepEqual(suggestions(db, '_').map((row) => row.meal_name), ['A_B Bowl']);
  assert.equal(db.prepare(HAS_REUSABLE_MEALS_SQL).get()?.has_reusable_meals, 1);
  db.close();
});
