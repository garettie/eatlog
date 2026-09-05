import assert from 'node:assert/strict';
import test from 'node:test';

import { attemptBudget, contract, handleRequest, hashInstallId, resetModelCooldowns, routeModels, type Env } from '../src/index.js';
import { MemorySubscriptionStore, type SubscriptionStore } from '../src/subscriptions.js';

const INSTALL_ID = '0123456789abcdef0123456789abcdef';
const JPEG = '/9j/2f/Z';

class Limiter {
  readonly keys: string[] = [];

  constructor(
    private readonly succeeds = true,
    private readonly throws = false,
  ) {}

  async limit({ key }: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(key);
    if (this.throws) throw new Error('limiter unavailable');
    return { success: this.succeeds };
  }
}

class MemoryCache {
  readonly reads: string[] = [];
  readonly writes: Array<{ key: string; ttl: string | null }> = [];
  private readonly values = new Map<string, Response>();

  async match(request: Request): Promise<Response | undefined> {
    this.reads.push(request.url);
    return this.values.get(request.url)?.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    this.writes.push({ key: request.url, ttl: response.headers.get('cache-control') });
    this.values.set(request.url, response.clone());
  }
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    USDA_API_KEY: 'usda-secret-value',
    GEMINI_API_KEY: 'gemini-secret-value',
    RATE_LIMIT_SALT: 'salt-secret-value',
    USDA_INSTALL_LIMITER: new Limiter(),
    USDA_IP_LIMITER: new Limiter(),
    USDA_EMERGENCY_LIMITER: new Limiter(),
    GEMINI_INSTALL_LIMITER: new Limiter(),
    GEMINI_IP_LIMITER: new Limiter(),
    GEMINI_EMERGENCY_LIMITER: new Limiter(),
    ...overrides,
  };
}

function makeContext(): ExecutionContext & { pending: Promise<unknown>[] } {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    waitUntil(promise: Promise<unknown>) { pending.push(promise); },
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext & { pending: Promise<unknown>[] };
}

function request(
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  const init: RequestInit = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] ??= 'application/json';
  }
  if (path !== '/healthz') (init.headers as Record<string, string>)['X-Eatlog-Install-ID'] ??= INSTALL_ID;
  return new Request(`https://worker.example${path}`, init);
}

async function call(
  req: Request,
  options: {
    env?: Env;
    fetchImpl?: typeof fetch;
    cache?: MemoryCache | null;
    requestId?: string;
    subscriptionStore?: SubscriptionStore;
  } = {},
): Promise<{ response: Response; body: any; context: ReturnType<typeof makeContext> }> {
  const context = makeContext();
  const response = await handleRequest(req, options.env ?? makeEnv(), context, {
    fetchImpl: options.fetchImpl,
    cache: options.cache ?? null,
    requestId: () => options.requestId ?? 'request-fixed',
    subscriptionStore: options.subscriptionStore,
  });
  const body = await response.clone().json();
  await Promise.all(context.pending);
  return { response, body, context };
}

function usdaFood(id = 1): Record<string, unknown> {
  return {
    fdcId: id,
    description: `Rice ${id}`,
    dataType: 'Survey (FNDDS)',
    foodNutrients: [
      { nutrientId: 1008, value: 130 },
      { nutrientId: 1003, value: 2.7 },
      { nutrientId: 1005, value: 28 },
      { nutrientId: 1004, value: 0.3 },
    ],
    foodPortions: [{ id: id * 10, gramWeight: 158, portionDescription: '1 cup' }],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function geminiResponse(value: unknown): Response {
  return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
}

const recognized = {
  status: 'recognized',
  unrecognizedReason: null,
  mealName: 'Rice bowl',
  components: [{
    name: 'Rice', estimatedGrams: 158, servingSizeGrams: 158,
    caloriesPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3,
    brand: null, preparation: 'cooked', servingLabel: '1 cup',
    confidence: 'high', confidenceReason: null,
  }],
};

function subscriptionEnv(overrides: Partial<Env> = {}): Env {
  return makeEnv({
    SUBSCRIPTIONS_ENABLED: 'true',
    REVENUECAT_SECRET_API_KEY: 'revenuecat-secret',
    REVENUECAT_WEBHOOK_AUTH: 'Bearer webhook-secret',
    AI_GRANT_SIGNING_KEY: 'grant-signing-secret',
    QUOTA_IDENTITY_SALT: 'quota-identity-salt',
    REVENUECAT_ENTITLEMENT_ID: 'eatlog_paid',
    ACCESS_STATE: {} as DurableObjectNamespace,
    ...overrides,
  });
}

function paidRevenueCat(periodType = 'normal'): unknown {
  return { subscriber: {
    original_app_user_id: INSTALL_ID,
    entitlements: { eatlog_paid: {
      product_identifier: 'eatlog_manok',
      expires_date: '2026-09-22T00:00:00Z',
      store: 'play_store',
    } },
    subscriptions: { eatlog_manok: {
      original_transaction_id: 'stable-subscription-identity',
      period_type: periodType,
      unsubscribe_detected_at: null,
      billing_issues_detected_at: null,
    } },
    non_subscriptions: {},
  } };
}

function freeRevenueCat(): unknown {
  return { subscriber: {
    original_app_user_id: INSTALL_ID,
    entitlements: {},
    subscriptions: {},
    non_subscriptions: {},
  } };
}

test('normalizes a counted serving label to one unit without recomputing what was eaten', async () => {
  const counted = async (component: Record<string, unknown>, operation = 'describe', text = '2 eggs') => {
    const { response, body } = await call(
      request('/v1/estimate', 'POST', operation === 'scan'
        ? { operation, imageBase64: JPEG }
        : { operation, text }),
      {
        fetchImpl: (async () => geminiResponse({
          ...recognized,
          mealName: 'Eggs',
          components: [{ ...recognized.components[0], ...component }],
        })) as typeof fetch,
      },
    );
    assert.equal(response.status, 200);
    return {
      estimatedGrams: body.components[0].estimatedGrams,
      servingSizeGrams: body.components[0].servingSizeGrams,
      servingLabel: body.components[0].servingLabel,
    };
  };

  // The label names the unit the review sheet scales from, so a count becomes one of them.
  assert.deepEqual(
    await counted({ name: 'Eggs', estimatedGrams: 100, servingSizeGrams: 50, servingLabel: '2 eggs' }),
    { estimatedGrams: 100, servingSizeGrams: 50, servingLabel: '1 egg' },
  );
  // The same payload shape with a total that happens to equal one unit. Multiplying the count
  // by the serving mass here is a guess, and it is the guess that tripled weighed amounts, so
  // the stated total stands and only the unit is renamed.
  assert.deepEqual(
    await counted({ name: 'Eggs', estimatedGrams: 50, servingSizeGrams: 50, servingLabel: '2 eggs' }),
    { estimatedGrams: 50, servingSizeGrams: 50, servingLabel: '1 egg' },
  );
  // A fractional or single count is already one unit and is left exactly as it arrived.
  assert.deepEqual(
    await counted({ name: 'Rice', estimatedGrams: 79, servingSizeGrams: 158, servingLabel: '0.5 cup' }, 'describe', 'half a cup of rice'),
    { estimatedGrams: 79, servingSizeGrams: 158, servingLabel: '0.5 cup' },
  );
});

test('three cookies weighing 30g in total and three weighing 30g each are both preserved as sent', async () => {
  const cookies = async (estimatedGrams: number, text: string) => {
    const { response, body } = await call(
      request('/v1/estimate', 'POST', { operation: 'describe', text }),
      {
        fetchImpl: (async () => geminiResponse({
          ...recognized,
          mealName: 'Cookies',
          components: [{
            ...recognized.components[0],
            name: 'Cookies',
            estimatedGrams,
            servingSizeGrams: 30,
            servingLabel: '3 cookies',
            caloriesPer100g: 480,
          }],
        })) as typeof fetch,
      },
    );
    assert.equal(response.status, 200);
    return body.components[0].estimatedGrams;
  };

  // Nothing in the payload distinguishes these two, which is exactly why normalization must
  // not choose between them: it keeps the total the estimate reported either way.
  assert.equal(await cookies(30, '30g cookies'), 30);
  assert.equal(await cookies(90, '3 cookies'), 90);
});

test('a zero nutrient is a real measurement and survives, but an unknown one is not invented', async () => {
  const withNutrients = async (nutrients: Record<string, unknown>) => {
    const { response, body } = await call(
      request('/v1/estimate', 'POST', { operation: 'describe', text: 'egg white' }),
      {
        fetchImpl: (async () => geminiResponse({
          ...recognized,
          mealName: 'Egg white',
          components: [{ ...recognized.components[0], name: 'Egg white', ...nutrients }],
        })) as typeof fetch,
      },
    );
    return { status: response.status, body };
  };

  // Egg white really does contain no fat and no carbohydrate.
  const measured = await withNutrients({ caloriesPer100g: 52, proteinPer100g: 11, carbsPer100g: 0, fatPer100g: 0 });
  assert.equal(measured.status, 200);
  assert.deepEqual(
    [measured.body.components[0].carbsPer100g, measured.body.components[0].fatPer100g],
    [0, 0],
  );

  // These are not measurements. `Number()` would turn every one of them into the same zero.
  for (const unknown of [null, false, '', '11', Number.NaN]) {
    const rejected = await withNutrients({ fatPer100g: unknown });
    assert.equal(rejected.status, 502);
    assert.equal(rejected.body.error.code, 'MALFORMED_UPSTREAM');
  }
});

test('a re-estimated component is held to the same amount and density bounds', async () => {
  const redo = async (component: Record<string, unknown>) => {
    const { response, body } = await call(
      request('/v1/estimate', 'POST', {
        operation: 'clarify-component',
        text: 'lechon kawali',
        context: { mealName: 'Lunch', components: [{ name: 'Pork', estimatedGrams: 150 }] },
      }),
      {
        fetchImpl: (async () => geminiResponse({
          ...recognized,
          mealName: 'Lunch',
          components: [{ ...recognized.components[0], name: 'Lechon kawali', ...component }],
        })) as typeof fetch,
      },
    );
    return { status: response.status, body };
  };

  const accepted = await redo({ estimatedGrams: 150, servingSizeGrams: 150, caloriesPer100g: 380, fatPer100g: 32 });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.components[0].estimatedGrams, 150);

  // Redo runs the same normalization, so it cannot be the way an impossible value gets in.
  for (const impossible of [
    { estimatedGrams: 10_001 },
    { servingSizeGrams: 10_001 },
    { caloriesPer100g: 1_001 },
    { fatPer100g: 101 },
  ]) {
    const rejected = await redo(impossible);
    assert.equal(rejected.status, 502);
    assert.equal(rejected.body.error.code, 'MALFORMED_UPSTREAM');
  }
  // The boundaries themselves are legitimate: a pure oil is 100g of fat per 100g.
  const oil = await redo({ estimatedGrams: 10_000, servingSizeGrams: 10_000, caloriesPer100g: 900, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100 });
  assert.equal(oil.status, 200);
});

test('keeps a nutrition-label scan at one serving when the provider copies servings per container', async () => {
  const yoghurtLabel = {
    ...recognized,
    mealName: 'Yoghurt',
    components: [{
      ...recognized.components[0],
      name: 'Yoghurt',
      estimatedGrams: 60,
      servingSizeGrams: 60,
      servingLabel: '16.6667 servings',
    }],
  };
  const { response, body } = await call(
    request('/v1/estimate', 'POST', { operation: 'scan', imageBase64: JPEG }),
    { fetchImpl: (async () => geminiResponse(yoghurtLabel)) as typeof fetch },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(
    {
      estimatedGrams: body.components[0].estimatedGrams,
      servingSizeGrams: body.components[0].servingSizeGrams,
      servingLabel: body.components[0].servingLabel,
    },
    { estimatedGrams: 60, servingSizeGrams: 60, servingLabel: '1 serving' },
  );
});

test('passes through a shareable meal division and degrades unusable ones to null', async () => {
  const pizza = (servesTotal: unknown, servingUnit: unknown) => ({
    ...recognized,
    mealName: 'Pepperoni Pizza',
    servesTotal,
    servingUnit,
  });
  const divisionOf = async (value: unknown, operation = 'scan') => {
    const { response, body } = await call(
      request('/v1/estimate', 'POST', operation === 'scan'
        ? { operation, imageBase64: JPEG }
        : { operation, text: 'pepperoni pizza', context: { mealName: 'Pizza', components: [{ name: 'Dough', estimatedGrams: 400 }] } }),
      { fetchImpl: (async () => geminiResponse(value)) as typeof fetch },
    );
    assert.equal(response.status, 200);
    return { servesTotal: body.servesTotal, servingUnit: body.servingUnit };
  };

  assert.deepEqual(await divisionOf(pizza(8, 'slice')), { servesTotal: 8, servingUnit: 'slice' });
  // A whole already the size of one serving gives the review sheet nothing to scale,
  // and a count with no unit cannot be phrased. Neither may reject the estimate.
  assert.deepEqual(await divisionOf(pizza(1, 'slice')), { servesTotal: null, servingUnit: null });
  assert.deepEqual(await divisionOf(pizza(8, null)), { servesTotal: null, servingUnit: null });
  assert.deepEqual(await divisionOf(pizza(1e9, 'slice')), { servesTotal: null, servingUnit: null });
  assert.deepEqual(await divisionOf(recognized), { servesTotal: null, servingUnit: null });
  // One re-estimated component never describes the whole meal.
  assert.deepEqual(
    await divisionOf(pizza(8, 'slice'), 'clarify-component'),
    { servesTotal: null, servingUnit: null },
  );
});

test('allows only documented routes and exact methods', async () => {
  const fetchImpl = (async () => jsonResponse({ foods: [usdaFood()] })) as typeof fetch;
  const cases: Array<[string, string, number, string | null]> = [
    ['/missing', 'GET', 404, null],
    ['/healthz', 'POST', 405, 'GET'],
    ['/v1/usda/search', 'GET', 405, 'POST'],
    ['/v1/usda/foods/1', 'POST', 405, 'GET'],
    ['/v1/estimate', 'GET', 405, 'POST'],
  ];
  for (const [path, method, status, allow] of cases) {
    const { response } = await call(request(path, method), { fetchImpl });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('allow'), allow);
  }
});

test('health is isolated from install IDs, limiters, secrets, cache, and upstreams', async () => {
  let fetched = false;
  const cache = new MemoryCache();
  const env = makeEnv({ USDA_API_KEY: '', GEMINI_API_KEY: '', RATE_LIMIT_SALT: '' });
  const { response, body } = await call(request('/healthz'), {
    env,
    cache,
    fetchImpl: (async () => { fetched = true; throw new Error('unexpected'); }) as typeof fetch,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(fetched, false);
  assert.deepEqual(cache.reads, []);
  assert.deepEqual(cache.writes, []);
});

test('generates a request ID without an injected test dependency', async () => {
  const response = await handleRequest(request('/healthz'), makeEnv(), makeContext());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('validates install ID and required secrets before upstream work', async () => {
  let fetched = false;
  const fetchImpl = (async () => { fetched = true; throw new Error('unexpected'); }) as typeof fetch;
  for (const installId of ['', 'a'.repeat(15), 'a'.repeat(65), 'g'.repeat(32)]) {
    const invalidId = request('/v1/usda/foods/1', 'GET', undefined, { 'X-Eatlog-Install-ID': installId });
    const result = await call(invalidId, { fetchImpl });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, 'INVALID_INSTALL_ID');
  }
  for (const installId of ['a'.repeat(16), 'B'.repeat(64)]) {
    const result = await call(request('/v1/usda/foods/1', 'GET', undefined, {
      'X-Eatlog-Install-ID': installId,
    }), { fetchImpl: (async () => jsonResponse(usdaFood())) as typeof fetch });
    assert.equal(result.response.status, 200);
  }
  const digest = await hashInstallId(INSTALL_ID, 'synthetic-salt');
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, await hashInstallId(INSTALL_ID, 'synthetic-salt'));
  assert.notEqual(digest, await hashInstallId(INSTALL_ID, 'different-synthetic-salt'));
  assert.notEqual(digest, INSTALL_ID);
  const env = makeEnv({ GEMINI_API_KEY: '' });
  const result = await call(request('/v1/usda/foods/1'), { env, fetchImpl });
  assert.equal(result.response.status, 503);
  assert.equal(result.body.error.code, 'SERVICE_UNAVAILABLE');
  const whitespace = await call(request('/v1/usda/foods/1'), {
    env: makeEnv({ RATE_LIMIT_SALT: '   ' }),
    fetchImpl,
  });
  assert.equal(whitespace.response.status, 503);
  assert.equal(fetched, false);
});

test('enforces POST content type, object shape, known fields, and USDA query contract', async () => {
  const cases: Array<[Request, number, string]> = [
    [request('/v1/usda/search', 'POST', '{}', { 'Content-Type': 'text/plain' }), 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [request('/v1/usda/search', 'POST', undefined, { 'Content-Type': 'application/json' }), 400, 'MALFORMED_JSON'],
    [request('/v1/usda/search', 'POST', '{'), 400, 'MALFORMED_JSON'],
    [request('/v1/usda/search', 'POST', []), 400, 'INVALID_BODY'],
    [request('/v1/usda/search', 'POST', { query: 'rice', mode: 'common', pageSize: 50 }), 400, 'UNKNOWN_PROPERTY'],
    [request('/v1/usda/search', 'POST', { query: 'x', mode: 'common' }), 400, 'INVALID_QUERY'],
    [request('/v1/usda/search', 'POST', { query: 'x'.repeat(101), mode: 'common' }), 400, 'INVALID_QUERY'],
    [request('/v1/usda/search', 'POST', { query: 'x'.repeat(5000), mode: 'common' }), 413, 'PAYLOAD_TOO_LARGE'],
    [request('/v1/usda/search', 'POST', { query: 'rice', mode: 'other' }), 400, 'INVALID_MODE'],
  ];
  for (const [req, status, code] of cases) {
    const result = await call(req);
    assert.equal(result.response.status, status);
    assert.equal(result.body.error.code, code);
  }
});

test('normalizes queries and hard-codes USDA origin, page size, and common/full data types', async () => {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchImpl = (async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return jsonResponse({ foods: [usdaFood()] });
  }) as typeof fetch;
  await call(request('/v1/usda/search', 'POST', { query: '  white   rice ', mode: 'common' }), { fetchImpl });
  await call(request('/v1/usda/search', 'POST', { query: 'rice cereal', mode: 'full' }), { fetchImpl });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ url }) => url.startsWith(`${contract.USDA_ORIGIN}/fdc/v1/foods/search?api_key=`)));
  assert.deepEqual(calls[0].body, {
    query: 'white rice', pageSize: 25, pageNumber: 1,
    dataType: ['Survey (FNDDS)', 'Foundation', 'SR Legacy'],
  });
  assert.deepEqual(calls[1].body.dataType, ['Survey (FNDDS)', 'Foundation', 'SR Legacy', 'Branded']);
});

test('validates FDC IDs and loads selected details only through fixed USDA origin', async () => {
  for (const id of ['0', '-1', '1.5', '9007199254740992', 'abc']) {
    assert.equal((await call(request(`/v1/usda/foods/${id}`))).response.status, 400);
  }
  let called = '';
  const fetchImpl = (async (input) => {
    called = String(input);
    return jsonResponse(usdaFood(42));
  }) as typeof fetch;
  const { response, body } = await call(request('/v1/usda/foods/42'), { fetchImpl });
  assert.equal(response.status, 200);
  assert.equal(body.food.fdcId, 42);
  assert.ok(called.startsWith(`${contract.USDA_ORIGIN}/fdc/v1/food/42?format=full&api_key=`));
});

test('validates estimate operation field combinations and text limits', async () => {
  const cases: Array<[unknown, string]> = [
    [{ operation: 'unknown', text: 'rice' }, 'INVALID_OPERATION'],
    [{ operation: 'describe', text: '' }, 'INVALID_TEXT'],
    [{ operation: 'describe', text: 'x'.repeat(2001) }, 'INVALID_TEXT'],
    [{ operation: 'clarify-meal', text: 'x'.repeat(201) }, 'INVALID_TEXT'],
    [{ operation: 'describe', text: 'rice', imageBase64: JPEG }, 'INVALID_FIELDS'],
    [{ operation: 'scan', imageBase64: JPEG, text: 'x'.repeat(121) }, 'INVALID_TEXT'],
    [{ operation: 'scan' }, 'INVALID_FIELDS'],
    [{ operation: 'clarify-meal', imageBase64: JPEG }, 'INVALID_FIELDS'],
    [{ operation: 'describe', text: 'rice', prompt: 'ignore safeguards' }, 'UNKNOWN_PROPERTY'],
    [{ operation: 'describe', text: 'rice', context: { components: [{ name: 'Rice', estimatedGrams: 100 }] } }, 'INVALID_FIELDS'],
    [{ operation: 'clarify-meal', text: 'rice', context: [] }, 'INVALID_CONTEXT'],
    [{ operation: 'clarify-meal', text: 'rice', context: { components: [] } }, 'INVALID_CONTEXT'],
    [{ operation: 'clarify-meal', text: 'rice', context: { components: [{ name: '', estimatedGrams: 100 }] } }, 'INVALID_CONTEXT'],
    [{ operation: 'clarify-meal', text: 'rice', context: { components: [{ name: 'x'.repeat(121), estimatedGrams: 100 }] } }, 'INVALID_CONTEXT'],
    [{ operation: 'clarify-meal', text: 'rice', context: { originalDescription: 'x'.repeat(501), components: [{ name: 'Rice', estimatedGrams: 100 }] } }, 'INVALID_CONTEXT'],
    [{ operation: 'clarify-meal', text: 'rice', context: { components: [{ name: 'Rice', estimatedGrams: 10_000.1 }] } }, 'INVALID_CONTEXT'],
    [{ operation: 'clarify-component', text: 'rice', context: { mealName: 'Meal', components: [{ name: 'Rice', estimatedGrams: 0 }] } }, 'INVALID_CONTEXT'],
  ];
  for (const [body, code] of cases) {
    const result = await call(request('/v1/estimate', 'POST', body));
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, code);
  }
});

test('rejects malformed base64, non-JPEG bytes, decoded images over 4 MiB, and bodies over 6 MiB', async () => {
  const malformed = await call(request('/v1/estimate', 'POST', { operation: 'scan', imageBase64: '**==' }));
  assert.equal(malformed.body.error.code, 'INVALID_IMAGE');
  const png = await call(request('/v1/estimate', 'POST', { operation: 'scan', imageBase64: 'iVBORw0KGgo=' }));
  assert.equal(png.body.error.code, 'INVALID_IMAGE');
  const hugeJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.alloc(4 * 1024 * 1024),
    Buffer.from([0xff, 0xd9]),
  ]).toString('base64');
  const huge = await call(request('/v1/estimate', 'POST', { operation: 'scan', imageBase64: hugeJpeg }));
  assert.equal(huge.response.status, 413);
  assert.equal(huge.body.error.code, 'IMAGE_TOO_LARGE');
  const contentLength = request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, { 'Content-Length': String(6 * 1024 * 1024 + 1) });
  const oversized = await call(contentLength);
  assert.equal(oversized.response.status, 413);
  assert.equal(oversized.body.error.code, 'PAYLOAD_TOO_LARGE');
});

test('owns Gemini models, prompts, schema, fallback order, and bypasses cache', async () => {
  const urls: string[] = [];
  const bodies: any[] = [];
  const fetchImpl = (async (input, init) => {
    urls.push(String(input));
    bodies.push(JSON.parse(String(init?.body)));
    if (urls.length === 1) return new Response('{', { headers: { 'Content-Type': 'application/json' } });
    return geminiResponse(recognized);
  }) as typeof fetch;
  const cache = new MemoryCache();
  const { response, body } = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'one cup rice' }), { fetchImpl, cache });
  assert.equal(response.status, 200);
  assert.equal(body.components.length, 1);
  assert.equal(urls.length, 2);
  assert.ok(urls[0].includes(`/models/${contract.PAID_GEMINI_MODELS[0]}:generateContent`));
  assert.ok(urls[1].includes(`/models/${contract.PAID_GEMINI_MODELS[1]}:generateContent`));
  assert.ok(urls.every((url) => url.startsWith(contract.GEMINI_ORIGIN)));
  assert.match(bodies[0].contents[0].parts[0].text, /User description: "one cup rice"/);
  assert.match(bodies[0].systemInstruction.parts[0].text, /nutritionally material ingredient-level/i);
  assert.match(bodies[0].systemInstruction.parts[0].text, /never return both a whole dish and its ingredients/i);
  assert.match(bodies[0].systemInstruction.parts[0].text, /fewest entries.*never exceed 20/i);
  assert.match(bodies[0].systemInstruction.parts[0].text, /base entries must exclude it/i);
  assert.match(bodies[0].systemInstruction.parts[0].text, /chicken adobo with rice/i);
  assert.equal(bodies[0].generationConfig.responseMimeType, 'application/json');
  assert.equal(bodies[0].generationConfig.responseSchema.properties.components.maxItems, undefined);
  assert.match(bodies[0].generationConfig.responseSchema.properties.components.items.properties.name.description, /ingredient-level/i);
  assert.equal(bodies[0].generationConfig.temperature, undefined);
  const staticRequestBytes = Buffer.byteLength(JSON.stringify({
    systemInstruction: bodies[0].systemInstruction,
    contents: bodies[0].contents,
    generationConfig: bodies[0].generationConfig,
  }));
  // Raised from 4_500 for the meal-division fields and the paragraph teaching them:
  // component grams describe the whole shared dish, and the review sheet needs the
  // portion count to scale it down to what one person ate.
  assert.ok(staticRequestBytes <= 5_200, `Gemini text request grew to ${staticRequestBytes} bytes`);
  assert.deepEqual(cache.reads, []);
  assert.deepEqual(cache.writes, []);
});

test('passes original description and current components as clarification data', async () => {
  const bodies: any[] = [];
  const fetchImpl = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return geminiResponse(recognized);
  }) as typeof fetch;
  const context = {
    originalDescription: 'isang tasang kanin at chicken adobo',
    components: [
      { name: 'Rice', estimatedGrams: 180 },
      { name: 'Chicken adobo', estimatedGrams: 150 },
    ],
  };

  const meal = await call(request('/v1/estimate', 'POST', {
    operation: 'clarify-meal',
    text: 'Chicken adobo with rice',
    context,
  }), { fetchImpl });
  assert.equal(meal.response.status, 200);
  assert.match(bodies[0].contents[0].parts[0].text, /Original user description: "isang tasang kanin at chicken adobo"/);
  assert.match(bodies[0].contents[0].parts[0].text, /"name":"Rice","estimatedGrams":180/);

  const component = await call(request('/v1/estimate', 'POST', {
    operation: 'clarify-component',
    text: 'Braised chicken thigh',
    context: { ...context, mealName: 'Chicken adobo with rice' },
  }), { fetchImpl });
  assert.equal(component.response.status, 200);
  assert.match(bodies[1].contents[0].parts[0].text, /Meal name: "Chicken adobo with rice"/);
  assert.match(bodies[1].contents[0].parts[0].text, /Component name: "Braised chicken thigh"/);
});

test('caps a maximum clarification request before calling Gemini', async () => {
  let upstreamBody: any;
  const fetchImpl = (async (_input, init) => {
    upstreamBody = JSON.parse(String(init?.body));
    return geminiResponse(recognized);
  }) as typeof fetch;
  const components = Array.from({ length: 20 }, (_, index) => ({
    name: `${String(index).padStart(2, '0')}-${'n'.repeat(117)}`,
    estimatedGrams: 10_000,
  }));
  const result = await call(request('/v1/estimate', 'POST', {
    operation: 'clarify-meal',
    text: 'm'.repeat(200),
    context: {
      originalDescription: 'd'.repeat(500),
      mealName: 'm'.repeat(120),
      components,
    },
  }), { fetchImpl });

  assert.equal(result.response.status, 200);
  const requestBytes = Buffer.byteLength(JSON.stringify(upstreamBody));
  assert.ok(requestBytes <= 8_900, `Maximum Gemini clarification request grew to ${requestBytes} bytes`);
});

test('accepts a synthetic JPEG scan without calling a real provider', async () => {
  let upstreamBody: any;
  const fetchImpl = (async (_input, init) => {
    upstreamBody = JSON.parse(String(init?.body));
    return geminiResponse(recognized);
  }) as typeof fetch;
  const { response, body } = await call(request('/v1/estimate', 'POST', {
    operation: 'scan',
    imageBase64: JPEG,
  }), { fetchImpl });
  assert.equal(response.status, 200);
  assert.equal(body.status, 'recognized');
  assert.deepEqual(upstreamBody.contents[0].parts[1], {
    inlineData: { mimeType: 'image/jpeg', data: JPEG },
  });
});

test('uses a user-provided meal title as first-pass scan context', async () => {
  let upstreamBody: any;
  const fetchImpl = (async (_input, init) => {
    upstreamBody = JSON.parse(String(init?.body));
    return geminiResponse(recognized);
  }) as typeof fetch;
  const { response } = await call(request('/v1/estimate', 'POST', {
    operation: 'scan',
    imageBase64: JPEG,
    text: 'Chicken adobo with rice',
  }), { fetchImpl });

  assert.equal(response.status, 200);
  assert.match(upstreamBody.contents[0].parts[0].text, /User-provided meal title: "Chicken adobo with rice"/);
  assert.match(upstreamBody.contents[0].parts[0].text, /scale estimatedGrams to it and override the portion the photo suggests/);
  assert.match(upstreamBody.systemInstruction.parts[0].text, /Amounts never belong in mealName or component names/);
});

test('enforces the Gemini component cap after provider normalization', async () => {
  const tooManyComponents = {
    ...recognized,
    components: Array.from({ length: 21 }, () => recognized.components[0]),
  };
  const { response, body } = await call(
    request('/v1/estimate', 'POST', { operation: 'describe', text: 'buffet plate' }),
    { fetchImpl: (async () => geminiResponse(tooManyComponents)) as typeof fetch },
  );
  assert.equal(response.status, 502);
  assert.equal(body.error.code, 'MALFORMED_UPSTREAM');
});

test('caps USDA results and rejects malformed provider responses instead of forwarding them', async () => {
  const many = Array.from({ length: 30 }, (_, index) => usdaFood(index + 1));
  const valid = await call(request('/v1/usda/search', 'POST', { query: 'rice', mode: 'common' }), {
    fetchImpl: (async () => jsonResponse({ foods: many })) as typeof fetch,
  });
  assert.equal(valid.body.foods.length, 25);

  const malformedCases = [
    new Response('<html>bad</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    jsonResponse({ wrong: [] }),
    jsonResponse({ foods: [{ fdcId: 1, description: 'bad' }] }),
  ];
  for (const upstream of malformedCases) {
    const result = await call(request('/v1/usda/search', 'POST', { query: 'rice', mode: 'common' }), {
      fetchImpl: (async () => upstream.clone()) as typeof fetch,
    });
    assert.equal(result.response.status, 502);
    assert.ok(['MALFORMED_UPSTREAM'].includes(result.body.error.code));
    assert.equal(JSON.stringify(result.body).includes('<html>'), false);
  }
});

test('maps upstream errors and timeouts to stable redacted errors with request IDs', async () => {
  const upstream = await call(request('/v1/usda/search', 'POST', { query: 'private rice query', mode: 'common' }), {
    fetchImpl: (async () => new Response('secret upstream body', { status: 500 })) as typeof fetch,
    requestId: 'request-upstream',
  });
  assert.deepEqual(upstream.body, {
    error: { code: 'UPSTREAM_ERROR', message: 'Upstream service rejected the request.', requestId: 'request-upstream' },
  });
  const timeout = await call(request('/v1/usda/foods/1'), {
    fetchImpl: (async () => {
      const error = new Error('timed out with secret');
      error.name = 'AbortError';
      throw error;
    }) as typeof fetch,
  });
  assert.equal(timeout.response.status, 504);
  assert.equal(timeout.body.error.code, 'UPSTREAM_TIMEOUT');
});

test('uses separate salted install, IP, and emergency limiter keys for each route group', async () => {
  const usda = [new Limiter(), new Limiter(), new Limiter()] as const;
  const gemini = [new Limiter(), new Limiter(), new Limiter()] as const;
  const env = makeEnv({
    USDA_INSTALL_LIMITER: usda[0], USDA_IP_LIMITER: usda[1], USDA_EMERGENCY_LIMITER: usda[2],
    GEMINI_INSTALL_LIMITER: gemini[0], GEMINI_IP_LIMITER: gemini[1], GEMINI_EMERGENCY_LIMITER: gemini[2],
  });
  const usdaFetch = (async () => jsonResponse({ foods: [usdaFood()] })) as typeof fetch;
  await call(request('/v1/usda/search', 'POST', { query: 'rice', mode: 'common' }, { 'CF-Connecting-IP': '203.0.113.9' }), { env, fetchImpl: usdaFetch });
  await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, { 'CF-Connecting-IP': '198.51.100.4' }), { env, fetchImpl: (async () => geminiResponse(recognized)) as typeof fetch });
  assert.equal(usda[0].keys[0], await hashInstallId(INSTALL_ID, env.RATE_LIMIT_SALT));
  assert.equal(usda[1].keys[0], '203.0.113.9');
  assert.equal(usda[2].keys[0], 'usda:location');
  assert.equal(gemini[1].keys[0], '198.51.100.4');
  assert.equal(gemini[2].keys[0], 'gemini:location');
  assert.notEqual(usda[0].keys[0], INSTALL_ID);
});

test('returns 429 when any limiter rejects and fails closed when a limiter throws', async () => {
  let fetched = false;
  const fetchImpl = (async () => { fetched = true; return jsonResponse({ foods: [] }); }) as typeof fetch;
  const rejected = await call(request('/v1/usda/foods/1'), {
    env: makeEnv({ USDA_IP_LIMITER: new Limiter(false) }), fetchImpl,
  });
  assert.equal(rejected.response.status, 429);
  assert.equal(rejected.response.headers.get('retry-after'), '60');
  assert.equal(fetched, false);
  const unavailable = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }), {
    env: makeEnv({ GEMINI_EMERGENCY_LIMITER: new Limiter(true, true) }), fetchImpl,
  });
  assert.equal(unavailable.response.status, 503);
  assert.equal(unavailable.body.error.code, 'RATE_LIMIT_UNAVAILABLE');
  assert.equal(fetched, false);
});

test('uses digest-only USDA cache keys, correct TTLs, and caches only successes', async () => {
  const cache = new MemoryCache();
  let fetches = 0;
  const fetchImpl = (async (input) => {
    fetches += 1;
    return String(input).includes('/foods/search') ? jsonResponse({ foods: [usdaFood()] }) : jsonResponse(usdaFood(7));
  }) as typeof fetch;
  const query = 'private chicken adobo';
  await call(request('/v1/usda/search', 'POST', { query, mode: 'common' }), { fetchImpl, cache });
  await call(request('/v1/usda/search', 'POST', { query, mode: 'common' }), { fetchImpl, cache });
  await call(request('/v1/usda/search', 'POST', { query, mode: 'full' }), { fetchImpl, cache });
  await call(request('/v1/usda/foods/7'), { fetchImpl, cache });
  assert.equal(fetches, 3);
  assert.equal(cache.writes.length, 3);
  assert.ok(cache.writes.every(({ key }) => !key.includes('private') && !key.includes('adobo')));
  assert.deepEqual(cache.writes.map(({ ttl }) => ttl), [
    'public, max-age=21600', 'public, max-age=3600', 'public, max-age=86400',
  ]);

  const errorCache = new MemoryCache();
  await call(request('/v1/usda/search', 'POST', { query: 'rice', mode: 'common' }), {
    cache: errorCache,
    fetchImpl: (async () => new Response('no', { status: 500 })) as typeof fetch,
  });
  assert.deepEqual(errorCache.writes, []);
});

test('emits only allowlisted operational fields without inputs, identifiers, digests, headers, or secrets', async () => {
  const logs: string[] = [];
  const original = console.log;
  console.log = (value?: unknown) => { logs.push(String(value)); };
  try {
    const env = makeEnv();
    const digest = await hashInstallId(INSTALL_ID, env.RATE_LIMIT_SALT);
    const result = await call(request('/v1/usda/search', 'POST', { query: 'private food description', mode: 'common' }, {
      Authorization: 'Bearer private-token',
      'CF-Connecting-IP': '203.0.113.9',
    }), {
      env,
      requestId: 'request-log',
      fetchImpl: (async () => new Response('provider-secret-body', { status: 500 })) as typeof fetch,
    });
    assert.equal(result.response.status, 502);
    assert.equal(logs.length, 1);
    const entry = JSON.parse(logs[0]);
    assert.deepEqual(Object.keys(entry), ['route', 'status', 'latencyMs', 'upstream', 'cache', 'rejection']);
    assert.equal(Number.isFinite(entry.latencyMs) && entry.latencyMs >= 0, true);
    assert.deepEqual({ ...entry, latencyMs: 0 }, {
      route: 'usda-search',
      status: 502,
      latencyMs: 0,
      upstream: 'usda',
      cache: 'miss',
      rejection: 'upstream-status',
    });
    const serialized = `${logs[0]} ${JSON.stringify(result.body)}`;
    for (const forbidden of [
      INSTALL_ID, digest, env.USDA_API_KEY, env.GEMINI_API_KEY, env.RATE_LIMIT_SALT,
      'private food', 'private-token', 'provider-secret-body', 'USDA_API_KEY',
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
    for (const forbidden of ['203.0.113.9', 'request-log', 'POST']) {
      assert.equal(logs[0].includes(forbidden), false);
    }
  } finally {
    console.log = original;
  }
});

test('an unrecognized estimate refunds the quota it reserved', async () => {
  const store = new MemorySubscriptionStore();
  const env = subscriptionEnv();
  let recognize = false;
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) return jsonResponse(freeRevenueCat());
    return geminiResponse(recognize ? recognized : {
      status: 'unrecognized',
      unrecognizedReason: 'No food is visible.',
      mealName: null,
      servesTotal: null,
      servingUnit: null,
      components: [],
    });
  }) as typeof fetch;

  const refreshed = await call(request('/v1/access/refresh', 'POST', { force: true }), {
    env, fetchImpl, subscriptionStore: store,
  });
  const grant = { Authorization: `Bearer ${refreshed.body.grant.token}` };

  // Three rejected photos in a row must leave the whole allowance intact.
  for (let index = 1; index <= 3; index += 1) {
    const rejected = await call(request('/v1/estimate', 'POST', { operation: 'scan', imageBase64: JPEG }, {
      ...grant, 'X-Eatlog-Request-ID': `request-rejected-000${index}`,
    }), { env, fetchImpl, subscriptionStore: store });
    assert.equal(rejected.response.status, 200);
    assert.equal(rejected.body.status, 'unrecognized');
  }
  const afterRejections = await call(request('/v1/usage', 'GET', undefined, grant), {
    env, fetchImpl, subscriptionStore: store,
  });
  assert.equal(afterRejections.body.remaining24Hours, 3);

  // A usable estimate still costs one.
  recognize = true;
  const accepted = await call(request('/v1/estimate', 'POST', { operation: 'scan', imageBase64: JPEG }, {
    ...grant, 'X-Eatlog-Request-ID': 'request-accepted-0001',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.equal(accepted.response.status, 200);
  const afterAccepted = await call(request('/v1/usage', 'GET', undefined, grant), {
    env, fetchImpl, subscriptionStore: store,
  });
  assert.equal(afterAccepted.body.remaining24Hours, 2);
});

test('repeated refunds are capped even though they never touch the visible quota', async () => {
  const store = new MemorySubscriptionStore();
  const env = subscriptionEnv();
  let geminiCalls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) return jsonResponse(paidRevenueCat());
    geminiCalls += 1;
    return geminiResponse({
      status: 'unrecognized',
      unrecognizedReason: 'No food is visible.',
      mealName: null,
      servesTotal: null,
      servingUnit: null,
      components: [],
    });
  }) as typeof fetch;

  // Paid access has no daily allowance small enough to hit first; every one of these five
  // calls is refunded and must leave the real 30/day fair-use quota untouched.
  for (let index = 1; index <= 5; index += 1) {
    const rejected = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
      'X-Eatlog-Request-ID': `request-refund-abuse-000${index}`,
    }), { env, fetchImpl, subscriptionStore: store });
    assert.equal(rejected.response.status, 200);
    assert.equal(rejected.body.status, 'unrecognized');
  }
  assert.equal(geminiCalls, 5);

  const sixth = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-refund-abuse-0006',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.equal(sixth.response.status, 429);
  assert.equal(sixth.body.error.code, 'REFUND_DAILY_LIMIT');
  // The rejection must happen before ever calling Gemini again.
  assert.equal(geminiCalls, 5);
});

test('a successful estimate is still returned to the client when finalize fails', async () => {
  const store = new MemorySubscriptionStore();
  const finalizingStore: SubscriptionStore = {
    getCached: store.getCached.bind(store),
    putCached: store.putCached.bind(store),
    recordWebhook: store.recordWebhook.bind(store),
    reserve: store.reserve.bind(store),
    usage: store.usage.bind(store),
    finalize: async () => { throw new Error('Durable Object overloaded'); },
    refund: store.refund.bind(store),
  };
  const env = subscriptionEnv();
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) return jsonResponse(paidRevenueCat());
    return geminiResponse(recognized);
  }) as typeof fetch;

  const result = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-finalize-fails-0001',
  }), { env, fetchImpl, subscriptionStore: finalizingStore });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, 'recognized');
  assert.equal(typeof result.response.headers.get('x-eatlog-ai-grant'), 'string');
});

test('a Gemini failure surfaces its own status even when the refund also fails', async () => {
  const store = new MemorySubscriptionStore();
  const refundingStore: SubscriptionStore = {
    getCached: store.getCached.bind(store),
    putCached: store.putCached.bind(store),
    recordWebhook: store.recordWebhook.bind(store),
    reserve: store.reserve.bind(store),
    usage: store.usage.bind(store),
    finalize: store.finalize.bind(store),
    refund: async () => { throw new Error('Durable Object overloaded'); },
  };
  const env = subscriptionEnv();
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) return jsonResponse(paidRevenueCat());
    return geminiResponse({
      ...recognized,
      components: Array.from({ length: 21 }, () => recognized.components[0]),
    });
  }) as typeof fetch;

  const result = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-refund-fails-0001',
  }), { env, fetchImpl, subscriptionStore: refundingStore });

  assert.equal(result.response.status, 502);
  assert.equal(result.body.error.code, 'MALFORMED_UPSTREAM');
});

test('Pugo refresh and inline estimates share one three-request installation allowance', async () => {
  const store = new MemorySubscriptionStore();
  const env = subscriptionEnv();
  const geminiUrls: string[] = [];
  let revenueCatCalls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('https://api.revenuecat.com/')) {
      revenueCatCalls += 1;
      return jsonResponse(freeRevenueCat());
    }
    geminiUrls.push(url);
    return geminiResponse(recognized);
  }) as typeof fetch;

  const refreshed = await call(request('/v1/access/refresh', 'POST', { force: true }), {
    env, fetchImpl, subscriptionStore: store,
  });
  assert.equal(refreshed.response.status, 200);
  assert.equal(refreshed.body.access.kind, 'pugo');
  assert.equal(typeof refreshed.body.grant.token, 'string');
  assert.deepEqual(refreshed.body.usage, {
    kind: 'free',
    remaining24Hours: 3,
    nextEligibleAt: null,
  });

  const first = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-pugo-0001',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.equal(first.response.status, 200);
  assert.equal(first.response.headers.get('x-eatlog-ai-grant') != null, true);

  const usage = await call(request('/v1/usage', 'GET', undefined, {
    Authorization: `Bearer ${refreshed.body.grant.token}`,
  }), { env, fetchImpl, subscriptionStore: store });
  assert.deepEqual(usage.body, {
    kind: 'free',
    remaining24Hours: 2,
    nextEligibleAt: null,
  });

  for (let index = 2; index <= 3; index += 1) {
    const input = index % 2 === 0
      ? { operation: 'scan', imageBase64: JPEG }
      : { operation: 'describe', text: 'rice' };
    const result = await call(request('/v1/estimate', 'POST', input, {
      Authorization: `Bearer ${refreshed.body.grant.token}`,
      'X-Eatlog-Request-ID': `request-pugo-000${index}`,
    }), { env, fetchImpl, subscriptionStore: store });
    assert.equal(result.response.status, 200);
  }

  const over = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    Authorization: `Bearer ${refreshed.body.grant.token}`,
    'X-Eatlog-Request-ID': 'request-pugo-0004',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.equal(over.response.status, 429);
  assert.equal(over.body.error.code, 'PUGO_DAILY_LIMIT');
  assert.equal(typeof over.body.error.nextEligibleAt, 'string');
  assert.equal(geminiUrls.length, 3);
  assert.equal(geminiUrls.every((url) => url.includes(`/models/${contract.PUGO_GEMINI_MODELS[0]}:generateContent`)), true);
  assert.equal(revenueCatCalls, 1);

  for (const operation of ['clarify-meal', 'clarify-component']) {
    const result = await call(request('/v1/estimate', 'POST', {
      operation,
      text: 'rice',
      context: { mealName: 'Rice', components: [{ name: 'Rice', estimatedGrams: 158 }] },
    }, {
      Authorization: `Bearer ${refreshed.body.grant.token}`,
      'X-Eatlog-Request-ID': `request-${operation}`,
    }), { env, fetchImpl, subscriptionStore: store });
    assert.equal(result.response.status, 402);
    assert.equal(result.body.error.code, 'PAID_ACCESS_REQUIRED');
  }
  assert.equal(geminiUrls.length, 3);
});

test('Pugo uses the same 3.5-to-3.1 Gemini fallback as paid access and computes cost from one rate pair', async () => {
  const original = console.log;
  const logs: Array<Record<string, unknown>> = [];
  console.log = (value?: unknown) => {
    if (typeof value === 'string') logs.push(JSON.parse(value));
  };
  try {
    const urls: string[] = [];
    const env = subscriptionEnv({
      GEMINI_INPUT_USD_PER_MILLION: '0.1',
      GEMINI_OUTPUT_USD_PER_MILLION: '0.4',
    });
    const fallbackFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://api.revenuecat.com/')) return jsonResponse(freeRevenueCat());
      urls.push(url);
      if (urls.length === 1) return new Response('{', { headers: { 'Content-Type': 'application/json' } });
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify(recognized) }] } }],
        usageMetadata: { promptTokenCount: 1_000, candidatesTokenCount: 250 },
      });
    }) as typeof fetch;
    const fallback = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
      'X-Eatlog-Request-ID': 'request-pugo-fallback',
    }), {
      env,
      fetchImpl: fallbackFetch,
      subscriptionStore: new MemorySubscriptionStore(),
    });
    assert.equal(fallback.response.status, 200);
    assert.equal(urls.length, 2);
    assert.ok(urls[0].includes(`/models/${contract.PUGO_GEMINI_MODELS[0]}:generateContent`));
    assert.ok(urls[1].includes(`/models/${contract.PUGO_GEMINI_MODELS[1]}:generateContent`));
    const fallbackUsage = logs.find((entry) => entry.event === 'ai_usage');
    assert.equal(fallbackUsage?.model, contract.PUGO_GEMINI_MODELS[1]);
    assert.equal(fallbackUsage?.estimatedCostUsd, 0.0002);

    logs.length = 0;
    const primary = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
      'X-Eatlog-Request-ID': 'request-pugo-primary',
    }), {
      env: subscriptionEnv({
        GEMINI_INPUT_USD_PER_MILLION: '',
        GEMINI_OUTPUT_USD_PER_MILLION: '-1',
      }),
      fetchImpl: (async (input: string | URL | Request) => (
        String(input).startsWith('https://api.revenuecat.com/')
          ? jsonResponse(freeRevenueCat())
          : jsonResponse({
              candidates: [{ content: { parts: [{ text: JSON.stringify(recognized) }] } }],
              usageMetadata: { promptTokenCount: 1_000, candidatesTokenCount: 250 },
            })
      )) as typeof fetch,
      subscriptionStore: new MemorySubscriptionStore(),
    });
    assert.equal(primary.response.status, 200);
    const primaryUsage = logs.find((entry) => entry.event === 'ai_usage');
    assert.equal(primaryUsage?.model, contract.PUGO_GEMINI_MODELS[0]);
    assert.equal(primaryUsage?.estimatedCostUsd, null);
  } finally {
    console.log = original;
  }
});

test('estimate authorizes inline, reuses cached access, and returns a grant for later requests', async () => {
  const store = new MemorySubscriptionStore();
  const env = subscriptionEnv();
  let revenueCatCalls = 0;
  const geminiUrls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) {
      revenueCatCalls += 1;
      return jsonResponse(paidRevenueCat());
    }
    geminiUrls.push(String(input));
    return geminiResponse(recognized);
  }) as typeof fetch;

  const first = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-inline-0001',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.equal(first.response.status, 200);
  assert.equal(revenueCatCalls, 1);
  assert.equal(geminiUrls.length, 1);
  assert.ok(geminiUrls[0].includes(`/models/${contract.PAID_GEMINI_MODELS[0]}:generateContent`));
  assert.equal(typeof first.response.headers.get('x-eatlog-ai-grant'), 'string');
  assert.equal(typeof first.response.headers.get('x-eatlog-ai-grant-expires-at'), 'string');

  const cached = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    Authorization: 'Bearer expired-or-invalid-grant',
    'X-Eatlog-Request-ID': 'request-inline-0002',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.equal(cached.response.status, 200);
  assert.equal(revenueCatCalls, 1);
  assert.equal(geminiUrls.length, 2);

  const forced = await call(request('/v1/access/refresh', 'POST', { force: true }), {
    env, fetchImpl, subscriptionStore: store,
  });
  assert.equal(forced.response.status, 200);
  assert.equal(revenueCatCalls, 2);
});

test('malformed RevenueCat access with no cached record falls back to provisional Pugo, like an outage', async () => {
  const malformedFetch = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) return jsonResponse({ nope: true });
    return geminiResponse(recognized);
  }) as typeof fetch;
  const result = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-malformed-free',
  }), {
    env: subscriptionEnv(),
    fetchImpl: malformedFetch,
    subscriptionStore: new MemorySubscriptionStore(),
  });
  // A malformed response is not a verdict, so it is not a reason to withhold the free tier
  // from an install RevenueCat has never confirmed anything about.
  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, 'recognized');
});

test('a malformed RevenueCat response cannot overwrite or deny a good cached record', async () => {
  const store = new MemorySubscriptionStore();
  const env = subscriptionEnv();
  const online = await call(request('/v1/access/refresh', 'POST', {}), {
    env,
    fetchImpl: (async () => jsonResponse(paidRevenueCat())) as typeof fetch,
    subscriptionStore: store,
  });
  assert.equal(online.response.status, 200);
  assert.equal(online.body.access.kind, 'manok');

  let geminiCalls = 0;
  const malformedFetch = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) return jsonResponse({ nope: true });
    geminiCalls += 1;
    return geminiResponse(recognized);
  }) as typeof fetch;

  const stillPaid = await call(request('/v1/access/refresh', 'POST', { force: true }), {
    env, fetchImpl: malformedFetch, subscriptionStore: store,
  });
  assert.equal(stillPaid.response.status, 200);
  assert.equal(stillPaid.body.access.kind, 'manok');

  const estimate = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    Authorization: `Bearer ${stillPaid.body.grant.token}`,
    'X-Eatlog-Request-ID': 'request-malformed-preserves-cache',
  }), { env, fetchImpl: malformedFetch, subscriptionStore: store });
  assert.equal(estimate.response.status, 200);
  assert.equal(geminiCalls, 1);
});

test('a confirmed revoked or expired RevenueCat response still overwrites the cache and denies', async () => {
  const store = new MemorySubscriptionStore();
  const env = subscriptionEnv();
  const online = await call(request('/v1/access/refresh', 'POST', {}), {
    env,
    fetchImpl: (async () => jsonResponse(paidRevenueCat())) as typeof fetch,
    subscriptionStore: store,
  });
  assert.equal(online.response.status, 200);
  assert.equal(online.body.access.kind, 'manok');

  const revokedFetch = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) return jsonResponse(freeRevenueCat());
    return geminiResponse(recognized);
  }) as typeof fetch;
  const revoked = await call(request('/v1/access/refresh', 'POST', { force: true }), {
    env, fetchImpl: revokedFetch, subscriptionStore: store,
  });
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.body.access.kind, 'pugo');
});

test('an unreachable RevenueCat grants Pugo quota instead of blocking a free estimate', async () => {
  const store = new MemorySubscriptionStore();
  const env = subscriptionEnv();
  let geminiCalls = 0;
  let revenueCatCalls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) {
      revenueCatCalls += 1;
      throw new Error('RevenueCat unavailable');
    }
    geminiCalls += 1;
    return geminiResponse(recognized);
  }) as typeof fetch;

  const estimate = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-outage-0001',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.equal(estimate.response.status, 200);
  assert.equal(geminiCalls, 1);

  const grant = estimate.response.headers.get('x-eatlog-ai-grant');
  assert.equal(typeof grant, 'string');
  const usage = await call(request('/v1/usage', 'GET', undefined, {
    Authorization: `Bearer ${grant}`,
  }), { env, fetchImpl, subscriptionStore: store });
  assert.deepEqual(usage.body, { kind: 'free', remaining24Hours: 2, nextEligibleAt: null });

  const invalid = await call(request('/v1/estimate', 'POST', { privateImage: 'must-not-be-parsed' }, {
    'X-Eatlog-Request-ID': 'request-outage-0002',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.equal(invalid.response.status, 400);
  assert.equal(geminiCalls, 1);

  // The provisional cache absorbs the outage so each request does not re-pay the timeout.
  assert.equal(revenueCatCalls, 1);

  // The fallback grant expires with the outage window. At the 30-day ceiling it would be a
  // bearer token asserting free limits long after RevenueCat recovered, and authorizeEstimate
  // honours a valid grant without re-checking.
  const refreshed = await call(request('/v1/access/refresh', 'POST', { force: true }), {
    env, fetchImpl, subscriptionStore: store,
  });
  const lifetimeMs = Date.parse(refreshed.body.grant.expiresAt) - Date.now();
  assert.ok(lifetimeMs > 0 && lifetimeMs <= 60_000, `provisional grant lived ${lifetimeMs}ms`);
});

test('a paid customer keeps access through an outage that follows a routine webhook', async () => {
  const store = new MemorySubscriptionStore();
  const env = subscriptionEnv();
  const online = await call(request('/v1/access/refresh', 'POST', {}), {
    env,
    fetchImpl: (async () => jsonResponse(paidRevenueCat())) as typeof fetch,
    subscriptionStore: store,
  });
  assert.equal(online.body.access.kind, 'manok');

  // A renewal invalidates the cached entitlement so the next request re-verifies.
  const accepted = await call(request('/v1/revenuecat/webhook', 'POST', {
    api_version: '1.0',
    event: {
      id: 'event-renewal', event_timestamp_ms: 200, app_user_id: INSTALL_ID,
      original_app_user_id: INSTALL_ID, aliases: [INSTALL_ID], type: 'RENEWAL',
    },
  }, { Authorization: 'Bearer webhook-secret' }), { env, subscriptionStore: store });
  assert.equal(accepted.body.result, 'accepted');

  // RevenueCat is now unreachable. Invalidation must not have destroyed the fallback, or a
  // renewal followed by a hiccup would silently demote a paying customer to free limits.
  const outage = await call(request('/v1/access/refresh', 'POST', {}), {
    env,
    fetchImpl: (async () => { throw new Error('RevenueCat unavailable'); }) as typeof fetch,
    subscriptionStore: store,
  });
  assert.equal(outage.response.status, 200);
  assert.equal(outage.body.access.kind, 'manok');
  assert.equal(outage.body.usage.kind, 'paid');

  // The invalidation still forces a live re-check once the upstream answers again.
  let revenueCatCalls = 0;
  const recovered = await call(request('/v1/access/refresh', 'POST', {}), {
    env,
    fetchImpl: (async () => { revenueCatCalls += 1; return jsonResponse(paidRevenueCat()); }) as typeof fetch,
    subscriptionStore: store,
  });
  assert.equal(recovered.body.access.kind, 'manok');
  assert.equal(revenueCatCalls, 1);
});

test('RevenueCat outage prefers an unexpired verified cache and otherwise falls back to redacted Pugo access', async () => {
  const store = new MemorySubscriptionStore();
  const env = subscriptionEnv();
  const online = await call(request('/v1/access/refresh', 'POST', {}), {
    env,
    fetchImpl: (async () => jsonResponse(paidRevenueCat())) as typeof fetch,
    subscriptionStore: store,
  });
  assert.equal(online.response.status, 200);

  const raw = 'raw revenuecat outage and secret identity';
  const cached = await call(request('/v1/access/refresh', 'POST', {}), {
    env,
    fetchImpl: (async () => { throw new Error(raw); }) as typeof fetch,
    subscriptionStore: store,
  });
  assert.equal(cached.response.status, 200);
  assert.equal(JSON.stringify(cached.body).includes(raw), false);

  assert.equal(cached.body.access.kind, 'manok');

  const empty = await call(request('/v1/access/refresh', 'POST', {}), {
    env,
    fetchImpl: (async () => { throw new Error(raw); }) as typeof fetch,
    subscriptionStore: new MemorySubscriptionStore(),
  });
  assert.equal(empty.response.status, 200);
  assert.equal(empty.body.access.kind, 'pugo');
  assert.equal(typeof empty.body.grant.token, 'string');
  assert.equal(empty.body.usage.kind, 'free');
  assert.equal(JSON.stringify(empty.body).includes(raw), false);
});

test('webhook authentication, duplicate delivery, and out-of-order delivery are handled without identifiers in responses', async () => {
  const store = new MemorySubscriptionStore();
  const event = {
    api_version: '1.0',
    event: {
      id: 'event-new', event_timestamp_ms: 200, app_user_id: INSTALL_ID,
      original_app_user_id: INSTALL_ID, aliases: [INSTALL_ID], type: 'EXPIRATION',
    },
  };
  const unauthorized = await call(request('/v1/revenuecat/webhook', 'POST', event), {
    env: subscriptionEnv(), subscriptionStore: store,
  });
  assert.equal(unauthorized.response.status, 401);
  const headers = { Authorization: 'Bearer webhook-secret' };
  const accepted = await call(request('/v1/revenuecat/webhook', 'POST', event, headers), {
    env: subscriptionEnv(), subscriptionStore: store,
  });
  assert.deepEqual(accepted.body, { received: true, result: 'accepted' });
  const duplicate = await call(request('/v1/revenuecat/webhook', 'POST', event, headers), {
    env: subscriptionEnv(), subscriptionStore: store,
  });
  assert.equal(duplicate.body.result, 'duplicate');
  const stale = await call(request('/v1/revenuecat/webhook', 'POST', {
    ...event, event: { ...event.event, id: 'event-old', event_timestamp_ms: 100 },
  }, headers), { env: subscriptionEnv(), subscriptionStore: store });
  assert.equal(stale.body.result, 'stale');
  assert.equal(JSON.stringify(stale.body).includes(INSTALL_ID), false);
});

test('stable store identity preserves paid quota after restore to a new installation ID', async () => {
  const store = new MemorySubscriptionStore();
  const env = subscriptionEnv();
  const fetchImpl = (async (input: string | URL | Request) => String(input).startsWith('https://api.revenuecat.com/')
    ? jsonResponse(paidRevenueCat())
    : geminiResponse(recognized)) as typeof fetch;
  const first = await call(request('/v1/access/refresh', 'POST', {}), { env, fetchImpl, subscriptionStore: store });
  const secondInstall = 'fedcba9876543210fedcba9876543210';
  const second = await call(request('/v1/access/refresh', 'POST', {}, { 'X-Eatlog-Install-ID': secondInstall }), { env, fetchImpl, subscriptionStore: store });
  for (let index = 0; index < 30; index += 1) {
    const grant = index % 2 === 0 ? first.body.grant.token : second.body.grant.token;
    const result = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
      Authorization: `Bearer ${grant}`,
      'X-Eatlog-Request-ID': `restore-request-${String(index).padStart(3, '0')}`,
    }), { env, fetchImpl, subscriptionStore: store });
    assert.equal(result.response.status, 200);
  }
  const over = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    Authorization: `Bearer ${second.body.grant.token}`,
    'X-Eatlog-Request-ID': 'restore-request-over',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.equal(over.response.status, 429);
  assert.equal(over.body.error.code, 'FAIR_USE_DAILY_LIMIT');
});

test('a location-refused estimate retries the same model through the region-pinned relay', async () => {
  resetModelCooldowns();
  const direct: string[] = [];
  const relayedModels: string[] = [];
  const locationHints: Array<string | undefined> = [];
  const refusedFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('https://api.revenuecat.com/')) return jsonResponse(paidRevenueCat('trial'));
    direct.push(url);
    return jsonResponse({
      error: { status: 'FAILED_PRECONDITION', message: 'User location is not supported for the API use.' },
    }, 400);
  }) as typeof fetch;
  const relay = {
    idFromName: (name: string) => name,
    get: (_id: unknown, options?: { locationHint?: string }) => {
      locationHints.push(options?.locationHint);
      return {
        fetch: async (_url: string, init: RequestInit) => {
          relayedModels.push(String((init.headers as Record<string, string>)['x-eatlog-gemini-model']));
          return geminiResponse(recognized);
        },
      };
    },
  } as unknown as DurableObjectNamespace;

  const relayedCall = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-relay-0001',
  }), {
    env: subscriptionEnv({ GEMINI_RELAY: relay }),
    fetchImpl: refusedFetch,
    subscriptionStore: new MemorySubscriptionStore(),
  });
  assert.equal(relayedCall.response.status, 200);
  assert.equal(relayedCall.body.mealName, 'Rice bowl');
  // The refusal is about where the call left from, so the second model is never reached.
  assert.equal(direct.length, 1);
  assert.ok(direct[0].includes(`/models/${contract.PAID_GEMINI_MODELS[0]}:generateContent`));
  assert.deepEqual(relayedModels, [contract.PAID_GEMINI_MODELS[0]]);
  assert.deepEqual(locationHints, ['wnam']);

  direct.length = 0;
  const unrelayed = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-relay-0002',
  }), {
    env: subscriptionEnv(),
    fetchImpl: refusedFetch,
    subscriptionStore: new MemorySubscriptionStore(),
  });
  assert.equal(unrelayed.response.status, 502);
  assert.equal(unrelayed.body.error.code, 'UPSTREAM_ERROR');
  assert.equal(direct.length, contract.PAID_GEMINI_MODELS.length);
});

test('one slow model cannot spend the whole budget, so the fallback model stays reachable', () => {
  // Two models with the full budget: the first is held to 17s so the second keeps its 9s floor.
  assert.equal(attemptBudget(26000, 1), 17000);
  assert.equal(attemptBudget(17000, 0), 17000);
  // The last model may use everything left, however little that is.
  assert.equal(attemptBudget(3000, 0), 3000);
  // Too little left to split: the current model still gets to try rather than being given nothing.
  assert.equal(attemptBudget(5000, 1), 5000);
});

test('a model that times out falls through to the next model instead of failing the request', async () => {
  resetModelCooldowns();
  const attempted: string[] = [];
  const timingOutFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('https://api.revenuecat.com/')) return jsonResponse(paidRevenueCat('trial'));
    attempted.push(url);
    if (url.includes(`/models/${contract.PAID_GEMINI_MODELS[0]}:`)) {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }
    return geminiResponse(recognized);
  }) as typeof fetch;

  const result = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-slow-model-0001',
  }), {
    env: subscriptionEnv(),
    fetchImpl: timingOutFetch,
    subscriptionStore: new MemorySubscriptionStore(),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.mealName, 'Rice bowl');
  assert.equal(attempted.length, 2);
  assert.ok(attempted[1].includes(`/models/${contract.PAID_GEMINI_MODELS[1]}:generateContent`));
});

test('a model that just failed is demoted for a cooldown and promoted again once it lapses', () => {
  const models = ['alpha', 'beta'] as const;
  const now = 1_000_000;

  // Nothing known: the configured order stands.
  assert.deepEqual(routeModels(models, now, new Map()), ['alpha', 'beta']);

  // alpha is cooling down, so beta is called first and alpha stays as the fallback rather
  // than being dropped entirely.
  assert.deepEqual(routeModels(models, now, new Map([['alpha', now + 60_000]])), ['beta', 'alpha']);

  // The cooldown has lapsed, so alpha leads again with no deploy.
  assert.deepEqual(routeModels(models, now, new Map([['alpha', now - 1]])), ['alpha', 'beta']);

  // Everything is cooling down: still call them all rather than leaving nothing to try.
  assert.deepEqual(
    routeModels(models, now, new Map([['alpha', now + 60_000], ['beta', now + 60_000]])),
    ['alpha', 'beta'],
  );
});

test('an overloaded model is skipped on the next request instead of being retried every time', async () => {
  resetModelCooldowns();
  const attempts: string[] = [];
  const overloadedFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('https://api.revenuecat.com/')) return jsonResponse(paidRevenueCat('trial'));
    attempts.push(url.includes(`/models/${contract.PAID_GEMINI_MODELS[0]}:`) ? 'first' : 'second');
    if (url.includes(`/models/${contract.PAID_GEMINI_MODELS[0]}:`)) {
      return jsonResponse({ error: { status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } }, 503);
    }
    return geminiResponse(recognized);
  }) as typeof fetch;

  const store = new MemorySubscriptionStore();
  const send = (id: string) => call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': id,
  }), { env: subscriptionEnv(), fetchImpl: overloadedFetch, subscriptionStore: store });

  const first = await send('request-overload-0001');
  assert.equal(first.response.status, 200);
  // The 503 is discovered, then the healthy model answers.
  assert.deepEqual(attempts, ['first', 'second']);

  attempts.length = 0;
  const second = await send('request-overload-0002');
  assert.equal(second.response.status, 200);
  // The overloaded model is not called again while it is cooling down.
  assert.deepEqual(attempts, ['second']);
});

/*
 * Milestone 1 regression cases for the food-estimation plan. Each one reproduces a defect the
 * 2026-09-05 service review confirmed, and each asserts the behaviour the service is meant to
 * have rather than the behaviour it has today. They are marked `todo` with the task that owns
 * the repair, so the suite stays usable while the milestones land and each case turns green in
 * its own task instead of being quietly rewritten.
 */

const REGRESSION_COOKIE = {
  ...recognized,
  mealName: 'Cookies',
  components: [{
    ...recognized.components[0],
    name: 'Cookies',
    estimatedGrams: 30,
    servingSizeGrams: 30,
    servingLabel: '3 cookies',
    caloriesPer100g: 480,
  }],
};

test('one request ID means one inference, not one charge and three provider calls', {
  todo: 'Task 5 — coordinated execution and short result replay',
}, async () => {
  resetModelCooldowns();
  const store = new MemorySubscriptionStore();
  const env = subscriptionEnv();
  let geminiCalls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) return jsonResponse(paidRevenueCat());
    geminiCalls += 1;
    return geminiResponse(recognized);
  }) as typeof fetch;

  // The transport retry of one intentional estimate: identical payload, identical ID.

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
      'X-Eatlog-Request-ID': 'request-duplicate-transport',
    }), { env, fetchImpl, subscriptionStore: store });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.status, 'recognized');
  }

  // Confirmed: three upstream generations were billed against one reserved allowance unit.
  assert.equal(geminiCalls, 1);
});

test('a request ID bound to one payload cannot be reused for different content', {
  todo: 'Task 5 — coordinated execution and short result replay',
}, async () => {
  resetModelCooldowns();
  const env = subscriptionEnv();
  let geminiCalls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) return jsonResponse(paidRevenueCat());
    geminiCalls += 1;
    return geminiResponse(recognized);
  }) as typeof fetch;
  const store = new MemorySubscriptionStore();

  const first = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-rebound-payload',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.equal(first.response.status, 200);

  // A different meal under an already-spent identifier is a new generation, and the server has
  // no fingerprint to notice it: the estimate runs free of the allowance it should cost.
  const reused = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'lechon kawali' }, {
    'X-Eatlog-Request-ID': 'request-rebound-payload',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.notEqual(reused.response.status, 200);
  assert.equal(geminiCalls, 1);
});

test('a provider outage does not lock a customer out once the provider recovers', {
  todo: 'Task 4 — separate provider recovery from abuse limits',
}, async () => {
  resetModelCooldowns();
  const store = new MemorySubscriptionStore();
  const env = subscriptionEnv();
  let healthy = false;
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) return jsonResponse(paidRevenueCat());
    if (healthy) return geminiResponse(recognized);
    return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'overloaded' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  for (let index = 1; index <= 5; index += 1) {
    const failed = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
      'X-Eatlog-Request-ID': `request-provider-outage-000${index}`,
    }), { env, fetchImpl, subscriptionStore: store });
    assert.equal(failed.response.status, 502);
  }

  // The provider is well again. Five of its own failures are not five abusive submissions, so
  // the next real attempt has to reach it rather than being refused for the rest of the day.
  healthy = true;
  resetModelCooldowns();
  const recovered = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-provider-outage-0006',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.body.status, 'recognized');
});

test('the upstream deadline covers a stalled response body, not only its headers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  let releaseBody = (): void => {};
  let announceFetch = (): void => {};
  const stalled = new Promise<void>((resolve) => { releaseBody = resolve; });
  const fetchStarted = new Promise<void>((resolve) => { announceFetch = resolve; });
  const fetchImpl = (async (_input: unknown, init: RequestInit = {}) => {
    signal = init.signal ?? undefined;
    announceFetch();
    // Headers now, body later: the shape a stalled connection actually has.
    return new Response(new ReadableStream({
      async pull(controller) {
        await stalled;
        controller.enqueue(new TextEncoder().encode(JSON.stringify(usdaFood())));
        controller.close();
      },
    }), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const pending = call(request('/v1/usda/foods/1'), { fetchImpl });
  await fetchStarted;
  // Well past the eight-second USDA budget, with the body still unread. The same
  // fetch-and-read pair carries every Gemini and RevenueCat call.
  t.mock.timers.tick(9000);
  const abortedInTime = signal?.aborted === true;
  releaseBody();
  await pending;
  assert.equal(abortedInTime, true);
});

test('unknown nutrient values are never presented as zero', async () => {
  resetModelCooldowns();
  const unknownNutrients = {
    ...recognized,
    components: [{
      ...recognized.components[0],
      caloriesPer100g: null,
      proteinPer100g: null,
      carbsPer100g: null,
      fatPer100g: null,
    }],
  };
  const { response, body } = await call(
    request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }),
    { fetchImpl: (async () => geminiResponse(unknownNutrients)) as typeof fetch },
  );

  // `Number(null)` is 0, so today this is a confident 200 reporting a zero-calorie meal.
  assert.equal(response.status, 502);
  assert.equal(body.error.code, 'MALFORMED_UPSTREAM');
});

test('physically impossible masses and densities are rejected instead of logged', async () => {
  resetModelCooldowns();
  const impossible = {
    ...recognized,
    components: [{
      ...recognized.components[0],
      estimatedGrams: 1_000_000_000,
      servingSizeGrams: 1_000_000_000,
      caloriesPer100g: 5_000,
      proteinPer100g: 200,
      carbsPer100g: 200,
      fatPer100g: 200,
    }],
  };
  const { response, body } = await call(
    request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }),
    { fetchImpl: (async () => geminiResponse(impossible)) as typeof fetch },
  );

  assert.equal(response.status, 502);
  assert.equal(body.error.code, 'MALFORMED_UPSTREAM');
});

test('an amount the user stated survives an ambiguous counted serving label', async () => {
  resetModelCooldowns();
  const { response, body } = await call(
    request('/v1/estimate', 'POST', { operation: 'describe', text: '30g cookies' }),
    { fetchImpl: (async () => geminiResponse(REGRESSION_COOKIE)) as typeof fetch },
  );

  assert.equal(response.status, 200);
  // "3 cookies" weighing 30g in total and "3 cookies" weighing 30g each are indistinguishable
  // from this metadata, so multiplying the label count by the serving mass tripled an amount
  // the user had already weighed.
  assert.equal(body.components[0].estimatedGrams, 30);
});

test('every generated attempt is priced, including its thinking tokens', {
  todo: 'Task 7 — measure every attempt and final outcome accurately',
}, async () => {
  resetModelCooldowns();
  const original = console.log;
  const logs: Array<Record<string, unknown>> = [];
  console.log = (value?: unknown) => {
    if (typeof value === 'string') { try { logs.push(JSON.parse(value)); } catch {} }
  };
  try {
    let attempt = 0;
    const fetchImpl = (async () => {
      attempt += 1;
      // A truncated first generation still consumed — and is still billed for — every token it
      // produced, thinking included.
      return jsonResponse({
        candidates: [{
          content: { parts: [{ text: attempt === 1 ? '{"status":"recog' : JSON.stringify(recognized) }] },
          finishReason: attempt === 1 ? 'MAX_TOKENS' : 'STOP',
        }],
        usageMetadata: {
          promptTokenCount: 1_000,
          candidatesTokenCount: 250,
          thoughtsTokenCount: 750,
        },
      });
    }) as typeof fetch;

    const { response } = await call(
      request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }),
      {
        env: makeEnv({ GEMINI_INPUT_USD_PER_MILLION: '0.1', GEMINI_OUTPUT_USD_PER_MILLION: '0.4' }),
        fetchImpl,
      },
    );
    assert.equal(response.status, 200);
    assert.equal(attempt, 2);

    const usage = logs.filter((entry) => entry.event === 'ai_usage');
    // One record per generated attempt, each counting the thoughts it was billed for.
    assert.equal(usage.length, 2);
    assert.deepEqual(usage.map((entry) => entry.outputTokens), [1_000, 1_000]);
  } finally {
    console.log = original;
  }
});

/*
 * Task 3 of the food-estimation plan. Every stage of one request answers to a single deadline,
 * so these drive each stage past its budget with mocked timers rather than by waiting.
 */

/** Resolves once the worker has actually reached the stage under test, so ticking is not a race. */
function arrival(): { reached: Promise<void>; announce: () => void } {
  let announce = (): void => {};
  const reached = new Promise<void>((resolve) => { announce = resolve; });
  return { reached, announce: () => announce() };
}

test('an upstream that never sends headers is abandoned rather than waited out', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { reached, announce } = arrival();
  const fetchImpl = (async (_input: unknown, init: RequestInit = {}) => {
    announce();
    return await new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  }) as typeof fetch;

  const pending = call(request('/v1/usda/foods/1'), { fetchImpl });
  await reached;
  t.mock.timers.tick(9000);
  const { response, body } = await pending;
  assert.equal(response.status, 504);
  assert.equal(body.error.code, 'UPSTREAM_TIMEOUT');
});

test('a response body that stops mid-JSON is an invalid response, not a partial estimate', async () => {
  const truncated = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"foods":[{"fdcId":1,'));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const { response, body } = await call(
    request('/v1/usda/search', 'POST', { query: 'rice', mode: 'common' }),
    { fetchImpl: (async () => truncated) as typeof fetch },
  );
  assert.equal(response.status, 502);
  assert.equal(body.error.code, 'MALFORMED_UPSTREAM');
});

test('an upstream body past its cap is refused while it streams, not after it is held', async () => {
  let delivered = 0;
  const flood = () => new Response(
    new ReadableStream({
      pull(controller) {
        delivered += 64 * 1024;
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const { response, body } = await call(
    request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }),
    { fetchImpl: (async () => flood()) as typeof fetch },
  );
  assert.equal(response.status, 502);
  assert.equal(body.error.code, 'MALFORMED_UPSTREAM');
  // The stream is endless, so a finite total is the whole point: the cap stopped it, and the
  // Worker never buffered more than the two attempts' caps plus the runtime's read-ahead.
  assert.equal(Number.isFinite(delivered) && delivered > 0, true);
  assert.equal(delivered < 8 * 1024 * 1024, true);
});

test('an unreachable RevenueCat gives up in time for the estimate it was authorizing', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  resetModelCooldowns();
  const { reached, announce } = arrival();
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) {
      announce();
      return await new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return geminiResponse(recognized);
  }) as typeof fetch;

  const pending = call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-hung-authorization',
  }), { env: subscriptionEnv(), fetchImpl, subscriptionStore: new MemorySubscriptionStore() });
  await reached;
  t.mock.timers.tick(9000);
  const { response, body } = await pending;
  // The outage falls back to Pugo rather than failing, and the estimate still runs.
  assert.equal(response.status, 200);
  assert.equal(body.status, 'recognized');
});

test('a quota store that never answers fails the request instead of holding it open', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const memory = new MemorySubscriptionStore();
  const { reached, announce } = arrival();
  const hungStore: SubscriptionStore = {
    getCached: memory.getCached.bind(memory),
    putCached: memory.putCached.bind(memory),
    recordWebhook: memory.recordWebhook.bind(memory),
    usage: memory.usage.bind(memory),
    finalize: memory.finalize.bind(memory),
    refund: memory.refund.bind(memory),
    reserve: () => { announce(); return new Promise(() => {}); },
  };
  const fetchImpl = (async (input: string | URL | Request) => (
    String(input).startsWith('https://api.revenuecat.com/')
      ? jsonResponse(paidRevenueCat())
      : geminiResponse(recognized)
  )) as typeof fetch;

  const pending = call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-hung-state',
  }), { env: subscriptionEnv(), fetchImpl, subscriptionStore: hungStore });
  await reached;
  t.mock.timers.tick(4000);
  const { response, body } = await pending;
  assert.equal(response.status, 504);
  assert.equal(body.error.code, 'STATE_TIMEOUT');
});

test('the region relay is given the budget it must finish inside', async () => {
  resetModelCooldowns();
  const relayHeaders: Array<Record<string, string>> = [];
  const relayStub = {
    fetch: async (_url: string, init: RequestInit = {}) => {
      relayHeaders.push(init.headers as Record<string, string>);
      return geminiResponse(recognized);
    },
  };
  const env = subscriptionEnv({
    GEMINI_RELAY: {
      idFromName: () => 'relay-id',
      get: () => relayStub,
    } as unknown as DurableObjectNamespace,
  });
  const refusal = jsonResponse({
    error: { status: 'FAILED_PRECONDITION', message: 'User location is not supported for the API use.' },
  }, 400);
  const fetchImpl = (async (input: string | URL | Request) => (
    String(input).startsWith('https://api.revenuecat.com/') ? jsonResponse(paidRevenueCat()) : refusal
  )) as typeof fetch;

  const { response } = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
    'X-Eatlog-Request-ID': 'request-relay-budget',
  }), { env, fetchImpl, subscriptionStore: new MemorySubscriptionStore() });

  assert.equal(response.status, 200);
  assert.equal(relayHeaders.length, 1);
  const budget = Number(relayHeaders[0]['x-eatlog-deadline-ms']);
  // The relay's own hop is invisible to our abort, so it has to be told how long it may take.
  assert.equal(Number.isFinite(budget) && budget > 0 && budget <= 26000, true);
});

test('a model with too little time left is not called twice for the sake of the list', () => {
  // Nine seconds is one model's floor. Authorization that leaves less than two of them must
  // buy one attempt that can finish rather than two that cannot.
  assert.equal(attemptBudget(9000, 0), 9000);
  assert.equal(attemptBudget(26000, 1), 17000);
  assert.equal(attemptBudget(12000, 1), 9000);
});
