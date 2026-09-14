import catalog from '../data/commonFoods.json';
import { buildFoodPortions, normalizeFoodName, rankAndDeduplicateFoodResults } from './foodSearchCore';
import type { DataType, FoodResult } from './foodSearchTypes';

interface CommonFoodRecord {
  id: string;
  fdcId: number;
  name: string;
  aliases: string[];
  dataType: DataType;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  portions: { id: string; label: string; grams: number }[];
  defaultPortionId: string;
}

export const commonFoods: FoodResult[] = (catalog as CommonFoodRecord[]).map((food) => {
  const portions = buildFoodPortions(food.portions);
  const serving = portions.find((portion) => portion.id === food.defaultPortionId) ?? portions[0];
  return {
    // Distinct from the remote `usda-<fdcId>` id; the shared fdcId merges the two during ranking.
    id: `common-${food.id}`,
    name: food.name,
    source: 'usda',
    sourceFoodId: String(food.fdcId),
    dataType: food.dataType,
    brand: null,
    ...normalizeFoodName(food.name, null),
    caloriesPer100g: food.caloriesPer100g,
    proteinPer100g: food.proteinPer100g,
    carbsPer100g: food.carbsPer100g,
    fatPer100g: food.fatPer100g,
    portions,
    defaultAmount: { kind: 'serving', grams: serving.grams, servingId: serving.id },
    alternateSourceIds: [],
    isCommonFood: true,
    aliases: food.aliases,
  };
});

export function searchCommonFoods(query: string): FoodResult[] {
  // An empty query matches everything, which would flood the pinned and recent view.
  if (query.trim().length < 2) return [];
  return rankAndDeduplicateFoodResults(commonFoods, query, 'common').items;
}
