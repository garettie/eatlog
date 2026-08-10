import assert from 'node:assert/strict';
import test from 'node:test';

import { MANUAL_TARGET_CALORIE_TOLERANCE, macroCalories, validateManualTargets } from './planValidation';

const context = { goalType: 'maintain' as const, referenceWeightKg: 80, tdeeEstimate: 2000 };

test('manual targets accept policy boundaries and exact macro energy', () => {
  assert.equal(validateManualTargets({ targetCalories: 2000, targetProteinG: 150, targetFatG: 60, targetCarbsG: 215 }, context), null);
  assert.equal(macroCalories({ targetProteinG: 150, targetFatG: 60, targetCarbsG: 215 }), 2000);
  assert.equal(MANUAL_TARGET_CALORIE_TOLERANCE, 10);
});

test('manual targets reject calorie and macro energy mismatch', () => {
  assert.match(validateManualTargets({ targetCalories: 2000, targetProteinG: 100, targetFatG: 50, targetCarbsG: 150 }, context) ?? '', /within 10 kcal/);
});

test('manual targets reject zero, negative, non-finite, oversized, and macro-floor values', () => {
  for (const targets of [
    { targetCalories: 0, targetProteinG: 0, targetFatG: 0, targetCarbsG: 0 },
    { targetCalories: -1, targetProteinG: 150, targetFatG: 60, targetCarbsG: 215 },
    { targetCalories: Number.NaN, targetProteinG: 150, targetFatG: 60, targetCarbsG: 215 },
    { targetCalories: Number.POSITIVE_INFINITY, targetProteinG: 150, targetFatG: 60, targetCarbsG: 215 },
    { targetCalories: 6001, targetProteinG: 150, targetFatG: 60, targetCarbsG: 215 },
    { targetCalories: 2000, targetProteinG: 10, targetFatG: 60, targetCarbsG: 215 },
    { targetCalories: 2000, targetProteinG: 150, targetFatG: 10, targetCarbsG: 215 },
    { targetCalories: 2000, targetProteinG: 150, targetFatG: 60, targetCarbsG: 129 },
  ]) {
    assert.notEqual(validateManualTargets(targets, context), null);
  }
});
