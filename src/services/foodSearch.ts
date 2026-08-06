import { serviceConfig } from '../config/services';
import { searchFoodCache } from '../db/database';
import { normalizeFoodText } from './foodSearchCore';
import { FoodSearchEngine } from './foodSearchEngine';
import { createFoodSearchRemoteProviders } from './foodSearchRemote';
import type { DedupNearMiss, FoodResult, FoodSearchMode, FoodSearchOutcome } from './foodSearchTypes';

export type {
  DataType,
  FoodResult,
  FoodSearchMode,
  FoodSearchOutcome,
} from './foodSearchTypes';

let latestNearMisses: DedupNearMiss[] = [];
const remote = createFoodSearchRemoteProviders({ usdaApiKey: serviceConfig.usdaApiKey });

async function searchLocalCache(query: string): Promise<FoodResult[]> {
  const normalizedQuery = normalizeFoodText(query);
  const rows = await searchFoodCache(normalizedQuery);
  return rows.map((row, providerOrder) => ({
    id: `cache-${row.id}`,
    name: row.name,
    source: row.source,
    sourceFoodId: String(row.id),
    dataType: row.source,
    brand: row.brand,
    preparation: row.preparation,
    normalizedName: row.normalizedName,
    searchText: [row.name, row.normalizedName, row.brand].filter(Boolean).join(' '),
    providerOrder,
    caloriesPer100g: row.calories_per_100g,
    proteinPer100g: row.protein_g_per_100g,
    carbsPer100g: row.carbs_g_per_100g,
    fatPer100g: row.fat_g_per_100g,
    servingSizeGrams: row.serving_size_g,
    servingLabel: row.serving_label,
    alternateSourceIds: [],
  }));
}

const engine = new FoodSearchEngine({
  searchLocal: searchLocalCache,
  searchCommon: remote.searchCommon,
  searchBranded: remote.searchBranded,
  searchOpenFoodFacts: serviceConfig.availability.openFoodFacts ? remote.searchOpenFoodFacts : undefined,
  onNearMisses: (nearMisses) => { latestNearMisses = nearMisses; },
});

export async function searchFood(
  query: string,
  mode: FoodSearchMode = 'common',
  signal?: AbortSignal,
): Promise<FoodSearchOutcome> {
  return engine.search(query, mode, signal);
}

export function getFoodSearchDiagnostics() {
  return {
    ...remote.getMetrics(),
    cache: engine.getCacheMetrics(),
    nearMisses: latestNearMisses,
  };
}

export function resetFoodSearchDiagnostics(): void {
  remote.resetMetrics();
  engine.resetCache();
  latestNearMisses = [];
}
