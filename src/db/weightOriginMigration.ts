export const WEIGHT_ORIGIN_MIGRATION_SQL = `
  DROP INDEX IF EXISTS idx_weight_logs_date;
  DROP INDEX IF EXISTS idx_weight_logs_origin_date;
  ALTER TABLE weight_logs RENAME TO weight_logs_v7;
  CREATE TABLE weight_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL UNIQUE,
    scale_weight_kg REAL NOT NULL,
    trend_weight_kg REAL NOT NULL,
    origin TEXT NOT NULL DEFAULT 'eatlog'
      CHECK (origin IN ('eatlog', 'health_connect')),
    origin_record_id TEXT,
    origin_data_source TEXT,
    origin_last_modified_at TEXT,
    measured_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO weight_logs
    (id, log_date, scale_weight_kg, trend_weight_kg, origin, origin_record_id,
     origin_data_source, origin_last_modified_at, measured_at, revision, created_at)
  SELECT id, log_date, scale_weight_kg, trend_weight_kg,
    CASE origin WHEN 'marco' THEN 'eatlog' ELSE origin END,
    origin_record_id, origin_data_source, origin_last_modified_at, measured_at, revision, created_at
  FROM weight_logs_v7;
  DROP TABLE weight_logs_v7;
  CREATE INDEX idx_weight_logs_date ON weight_logs(log_date);
  CREATE INDEX idx_weight_logs_origin_date ON weight_logs(origin, log_date);
  PRAGMA user_version = 8;
`;
