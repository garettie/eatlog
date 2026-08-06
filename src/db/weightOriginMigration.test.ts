import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { WEIGHT_ORIGIN_MIGRATION_SQL } from './weightOriginMigration';

test('v8 migration preserves weights and converts Marco manual origins to Eatlog', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE weight_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date TEXT NOT NULL UNIQUE,
      scale_weight_kg REAL NOT NULL,
      trend_weight_kg REAL NOT NULL,
      origin TEXT NOT NULL DEFAULT 'marco' CHECK (origin IN ('marco', 'health_connect')),
      origin_record_id TEXT,
      origin_data_source TEXT,
      origin_last_modified_at TEXT,
      measured_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_weight_logs_date ON weight_logs(log_date);
    CREATE INDEX idx_weight_logs_origin_date ON weight_logs(origin, log_date);
    INSERT INTO weight_logs
      (id, log_date, scale_weight_kg, trend_weight_kg, origin, origin_record_id,
       origin_data_source, origin_last_modified_at, measured_at, revision, created_at)
    VALUES
      (7, '2026-08-01', 80.5, 80.2, 'marco', NULL, NULL, NULL,
       '2026-08-01T04:00:00.000Z', 3, '2026-08-01 12:00:00'),
      (8, '2026-08-02', 79.8, 80.0, 'health_connect', 'record-8', 'com.scale',
       '2026-08-02T05:00:00.000Z', '2026-08-02T04:00:00.000Z', 2, '2026-08-02 12:00:00');
    PRAGMA user_version = 7;
  `);

  db.exec(WEIGHT_ORIGIN_MIGRATION_SQL);

  assert.deepEqual(db.prepare('SELECT * FROM weight_logs ORDER BY id').all().map((row) => ({ ...row })), [
    {
      id: 7, log_date: '2026-08-01', scale_weight_kg: 80.5, trend_weight_kg: 80.2,
      origin: 'eatlog', origin_record_id: null, origin_data_source: null,
      origin_last_modified_at: null, measured_at: '2026-08-01T04:00:00.000Z',
      revision: 3, created_at: '2026-08-01 12:00:00',
    },
    {
      id: 8, log_date: '2026-08-02', scale_weight_kg: 79.8, trend_weight_kg: 80,
      origin: 'health_connect', origin_record_id: 'record-8', origin_data_source: 'com.scale',
      origin_last_modified_at: '2026-08-02T05:00:00.000Z', measured_at: '2026-08-02T04:00:00.000Z',
      revision: 2, created_at: '2026-08-02 12:00:00',
    },
  ]);
  assert.deepEqual(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_weight_logs_%' ORDER BY name").all()
      .map((row) => ({ ...row })),
    [{ name: 'idx_weight_logs_date' }, { name: 'idx_weight_logs_origin_date' }],
  );
  assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 8);
  assert.throws(() => db.prepare(
    "INSERT INTO weight_logs (log_date, scale_weight_kg, trend_weight_kg, origin) VALUES ('2026-08-03', 79, 79, 'marco')",
  ).run(), /CHECK constraint failed/);
  db.close();
});
