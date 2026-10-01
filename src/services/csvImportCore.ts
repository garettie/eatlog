import type { ExportMeal, FoodLog, WeightLog } from '../db/database';
import { CLEAR_HEALTH_CONNECT_DEVICE_STATE_SQL } from '../db/healthConnectDeviceState';
import { computeWeightTrend } from '../utils/weightTrend';
import { parseLocalISO } from '../utils/calendar';
import { fingerprintMeal, type CsvRecordLink } from './csvRecordIdentity';
import type { CsvImportMode, CsvImportPreview, ParsedMacroCsv } from './macroCsv.types';
import type { OwnershipProgressListener } from './dataOwnership.types';

export interface CsvDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: (string | number | null)[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
  getFirstAsync<T>(sql: string, params: (string | number | null)[]): Promise<T | null>;
  getAllAsync<T>(sql: string): Promise<T[]>;
  getAllAsync<T>(sql: string, params: (string | number | null)[]): Promise<T[]>;
}

export interface CsvTransactionalDatabase extends CsvDatabase {
  withExclusiveTransactionAsync(task: (txn: CsvDatabase) => Promise<void>): Promise<void>;
}

export interface CsvImportResult {
  mealsAdded: number;
  mealsSkipped: number;
  weightsAdded: number;
  weightsSkipped: number;
}

interface LocalCsvState {
  meals: ExportMeal[];
  foods: FoodLog[];
  weights: WeightLog[];
  links: CsvRecordLink[];
}

async function readState(db: CsvDatabase): Promise<LocalCsvState> {
  // Read sequentially through the transaction connection, never the shared db.
  const meals = await db.getAllAsync<ExportMeal>('SELECT * FROM meals ORDER BY id');
  const foods = await db.getAllAsync<FoodLog>('SELECT * FROM food_logs ORDER BY id');
  const weights = await db.getAllAsync<WeightLog>('SELECT * FROM weight_logs ORDER BY id');
  const links = await db.getAllAsync<CsvRecordLink>('SELECT * FROM csv_record_links ORDER BY record_type, source_id');
  return { meals, foods, weights, links };
}

function stateFingerprint(state: LocalCsvState): string {
  return JSON.stringify([state.meals, state.foods, state.weights, state.links]);
}

function occupiedMealDates(state: LocalCsvState): Set<string> {
  return new Set([...state.meals.map((row) => row.log_date), ...state.foods.map((row) => row.log_date)]);
}

function liveMealLinks(state: LocalCsvState): Map<string, CsvRecordLink> {
  const mealIds = new Set(state.meals.map((row) => row.id));
  const foodIds = new Set(state.foods.filter((row) => row.meal_id == null).map((row) => row.id));
  return new Map(state.links.filter((link) => link.record_type === 'meal'
    && ((link.meal_id != null && mealIds.has(link.meal_id))
      || (link.food_log_id != null && foodIds.has(link.food_log_id))))
    .map((link) => [link.source_id, link]));
}

export async function inspectCsvAgainstDatabase(
  db: CsvTransactionalDatabase,
  fileName: string,
  text: string,
  parsed: ParsedMacroCsv,
): Promise<CsvImportPreview> {
  let preview: CsvImportPreview | undefined;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const state = await readState(txn);
    const links = liveMealLinks(state);
    const mealDates = occupiedMealDates(state);
    const dates = new Set(state.weights.map((row) => row.log_date));
    const weightIds = new Set(state.weights.map((row) => row.id));
    const weightSources = new Set(state.links.filter((link) => link.record_type === 'weight'
      && link.weight_log_id != null && weightIds.has(link.weight_log_id)).map((link) => link.source_id));
    preview = {
      fileName, text, parsed,
      duplicateMeals: parsed.meals.filter((meal) => mealDates.has(meal.logDate) || links.has(meal.sourceId)).length,
      changedSourceMeals: parsed.meals.filter((meal) => {
        const link = links.get(meal.sourceId);
        return link?.original_row_json != null && link.original_row_json !== JSON.stringify(meal.originalRow);
      }).length,
      conflictingWeights: parsed.weights.filter((weight) => dates.has(weight.logDate) || weightSources.has(weight.sourceId)).length,
      existingMeals: state.meals.length,
      existingFoodLogs: state.foods.length,
      existingWeights: state.weights.length,
      localDataFingerprint: stateFingerprint(state),
    };
  });
  if (!preview) throw new Error('Could not inspect local history.');
  return preview;
}

export async function cleanupCsvRecordLinks(db: CsvDatabase): Promise<void> {
  await db.execAsync(`DELETE FROM csv_record_links WHERE
    (meal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM meals WHERE id = meal_id)) OR
    (food_log_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM food_logs WHERE id = food_log_id AND meal_id IS NULL)) OR
    (weight_log_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM weight_logs WHERE id = weight_log_id));`);
}

export async function writeCsvRecordLink(db: CsvDatabase, link: CsvRecordLink): Promise<void> {
  await db.runAsync(`INSERT INTO csv_record_links
    (record_type, source_id, meal_id, food_log_id, weight_log_id, original_row_json, native_fingerprint)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [link.record_type, link.source_id, link.meal_id,
    link.food_log_id, link.weight_log_id, link.original_row_json, link.native_fingerprint]);
}

export async function applyCsvImport(
  db: CsvTransactionalDatabase,
  preview: CsvImportPreview,
  mode: CsvImportMode,
  onProgress?: OwnershipProgressListener,
): Promise<CsvImportResult> {
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Choose Merge or Replace history.');
  const { parsed } = preview;
  if (parsed.meals.length && parsed.timestampFormatSource === 'unconfirmed') {
    throw new Error('Choose which app exported the CSV before importing.');
  }
  if (!parsed.meals.length && !parsed.weights.length) throw new Error('The CSV has no meal or weight history to import.');
  const result: CsvImportResult = { mealsAdded: 0, mealsSkipped: 0, weightsAdded: 0, weightsSkipped: 0 };
  await db.withExclusiveTransactionAsync(async (txn) => {
    const state = await readState(txn);
    if (mode === 'replace' && stateFingerprint(state) !== preview.localDataFingerprint) {
      throw new Error('Your history changed after the preview. Inspect the CSV again before replacing it.');
    }
    await cleanupCsvRecordLinks(txn);
    const links = mode === 'merge' ? liveMealLinks(state) : new Map<string, CsvRecordLink>();
    // Freeze occupied days before inserting so every meal on a new day is imported.
    const mealDates = mode === 'merge' ? occupiedMealDates(state) : new Set<string>();
    const importedMealDates = new Set<string>();
    const weightDates = new Set(mode === 'merge' ? state.weights.map((row) => row.log_date) : []);
    if (mode === 'replace') {
      await txn.execAsync(`DELETE FROM csv_record_links;
        DELETE FROM food_logs; DELETE FROM meals; DELETE FROM weight_logs;
        DELETE FROM adaptive_reviews; DELETE FROM adaptive_intake_day_confirmations;
        ${CLEAR_HEALTH_CONNECT_DEVICE_STATE_SQL}`);
    }
    const total = parsed.meals.length + parsed.weights.length;
    let completed = 0;
    const progress = () => onProgress?.({ operation: 'import', phase: 'history', completed: ++completed,
      total, message: `Importing history ${completed} of ${total}`, cancellable: false });
    for (const meal of parsed.meals) {
      if (mealDates.has(meal.logDate) || links.has(meal.sourceId)) {
        result.mealsSkipped += 1;
        progress();
        continue;
      }
      const inserted = await txn.runAsync(`INSERT INTO meals (name, log_date, meal_type, created_at)
        VALUES (?, ?, ?, ?)`, [meal.name, meal.logDate, meal.mealType, meal.createdAt]);
      for (const component of meal.components) {
        await txn.runAsync(`INSERT INTO food_logs
          (log_date, name, source, source_food_id, meal, meal_id, brand, data_type, preparation,
           grams_logged, portion_quantity, portion_unit, serving_size_g, serving_label, calories_per_100g, protein_g_per_100g,
           carbs_g_per_100g, fat_g_per_100g, calories, protein_g, carbs_g, fat_g, logged_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [meal.logDate, component.name, component.source, component.source_food_id ?? null,
          meal.mealType, inserted.lastInsertRowId, component.brand ?? null, component.data_type ?? null,
          component.preparation ?? null, component.grams_logged ?? null, component.portion_quantity ?? null,
          component.portion_unit ?? null, component.serving_size_g ?? null,
          component.serving_label ?? null, component.calories_per_100g ?? null,
          component.protein_g_per_100g ?? null, component.carbs_g_per_100g ?? null,
          component.fat_g_per_100g ?? null, component.calories, component.protein_g,
          component.carbs_g, component.fat_g, meal.createdAt]);
      }
      const liveMeal = await txn.getFirstAsync<ExportMeal>('SELECT * FROM meals WHERE id = ?', [inserted.lastInsertRowId]);
      const foods = await txn.getAllAsync<FoodLog>('SELECT * FROM food_logs WHERE meal_id = ? ORDER BY id', [inserted.lastInsertRowId]);
      if (!liveMeal || !foods.length) throw new Error('An imported meal could not be verified.');
      await writeCsvRecordLink(txn, { record_type: 'meal', source_id: meal.sourceId,
        meal_id: inserted.lastInsertRowId, food_log_id: null, weight_log_id: null,
        original_row_json: JSON.stringify(meal.originalRow), native_fingerprint: fingerprintMeal(liveMeal, foods) });
      result.mealsAdded += 1;
      importedMealDates.add(meal.logDate);
      progress();
    }
    const existingWeightIds = new Set(state.weights.map((row) => row.id));
    const weightSourceIds = new Set(mode === 'merge' ? state.links.filter((link) => link.record_type === 'weight'
      && link.weight_log_id != null && existingWeightIds.has(link.weight_log_id)).map((link) => link.source_id) : []);
    for (const weight of parsed.weights) {
      if (weightDates.has(weight.logDate) || weightSourceIds.has(weight.sourceId)) {
        result.weightsSkipped += 1;
        progress();
        continue;
      }
      const measuredAt = parseLocalISO(weight.logDate);
      measuredAt.setHours(12, 0, 0, 0);
      const inserted = await txn.runAsync(`INSERT INTO weight_logs
        (log_date, scale_weight_kg, trend_weight_kg, origin, measured_at, revision)
        VALUES (?, ?, ?, 'eatlog', ?, 1)`,
      [weight.logDate, weight.kilograms, weight.kilograms, measuredAt.toISOString()]);
      await writeCsvRecordLink(txn, { record_type: 'weight', source_id: weight.sourceId,
        meal_id: null, food_log_id: null, weight_log_id: inserted.lastInsertRowId,
        original_row_json: null, native_fingerprint: null });
      weightDates.add(weight.logDate);
      weightSourceIds.add(weight.sourceId);
      result.weightsAdded += 1;
      progress();
    }
    if (result.weightsAdded || mode === 'replace') {
      const weights = await txn.getAllAsync<WeightLog>('SELECT * FROM weight_logs ORDER BY log_date');
      for (const reading of computeWeightTrend(weights.map((row) => ({ logDate: row.log_date, scaleWeightKg: row.scale_weight_kg })))) {
        await txn.runAsync('UPDATE weight_logs SET trend_weight_kg = ? WHERE log_date = ?', [reading.trendWeightKg, reading.logDate]);
      }
    }
    if (mode === 'merge' && (result.mealsAdded || result.weightsAdded)) {
      await txn.execAsync("UPDATE adaptive_reviews SET status = 'superseded', resolved_at = datetime('now', 'localtime') WHERE status = 'pending';");
      for (const date of importedMealDates) {
        await txn.runAsync('DELETE FROM adaptive_intake_day_confirmations WHERE log_date = ?', [date]);
      }
    }
    const integrity = await txn.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
    const foreignKeys = await txn.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
    if (integrity?.integrity_check !== 'ok' || foreignKeys.length) throw new Error('CSV import verification failed. No history was changed.');
  });
  return result;
}
