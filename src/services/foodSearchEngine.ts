import { normalizeFoodText, rankAndDeduplicateFoodResults } from './foodSearchCore';
import type {
  DedupNearMiss,
  FoodResult,
  FoodSearchMode,
  FoodSearchOutcome,
} from './foodSearchTypes';

interface RemoteSearchResult {
  items: FoodResult[];
  attempts: number;
  failures: number;
}

interface CacheEntry extends RemoteSearchResult {
  createdAt: number;
}

export interface FoodSearchEngineDependencies {
  searchLocal: (query: string) => Promise<FoodResult[]>;
  searchUSDA?: (query: string, mode: FoodSearchMode, signal?: AbortSignal) => Promise<FoodResult[]>;
  searchOpenFoodFacts?: (query: string, signal?: AbortSignal) => Promise<FoodResult[]>;
  now?: () => number;
  onNearMisses?: (nearMisses: DedupNearMiss[]) => void;
  onProviderFailure?: (provider: 'usda' | 'open-food-facts', error: unknown) => void;
}

export interface FoodSearchCacheMetrics {
  hits: number;
  misses: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;

function abortError(): Error {
  const error = new Error('Food search aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

export class FoodSearchEngine {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly now: () => number;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(private readonly dependencies: FoodSearchEngineDependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  getCacheMetrics(): FoodSearchCacheMetrics {
    return { hits: this.cacheHits, misses: this.cacheMisses };
  }

  resetCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  private key(query: string, mode: FoodSearchMode): string {
    return `${mode}:${normalizeFoodText(query)}`;
  }

  private readCache(query: string, mode: FoodSearchMode): RemoteSearchResult | null {
    const keys = mode === 'common'
      ? [this.key(query, 'common'), this.key(query, 'full')]
      : [this.key(query, 'full')];
    for (const key of keys) {
      const entry = this.cache.get(key);
      if (!entry) continue;
      if (this.now() - entry.createdAt >= CACHE_TTL_MS) {
        this.cache.delete(key);
        continue;
      }
      this.cache.delete(key);
      this.cache.set(key, entry);
      this.cacheHits += 1;
      if (mode === 'common' && key.startsWith('full:')) {
        return {
          items: entry.items.filter((item) => item.dataType === 'Survey (FNDDS)'
            || item.dataType === 'SR Legacy'
            || item.dataType === 'Foundation'),
          attempts: 0,
          failures: 0,
        };
      }
      return { items: entry.items, attempts: entry.attempts, failures: entry.failures };
    }
    this.cacheMisses += 1;
    return null;
  }

  private writeCache(query: string, mode: FoodSearchMode, result: RemoteSearchResult): void {
    const key = this.key(query, mode);
    this.cache.delete(key);
    this.cache.set(key, { ...result, createdAt: this.now() });
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest == null) break;
      this.cache.delete(oldest);
    }
  }

  private async settleProvider(
    name: 'usda' | 'open-food-facts',
    provider: (() => Promise<FoodResult[]>) | undefined,
    signal?: AbortSignal,
  ): Promise<RemoteSearchResult> {
    if (!provider) return { items: [], attempts: 0, failures: 0 };
    try {
      return { items: await provider(), attempts: 1, failures: 0 };
    } catch (error) {
      throwIfAborted(signal);
      this.dependencies.onProviderFailure?.(name, error);
      return { items: [], attempts: 1, failures: 1 };
    }
  }

  private async loadRemote(query: string, mode: FoodSearchMode, signal?: AbortSignal): Promise<RemoteSearchResult> {
    const cached = this.readCache(query, mode);
    if (cached) return cached;
    throwIfAborted(signal);

    if (mode === 'common') {
      const common = await this.settleProvider(
        'usda',
        this.dependencies.searchUSDA ? () => this.dependencies.searchUSDA!(query, 'common', signal) : undefined,
        signal,
      );
      throwIfAborted(signal);
      if (common.attempts > 0 && common.failures === 0) this.writeCache(query, mode, common);
      return common;
    }

    const [usda, openFoodFacts] = await Promise.all([
      this.settleProvider(
        'usda',
        this.dependencies.searchUSDA ? () => this.dependencies.searchUSDA!(query, 'full', signal) : undefined,
        signal,
      ),
      this.settleProvider(
        'open-food-facts',
        this.dependencies.searchOpenFoodFacts ? () => this.dependencies.searchOpenFoodFacts!(query, signal) : undefined,
        signal,
      ),
    ]);
    throwIfAborted(signal);
    const result = {
      items: [...usda.items, ...openFoodFacts.items],
      attempts: usda.attempts + openFoodFacts.attempts,
      failures: usda.failures + openFoodFacts.failures,
    };
    if (result.attempts > 0 && result.failures === 0) this.writeCache(query, mode, result);
    return result;
  }

  async searchRemote(query: string, mode: FoodSearchMode = 'common', signal?: AbortSignal): Promise<FoodSearchOutcome> {
    const trimmed = query.trim();
    if (!trimmed) return { kind: 'success', items: [] };
    throwIfAborted(signal);
    const remote = await this.loadRemote(trimmed, mode, signal);
    throwIfAborted(signal);
    const ranked = rankAndDeduplicateFoodResults(remote.items, trimmed, mode);
    this.dependencies.onNearMisses?.(ranked.nearMisses);
    if (remote.attempts === 0 || (remote.failures === remote.attempts && ranked.items.length === 0)) {
      return { kind: 'unavailable', items: [] };
    }
    if (remote.failures > 0) return { kind: 'partial', items: ranked.items };
    return { kind: 'success', items: ranked.items };
  }

  async search(query: string, mode: FoodSearchMode = 'common', signal?: AbortSignal): Promise<FoodSearchOutcome> {
    const trimmed = query.trim();
    if (!trimmed) return { kind: 'success', items: [] };
    throwIfAborted(signal);

    const [localResult, remote] = await Promise.all([
      this.dependencies.searchLocal(trimmed).then(
        (items) => ({ items, attempts: 1, failures: 0 }),
        () => ({ items: [] as FoodResult[], attempts: 1, failures: 1 }),
      ),
      this.loadRemote(trimmed, mode, signal),
    ]);
    throwIfAborted(signal);

    const ranked = rankAndDeduplicateFoodResults([...localResult.items, ...remote.items], trimmed, mode);
    this.dependencies.onNearMisses?.(ranked.nearMisses);
    const attempts = localResult.attempts + remote.attempts;
    const failures = localResult.failures + remote.failures;
    if (failures === attempts && ranked.items.length === 0) return { kind: 'unavailable', items: [] };
    if (failures > 0) return { kind: 'partial', items: ranked.items };
    return { kind: 'success', items: ranked.items };
  }
}
