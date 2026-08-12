import assert from 'node:assert/strict';
import test from 'node:test';

import type { DailyTarget, FoodLog } from '../db/database';
import {
  SHARE_IMAGE,
  buildMealShareData,
} from './shareCards';

const target: DailyTarget = {
  id: 1,
  effective_date: '2026-08-01',
  tdee_estimate: 2400,
  target_calories: 2200,
  target_protein_g: 160,
  target_fat_g: 70,
  target_carbs_g: 230,
  calculation_method: 'initial_estimate',
  created_at: '2026-08-01 00:00:00',
};

function component(overrides: Partial<FoodLog> = {}): FoodLog {
  return {
    id: 1,
    log_date: '2026-08-11',
    name: 'Rice',
    source: 'manual',
    source_food_id: null,
    meal: 'dinner',
    meal_id: 10,
    brand: null,
    data_type: null,
    preparation: null,
    grams_logged: 100,
    serving_size_g: null,
    serving_label: null,
    calories_per_100g: null,
    protein_g_per_100g: null,
    carbs_g_per_100g: null,
    fat_g_per_100g: null,
    calories: 123.45,
    protein_g: 16,
    carbs_g: 23,
    fat_g: 7,
    logged_at: '2026-08-11 12:00:00',
    ...overrides,
  };
}

test('builds meal totals, creation timestamp, and daily-goal contribution from stored data', () => {
  const data = buildMealShareData({
    id: 7,
    name: '  Rice bowl  ',
    photoUri: '  file:///meal.jpg  ',
    createdAt: '2026-08-11 11:59:00',
    components: [
      component({ logged_at: '2026-08-11 12:02:00' }),
      component({ id: 2, calories: 100, protein_g: 8, carbs_g: 12, fat_g: 3, logged_at: '2026-08-11 12:01:00' }),
    ],
  }, target);

  if (!data) throw new Error('Expected a meal share payload');
  assert.equal(data.name, 'Rice bowl');
  assert.equal(data.photoUri, 'file:///meal.jpg');
  assert.equal(data.loggedAt, '2026-08-11 11:59:00');
  assert.equal(data.calories, 223.45);
  assert.equal(data.protein.grams, 24);
  assert.equal(data.protein.percentOfGoal, 0.15);
});

test('builds a nutrition-first meal card without a photo', () => {
  const data = buildMealShareData({ id: 1, name: 'Meal', photoUri: null, components: [component()] }, target);
  assert.ok(data);
  assert.equal(data.photoUri, null);
  assert.equal(data.calories, 123.45);
});

test('does not build a meal card without a component', () => {
  assert.equal(buildMealShareData({ id: 1, name: 'Meal', photoUri: 'file:///meal.jpg', components: [] }, target), null);
});

test('keeps the exported share image contract story-sized and lossless', () => {
  assert.deepEqual(SHARE_IMAGE, {
    width: 1080,
    height: 1920,
    format: 'png',
    mimeType: 'image/png',
    extension: 'png',
  });
});
