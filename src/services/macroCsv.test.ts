import assert from 'node:assert/strict';
import test from 'node:test';
import { csv } from '../utils/csv';
import { parseMacroCsv } from './macroCsv';
import { MACRO_CSV_COLUMNS, type MacroCsvRow } from './macroCsv.types';

const meal = (changes: Partial<MacroCsvRow> = {}): Partial<MacroCsvRow> => ({
  record_type: 'meal', id: 'meal-1', name: "McDonald's, 豆腐\nplate", calories: '100',
  protein: '5', carbs: '15', fats: '2', created_at: '2026-06-17T23:30:00Z',
  ingredients_json: '["豆腐"]', payload_json: JSON.stringify({ ingredientsDetailed: [
    { name: '豆腐', quantity: 50, unit: 'g', perServing: { calories: 2, protein: .1, carbs: .3, fats: .04 } },
  ] }), ...changes,
});
const meta = (units = 'metric'): Partial<MacroCsvRow> => ({ record_type: 'meta',
  payload_json: JSON.stringify({ user: { unitSystem: units } }) });
const file = (...rows: Partial<MacroCsvRow>[]) => csv([
  [...MACRO_CSV_COLUMNS], ...rows.map(row => MACRO_CSV_COLUMNS.map(key => row[key] ?? '')),
]);

test('quoted multiline Unicode and BOM preserve identity, exact nutrition and local date', () => {
  const parsed = parseMacroCsv('\uFEFF' + file(meta(), meal()), 'Asia/Manila');
  const item = parsed.meals[0];
  assert.equal(item.name, "McDonald's, 豆腐\nplate");
  assert.equal(item.logDate, '2026-06-18');
  assert.equal(item.mealType, 'breakfast');
  assert.equal(item.detailFallback, false);
  assert.equal(item.components[0].grams_logged, 50);
  assert.equal(item.components[0].calories_per_100g, 200);
  assert.equal(item.components[0].protein_g, 5);
  assert.equal(item.components[0].serving_size_g, null);
  assert.equal(item.components[0].serving_label, null);
  assert.equal(parsed.dateStart, '2026-06-18');
  assert.deepEqual(parseMacroCsv(file(meta(), item.originalRow), 'Asia/Manila').meals[0].components, item.components);
});

test('small ingredient rounding is reconciled and unknown units get no gram conversion', () => {
  const row = meal({ calories: '100.5', protein: '5.05', payload_json: JSON.stringify({ ingredientsDetailed: [
    { name: 'Egg', quantity: 2, unit: 'piece', perServing: { calories: 50, protein: 2.5, carbs: 7.5, fats: 1 } },
  ] }) });
  const item = parseMacroCsv(file(row), 'UTC').meals[0];
  assert.equal(item.detailFallback, false);
  assert.equal(item.components[0].calories, 100.5);
  assert.equal(item.components[0].protein_g, 5.05);
  assert.equal(item.components[0].grams_logged, null);
});

test('whole-number Macro totals accept only the recorded rounding result', () => {
  const detail = { name: 'Egg', quantity: 1, unit: 'piece', perServing:
    { calories: 100.4, protein: 4.6, carbs: 15.4, fats: 1.6 } };
  const row = meal({ payload_json: JSON.stringify({ ingredientsDetailed: [detail] }) });
  const item = parseMacroCsv(file(row), 'UTC').meals[0];
  assert.equal(item.detailFallback, false);
  assert.equal(item.components[0].calories, 100);
  assert.equal(item.components[0].protein_g, 5);
  assert.equal(item.components[0].carbs_g, 15);
  assert.equal(item.components[0].fat_g, 2);
  assert.equal(JSON.parse(item.originalRow.payload_json).ingredientsDetailed[0].perServing.protein, 4.6);
  detail.perServing.protein = 4.5;
  assert.equal(parseMacroCsv(file(meal({ payload_json: JSON.stringify({ ingredientsDetailed: [detail] }) })), 'UTC').meals[0].detailFallback, false);
  detail.perServing.protein = 5.5;
  assert.equal(parseMacroCsv(file(meal({ payload_json: JSON.stringify({ ingredientsDetailed: [detail] }) })), 'UTC').meals[0].detailFallback, true);
  detail.perServing.protein = 0;
  assert.equal(parseMacroCsv(file(meal({ payload_json: JSON.stringify({ ingredientsDetailed: [detail] }) })), 'UTC').meals[0].detailFallback, true);
});

test('malformed or inconsistent optional details fall back without losing totals', () => {
  for (const payload_json of ['bad JSON', '{}', meal().payload_json!]) {
    const parsed = parseMacroCsv(file(meal({ calories: '200', payload_json })), 'UTC');
    assert.equal(parsed.detailFallbacks, 1);
    assert.equal(parsed.meals[0].components[0].calories, 200);
    assert.equal(parsed.meals[0].components[0].grams_logged, undefined);
  }
});

test('original data strips images, questions and arbitrary payload keys', () => {
  const payload = JSON.parse(meal().payload_json!);
  payload.secret = 'must disappear';
  payload.ingredientsDetailed[0].photo = 'file:///private';
  payload.ingredientsDetailed[0].id = 'component-1';
  payload.ingredientsDetailed[0].compatibleUnits = ['g', 'piece'];
  payload.barcodeMeta = { source: 'barcode', servingAmount: 2, servingReference: 'per serving', servingsPerPackage: 4,
    servingUnit: 'piece', perServing: { calories: 50, protein: 2.5, carbs: 7.5, fats: 1 }, secret: 'hidden' };
  const row = parseMacroCsv(file(meal({ image_uri: 'file:///private', payload_json: JSON.stringify(payload),
    ai_needs_clarification: 'true', ai_clarification_question: 'private', ai_clarification_used: 'false' })), 'UTC').meals[0].originalRow;
  assert.equal(row.image_uri, '');
  assert.equal(row.ai_clarification_question, '');
  assert.equal(row.ai_needs_clarification, 'true');
  assert.equal(row.payload_json.includes('secret'), false);
  assert.equal(row.payload_json.includes('private'), false);
  assert.equal(JSON.parse(row.payload_json).barcodeMeta.servingAmount, 2);
  assert.equal(JSON.parse(row.payload_json).barcodeMeta.servingReference, 'per serving');
  assert.equal(JSON.parse(row.payload_json).barcodeMeta.servingsPerPackage, 4);
  assert.equal(JSON.parse(row.payload_json).ingredientsDetailed[0].id, 'component-1');
  assert.deepEqual(JSON.parse(row.payload_json).ingredientsDetailed[0].compatibleUnits, ['g', 'piece']);
});

test('metric and imperial weights require explicit metadata and valid calendar dates', () => {
  const weight = { record_type: 'weight', id: 'w1', date: '2026-06-17', weight: '200' };
  assert.equal(parseMacroCsv(file(meta('imperial'), weight), 'UTC').weights[0].kilograms, 90.718474);
  assert.equal(parseMacroCsv(file(meta(), { ...weight, weight: '80' }), 'UTC').weights[0].kilograms, 80);
  assert.throws(() => parseMacroCsv(file(weight), 'UTC'), /Row 2.*metadata/);
  assert.throws(() => parseMacroCsv(file(meta(), { ...weight, date: '2026-02-30' }), 'UTC'), /Row 3.*date/);
  assert.throws(() => parseMacroCsv(file(meta(), { ...weight, weight: '3' }), 'UTC'), /30.*300/);
});

test('required malformed data rejects the file with row-number errors', () => {
  for (const change of [{ calories: '' }, { protein: '-1' }, { fats: 'Infinity' },
    { created_at: '2026-02-30T00:00:00Z' }, { created_at: '2026-06-17T00:00:00' },
    { id: '' }, { name: ' ' }, { record_type: 'other' }]) {
    assert.throws(() => parseMacroCsv(file(meal(change)), 'UTC'), /Row 2:/);
  }
  assert.throws(() => parseMacroCsv(file(meal(), meal()), 'UTC'), /Row 3: duplicate/);
  assert.throws(() => parseMacroCsv(file(meal()).replace('"McDonald', '""McDonald'), 'UTC'), /invalid CSV quoting/);
  assert.throws(() => parseMacroCsv(file(meal()), 'Not/AZone'), /timezone/);
  assert.throws(() => parseMacroCsv('wrong,header\n', 'UTC'), /header/);
});

test('LF files and meal boundaries infer the expected meal slot', () => {
  for (const [hour, expected] of [[4, 'snack'], [5, 'breakfast'], [10, 'breakfast'],
    [11, 'lunch'], [15, 'lunch'], [16, 'dinner'], [21, 'dinner'], [22, 'snack']] as const) {
    const source = file(meal({ name: 'Egg', created_at: `2026-06-17T${String(hour).padStart(2, '0')}:00:00Z` })).replace(/\r\n/g, '\n');
    assert.equal(parseMacroCsv(source, 'UTC').meals[0].mealType, expected);
  }
});
