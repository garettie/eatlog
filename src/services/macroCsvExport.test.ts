import assert from 'node:assert/strict';
import test from 'node:test';
import type { FoodLog } from '../db/database';
import { buildMacroCsv, exportMealTimestamp, type MacroExportSnapshot } from './macroCsvExport';
import { parseMacroCsv } from './macroCsv';

const food: FoodLog = { id: 1, log_date: '2026-06-17', name: 'Egg, boiled', source: 'manual', source_food_id: null, meal: 'lunch', meal_id: 2, brand: null, data_type: null, preparation: null, grams_logged: 100, serving_size_g: null, serving_label: null, calories_per_100g: null, protein_g_per_100g: null, carbs_g_per_100g: null, fat_g_per_100g: null, calories: 155, protein_g: 13, carbs_g: 1, fat_g: 11, logged_at: '2026-06-17 04:00:00' };
function snapshot(): MacroExportSnapshot {
  return { profile: null, currentTarget: null, meals: [{ id: 2, name: 'Egg, "boiled"\nLunch', log_date: food.log_date, meal_type: 'lunch', created_at: food.logged_at }], foods: [{ ...food }], weights: [{ id: 3, log_date: food.log_date, scale_weight_kg: 60, trend_weight_kg: 60, origin: 'eatlog', origin_record_id: null, origin_data_source: null, origin_last_modified_at: null, measured_at: null, revision: 1, created_at: food.logged_at }], links: [] };
}
const options = () => { let n = 0; return { timezone: 'Asia/Manila', createId: () => `synthetic-${++n}` }; };

test('Macro export round trips grouped nutrition and metric weights with quoted names', () => {
  const output = buildMacroCsv(snapshot(), options());
  const parsed = parseMacroCsv(output.text, 'Asia/Manila');
  assert.equal(parsed.timestampFormatSource, 'metadata');
  assert.equal(parsed.timestampFormat, 'macro-wall-clock');
  assert.equal(parsed.meals.length, 1);
  assert.equal(parsed.weights[0].kilograms, 60);
  assert.equal(parsed.meals[0].name, 'Egg, "boiled"\nLunch');
  assert.equal(parsed.meals[0].components[0].calories, 155);
  assert.equal(parsed.meals[0].components[0].grams_logged, 100);
  assert.equal(parsed.meals[0].logDate, food.log_date);
  assert.equal(output.newLinks.length, 2);
  assert.ok(!output.text.includes('file://'));
});

test('stable IDs and preserved detail survive repeated exports, edits regenerate detail', () => {
  const data = snapshot();
  const first = buildMacroCsv(data, options());
  data.links = first.newLinks;
  const second = buildMacroCsv(data, { timezone: 'Asia/Manila', createId: () => { throw new Error('Should reuse IDs'); } });
  assert.equal(second.text, first.text);
  assert.deepEqual(second.newLinks, []);
  data.foods[0].calories = 200;
  const edited = parseMacroCsv(buildMacroCsv(data, options()).text, 'Asia/Manila');
  assert.equal(edited.meals[0].sourceId, 'synthetic-1');
  assert.equal(edited.meals[0].components[0].calories, 200);
  assert.equal(edited.detailFallbacks, 0);
});

test('unknown grams use one serving and standalone foods become meals', () => {
  const data = snapshot();
  data.foods[0].meal_id = null;
  data.foods[0].grams_logged = null;
  data.meals = [];
  const parsed = parseMacroCsv(buildMacroCsv(data, options()).text, 'Asia/Manila');
  assert.equal(parsed.meals.length, 1);
  assert.equal(parsed.meals[0].components[0].grams_logged, null);
  assert.equal(parsed.meals[0].components[0].protein_g, 13);
});

test('timestamps encode local diary clocks in Macro format and backdated entries use noon', () => {
  assert.equal(exportMealTimestamp('2026-06-17', '2026-06-16 23:30:00', 'Asia/Manila'), '2026-06-17T07:30:00.000Z');
  assert.equal(exportMealTimestamp('2026-06-17', '2026-09-01 23:30:00', 'Asia/Manila'), '2026-06-17T12:00:00.000Z');
  assert.equal(exportMealTimestamp('2026-03-08', 'invalid', 'America/New_York'), '2026-03-08T12:00:00.000Z');
});

test('every Eatlog meal section survives Macro export even when logged late or backdated', () => {
  for (const mealType of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
    for (const createdAt of ['2026-06-17T15:30:00Z', '2026-07-01 15:30:00']) {
      const data = snapshot();
      data.meals[0].meal_type = mealType;
      data.meals[0].created_at = createdAt;
      data.foods[0].meal = mealType;
      const exported = buildMacroCsv(data, options());
      for (const timezone of ['Asia/Manila', 'UTC', 'America/New_York']) {
        const imported = parseMacroCsv(exported.text, timezone).meals[0];
        assert.equal(imported.mealType, mealType);
        assert.equal(imported.logDate, data.meals[0].log_date);
      }
    }
  }
});

test('metadata stays metric regardless of display preferences and uses current targets', () => {
  const data = snapshot();
  data.profile = { id: 1, display_name: 'Synthetic', sex: 'female', height_cm: 160, birth_date: '1990-01-01', activity_level: 'moderate', goal_type: 'bulk', goal_rate_kg_per_week: 0.25, protein_preference: 'moderate', weight_unit: 'lb', target_weight_kg: 65, analytics_intro_dismissed: 1, share_branding_enabled: 1, created_at: food.logged_at };
  data.currentTarget = { id: 1, effective_date: '2026-06-17', tdee_estimate: 1800, target_calories: 2000, target_protein_g: 120, target_carbs_g: 250, target_fat_g: 60, calculation_method: 'manual', created_at: food.logged_at };
  const output = buildMacroCsv(data, options());
  assert.ok(output.text.includes('""unitSystem"":""metric""'));
  assert.ok(output.text.includes('""weight"":60'));
  assert.ok(output.text.includes('""dailyCalories"":2000'));
  assert.ok(output.text.includes('""goal"":""gain""'));
});

test('empty meals are skipped and future weights do not become current metadata', () => {
  const data = snapshot();
  data.meals.push({ id: 99, name: 'Empty', log_date: '2026-06-18', meal_type: 'dinner', created_at: food.logged_at });
  data.weights.push({ ...data.weights[0], id: 4, log_date: '2026-10-01', scale_weight_kg: 99 });
  const result = buildMacroCsv(data, { ...options(), today: '2026-06-17' });
  assert.equal(parseMacroCsv(result.text, 'Asia/Manila').meals.length, 1);
  assert.equal(result.newLinks.filter((link) => link.meal_id === 99).length, 0);
  assert.ok(result.text.includes('""weight"":60'));
  assert.ok(result.text.includes('""appStartDate"":""2026-06-17""'));
});

test('malformed restored detail regenerates safe ingredients', () => {
  const data = snapshot();
  data.links = buildMacroCsv(data, options()).newLinks;
  const stored = JSON.parse(data.links[0].original_row_json!);
  stored.payload_json = { secret: 'file:///private/path' };
  data.links[0].original_row_json = JSON.stringify(stored);
  const result = buildMacroCsv(data, options());
  assert.ok(!result.text.includes('file:///private/path'));
  assert.equal(parseMacroCsv(result.text, 'Asia/Manila').meals[0].components[0].grams_logged, 100);
});
