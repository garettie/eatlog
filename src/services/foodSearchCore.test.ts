import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFoodPortions,
  buildPersonalFoodResults,
  createQuickLogInput,
  expandFoodAliases,
  historyPinKey,
  loadUSDAFoodDetails,
  normalizeFoodName,
  parseOpenFoodFactsProducts,
  parseUSDAFoods,
  rankAndDeduplicateFoodResults,
  rewriteFoodProviderQuery,
  type FoodHistoryRecord,
} from './foodSearchCore';
import type { DataType, FoodResult } from './foodSearchTypes';

const nutrients = [
  { nutrientId: 1008, value: 100 },
  { nutrientId: 1003, value: 10 },
  { nutrientId: 1005, value: 12 },
  { nutrientId: 1004, value: 2 },
];

function food(overrides: Partial<FoodResult> & Pick<FoodResult, 'id' | 'name'>): FoodResult {
  const normalizedName = overrides.normalizedName ?? normalizeFoodName(overrides.name, overrides.brand ?? null).normalizedName;
  return {
    source: 'usda',
    sourceFoodId: overrides.id,
    dataType: 'Foundation',
    brand: null,
    preparation: null,
    normalizedName,
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbsPer100g: 12,
    fatPer100g: 2,
    portions: [{ id: '100-g', label: '100 g', grams: 100 }],
    defaultAmount: { kind: 'reference', grams: 100, servingId: null },
    alternateSourceIds: [],
    ...overrides,
  };
}

function history(overrides: Partial<FoodHistoryRecord> & Pick<FoodHistoryRecord, 'id' | 'name'>): FoodHistoryRecord {
  return {
    source: 'manual', source_food_id: null, brand: null, data_type: 'manual', preparation: null,
    grams_logged: 100, serving_size_g: null, serving_label: null,
    calories_per_100g: 100, protein_g_per_100g: 10, carbs_g_per_100g: 12, fat_g_per_100g: 2,
    calories: 100, protein_g: 10, carbs_g: 12, fat_g: 2,
    logged_at: `2026-08-${String(overrides.id).padStart(2, '0')} 12:00:00`,
    parent_meal_name: null, parent_photo_uri: null,
    legacy_food_key: `manual:${overrides.name.toLowerCase()}:`,
    ...overrides,
  };
}

test('common foods retain curated identity when a remote duplicate matches more closely', () => {
  const common = food({ id: 'common-rice', name: 'White Rice, cooked', sourceFoodId: '42', isCommonFood: true,
    aliases: ['steamed rice'], portions: [{ id: 'cup', label: '1 cup', grams: 158 }],
    defaultAmount: { kind: 'serving', grams: 158, servingId: 'cup' } });
  const remote = food({ id: 'remote-rice', name: 'Rice', sourceFoodId: '42' });
  for (const input of [[common, remote], [remote, common]]) {
    const result = rankAndDeduplicateFoodResults(input, 'rice').items;
    assert.equal(result.length, 1);
    assert.equal(result[0].name, common.name);
    assert.deepEqual(result[0].defaultAmount, common.defaultAmount);
    assert.deepEqual(result[0].portions, common.portions);
    assert.equal(result[0].isCommonFood, true);
  }
  assert.equal(rankAndDeduplicateFoodResults([common], 'steamed rice').items[0]?.id, common.id);
});

test('history survives a better matching common food or remote duplicate in either order', () => {
  const personal = buildPersonalFoodResults([history({ id: 1, name: 'My lunch rice', source: 'usda', source_food_id: '42' })], [])[0];
  for (const isCommonFood of [true, false]) {
    const duplicate = food({ id: 'rice', name: 'Rice', sourceFoodId: '42', isCommonFood,
      alternateSourceIds: [{ source: 'off', id: 'alternate' }] });
    for (const input of [[personal, duplicate], [duplicate, personal]]) {
      const result = rankAndDeduplicateFoodResults(input, 'rice').items[0];
      assert.equal(result.id, personal.id);
      assert.deepEqual(result.defaultAmount, personal.defaultAmount);
      assert.deepEqual(result.alternateSourceIds, [{ source: 'off', id: 'alternate' }]);
    }
  }
});

test('common foods win equal matches and repeated remote names leave room for other foods', () => {
  const common = food({ id: 'common', name: 'Rice', isCommonFood: true });
  const remote = food({ id: 'remote', name: 'Rice', caloriesPer100g: 300 });
  assert.equal(rankAndDeduplicateFoodResults([remote, common], 'rice').items[0].id, 'common');
  const variants = Array.from({ length: 5 }, (_, index) => food({
    id: String(index), name: 'Coca Cola', dataType: 'off', source: 'off',
    caloriesPer100g: 10 * (2 ** index),
  }));
  const other = food({ id: 'zero', name: 'Coca Cola Zero', caloriesPer100g: 0 });
  const result = rankAndDeduplicateFoodResults([...variants, other], 'coca cola', 'full').items;
  assert.equal(result.filter((item) => item.name === 'Coca Cola').length, 3);
  assert.ok(result.some((item) => item.id === 'zero'));
  assert.deepEqual(variants.map((item) => item.alternateSourceIds), [[], [], [], [], []]);
});

test('personal history outranks common foods, which outrank remote results', () => {
  const personal = buildPersonalFoodResults([history({ id: 1, name: 'Rice' })], [])[0];
  // Distinct macros keep the three rows out of one nutrition cluster.
  const common = food({ id: 'common-rice', name: 'Rice', sourceFoodId: '42', isCommonFood: true,
    caloriesPer100g: 130, proteinPer100g: 3, carbsPer100g: 28, fatPer100g: 0.3 });
  const remote = food({ id: 'remote-rice', name: 'Rice', sourceFoodId: '77', caloriesPer100g: 300 });
  const ids = rankAndDeduplicateFoodResults([remote, common, personal], 'rice').items.map((item) => item.id);
  assert.deepEqual(ids, [personal.id, common.id, remote.id]);
});

test('common foods open without a USDA detail request', async () => {
  const loader = async (): Promise<FoodResult | null> => { throw new Error('offline'); };
  const common = food({ id: 'common-rice', name: 'White Rice, cooked', isCommonFood: true });
  assert.equal(await loadUSDAFoodDetails(common, loader), common);
  await assert.rejects(loadUSDAFoodDetails(food({ id: '42', name: 'Rice' }), loader), /offline/);
});

test('parses supported USDA records with every valid household portion', () => {
  const types: DataType[] = ['Survey (FNDDS)', 'SR Legacy', 'Foundation', 'Branded'];
  const parsed = parseUSDAFoods(types.map((dataType, index) => ({
    fdcId: index + 1,
    description: `${dataType} egg, boiled`,
    additionalDescriptions: 'whole egg',
    dataType,
    brandOwner: dataType === 'Branded' ? 'Example Foods' : undefined,
    foodNutrients: nutrients,
    foodPortions: [
      { id: 1, gramWeight: 50, portionDescription: '1 egg' },
      { id: 2, gramWeight: 100, portionDescription: '2 eggs' },
    ],
  })));
  assert.deepEqual(parsed.map((item) => item.dataType), types);
  assert.deepEqual(parsed[0].portions.map((portion) => portion.label), ['1 egg', '2 eggs']);
  assert.deepEqual(parsed[0].defaultAmount, { kind: 'serving', grams: 50, servingId: 'usda-1' });
  assert.equal(parsed[3].brand, 'Example Foods');
});

test('parses Open Food Facts serving then 100 g and rejects incomplete macros', () => {
  const parsed = parseOpenFoodFactsProducts([
    {
      code: 'one', product_name: 'Example Toast', brands: 'Example', serving_quantity: '30', serving_size: '1 slice (30 g)',
      nutriments: { 'energy-kcal_100g': '250', proteins_100g: '8', carbohydrates_100g: '45', fat_100g: '4' },
    },
    { code: 'bad', product_name: 'Incomplete', nutriments: { 'energy-kcal_100g': 100, proteins_100g: 1, fat_100g: 0 } },
  ]);
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].portions.map((portion) => portion.grams), [30]);
  assert.deepEqual(parsed[0].defaultAmount, { kind: 'serving', grams: 30, servingId: 'off-serving' });
});

test('expands Filipino-English aliases bidirectionally and rewrites providers', () => {
  assert.ok(expandFoodAliases('grilled talong').includes('grilled eggplant'));
  assert.ok(expandFoodAliases('tokwa').includes('tofu'));
  assert.equal(rewriteFoodProviderQuery('kamote with malunggay'), 'sweet potato with moringa');
});

test('matches exact, prefix, all-token, plural, alias, and one-edit tiers', () => {
  const items = [
    food({ id: 'exact', name: 'Boiled Egg', normalizedName: 'boiled egg' }),
    food({ id: 'prefix', name: 'Boiled Egg Large', normalizedName: 'boiled egg large' }),
    food({ id: 'tokens', name: 'Egg, whole, boiled', normalizedName: 'egg whole boiled' }),
    food({ id: 'alias', name: 'Eggplant', normalizedName: 'eggplant' }),
  ];
  assert.equal(rankAndDeduplicateFoodResults(items, 'boiled egg').items[0].id, 'exact');
  assert.ok(rankAndDeduplicateFoodResults(items, 'boiled eggs').items.some((item) => item.id === 'tokens'));
  assert.equal(rankAndDeduplicateFoodResults(items, 'talong').items[0].id, 'alias');
  assert.equal(rankAndDeduplicateFoodResults([food({ id: 'chicken', name: 'Chicken breast' })], 'chikcen').items[0].id, 'chicken');
});

test('rejects multi-token candidates that match only one query token', () => {
  const result = rankAndDeduplicateFoodResults([
    food({ id: 'rice', name: 'White rice' }),
    food({ id: 'chicken-rice', name: 'Chicken with rice' }),
  ], 'chicken soup').items;
  assert.deepEqual(result, []);
});

test('history includes standalone, manual, and AI meal components with parent context', () => {
  const results = buildPersonalFoodResults([
    history({ id: 1, name: 'Apple', source: 'usda', source_food_id: '10', data_type: 'Foundation' }),
    history({ id: 2, name: 'Soup', source: 'manual', data_type: 'manual' }),
    history({
      id: 3, name: 'Rice', source: 'describe', data_type: 'describe',
      parent_meal_name: 'Chicken rice', parent_photo_uri: 'file:///meal.jpg',
    }),
  ], []);
  assert.equal(results.length, 3);
  const rice = results.find((item) => item.name === 'Rice');
  assert.equal(rice?.history?.parentMealName, 'Chicken rice');
  assert.equal(rice?.history?.parentMealPhotoUri, 'file:///meal.jpg');
});

test('groups exact provider identity without absorbing matching manual history', () => {
  const results = buildPersonalFoodResults([
    history({ id: 1, name: 'Rice old', source: 'usda', source_food_id: '123', data_type: 'Foundation' }),
    history({ id: 2, name: 'Rice new', source: 'usda', source_food_id: '123', data_type: 'Foundation', calories_per_100g: 180 }),
    history({ id: 3, name: 'Rice new', source: 'manual', source_food_id: null, data_type: 'manual', calories_per_100g: 180 }),
  ], []);
  assert.equal(results.length, 2);
  assert.equal(results.find((item) => item.source === 'usda')?.name, 'Rice new');
  assert.equal(results.find((item) => item.source === 'usda')?.history?.timesLogged, 2);
  assert.equal(results.find((item) => item.source === 'manual')?.history?.timesLogged, 1);
});

test('clusters at 20 percent, separates above boundary, and chooses newest row', () => {
  const results = buildPersonalFoodResults([
    history({ id: 1, name: 'Rice', calories_per_100g: 100 }),
    history({ id: 2, name: 'Rice', calories_per_100g: 125 }),
    history({ id: 3, name: 'Rice', calories_per_100g: 160 }),
  ], []);
  assert.equal(results.length, 2);
  const merged = results.find((item) => item.history?.timesLogged === 2);
  assert.equal(merged?.history?.representativeLogId, 2);
});

test('repeated AI foods share one history result despite case, portions, and estimate drift', () => {
  const results = buildPersonalFoodResults([
    history({ id: 1, name: 'White Rice', source: 'scan', data_type: 'scan', fat_g_per_100g: 0.1 }),
    history({ id: 2, name: 'WHITE RICE (200g)', source: 'scan', data_type: 'scan', grams_logged: 200,
      serving_label: '1 cup', serving_size_g: 160, fat_g_per_100g: 0.5 }),
    history({ id: 3, name: '1 cup white rice', source: 'describe', data_type: 'describe', grams_logged: 158,
      serving_label: '1 cup', serving_size_g: 158, calories_per_100g: 130, calories: 205 }),
  ], [historyPinKey('WHITE RICE (200g)', null, null)]);
  assert.equal(results.length, 1);
  const result = results[0];
  assert.equal(result.history?.timesLogged, 3);
  assert.equal(result.history?.representativeLogId, 3);
  assert.equal(result.defaultAmount.grams, 158);
  assert.equal(result.caloriesPer100g, 130);
  assert.equal(result.history?.calories, 205);
  assert.equal(result.isPinned, true);
  assert.ok(result.history?.legacyPinKeys.includes(historyPinKey('WHITE RICE (200g)', null, null)));
  assert.equal(rankAndDeduplicateFoodResults(results, 'white rice').items.length, 1);
});

test('a month of rice scans leaves online matches visible after history', () => {
  const personal = buildPersonalFoodResults(Array.from({ length: 30 }, (_, index) => history({
    id: index + 1,
    name: index % 2 ? 'White Rice' : 'WHITE RICE',
    source: 'scan',
    source_food_id: `scan-component-${index}`,
    fat_g_per_100g: index / 10,
    grams_logged: 100 + index * 10,
  })), []);
  const online = food({ id: 'online-rice', name: 'White rice', brand: 'Rice brand' });
  const results = rankAndDeduplicateFoodResults([...personal, online], 'white rice').items;
  assert.equal(results.length, 2);
  assert.equal(results[0].history?.timesLogged, 30);
  assert.equal(results[1].id, online.id);
});

test('AI history grouping preserves brands, preparations, and manual nutrition variants', () => {
  const results = buildPersonalFoodResults([
    history({ id: 1, name: 'White rice', source: 'scan', preparation: 'raw' }),
    history({ id: 2, name: 'White rice', source: 'scan', preparation: 'fried' }),
    history({ id: 3, name: 'White rice', source: 'scan', brand: 'Brand A' }),
    history({ id: 4, name: 'White rice', source: 'scan', brand: 'Brand B' }),
    history({ id: 5, name: 'White rice', source: 'scan' }),
    history({ id: 6, name: 'White rice', source: 'manual' }),
    history({ id: 7, name: '2% milk', source: 'scan' }),
    history({ id: 8, name: 'Milk', source: 'scan' }),
  ], []);
  assert.equal(results.length, 8);
});

test('derives per-100 g macros from absolute values and excludes unusable rows', () => {
  const results = buildPersonalFoodResults([
    history({
      id: 1, name: 'Rice', grams_logged: 200,
      calories_per_100g: null, protein_g_per_100g: null, carbs_g_per_100g: null, fat_g_per_100g: null,
      calories: 260, protein_g: 5.4, carbs_g: 56, fat_g: 0.6,
    }),
    history({
      id: 2, name: 'Unknown', grams_logged: null,
      calories_per_100g: null, protein_g_per_100g: null, carbs_g_per_100g: null, fat_g_per_100g: null,
    }),
  ], []);
  assert.equal(results.length, 1);
  assert.equal(results[0].caloriesPer100g, 130);
});

test('ranks personal, pin, frequency, then recency within lexical tier', () => {
  const pinnedKey = historyPinKey('Rice', null, 'boiled');
  const personal = buildPersonalFoodResults([
    history({ id: 1, name: 'Rice', preparation: 'boiled' }),
    history({ id: 2, name: 'Rice', preparation: 'boiled' }),
    history({ id: 3, name: 'Rice', preparation: 'fried', legacy_food_key: 'manual:rice-fried:' }),
  ], [pinnedKey]);
  const ranked = rankAndDeduplicateFoodResults([
    food({ id: 'remote', name: 'Rice', dataType: 'Survey (FNDDS)' }),
    ...personal,
  ], 'rice').items;
  assert.ok(ranked[0].history);
  assert.equal(ranked[0].isPinned, true);
  assert.equal(ranked[0].history?.timesLogged, 2);
});

test('cross-source deduplication keeps personal default portion', () => {
  const [personal] = buildPersonalFoodResults([
    history({ id: 1, name: 'Rice', source: 'usda', source_food_id: '123', data_type: 'Foundation', grams_logged: 180 }),
  ], []);
  const result = rankAndDeduplicateFoodResults([
    food({ id: 'remote', name: 'Rice', sourceFoodId: '123', portions: [{ id: 'remote', label: '100 g', grams: 100 }], defaultAmount: { kind: 'serving', grams: 100, servingId: 'remote' } }),
    personal,
  ], 'rice').items;
  assert.equal(result.length, 1);
  assert.equal(result[0].history?.lastGrams, 180);
  assert.deepEqual(result[0].defaultAmount, { kind: 'last-logged', grams: 180, servingId: null });
});

test('portion builder keeps distinct serving labels at equal weights', () => {
  const portions = buildFoodPortions([
    { id: 'cup', label: '1 cup', grams: 180 },
    { id: 'bowl', label: '1 bowl', grams: 180 },
    { id: 'bad', label: 'Bad', grams: 0 },
  ]);
  assert.deepEqual(portions, [
    { id: 'cup', label: '1 cup', grams: 180 },
    { id: 'bowl', label: '1 bowl', grams: 180 },
  ]);
});

test('quick log copies latest amount and preserves genuine serving metadata', () => {
  const [personal] = buildPersonalFoodResults([
    history({
      id: 1, name: 'Rice', source: 'describe', data_type: 'describe', grams_logged: 180,
      serving_size_g: 50, serving_label: '1 serving',
      calories: 234, protein_g: 4.9, carbs_g: 50.4, fat_g: 0.5,
      parent_meal_name: 'Chicken rice',
    }),
  ], []);
  const input = createQuickLogInput(personal, '2026-08-08', 'lunch');
  assert.equal(input.grams_logged, 180);
  assert.equal(input.serving_size_g, 50);
  assert.equal(input.serving_label, '1 serving');
  assert.equal(input.calories, 234);
  assert.equal(input.meal, 'lunch');
  assert.equal(input.meal_id, null);
});

test('history recovers genuine serving after synthetic last-logged metadata', () => {
  const [personal] = buildPersonalFoodResults([
    history({
      id: 1, name: 'Rice', source: 'usda', source_food_id: '123',
      grams_logged: 180, serving_size_g: 50, serving_label: '1 serving',
    }),
    history({
      id: 2, name: 'Rice', source: 'usda', source_food_id: '123',
      grams_logged: 200, serving_size_g: 180, serving_label: 'Last logged',
    }),
  ], []);
  assert.equal(personal.history?.lastGrams, 200);
  assert.deepEqual(personal.portions, [{ id: 'history-serving', label: '1 serving', grams: 50 }]);
});

test('described meal component survives history search, quick log, and undo', () => {
  const describedRice = history({
    id: 41,
    name: 'Steamed rice',
    source: 'describe',
    data_type: 'describe',
    grams_logged: 165,
    calories: 214.5,
    protein_g: 4.455,
    carbs_g: 46.2,
    fat_g: 0.495,
    parent_meal_name: 'Chicken adobo plate',
    parent_photo_uri: 'file:///meal.jpg',
  });
  const results = rankAndDeduplicateFoodResults(
    buildPersonalFoodResults([describedRice], []),
    'rice',
  ).items;
  assert.equal(results.length, 1);
  assert.equal(results[0].history?.parentMealName, 'Chicken adobo plate');
  assert.equal(results[0].history?.parentMealPhotoUri, 'file:///meal.jpg');

  const inserted = { id: 99, ...createQuickLogInput(results[0], '2026-08-09', 'dinner') };
  assert.equal(inserted.log_date, '2026-08-09');
  assert.equal(inserted.meal, 'dinner');
  assert.equal(inserted.meal_id, null);
  assert.equal(inserted.grams_logged, describedRice.grams_logged);
  assert.equal(inserted.calories, describedRice.calories);
  assert.equal(inserted.protein_g, describedRice.protein_g);
  assert.equal(inserted.carbs_g, describedRice.carbs_g);
  assert.equal(inserted.fat_g, describedRice.fat_g);

  const afterUndo = [inserted].filter((row) => row.id !== inserted.id);
  assert.deepEqual(afterUndo, []);
});
