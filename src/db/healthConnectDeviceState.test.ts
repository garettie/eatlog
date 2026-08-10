import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { CLEAR_HEALTH_CONNECT_DEVICE_STATE_SQL } from './healthConnectDeviceState';

test('restore cleanup discards Android sync state while preserving weight history', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE health_connect_state (
      id INTEGER PRIMARY KEY,
      enabled INTEGER NOT NULL,
      last_sync_at TEXT
    );
    CREATE TABLE health_connect_weight_exports (
      log_date TEXT PRIMARY KEY,
      client_record_id TEXT NOT NULL
    );
    CREATE TABLE weight_logs (
      id INTEGER PRIMARY KEY,
      log_date TEXT NOT NULL,
      origin TEXT NOT NULL,
      origin_record_id TEXT
    );
    INSERT INTO health_connect_state VALUES (1, 1, '2026-08-09T12:00:00.000Z');
    INSERT INTO health_connect_weight_exports VALUES ('2026-08-09', 'eatlog-weight:2026-08-09');
    INSERT INTO weight_logs VALUES (4, '2026-08-09', 'health_connect', 'android-record-4');
  `);

  db.exec(CLEAR_HEALTH_CONNECT_DEVICE_STATE_SQL);

  assert.deepEqual({ ...db.prepare('SELECT * FROM health_connect_state').get() }, {
    id: 1,
    enabled: 0,
    last_sync_at: null,
  });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM health_connect_weight_exports').get()?.count, 0);
  assert.deepEqual({ ...db.prepare('SELECT * FROM weight_logs').get() }, {
    id: 4,
    log_date: '2026-08-09',
    origin: 'health_connect',
    origin_record_id: 'android-record-4',
  });
  db.close();
});
