import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isRecognizedFoodEstimate,
  isUnrecognizedFoodEstimate,
  isValidFoodEstimateComponent,
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
    components: [validComponent],
  }), true);
  assert.equal(isUnrecognizedFoodEstimate({
    status: 'unrecognized',
    unrecognizedReason: 'The text did not describe food',
    mealName: null,
    components: [],
  }), true);
  assert.equal(isValidFoodEstimateComponent({
    ...validComponent,
    confidence: 'low',
    confidenceReason: null,
  }), false);
});
