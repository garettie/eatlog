import type { MacroTargets } from './calculations';
import {
  NUTRITION_SAFETY_POLICY,
  validateMacroTargets,
  type TargetSafetyContext,
} from './nutritionSafety';

export const MANUAL_TARGET_CALORIE_TOLERANCE = NUTRITION_SAFETY_POLICY.macroCalorieToleranceKcal;

export function macroCalories(targets: Pick<MacroTargets, 'targetProteinG' | 'targetFatG' | 'targetCarbsG'>): number {
  return targets.targetProteinG * 4 + targets.targetFatG * 9 + targets.targetCarbsG * 4;
}

export function validateManualTargets(
  targets: MacroTargets,
  context: TargetSafetyContext & { tdeeEstimate?: number } = {},
): string | null {
  return validateMacroTargets({
    target_calories: targets.targetCalories,
    target_protein_g: targets.targetProteinG,
    target_fat_g: targets.targetFatG,
    target_carbs_g: targets.targetCarbsG,
  }, context);
}
