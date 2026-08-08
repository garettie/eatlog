import {
  parseOpenFoodFactsProducts,
  parseUSDAFoods,
  rewriteFoodProviderQuery,
} from './foodSearchCore';
import type { FoodResult, FoodSearchMode } from './foodSearchTypes';

const OFF_BASE = 'https://world.openfoodfacts.org';
const SEARCH_TIMEOUT_MS = 8000;

export interface FoodSearchRemoteMetrics {
  usdaRequests: number;
  workerFailures: number;
}

interface RemoteProviderOptions {
  workerUrl: string;
  fetchImpl?: typeof fetch;
  getInstallId?: () => string;
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
): Promise<any> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (externalSignal?.aborted) throw abortError();
  externalSignal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Food service request failed: ${response.status}`);
    if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
      throw new Error('Food service returned a non-JSON response');
    }
    return await response.json();
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
  const getInstallId = options.getInstallId ?? (() => {
    const application = require('expo-application') as typeof import('expo-application');
    return application.getAndroidId();
  });
  let metrics: FoodSearchRemoteMetrics = { usdaRequests: 0, workerFailures: 0 };

  async function fetchWorker(path: string, init: RequestInit, signal?: AbortSignal): Promise<any> {
    if (!options.workerUrl) throw new Error('Food service is unavailable');
    let installId: string;
    try {
      installId = getInstallId();
    } catch {
      throw new Error('Android install identifier is unavailable');
    }
    try {
      return await fetchJSON(fetchImpl, `${options.workerUrl}${path}`, SEARCH_TIMEOUT_MS, {
        ...init,
        headers: {
          Accept: 'application/json',
          'X-Eatlog-Install-ID': installId,
          ...init.headers,
        },
      }, signal);
    } catch (error) {
      metrics.workerFailures += 1;
      throw error;
    }
  }

  async function searchUSDA(query: string, mode: FoodSearchMode, signal?: AbortSignal): Promise<FoodResult[]> {
    metrics.usdaRequests += 1;
    const body = await fetchWorker('/v1/usda/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: rewriteFoodProviderQuery(query), mode }),
    }, signal);
    return parseUSDAFoods(body?.foods);
  }

  async function loadUSDAFood(fdcId: string, signal?: AbortSignal): Promise<FoodResult | null> {
    if (!/^\d+$/.test(fdcId)) return null;
    metrics.usdaRequests += 1;
    const body = await fetchWorker(`/v1/usda/foods/${fdcId}`, { method: 'GET' }, signal);
    return parseUSDAFoods([body?.food])[0] ?? null;
  }

  async function searchOpenFoodFacts(query: string, signal?: AbortSignal): Promise<FoodResult[]> {
    const params = new URLSearchParams({
      action: 'process',
      search_simple: '1',
      search_terms: rewriteFoodProviderQuery(query),
      json: '1',
      page_size: '15',
      fields: 'product_name,code,brands,nutriments,serving_quantity,serving_size',
    });
    const body = await fetchJSON(fetchImpl, `${OFF_BASE}/cgi/search.pl?${params.toString()}`, SEARCH_TIMEOUT_MS, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Eatlog/1.1.0 (Android; https://github.com/garettie/eatlog)',
      },
    }, signal);
    return parseOpenFoodFactsProducts(body?.products);
  }

  return {
    searchUSDA: options.workerUrl ? searchUSDA : undefined,
    loadUSDAFood: options.workerUrl ? loadUSDAFood : undefined,
    searchOpenFoodFacts,
    getMetrics: (): FoodSearchRemoteMetrics => ({ ...metrics }),
    resetMetrics: () => { metrics = { usdaRequests: 0, workerFailures: 0 }; },
  };
}
