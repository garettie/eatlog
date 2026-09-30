export const CSV_RECORD_MIGRATION_SQL = `
  ALTER TABLE food_logs ADD COLUMN portion_quantity REAL
    CHECK (portion_quantity IS NULL OR portion_quantity > 0);
  ALTER TABLE food_logs ADD COLUMN portion_unit TEXT;
  CREATE TABLE csv_record_links (
    record_type TEXT NOT NULL CHECK (record_type IN ('meal', 'weight')),
    source_id TEXT NOT NULL,
    meal_id INTEGER UNIQUE REFERENCES meals(id) ON DELETE CASCADE,
    food_log_id INTEGER UNIQUE REFERENCES food_logs(id) ON DELETE CASCADE,
    weight_log_id INTEGER UNIQUE REFERENCES weight_logs(id) ON DELETE CASCADE,
    original_row_json TEXT,
    native_fingerprint TEXT,
    PRIMARY KEY (record_type, source_id),
    CHECK (
      (record_type = 'meal' AND weight_log_id IS NULL AND
        ((meal_id IS NOT NULL AND food_log_id IS NULL) OR (meal_id IS NULL AND food_log_id IS NOT NULL)))
      OR (record_type = 'weight' AND weight_log_id IS NOT NULL AND meal_id IS NULL AND food_log_id IS NULL)
    )
  );
  CREATE TRIGGER csv_meal_deleted AFTER DELETE ON meals BEGIN
    DELETE FROM csv_record_links WHERE meal_id = OLD.id;
  END;
  CREATE TRIGGER csv_food_deleted AFTER DELETE ON food_logs BEGIN
    DELETE FROM csv_record_links WHERE food_log_id = OLD.id;
  END;
  CREATE TRIGGER csv_weight_deleted AFTER DELETE ON weight_logs BEGIN
    DELETE FROM csv_record_links WHERE weight_log_id = OLD.id;
  END;
  PRAGMA user_version = 11;
`;
