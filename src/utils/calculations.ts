import type { ActivityLevel, GoalType, MealType, ProteinPreference, Sex } from '../db/database';
import {
  ageFromLocalBirthDate,
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
  const targetCalories = Math.round(input.targetCalories);
  if (targetCalories < NUTRITION_SAFETY_POLICY.minimumCalories
    || targetCalories > NUTRITION_SAFETY_POLICY.maximumCalories) {
    throw new NutritionSafetyError(
      `Calories must be between ${NUTRITION_SAFETY_POLICY.minimumCalories} and ${NUTRITION_SAFETY_POLICY.maximumCalories} kcal.`,
    );
  }
  const weightIssue = validateWeightKg(input.weightKg, 'Current weight');
  if (weightIssue) throw new NutritionSafetyError(weightIssue);
  if (!['cut', 'maintain', 'bulk'].includes(input.goalType)) {
    throw new NutritionSafetyError('Goal type is invalid.');
  }
  if (!['low', 'moderate', 'high', 'extra_high'].includes(input.proteinPreference)) {
    throw new NutritionSafetyError('Protein preference is invalid.');
  }
  const baseGPerKg = PROTEIN_BASE_G_PER_KG[input.goalType];
  const offset = PROTEIN_PREFERENCE_OFFSET[input.proteinPreference];
  const adjustedGPerKg = Math.max(baseGPerKg + offset, NUTRITION_SAFETY_POLICY.minimumProteinGPerKg);
  const targetProteinG = Math.round(input.weightKg * adjustedGPerKg * 10) / 10;
  const targetFatG = Math.round((targetCalories * 0.25) / 9 * 10) / 10;
  const remainingKcal = targetCalories - targetProteinG * 4 - targetFatG * 9;
  const targetCarbsG = Math.round(remainingKcal / 4 * 10) / 10;
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
