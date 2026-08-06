import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expandFoodAliases,
  normalizeFoodName,
  parseOpenFoodFactsProducts,
  parseUSDAFoods,
  rankAndDeduplicateFoodResults,
  rewriteFoodProviderQuery,
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
    servingSizeGrams: 100,
    servingLabel: '1 cup',
    alternateSourceIds: [],
    ...overrides,
  };
}

test('parses each supported USDA data type and rejects unknown or unusable records', () => {
  const types: DataType[] = ['Survey (FNDDS)', 'SR Legacy', 'Foundation', 'Branded'];
  const parsed = parseUSDAFoods([
    ...types.map((dataType, index) => ({
      fdcId: index + 1,
      description: `${dataType} egg, boiled`,
      additionalDescriptions: 'whole egg',
      dataType,
      brandOwner: dataType === 'Branded' ? 'Example Foods' : undefined,
      foodNutrients: nutrients,
      foodPortions: [{ gramWeight: 50, portionDescription: '1 egg', modifier: 'large' }],
    })),
    { fdcId: 9, description: 'Unknown', dataType: 'Experimental', foodNutrients: nutrients },
    { fdcId: 10, description: 'Incomplete', dataType: 'Foundation', foodNutrients: nutrients.slice(0, 3) },
    { fdcId: 11, description: 'Negative', dataType: 'Foundation', foodNutrients: nutrients.map((item) => item.nutrientId === 1004 ? { ...item, value: -1 } : item) },
  ]);

  assert.deepEqual(parsed.map((item) => item.dataType), types);
  assert.equal(parsed[0].servingLabel, '1 egg');
  assert.equal(parsed[0].preparation, 'boiled');
  assert.match(parsed[0].normalizedName, /boiled/);
  assert.match(parsed[0].searchText ?? '', /whole egg/);
  assert.equal(parsed[3].brand, 'Example Foods');
});

test('parses Open Food Facts kcal and kJ records and rejects incomplete macros', () => {
  const parsed = parseOpenFoodFactsProducts([
    {
      code: 'one', product_name: 'Example Toast', brands: 'Example', serving_quantity: '30',
      nutriments: { 'energy-kcal_100g': '250', proteins_100g: '8', carbohydrates_100g: '45', fat_100g: '4' },
    },
    {
      code: 'two', product_name: 'Example Juice',
      nutriments: { energy_100g: 418.4, proteins_100g: 1, carbohydrates_100g: 22, fat_100g: 0 },
    },
    {
      code: 'bad', product_name: 'Incomplete',
      nutriments: { 'energy-kcal_100g': 100, proteins_100g: 1, fat_100g: 0 },
    },
  ]);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].caloriesPer100g, 250);
  assert.equal(parsed[0].servingSizeGrams, 30);
  assert.ok(Math.abs((parsed[1].caloriesPer100g ?? 0) - 100) < 1e-9);
});

test('expands aliases bidirectionally and rewrites provider vocabulary', () => {
  assert.deepEqual(expandFoodAliases('grilled aubergine'), ['grilled aubergine', 'grilled eggplant']);
  assert.deepEqual(expandFoodAliases('green onion'), ['green onion', 'scallion', 'spring onion']);
  assert.equal(rewriteFoodProviderQuery('minced beef with aubergine'), 'ground beef with eggplant');
});

test('matches straightforward plurals, aliases, and requested preparations', () => {
  const results = rankAndDeduplicateFoodResults([
    food({ id: 'raw', name: 'Eggs raw', normalizedName: 'egg', preparation: 'raw' }),
    food({ id: 'boiled', name: 'Egg boiled', normalizedName: 'egg', preparation: 'boiled' }),
    food({ id: 'eggplant', name: 'Eggplant grilled', normalizedName: 'eggplant', preparation: 'grilled' }),
  ], 'boiled eggs').items;
  assert.equal(results[0].id, 'boiled');
  assert.equal(rankAndDeduplicateFoodResults([
    food({ id: 'eggplant', name: 'Eggplant grilled', normalizedName: 'eggplant', preparation: 'grilled' }),
  ], 'aubergine').items[0].id, 'eggplant');
});

test('prioritizes common food sources without automatically preferring raw food', () => {
  const results = rankAndDeduplicateFoodResults([
    food({ id: 'foundation', name: 'Egg', dataType: 'Foundation', preparation: 'raw' }),
    food({ id: 'survey', name: 'Egg', dataType: 'Survey (FNDDS)', preparation: 'cooked' }),
    food({ id: 'sr', name: 'Egg', dataType: 'SR Legacy', preparation: null }),
  ], 'egg').items;
  assert.deepEqual(results.map((item) => item.id), ['survey', 'sr', 'foundation']);
});

test('promotes a branded result only for an explicit full product query', () => {
  const common = food({ id: 'common', name: 'Peanut Butter', dataType: 'Survey (FNDDS)' });
  const branded = food({
    id: 'brand', name: 'Creamy Peanut Butter', sourceFoodId: 'brand', dataType: 'Branded',
    brand: 'Jif', normalizedName: 'creamy peanut butter', searchText: 'Jif Creamy Peanut Butter',
  });

  assert.equal(rankAndDeduplicateFoodResults([branded, common], 'peanut butter', 'full').items[0].id, 'common');
  assert.equal(rankAndDeduplicateFoodResults([common, branded], 'jif peanut butter', 'full').items[0].id, 'brand');
  assert.equal(rankAndDeduplicateFoodResults([common, branded], 'jif peanut butter', 'common').items[0].id, 'common');
});

test('prioritizes an equivalent personal food over a provider result', () => {
  const results = rankAndDeduplicateFoodResults([
    food({ id: 'provider', name: 'Chicken Breast', dataType: 'Survey (FNDDS)' }),
    food({ id: 'personal', name: 'Chicken Breast', source: 'scan', dataType: 'scan' }),
  ], 'chicken breast').items;
  assert.equal(results[0].id, 'personal');
});

test('keeps nutritionally different variants and merges similar cross-source records', () => {
  const base = food({ id: 'base', name: 'Rice', sourceFoodId: '1', dataType: 'Survey (FNDDS)' });
  const similar = food({ id: 'similar', name: 'Rice', sourceFoodId: '2', dataType: 'SR Legacy', caloriesPer100g: 110 });
  const different = food({ id: 'different', name: 'Rice', sourceFoodId: '3', dataType: 'Foundation', caloriesPer100g: 160 });
  const ranked = rankAndDeduplicateFoodResults([different, similar, base], 'rice');

  assert.equal(ranked.items.length, 2);
  assert.equal(ranked.items[0].id, 'base');
  assert.deepEqual(ranked.items[0].alternateSourceIds, [{ source: 'usda', id: '2' }]);
  assert.equal(ranked.items[1].id, 'different');
});

test('uses provider order and source id for stable ordering independent of merge completion order', () => {
  const first = food({ id: 'first', name: 'Apple slices', sourceFoodId: '20', providerOrder: 0 });
  const second = food({ id: 'second', name: 'Apple wedges', sourceFoodId: '10', providerOrder: 1 });
  const ordered = rankAndDeduplicateFoodResults([first, second], 'apple').items.map((item) => item.id);
  const reversed = rankAndDeduplicateFoodResults([second, first], 'apple').items.map((item) => item.id);
  assert.deepEqual(ordered, ['first', 'second']);
  assert.deepEqual(reversed, ['first', 'second']);
});
