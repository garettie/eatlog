import type { ActivityLevel, GoalType, MealType, ProteinPreference, Sex } from '../db/database';

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

export function ageFromBirthDate(birthDate: string): number {
  const today = new Date();
  const dob = new Date(birthDate);
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export function calcBMR(params: {
  sex: Sex;
  weight_kg: number;
  height_cm: number;
  age: number;
}): number {
  const { sex, weight_kg, height_cm, age } = params;
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function calcTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel];
}

export function calculateMacrosForCalories(input: {
  targetCalories: number;
  goalType: GoalType;
  proteinPreference: ProteinPreference;
  weightKg: number;
}): MacroTargets {
  let targetCalories = input.targetCalories;
  const baseGPerKg = PROTEIN_BASE_G_PER_KG[input.goalType];
  const offset = PROTEIN_PREFERENCE_OFFSET[input.proteinPreference];
  const adjustedGPerKg = Math.max(baseGPerKg + offset, 1.2);
  const targetProteinG = Math.round(input.weightKg * adjustedGPerKg * 10) / 10;
  const targetFatG = Math.round((targetCalories * 0.25) / 9 * 10) / 10;
  const remainingKcal = targetCalories - targetProteinG * 4 - targetFatG * 9;

  let targetCarbsG: number;
  if (remainingKcal < 50 * 4) {
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

export function calculateTargets(input: {
  tdeeKcal: number;
  goalType: GoalType;
  proteinPreference: ProteinPreference;
  weightKg: number;
  goalRateKgPerWeek: number;
}): MacroTargets {
  const weeklyAdjustment = input.goalRateKgPerWeek * 7700;
  const goalAdjustment = weeklyAdjustment / 7;
  return calculateMacrosForCalories({
    targetCalories: input.tdeeKcal + goalAdjustment,
    goalType: input.goalType,
    proteinPreference: input.proteinPreference,
    weightKg: input.weightKg,
  });
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
