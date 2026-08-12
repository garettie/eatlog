import { FOOD_LOG_DATA_TYPE_MIGRATION_SQL } from './foodLogDataTypeMigration';
import { WEIGHT_ORIGIN_MIGRATION_SQL } from './weightOriginMigration';

export const CURRENT_DATABASE_VERSION = 10;

interface MigrationExecutor {
  execAsync(sql: string): Promise<void>;
}

export interface MigrationDatabase extends MigrationExecutor {
  getFirstAsync<T>(sql: string): Promise<T | null>;
  getAllAsync<T>(sql: string): Promise<T[]>;
  withExclusiveTransactionAsync(task: (transaction: MigrationExecutor) => Promise<void>): Promise<void>;
}

export async function migrateDatabase(db: MigrationDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion > CURRENT_DATABASE_VERSION) {
    throw new Error(
      `Database version ${currentVersion} is newer than supported version ${CURRENT_DATABASE_VERSION}.`,
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
    currentVersion = 9;
  }

  if (currentVersion === 9) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        ALTER TABLE profile ADD COLUMN share_branding_enabled INTEGER NOT NULL DEFAULT 1
          CHECK (share_branding_enabled IN (0, 1));
        PRAGMA user_version = 10;
      `);
    });
  }
}
