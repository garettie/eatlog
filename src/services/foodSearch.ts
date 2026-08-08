import { serviceConfig } from '../config/services';
import { getFoodHistoryRows, getPinnedFoodKeys } from '../db/database';
import { buildPersonalFoodResults, rankAndDeduplicateFoodResults } from './foodSearchCore';
import { FoodSearchEngine } from './foodSearchEngine';
import { createFoodSearchRemoteProviders } from './foodSearchRemote';
import type { DedupNearMiss, FoodResult, FoodSearchMode, FoodSearchOutcome } from './foodSearchTypes';

export type {
  DataType,
  FoodHistoryMetadata,
  FoodPortion,
  FoodResult,
  FoodSearchMode,
  FoodSearchOutcome,
} from './foodSearchTypes';

let latestNearMisses: DedupNearMiss[] = [];
const remote = createFoodSearchRemoteProviders({ workerUrl: serviceConfig.foodWorkerUrl });

export async function searchPersonalFoods(query: string): Promise<FoodResult[]> {
  const [rows, pinnedKeys] = await Promise.all([getFoodHistoryRows(), getPinnedFoodKeys()]);
  const personal = buildPersonalFoodResults(rows, pinnedKeys);
  return rankAndDeduplicateFoodResults(personal, query, 'common').items;
}

const engine = new FoodSearchEngine({
  searchLocal: searchPersonalFoods,
  searchUSDA: remote.searchUSDA,
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

export async function searchRemoteFood(
  query: string,
  mode: FoodSearchMode = 'common',
  signal?: AbortSignal,
): Promise<FoodSearchOutcome> {
  return engine.searchRemote(query, mode, signal);
}

export function combineFoodSearchResults(
  personal: FoodResult[],
  remoteItems: FoodResult[],
  query: string,
  mode: FoodSearchMode,
): FoodResult[] {
  return rankAndDeduplicateFoodResults([...personal, ...remoteItems], query, mode).items;
}

export async function loadFoodDetails(food: FoodResult, signal?: AbortSignal): Promise<FoodResult> {
  if (food.source !== 'usda' || food.history || !remote.loadUSDAFood) return food;
  const detail = await remote.loadUSDAFood(food.sourceFoodId, signal);
  return detail ? { ...food, ...detail, id: food.id, providerOrder: food.providerOrder } : food;
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
