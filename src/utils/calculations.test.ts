import assert from 'node:assert/strict';
import test from 'node:test';
import type { GoalType, ProteinPreference } from '../db/database';
import { calculateMacrosForCalories, calculateTargets } from './calculations';

const PROTEIN_BASE: Record<GoalType, number> = { cut: 2.1, maintain: 1.8, bulk: 1.7 };
const PROTEIN_OFFSET: Record<ProteinPreference, number> = {
  low: -0.2,
  moderate: 0,
  high: 0.2,
  extra_high: 0.4,
};

function legacyCalculateTargets(input: {
  tdeeKcal: number;
  goalType: GoalType;
  proteinPreference: ProteinPreference;
  weightKg: number;
  goalRateKgPerWeek: number;
}) {
  let targetCalories = input.tdeeKcal + input.goalRateKgPerWeek * 7700 / 7;
  const gramsPerKg = Math.max(
    PROTEIN_BASE[input.goalType] + PROTEIN_OFFSET[input.proteinPreference],
    1.2,
  );
  const targetProteinG = Math.round(input.weightKg * gramsPerKg * 10) / 10;
  const targetFatG = Math.round((targetCalories * 0.25) / 9 * 10) / 10;
  const remainingKcal = targetCalories - targetProteinG * 4 - targetFatG * 9;
  let targetCarbsG: number;
  if (remainingKcal < 200) {
    targetCarbsG = 50;
    targetCalories = Math.round(targetProteinG * 4 + targetFatG * 9 + targetCarbsG * 4);
  } else {
    targetCarbsG = Math.round(remainingKcal / 4 * 10) / 10;
  }
  return {
    targetCalories: Math.round(targetCalories),
    targetProteinG,
    targetFatG,
    targetCarbsG,
  };
}

test('calculateTargets preserves legacy output across goal and carb-floor cases', () => {
  const cases = [
    { tdeeKcal: 2500, goalType: 'cut', proteinPreference: 'moderate', weightKg: 80, goalRateKgPerWeek: -0.5 },
    { tdeeKcal: 2000, goalType: 'maintain', proteinPreference: 'low', weightKg: 60, goalRateKgPerWeek: 0 },
    { tdeeKcal: 2800, goalType: 'bulk', proteinPreference: 'extra_high', weightKg: 90, goalRateKgPerWeek: 0.4 },
    { tdeeKcal: 500, goalType: 'cut', proteinPreference: 'high', weightKg: 200, goalRateKgPerWeek: -1 },
  ] as const;

  for (const input of cases) {
    assert.deepEqual(calculateTargets(input), legacyCalculateTargets(input));
  }
});

test('calculateTargets delegates the goal-adjusted calories to the shared allocator', () => {
  const input = {
    tdeeKcal: 2400,
    goalType: 'bulk' as const,
    proteinPreference: 'high' as const,
    weightKg: 75,
    goalRateKgPerWeek: 0.25,
  };
  assert.deepEqual(calculateTargets(input), calculateMacrosForCalories({
    targetCalories: input.tdeeKcal + input.goalRateKgPerWeek * 7700 / 7,
    goalType: input.goalType,
    proteinPreference: input.proteinPreference,
    weightKg: input.weightKg,
  }));
});
