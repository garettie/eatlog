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
    getInstallId: () => 'dd96dec43fb81c97',
  });
  await providers.searchUSDA?.('rice', 'common');
  await providers.searchUSDA?.('rice', 'full');

  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).pathname, '/v1/usda/search');
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { query: 'rice', mode: 'common' });
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { query: 'rice', mode: 'full' });
  assert.equal((requests[0].init?.headers as Record<string, string>)['X-Eatlog-Install-ID'], 'dd96dec43fb81c97');
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
    getInstallId: () => 'dd96dec43fb81c97',
  });
  const detail = await providers.loadUSDAFood?.('1');
  assert.deepEqual(detail?.portions.map((portion) => portion.grams), [158, 100]);
});

test('Open Food Facts runs only when called and remains independent of Worker availability', async () => {
  const requests: string[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    requests.push(String(input));
    return jsonResponse({ products: [] });
  };
  const providers = createFoodSearchRemoteProviders({
    workerUrl: '',
    fetchImpl: fetchImpl as typeof fetch,
    getInstallId: () => 'dd96dec43fb81c97',
  });
  assert.equal(providers.searchUSDA, undefined);
  await providers.searchOpenFoodFacts('coca cola');
  const url = new URL(requests[0]);
  assert.equal(url.pathname, '/cgi/search.pl');
  assert.equal(url.searchParams.get('search_terms'), 'coca cola');
});
