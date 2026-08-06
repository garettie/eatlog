import * as SQLite from 'expo-sqlite';

import { parseLocalISO } from '../utils/calendar';
import { computeWeightTrend } from '../utils/weightTrend';
import { FOOD_LOG_DATA_TYPE_MIGRATION_SQL } from './foodLogDataTypeMigration';
import { WEIGHT_ORIGIN_MIGRATION_SQL } from './weightOriginMigration';

export type Sex = 'male' | 'female';
export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';
export type GoalType = 'cut' | 'maintain' | 'bulk';
export type CalculationMethod = 'initial_estimate' | 'profile_recalculation' | 'manual' | 'adaptive';
export type ProteinPreference = 'low' | 'moderate' | 'high' | 'extra_high';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type WeightUnit = 'kg' | 'lb';
export type WeightOrigin = 'eatlog' | 'health_connect';
export type AdaptiveReviewStatus = 'pending' | 'accepted' | 'kept' | 'superseded';
export type IntakeDayConfirmationStatus = 'complete' | 'partial' | 'intentional_fast';
export type IntakeDayConfirmationSource = 'adaptive_review';

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
  origin: WeightOrigin;
  origin_record_id: string | null;
  origin_data_source: string | null;
  origin_last_modified_at: string | null;
  measured_at: string | null;
  revision: number;
  created_at: string;
}

export interface HealthConnectWeightExport {
  log_date: string;
  client_record_id: string;
  record_id: string | null;
  exported_revision: number | null;
  pending_delete: number;
}

export interface HealthConnectState {
  enabled: number;
  last_sync_at: string | null;
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

export interface IntakeDayConfirmation {
  log_date: string;
  status: IntakeDayConfirmationStatus;
  confirmation_source: IntakeDayConfirmationSource;
  confirmed_at: string;
}

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
export const DATABASE_NAME = 'eatlog.db';
export const LEGACY_DATABASE_NAME = 'marco.db';
const DATABASE_VERSION = 9;

export function getDatabaseVersion(): number {
  return DATABASE_VERSION;
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (!_dbPromise) {
    _dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).catch((error) => {
      _dbPromise = null;
      throw error;
    });
  }
  _db = await _dbPromise;
  return _db;
}

export async function closeDatabase(): Promise<void> {
  const db = _db;
  if (!db) return;
  await db.closeAsync();
  _db = null;
  _dbPromise = null;
}

export function resetDatabaseConnection(): void {
  _db = null;
  _dbPromise = null;
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

  if (currentVersion === 4) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      // SQLite cannot widen a CHECK constraint in place. Preserve target ids
      // and rebuild the dependent review table so its foreign key still points
      // at the replacement history table.
      await txn.execAsync(`
        ALTER TABLE adaptive_reviews RENAME TO adaptive_reviews_v4;
        ALTER TABLE daily_targets RENAME TO daily_targets_v4;
        CREATE TABLE daily_targets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          effective_date TEXT NOT NULL,
          tdee_estimate REAL NOT NULL,
          target_calories REAL NOT NULL,
          target_protein_g REAL NOT NULL,
          target_fat_g REAL NOT NULL,
          target_carbs_g REAL NOT NULL,
          calculation_method TEXT NOT NULL CHECK (calculation_method IN
            ('initial_estimate','profile_recalculation','manual','adaptive')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO daily_targets
          (id, effective_date, tdee_estimate, target_calories, target_protein_g, target_fat_g, target_carbs_g, calculation_method, created_at)
        SELECT id, effective_date, tdee_estimate, target_calories, target_protein_g, target_fat_g, target_carbs_g,
          CASE calculation_method WHEN 'adaptive' THEN 'adaptive' ELSE 'initial_estimate' END, created_at
        FROM daily_targets_v4;
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
        INSERT INTO adaptive_reviews
        SELECT * FROM adaptive_reviews_v4;
        DROP TABLE adaptive_reviews_v4;
        DROP TABLE daily_targets_v4;
        CREATE INDEX IF NOT EXISTS idx_daily_targets_effective_date ON daily_targets(effective_date);
        CREATE INDEX IF NOT EXISTS idx_adaptive_reviews_status_date ON adaptive_reviews(status, review_date);
        PRAGMA user_version = 5;
      `);
    });
    currentVersion = 5;
  }

  if (currentVersion === 5) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        ALTER TABLE weight_logs ADD COLUMN origin TEXT NOT NULL DEFAULT 'eatlog'
          CHECK (origin IN ('eatlog', 'health_connect'));
        ALTER TABLE weight_logs ADD COLUMN origin_record_id TEXT;
        ALTER TABLE weight_logs ADD COLUMN origin_data_source TEXT;
        ALTER TABLE weight_logs ADD COLUMN origin_last_modified_at TEXT;
        ALTER TABLE weight_logs ADD COLUMN measured_at TEXT;
        ALTER TABLE weight_logs ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
        CREATE TABLE health_connect_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
          last_sync_at TEXT
        );
        INSERT INTO health_connect_state (id, enabled) VALUES (1, 0);
        CREATE TABLE health_connect_weight_exports (
          log_date TEXT PRIMARY KEY,
          client_record_id TEXT NOT NULL UNIQUE,
          record_id TEXT,
          exported_revision INTEGER,
          pending_delete INTEGER NOT NULL DEFAULT 0 CHECK (pending_delete IN (0, 1))
        );
        CREATE INDEX idx_weight_logs_origin_date ON weight_logs(origin, log_date);
        PRAGMA user_version = 6;
      `);
    });
    currentVersion = 6;
  }

  if (currentVersion === 6) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        CREATE TABLE adaptive_intake_day_confirmations (
          log_date TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK (status IN ('complete', 'partial', 'intentional_fast')),
          confirmation_source TEXT NOT NULL CHECK (confirmation_source IN ('adaptive_review')),
          confirmed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        CREATE INDEX idx_adaptive_intake_confirmations_status_date
          ON adaptive_intake_day_confirmations(status, log_date);
        PRAGMA user_version = 7;
      `);
    });
    currentVersion = 7;
  }

  if (currentVersion === 7) {
    await db.withExclusiveTransactionAsync((txn) => txn.execAsync(WEIGHT_ORIGIN_MIGRATION_SQL));
    currentVersion = 8;
  }

  if (currentVersion === 8) {
    await db.withExclusiveTransactionAsync((txn) => txn.execAsync(FOOD_LOG_DATA_TYPE_MIGRATION_SQL));
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

export type ProfileUpdate = Pick<Profile,
  'display_name' | 'sex' | 'height_cm' | 'birth_date' | 'activity_level' |
  'goal_type' | 'goal_rate_kg_per_week' | 'protein_preference' | 'weight_unit' | 'target_weight_kg'
>;

export interface DailyTargetInput {
  effective_date: string;
  tdee_estimate: number;
  target_calories: number;
  target_protein_g: number;
  target_fat_g: number;
  target_carbs_g: number;
  calculation_method: CalculationMethod;
}

function profileUpdateValues(params: ProfileUpdate) {
  return [
    params.display_name.trim(), params.sex, params.height_cm, params.birth_date,
    params.activity_level, params.goal_type, params.goal_rate_kg_per_week,
    params.protein_preference, params.weight_unit, params.target_weight_kg,
  ];
}

async function writeProfileUpdate(db: SQLite.SQLiteDatabase, params: ProfileUpdate): Promise<void> {
  await db.runAsync(
    `UPDATE profile SET display_name = ?, sex = ?, height_cm = ?, birth_date = ?, activity_level = ?,
      goal_type = ?, goal_rate_kg_per_week = ?, protein_preference = ?, weight_unit = ?, target_weight_kg = ?
     WHERE id = 1`,
    profileUpdateValues(params),
  );
}

export async function updateProfilePresentation(params: ProfileUpdate): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync((txn) => writeProfileUpdate(txn, params));
}

export async function updateProfileAndPlan(params: {
  profile: ProfileUpdate;
  target: DailyTargetInput;
}): Promise<DailyTarget> {
  parseLocalISO(params.target.effective_date);
  const db = await getDb();
  let saved: DailyTarget | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await writeProfileUpdate(txn, params.profile);
    const inserted = await txn.runAsync(
      `INSERT INTO daily_targets
        (effective_date, tdee_estimate, target_calories, target_protein_g, target_fat_g, target_carbs_g, calculation_method)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        params.target.effective_date, params.target.tdee_estimate, params.target.target_calories,
        params.target.target_protein_g, params.target.target_fat_g, params.target.target_carbs_g,
        params.target.calculation_method,
      ],
    );
    await txn.runAsync(
      `UPDATE adaptive_reviews SET status = 'superseded', resolved_at = datetime('now', 'localtime')
       WHERE status = 'pending'`,
    );
    saved = await txn.getFirstAsync<DailyTarget>('SELECT * FROM daily_targets WHERE id = ?', [inserted.lastInsertRowId]);
    if (!saved) throw new Error('Saved daily target missing');
  });
  if (!saved) throw new Error('Profile plan transaction failed');
  return saved;
}

export interface SaveWeightResult {
  log: WeightLog;
  wasUpdate: boolean;
  previousScaleWeightKg: number | null;
  previousLog: WeightLog | null;
  previousExport: HealthConnectWeightExport | null;
}

async function recomputeWeightTrendWithDb(db: SQLite.SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<WeightLog>('SELECT * FROM weight_logs ORDER BY log_date ASC');
  const trend = computeWeightTrend(rows.map((row) => ({
    logDate: row.log_date,
    scaleWeightKg: row.scale_weight_kg,
  })));
  for (const reading of trend) {
    await db.runAsync(
      'UPDATE weight_logs SET trend_weight_kg = ? WHERE log_date = ?',
      [reading.trendWeightKg, reading.logDate],
    );
  }
}

function localNoonIso(logDate: string): string {
  const measuredAt = parseLocalISO(logDate);
  measuredAt.setHours(12, 0, 0, 0);
  return measuredAt.toISOString();
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
    const previousExport = await txn.getFirstAsync<HealthConnectWeightExport>(
      'SELECT * FROM health_connect_weight_exports WHERE log_date = ?',
      [params.logDate],
    );
    const revision = (existing?.revision ?? 0) + 1;
    await txn.runAsync(
      `INSERT INTO weight_logs
        (log_date, scale_weight_kg, trend_weight_kg, origin, origin_record_id, origin_data_source, origin_last_modified_at, measured_at, revision)
       VALUES (?, ?, ?, 'eatlog', NULL, NULL, NULL, ?, ?)
       ON CONFLICT(log_date) DO UPDATE SET
         scale_weight_kg = excluded.scale_weight_kg,
         origin = 'eatlog',
         origin_record_id = NULL,
         origin_data_source = NULL,
         origin_last_modified_at = NULL,
         measured_at = excluded.measured_at,
         revision = excluded.revision`,
      [params.logDate, roundedWeight, roundedWeight, localNoonIso(params.logDate), revision],
    );
    await txn.runAsync(
      `INSERT INTO health_connect_weight_exports
        (log_date, client_record_id, record_id, exported_revision, pending_delete)
       VALUES (?, ?, NULL, NULL, 0)
       ON CONFLICT(log_date) DO UPDATE SET pending_delete = 0`,
      [params.logDate, `eatlog-weight:${params.logDate}`],
    );
    await recomputeWeightTrendWithDb(txn);
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
      previousLog: existing,
      previousExport,
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
    const exportRow = await txn.getFirstAsync<HealthConnectWeightExport>(
      'SELECT * FROM health_connect_weight_exports WHERE log_date = ?',
      [existing.log_date],
    );
    if (exportRow?.record_id || exportRow?.exported_revision != null) {
      await txn.runAsync(
        'UPDATE health_connect_weight_exports SET pending_delete = 1 WHERE log_date = ?',
        [existing.log_date],
      );
    } else {
      await txn.runAsync('DELETE FROM health_connect_weight_exports WHERE log_date = ?', [existing.log_date]);
    }
    await recomputeWeightTrendWithDb(txn);
  });
}

export async function restoreWeightSave(params: {
  savedLogId: number;
  logDate: string;
  previousLog: WeightLog | null;
  previousExport: HealthConnectWeightExport | null;
}): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const currentExport = await txn.getFirstAsync<HealthConnectWeightExport>(
      'SELECT * FROM health_connect_weight_exports WHERE log_date = ?',
      [params.logDate],
    );
    if (params.previousLog) {
      const row = params.previousLog;
      await txn.runAsync(
        `INSERT INTO weight_logs
          (id, log_date, scale_weight_kg, trend_weight_kg, origin, origin_record_id, origin_data_source, origin_last_modified_at, measured_at, revision, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(log_date) DO UPDATE SET
           id = excluded.id,
           scale_weight_kg = excluded.scale_weight_kg,
           trend_weight_kg = excluded.trend_weight_kg,
           origin = excluded.origin,
           origin_record_id = excluded.origin_record_id,
           origin_data_source = excluded.origin_data_source,
           origin_last_modified_at = excluded.origin_last_modified_at,
           measured_at = excluded.measured_at,
           revision = excluded.revision,
           created_at = excluded.created_at`,
        [row.id, row.log_date, row.scale_weight_kg, row.trend_weight_kg, row.origin,
          row.origin_record_id, row.origin_data_source, row.origin_last_modified_at,
          row.measured_at, row.revision, row.created_at],
      );
    } else {
      await txn.runAsync('DELETE FROM weight_logs WHERE id = ?', [params.savedLogId]);
    }

    await txn.runAsync('DELETE FROM health_connect_weight_exports WHERE log_date = ?', [params.logDate]);
    if (params.previousExport) {
      const row = params.previousExport;
      await txn.runAsync(
        `INSERT INTO health_connect_weight_exports
          (log_date, client_record_id, record_id, exported_revision, pending_delete)
         VALUES (?, ?, ?, ?, ?)`,
        [row.log_date, row.client_record_id, row.record_id, row.exported_revision, row.pending_delete],
      );
    } else if (currentExport?.record_id || currentExport?.exported_revision != null) {
      await txn.runAsync(
        `INSERT INTO health_connect_weight_exports
          (log_date, client_record_id, record_id, exported_revision, pending_delete)
         VALUES (?, ?, ?, ?, 1)`,
        [currentExport.log_date, currentExport.client_record_id,
          currentExport.record_id, currentExport.exported_revision],
      );
    }
    await recomputeWeightTrendWithDb(txn);
  });
}

export interface HealthConnectImportWeight {
  logDate: string;
  scaleWeightKg: number;
  recordId: string;
  dataSource: string | null;
  lastModifiedAt: string | null;
  measuredAt: string;
}

export interface HealthConnectReconcileResult {
  inserted: number;
  updated: number;
  deleted: number;
  skippedManual: number;
}

export async function reconcileHealthConnectWeights(
  records: HealthConnectImportWeight[],
  startDate: string,
  endDate: string,
): Promise<HealthConnectReconcileResult> {
  parseLocalISO(startDate);
  parseLocalISO(endDate);
  const db = await getDb();
  const result: HealthConnectReconcileResult = { inserted: 0, updated: 0, deleted: 0, skippedManual: 0 };
  await db.withExclusiveTransactionAsync(async (txn) => {
    const selectedByDate = new Map(records.map((record) => [record.logDate, record]));
    for (const record of records) {
      const existing = await txn.getFirstAsync<WeightLog>(
        'SELECT * FROM weight_logs WHERE log_date = ?', [record.logDate],
      );
      if (existing?.origin === 'eatlog') {
        result.skippedManual += 1;
        continue;
      }
      const unchanged = existing?.origin === 'health_connect'
        && existing.origin_record_id === record.recordId
        && existing.origin_data_source === record.dataSource
        && existing.origin_last_modified_at === record.lastModifiedAt
        && existing.measured_at === record.measuredAt
        && Math.abs(existing.scale_weight_kg - record.scaleWeightKg) < 0.000001;
      if (unchanged) continue;
      await txn.runAsync(
        `INSERT INTO weight_logs
          (log_date, scale_weight_kg, trend_weight_kg, origin, origin_record_id, origin_data_source, origin_last_modified_at, measured_at, revision)
         VALUES (?, ?, ?, 'health_connect', ?, ?, ?, ?, 1)
         ON CONFLICT(log_date) DO UPDATE SET
           scale_weight_kg = excluded.scale_weight_kg,
           origin_record_id = excluded.origin_record_id,
           origin_data_source = excluded.origin_data_source,
           origin_last_modified_at = excluded.origin_last_modified_at,
           measured_at = excluded.measured_at,
           revision = weight_logs.revision + 1`,
        [record.logDate, record.scaleWeightKg, record.scaleWeightKg, record.recordId,
          record.dataSource, record.lastModifiedAt, record.measuredAt],
      );
      if (existing) result.updated += 1;
      else result.inserted += 1;
    }

    const importedRows = await txn.getAllAsync<WeightLog>(
      `SELECT * FROM weight_logs
       WHERE origin = 'health_connect' AND log_date BETWEEN ? AND ?`,
      [startDate, endDate],
    );
    for (const row of importedRows) {
      const selected = selectedByDate.get(row.log_date);
      if (!selected || selected.recordId !== row.origin_record_id) {
        await txn.runAsync('DELETE FROM weight_logs WHERE id = ?', [row.id]);
        result.deleted += 1;
      }
    }
    await recomputeWeightTrendWithDb(txn);
  });
  return result;
}

export async function getHealthConnectState(): Promise<HealthConnectState> {
  const db = await getDb();
  return (await db.getFirstAsync<HealthConnectState>(
    'SELECT enabled, last_sync_at FROM health_connect_state WHERE id = 1',
  )) ?? { enabled: 0, last_sync_at: null };
}

export async function setHealthConnectEnabled(enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE health_connect_state SET enabled = ? WHERE id = 1', [enabled ? 1 : 0]);
}

export async function setHealthConnectLastSync(lastSyncAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE health_connect_state SET last_sync_at = ? WHERE id = 1', [lastSyncAt]);
}

export interface PendingHealthConnectExport {
  log: WeightLog;
  ledger: HealthConnectWeightExport;
}

export async function getPendingHealthConnectExports(): Promise<PendingHealthConnectExport[]> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO health_connect_weight_exports
      (log_date, client_record_id, record_id, exported_revision, pending_delete)
     SELECT log_date, 'eatlog-weight:' || log_date, NULL, NULL, 0
     FROM weight_logs WHERE origin = 'eatlog'`,
  );
  const rows = await db.getAllAsync<WeightLog & HealthConnectWeightExport>(
    `SELECT w.*, e.client_record_id, e.record_id, e.exported_revision, e.pending_delete
     FROM weight_logs w
     JOIN health_connect_weight_exports e ON e.log_date = w.log_date
     WHERE w.origin = 'eatlog' AND e.pending_delete = 0
       AND (e.exported_revision IS NULL OR e.exported_revision < w.revision)
     ORDER BY w.log_date`,
  );
  return rows.map((row) => ({ log: row, ledger: row }));
}

export async function getPendingHealthConnectDeletions(): Promise<HealthConnectWeightExport[]> {
  const db = await getDb();
  return db.getAllAsync<HealthConnectWeightExport>(
    'SELECT * FROM health_connect_weight_exports WHERE pending_delete = 1 ORDER BY log_date',
  );
}

export async function markHealthConnectExported(
  logDate: string,
  recordId: string,
  revision: number,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE health_connect_weight_exports
     SET record_id = ?, exported_revision = ?, pending_delete = 0
     WHERE log_date = ?`,
    [recordId, revision, logDate],
  );
}

export async function markHealthConnectDeletionComplete(logDate: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM health_connect_weight_exports WHERE log_date = ?', [logDate]);
}

export async function clearHealthConnectDeviceState(): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE health_connect_state SET enabled = 0, last_sync_at = NULL WHERE id = 1');
    await txn.runAsync('DELETE FROM health_connect_weight_exports');
  });
}

export async function insertDailyTarget(params: DailyTargetInput): Promise<void> {
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

export async function getFoodLogsByDateRange(startISO: string, endISO: string): Promise<FoodLog[]> {
  parseLocalISO(startISO);
  parseLocalISO(endISO);
  const db = await getDb();
  return db.getAllAsync<FoodLog>(
    'SELECT * FROM food_logs WHERE log_date BETWEEN ? AND ? ORDER BY log_date ASC, logged_at ASC',
    [startISO, endISO],
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
        'UPDATE meals SET name = ?, log_date = ?, meal_type = ?, photo_uri = ? WHERE id = ?',
        [params.name, params.log_date, params.meal_type, params.photo_uri ?? null, params.editMealId],
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

export async function getMealPhotoReferences(): Promise<Array<{ mealId: number; uri: string }>> {
  const db = await getDb();
  return db.getAllAsync<{ mealId: number; uri: string }>(
    'SELECT id AS mealId, photo_uri AS uri FROM meals WHERE photo_uri IS NOT NULL',
  );
}

export interface DataCounts {
  profile: number;
  foodLogs: number;
  meals: number;
  weightLogs: number;
  dailyTargets: number;
  adaptiveReviews: number;
  photos: number;
}

export async function getDataCounts(): Promise<DataCounts> {
  const db = await getDb();
  const [profile, foodLogs, meals, weightLogs, dailyTargets, adaptiveReviews, photos] = await Promise.all([
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM profile'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM food_logs'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM meals'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM weight_logs'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM daily_targets'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM adaptive_reviews'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM meals WHERE photo_uri IS NOT NULL'),
  ]);
  return {
    profile: profile?.count ?? 0,
    foodLogs: foodLogs?.count ?? 0,
    meals: meals?.count ?? 0,
    weightLogs: weightLogs?.count ?? 0,
    dailyTargets: dailyTargets?.count ?? 0,
    adaptiveReviews: adaptiveReviews?.count ?? 0,
    photos: photos?.count ?? 0,
  };
}

export interface ExportMeal {
  id: number;
  name: string;
  log_date: string;
  meal_type: MealType;
  created_at: string;
}

export async function getExportFoodLogs(): Promise<FoodLog[]> {
  const db = await getDb();
  return db.getAllAsync<FoodLog>('SELECT * FROM food_logs ORDER BY log_date, id');
}

export async function getExportWeightLogs(): Promise<WeightLog[]> {
  const db = await getDb();
  return db.getAllAsync<WeightLog>('SELECT * FROM weight_logs ORDER BY log_date, id');
}

export async function getExportDailyTargets(): Promise<DailyTarget[]> {
  const db = await getDb();
  return db.getAllAsync<DailyTarget>('SELECT * FROM daily_targets ORDER BY effective_date, id');
}

export async function getExportMeals(): Promise<ExportMeal[]> {
  const db = await getDb();
  return db.getAllAsync<ExportMeal>(
    'SELECT id, name, log_date, meal_type, created_at FROM meals ORDER BY log_date, id',
  );
}

export async function getExportAdaptiveReviews(): Promise<AdaptiveReview[]> {
  const db = await getDb();
  return db.getAllAsync<AdaptiveReview>('SELECT * FROM adaptive_reviews ORDER BY review_date, id');
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
    'SELECT * FROM daily_targets WHERE effective_date <= ? ORDER BY effective_date DESC, id DESC LIMIT 1',
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
