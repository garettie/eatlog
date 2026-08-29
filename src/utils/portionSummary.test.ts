import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCollapsedPortion, type EditableComponent } from './mealReview';

const serving = { id: 's1', label: 'slice', grams: 30 };

function component(mode: 'servings' | 'grams', grams: number): EditableComponent {
  return {
    food: {
      id: 'f1', name: 'Bread', source: 'manual', sourceFoodId: '', dataType: 'manual',
      brand: null, preparation: null, normalizedName: 'bread',
      caloriesPer100g: 250, proteinPer100g: 8, carbsPer100g: 45, fatPer100g: 3,
      portions: [serving], defaultAmount: { kind: 'reviewed', grams, servingId: 's1' },
      alternateSourceIds: [],
    },
    selection: { mode, grams, servingId: 's1' },
  } as unknown as EditableComponent;
}

test('one serving shows the serving weight, not the computed grams', () => {
  assert.equal(formatCollapsedPortion(component('servings', 30), serving), 'slice · 30g');
});

test('multiple servings show the count and the total weight', () => {
  assert.equal(formatCollapsedPortion(component('servings', 90), serving), '3 × slice · 90g');
});

test('grams mode shows grams regardless of the serving', () => {
  assert.equal(formatCollapsedPortion(component('grams', 75), serving), '75g');
});

test('no serving falls back to grams', () => {
  assert.equal(formatCollapsedPortion(component('servings', 75), null), '75g');
});
