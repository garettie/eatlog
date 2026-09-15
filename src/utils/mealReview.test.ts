import assert from 'node:assert/strict';
import test from 'node:test';

import type { FoodResult } from '../services/foodSearchTypes';
import {
  computeMealTotals,
  formatMealPortion,
  MEAL_PORTION_COUNT_CEILING,
  mealPortionCeiling,
  mealPortionStep,
  scaleComponentPortions,
  scaleFromDivision,
  toEditable,
} from './mealReview';

function food(overrides: Partial<FoodResult> = {}): FoodResult {
  return {
    id: 'food',
    name: 'Pizza Dough',
    source: 'scan',
    sourceFoodId: '',
    dataType: 'scan',
    brand: null,
    preparation: null,
    normalizedName: 'pizza dough',
    caloriesPer100g: 260,
    proteinPer100g: 9,
    carbsPer100g: 49,
    fatPer100g: 3,
    portions: [{ id: 'serving', label: '1 slice', grams: 100 }],
    defaultAmount: { kind: 'reviewed', grams: 800, servingId: 'serving' },
    alternateSourceIds: [],
    ...overrides,
  };
}

test('scales every food by one factor so a shared dish logs one person\'s share', () => {
  const components = [
    toEditable(food()),
    toEditable(food({ id: 'cheese', name: 'Mozzarella', defaultAmount: { kind: 'reviewed', grams: 240, servingId: 'serving' } })),
  ];
  // Three of eight slices.
  const scaled = scaleComponentPortions(components, 3 / 8);
  assert.deepEqual(
    scaled.map((component) => component.selection.grams),
    [300, 90],
  );
  assert.equal(computeMealTotals(scaled).totalGrams, 390);
});

test('scaling preserves portion mode and the chosen serving', () => {
  const inServings = food({
    defaultAmount: { kind: 'serving', grams: 100, servingId: 'serving' },
  });
  const [scaled] = scaleComponentPortions([toEditable(inServings)], 0.5);
  assert.equal(scaled.selection.mode, 'servings');
  assert.equal(scaled.selection.selectedServingId, 'serving');
  // The scaled amount no longer matches any preset chip, so the selection goes custom.
  assert.equal(scaled.selection.selectedAmountId, 'custom-serving');
});

test('a nonsense or no-op factor leaves the meal untouched', () => {
  const components = [toEditable(food())];
  assert.equal(scaleComponentPortions(components, 1), components);
  assert.equal(scaleComponentPortions(components, 0), components);
  assert.equal(scaleComponentPortions(components, Number.NaN), components);
});

test('an ordinary plate scales as a whole without an AI serving count', () => {
  const scale = { kind: 'plate', unit: 'meal', servesTotal: 1 } as const;
  assert.equal(mealPortionStep(scale), 0.25);
  assert.equal(formatMealPortion(1, scale), '100%');
  assert.equal(formatMealPortion(0.5, scale), '50%');
  assert.equal(formatMealPortion(0.25, scale), '25%');
  assert.equal(formatMealPortion(1.5, scale), '150%');
  assert.equal(mealPortionCeiling(scale), 2);
  const components = [toEditable(food()), toEditable(food({ id: 'cheese' }))];
  const half = scaleComponentPortions(components, 0.5);
  assert.equal(computeMealTotals(half).totalGrams, computeMealTotals(components).totalGrams / 2);
  assert.equal(computeMealTotals(half).calories, computeMealTotals(components).calories / 2);
});

test('successive relative scaling returns to the original amounts', () => {
  const components = [toEditable(food())];
  const cut = scaleComponentPortions(components, 3 / 8);
  const restored = scaleComponentPortions(cut, 8 / 3);
  assert.ok(Math.abs(restored[0].selection.grams - 800) < 0.1);
});

test('the portion label agrees with the total, which is never one', () => {
  const pizza = { kind: 'shared', unit: 'slice', servesTotal: 8 } as const;
  assert.equal(formatMealPortion(3, pizza), '3 of 8 slices');
  assert.equal(formatMealPortion(1, pizza), '1 of 8 slices');
  assert.equal(formatMealPortion(2, { kind: 'shared', unit: 'glass', servesTotal: 4 }), '2 of 4 glasses');
  assert.equal(formatMealPortion(1, { kind: 'shared', unit: 'patty', servesTotal: 6 }), '1 of 6 patties');
});

test('past the whole the label counts instead of claiming a bigger fraction', () => {
  const pizza = { kind: 'shared', unit: 'slice', servesTotal: 8 } as const;
  assert.equal(formatMealPortion(8, pizza), '8 of 8 slices');
  // A second pizza was never in the photo, so "10 of 8" would misdescribe it.
  assert.equal(formatMealPortion(10, pizza), '10 slices');
  assert.equal(mealPortionCeiling(pizza), 16);
});

test('a single food counts its own servings with no whole to divide', () => {
  const empanadas = { kind: 'count', unit: 'empanada', servesTotal: null } as const;
  assert.equal(formatMealPortion(3, empanadas), '3 empanadas');
  assert.equal(formatMealPortion(1, empanadas), '1 empanada');
  // Nothing bounds a plain count, so it stops at an implausible number instead.
  assert.equal(mealPortionCeiling(empanadas), MEAL_PORTION_COUNT_CEILING);
});

test('a division converts to the scale the portion control reads', () => {
  assert.deepEqual(
    scaleFromDivision({ servesTotal: 8, servingUnit: 'slice' }),
    { kind: 'shared', unit: 'slice', servesTotal: 8 },
  );
});
