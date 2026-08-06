import {
  mergeUSDAFoodPortions,
  parseOpenFoodFactsProducts,
  parseUSDAFoods,
  rankAndDeduplicateFoodResults,
  rewriteFoodProviderQuery,
} from './foodSearchCore';
import type { FoodResult } from './foodSearchTypes';

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';
const OFF_BASE = 'https://world.openfoodfacts.org';
const SEARCH_TIMEOUT_MS = 8000;
const DETAIL_TIMEOUT_MS = 5000;

export interface FoodSearchRemoteMetrics {
  usdaRequests: number;
  firstRateLimitRemaining: number | null;
  lastRateLimitRemaining: number | null;
}

interface RemoteProviderOptions {
  usdaApiKey: string;
  fetchImpl?: typeof fetch;
}

function abortError(): Error {
  const error = new Error('Food search aborted');
  error.name = 'AbortError';
  return error;
}

async function fetchJSON(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
  options: RequestInit = {},
  externalSignal?: AbortSignal,
): Promise<{ body: any; response: Response }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (externalSignal?.aborted) throw abortError();
  externalSignal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 240);
      throw new Error(`Food search request failed: ${response.status}${detail ? ` — ${detail}` : ''}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) throw new Error('Food search returned a non-JSON response');
    return { body: await response.json(), response };
  } catch (error) {
    if (externalSignal?.aborted) throw abortError();
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abort);
  }
}

export function createFoodSearchRemoteProviders(options: RemoteProviderOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let metrics: FoodSearchRemoteMetrics = {
    usdaRequests: 0,
    firstRateLimitRemaining: null,
    lastRateLimitRemaining: null,
  };

  function observeUSDA(response: Response): void {
    const rawRemaining = response.headers.get('x-ratelimit-remaining');
    const remaining = rawRemaining == null ? null : Number(rawRemaining);
    if (!Number.isFinite(remaining)) return;
    if (metrics.firstRateLimitRemaining == null) metrics.firstRateLimitRemaining = remaining;
    metrics.lastRateLimitRemaining = remaining;
  }

  async function fetchUSDA(
    path: string,
    timeoutMs: number,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<any> {
    const separator = path.includes('?') ? '&' : '?';
    metrics.usdaRequests += 1;
    const result = await fetchJSON(
      fetchImpl,
      `${USDA_BASE}${path}${separator}api_key=${encodeURIComponent(options.usdaApiKey)}`,
      timeoutMs,
      init,
      signal,
    );
    observeUSDA(result.response);
    return result.body;
  }

  async function searchCommon(query: string, signal?: AbortSignal): Promise<FoodResult[]> {
    const criteria = {
      query: rewriteFoodProviderQuery(query),
      pageSize: 50,
      pageNumber: 1,
      dataType: ['Survey (FNDDS)', 'SR Legacy', 'Foundation'],
    };
    const body = await fetchUSDA('/foods/search', SEARCH_TIMEOUT_MS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(criteria),
    }, signal);
    const parsed = parseUSDAFoods(body?.foods);
    const preliminary = rankAndDeduplicateFoodResults(parsed, query, 'common').items;
    const fdcIds = preliminary.slice(0, 10).map((item) => Number(item.sourceFoodId)).filter(Number.isFinite);
    if (fdcIds.length === 0) return parsed;
    try {
      const details = await fetchUSDA('/foods', DETAIL_TIMEOUT_MS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fdcIds, format: 'full' }),
      }, signal);
      return mergeUSDAFoodPortions(parsed, details);
    } catch (error) {
      if (signal?.aborted) throw error;
      return parsed;
    }
  }

  async function searchBranded(query: string, signal?: AbortSignal): Promise<FoodResult[]> {
    const criteria = {
      query: rewriteFoodProviderQuery(query),
      pageSize: 12,
      pageNumber: 1,
      dataType: ['Branded'],
    };
    const body = await fetchUSDA('/foods/search', SEARCH_TIMEOUT_MS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(criteria),
    }, signal);
    return parseUSDAFoods(body?.foods);
  }

  async function searchOpenFoodFacts(query: string, signal?: AbortSignal): Promise<FoodResult[]> {
    const params = new URLSearchParams({
      action: 'process',
      search_simple: '1',
      search_terms: rewriteFoodProviderQuery(query),
      json: '1',
      page_size: '15',
      fields: 'product_name,code,brands,nutriments,serving_quantity',
    });
    const { body } = await fetchJSON(fetchImpl, `${OFF_BASE}/cgi/search.pl?${params.toString()}`, SEARCH_TIMEOUT_MS, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Eatlog/1.1.0 (Android; https://github.com/garettie/eatlog)',
      },
    }, signal);
    return parseOpenFoodFactsProducts(body?.products);
  }

  return {
    searchCommon: options.usdaApiKey ? searchCommon : undefined,
    searchBranded: options.usdaApiKey ? searchBranded : undefined,
    searchOpenFoodFacts,
    getMetrics: (): FoodSearchRemoteMetrics => ({ ...metrics }),
    resetMetrics: () => {
      metrics = { usdaRequests: 0, firstRateLimitRemaining: null, lastRateLimitRemaining: null };
    },
  };
}
