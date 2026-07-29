import type { MacroTargets } from './calculations';

export const MANUAL_TARGET_CALORIE_TOLERANCE = 50;

export function macroCalories(targets: Pick<MacroTargets, 'targetProteinG' | 'targetFatG' | 'targetCarbsG'>): number {
  return targets.targetProteinG * 4 + targets.targetFatG * 9 + targets.targetCarbsG * 4;
}

export function validateManualTargets(targets: MacroTargets): string | null {
  const values = [targets.targetCalories, targets.targetProteinG, targets.targetFatG, targets.targetCarbsG];
  if (!values.every((value) => Number.isFinite(value) && value >= 0)) return 'Enter non-negative calories and macro values.';
  if (targets.targetCalories < 800 || targets.targetCalories > 6000) return 'Calories must be between 800 and 6,000 kcal.';
  if (Math.abs(macroCalories(targets) - targets.targetCalories) > MANUAL_TARGET_CALORIE_TOLERANCE) {
    return `Macro calories must be within ${MANUAL_TARGET_CALORIE_TOLERANCE} kcal of the calorie target.`;
  }
  return null;
}
