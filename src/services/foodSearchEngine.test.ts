import assert from 'node:assert/strict';
import test from 'node:test';

import { FoodSearchEngine } from './foodSearchEngine';
import type { FoodResult } from './foodSearchTypes';

function food(id: string, dataType: FoodResult['dataType'] = 'Survey (FNDDS)'): FoodResult {
  return {
    id,
    name: 'Rice',
    source: dataType === 'off' ? 'off' : 'usda',
    sourceFoodId: id,
    dataType,
    brand: null,
    preparation: null,
    normalizedName: 'rice',
    caloriesPer100g: 100,
    proteinPer100g: 2,
    carbsPer100g: 22,
    fatPer100g: 0,
    portions: [{ id: 'cup', label: '1 cup', grams: 100 }],
    defaultPortionId: 'cup',
    alternateSourceIds: [],
  };
}

test('common mode calls USDA only and full mode adds Open Food Facts', async () => {
  const calls = { local: 0, usda: 0, off: 0 };
  const engine = new FoodSearchEngine({
    searchLocal: async () => { calls.local += 1; return []; },
    searchUSDA: async (_query, mode) => { calls.usda += 1; return [food(mode)]; },
    searchOpenFoodFacts: async () => { calls.off += 1; return [food('off', 'off')]; },
  });

  await engine.search('rice');
  assert.deepEqual(calls, { local: 1, usda: 1, off: 0 });
  await engine.search('rice', 'full');
  assert.deepEqual(calls, { local: 2, usda: 2, off: 1 });
  const commonAgain = await engine.search('rice', 'common');
  assert.deepEqual(calls, { local: 3, usda: 2, off: 1 });
  assert.deepEqual(commonAgain.items.map((item) => item.id), ['common']);
});

test('always refreshes local results while using the remote cache', async () => {
  let localVersion = 0;
  let remoteCalls = 0;
  const engine = new FoodSearchEngine({
    searchLocal: async () => [food(`local-${++localVersion}`)],
    searchUSDA: async () => { remoteCalls += 1; return [food('remote')]; },
  });
  const first = await engine.search('rice');
  const second = await engine.search('rice');
  assert.equal(remoteCalls, 1);
  assert.match(first.items[0].id, /local-1/);
  assert.match(second.items[0].id, /local-2/);
  assert.deepEqual(engine.getCacheMetrics(), { hits: 1, misses: 1 });
});

test('reports partial and unavailable outcomes by provider completion', async () => {
  const partial = new FoodSearchEngine({
    searchLocal: async () => [],
    searchUSDA: async () => [food('common')],
    searchOpenFoodFacts: async () => { throw new Error('down'); },
  });
  assert.equal((await partial.search('rice', 'full')).kind, 'partial');

  const unavailable = new FoodSearchEngine({
    searchLocal: async () => { throw new Error('db'); },
    searchUSDA: async () => { throw new Error('down'); },
  });
  assert.equal((await unavailable.search('rice')).kind, 'unavailable');
});

test('propagates cancellation and does not cache an aborted request', async () => {
  let calls = 0;
  const engine = new FoodSearchEngine({
    searchLocal: async () => [],
    searchUSDA: (_query, _mode, signal) => new Promise((_resolve, reject) => {
      calls += 1;
      signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });
  const controller = new AbortController();
  const pending = engine.search('rice', 'common', controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('treats a provider timeout as a partial source failure, not caller cancellation', async () => {
  const timeout = new Error('timed out');
  timeout.name = 'AbortError';
  const engine = new FoodSearchEngine({
    searchLocal: async () => [food('local')],
    searchUSDA: async () => { throw timeout; },
  });
  const result = await engine.search('rice');
  assert.equal(result.kind, 'partial');
  assert.equal(result.items[0].id, 'local');
});

test('expires cache entries after five minutes', async () => {
  let now = 0;
  let calls = 0;
  const engine = new FoodSearchEngine({
    searchLocal: async () => [],
    searchUSDA: async () => { calls += 1; return [food(`remote-${calls}`)]; },
    now: () => now,
  });
  await engine.search('rice');
  now = 5 * 60 * 1000 - 1;
  await engine.search('rice');
  assert.equal(calls, 1);
  now += 1;
  await engine.search('rice');
  assert.equal(calls, 2);
});

test('does not cache unavailable provider failures', async () => {
  let calls = 0;
  const engine = new FoodSearchEngine({
    searchLocal: async () => [],
    searchUSDA: async () => {
      calls += 1;
      throw new Error('offline');
    },
  });
  assert.equal((await engine.searchRemote('rice')).kind, 'unavailable');
  assert.equal((await engine.searchRemote('rice')).kind, 'unavailable');
  assert.equal(calls, 2);
});
