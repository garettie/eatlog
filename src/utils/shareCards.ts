import type { DailyTarget, FoodLog, MealType } from '../db/database';
import { addCalendarDays, parseLocalISO } from './calendar';

export type MealCardLayout = 'full-bleed' | 'framed' | 'stat';

export interface ShareMacroValue {
  grams: number;
  goalGrams: number | null;
  percentOfGoal: number | null;
}

export interface DaySummaryShareData {
  logDate: string;
  calories: number;
  targetCalories: number | null;
  protein: ShareMacroValue;
  carbs: ShareMacroValue;
  fat: ShareMacroValue;
}

export interface MealShareData {
  mealId: number;
  name: string;
  photoUri: string;
  logDate: string;
  loggedAt: string;
  mealType: MealType;
  calories: number;
  targetCalories: number | null;
  protein: ShareMacroValue;
  carbs: ShareMacroValue;
  fat: ShareMacroValue;
}

export interface StreakDay {
  date: string;
  complete: boolean;
}

export interface StreakShareData {
  endDate: string;
  currentStreak: number;
  longestStreak: number;
  lastSevenDays: StreakDay[];
}

export type ShareContent =
  | { kind: 'day'; data: DaySummaryShareData }
  | { kind: 'meal'; data: MealShareData }
  | { kind: 'streak'; data: StreakShareData };

export type ShareRequest = ShareContent | readonly ShareContent[];

interface MacroTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
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

export function buildDaySummaryShareData(
  logDate: string,
  totals: MacroTotals,
  target: DailyTarget | null,
): DaySummaryShareData {
  parseLocalISO(logDate);
  return {
    logDate,
    calories: Math.abs(totals.calories),
    targetCalories: target?.target_calories ?? null,
    protein: macroValue(totals.protein_g, target?.target_protein_g),
    carbs: macroValue(totals.carbs_g, target?.target_carbs_g),
    fat: macroValue(totals.fat_g, target?.target_fat_g),
  };
}

export function buildMealShareData(
  meal: ShareableMealInput,
  target: DailyTarget | null,
): MealShareData | null {
  const photoUri = meal.photoUri?.trim();
  if (!photoUri || meal.components.length === 0) return null;

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

export function buildStreakShareData(
  endDate: string,
  loggedDates: readonly string[],
): StreakShareData {
  parseLocalISO(endDate);
  const dates = [...new Set(loggedDates)]
    .filter((date) => {
      parseLocalISO(date);
      return date <= endDate;
    })
    .sort();
  const logged = new Set(dates);

  let longestStreak = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of dates) {
    run = previous != null && addCalendarDays(previous, 1) === date ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = date;
  }

  let currentStreak = 0;
  let cursor = logged.has(endDate) ? endDate : addCalendarDays(endDate, -1);
  while (logged.has(cursor)) {
    currentStreak += 1;
    cursor = addCalendarDays(cursor, -1);
  }

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(endDate, index - 6);
    return { date, complete: logged.has(date) };
  });

  return { endDate, currentStreak, longestStreak, lastSevenDays };
}

export function shareContentKey(content: ShareContent): string {
  switch (content.kind) {
    case 'day': return `day-${content.data.logDate}`;
    case 'meal': return `meal-${content.data.mealId}`;
    case 'streak': return `streak-${content.data.endDate}`;
  }
}
