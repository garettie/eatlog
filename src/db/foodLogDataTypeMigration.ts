export const FOOD_LOG_DATA_TYPE_MIGRATION_SQL = `
  DROP INDEX IF EXISTS idx_food_logs_date;
  ALTER TABLE food_logs RENAME TO food_logs_v8;
  CREATE TABLE food_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    name TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('usda','off','manual','scan','describe')),
    source_food_id TEXT,
    meal TEXT NOT NULL DEFAULT 'snack' CHECK (meal IN ('breakfast','lunch','dinner','snack')),
    meal_id INTEGER REFERENCES meals(id),
    brand TEXT,
    data_type TEXT CHECK (data_type IN ('Survey (FNDDS)','Foundation','SR Legacy','Branded','off','manual','scan','describe','')),
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
  INSERT INTO food_logs
    (id, log_date, name, source, source_food_id, meal, meal_id, brand, data_type,
     preparation, grams_logged, serving_size_g, serving_label, calories_per_100g,
     protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, calories, protein_g,
     carbs_g, fat_g, logged_at)
  SELECT id, log_date, name, source, source_food_id, meal, meal_id, brand, data_type,
    preparation, grams_logged, serving_size_g, serving_label, calories_per_100g,
    protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, calories, protein_g,
    carbs_g, fat_g, logged_at
  FROM food_logs_v8;
  DROP TABLE food_logs_v8;
  CREATE INDEX idx_food_logs_date ON food_logs(log_date);
  PRAGMA user_version = 9;
`;
