import assert from 'node:assert/strict';
import test from 'node:test';
import type { FoodLog } from '../db/database';
import { buildMealSharePayload, getMealShareComponentRows, getMealSharePreviewAccessibilityLabel } from './mealSharing';

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
    protein_g: 4.56,
    carbs_g: 22.34,
    fat_g: 1.23,
    logged_at: '2026-08-11T12:00:00.000Z',
    ...overrides,
  };
}

test('rejects null, empty, and whitespace-only photo URIs', () => {
  for (const photoUri of [null, '', '   ']) {
    assert.equal(buildMealSharePayload({
      id: 1,
      name: 'Dinner',
      photoUri,
      components: [component()],
    }), null);
  }
});

test('builds full-precision totals for one component', () => {
  assert.deepEqual(buildMealSharePayload({
    id: 7,
    name: '  Rice bowl  ',
    photoUri: '  file:///meal.jpg  ',
    components: [component()],
  }), {
    mealId: 7,
    name: 'Rice bowl',
    photoUri: 'file:///meal.jpg',
    calories: 123.45,
    protein: 4.56,
    carbs: 22.34,
    fat: 1.23,
    componentNames: ['Rice'],
    componentHeading: 'Components',
  });
});

test('sums several decimal components without display rounding', () => {
  const payload = buildMealSharePayload({
    id: 8,
    name: 'Dinner',
    photoUri: 'file:///meal.jpg',
    components: [
      component({ calories: 100.25, protein_g: 10.1, carbs_g: 20.2, fat_g: 3.3 }),
      component({ id: 2, calories: 50.5, protein_g: 5.05, carbs_g: 4.4, fat_g: 2.2 }),
    ],
  });

  assert.equal(payload?.calories, 150.75);
  assert.equal(payload?.protein, 15.149999999999999);
  assert.equal(payload?.carbs, 24.6);
  assert.equal(payload?.fat, 5.5);
});

test('preserves stored component order and names in an immutable snapshot', () => {
  const components = [
    component({ id: 1, name: 'First' }),
    component({ id: 2, name: 'First' }),
    component({ id: 3, name: '第三' }),
  ];
  const payload = buildMealSharePayload({
    id: 9,
    name: 'Dinner',
    photoUri: 'file:///meal.jpg',
    components,
  });

  components[0].name = 'Changed';
  components.reverse();

  assert.deepEqual(payload?.componentNames, ['First', 'First', '第三']);
});

test('labels scan, describe, and mixed AI/manual components as estimated', () => {
  for (const components of [
    [component({ source: 'scan' })],
    [component({ source: 'describe' })],
    [component({ source: 'manual' }), component({ id: 2, source: 'scan' })],
  ]) {
    assert.equal(buildMealSharePayload({
      id: 10,
      name: 'Dinner',
      photoUri: 'file:///meal.jpg',
      components,
    })?.componentHeading, 'Estimated components');
  }
});

test('labels manual, USDA, Open Food Facts, and mixed non-AI components plainly', () => {
  for (const components of [
    [component({ source: 'manual' })],
    [component({ source: 'usda' })],
    [component({ source: 'off' })],
    [component({ source: 'manual' }), component({ id: 2, source: 'usda' })],
  ]) {
    assert.equal(buildMealSharePayload({
      id: 11,
      name: 'Dinner',
      photoUri: 'file:///meal.jpg',
      components,
    })?.componentHeading, 'Components');
  }
});

test('falls back to Meal only for an empty trimmed name', () => {
  assert.equal(buildMealSharePayload({
    id: 12,
    name: '   ',
    photoUri: 'file:///meal.jpg',
    components: [component()],
  })?.name, 'Meal');
});

test('describes the selected export template with the same visible component truncation', () => {
  const payload = buildMealSharePayload({
    id: 13,
    name: 'Dinner',
    photoUri: 'file:///meal.jpg',
    components: [
      component({ id: 1, name: 'One' }),
      component({ id: 2, name: 'Two' }),
      component({ id: 3, name: 'Three' }),
      component({ id: 4, name: 'Four' }),
      component({ id: 5, name: 'Five' }),
      component({ id: 6, name: 'Six' }),
    ],
  });
  assert.ok(payload);
  assert.deepEqual(getMealShareComponentRows(payload.componentNames), ['One', 'Two', 'Three', 'Four', '+2 more']);
  assert.equal(
    getMealSharePreviewAccessibilityLabel(payload, 'components'),
    'Components preview. Dinner. 741 kilocalories. Protein 27 grams. Carbohydrates 134 grams. Fat 7 grams. Components: One, Two, Three, Four, +2 more.',
  );
  assert.match(getMealSharePreviewAccessibilityLabel(payload, 'summary'), /^Summary preview\./);
  assert.match(getMealSharePreviewAccessibilityLabel(payload, 'macros'), /^Macros preview\./);
});
