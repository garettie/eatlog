import assert from 'node:assert/strict';
import test from 'node:test';
import { foodResultFromLog, rankAndDeduplicateFoodResults } from '../services/foodSearchCore';
import { buildFoodAmountOptions, initialPortionSelection, selectedServing, setServingAmount } from './portionSelection';
import { recordedPortionValues } from './recordedPortion';

const log = {
  name: 'Egg', source: 'manual', source_food_id: null, data_type: 'manual', brand: null,
  preparation: null, grams_logged: null, serving_size_g: null, serving_label: 'piece',
  portion_quantity: 2, portion_unit: 'piece', calories_per_100g: null,
  protein_g_per_100g: null, carbs_g_per_100g: null, fat_g_per_100g: null,
  calories: 155.25, protein_g: 12.25, carbs_g: 1.1, fat_g: 10.25,
};

test('counted unknown-mass portions scale totals without inventing mass or density', () => {
  const food = foodResultFromLog(log, 'egg');
  const selection = initialPortionSelection(food);
  assert.equal(selection.mode, 'servings');
  assert.equal(selectedServing(food, selection)?.grams, 50);
  assert.deepEqual(buildFoodAmountOptions(food).map((option) => option.label), ['Last logged', '1 piece']);
  const result = recordedPortionValues(food, setServingAmount(selection, 3, selectedServing(food, selection)), {
    calories: 155.25, protein: 12.25, carbs: 1.1, fat: 10.25,
  });
  assert.equal(result.portion_quantity, 3);
  assert.equal(result.portion_unit, 'piece');
  assert.equal(result.calories, 155.25 * 1.5);
  assert.equal(result.protein_g, 12.25 * 1.5);
  assert.equal(result.grams_logged, null);
  assert.equal(result.serving_size_g, null);
  assert.equal(result.calories_per_100g, null);
  assert.equal(result.serving_label, 'piece');
});

test('legacy totals without a portion become one unknown-mass serving', () => {
  const food = foodResultFromLog({ ...log, portion_quantity: null, portion_unit: null }, 'legacy');
  assert.deepEqual(food.unknownMass, { quantity: 1, unit: 'serving' });
  assert.equal(food.caloriesPer100g, log.calories);
});

test('known masses retain physical grams and exact nutrition', () => {
  const food = foodResultFromLog({ ...log, grams_logged: 73 }, 'known');
  assert.equal(food.unknownMass, undefined);
  const result = recordedPortionValues(food, initialPortionSelection(food), { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 });
  assert.equal(result.grams_logged, 73);
  assert.equal(result.calories, 130 * 0.73);
  assert.equal(result.protein_g, 2.7 * 0.73);
  assert.equal(result.portion_quantity, null);
});


test('known-mass reconciled allocations do not lose calories when saved separately', () => {
  const food = foodResultFromLog({ ...log, grams_logged: 100 }, 'known');
  const selection = initialPortionSelection(food);
  const first = recordedPortionValues(food, selection, { calories: 50.25, protein: 1.125, carbs: 2, fat: 0.5 });
  const second = recordedPortionValues(food, selection, { calories: 49.25, protein: 1.125, carbs: 2, fat: 0.5 });
  assert.equal(first.calories + second.calories, 99.5);
  assert.equal(first.protein_g + second.protein_g, 2.25);
  assert.equal(first.calories_per_100g, 50.25);
});

test('search cannot merge counted-unit nutrition with a gram density or a different count basis', () => {
  const counted = foodResultFromLog({ ...log, name: 'Synthetic egg' }, 'counted');
  const weighed = foodResultFromLog({ ...log, name: 'Synthetic egg', grams_logged: 100 }, 'weighed');
  const differentCount = foodResultFromLog({ ...log, name: 'Synthetic egg', portion_quantity: 3 }, 'three');
  assert.equal(rankAndDeduplicateFoodResults([counted, weighed, differentCount], 'Synthetic egg').items.length, 3);
});
