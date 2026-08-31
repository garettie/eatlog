import type { ActivityLevel, GoalType, MealType, ProteinPreference, Sex } from '../db/database';
import {
  ageFromLocalBirthDate,
  minimumSafeCalories,
  NUTRITION_SAFETY_POLICY,
  validateGoalRate,
  validateHeightCm,
  validateMacroTargets,
  validateTarget,
  validateWeightKg,
  NutritionSafetyError,
} from './nutritionSafety';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const PROTEIN_BASE_G_PER_KG: Record<GoalType, number> = {
  cut: 2.1,
  maintain: 1.8,
  bulk: 1.7,
};

const PROTEIN_PREFERENCE_OFFSET: Record<ProteinPreference, number> = {
  low: -0.2,
  moderate: 0,
  high: 0.2,
  extra_high: 0.4,
};

export interface MacroTargets {
  targetCalories: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbsG: number;
}

export function targetOverflowProgress(value: number, target: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.min(1, Math.max(0, (value - target) / target));
}

export function ageFromBirthDate(birthDate: string): number {
  return ageFromLocalBirthDate(birthDate);
}

export function calcBMR(params: {
  sex: Sex;
  weight_kg: number;
  height_cm: number;
  age: number;
}): number {
  const { sex, weight_kg, height_cm, age } = params;
  if (sex !== 'male' && sex !== 'female') throw new NutritionSafetyError('Sex is invalid.');
  if (!Number.isInteger(age)
    || age < NUTRITION_SAFETY_POLICY.minimumAge
    || age > NUTRITION_SAFETY_POLICY.maximumAge) {
    throw new NutritionSafetyError(
      `Age must be between ${NUTRITION_SAFETY_POLICY.minimumAge} and ${NUTRITION_SAFETY_POLICY.maximumAge}.`,
    );
  }
  const weightIssue = validateWeightKg(weight_kg, 'Current weight');
  if (weightIssue) throw new NutritionSafetyError(weightIssue);
  const heightIssue = validateHeightCm(height_cm);
  if (heightIssue) throw new NutritionSafetyError(heightIssue);
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  const bmr = sex === 'male' ? base + 5 : base - 161;
  if (!Number.isFinite(bmr) || bmr <= 0) throw new NutritionSafetyError('BMR must be finite and positive.');
  return bmr;
}

export function calcTDEE(bmr: number, activityLevel: ActivityLevel): number {
  if (!Number.isFinite(bmr) || bmr <= 0) throw new NutritionSafetyError('BMR must be finite and positive.');
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  if (!Number.isFinite(multiplier)) throw new NutritionSafetyError('Activity level is invalid.');
  const tdee = bmr * multiplier;
  if (!Number.isFinite(tdee) || tdee <= 0) throw new NutritionSafetyError('TDEE must be finite and positive.');
  return tdee;
}

export function calculateMacrosForCalories(input: {
  targetCalories: number;
  goalType: GoalType;
  proteinPreference: ProteinPreference;
  weightKg: number;
}): MacroTargets {
  if (!Number.isFinite(input.targetCalories)) throw new NutritionSafetyError('Calories must be finite.');
  const weightIssue = validateWeightKg(input.weightKg, 'Current weight');
  if (weightIssue) throw new NutritionSafetyError(weightIssue);
  // Clamp into the safe band: never below the macro-floor-feasible minimum, never
  // above the 6000 kcal ceiling. Out-of-band bodies (tiny/huge) get the nearest
  // safe plan instead of a hard onboarding block.
  const targetCalories = Math.min(
    NUTRITION_SAFETY_POLICY.maximumCalories,
    Math.max(minimumSafeCalories(input.weightKg), Math.round(input.targetCalories)),
  );
  if (!['cut', 'maintain', 'bulk'].includes(input.goalType)) {
    throw new NutritionSafetyError('Goal type is invalid.');
  }
  if (!['low', 'moderate', 'high', 'extra_high'].includes(input.proteinPreference)) {
    throw new NutritionSafetyError('Protein preference is invalid.');
  }
  const baseGPerKg = PROTEIN_BASE_G_PER_KG[input.goalType];
  const offset = PROTEIN_PREFERENCE_OFFSET[input.proteinPreference];
  const adjustedGPerKg = Math.max(baseGPerKg + offset, NUTRITION_SAFETY_POLICY.minimumProteinGPerKg);
  const minProteinG = input.weightKg * NUTRITION_SAFETY_POLICY.minimumProteinGPerKg;
  const minFatG = targetCalories * NUTRITION_SAFETY_POLICY.minimumFatEnergyFraction / 9;
  const minCarbsG = NUTRITION_SAFETY_POLICY.minimumCarbsG;
  const remainingCarbs = (proteinG: number, fatG: number) =>
    Math.round((targetCalories - proteinG * 4 - fatG * 9) / 4 * 10) / 10;
  const atLeastTenths = (value: number, floor: number) => {
    let grams = Math.round(value * 10) / 10;
    while (grams < floor) grams = Math.round((grams + 0.1) * 10) / 10;
    return grams;
  };

  let targetProteinG = Math.round(input.weightKg * adjustedGPerKg * 10) / 10;
  let targetFatG = Math.round((targetCalories * 0.25) / 9 * 10) / 10;
  let targetCarbsG = remainingCarbs(targetProteinG, targetFatG);

  if (targetCarbsG < minCarbsG) {
    const fatForCarbFloor = (targetCalories - targetProteinG * 4 - minCarbsG * 4) / 9;
    targetFatG = atLeastTenths(Math.max(minFatG, Math.min(targetFatG, fatForCarbFloor)), minFatG);
    targetCarbsG = remainingCarbs(targetProteinG, targetFatG);
  }
  if (targetCarbsG < minCarbsG) {
    const proteinForCarbFloor = (targetCalories - targetFatG * 9 - minCarbsG * 4) / 4;
    targetProteinG = atLeastTenths(
      Math.max(minProteinG, Math.min(targetProteinG, proteinForCarbFloor)),
      minProteinG,
    );
    targetCarbsG = remainingCarbs(targetProteinG, targetFatG);
  }
  // Rounding protein/fat to tenths can overshoot and leave carbs a tenth under the
  // floor even when a feasible split exists; reclaim that tenth from whichever
  // macro still has slack above its own floor.
  while (targetCarbsG < minCarbsG && Math.round((targetProteinG - 0.1) * 10) / 10 >= minProteinG) {
    targetProteinG = Math.round((targetProteinG - 0.1) * 10) / 10;
    targetCarbsG = remainingCarbs(targetProteinG, targetFatG);
  }
  while (targetCarbsG < minCarbsG && Math.round((targetFatG - 0.1) * 10) / 10 >= minFatG) {
    targetFatG = Math.round((targetFatG - 0.1) * 10) / 10;
    targetCarbsG = remainingCarbs(targetProteinG, targetFatG);
  }
  const targets = {
    targetCalories,
    targetProteinG,
    targetFatG,
    targetCarbsG,
  };
  const issue = validateMacroTargets({
    target_calories: targets.targetCalories,
    target_protein_g: targets.targetProteinG,
    target_fat_g: targets.targetFatG,
    target_carbs_g: targets.targetCarbsG,
  }, { referenceWeightKg: input.weightKg });
  if (issue) throw new NutritionSafetyError(issue);
  return targets;
}

export function calculateTargets(input: {
  tdeeKcal: number;
  goalType: GoalType;
  proteinPreference: ProteinPreference;
  weightKg: number;
  goalRateKgPerWeek: number;
}): MacroTargets {
  if (!Number.isFinite(input.tdeeKcal) || input.tdeeKcal <= 0) {
    throw new NutritionSafetyError('TDEE must be finite and positive.');
  }
  const rateIssue = validateGoalRate(input.goalRateKgPerWeek, input.goalType, input.weightKg);
  if (rateIssue) throw new NutritionSafetyError(rateIssue);
  const weeklyAdjustment = input.goalRateKgPerWeek * 7700;
  const goalAdjustment = weeklyAdjustment / 7;
  const macros = calculateMacrosForCalories({
    targetCalories: Math.round(input.tdeeKcal + goalAdjustment),
    goalType: input.goalType,
    proteinPreference: input.proteinPreference,
    weightKg: input.weightKg,
  });
  const issue = validateTarget({
    tdee_estimate: input.tdeeKcal,
    target_calories: macros.targetCalories,
    target_protein_g: macros.targetProteinG,
    target_fat_g: macros.targetFatG,
    target_carbs_g: macros.targetCarbsG,
  }, { goalType: input.goalType, referenceWeightKg: input.weightKg });
  if (issue) throw new NutritionSafetyError(issue);
  return macros;
}

/** Infer the most likely meal from the current time of day. */
export function defaultMealForNow(now: Date = new Date()): MealType {
  const h = now.getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 22) return 'dinner';
  return 'snack';
}

export function ftInToCm(feet: number, inches: number): number {
  return Math.round(((feet * 12 + inches) * 2.54) * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round(lbs * 0.453592 * 10) / 10;
}

export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { feet, inches };
}

export function kgToLbs(kg: number): number {
  return Math.round(kg / 0.453592 * 10) / 10;
}
