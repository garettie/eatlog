import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { FOOD_LOG_DATA_TYPE_MIGRATION_SQL } from './foodLogDataTypeMigration';

const V8_SCHEMA = `
  CREATE TABLE meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );
  CREATE TABLE food_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    name TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('usda','off','manual','scan','describe')),
    source_food_id TEXT,
    meal TEXT NOT NULL DEFAULT 'snack' CHECK (meal IN ('breakfast','lunch','dinner','snack')),
    meal_id INTEGER REFERENCES meals(id),
    brand TEXT,
    data_type TEXT CHECK (data_type IN ('Foundation','SR Legacy','Branded','off','manual','scan','describe','')),
    preparation TEXT,
    grams_logged REAL,
    serving_size_g REAL,
    serving_label TEXT,
    calories_per_100g REAL,
    protein_g_per_100g REAL,
    carbs_g_per_100g REAL,
    fat_g_per_100g REAL,
    calories REAL NOT NULL,
    protein_g REAL NOT NULL,
    carbs_g REAL NOT NULL,
    fat_g REAL NOT NULL,
    logged_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_food_logs_date ON food_logs(log_date);
  PRAGMA user_version = 8;
`;

function populatedV8Database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(V8_SCHEMA);
  db.exec(`
    INSERT INTO meals (id, name) VALUES (3, 'Lunch');
    INSERT INTO food_logs
      (id, log_date, name, source, source_food_id, meal, meal_id, brand, data_type,
       preparation, grams_logged, serving_size_g, serving_label, calories_per_100g,
       protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, calories, protein_g,
       carbs_g, fat_g, logged_at)
    VALUES
      (17, '2026-08-01', 'Rice', 'usda', '123', 'lunch', 3, NULL, 'SR Legacy',
       'cooked', 150, 100, '1 cup', 130, 2.7, 28, 0.3, 195, 4.05, 42, 0.45,
       '2026-08-01 12:34:56');
  `);
  return db;
}

test('v9 migration preserves v8 food log values and accepts Survey foods', () => {
  const db = populatedV8Database();
  const before = { ...db.prepare('SELECT * FROM food_logs WHERE id = 17').get() };
  db.exec('BEGIN EXCLUSIVE');
  db.exec(FOOD_LOG_DATA_TYPE_MIGRATION_SQL);
  db.exec('COMMIT');

  assert.deepEqual({ ...db.prepare('SELECT * FROM food_logs WHERE id = 17').get() }, before);
  assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 9);
  assert.deepEqual(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_food_logs_date'").all().map((row) => ({ ...row })),
    [{ name: 'idx_food_logs_date' }],
  );
  assert.doesNotThrow(() => db.prepare(`
    INSERT INTO food_logs
      (log_date, name, source, source_food_id, data_type, calories, protein_g, carbs_g, fat_g)
    VALUES ('2026-08-02', 'Egg', 'usda', '456', 'Survey (FNDDS)', 72, 6, 0, 5)
  `).run());
  db.close();
});

test('a failed v9 migration rolls the original v8 table and version back intact', () => {
  const db = populatedV8Database();
  assert.throws(() => {
    db.exec('BEGIN EXCLUSIVE');
    try {
      db.exec(FOOD_LOG_DATA_TYPE_MIGRATION_SQL);
      db.exec('INSERT INTO table_that_does_not_exist VALUES (1)');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });

  assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 8);
  assert.equal(db.prepare('SELECT name FROM food_logs WHERE id = 17').get()?.name, 'Rice');
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'food_logs_v8'").get(), undefined);
  assert.throws(() => db.prepare(`
    INSERT INTO food_logs
      (log_date, name, source, data_type, calories, protein_g, carbs_g, fat_g)
    VALUES ('2026-08-02', 'Egg', 'usda', 'Survey (FNDDS)', 72, 6, 0, 5)
  `).run(), /CHECK constraint failed/);
  db.close();
});
