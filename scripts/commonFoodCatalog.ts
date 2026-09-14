import { normalizeFoodName, normalizeFoodText, parseUSDAFoods } from '../src/services/foodSearchCore';

export interface CommonFoodSeed {
  id: string;
  fdcId: number;
  name: string;
  aliases: string[];
  portions: { id: string; label: string; usdaPortionId: number }[];
  defaultPortionId: string;
}

interface UsdaPortion {
  id: number;
  gramWeight: number;
  amount?: number;
  portionDescription?: string;
  modifier?: string;
  measureUnitName?: string;
}

function portionWords(value: string): string[] {
  return normalizeFoodText(value).split(' ').map((word) => ({
    tbsp: 'tablespoon', tablespoons: 'tablespoon', tsp: 'teaspoon', teaspoons: 'teaspoon',
    cups: 'cup', slices: 'slice', ounces: 'oz', ounce: 'oz', eggs: 'egg',
  }[word] ?? word));
}

function leadingAmount(label: string): number | null {
  const match = label.match(/^(\d+(?:\.\d+)?)(?:\/(\d+))?\b/);
  if (!match) return null;
  const value = Number(match[1]) / (match[2] ? Number(match[2]) : 1);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function validateSeeds(seeds: CommonFoodSeed[]): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  const fdcIds = new Set<number>();
  for (const seed of seeds) {
    const name = normalizeFoodName(seed.name, null).normalizedName;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seed.id) || !name
      || !Number.isSafeInteger(seed.fdcId) || seed.fdcId <= 0
      || ids.has(seed.id) || names.has(name) || fdcIds.has(seed.fdcId)) {
      throw new Error(`Invalid or duplicate common food: ${seed.id}`);
    }
    ids.add(seed.id); names.add(name); fdcIds.add(seed.fdcId);
    if (!Array.isArray(seed.aliases) || seed.aliases.some((alias) => typeof alias !== 'string' || !alias.trim())
      || !seed.portions.length || !seed.portions.some((portion) => portion.id === seed.defaultPortionId)
      || new Set(seed.portions.map((portion) => portion.id)).size !== seed.portions.length
      || seed.portions.some((portion) => !/^[a-z0-9_-]+$/.test(portion.id))) {
      throw new Error(`Invalid aliases or portions: ${seed.id}`);
    }
  }
}

export function buildCommonFood(seed: CommonFoodSeed, detail: Record<string, unknown>) {
  if (detail.fdcId !== seed.fdcId) throw new Error(`Wrong USDA record: ${seed.id}`);
  const food = parseUSDAFoods([detail])[0];
  if (!food || food.dataType === 'Branded') throw new Error(`Unusable USDA record: ${seed.id}`);
  const portions = seed.portions.map((portion) => {
    const source = (detail.foodPortions as UsdaPortion[] | undefined)?.find((item) => item.id === portion.usdaPortionId);
    if (!source || !Number.isFinite(source.gramWeight) || source.gramWeight <= 0) {
      throw new Error(`Missing USDA portion: ${seed.id}/${portion.id}`);
    }
    const sourceLabel = source.portionDescription ?? '';
    const expectedAmount = source.amount ?? leadingAmount(sourceLabel);
    const amount = leadingAmount(portion.label);
    const sourceWords = portionWords([sourceLabel, source.modifier, source.measureUnitName].filter(Boolean).join(' '));
    const labelWords = portionWords(portion.label.replace(/^\d+(?:\.\d+)?(?:\/\d+)?\s*/, '')).filter(Boolean);
    if (amount == null || expectedAmount !== amount || !labelWords.length
      || !labelWords.every((word) => sourceWords.includes(word))) {
      throw new Error(`USDA portion label mismatch: ${seed.id}/${portion.label}`);
    }
    return { ...portion, grams: source.gramWeight };
  });
  const macros = [food.caloriesPer100g, food.proteinPer100g, food.carbsPer100g, food.fatPer100g];
  if (macros.some((value) => value == null || !Number.isFinite(value) || value < 0)) {
    throw new Error(`Invalid USDA macros: ${seed.id}`);
  }
  return {
    ...seed, dataType: food.dataType as 'Survey (FNDDS)' | 'SR Legacy' | 'Foundation',
    caloriesPer100g: food.caloriesPer100g!, proteinPer100g: food.proteinPer100g!,
    carbsPer100g: food.carbsPer100g!, fatPer100g: food.fatPer100g!, portions,
  };
}
