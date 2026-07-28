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
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

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
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
const DATABASE_VERSION = 1;

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
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion > DATABASE_VERSION) {
    throw new Error(
      `Database version ${currentVersion} is newer than supported version ${DATABASE_VERSION}.`
    );
  }
  if (currentVersion === DATABASE_VERSION) return;

  await db.withExclusiveTransactionAsync(async (txn) => {
    if (currentVersion === 0) {
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
    }

    await txn.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  });
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
