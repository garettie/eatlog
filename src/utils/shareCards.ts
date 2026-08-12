import type { DailyTarget, FoodLog, MealType } from '../db/database';
import shareContract from './shareContract.json';

export const SHARE_IMAGE = shareContract.image as {
  width: number;
  height: number;
  format: 'png';
  mimeType: 'image/png';
  extension: 'png';
};

export type MealCardLayout = 'photo' | 'framed' | 'nutrition';

export interface ShareMacroValue {
  grams: number;
  goalGrams: number | null;
  percentOfGoal: number | null;
}

export interface MealShareData {
  mealId: number;
  name: string;
  photoUri: string | null;
  logDate: string;
  loggedAt: string;
  mealType: MealType;
  calories: number;
  targetCalories: number | null;
  protein: ShareMacroValue;
  carbs: ShareMacroValue;
  fat: ShareMacroValue;
}

interface ShareableMealInput {
  id: number;
  name: string;
  photoUri?: string | null;
  createdAt?: string;
  components: FoodLog[];
}

function macroValue(grams: number, goalGrams: number | null | undefined): ShareMacroValue {
  const safeGrams = Math.abs(grams);
  const safeGoal = goalGrams != null && goalGrams > 0 ? goalGrams : null;
  return {
    grams: safeGrams,
    goalGrams: safeGoal,
    percentOfGoal: safeGoal == null ? null : safeGrams / safeGoal,
  };
}

export function buildMealShareData(
  meal: ShareableMealInput,
  target: DailyTarget | null,
): MealShareData | null {
  if (meal.components.length === 0) return null;
  const photoUri = meal.photoUri?.trim() || null;

  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const component of meal.components) {
    calories += Math.abs(component.calories);
    protein += Math.abs(component.protein_g);
    carbs += Math.abs(component.carbs_g);
    fat += Math.abs(component.fat_g);
  }

  const firstComponent = meal.components[0];
  const loggedAt = meal.createdAt?.trim() || firstComponent.logged_at;

  return {
    mealId: meal.id,
    name: meal.name.trim() || 'Meal',
    photoUri,
    logDate: firstComponent.log_date,
    loggedAt,
    mealType: firstComponent.meal,
    calories,
    targetCalories: target?.target_calories ?? null,
    protein: macroValue(protein, target?.target_protein_g),
    carbs: macroValue(carbs, target?.target_carbs_g),
    fat: macroValue(fat, target?.target_fat_g),
  };
}
