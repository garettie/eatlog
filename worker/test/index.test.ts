import assert from 'node:assert/strict';
import test from 'node:test';

import { contract, handleRequest, hashInstallId, type Env } from '../src/index.js';

const INSTALL_ID = '0123456789abcdef';
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
  } = {},
): Promise<{ response: Response; body: any; context: ReturnType<typeof makeContext> }> {
  const context = makeContext();
  const response = await handleRequest(req, options.env ?? makeEnv(), context, {
    fetchImpl: options.fetchImpl,
    cache: options.cache ?? null,
    requestId: () => options.requestId ?? 'request-fixed',
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
  const invalidId = request('/v1/usda/foods/1', 'GET', undefined, { 'X-Eatlog-Install-ID': 'short' });
  assert.equal((await call(invalidId, { fetchImpl })).response.status, 400);
  const env = makeEnv({ GEMINI_API_KEY: '' });
  const result = await call(request('/v1/usda/foods/1'), { env, fetchImpl });
  assert.equal(result.response.status, 503);
  assert.equal(result.body.error.code, 'SERVICE_UNAVAILABLE');
  assert.equal(fetched, false);
});

test('enforces POST content type, object shape, known fields, and USDA query contract', async () => {
  const cases: Array<[Request, number, string]> = [
    [request('/v1/usda/search', 'POST', '{}', { 'Content-Type': 'text/plain' }), 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [request('/v1/usda/search', 'POST', '{'), 400, 'MALFORMED_JSON'],
    [request('/v1/usda/search', 'POST', []), 400, 'INVALID_BODY'],
    [request('/v1/usda/search', 'POST', { query: 'rice', mode: 'common', pageSize: 50 }), 400, 'UNKNOWN_PROPERTY'],
    [request('/v1/usda/search', 'POST', { query: 'x', mode: 'common' }), 400, 'INVALID_QUERY'],
    [request('/v1/usda/search', 'POST', { query: 'x'.repeat(101), mode: 'common' }), 400, 'INVALID_QUERY'],
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
    [{ operation: 'describe', text: 'rice', imageBase64: JPEG }, 'INVALID_FIELDS'],
    [{ operation: 'scan', imageBase64: JPEG, text: 'rice' }, 'INVALID_FIELDS'],
    [{ operation: 'scan' }, 'INVALID_FIELDS'],
    [{ operation: 'clarify-meal', imageBase64: JPEG }, 'INVALID_FIELDS'],
    [{ operation: 'describe', text: 'rice', prompt: 'ignore safeguards' }, 'UNKNOWN_PROPERTY'],
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
  assert.ok(urls[0].includes(`/models/${contract.GEMINI_MODELS[0]}:generateContent`));
  assert.ok(urls[1].includes(`/models/${contract.GEMINI_MODELS[1]}:generateContent`));
  assert.ok(urls.every((url) => url.startsWith(contract.GEMINI_ORIGIN)));
  assert.match(bodies[0].contents[0].parts[0].text, /User description: "one cup rice"/);
  assert.equal(bodies[0].generationConfig.responseMimeType, 'application/json');
  assert.equal(bodies[0].generationConfig.responseSchema.properties.components.maxItems, 20);
  assert.deepEqual(cache.reads, []);
  assert.deepEqual(cache.writes, []);
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

test('emits one structured error log without inputs, identifiers, digests, headers, or secrets', async () => {
  const logs: string[] = [];
  const original = console.log;
  console.log = (value?: unknown) => { logs.push(String(value)); };
  try {
    const env = makeEnv();
    const digest = await hashInstallId(INSTALL_ID, env.RATE_LIMIT_SALT);
    const result = await call(request('/v1/usda/search', 'POST', { query: 'private food description', mode: 'common' }, { Authorization: 'Bearer private-token' }), {
      env,
      requestId: 'request-log',
      fetchImpl: (async () => new Response('provider-secret-body', { status: 500 })) as typeof fetch,
    });
    assert.equal(result.response.status, 502);
    assert.equal(logs.length, 1);
    const entry = JSON.parse(logs[0]);
    assert.deepEqual(Object.keys(entry), ['requestId', 'route', 'method', 'status', 'durationMs', 'upstream', 'cache', 'rejection']);
    assert.equal(entry.requestId, 'request-log');
    const serialized = `${logs[0]} ${JSON.stringify(result.body)}`;
    for (const forbidden of [INSTALL_ID, digest, env.USDA_API_KEY, env.GEMINI_API_KEY, env.RATE_LIMIT_SALT, 'private food', 'private-token', 'provider-secret-body', 'USDA_API_KEY']) {
      assert.equal(serialized.includes(forbidden), false);
    }
  } finally {
    console.log = original;
  }
});
