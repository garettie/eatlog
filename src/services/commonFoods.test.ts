import assert from 'node:assert/strict';
import test from 'node:test';

import catalog from '../data/commonFoods.json';
import { commonFoods, searchCommonFoods } from './commonFoods';
import { normalizeFoodName } from './foodSearchCore';

test('common foods catalog has usable macros, servings, and unique identities', () => {
  const ids = new Set<string>();
  const names = new Set<string>();
  const fdcIds = new Set<number>();
  for (const food of catalog) {
    for (const value of [food.caloriesPer100g, food.proteinPer100g, food.carbsPer100g, food.fatPer100g]) {
      assert.ok(Number.isFinite(value) && value >= 0, food.id);
    }
    assert.ok(food.portions.some((portion) => portion.grams > 0), food.id);
    assert.ok(food.portions.some((portion) => portion.id === food.defaultPortionId), food.id);
    const name = normalizeFoodName(food.name, null).normalizedName;
    assert.ok(!ids.has(food.id) && !names.has(name) && !fdcIds.has(food.fdcId), food.id);
    ids.add(food.id);
    names.add(name);
    fdcIds.add(food.fdcId);
  }
  assert.equal(commonFoods.length, catalog.length);
  assert.ok(commonFoods.every((food) => food.defaultAmount.kind === 'serving' && food.defaultAmount.grams > 0));
  assert.ok(Buffer.byteLength(JSON.stringify(catalog)) < 200_000);
});

test('common food search ignores short queries and matches names and aliases', () => {
  assert.deepEqual(searchCommonFoods(''), []);
  assert.deepEqual(searchCommonFoods(' r '), []);
  const rice = searchCommonFoods('white rice')[0];
  assert.equal(rice?.id, 'common-white-rice-cooked');
  assert.equal(rice.portions.find((portion) => portion.id === rice.defaultAmount.servingId)?.label, '1 cup, cooked');
  // "steamed rice" appears only in the white rice entry's aliases.
  assert.equal(searchCommonFoods('steamed rice')[0]?.id, 'common-white-rice-cooked');
});
