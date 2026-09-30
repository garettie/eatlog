import type { ExportMeal, FoodLog, WeightLog } from '../db/database';

export interface CsvRecordLink {
  record_type: 'meal' | 'weight';
  source_id: string;
  meal_id: number | null;
  food_log_id: number | null;
  weight_log_id: number | null;
  original_row_json: string | null;
  native_fingerprint: string | null;
}

function foodValues(food: FoodLog): unknown[] {
  return [food.name, food.source, food.source_food_id, food.meal, food.brand, food.data_type,
    food.preparation, food.grams_logged, food.portion_quantity ?? null, food.portion_unit ?? null, food.serving_size_g, food.serving_label,
    food.calories_per_100g, food.protein_g_per_100g, food.carbs_g_per_100g, food.fat_g_per_100g,
    food.calories, food.protein_g, food.carbs_g, food.fat_g, food.logged_at];
}

// Exact canonical values avoid hash collisions and exclude device-local row ids.
export function fingerprintMeal(
  meal: Pick<ExportMeal, 'name' | 'log_date' | 'meal_type' | 'created_at'>,
  foods: readonly FoodLog[],
): string {
  return JSON.stringify([meal.name, meal.log_date, meal.meal_type, meal.created_at, foods.map(foodValues)]);
}

export function fingerprintFood(food: FoodLog): string {
  return JSON.stringify([food.log_date, foodValues(food)]);
}

export function fingerprintWeight(weight: Pick<WeightLog, 'log_date' | 'scale_weight_kg'>): string {
  return JSON.stringify([weight.log_date, weight.scale_weight_kg]);
}
