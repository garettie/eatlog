import { serviceConfig } from '../config/services';
import { getFoodHistoryRows, getPinnedFoodKeys } from '../db/database';
import { searchCommonFoods } from './commonFoods';
import { buildPersonalFoodResults, loadUSDAFoodDetails, rankAndDeduplicateFoodResults } from './foodSearchCore';
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
const remote = createFoodSearchRemoteProviders({
  workerUrl: serviceConfig.foodWorkerUrl,
  openFoodFactsUserAgent: serviceConfig.openFoodFactsUserAgent,
});

export async function searchLocalFoods(query: string): Promise<FoodResult[]> {
  const [rows, pinnedKeys] = await Promise.all([getFoodHistoryRows(), getPinnedFoodKeys()]);
  const personal = buildPersonalFoodResults(rows, pinnedKeys);
  return rankAndDeduplicateFoodResults([...personal, ...searchCommonFoods(query)], query, 'common').items;
}

const engine = new FoodSearchEngine({
  searchLocal: searchLocalFoods,
  searchUSDA: remote.searchUSDA,
  searchOpenFoodFacts: serviceConfig.availability.openFoodFacts ? remote.searchOpenFoodFacts : undefined,
  onNearMisses: (nearMisses) => { latestNearMisses = nearMisses; },
});

async function searchFood(
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
  return loadUSDAFoodDetails(food, remote.loadUSDAFood, signal);
}

function getFoodSearchDiagnostics() {
  return {
    ...remote.getMetrics(),
    cache: engine.getCacheMetrics(),
    nearMisses: latestNearMisses,
  };
}

function resetFoodSearchDiagnostics(): void {
  remote.resetMetrics();
  engine.resetCache();
  latestNearMisses = [];
}
