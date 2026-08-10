import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActivityLevel, GoalType, ProteinPreference, Sex } from '../db/database';
import {
  calcBMR,
  calcTDEE,
  calculateMacrosForCalories,
  calculateTargets,
} from './calculations';

const activities: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const preferences: ProteinPreference[] = ['low', 'moderate', 'high', 'extra_high'];

test('both BMR branches and every activity level produce finite positive values', () => {
  for (const sex of ['male', 'female'] as Sex[]) {
    const bmr = calcBMR({ sex, weight_kg: 80, height_cm: 180, age: 35 });
    assert.ok(Number.isFinite(bmr) && bmr > 0);
    for (const activityLevel of activities) {
      const tdee = calcTDEE(bmr, activityLevel);
      assert.ok(Number.isFinite(tdee) && tdee > 0);
    }
  }
});

test('all protein preferences produce safe targets for each goal', () => {
  for (const goalType of ['cut', 'maintain', 'bulk'] as GoalType[]) {
    for (const proteinPreference of preferences) {
      const rate = goalType === 'cut' ? -0.5 : goalType === 'bulk' ? 0.25 : 0;
      const result = calculateTargets({
        tdeeKcal: 2500,
        goalType,
        proteinPreference,
        weightKg: 80,
        goalRateKgPerWeek: rate,
      });
      assert.ok(result.targetCalories >= 1000 && result.targetCalories <= 6000);
      assert.ok(result.targetProteinG > 0);
      assert.ok(result.targetFatG > 0);
      assert.ok(result.targetCarbsG >= 130);
    }
  }
});

test('calculateTargets delegates safe goal-adjusted calories to the allocator', () => {
  const input = {
    tdeeKcal: 2400,
    goalType: 'bulk' as const,
    proteinPreference: 'high' as const,
    weightKg: 75,
    goalRateKgPerWeek: 0.25,
  };
  assert.deepEqual(calculateTargets(input), calculateMacrosForCalories({
    targetCalories: Math.round(input.tdeeKcal + input.goalRateKgPerWeek * 7700 / 7),
    goalType: input.goalType,
    proteinPreference: input.proteinPreference,
    weightKg: input.weightKg,
  }));
});

test('the existing low-calorie path stops instead of returning negative or rewritten macros', () => {
  assert.throws(() => calculateTargets({
    tdeeKcal: 500,
    goalType: 'cut',
    proteinPreference: 'high',
    weightKg: 200,
    goalRateKgPerWeek: -0.9,
  }), /Calories|Carbohydrates|target/);
});

test('non-finite and unsupported calculation inputs are rejected', () => {
  assert.throws(() => calcBMR({ sex: 'male', weight_kg: Number.NaN, height_cm: 180, age: 35 }));
  assert.throws(() => calcBMR({ sex: 'male', weight_kg: 80, height_cm: 180, age: 17 }));
  assert.throws(() => calcTDEE(Number.POSITIVE_INFINITY, 'moderate'));
  assert.throws(() => calculateMacrosForCalories({
    targetCalories: Number.POSITIVE_INFINITY,
    goalType: 'maintain',
    proteinPreference: 'moderate',
    weightKg: 80,
  }));
});
