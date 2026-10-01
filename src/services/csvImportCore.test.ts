import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { migrateDatabase } from '../db/databaseMigrations';
import { createSyntheticSchemaV4Fixture } from '../db/testFixtures/schemaV4';
import { csv } from '../utils/csv';
import { computeWeightTrend } from '../utils/weightTrend';
import { applyCsvImport, inspectCsvAgainstDatabase, type CsvDatabase, type CsvTransactionalDatabase } from './csvImportCore';
import { MACRO_CSV_COLUMNS, type MacroCsvRow } from './macroCsv.types';
import { parseMacroCsv } from './macroCsv';
import { buildMacroCsv } from './macroCsvExport';
import type { DailyTarget, ExportMeal, FoodLog, Profile, WeightLog } from '../db/database';
import type { CsvRecordLink } from './csvRecordIdentity';
import { foodResultFromLog } from './foodSearchCore';
import { toEditable } from '../utils/mealReview';
import { recordedPortionValues } from '../utils/recordedPortion';

class NodeCsvDatabase implements CsvTransactionalDatabase {
  failFoodInsert = false;
  constructor(readonly db: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.db.exec(sql); }
  async runAsync(sql: string, params: (string | number | null)[]) {
    if (this.failFoodInsert && sql.includes('INSERT INTO food_logs')) throw new Error('Synthetic write failure');
    const result = this.db.prepare(sql).run(...params);
    return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
  }
  async getFirstAsync<T>(sql: string, params: (string | number | null)[] = []): Promise<T | null> {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, params: (string | number | null)[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params).map(row => ({ ...row })) as T[];
  }
  async withExclusiveTransactionAsync(task: (txn: CsvDatabase) => Promise<void>): Promise<void> {
    this.db.exec('BEGIN EXCLUSIVE');
    try { await task(this); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}

async function fixture(): Promise<NodeCsvDatabase> {
  const db = new DatabaseSync(':memory:');
  createSyntheticSchemaV4Fixture(db);
  const adapter = new NodeCsvDatabase(db);
  await migrateDatabase(adapter);
  db.exec('PRAGMA foreign_keys = ON');
  return adapter;
}

function makeText(overrides: Partial<MacroCsvRow> = {}, weights = true): string {
  const row = (fields: Partial<MacroCsvRow>) => MACRO_CSV_COLUMNS.map(key => fields[key] ?? '');
  return csv([[...MACRO_CSV_COLUMNS],
    row({ record_type: 'meta', payload_json: JSON.stringify({ user: { unitSystem: 'metric' } }) }),
    row({ record_type: 'meal', id: 'macro-synthetic', name: "McDonald's café, bowl",
      calories: '200', protein: '10', carbs: '30', fats: '4', created_at: '2026-08-02T07:30:00Z',
      ingredients_json: '[]', payload_json: '{}', ...overrides }),
    ...(weights ? [row({ record_type: 'weight', id: 'synthetic-conflict', date: '2026-07-29', weight: '75' }),
      row({ record_type: 'weight', id: 'synthetic-new', date: '2026-08-02', weight: '70' })] : []),
  ]);
}

async function preview(db: NodeCsvDatabase, text = makeText()) {
  return inspectCsvAgainstDatabase(db, 'synthetic.csv', text, parseMacroCsv(text, 'Asia/Manila', 'macro-wall-clock'));
}

async function history(db: NodeCsvDatabase) {
  const tables = ['profile', 'daily_targets', 'food_logs', 'meals', 'weight_logs', 'adaptive_reviews',
    'adaptive_intake_day_confirmations', 'health_connect_state', 'health_connect_weight_exports', 'csv_record_links'];
  return Object.fromEntries(await Promise.all(tables.map(async table => [table, await db.getAllAsync(`SELECT * FROM ${table}`)])));
}

test('merge preserves profile, targets, existing weights and meals; repeated IDs and changed sources never duplicate', async () => {
  const db = await fixture();
  try {
    const before = await history(db);
    const p = await preview(db);
    assert.equal(p.conflictingWeights, 1);
    assert.deepEqual(await applyCsvImport(db, p, 'merge'), { mealsAdded: 1, mealsSkipped: 0, weightsAdded: 1, weightsSkipped: 1 });
    const after = await history(db);
    assert.deepEqual(after.profile, before.profile);
    assert.deepEqual(after.daily_targets, before.daily_targets);
    assert.equal(await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM meals').then(row => row!.count), 2);
    const log = await db.getFirstAsync<FoodLog>("SELECT * FROM food_logs WHERE name = ?", ["McDonald's café, bowl"]);
    assert.equal(log?.log_date, '2026-08-02');
    assert.equal(log?.logged_at, '2026-08-01T23:30:00.000Z');
    assert.equal(log?.meal, 'breakfast');
    assert.equal(log?.calories, 200);
    assert.equal((await db.getFirstAsync<WeightLog>("SELECT * FROM weight_logs WHERE log_date = '2026-07-29'"))?.scale_weight_kg, 65);
    const repeated = await preview(db);
    assert.equal(repeated.duplicateMeals, 1);
    assert.deepEqual(await applyCsvImport(db, repeated, 'merge'), { mealsAdded: 0, mealsSkipped: 1, weightsAdded: 0, weightsSkipped: 2 });
    const changed = await preview(db, makeText({ calories: '500' }));
    assert.equal(changed.changedSourceMeals, 1);
    await applyCsvImport(db, changed, 'merge');
    assert.equal((await db.getFirstAsync<FoodLog>("SELECT * FROM food_logs WHERE name = ?", ["McDonald's café, bowl"]))?.calories, 200);
  } finally { db.db.close(); }
});

test('replace only clears history and derived reviews, pauses sync, preserves profile and all target history', async () => {
  const db = await fixture();
  try {
    db.db.exec("UPDATE health_connect_state SET enabled = 1; INSERT INTO health_connect_weight_exports VALUES ('2026-07-01','existing','remote',1,0);");
    const before = await history(db);
    const p = await preview(db);
    const result = await applyCsvImport(db, p, 'replace');
    assert.deepEqual(result, { mealsAdded: 1, mealsSkipped: 0, weightsAdded: 2, weightsSkipped: 0 });
    const after = await history(db);
    assert.deepEqual(after.profile, before.profile);
    assert.deepEqual(after.daily_targets, before.daily_targets);
    assert.equal((after.meals as unknown[]).length, 1);
    assert.equal((after.food_logs as unknown[]).length, 1);
    assert.deepEqual(after.adaptive_reviews, []);
    assert.deepEqual(after.adaptive_intake_day_confirmations, []);
    assert.deepEqual(after.health_connect_weight_exports, []);
    assert.deepEqual(after.health_connect_state, [{ id: 1, enabled: 0, last_sync_at: null }]);
    const weights = await db.getAllAsync<WeightLog>('SELECT * FROM weight_logs ORDER BY log_date');
    const expected = computeWeightTrend(weights.map(row => ({ logDate: row.log_date, scaleWeightKg: row.scale_weight_kg })));
    assert.deepEqual(weights.map(row => row.trend_weight_kg), expected.map(row => row.trendWeightKg));
    assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'), []);
  } finally { db.db.close(); }
});

test('merge skips whole occupied days across source IDs and sections, but imports every meal on empty days', async () => {
  const db = await fixture();
  try {
    const meals: Partial<MacroCsvRow>[] = [
      { id: 'other-app-breakfast', created_at: '2026-07-30T08:00:00Z' },
      { id: 'other-app-dinner', created_at: '2026-07-30T18:00:00Z' },
      { id: 'standalone-day-snack', created_at: '2026-07-31T15:00:00Z' },
      { id: 'new-day-breakfast', created_at: '2026-08-02T08:00:00Z' },
      { id: 'new-day-lunch', created_at: '2026-08-02T12:00:00Z' },
      // A weight alone does not block meals on that day.
      { id: 'weight-only-day', created_at: '2026-07-29T04:00:00Z' },
    ];
    const text = csv([[...MACRO_CSV_COLUMNS], ...meals.map(fields => MACRO_CSV_COLUMNS.map(key => ({
      record_type: 'meal', name: 'Synthetic incoming meal', calories: '200', protein: '10',
      carbs: '30', fats: '4', ingredients_json: '[]', payload_json: '{}', ...fields,
    } as Partial<MacroCsvRow>)[key] ?? ''))]);
    for (const date of ['2026-07-30', '2026-07-31', '2026-08-02']) {
      await db.runAsync("INSERT INTO adaptive_intake_day_confirmations (log_date, status, confirmation_source, confirmed_at) VALUES (?, 'complete', 'adaptive_review', ?)",
        [date, '2026-08-03T00:00:00Z']);
    }
    const before = await history(db);
    const p = await preview(db, text);
    assert.equal(p.duplicateMeals, 3);
    assert.deepEqual(await applyCsvImport(db, p, 'merge'),
      { mealsAdded: 3, mealsSkipped: 3, weightsAdded: 0, weightsSkipped: 0 });
    assert.deepEqual(await db.getAllAsync('SELECT * FROM meals WHERE id = 11'),
      (before.meals as ExportMeal[]).filter(meal => meal.id === 11));
    assert.deepEqual(await db.getAllAsync('SELECT * FROM food_logs WHERE id IN (21, 22)'), before.food_logs);
    assert.deepEqual(await db.getAllAsync('SELECT meal_type FROM meals WHERE log_date = ? ORDER BY id', ['2026-08-02']),
      [{ meal_type: 'breakfast' }, { meal_type: 'lunch' }]);
    assert.deepEqual(await db.getAllAsync('SELECT log_date FROM adaptive_intake_day_confirmations ORDER BY log_date'),
      [{ log_date: '2026-07-30' }, { log_date: '2026-07-31' }]);
    assert.equal((await preview(db, text)).duplicateMeals, 6);
    assert.equal((await applyCsvImport(db, await preview(db, text), 'merge')).mealsAdded, 0);
  } finally { db.db.close(); }
});

test('merge rechecks occupied days after preview and replace still imports those days', async () => {
  const db = await fixture();
  try {
    const p = await preview(db, makeText({}, false));
    assert.equal(p.duplicateMeals, 0);
    await db.runAsync('UPDATE food_logs SET log_date = ? WHERE id = ?', ['2026-08-02', 22]);
    const before = await history(db);
    assert.deepEqual(await applyCsvImport(db, p, 'merge'),
      { mealsAdded: 0, mealsSkipped: 1, weightsAdded: 0, weightsSkipped: 0 });
    assert.deepEqual(await history(db), before);
    const refreshed = await preview(db, makeText({}, false));
    assert.equal(refreshed.duplicateMeals, 1);
    assert.equal((await applyCsvImport(db, refreshed, 'replace')).mealsAdded, 1);
  } finally { db.db.close(); }
});

test('a write failure rolls back replacement, including provenance, reviews, targets and sync state', async () => {
  const db = await fixture();
  try {
    const p = await preview(db);
    const before = await history(db);
    db.failFoodInsert = true;
    await assert.rejects(applyCsvImport(db, p, 'replace'), /Synthetic write failure/);
    assert.deepEqual(await history(db), before);
  } finally { db.db.close(); }
});

test('a late weight failure rolls back previously inserted meals and replacement deletes', async () => {
  const db = await fixture();
  try {
    const p = await preview(db);
    const before = await history(db);
    db.db.exec(`CREATE TRIGGER fail_import_weight BEFORE INSERT ON weight_logs
      WHEN NEW.log_date = '2026-08-02' BEGIN SELECT RAISE(ABORT, 'Synthetic late weight failure'); END;`);
    await assert.rejects(applyCsvImport(db, p, 'replace'), /Synthetic late weight failure/);
    assert.deepEqual(await history(db), before);
  } finally { db.db.close(); }
});

test('failed final integrity verification rolls back the whole import', async () => {
  const db = await fixture();
  try {
    const p = await preview(db);
    const before = await history(db);
    const originalGetFirst = db.getFirstAsync.bind(db);
    db.getFirstAsync = async <T>(sql: string, params: (string | number | null)[] = []): Promise<T | null> =>
      sql === 'PRAGMA integrity_check' ? { integrity_check: 'Synthetic verification failure' } as T
        : originalGetFirst<T>(sql, params);
    await assert.rejects(applyCsvImport(db, p, 'replace'), /verification failed/);
    assert.deepEqual(await history(db), before);
  } finally { db.db.close(); }
});

test('replacement refuses stale previews while merge rechecks live conflicts inside its transaction', async () => {
  const db = await fixture();
  try {
    const p = await preview(db);
    await db.runAsync("UPDATE food_logs SET calories = ? WHERE id = ?", [999, 21]);
    const before = await history(db);
    await assert.rejects(applyCsvImport(db, p, 'replace'), /history changed/);
    assert.deepEqual(await history(db), before);
    await applyCsvImport(db, p, 'merge');
    assert.equal((await db.getFirstAsync<FoodLog>('SELECT * FROM food_logs WHERE id = 21'))?.calories, 999);
  } finally { db.db.close(); }
});

test('deleting imported rows releases provenance and permits intentional later reimport', async () => {
  const db = await fixture();
  try {
    await applyCsvImport(db, await preview(db), 'merge');
    const link = await db.getFirstAsync<CsvRecordLink>("SELECT * FROM csv_record_links WHERE source_id = 'macro-synthetic'");
    await db.runAsync('DELETE FROM food_logs WHERE meal_id = ?', [link!.meal_id]);
    await db.runAsync('DELETE FROM meals WHERE id = ?', [link!.meal_id]);
    assert.equal(await db.getFirstAsync('SELECT * FROM csv_record_links WHERE source_id = ?', ['macro-synthetic']), null);
    assert.equal((await applyCsvImport(db, await preview(db), 'merge')).mealsAdded, 1);
  } finally { db.db.close(); }
});

test('real database import, export, and parse preserve totals, identity, timestamps and original detailed ingredients', async () => {
  const db = await fixture();
  try {
    const payload = JSON.stringify({ ingredientsDetailed: [{ id: 'ingredient-1', name: 'Synthetic rice', quantity: 100, unit: 'g',
      compatibleUnits: ['g'], perServing: { calories: 1, protein: 0.1, carbs: 0.2, fats: 0.01 } }] });
    // Source detail disagrees with meal totals and must remain available only for re-export.
    const text = makeText({ payload_json: payload });
    await applyCsvImport(db, await preview(db, text), 'replace');
    const result = buildMacroCsv({
      profile: await db.getFirstAsync<Profile>('SELECT * FROM profile'),
      meals: await db.getAllAsync<ExportMeal>('SELECT * FROM meals ORDER BY id'),
      foods: await db.getAllAsync<FoodLog>('SELECT * FROM food_logs ORDER BY id'),
      weights: await db.getAllAsync<WeightLog>('SELECT * FROM weight_logs ORDER BY log_date'),
      currentTarget: await db.getFirstAsync<DailyTarget>('SELECT * FROM daily_targets ORDER BY id DESC LIMIT 1'),
      links: await db.getAllAsync<CsvRecordLink>('SELECT * FROM csv_record_links'),
    }, { timezone: 'Asia/Manila', createId: () => 'unexpected-new-id' });
    assert.equal(result.newLinks.length, 0);
    const reparsed = parseMacroCsv(result.text, 'Asia/Manila');
    assert.equal(reparsed.meals[0].sourceId, 'macro-synthetic');
    assert.equal(reparsed.meals[0].logDate, '2026-08-02');
    assert.equal(reparsed.meals[0].components[0].calories, 200);
    assert.equal(JSON.parse(reparsed.meals[0].originalRow.payload_json).ingredientsDetailed[0].quantity, 100);
    assert.equal((await preview(db, result.text)).duplicateMeals, 1);
  } finally { db.db.close(); }
});

test('empty imports cannot erase history', async () => {
  const db = await fixture();
  try {
    const text = csv([[...MACRO_CSV_COLUMNS]]);
    const before = await history(db);
    await assert.rejects(applyCsvImport(db, await preview(db, text), 'replace'), /no meal or weight/);
    assert.deepEqual(await history(db), before);
  } finally { db.db.close(); }
});

test('unmarked meal imports require source selection before merge or replacement writes', async () => {
  const db = await fixture();
  try {
    const text = makeText();
    const p = await inspectCsvAgainstDatabase(db, 'synthetic.csv', text, parseMacroCsv(text, 'Asia/Manila'));
    const before = await history(db);
    for (const mode of ['merge', 'replace'] as const) {
      await assert.rejects(applyCsvImport(db, p, mode), /Choose which app/);
      assert.deepEqual(await history(db), before);
    }
  } finally { db.db.close(); }
});

test('legacy export uses the corrected local day for merge conflicts and survives replacement and re-export', async () => {
  const db = await fixture();
  try {
    const text = readFileSync(new URL('./testFixtures/legacyEatlog.csv', import.meta.url), 'utf8');
    const parsed = parseMacroCsv(text, 'Asia/Manila', 'eatlog-utc');
    await db.runAsync('UPDATE food_logs SET log_date = ? WHERE id = ?', ['2026-06-17', 22]);
    const p = await inspectCsvAgainstDatabase(db, 'legacy.csv', text, parsed);
    assert.equal(p.duplicateMeals, 1);
    const before = await history(db);
    assert.deepEqual(await applyCsvImport(db, p, 'merge'), { mealsAdded: 0, mealsSkipped: 1, weightsAdded: 0, weightsSkipped: 0 });
    assert.deepEqual(await history(db), before);
    assert.equal((await applyCsvImport(db, p, 'replace')).mealsAdded, 1);
    const meals = await db.getAllAsync<ExportMeal>('SELECT * FROM meals');
    const foods = await db.getAllAsync<FoodLog>('SELECT * FROM food_logs');
    assert.equal(meals[0].log_date, '2026-06-17');
    assert.equal(meals[0].meal_type, 'breakfast');
    assert.equal(foods[0].log_date, '2026-06-17');
    assert.equal(foods[0].meal, 'breakfast');
    assert.equal(foods[0].logged_at, '2026-06-16T23:30:00.000Z');
    const exported = buildMacroCsv({ profile: null, currentTarget: null, meals, foods, weights: [],
      links: await db.getAllAsync<CsvRecordLink>('SELECT * FROM csv_record_links') },
    { timezone: 'Asia/Manila', createId: () => { throw new Error('Must preserve identity'); } });
    const restored = parseMacroCsv(exported.text, 'Asia/Manila');
    assert.equal(restored.timestampFormatSource, 'metadata');
    assert.deepEqual(restored.meals.map(row => [row.logDate, row.mealType, row.createdAt]),
      parsed.meals.map(row => [row.logDate, row.mealType, row.createdAt]));
  } finally { db.db.close(); }
});

test('counted ingredients retain actual units through database import, review persistence and edited export', async () => {
  const db = await fixture();
  try {
    const text = makeText({ calories: '170', protein: '12', carbs: '2', fats: '11', payload_json: JSON.stringify({
      ingredientsDetailed: [{ id: 'eggs', name: 'Synthetic egg', quantity: 2, unit: 'piece', compatibleUnits: ['piece'],
        perServing: { calories: 85, protein: 6, carbs: 1, fats: 5.5 } }],
    }) }, false);
    await applyCsvImport(db, await preview(db, text), 'replace');
    const log = (await db.getFirstAsync<FoodLog>('SELECT * FROM food_logs'))!;
    assert.equal(log.grams_logged, null);
    assert.equal(log.portion_quantity, 2);
    assert.equal(log.portion_unit, 'piece');
    const component = toEditable(foodResultFromLog(log, 'edit-counted'));
    const saved = recordedPortionValues(component.food, component.selection, component.per100g);
    assert.equal(saved.grams_logged, null);
    assert.equal(saved.calories_per_100g, null);
    assert.equal(saved.portion_quantity, 2);
    assert.equal(saved.calories, 170);
    const renamed = { ...log, name: 'Renamed synthetic egg', ...saved };
    const exported = buildMacroCsv({ profile: null, currentTarget: null, meals: await db.getAllAsync<ExportMeal>('SELECT * FROM meals'),
      foods: [renamed], weights: [], links: await db.getAllAsync<CsvRecordLink>('SELECT * FROM csv_record_links') },
    { timezone: 'Asia/Manila', createId: () => 'unused' });
    const parsed = parseMacroCsv(exported.text, 'Asia/Manila');
    assert.equal(parsed.meals[0].components[0].portion_quantity, 2);
    assert.equal(parsed.meals[0].components[0].portion_unit, 'piece');
    assert.equal(parsed.meals[0].components[0].grams_logged, null);
    assert.equal(parsed.meals[0].components[0].calories, 170);
  } finally { db.db.close(); }
});

test('known gram ingredient precision survives database import and opening the meal editor', async () => {
  const db = await fixture();
  try {
    const text = makeText({ calories: '100', protein: '5', carbs: '15', fats: '2', payload_json: JSON.stringify({
      ingredientsDetailed: [{ name: 'Synthetic rice', quantity: 73.25, unit: 'g',
        perServing: { calories: 100.4 / 73.25, protein: 4.6 / 73.25, carbs: 15.4 / 73.25, fats: 1.6 / 73.25 } }],
    }) }, false);
    await applyCsvImport(db, await preview(db, text), 'replace');
    const log = (await db.getFirstAsync<FoodLog>('SELECT * FROM food_logs'))!;
    const component = toEditable(foodResultFromLog(log, 'edit-grams'));
    const saved = recordedPortionValues(component.food, component.selection, component.per100g);
    for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const) {
      assert.ok(Math.abs(saved[key] - log[key]) < 1e-10, `Nutrition precision lost for ${key}`);
    }
    assert.equal(saved.grams_logged, 73.25);
  } finally { db.db.close(); }
});
