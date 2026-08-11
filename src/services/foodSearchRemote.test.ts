import assert from 'node:assert/strict';
import test from 'node:test';

import { createFoodSearchRemoteProviders } from './foodSearchRemote';

const nutrients = [
  { nutrientId: 1008, value: 130 },
  { nutrientId: 1003, value: 2.7 },
  { nutrientId: 1005, value: 28 },
  { nutrientId: 1004, value: 0.3 },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('common and full USDA search use Worker POST body without eager detail requests', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return jsonResponse({ foods: [{ fdcId: 1, description: 'Rice cooked', dataType: 'Survey (FNDDS)', foodNutrients: nutrients }] });
  };
  const providers = createFoodSearchRemoteProviders({
    workerUrl: 'https://food.example.workers.dev',
    fetchImpl: fetchImpl as typeof fetch,
    getInstallationToken: async () => 'dd96dec43fb81c97dd96dec43fb81c97',
  });
  await providers.searchUSDA?.('rice', 'common');
  await providers.searchUSDA?.('rice', 'full');

  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).pathname, '/v1/usda/search');
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { query: 'rice', mode: 'common' });
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { query: 'rice', mode: 'full' });
  assert.equal((requests[0].init?.headers as Record<string, string>)['X-Eatlog-Install-ID'], 'dd96dec43fb81c97dd96dec43fb81c97');
});

test('selected USDA item loads full household portions from Worker detail route', async () => {
  const fetchImpl = async () => jsonResponse({
    food: {
      fdcId: 1,
      description: 'Rice cooked',
      dataType: 'Survey (FNDDS)',
      foodNutrients: nutrients,
      foodPortions: [{ id: 4, gramWeight: 158, portionDescription: '1 cup' }],
    },
  });
  const providers = createFoodSearchRemoteProviders({
    workerUrl: 'https://food.example.workers.dev',
    fetchImpl: fetchImpl as typeof fetch,
    getInstallationToken: async () => 'dd96dec43fb81c97dd96dec43fb81c97',
  });
  const detail = await providers.loadUSDAFood?.('1');
  assert.deepEqual(detail?.portions.map((portion) => portion.grams), [158]);
  assert.deepEqual(detail?.defaultAmount, { kind: 'serving', grams: 158, servingId: 'usda-4' });
});

test('Open Food Facts runs only when called and remains independent of Worker availability', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return jsonResponse({ hits: [] });
  };
  const providers = createFoodSearchRemoteProviders({
    workerUrl: '',
    fetchImpl: fetchImpl as typeof fetch,
    getInstallationToken: async () => 'dd96dec43fb81c97dd96dec43fb81c97',
    openFoodFactsUserAgent: 'Eatlog/1.1.0 (support@example.com)',
  });
  assert.equal(providers.searchUSDA, undefined);
  await providers.searchOpenFoodFacts?.('coca cola');
  const url = new URL(requests[0].url);
  assert.equal(url.origin, 'https://search.openfoodfacts.org');
  assert.equal(url.pathname, '/search');
  assert.equal(requests[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    q: 'coca cola',
    langs: ['en'],
    page: 1,
    page_size: 15,
    boost_phrase: true,
    fields: ['product_name', 'code', 'brands', 'nutriments', 'serving_quantity', 'serving_size'],
  });
  assert.equal((requests[0].init?.headers as Record<string, string>)['User-Agent'], 'Eatlog/1.1.0 (support@example.com)');
});

test('Open Food Facts is disabled safely when the required User-Agent contact is missing', () => {
  const providers = createFoodSearchRemoteProviders({ workerUrl: '' });
  assert.equal(providers.searchOpenFoodFacts, undefined);
});

test('Open Food Facts parses Search-a-licious hits and rejects non-JSON failures', async () => {
  const validProviders = createFoodSearchRemoteProviders({
    workerUrl: '',
    openFoodFactsUserAgent: 'Eatlog/1.1.0 (support@example.com)',
    fetchImpl: (async () => jsonResponse({
      hits: [{
        code: 'synthetic-1',
        product_name: 'Synthetic Toast',
        brands: 'Fixture Foods',
        serving_quantity: 30,
        serving_size: '1 slice (30 g)',
        nutriments: {
          'energy-kcal_100g': 250,
          proteins_100g: 8,
          carbohydrates_100g: 45,
          fat_100g: 4,
        },
      }],
    })) as typeof fetch,
  });
  const results = await validProviders.searchOpenFoodFacts?.('toast');
  assert.equal(results?.[0].name, 'Synthetic Toast');
  assert.deepEqual(results?.[0].portions.map(({ grams }) => grams), [30]);
  assert.deepEqual(results?.[0].defaultAmount, { kind: 'serving', grams: 30, servingId: 'off-serving' });

  const invalidProviders = createFoodSearchRemoteProviders({
    workerUrl: '',
    openFoodFactsUserAgent: 'Eatlog/1.1.0 (support@example.com)',
    fetchImpl: (async () => new Response('<html>unavailable</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })) as typeof fetch,
  });
  await assert.rejects(() => invalidProviders.searchOpenFoodFacts!('toast'), /non-JSON/);
});

test('Open Food Facts cancellation aborts its request and returns no result', async () => {
  const captured: { signal?: AbortSignal } = {};
  const fetchImpl = (_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    captured.signal = init?.signal as AbortSignal;
    captured.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
  const providers = createFoodSearchRemoteProviders({
    workerUrl: '',
    openFoodFactsUserAgent: 'Eatlog/1.1.0 (support@example.com)',
    fetchImpl: fetchImpl as typeof fetch,
  });
  const controller = new AbortController();
  const pending = providers.searchOpenFoodFacts!('toast', controller.signal);
  controller.abort();
  await assert.rejects(pending, (error: Error) => error.name === 'AbortError');
  assert.equal(captured.signal?.aborted, true);
});

test('Worker request waits for installation identity and fails closed without fetching', async () => {
  let fetches = 0;
  let releaseToken: ((token: string) => void) | undefined;
  const token = new Promise<string>((resolve) => { releaseToken = resolve; });
  const providers = createFoodSearchRemoteProviders({
    workerUrl: 'https://food.example.workers.dev',
    getInstallationToken: () => token,
    fetchImpl: (async () => { fetches += 1; return jsonResponse({ foods: [] }); }) as typeof fetch,
  });

  const pending = providers.searchUSDA!('rice', 'common');
  await Promise.resolve();
  assert.equal(fetches, 0);
  releaseToken?.('0123456789abcdef0123456789abcdef');
  await pending;
  assert.equal(fetches, 1);

  const rawToken = 'fedcba9876543210fedcba9876543210';
  const unavailable = createFoodSearchRemoteProviders({
    workerUrl: 'https://food.example.workers.dev',
    getInstallationToken: async () => { throw new Error(rawToken); },
    fetchImpl: (async () => { fetches += 1; return jsonResponse({ foods: [] }); }) as typeof fetch,
  });
  await assert.rejects(unavailable.searchUSDA!('rice', 'common'), (error: unknown) => {
    assert.equal(String(error), 'Error: Installation identity is unavailable');
    assert.equal(String(error).includes(rawToken), false);
    return true;
  });
  assert.equal(fetches, 1);
});

test('Worker request rejects a malformed injected installation identity', async () => {
  let fetches = 0;
  const providers = createFoodSearchRemoteProviders({
    workerUrl: 'https://food.example.workers.dev',
    getInstallationToken: () => 'not-a-token',
    fetchImpl: (async () => { fetches += 1; return jsonResponse({ foods: [] }); }) as typeof fetch,
  });

  await assert.rejects(providers.loadUSDAFood!('1'), /Installation identity is unavailable/);
  assert.equal(fetches, 0);
});
