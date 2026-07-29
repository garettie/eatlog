import assert from 'node:assert/strict';
import test from 'node:test';

import { MANUAL_TARGET_CALORIE_TOLERANCE, macroCalories, validateManualTargets } from './planValidation';

test('manual targets accept macro energy within the explicit tolerance', () => {
  assert.equal(validateManualTargets({ targetCalories: 2000, targetProteinG: 150, targetFatG: 60, targetCarbsG: 215 }), null);
  assert.equal(macroCalories({ targetProteinG: 150, targetFatG: 60, targetCarbsG: 215 }), 2000);
  assert.equal(MANUAL_TARGET_CALORIE_TOLERANCE, 50);
});

test('manual targets reject calorie and macro energy mismatch', () => {
  assert.match(validateManualTargets({ targetCalories: 2000, targetProteinG: 100, targetFatG: 50, targetCarbsG: 100 }) ?? '', /within 50 kcal/);
});
