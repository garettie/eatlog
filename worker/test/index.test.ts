import assert from 'node:assert/strict';
import test from 'node:test';

import { contract, handleRequest, hashInstallId, type Env } from '../src/index.js';
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

test('normalizes a counted serving label to one unit and the consumed total', async () => {
  const countedEggs = {
    ...recognized,
    mealName: 'Eggs',
    components: [{
      ...recognized.components[0],
      name: 'Eggs',
      estimatedGrams: 50,
      servingSizeGrams: 50,
      servingLabel: '2 eggs',
    }],
  };
  const { response, body } = await call(
    request('/v1/estimate', 'POST', { operation: 'describe', text: '2 eggs' }),
    { fetchImpl: (async () => geminiResponse(countedEggs)) as typeof fetch },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(
    {
      estimatedGrams: body.components[0].estimatedGrams,
      servingSizeGrams: body.components[0].servingSizeGrams,
      servingLabel: body.components[0].servingLabel,
    },
    { estimatedGrams: 100, servingSizeGrams: 50, servingLabel: '1 egg' },
  );
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
  assert.ok(staticRequestBytes <= 4_500, `Gemini text request grew to ${staticRequestBytes} bytes`);
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
  assert.ok(requestBytes <= 8_500, `Maximum Gemini clarification request grew to ${requestBytes} bytes`);
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

test('Pugo refresh and inline estimates share one five-request installation allowance', async () => {
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
    remaining24Hours: 5,
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
    remaining24Hours: 4,
    nextEligibleAt: null,
  });

  for (let index = 2; index <= 5; index += 1) {
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
    'X-Eatlog-Request-ID': 'request-pugo-0006',
  }), { env, fetchImpl, subscriptionStore: store });
  assert.equal(over.response.status, 429);
  assert.equal(over.body.error.code, 'PUGO_DAILY_LIMIT');
  assert.equal(typeof over.body.error.nextEligibleAt, 'string');
  assert.equal(geminiUrls.length, 5);
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
  assert.equal(geminiUrls.length, 5);
});

test('Pugo falls back from Gemini 2.5 to 3.5 and uses only the successful model rate pair', async () => {
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
      GEMINI_25_INPUT_USD_PER_MILLION: '1',
      GEMINI_25_OUTPUT_USD_PER_MILLION: '2',
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
    assert.equal(fallbackUsage?.model, 'gemini-3.5-flash-lite');
    assert.equal(fallbackUsage?.estimatedCostUsd, 0.0002);

    logs.length = 0;
    const primary = await call(request('/v1/estimate', 'POST', { operation: 'describe', text: 'rice' }, {
      'X-Eatlog-Request-ID': 'request-pugo-primary',
    }), {
      env: subscriptionEnv({
        GEMINI_INPUT_USD_PER_MILLION: '0.1',
        GEMINI_OUTPUT_USD_PER_MILLION: '0.4',
        GEMINI_25_INPUT_USD_PER_MILLION: '',
        GEMINI_25_OUTPUT_USD_PER_MILLION: '-1',
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
    assert.equal(primaryUsage?.model, 'gemini-2.5-flash-lite');
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

test('malformed RevenueCat access fails before parsing private content or calling Gemini', async () => {
  let geminiCalls = 0;
  const malformedFetch = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://api.revenuecat.com/')) return jsonResponse({ nope: true });
    geminiCalls += 1;
    return geminiResponse(recognized);
  }) as typeof fetch;
  const malformed = await call(request('/v1/estimate', 'POST', { privateImage: 'must-not-be-parsed' }, {
    'X-Eatlog-Request-ID': 'request-malformed-free',
  }), {
    env: subscriptionEnv(),
    fetchImpl: malformedFetch,
    subscriptionStore: new MemorySubscriptionStore(),
  });
  assert.equal(malformed.response.status, 503);
  assert.equal(malformed.body.error.code, 'ENTITLEMENT_UNAVAILABLE');
  assert.equal(geminiCalls, 0);
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
  assert.deepEqual(usage.body, { kind: 'free', remaining24Hours: 4, nextEligibleAt: null });

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
