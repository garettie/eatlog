import assert from 'node:assert/strict';
import test from 'node:test';

import type { DailyTarget, FoodLog } from '../db/database';
import {
  buildDaySummaryShareData,
  buildMealShareData,
  buildStreakShareData,
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

test('builds day totals with unclamped goal contributions', () => {
  const data = buildDaySummaryShareData('2026-08-11', {
    calories: 2450,
    protein_g: 176,
    carbs_g: 115,
    fat_g: 70,
  }, target);

  assert.equal(data.calories, 2450);
  assert.equal(data.targetCalories, 2200);
  assert.equal(data.protein.percentOfGoal, 1.1);
  assert.equal(data.carbs.percentOfGoal, 0.5);
  assert.equal(data.fat.percentOfGoal, 1);
});

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

test('does not build a meal card without a real photo and component', () => {
  assert.equal(buildMealShareData({ id: 1, name: 'Meal', photoUri: null, components: [component()] }, target), null);
  assert.equal(buildMealShareData({ id: 1, name: 'Meal', photoUri: 'file:///meal.jpg', components: [] }, target), null);
});

test('derives current, longest, and last-seven streak values with today grace', () => {
  const data = buildStreakShareData('2026-08-12', [
    '2026-08-01',
    '2026-08-02',
    '2026-08-03',
    '2026-08-05',
    '2026-08-09',
    '2026-08-10',
    '2026-08-11',
    '2026-08-11',
  ]);

  assert.equal(data.currentStreak, 3);
  assert.equal(data.longestStreak, 3);
  assert.deepEqual(data.lastSevenDays.map((day) => day.complete), [false, false, false, true, true, true, false]);
});

test('a completed end date participates in the current streak', () => {
  const data = buildStreakShareData('2026-08-12', ['2026-08-10', '2026-08-11', '2026-08-12']);
  assert.equal(data.currentStreak, 3);
  assert.equal(data.longestStreak, 3);
});
