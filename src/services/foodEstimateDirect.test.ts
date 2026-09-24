import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeFoodEstimate } from './foodEstimateCore';
import { GEMINI_ESTIMATE_MODELS, GEMINI_ORIGIN } from './foodEstimateGemini';
import { createFoodEstimateClient, type AiRoute, type FoodEstimateClientOptions } from './foodScan';

const USER_KEY = 'synthetic-user-key-0000';
const WORKER_URL = 'https://food.example.workers.dev';

interface Call {
    url: string;
    init: RequestInit;
}

function modelAnswer() {
    return {
        status: 'recognized',
        unrecognizedReason: null,
        mealName: 'chicken adobo with rice',
        servesTotal: null,
        servingUnit: null,
        components: [{
            name: 'chicken adobo',
            estimatedGrams: 200,
            servingSizeGrams: 100,
            caloriesPer100g: 190,
            proteinPer100g: 18,
            carbsPer100g: 3,
            fatPer100g: 11,
            brand: null,
            preparation: 'braised',
            servingLabel: '2 pieces',
            confidence: 'medium',
            confidenceReason: null,
        }, {
            name: 'white rice',
            estimatedGrams: 180,
            servingSizeGrams: 180,
            caloriesPer100g: 130,
            proteinPer100g: 2.7,
            carbsPer100g: 28,
            fatPer100g: 0.3,
            brand: null,
            preparation: 'cooked',
            servingLabel: '1 cup (180 g)',
            confidence: 'high',
            confidenceReason: null,
        }],
    };
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function geminiReply(answer: unknown = modelAnswer(), finishReason = 'STOP'): Response {
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] }, finishReason }] });
}

function googleError(status: number, errorStatus: string, message: string, reason?: string): Response {
    return json({
        error: {
            code: status,
            status: errorStatus,
            message,
            ...(reason ? { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] } : {}),
        },
    }, status);
}

/**
 * A My key client with every Eatlog dependency wired to fail loudly: no Worker URL, a paywall
 * answer from RevenueCat, no hosted consent, and an install identity that must not be read.
 */
function myKeyClient(respond: (call: Call, index: number) => Response | Promise<Response>, overrides: Partial<FoodEstimateClientOptions> = {}) {
    const calls: Call[] = [];
    const client = createFoodEstimateClient({
        workerUrl: '',
        getAiRoute: () => 'my-key',
        getUserApiKey: async () => USER_KEY,
        hasConsent: () => { throw new Error('hosted consent must not be read'); },
        getAiAuthorization: () => ({ ok: false, kind: 'paid-access-required' }),
        getInstallationToken: () => { throw new Error('install identity must not be read'); },
        acceptAiGrant: () => { throw new Error('no grant exists on My key'); },
        requestId: () => { throw new Error('no request identifier is sent on My key'); },
        fetchImpl: (async (input, init) => {
            const call = { url: String(input), init: init ?? {} };
            calls.push(call);
            return respond(call, calls.length - 1);
        }) as typeof fetch,
        ...overrides,
    });
    return { client, calls };
}

test('My key posts straight to Google with the key in a header and nothing Eatlog-specific', async () => {
    const { client, calls } = myKeyClient(() => geminiReply());

    const result = await client.describeMeal('adobo with rice');

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${GEMINI_ORIGIN}/v1beta/models/${GEMINI_ESTIMATE_MODELS[0]}:generateContent`);
    assert.ok(!calls[0].url.includes(USER_KEY));
    const headers = calls[0].init.headers as Record<string, string>;
    assert.deepEqual(Object.keys(headers).sort(), ['Content-Type', 'x-goog-api-key']);
    assert.equal(headers['x-goog-api-key'], USER_KEY);
    const body = JSON.parse(String(calls[0].init.body));
    assert.match(body.contents[0].parts[0].text, /User description: "adobo with rice"/);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
});

test('My key and Eatlog AI deliver the same review result for the same model answer', async () => {
    // The Worker answers with the shared normalization of the same model output.
    const hosted = createFoodEstimateClient({
        workerUrl: WORKER_URL,
        getAiRoute: () => 'eatlog-ai',
        hasConsent: async () => true,
        getAiAuthorization: () => ({ ok: true, grant: 'signed-grant' }),
        getInstallationToken: () => '0123456789abcdef0123456789abcdef',
        requestId: () => 'request-00000001',
        now: () => 7,
        fetchImpl: (async () => json(normalizeFoodEstimate(modelAnswer(), 'scan'))) as typeof fetch,
    });
    const { client: directClient } = myKeyClient(() => geminiReply(), { now: () => 7 });

    const [fromHosted, fromDirect] = await Promise.all([
        hosted.scanFood('c3ludGhldGlj', '2 pcs adobo'),
        directClient.scanFood('c3ludGhldGlj', '2 pcs adobo'),
    ]);

    assert.equal(fromDirect.ok, true);
    assert.deepEqual(fromDirect, fromHosted);
});

test('every operation runs on My key without the Worker, RevenueCat, or hosted consent', async () => {
    const { client, calls } = myKeyClient(() => geminiReply({ ...modelAnswer(), components: [modelAnswer().components[0]] }));
    const context = { components: [{ name: 'Chicken', estimatedGrams: 150 }], originalDescription: 'adobo' };

    assert.equal((await client.scanFood('c3ludGhldGlj')).ok, true);
    assert.equal((await client.describeMeal('adobo')).ok, true);
    assert.notEqual(await client.clarifyMeal({ name: 'Pork adobo', ...context }), null);
    assert.notEqual(await client.clarifyComponent({ name: 'Pork', mealName: 'Adobo', ...context }), null);

    assert.equal(calls.length, 4);
    assert.ok(calls.every((call) => call.url.startsWith(GEMINI_ORIGIN)));
    const operations = calls.map((call) => JSON.parse(String(call.init.body)).contents[0].parts);
    assert.equal(operations[0][1].inlineData.mimeType, 'image/jpeg');
    assert.match(operations[2][0].text, /Updated meal name: "Pork adobo"/);
    assert.match(operations[3][0].text, /Component name: "Pork"/);
});

test('a rejected key fails at once as key-invalid, without trying the next model', async () => {
    const cases = [
        googleError(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID'),
        googleError(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.'),
        googleError(403, 'PERMISSION_DENIED', 'Your API key was reported as leaked. Please use another API key.'),
        googleError(403, 'PERMISSION_DENIED', 'Generative Language API has not been used in this project.', 'SERVICE_DISABLED'),
    ];
    for (const response of cases) {
        const { client, calls } = myKeyClient(() => response.clone());
        const result = await client.describeMeal('adobo');
        assert.deepEqual(result.ok ? null : result.kind, 'key-invalid');
        assert.equal(calls.length, 1);
    }
});

test('a location refusal fails at once, with no relay, hosted retry, or second model', async () => {
    const { client, calls } = myKeyClient(() => googleError(400, 'FAILED_PRECONDITION', 'User location is not supported for the API use.'));

    const result = await client.describeMeal('adobo');

    assert.equal(result.ok ? null : result.kind, 'location-unsupported');
    assert.equal(result.ok ? null : result.message, "Google doesn't serve your current location.");
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.startsWith(GEMINI_ORIGIN));
});

test('quota exhaustion moves to the next model and reports key-limit when every model is out', async () => {
    const exhausted = () => googleError(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded for metric.');
    const allOut = myKeyClient(exhausted);
    const result = await allOut.client.describeMeal('adobo');
    assert.equal(result.ok ? null : result.kind, 'key-limit');
    assert.deepEqual(allOut.calls.map((call) => call.url), GEMINI_ESTIMATE_MODELS.map((model) => `${GEMINI_ORIGIN}/v1beta/models/${model}:generateContent`));

    // A fallback model that is merely missing must not hide that the key ran out.
    const thenMissing = myKeyClient((_call, index) => index === 0 ? exhausted() : googleError(404, 'NOT_FOUND', 'Model not found.'));
    const hidden = await thenMissing.client.describeMeal('adobo');
    assert.equal(hidden.ok ? null : hidden.kind, 'key-limit');

    const recovered = myKeyClient((_call, index) => index === 0 ? exhausted() : geminiReply());
    assert.equal((await recovered.client.describeMeal('adobo')).ok, true);
    assert.equal(recovered.calls.length, 2);
});

test('an unavailable model, overload, or unusable answer moves to the next model', async () => {
    const firstFailures = [
        () => googleError(404, 'NOT_FOUND', 'models/x is not found.'),
        () => googleError(403, 'PERMISSION_DENIED', 'Permission denied on this model.'),
        () => googleError(503, 'UNAVAILABLE', 'The model is overloaded.'),
        () => json({ candidates: [{ content: { parts: [{ text: '{"status":' }] }, finishReason: 'MAX_TOKENS' }] }),
        () => { throw new TypeError('Network request failed'); },
    ];
    for (const firstFailure of firstFailures) {
        const { client, calls } = myKeyClient((_call, index) => index === 0 ? firstFailure() : geminiReply());
        assert.equal((await client.describeMeal('adobo')).ok, true);
        assert.equal(calls.length, 2);
    }

    const bothDown = myKeyClient(() => googleError(503, 'UNAVAILABLE', 'The model is overloaded.'));
    const down = await bothDown.client.describeMeal('adobo');
    assert.equal(down.ok ? null : down.kind, 'provider');
    const offline = myKeyClient(() => { throw new TypeError('Network request failed'); });
    const unreachable = await offline.client.describeMeal('adobo');
    assert.equal(unreachable.ok ? null : unreachable.kind, 'network');
});

test('a blocked or unrecognized answer is final and never tries another model', async () => {
    const blocked = myKeyClient(() => geminiReply(modelAnswer(), 'SAFETY'));
    const refusal = await blocked.client.describeMeal('adobo');
    assert.equal(refusal.ok ? null : refusal.kind, 'invalid-response');
    assert.equal(blocked.calls.length, 1);

    const unrecognized = myKeyClient(() => geminiReply({
        status: 'unrecognized', unrecognizedReason: 'Not food.', mealName: null, servesTotal: null, servingUnit: null, components: [],
    }));
    const none = await unrecognized.client.describeMeal('a chair');
    assert.equal(none.ok ? null : none.kind, 'unrecognized');
    assert.equal(unrecognized.calls.length, 1);
});

test('a hung model gets its share of the 35s budget, and the next model keeps its floor', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let clock = 0;
    const hang = (call: Call) => new Promise<Response>((_resolve, reject) => {
        call.init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });

    const { client, calls } = myKeyClient((call, index) => index === 0 ? hang(call) : geminiReply(), { now: () => clock });
    const pending = client.describeMeal('adobo');
    await new Promise((resolve) => setImmediate(resolve));
    clock = 26_000;
    t.mock.timers.tick(26_000);
    assert.equal((await pending).ok, true);
    assert.equal(calls.length, 2);

    clock = 0;
    const stalled = myKeyClient((call) => hang(call), { now: () => clock });
    const timingOut = stalled.client.describeMeal('adobo');
    await new Promise((resolve) => setImmediate(resolve));
    clock = 26_000;
    t.mock.timers.tick(26_000);
    await new Promise((resolve) => setImmediate(resolve));
    clock = 35_000;
    t.mock.timers.tick(9_000);
    const result = await timingOut;
    assert.equal(result.ok ? null : result.kind, 'timeout');
    assert.equal(stalled.calls.length, 2);
});

test('cancelling stops the wait without aborting the request to Google', async () => {
    let release: (() => void) | undefined;
    const { client, calls } = myKeyClient(() => new Promise<Response>((resolve) => { release = () => resolve(geminiReply()); }));
    const controller = new AbortController();

    const pending = client.describeMeal('adobo', { signal: controller.signal });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();

    const result = await pending;
    assert.equal(result.ok ? null : result.kind, 'cancelled');
    assert.equal(calls[0].init.signal?.aborted, false);
    release?.();
});

test('removing the key or deleting all data discards an estimate still running', async () => {
    let release: (() => void) | undefined;
    const { client } = myKeyClient(() => new Promise<Response>((resolve) => { release = () => resolve(geminiReply()); }));

    const pending = client.describeMeal('adobo');
    await new Promise((resolve) => setImmediate(resolve));
    client.clearActions();
    release?.();

    const result = await pending;
    assert.equal(result.ok ? null : result.kind, 'cancelled');
});

test('a request that starts after the key is gone sends nothing', async () => {
    const { client, calls } = myKeyClient(() => geminiReply(), { getUserApiKey: async () => null });

    const result = await client.describeMeal('adobo');

    assert.equal(result.ok ? null : result.kind, 'cancelled');
    assert.equal(calls.length, 0);
});

test('the same food on the other route is a separate action, never merged with the first', async () => {
    let route: AiRoute = 'my-key';
    const releases: Array<() => void> = [];
    const urls: string[] = [];
    const client = createFoodEstimateClient({
        workerUrl: WORKER_URL,
        getAiRoute: () => route,
        getUserApiKey: async () => USER_KEY,
        hasConsent: async () => true,
        getAiAuthorization: () => ({ ok: true, grant: 'signed-grant' }),
        getInstallationToken: () => '0123456789abcdef0123456789abcdef',
        requestId: () => 'request-00000001',
        fetchImpl: (async (input) => {
            urls.push(String(input));
            const direct = String(input).startsWith(GEMINI_ORIGIN);
            return new Promise<Response>((resolve) => {
                releases.push(() => resolve(direct ? geminiReply() : json(normalizeFoodEstimate(modelAnswer(), 'describe'))));
            });
        }) as typeof fetch,
    });

    const first = client.describeMeal('adobo');
    const shared = client.describeMeal('adobo');
    route = 'eatlog-ai';
    const other = client.describeMeal('adobo');
    await new Promise((resolve) => setImmediate(resolve));
    releases.forEach((release) => release());

    assert.equal((await first).ok, true);
    assert.equal((await shared).ok, true);
    assert.equal((await other).ok, true);
    assert.equal(urls.length, 2);
    assert.ok(urls[0].startsWith(GEMINI_ORIGIN));
    assert.equal(urls[1], `${WORKER_URL}/v1/estimate`);
});
