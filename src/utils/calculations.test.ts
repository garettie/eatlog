import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActivityLevel, GoalType, ProteinPreference, Sex } from '../db/database';
import {
  calcBMR,
  calcTDEE,
  calculateMacrosForCalories,
  calculateTargets,
  targetOverflowProgress,
} from './calculations';
import { goalRateBounds, minimumSafeCalories, NUTRITION_SAFETY_POLICY } from './nutritionSafety';

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

test('an infeasibly low calorie target clamps to the safe floor instead of blocking', () => {
  const result = calculateTargets({
    tdeeKcal: 500,
    goalType: 'cut',
    proteinPreference: 'high',
    weightKg: 200,
    goalRateKgPerWeek: -0.9,
  });
  assert.equal(result.targetCalories, minimumSafeCalories(200));
  assert.ok(result.targetCarbsG >= 130);
  assert.ok(result.targetProteinG >= 200 * 0.8);
});

test('a 60 kg cut yields fat then protein so carbs stay at the 130 g floor', () => {
  const extraHigh = calculateMacrosForCalories({
    targetCalories: 1460,
    goalType: 'cut',
    proteinPreference: 'extra_high',
    weightKg: 60,
  });
  assert.ok(extraHigh.targetCarbsG >= 130);
  assert.ok(extraHigh.targetProteinG >= 149);
  assert.ok(extraHigh.targetFatG >= 1460 * 0.2 / 9);

  const tight = calculateMacrosForCalories({
    targetCalories: 1000,
    goalType: 'cut',
    proteinPreference: 'extra_high',
    weightKg: 60,
  });
  assert.ok(tight.targetCarbsG >= 130);
  assert.ok(tight.targetProteinG >= 48);
  assert.ok(tight.targetFatG >= 1000 * 0.2 / 9);
});

test('162 cm 60 kg female onboarding cut does not die on the protein screen', () => {
  const bmr = calcBMR({ sex: 'female', weight_kg: 60, height_cm: 162, age: 31 });
  for (const activityLevel of ['sedentary', 'light', 'moderate'] as ActivityLevel[]) {
    const tdee = calcTDEE(bmr, activityLevel);
    for (const proteinPreference of preferences) {
      const result = calculateTargets({
        tdeeKcal: tdee,
        goalType: 'cut',
        proteinPreference,
        weightKg: 60,
        goalRateKgPerWeek: -0.5,
      });
      assert.ok(result.targetCarbsG >= 130, `${activityLevel} ${proteinPreference}`);
      assert.ok(result.targetProteinG >= 48, `${activityLevel} ${proteinPreference}`);
    }
  }
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

test('no reachable onboarding input hard-blocks the plan calculation', () => {
  const P = NUTRITION_SAFETY_POLICY;
  const step = P.goalRateStepKgPerWeek;
  const sexes: Sex[] = ['male', 'female'];
  const ages = [18, 30, 45, 60, 78];
  const heights = [P.minimumHeightCm, 150, 175, 200, P.maximumHeightCm];
  const weights = [P.minimumWeightKg, 45, 60, 90, 130, 200, P.maximumWeightKg];
  const goals: GoalType[] = ['cut', 'maintain', 'bulk'];

  let checked = 0;
  for (const sex of sexes)
    for (const age of ages)
      for (const height_cm of heights)
        for (const weightKg of weights)
          for (const activityLevel of activities) {
            const tdee = calcTDEE(calcBMR({ sex, weight_kg: weightKg, height_cm, age }), activityLevel);
            for (const goalType of goals)
              for (const proteinPreference of preferences) {
                const bounds = goalRateBounds(goalType, weightKg, tdee);
                // slowest, default, and fastest rate the UI would offer for this body
                const magnitudes = goalType === 'maintain'
                  ? [0]
                  : [Math.min(Math.abs(bounds.min), Math.abs(bounds.max)),
                     Math.abs(bounds.defaultRate),
                     Math.max(Math.abs(bounds.min), Math.abs(bounds.max))];
                for (const mag of magnitudes) {
                  const rate = goalType === 'cut' ? -mag : goalType === 'bulk' ? mag : 0;
                  const snapped = Number((Math.round(rate / step) * step).toFixed(2));
                  const result = calculateTargets({
                    tdeeKcal: tdee, goalType, proteinPreference, weightKg, goalRateKgPerWeek: snapped,
                  });
                  assert.ok(result.targetCalories >= P.minimumCalories && result.targetCalories <= P.maximumCalories);
                  assert.ok(result.targetCarbsG >= P.minimumCarbsG,
                    `carbs floor ${sex} ${age} ${height_cm} ${weightKg} ${activityLevel} ${goalType} ${proteinPreference} @${snapped}`);
                  assert.ok(result.targetProteinG >= weightKg * P.minimumProteinGPerKg - 1e-6);
                  checked += 1;
                }
              }
          }
  assert.ok(checked > 5000, `expected a broad sweep, only checked ${checked}`);
});

test('a small light cutter is offered a feasible rate, not one the validator rejects', () => {
  // 45 kg sedentary body: TDEE is low enough that the body-fraction cap alone
  // would offer a rate whose target falls under 1000 kcal.
  const tdee = calcTDEE(calcBMR({ sex: 'male', weight_kg: 45, height_cm: 150, age: 30 }), 'sedentary');
  const bounds = goalRateBounds('cut', 45, tdee);
  const fastest = calculateTargets({
    tdeeKcal: tdee, goalType: 'cut', proteinPreference: 'moderate', weightKg: 45, goalRateKgPerWeek: bounds.max,
  });
  assert.ok(fastest.targetCalories >= NUTRITION_SAFETY_POLICY.minimumCalories);
  assert.ok(fastest.targetCarbsG >= 130);
});

test('overflow progress starts after target and caps at one extra cycle', () => {
  assert.equal(targetOverflowProgress(1800, 2000), 0);
  assert.equal(targetOverflowProgress(2000, 2000), 0);
  assert.equal(targetOverflowProgress(2500, 2000), 0.25);
  assert.equal(targetOverflowProgress(4500, 2000), 1);
  assert.equal(targetOverflowProgress(2000, 0), 0);
  assert.equal(targetOverflowProgress(Number.NaN, 2000), 0);
});
