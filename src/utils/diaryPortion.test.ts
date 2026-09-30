import assert from 'node:assert/strict';
import test from 'node:test';
import type { FoodLog } from '../db/database';
import { editedPortionAmount, editedPortionValues } from './diaryPortion';

const countedFood = {
  grams_logged: null,
  portion_quantity: 2,
  portion_unit: 'piece',
  calories_per_100g: null,
  calories: 201.25,
  protein_g: 12.345,
  carbs_g: 3.678,
  fat_g: 10.123,
} as FoodLog;

test('unchanged counted portion retains exact nutrition and unknown mass', () => {
  assert.equal(editedPortionAmount(countedFood), 2);
  assert.deepEqual(editedPortionValues(countedFood, 2), {
    grams_logged: null,
    portion_quantity: 2,
    calories: 201.25,
    protein_g: 12.345,
    carbs_g: 3.678,
    fat_g: 10.123,
  });
});

test('counted portion scales nutrition without inventing grams', () => {
  const result = editedPortionValues(countedFood, 3);
  assert.equal(result.grams_logged, null);
  assert.equal(result.portion_quantity, 3);
  assert.equal(result.calories, countedFood.calories * 1.5);
  assert.equal(result.protein_g, countedFood.protein_g * 1.5);
});

test('unknown legacy portion defaults to one serving', () => {
  const food = { ...countedFood, portion_quantity: null };
  assert.equal(editedPortionAmount(food), 1);
  assert.equal(editedPortionValues(food, 1).calories, food.calories);
});

test('known gram portion retains existing rounding behavior', () => {
  const result = editedPortionValues({ ...countedFood, grams_logged: 100, portion_quantity: null }, 150);
  assert.equal(result.grams_logged, 150);
  assert.equal(result.calories, 302);
  assert.equal(result.protein_g, 18.5);
});
