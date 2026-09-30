import type { FoodLog } from '../db/database';

export function editedPortionAmount(food: FoodLog): number {
  return food.grams_logged ?? food.portion_quantity ?? 1;
}

export function portionRatio(food: FoodLog, amount: number): number {
  if (food.grams_logged == null) return amount / (food.portion_quantity || 1);
  if (food.grams_logged > 0) return amount / food.grams_logged;
  if (food.calories_per_100g != null) return amount / 100;
  return 1;
}

export function editedPortionValues(food: FoodLog, amount: number) {
  const ratio = portionRatio(food, amount);
  const unknownMass = food.grams_logged == null;
  const calories = food.calories * ratio;
  const protein = food.protein_g * ratio;
  const carbs = food.carbs_g * ratio;
  const fat = food.fat_g * ratio;
  return {
    grams_logged: unknownMass ? null : amount,
    portion_quantity: unknownMass ? amount : food.portion_quantity,
    calories: unknownMass ? calories : Math.round(calories),
    protein_g: unknownMass ? protein : Math.round(protein * 10) / 10,
    carbs_g: unknownMass ? carbs : Math.round(carbs * 10) / 10,
    fat_g: unknownMass ? fat : Math.round(fat * 10) / 10,
  };
}
