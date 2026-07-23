import * as SQLite from 'expo-sqlite';

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

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('marco.db');
  }
  return _db;
}

export async function initDatabase(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    DROP TABLE IF EXISTS profile;
    DROP TABLE IF EXISTS weight_logs;
    DROP TABLE IF EXISTS food_logs;
    DROP TABLE IF EXISTS daily_targets;

    CREATE TABLE profile (
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

    CREATE TABLE weight_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date TEXT NOT NULL UNIQUE,
      scale_weight_kg REAL NOT NULL,
      trend_weight_kg REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE food_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date TEXT NOT NULL,
      name TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('usda','off','manual')),
      source_food_id TEXT,
      grams_logged REAL,
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

    CREATE TABLE daily_targets (
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
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO profile
      (id, display_name, sex, height_cm, birth_date, activity_level, goal_type, goal_rate_kg_per_week, protein_preference)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.display_name,
      params.sex,
      params.height_cm,
      params.birth_date,
      params.activity_level,
      params.goal_type,
      params.goal_rate_kg_per_week,
      params.protein_preference,
    ]
  );
}

export async function insertWeightLog(params: {
  log_date: string;
  scale_weight_kg: number;
  trend_weight_kg: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO weight_logs (log_date, scale_weight_kg, trend_weight_kg)
     VALUES (?, ?, ?)`,
    [params.log_date, params.scale_weight_kg, params.trend_weight_kg]
  );
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

export async function getLatestDailyTarget(): Promise<DailyTarget | null> {
  const db = await getDb();
  return db.getFirstAsync<DailyTarget>(
    'SELECT * FROM daily_targets ORDER BY id DESC LIMIT 1'
  );
}
