import assert from 'node:assert/strict';
import test from 'node:test';

import { createFoodSearchRemoteProviders } from './foodSearchRemote';

const nutrients = [
  { nutrientId: 1008, value: 130 },
  { nutrientId: 1003, value: 2.7 },
  { nutrientId: 1005, value: 28 },
  { nutrientId: 1004, value: 0.3 },
];

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('common USDA search uses one 50-record request and one batch detail request', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes('/foods/search')) {
      return jsonResponse({ foods: [{ fdcId: 1, description: 'Rice cooked', dataType: 'Survey (FNDDS)', foodNutrients: nutrients }] }, 200, { 'x-ratelimit-remaining': '998' });
    }
    return jsonResponse([{ fdcId: 1, foodPortions: [{ gramWeight: 158, portionDescription: '1 cup' }] }], 200, { 'x-ratelimit-remaining': '997' });
  };
  const providers = createFoodSearchRemoteProviders({ usdaApiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });
  const results = await providers.searchCommon?.('rice');

  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).pathname, '/fdc/v1/foods/search');
  assert.equal(requests[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    query: 'rice',
    pageSize: 50,
    pageNumber: 1,
    dataType: ['Survey (FNDDS)', 'SR Legacy', 'Foundation'],
  });
  assert.equal(requests[1].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { fdcIds: [1], format: 'full' });
  assert.equal(results?.[0].servingSizeGrams, 158);
  assert.deepEqual(providers.getMetrics(), {
    usdaRequests: 2,
    firstRateLimitRemaining: 998,
    lastRateLimitRemaining: 997,
  });
});

test('Open Food Facts uses explicit legacy full-text search with identification and rejects optional-source throttling', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const successFetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return jsonResponse({ products: [] });
  };
  const providers = createFoodSearchRemoteProviders({ usdaApiKey: '', fetchImpl: successFetch as typeof fetch });
  await providers.searchOpenFoodFacts('coca cola');
  const url = new URL(requests[0].url);
  assert.equal(url.pathname, '/cgi/search.pl');
  assert.equal(url.searchParams.get('search_terms'), 'coca cola');
  assert.match(String((requests[0].init?.headers as Record<string, string>)['User-Agent']), /^Eatlog\//);

  const throttled = createFoodSearchRemoteProviders({
    usdaApiKey: '',
    fetchImpl: (async () => jsonResponse({}, 429)) as typeof fetch,
  });
  await assert.rejects(() => throttled.searchOpenFoodFacts('cola'), /429/);
});
