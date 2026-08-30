import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isRecognizedFoodEstimate,
  isUnrecognizedFoodEstimate,
  isValidFoodEstimateComponent,
  mealDivisionOf,
} from './foodScanContract';

const validComponent = {
  name: 'Chicken',
  estimatedGrams: 120,
  servingSizeGrams: 120,
  caloriesPer100g: 210,
  proteinPer100g: 24,
  carbsPer100g: 4,
  fatPer100g: 11,
  brand: null,
  preparation: 'braised',
  servingLabel: '1 serving (120g)',
  confidence: 'medium' as const,
  confidenceReason: 'Converted from one stated serving',
};

test('accepts recognized and unrecognized states but rejects unsupported guesses', () => {
  assert.equal(isValidFoodEstimateComponent(validComponent), true);
  assert.equal(isRecognizedFoodEstimate({
    status: 'recognized',
    unrecognizedReason: null,
    mealName: 'Chicken Adobo',
    servesTotal: null,
    servingUnit: null,
    components: [validComponent],
  }), true);
  assert.equal(isUnrecognizedFoodEstimate({
    status: 'unrecognized',
    unrecognizedReason: 'The text did not describe food',
    mealName: null,
    servesTotal: null,
    servingUnit: null,
    components: [],
  }), true);
  assert.equal(isValidFoodEstimateComponent({
    ...validComponent,
    confidence: 'low',
    confidenceReason: null,
  }), false);
});

test('meal division only survives when the whole splits into named countable portions', () => {
  const base = {
    status: 'recognized' as const,
    unrecognizedReason: null,
    mealName: 'Pepperoni Pizza',
    components: [validComponent],
  };
  assert.deepEqual(
    mealDivisionOf({ ...base, servesTotal: 8, servingUnit: 'slice' }),
    { servesTotal: 8, servingUnit: 'slice' },
  );
  assert.equal(mealDivisionOf({ ...base, servesTotal: null, servingUnit: null }), null);
  // A whole that is already one serving, or a count with no unit to name it, is not
  // something the review sheet can offer a "3 of 8" control for.
  assert.equal(mealDivisionOf({ ...base, servesTotal: 1, servingUnit: 'slice' }), null);
  assert.equal(mealDivisionOf({ ...base, servesTotal: 8, servingUnit: '  ' }), null);
});
