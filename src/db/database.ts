import * as SQLite from 'expo-sqlite';

import { parseLocalISO } from '../utils/calendar';
import { computeWeightTrend } from '../utils/weightTrend';

export type Sex = 'male' | 'female';
export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';
export type GoalType = 'cut' | 'maintain' | 'bulk';
export type CalculationMethod = 'initial_estimate' | 'adaptive';
export type ProteinPreference = 'low' | 'moderate' | 'high' | 'extra_high';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type WeightUnit = 'kg' | 'lb';
export type AdaptiveReviewStatus = 'pending' | 'accepted' | 'kept' | 'superseded';

export interface Profile {
  id: number;
  display_name: string;
  sex: Sex;
  height_cm: number;
  birth_date: string;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  goal_rate_kg_per_week: number;
  protein_preference: ProteinPreference;
  weight_unit: WeightUnit;
  target_weight_kg: number | null;
  analytics_intro_dismissed: number;
  created_at: string;
}

export interface WeightLog {
  id: number;
  log_date: string;
  scale_weight_kg: number;
  trend_weight_kg: number;
  created_at: string;
}

export interface DailyTarget {
  id: number;
  effective_date: string;
  tdee_estimate: number;
  target_calories: number;
  target_protein_g: number;
  target_fat_g: number;
  target_carbs_g: number;
  calculation_method: CalculationMethod;
  created_at: string;
}

export interface AdaptiveReview {
  id: number;
  review_date: string;
  window_start: string;
  window_end: string;
  intake_day_count: number;
  weight_log_count: number;
  average_intake_kcal: number;
  start_trend_weight_kg: number;
  end_trend_weight_kg: number;
  elapsed_days: number;
  raw_tdee: number;
  previous_tdee: number;
  proposed_tdee: number;
  previous_target_calories: number;
  previous_target_protein_g: number;
  previous_target_fat_g: number;
  previous_target_carbs_g: number;
  proposed_target_calories: number;
  proposed_target_protein_g: number;
  proposed_target_fat_g: number;
  proposed_target_carbs_g: number;
  evidence_hash: string;
  status: AdaptiveReviewStatus;
  resulting_target_id: number | null;
  created_at: string;
  resolved_at: string | null;
}

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
const DATABASE_VERSION = 4;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (!_dbPromise) {
    _dbPromise = SQLite.openDatabaseAsync('marco.db');
  }
  _db = await _dbPromise;
  return _db;
}

export async function initDatabase(): Promise<void> {
  const db = await getDb();
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  let currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion > DATABASE_VERSION) {
    throw new Error(
      `Database version ${currentVersion} is newer than supported version ${DATABASE_VERSION}.`
    );
  }
  if (currentVersion === 0) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT NOT NULL,
      sex TEXT NOT NULL CHECK (sex IN ('male','female')),
      height_cm REAL NOT NULL,
      birth_date TEXT NOT NULL,
      activity_level TEXT NOT NULL CHECK (activity_level IN
        ('sedentary','light','moderate','active','very_active')),
      goal_type TEXT NOT NULL CHECK (goal_type IN ('cut','maintain','bulk')),
      goal_rate_kg_per_week REAL NOT NULL,
      protein_preference TEXT NOT NULL CHECK (protein_preference IN
        ('low','moderate','high','extra_high')) DEFAULT 'moderate',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS weight_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date TEXT NOT NULL UNIQUE,
      scale_weight_kg REAL NOT NULL,
      trend_weight_kg REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      log_date TEXT NOT NULL,
      meal_type TEXT NOT NULL DEFAULT 'snack' CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
      photo_uri TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS food_logs (
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

    CREATE TABLE IF NOT EXISTS food_cache (
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
    CREATE INDEX IF NOT EXISTS idx_food_cache_normalized ON food_cache(normalizedName);

    CREATE TABLE IF NOT EXISTS pinned_foods (
      food_key TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      effective_date TEXT NOT NULL,
      tdee_estimate REAL NOT NULL,
      target_calories REAL NOT NULL,
      target_protein_g REAL NOT NULL,
      target_fat_g REAL NOT NULL,
      target_carbs_g REAL NOT NULL,
      calculation_method TEXT NOT NULL CHECK (calculation_method IN
        ('initial_estimate','adaptive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
      `);
      await txn.execAsync('PRAGMA user_version = 1');
    });
    currentVersion = 1;
  }

  if (currentVersion === 1) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        ALTER TABLE profile ADD COLUMN weight_unit TEXT NOT NULL DEFAULT 'kg'
          CHECK (weight_unit IN ('kg', 'lb'));
        ALTER TABLE profile ADD COLUMN target_weight_kg REAL;
        CREATE TABLE IF NOT EXISTS pinned_foods (
          food_key TEXT PRIMARY KEY,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        PRAGMA user_version = 2;
      `);
    });
    currentVersion = 2;
  }

  if (currentVersion === 2) {
    const profileColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(profile)');
    await db.withExclusiveTransactionAsync(async (txn) => {
      // Development builds briefly used schema version 2 for pinned foods.
      if (!profileColumns.some((column) => column.name === 'weight_unit')) {
        await txn.execAsync(`ALTER TABLE profile ADD COLUMN weight_unit TEXT NOT NULL DEFAULT 'kg'
          CHECK (weight_unit IN ('kg', 'lb'));`);
      }
      if (!profileColumns.some((column) => column.name === 'target_weight_kg')) {
        await txn.execAsync('ALTER TABLE profile ADD COLUMN target_weight_kg REAL;');
      }
      await txn.execAsync(`
        CREATE TABLE IF NOT EXISTS pinned_foods (
          food_key TEXT PRIMARY KEY,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
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
        CREATE INDEX idx_weight_logs_date ON weight_logs(log_date);
        CREATE INDEX idx_food_logs_date ON food_logs(log_date);
        CREATE INDEX idx_daily_targets_effective_date ON daily_targets(effective_date);
        CREATE INDEX idx_adaptive_reviews_status_date ON adaptive_reviews(status, review_date);
        PRAGMA user_version = 3;
      `);
    });
    currentVersion = 3;
  }

  if (currentVersion === 3) {
    const profileColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(profile)');
    if (!profileColumns.some((column) => column.name === 'target_weight_kg')) {
      await db.withExclusiveTransactionAsync((txn) => txn.execAsync('ALTER TABLE profile ADD COLUMN target_weight_kg REAL;'));
    }
  }

  if (currentVersion === 3) {
    const profileColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(profile)');
    await db.withExclusiveTransactionAsync(async (txn) => {
      if (!profileColumns.some((column) => column.name === 'analytics_intro_dismissed')) {
        await txn.execAsync('ALTER TABLE profile ADD COLUMN analytics_intro_dismissed INTEGER NOT NULL DEFAULT 0;');
      }
      await txn.execAsync('PRAGMA user_version = 4');
    });
    currentVersion = 4;
  }
}

export async function getProfile(): Promise<Profile | null> {
  const db = await getDb();
  return db.getFirstAsync<Profile>('SELECT * FROM profile WHERE id = 1');
}

export async function insertProfile(params: {
  display_name: string;
  sex: Sex;
  height_cm: number;
  birth_date: string;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  goal_rate_kg_per_week: number;
  protein_preference: ProteinPreference;
  weight_unit: WeightUnit;
  target_weight_kg?: number | null;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO profile
      (id, display_name, sex, height_cm, birth_date, activity_level, goal_type, goal_rate_kg_per_week, protein_preference, weight_unit, target_weight_kg)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.display_name,
      params.sex,
      params.height_cm,
      params.birth_date,
      params.activity_level,
      params.goal_type,
      params.goal_rate_kg_per_week,
      params.protein_preference,
      params.weight_unit,
      params.target_weight_kg ?? null,
    ]
  );
}

export async function setAnalyticsIntroDismissed(): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE profile SET analytics_intro_dismissed = 1 WHERE id = 1');
}

export async function updateProfileWeightUnit(unit: WeightUnit): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE profile SET weight_unit = ? WHERE id = 1', [unit]);
}

export interface SaveWeightResult {
  log: WeightLog;
  wasUpdate: boolean;
  previousScaleWeightKg: number | null;
}

export async function saveWeightLog(params: {
  logDate: string;
  scaleWeightKg: number;
  weightUnit?: WeightUnit;
}): Promise<SaveWeightResult> {
  parseLocalISO(params.logDate);
  if (!Number.isFinite(params.scaleWeightKg) || params.scaleWeightKg < 20 || params.scaleWeightKg > 500) {
    throw new RangeError('Weight must be between 20 and 500 kilograms');
  }
  const roundedWeight = Math.round(params.scaleWeightKg * 1000) / 1000;
  const db = await getDb();
  let result: SaveWeightResult | null = null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<WeightLog>(
      'SELECT * FROM weight_logs WHERE log_date = ?',
      [params.logDate],
    );
    await txn.runAsync(
      `INSERT INTO weight_logs (log_date, scale_weight_kg, trend_weight_kg)
       VALUES (?, ?, ?)
       ON CONFLICT(log_date) DO UPDATE SET scale_weight_kg = excluded.scale_weight_kg`,
      [params.logDate, roundedWeight, roundedWeight],
    );
    const rows = await txn.getAllAsync<WeightLog>('SELECT * FROM weight_logs ORDER BY log_date ASC');
    const trend = computeWeightTrend(rows.map((row) => ({
      logDate: row.log_date,
      scaleWeightKg: row.scale_weight_kg,
    })));
    for (const reading of trend) {
      if (reading.logDate >= params.logDate) {
        await txn.runAsync(
          'UPDATE weight_logs SET trend_weight_kg = ? WHERE log_date = ?',
          [reading.trendWeightKg, reading.logDate],
        );
      }
    }
    const saved = await txn.getFirstAsync<WeightLog>(
      'SELECT * FROM weight_logs WHERE log_date = ?',
      [params.logDate],
    );
    if (!saved) throw new Error('Saved weight row missing');
    if (params.weightUnit) {
      await txn.runAsync('UPDATE profile SET weight_unit = ? WHERE id = 1', [params.weightUnit]);
    }
    result = {
      log: saved,
      wasUpdate: existing != null,
      previousScaleWeightKg: existing?.scale_weight_kg ?? null,
    };
  });

  if (!result) throw new Error('Weight save transaction failed');
  return result;
}

export async function deleteWeightLog(id: number): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<WeightLog>(
      'SELECT * FROM weight_logs WHERE id = ?',
      [id],
    );
    if (!existing) return;
    await txn.runAsync('DELETE FROM weight_logs WHERE id = ?', [id]);
    const rows = await txn.getAllAsync<WeightLog>('SELECT * FROM weight_logs ORDER BY log_date ASC');
    const trend = computeWeightTrend(rows.map((row) => ({
      logDate: row.log_date,
      scaleWeightKg: row.scale_weight_kg,
    })));
    for (const reading of trend) {
      if (reading.logDate >= existing.log_date) {
        await txn.runAsync(
          'UPDATE weight_logs SET trend_weight_kg = ? WHERE log_date = ?',
          [reading.trendWeightKg, reading.logDate],
        );
      }
    }
  });
}

export async function insertDailyTarget(params: {
  effective_date: string;
  tdee_estimate: number;
  target_calories: number;
  target_protein_g: number;
  target_fat_g: number;
  target_carbs_g: number;
  calculation_method: CalculationMethod;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO daily_targets
      (effective_date, tdee_estimate, target_calories, target_protein_g, target_fat_g, target_carbs_g, calculation_method)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.effective_date,
      params.tdee_estimate,
      params.target_calories,
      params.target_protein_g,
      params.target_fat_g,
      params.target_carbs_g,
      params.calculation_method,
    ]
  );
}

export interface FoodLog {
  id: number;
  log_date: string;
  name: string;
  source: string;
  source_food_id: string | null;
  meal: MealType;
  meal_id: number | null;
  brand: string | null;
  data_type: string | null;
  preparation: string | null;
  grams_logged: number | null;
  serving_size_g: number | null;
  serving_label: string | null;
  calories_per_100g: number | null;
  protein_g_per_100g: number | null;
  carbs_g_per_100g: number | null;
  fat_g_per_100g: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  logged_at: string;
}

export async function getLatestDailyTarget(): Promise<DailyTarget | null> {
  const db = await getDb();
  return db.getFirstAsync<DailyTarget>(
    'SELECT * FROM daily_targets ORDER BY id DESC LIMIT 1'
  );
}

export async function getMostRecentFoodLog(): Promise<FoodLog | null> {
  const db = await getDb();
  return db.getFirstAsync<FoodLog>(
    'SELECT * FROM food_logs ORDER BY id DESC LIMIT 1'
  );
}

export interface FoodLogInput {
  log_date: string;
  name: string;
  source: 'usda' | 'off' | 'manual' | 'scan' | 'describe';
  source_food_id?: string | null;
  meal: MealType;
  meal_id?: number | null;
  brand?: string | null;
  data_type?: string | null;
  preparation?: string | null;
  grams_logged?: number | null;
  serving_size_g?: number | null;
  serving_label?: string | null;
  calories_per_100g?: number | null;
  protein_g_per_100g?: number | null;
  carbs_g_per_100g?: number | null;
  fat_g_per_100g?: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

async function insertFoodLogWithDb(
  db: SQLite.SQLiteDatabase,
  params: FoodLogInput,
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO food_logs
      (log_date, name, source, source_food_id, meal, meal_id, brand, data_type, preparation, grams_logged, serving_size_g, serving_label, calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, calories, protein_g, carbs_g, fat_g)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.log_date,
      params.name,
      params.source,
      params.source_food_id ?? null,
      params.meal,
      params.meal_id ?? null,
      params.brand ?? null,
      params.data_type ?? null,
      params.preparation ?? null,
      params.grams_logged ?? null,
      params.serving_size_g ?? null,
      params.serving_label ?? null,
      params.calories_per_100g ?? null,
      params.protein_g_per_100g ?? null,
      params.carbs_g_per_100g ?? null,
      params.fat_g_per_100g ?? null,
      params.calories,
      params.protein_g,
      params.carbs_g,
      params.fat_g,
    ]
  );
  return result.lastInsertRowId;
}

export async function insertFoodLog(params: FoodLogInput): Promise<number> {
  const db = await getDb();
  return insertFoodLogWithDb(db, params);
}

export async function getFoodLogsByDate(logDate: string): Promise<FoodLog[]> {
  const db = await getDb();
  return db.getAllAsync<FoodLog>(
    'SELECT * FROM food_logs WHERE log_date = ? ORDER BY logged_at ASC',
    [logDate]
  );
}

export async function deleteFoodLog(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM food_logs WHERE id = ?', [id]);
}

export async function deleteMeal(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM food_logs WHERE meal_id = ?', [id]);
  await db.runAsync('DELETE FROM meals WHERE id = ?', [id]);
}

export interface RecentFood {
  name: string;
  source: string;
  source_food_id: string | null;
  brand: string | null;
  data_type: string | null;
  preparation: string | null;
  calories_per_100g: number | null;
  protein_g_per_100g: number | null;
  carbs_g_per_100g: number | null;
  fat_g_per_100g: number | null;
  serving_size_g: number | null;
  serving_label: string | null;
  logged_at: string;
}

export async function getRecentFoodLogs(limit: number): Promise<RecentFood[]> {
  const db = await getDb();
  return db.getAllAsync<RecentFood>(
    `SELECT name, source, source_food_id, brand, data_type, preparation, calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, serving_size_g, serving_label, MAX(logged_at) as logged_at
     FROM food_logs
     WHERE source NOT IN ('manual', 'scan', 'describe')
     GROUP BY name, COALESCE(source_food_id, name)
     ORDER BY logged_at DESC
     LIMIT ?`,
    [limit]
  );
}

export interface LoggedFood extends FoodLog {
  photo_uri: string | null;
  food_key: string;
  is_pinned: number;
}

export async function getLoggedFoods(query: string): Promise<LoggedFood[]> {
  const db = await getDb();
  const normalizedQuery = `%${query.trim().toLowerCase()}%`;
  return db.getAllAsync<LoggedFood>(
    `WITH ranked_foods AS (
       SELECT
         f.*,
         m.photo_uri,
         f.source || ':' || COALESCE(NULLIF(f.source_food_id, ''), lower(f.name) || ':' || COALESCE(lower(f.brand), '')) AS food_key,
         ROW_NUMBER() OVER (
           PARTITION BY f.source, COALESCE(NULLIF(f.source_food_id, ''), lower(f.name) || ':' || COALESCE(lower(f.brand), ''))
           ORDER BY f.logged_at DESC, f.id DESC
         ) AS recency_rank
       FROM food_logs f
       LEFT JOIN meals m ON m.id = f.meal_id
       WHERE f.meal_id IS NULL
     )
     SELECT ranked_foods.*, CASE WHEN pinned_foods.food_key IS NULL THEN 0 ELSE 1 END AS is_pinned
     FROM ranked_foods
     LEFT JOIN pinned_foods ON pinned_foods.food_key = ranked_foods.food_key
     WHERE recency_rank = 1
       AND (lower(name) LIKE ? OR lower(COALESCE(brand, '')) LIKE ?)
     ORDER BY is_pinned DESC, logged_at DESC, id DESC`,
    [normalizedQuery, normalizedQuery],
  );
}

export interface LoggedMeal {
  meal_id: number;
  meal_name: string;
  meal_type: MealType;
  photo_uri: string | null;
  component_count: number;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  last_logged_at: string;
  food_key: string;
  is_pinned: number;
}

export async function getLoggedMeals(query: string): Promise<LoggedMeal[]> {
  const db = await getDb();
  const normalizedQuery = `%${query.trim().toLowerCase()}%`;
  return db.getAllAsync<LoggedMeal>(
    `WITH meal_totals AS (
       SELECT m.id AS meal_id, m.name AS meal_name, m.meal_type, m.photo_uri,
              COUNT(f.id) AS component_count,
              SUM(f.calories) AS total_calories,
              SUM(f.protein_g) AS total_protein,
              SUM(f.carbs_g) AS total_carbs,
              SUM(f.fat_g) AS total_fat,
              MAX(f.logged_at) AS last_logged_at,
              'meal:' || lower(m.name) AS food_key,
              ROW_NUMBER() OVER (PARTITION BY lower(m.name) ORDER BY MAX(f.logged_at) DESC, m.id DESC) AS recency_rank
       FROM meals m
       JOIN food_logs f ON f.meal_id = m.id
       GROUP BY m.id
     )
     SELECT meal_totals.*, CASE WHEN pinned_foods.food_key IS NULL THEN 0 ELSE 1 END AS is_pinned
     FROM meal_totals
     LEFT JOIN pinned_foods ON pinned_foods.food_key = meal_totals.food_key
     WHERE recency_rank = 1 AND lower(meal_name) LIKE ?
     ORDER BY is_pinned DESC, last_logged_at DESC, meal_id DESC`,
    [normalizedQuery],
  );
}

export async function setFoodPinned(foodKey: string, isPinned: boolean): Promise<void> {
  const db = await getDb();
  if (isPinned) {
    await db.runAsync('INSERT OR IGNORE INTO pinned_foods (food_key) VALUES (?)', [foodKey]);
    return;
  }
  await db.runAsync('DELETE FROM pinned_foods WHERE food_key = ?', [foodKey]);
}

export async function getTodayMacros(dateISO: string): Promise<{
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>(
    `SELECT
      COALESCE(SUM(calories), 0) AS calories,
      COALESCE(SUM(protein_g), 0) AS protein_g,
      COALESCE(SUM(carbs_g), 0) AS carbs_g,
      COALESCE(SUM(fat_g), 0) AS fat_g
     FROM food_logs
     WHERE log_date = ?`,
    [dateISO]
  );
  return row!;
}

export async function getDistinctLoggedDayCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(DISTINCT log_date) AS count FROM food_logs`
  );
  return row?.count ?? 0;
}

export async function getRecentWeightLogs(limit: number): Promise<WeightLog[]> {
  const db = await getDb();
  return db.getAllAsync<WeightLog>(
    'SELECT * FROM weight_logs ORDER BY log_date DESC LIMIT ?',
    [limit]
  );
}

export async function getWeightLogByDate(dateISO: string): Promise<WeightLog | null> {
  parseLocalISO(dateISO);
  const db = await getDb();
  return db.getFirstAsync<WeightLog>('SELECT * FROM weight_logs WHERE log_date = ?', [dateISO]);
}

export async function getLatestWeightLogOnOrBefore(dateISO: string): Promise<WeightLog | null> {
  parseLocalISO(dateISO);
  const db = await getDb();
  return db.getFirstAsync<WeightLog>(
    'SELECT * FROM weight_logs WHERE log_date <= ? ORDER BY log_date DESC LIMIT 1',
    [dateISO],
  );
}

export async function getEarliestWeightLogAfter(dateISO: string): Promise<WeightLog | null> {
  parseLocalISO(dateISO);
  const db = await getDb();
  return db.getFirstAsync<WeightLog>(
    'SELECT * FROM weight_logs WHERE log_date > ? ORDER BY log_date ASC LIMIT 1',
    [dateISO],
  );
}

export async function getWeightLogsByDateRange(startISO: string, endISO: string): Promise<WeightLog[]> {
  parseLocalISO(startISO);
  parseLocalISO(endISO);
  const db = await getDb();
  return db.getAllAsync<WeightLog>(
    'SELECT * FROM weight_logs WHERE log_date BETWEEN ? AND ? ORDER BY log_date ASC',
    [startISO, endISO],
  );
}

export async function getNearestWeightNeighbors(
  dateISO: string,
): Promise<{ before: WeightLog | null; after: WeightLog | null }> {
  parseLocalISO(dateISO);
  const db = await getDb();
  const before = await db.getFirstAsync<WeightLog>(
    'SELECT * FROM weight_logs WHERE log_date < ? ORDER BY log_date DESC LIMIT 1',
    [dateISO],
  );
  const after = await db.getFirstAsync<WeightLog>(
    'SELECT * FROM weight_logs WHERE log_date > ? ORDER BY log_date ASC LIMIT 1',
    [dateISO],
  );
  return { before, after };
}

export async function insertMeal(params: {
  name: string;
  log_date: string;
  meal_type: MealType;
  photo_uri?: string | null;
}): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO meals (name, log_date, meal_type, photo_uri) VALUES (?, ?, ?, ?)`,
    [params.name, params.log_date, params.meal_type, params.photo_uri ?? null]
  );
  return result.lastInsertRowId;
}

export async function saveMealWithComponents(params: {
  editMealId?: number | null;
  name: string;
  log_date: string;
  meal_type: MealType;
  photo_uri?: string | null;
  components: FoodLogInput[];
}): Promise<{ mealId: number; logIds: number[] }> {
  const db = await getDb();
  let mealId = params.editMealId ?? 0;
  const logIds: number[] = [];

  await db.withExclusiveTransactionAsync(async (txn) => {
    if (params.editMealId) {
      await txn.runAsync('DELETE FROM food_logs WHERE meal_id = ?', [params.editMealId]);
      await txn.runAsync(
        'UPDATE meals SET name = ?, meal_type = ? WHERE id = ?',
        [params.name, params.meal_type, params.editMealId],
      );
    } else {
      const result = await txn.runAsync(
        'INSERT INTO meals (name, log_date, meal_type, photo_uri) VALUES (?, ?, ?, ?)',
        [params.name, params.log_date, params.meal_type, params.photo_uri ?? null],
      );
      mealId = result.lastInsertRowId;
    }

    for (const component of params.components) {
      const logId = await insertFoodLogWithDb(txn, {
        ...component,
        log_date: params.log_date,
        meal: params.meal_type,
        meal_id: mealId,
      });
      logIds.push(logId);
    }
  });

  return { mealId, logIds };
}

export async function getActiveMealPhotoUris(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ photo_uri: string }>(
    'SELECT photo_uri FROM meals WHERE photo_uri IS NOT NULL'
  );
  return rows.map((r) => r.photo_uri);
}

export async function cacheFoodItem(params: {
  name: string;
  normalizedName: string;
  brand: string | null;
  preparation: string | null;
  calories_per_100g: number;
  protein_g_per_100g: number;
  carbs_g_per_100g: number;
  fat_g_per_100g: number;
  serving_size_g: number | null;
  serving_label: string | null;
  source: 'scan' | 'describe';
}): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM food_cache WHERE normalizedName = ?',
    [params.normalizedName]
  );
  if (existing) {
    await db.runAsync(
      `UPDATE food_cache SET
         name = ?, brand = COALESCE(?, brand), preparation = COALESCE(?, preparation),
         calories_per_100g = ?, protein_g_per_100g = ?, carbs_g_per_100g = ?,
         fat_g_per_100g = ?, serving_size_g = ?, serving_label = ?,
         source = ?, created_at = datetime('now')
       WHERE id = ?`,
      [
        params.name,
        params.brand,
        params.preparation,
        params.calories_per_100g,
        params.protein_g_per_100g,
        params.carbs_g_per_100g,
        params.fat_g_per_100g,
        params.serving_size_g,
        params.serving_label,
        params.source,
        existing.id,
      ]
    );
  } else {
    await db.runAsync(
      `INSERT INTO food_cache
         (name, normalizedName, brand, preparation,
          calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g,
          serving_size_g, serving_label, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.name,
        params.normalizedName,
        params.brand,
        params.preparation,
        params.calories_per_100g,
        params.protein_g_per_100g,
        params.carbs_g_per_100g,
        params.fat_g_per_100g,
        params.serving_size_g,
        params.serving_label,
        params.source,
      ]
    );
  }
}

export interface CachedFood {
  id: number;
  name: string;
  normalizedName: string;
  brand: string | null;
  preparation: string | null;
  calories_per_100g: number;
  protein_g_per_100g: number;
  carbs_g_per_100g: number;
  fat_g_per_100g: number;
  serving_size_g: number | null;
  serving_label: string | null;
  source: 'scan' | 'describe';
}

export async function getCachedFood(normalizedName: string): Promise<CachedFood | null> {
  const db = await getDb();
  return db.getFirstAsync<CachedFood>(
    'SELECT * FROM food_cache WHERE normalizedName = ?',
    [normalizedName]
  );
}

export async function searchFoodCache(query: string): Promise<CachedFood[]> {
  const db = await getDb();
  return db.getAllAsync<CachedFood>(
    `SELECT * FROM food_cache WHERE normalizedName LIKE ?
     ORDER BY CASE
       WHEN normalizedName = ? THEN 0
       WHEN normalizedName LIKE ? THEN 1
       ELSE 2
     END
     LIMIT 15`,
    [`%${query}%`, query, `${query}%`]
  );
}

export interface LastEntry {
  name: string;
  calories: number;
  logged_at: string;
  isMeal: boolean;
  mealId: number | null;
}

export async function getMostRecentEntry(): Promise<LastEntry | null> {
  const db = await getDb();
  const recent = await db.getFirstAsync<FoodLog>(
    'SELECT * FROM food_logs ORDER BY id DESC LIMIT 1'
  );
  if (!recent) return null;

  if (recent.meal_id) {
    const meal = await db.getFirstAsync<{ name: string }>(
      'SELECT name FROM meals WHERE id = ?',
      [recent.meal_id]
    );
    const totals = await db.getFirstAsync<{ calories: number; logged_at: string }>(
      `SELECT COALESCE(SUM(calories), 0) AS calories, MAX(logged_at) AS logged_at
       FROM food_logs WHERE meal_id = ?`,
      [recent.meal_id]
    );
    return {
      name: meal?.name ?? 'Meal',
      calories: totals?.calories ?? 0,
      logged_at: totals?.logged_at ?? recent.logged_at,
      isMeal: true,
      mealId: recent.meal_id,
    };
  }

  return {
    name: recent.name,
    calories: recent.calories,
    logged_at: recent.logged_at,
    isMeal: false,
    mealId: null,
  };
}

export interface RecentMeal {
  meal_id: number;
  meal_name: string;
  meal_type: MealType;
  component_count: number;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  last_logged_at: string;
}

export async function getRecentMeals(limit: number = 5): Promise<RecentMeal[]> {
  const db = await getDb();
  return db.getAllAsync<RecentMeal>(
    `SELECT m.id AS meal_id, m.name AS meal_name, m.meal_type,
            COUNT(f.id) AS component_count,
            COALESCE(SUM(f.calories), 0) AS total_calories,
            COALESCE(SUM(f.protein_g), 0) AS total_protein,
            COALESCE(SUM(f.carbs_g), 0) AS total_carbs,
            COALESCE(SUM(f.fat_g), 0) AS total_fat,
            MAX(f.logged_at) AS last_logged_at
     FROM meals m
     JOIN food_logs f ON f.meal_id = m.id
     GROUP BY m.id
     ORDER BY last_logged_at DESC
     LIMIT ?`,
    [limit]
  );
}

export async function getMealComponents(mealId: number): Promise<FoodLog[]> {
  const db = await getDb();
  return db.getAllAsync<FoodLog>(
    'SELECT * FROM food_logs WHERE meal_id = ? ORDER BY id',
    [mealId]
  );
}

export async function getDailyTargetForDate(dateISO: string): Promise<DailyTarget | null> {
  const db = await getDb();
  return db.getFirstAsync<DailyTarget>(
    'SELECT * FROM daily_targets WHERE effective_date <= ? ORDER BY effective_date DESC LIMIT 1',
    [dateISO]
  );
}

export interface DayMacros {
  log_date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export async function getMacrosByDateRange(startISO: string, endISO: string): Promise<DayMacros[]> {
  const db = await getDb();
  return db.getAllAsync<DayMacros>(
    `SELECT log_date,
       COALESCE(SUM(calories), 0) AS calories,
       COALESCE(SUM(protein_g), 0) AS protein_g,
       COALESCE(SUM(carbs_g), 0) AS carbs_g,
       COALESCE(SUM(fat_g), 0) AS fat_g
     FROM food_logs
     WHERE log_date BETWEEN ? AND ?
     GROUP BY log_date
     ORDER BY log_date`,
    [startISO, endISO]
  );
}

export async function getDailyCaloriesByDateRange(
  startISO: string,
  endISO: string,
): Promise<Array<{ log_date: string; calories: number }>> {
  parseLocalISO(startISO);
  parseLocalISO(endISO);
  const db = await getDb();
  return db.getAllAsync<{ log_date: string; calories: number }>(
    `SELECT log_date, SUM(calories) AS calories
     FROM food_logs
     WHERE log_date BETWEEN ? AND ?
     GROUP BY log_date
     HAVING SUM(calories) > 0
     ORDER BY log_date ASC`,
    [startISO, endISO],
  );
}

export async function getDailyTargetsByDateRange(
  startISO: string,
  endISO: string,
): Promise<DailyTarget[]> {
  parseLocalISO(startISO);
  parseLocalISO(endISO);
  const db = await getDb();
  return db.getAllAsync<DailyTarget>(
    'SELECT * FROM daily_targets WHERE effective_date BETWEEN ? AND ? ORDER BY effective_date ASC, id ASC',
    [startISO, endISO],
  );
}

export async function getLatestAdaptiveReview(): Promise<AdaptiveReview | null> {
  const db = await getDb();
  return db.getFirstAsync<AdaptiveReview>(
    'SELECT * FROM adaptive_reviews ORDER BY review_date DESC, id DESC LIMIT 1',
  );
}

export async function getPendingAdaptiveReview(): Promise<AdaptiveReview | null> {
  const db = await getDb();
  return db.getFirstAsync<AdaptiveReview>(
    "SELECT * FROM adaptive_reviews WHERE status = 'pending' ORDER BY review_date DESC, id DESC LIMIT 1",
  );
}

export interface MealRow {
  id: number;
  name: string;
  log_date: string;
  meal_type: MealType;
  photo_uri: string | null;
}

export async function getMealsByIds(ids: number[]): Promise<MealRow[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  return db.getAllAsync<MealRow>(
    `SELECT id, name, log_date, meal_type, photo_uri FROM meals WHERE id IN (${placeholders})`,
    ids
  );
}

export async function updateFoodLog(id: number, params: {
  grams_logged: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE food_logs SET
       grams_logged = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?
     WHERE id = ?`,
    [params.grams_logged, params.calories, params.protein_g, params.carbs_g, params.fat_g, id]
  );
}
