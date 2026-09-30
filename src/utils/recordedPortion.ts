import type { FoodResult } from '../services/foodSearchTypes';
import { selectedServing, type PortionSelection } from './portionSelection';

/** Unknown-mass amounts use 100 as a calculation reference, never a physical weight. */
export function recordedPortionValues(
  food: FoodResult,
  selection: PortionSelection,
  per100g: { calories: number; protein: number; carbs: number; fat: number },
) {
  const unknown = food.unknownMass;
  const serving = selectedServing(food, selection);
  const ratio = selection.grams / 100;
  return {
    grams_logged: unknown ? null : selection.grams,
    serving_size_g: unknown ? null : serving?.grams ?? null,
    serving_label: unknown?.unit ?? serving?.label ?? null,
    portion_quantity: unknown ? ratio * unknown.quantity : null,
    portion_unit: unknown?.unit ?? null,
    calories_per_100g: unknown ? null : per100g.calories,
    protein_g_per_100g: unknown ? null : per100g.protein,
    carbs_g_per_100g: unknown ? null : per100g.carbs,
    fat_g_per_100g: unknown ? null : per100g.fat,
    calories: per100g.calories * ratio,
    protein_g: per100g.protein * ratio,
    carbs_g: per100g.carbs * ratio,
    fat_g: per100g.fat * ratio,
  };
}
