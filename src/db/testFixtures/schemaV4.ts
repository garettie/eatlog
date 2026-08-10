interface FixtureDatabase {
  exec(sql: string): unknown;
}

export function createSyntheticSchemaV4Fixture(db: FixtureDatabase): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT NOT NULL,
      sex TEXT NOT NULL CHECK (sex IN ('male','female')),
      height_cm REAL NOT NULL,
      birth_date TEXT NOT NULL,
      activity_level TEXT NOT NULL CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
      goal_type TEXT NOT NULL CHECK (goal_type IN ('cut','maintain','bulk')),
      goal_rate_kg_per_week REAL NOT NULL,
      protein_preference TEXT NOT NULL CHECK (protein_preference IN ('low','moderate','high','extra_high')) DEFAULT 'moderate',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      weight_unit TEXT NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb')),
      target_weight_kg REAL,
      analytics_intro_dismissed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE weight_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date TEXT NOT NULL UNIQUE,
      scale_weight_kg REAL NOT NULL,
      trend_weight_kg REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_weight_logs_date ON weight_logs(log_date);

    CREATE TABLE meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      log_date TEXT NOT NULL,
      meal_type TEXT NOT NULL DEFAULT 'snack' CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
      photo_uri TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    CREATE TABLE food_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalizedName TEXT NOT NULL,
      brand TEXT,
      preparation TEXT,
      calories_per_100g REAL NOT NULL,
      protein_g_per_100g REAL NOT NULL,
      carbs_g_per_100g REAL NOT NULL,
      fat_g_per_100g REAL NOT NULL,
      serving_size_g REAL,
      serving_label TEXT,
      source TEXT NOT NULL CHECK (source IN ('scan','describe')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_food_cache_normalized ON food_cache(normalizedName);

    CREATE TABLE pinned_foods (
      food_key TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE daily_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      effective_date TEXT NOT NULL,
      tdee_estimate REAL NOT NULL,
      target_calories REAL NOT NULL,
      target_protein_g REAL NOT NULL,
      target_fat_g REAL NOT NULL,
      target_carbs_g REAL NOT NULL,
      calculation_method TEXT NOT NULL CHECK (calculation_method IN ('initial_estimate','adaptive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_daily_targets_effective_date ON daily_targets(effective_date);

    CREATE TABLE adaptive_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_date TEXT NOT NULL UNIQUE,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      intake_day_count INTEGER NOT NULL,
      weight_log_count INTEGER NOT NULL,
      average_intake_kcal REAL NOT NULL,
      start_trend_weight_kg REAL NOT NULL,
      end_trend_weight_kg REAL NOT NULL,
      elapsed_days INTEGER NOT NULL,
      raw_tdee REAL NOT NULL,
      previous_tdee REAL NOT NULL,
      proposed_tdee REAL NOT NULL,
      previous_target_calories REAL NOT NULL,
      previous_target_protein_g REAL NOT NULL,
      previous_target_fat_g REAL NOT NULL,
      previous_target_carbs_g REAL NOT NULL,
      proposed_target_calories REAL NOT NULL,
      proposed_target_protein_g REAL NOT NULL,
      proposed_target_fat_g REAL NOT NULL,
      proposed_target_carbs_g REAL NOT NULL,
      evidence_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'kept', 'superseded')),
      resulting_target_id INTEGER REFERENCES daily_targets(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE INDEX idx_adaptive_reviews_status_date ON adaptive_reviews(status, review_date);

    INSERT INTO profile
      (id, display_name, sex, height_cm, birth_date, activity_level, goal_type,
       goal_rate_kg_per_week, protein_preference, created_at, weight_unit,
       target_weight_kg, analytics_intro_dismissed)
    VALUES
      (1, 'Synthetic Tester', 'female', 165, '1990-02-03', 'moderate', 'maintain',
       0, 'moderate', '2026-07-01 08:00:00', 'kg', 65, 1);

    INSERT INTO daily_targets
      (id, effective_date, tdee_estimate, target_calories, target_protein_g,
       target_fat_g, target_carbs_g, calculation_method, created_at)
    VALUES
      (5, '2026-07-01', 2100, 2100, 105, 70, 262.5, 'initial_estimate', '2026-07-01 08:01:00'),
      (6, '2026-07-29', 2050, 2050, 105, 68, 254.5, 'adaptive', '2026-07-29 08:01:00');

    INSERT INTO adaptive_reviews
      (id, review_date, window_start, window_end, intake_day_count, weight_log_count,
       average_intake_kcal, start_trend_weight_kg, end_trend_weight_kg, elapsed_days,
       raw_tdee, previous_tdee, proposed_tdee, previous_target_calories,
       previous_target_protein_g, previous_target_fat_g, previous_target_carbs_g,
       proposed_target_calories, proposed_target_protein_g, proposed_target_fat_g,
       proposed_target_carbs_g, evidence_hash, status, resulting_target_id, created_at, resolved_at)
    VALUES
      (7, '2026-07-29', '2026-07-02', '2026-07-29', 24, 8, 2040,
       65.2, 65.0, 27, 2050, 2100, 2050, 2100, 105, 70, 262.5,
       2050, 105, 68, 254.5, 'synthetic-evidence-v4', 'accepted', 6,
       '2026-07-29 08:00:00', '2026-07-29 08:02:00');

    INSERT INTO meals (id, name, log_date, meal_type, photo_uri, created_at)
    VALUES (11, 'Synthetic Café bowl', '2026-07-30', 'lunch', 'file:///synthetic/meal-11.jpg', '2026-07-30 12:00:00');

    INSERT INTO food_logs
      (id, log_date, name, source, source_food_id, meal, meal_id, brand, data_type,
       preparation, grams_logged, serving_size_g, serving_label, calories_per_100g,
       protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, calories, protein_g,
       carbs_g, fat_g, logged_at)
    VALUES
      (21, '2026-07-30', 'Synthetic arroz café', 'manual', NULL, 'lunch', 11,
       NULL, 'manual', 'cooked', 180, 180, '1 synthetic bowl', 130, 2.7, 28, 0.3,
       234, 4.86, 50.4, 0.54, '2026-07-30 12:01:00'),
      (22, '2026-07-31', 'Synthetic toast', 'usda', '100', 'breakfast', NULL,
       'Fixture Foods', 'Foundation', 'toasted', 30, 30, '1 slice', 250, 8, 45, 4,
       75, 2.4, 13.5, 1.2, '2026-07-31 07:00:00');

    INSERT INTO weight_logs (id, log_date, scale_weight_kg, trend_weight_kg, created_at)
    VALUES
      (31, '2026-07-01', 65.2, 65.2, '2026-07-01 07:00:00'),
      (32, '2026-07-29', 65.0, 65.05, '2026-07-29 07:00:00');

    INSERT INTO food_cache
      (id, name, normalizedName, brand, preparation, calories_per_100g,
       protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, serving_size_g,
       serving_label, source, created_at)
    VALUES
      (41, 'Synthetic soup', 'synthetic soup', NULL, 'simmered', 80, 4, 10, 3,
       250, '1 synthetic bowl', 'describe', '2026-07-30 18:00:00');

    INSERT INTO pinned_foods (food_key, created_at)
    VALUES ('usda:synthetic-100', '2026-07-31 07:01:00');

    PRAGMA user_version = 4;
  `);
}
