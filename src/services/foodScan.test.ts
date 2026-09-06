import assert from 'node:assert/strict';
import test from 'node:test';

import { createFoodEstimateClient, type FoodEstimateClientOptions } from './foodScan';

const TOKEN = '0123456789abcdef0123456789abcdef';

function createAcceptedClient(options: FoodEstimateClientOptions) {
    return createFoodEstimateClient({
        ...options,
        hasConsent: async () => true,
        getAiAuthorization: options.getAiAuthorization ?? (() => ({ ok: true, grant: 'signed-grant' })),
        requestId: options.requestId ?? (() => 'request-00000001'),
    });
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function recognizedEstimate() {
    return {
        status: 'recognized',
        unrecognizedReason: null,
        mealName: 'Synthetic meal',
        components: [{
            name: 'Synthetic rice',
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

test('Scan and Describe await the installation token and send the required header', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let releaseToken: ((value: string) => void) | undefined;
    const token = new Promise<string>((resolve) => { releaseToken = resolve; });
    const client = createAcceptedClient({
        workerUrl: 'https://food.example.workers.dev',
        getInstallationToken: () => token,
        now: () => 42,
        fetchImpl: (async (input, init) => {
            requests.push({ url: String(input), init });
            return jsonResponse(recognizedEstimate());
        }) as typeof fetch,
    });

    const pending = client.describeMeal('  rice  ');
    await Promise.resolve();
    assert.equal(requests.length, 0);
    releaseToken?.(TOKEN);
    const result = await pending;
    assert.equal(result.ok, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://food.example.workers.dev/v1/estimate');
    assert.equal((requests[0].init?.headers as Record<string, string>)['X-Eatlog-Install-ID'], TOKEN);
    assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { operation: 'describe', text: 'rice' });
    if (result.ok) {
        assert.equal(result.result.components[0].id, 'describe-42-0');
        assert.equal(result.result.originalDescription, 'rice');
    }

    await client.scanFood('c3ludGhldGlj');
    assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { operation: 'scan', imageBase64: 'c3ludGhldGlj' });
});

test('Scan sends a trimmed meal title and preserves it for review', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const client = createAcceptedClient({
        workerUrl: 'https://food.example.workers.dev',
        getInstallationToken: () => TOKEN,
        fetchImpl: (async (_input, init) => {
            requestBody = JSON.parse(String(init?.body));
            return jsonResponse(recognizedEstimate());
        }) as typeof fetch,
    });

    const result = await client.scanFood('c3ludGhldGlj', '  Chicken adobo with rice  ');

    assert.deepEqual(requestBody, {
        operation: 'scan',
        imageBase64: 'c3ludGhldGlj',
        text: 'Chicken adobo with rice',
    });
    assert.equal(result.ok && result.result.mealName, 'Chicken adobo with rice');
});

test('a scan title stating an amount sends the amount but keeps the estimated meal name', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const client = createAcceptedClient({
        workerUrl: 'https://food.example.workers.dev',
        getInstallationToken: () => TOKEN,
        fetchImpl: (async (_input, init) => {
            requestBody = JSON.parse(String(init?.body));
            return jsonResponse({ ...recognizedEstimate(), mealName: 'Bear Brand milk' });
        }) as typeof fetch,
    });

    const result = await client.scanFood('c3ludGhldGlj', '72g bear brand');

    assert.deepEqual(requestBody, {
        operation: 'scan',
        imageBase64: 'c3ludGhldGlj',
        text: '72g bear brand',
    });
    assert.equal(result.ok && result.result.mealName, 'Bear Brand milk');
});

test('component names keep apostrophes, hyphens, and deliberate inner capitals', async () => {
    const client = createAcceptedClient({
        workerUrl: 'https://food.example.workers.dev',
        getInstallationToken: () => TOKEN,
        fetchImpl: (async () => jsonResponse({
            ...recognizedEstimate(),
            components: [
                { ...recognizedEstimate().components[0], name: "McDonald's Big Mac" },
                { ...recognizedEstimate().components[0], name: "shakey's stir-fried rice" },
                { ...recognizedEstimate().components[0], name: 'GRILLED CHICKEN' },
            ],
        })) as typeof fetch,
    });

    const result = await client.describeMeal('mixed plate');

    assert.deepEqual(
        result.ok ? result.result.components.map((component) => component.name) : null,
        ["McDonald's Big Mac", "Shakey's Stir-fried Rice", 'Grilled Chicken'],
    );
});

test('clarification sends source description and current component context', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const client = createAcceptedClient({
        workerUrl: 'https://food.example.workers.dev',
        getInstallationToken: () => TOKEN,
        fetchImpl: (async (_input, init) => {
            requests.push(JSON.parse(String(init?.body)));
            return jsonResponse(recognizedEstimate());
        }) as typeof fetch,
    });
    const context = {
        originalDescription: 'one cup rice and chicken adobo',
        components: [
            { name: 'Rice', estimatedGrams: 180 },
            { name: 'Chicken adobo', estimatedGrams: 150 },
        ],
    };

    await client.clarifyMeal({
        name: 'Chicken adobo with rice',
        ...context,
    });
    await client.clarifyComponent({
        name: 'Braised chicken thigh',
        mealName: 'Chicken adobo with rice',
        ...context,
    });

    assert.deepEqual(requests[0], {
        operation: 'clarify-meal',
        text: 'Chicken adobo with rice',
        context,
    });
    assert.deepEqual(requests[1], {
        operation: 'clarify-component',
        text: 'Braised chicken thigh',
        context: { ...context, mealName: 'Chicken adobo with rice' },
    });
});

test('clarification context is capped before upload', async () => {
    let requestBody: any;
    const client = createAcceptedClient({
        workerUrl: 'https://food.example.workers.dev',
        getInstallationToken: () => TOKEN,
        fetchImpl: (async (_input, init) => {
            requestBody = JSON.parse(String(init?.body));
            return jsonResponse(recognizedEstimate());
        }) as typeof fetch,
    });

    await client.clarifyMeal({
        name: 'Meal',
        originalDescription: 'd'.repeat(1_000),
        components: Array.from({ length: 25 }, (_, index) => ({
            name: `${index}-${'n'.repeat(200)}`,
            estimatedGrams: 100,
        })),
    });

    assert.equal(requestBody.context.originalDescription.length, 500);
    assert.equal(requestBody.context.components.length, 20);
    assert.ok(requestBody.context.components.every((component: { name: string }) => component.name.length <= 120));
    assert.ok(Buffer.byteLength(JSON.stringify(requestBody)) < 4_000);
});

test('clarification context mirrors the Worker gram boundary', async () => {
    let requestBody: any;
    const client = createAcceptedClient({
        workerUrl: 'https://food.example.workers.dev',
        getInstallationToken: () => TOKEN,
        fetchImpl: (async (_input, init) => {
            requestBody = JSON.parse(String(init?.body));
            return jsonResponse(recognizedEstimate());
        }) as typeof fetch,
    });

    await client.clarifyMeal({
        name: 'Meal',
        components: [
            { name: 'Allowed', estimatedGrams: 10_000 },
            { name: 'Too large', estimatedGrams: 10_000.1 },
        ],
    });

    assert.deepEqual(requestBody.context.components, [{ name: 'Allowed', estimatedGrams: 10_000 }]);
});

test('missing or declined consent blocks every estimate operation before token or fetch', async () => {
    for (const decision of ['missing', 'declined']) {
        let tokenReads = 0;
        let fetches = 0;
        const client = createFoodEstimateClient({
            workerUrl: 'https://food.example.workers.dev',
            getAiAuthorization: () => ({ ok: true, grant: 'signed-grant' }),
            hasConsent: async () => false,
            getInstallationToken: () => { tokenReads += 1; return TOKEN; },
            fetchImpl: (async () => { fetches += 1; return jsonResponse(recognizedEstimate()); }) as typeof fetch,
        });

        const [scanResult, describeResult, mealResult, componentResult] = await Promise.all([
            client.scanFood('image-data'),
            client.describeMeal('private meal description'),
            client.clarifyMeal({ name: 'Meal', components: [{ name: 'Rice', estimatedGrams: 100 }] }),
            client.clarifyComponent({ name: 'Rice', mealName: 'Meal', components: [{ name: 'Rice', estimatedGrams: 100 }] }),
        ]);
        assert.equal(scanResult.ok, false, decision);
        assert.equal(scanResult.kind, 'consent-required', decision);
        assert.equal(describeResult.ok, false, decision);
        assert.equal(describeResult.kind, 'consent-required', decision);
        assert.equal(mealResult, null, decision);
        assert.equal(componentResult, null, decision);
        assert.deepEqual({ tokenReads, fetches }, { tokenReads: 0, fetches: 0 });
    }
});

test('consent-check failure fails closed without logging estimate input', async () => {
    const privateInput = 'private meal description and image-data';
    const client = createFoodEstimateClient({
        workerUrl: 'https://food.example.workers.dev',
        getAiAuthorization: () => ({ ok: true, grant: 'signed-grant' }),
        hasConsent: async () => { throw new Error(privateInput); },
        getInstallationToken: () => { throw new Error('token loader must not run'); },
        fetchImpl: (async () => { throw new Error('fetch must not run'); }) as typeof fetch,
    });

    const result = await client.describeMeal(privateInput);
    assert.deepEqual(result, {
        ok: false,
        kind: 'consent-required',
        message: 'Enable online estimates to use this.',
    });
    assert.equal(JSON.stringify(result).includes(privateInput), false);
});

test('paid access gates every AI operation before consent, identity loading, or upload', async () => {
    let consentReads = 0;
    let tokenReads = 0;
    let fetches = 0;
    const client = createFoodEstimateClient({
        workerUrl: 'https://food.example.workers.dev',
        getAiAuthorization: () => ({ ok: false, kind: 'paid-access-required' }),
        hasConsent: () => { consentReads += 1; return true; },
        getInstallationToken: () => { tokenReads += 1; return TOKEN; },
        fetchImpl: (async () => { fetches += 1; return jsonResponse(recognizedEstimate()); }) as typeof fetch,
    });
    const result = await client.scanFood('private-image');
    assert.deepEqual(result, {
        ok: false,
        kind: 'paid-access-required',
        message: 'Eatlog Manok or Itik is required for AI estimates.',
    });
    assert.deepEqual({ consentReads, tokenReads, fetches }, { consentReads: 0, tokenReads: 0, fetches: 0 });
});

test('unresolved access submits once and accepts the Worker grant from the estimate response', async () => {
    const returnedGrant = 'inline.signed.worker-grant-value';
    const expiresAt = '2026-08-28T00:05:00.000Z';
    let requestHeaders: Record<string, string> | null = null;
    const accepted: Array<{ token: string; expiresAt: string }> = [];
    const client = createFoodEstimateClient({
        workerUrl: 'https://food.example.workers.dev',
        getAiAuthorization: () => ({ ok: false, kind: 'entitlement-unavailable' }),
        hasConsent: async () => true,
        getInstallationToken: () => TOKEN,
        requestId: () => 'request-00000001',
        acceptAiGrant: (token, expiry) => { accepted.push({ token, expiresAt: expiry }); },
        fetchImpl: (async (_input, init) => {
            requestHeaders = init?.headers as Record<string, string>;
            return new Response(JSON.stringify(recognizedEstimate()), {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                    'X-Eatlog-AI-Grant': returnedGrant,
                    'X-Eatlog-AI-Grant-Expires-At': expiresAt,
                },
            });
        }) as typeof fetch,
    });

    const result = await client.describeMeal('rice');

    assert.equal(result.ok, true);
    assert.equal(requestHeaders?.['Authorization'], undefined);
    assert.deepEqual(accepted, [{ token: returnedGrant, expiresAt }]);
});

test('a grant that lands while consent, install token, and request hashing await still authorizes the request', async () => {
    let requestHeaders: Record<string, string> | null = null;
    let authorizeCalls = 0;
    const client = createFoodEstimateClient({
        workerUrl: 'https://food.example.workers.dev',
        getAiAuthorization: () => {
            authorizeCalls += 1;
            return authorizeCalls === 1
                ? { ok: false, kind: 'entitlement-unavailable' }
                : { ok: true, grant: 'late-signed-grant' };
        },
        hasConsent: async () => true,
        getInstallationToken: () => TOKEN,
        requestId: async () => 'request-00000001',
        fetchImpl: (async (_input, init) => {
            requestHeaders = init?.headers as Record<string, string>;
            return jsonResponse(recognizedEstimate());
        }) as typeof fetch,
    });

    const result = await client.describeMeal('rice');

    assert.equal(result.ok, true);
    assert.equal(requestHeaders?.['Authorization'], 'Bearer late-signed-grant');
});

test('maps each known Worker entitlement and quota code to specific redacted copy', async () => {
    const cases = [
        ['PAID_ACCESS_REQUIRED', 'paid-access-required'],
        ['PUGO_DAILY_LIMIT', 'pugo-daily-limit'],
        ['FAIR_USE_DAILY_LIMIT', 'fair-use-daily-limit'],
        ['FAIR_USE_30_DAY_LIMIT', 'fair-use-30-day-limit'],
        ['REFUND_DAILY_LIMIT', 'refund-daily-limit'],
        ['ENTITLEMENT_UNAVAILABLE', 'entitlement-unavailable'],
    ] as const;
    for (const [code, kind] of cases) {
        const client = createAcceptedClient({
            workerUrl: 'https://food.example.workers.dev',
            getInstallationToken: () => TOKEN,
            fetchImpl: (async () => jsonResponse({ error: { code, message: 'raw provider transaction' } }, 429)) as typeof fetch,
        });
        const result = await client.describeMeal('rice');
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.kind, kind);
            assert.equal(result.message.includes('raw provider'), false);
            if (kind === 'pugo-daily-limit') {
                assert.equal(result.message, "You've used your 3 free estimates for this 24-hour window. Try again after it resets.");
            }
        }
    }
});

test('an upstream timeout or malformed provider reply is named rather than shown as a generic failure', async () => {
    const cases = [
        ['UPSTREAM_TIMEOUT', 504, 'timeout', 'The estimation service took too long. Try again.'],
        ['MALFORMED_UPSTREAM', 502, 'invalid-response', 'The estimation service returned an unusable result. Try again or enter it manually.'],
        ['RATE_LIMITED', 429, 'rate-limited', 'Too many estimates in a short time. Wait a minute, then try again.'],
    ] as const;
    for (const [code, status, kind, message] of cases) {
        const client = createAcceptedClient({
            workerUrl: 'https://food.example.workers.dev',
            getInstallationToken: () => TOKEN,
            fetchImpl: (async () => jsonResponse({ error: { code, message: 'raw provider transaction' } }, status)) as typeof fetch,
        });
        const result = await client.describeMeal('rice');
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.kind, kind);
            assert.equal(result.message, message);
            assert.equal(result.message.includes('raw provider'), false);
        }
    }
});

test('a rolling daily limit surfaces the actual reset time from the Worker instead of a static string', async () => {
    const cases = [
        ['PUGO_DAILY_LIMIT', 'pugo-daily-limit'],
        ['FAIR_USE_DAILY_LIMIT', 'fair-use-daily-limit'],
    ] as const;
    const nextEligibleAt = new Date('2026-08-22T21:00:00.000Z').toISOString();
    const expectedTime = new Date(nextEligibleAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    for (const [code, kind] of cases) {
        const client = createAcceptedClient({
            workerUrl: 'https://food.example.workers.dev',
            getInstallationToken: () => TOKEN,
            fetchImpl: (async () => jsonResponse({ error: { code, message: 'raw provider transaction', nextEligibleAt } }, 429)) as typeof fetch,
        });
        const result = await client.describeMeal('rice');
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.kind, kind);
            assert.equal(result.message.includes(expectedTime), true);
            assert.equal(result.message.includes('it resets') || result.message.includes('the window resets'), false);
        }
    }
});

test('identity failure and malformed injected tokens fail closed without upload or token leakage', async () => {
    const rawToken = 'fedcba9876543210fedcba9876543210';
    let fetches = 0;
    const failed = createAcceptedClient({
        workerUrl: 'https://food.example.workers.dev',
        getInstallationToken: async () => { throw new Error(rawToken); },
        fetchImpl: (async () => { fetches += 1; return jsonResponse(recognizedEstimate()); }) as typeof fetch,
    });
    const failure = await failed.describeMeal('rice');
    assert.deepEqual(failure, { ok: false, kind: 'unavailable', message: 'Estimates are unavailable in this build.' });
    assert.equal(JSON.stringify(failure).includes(rawToken), false);

    const malformed = createAcceptedClient({
        workerUrl: 'https://food.example.workers.dev',
        getInstallationToken: () => 'android-id',
        fetchImpl: (async () => { fetches += 1; return jsonResponse(recognizedEstimate()); }) as typeof fetch,
    });
    assert.equal((await malformed.scanFood('image')).ok, false);
    assert.equal(fetches, 0);
});

test('invalid local input performs no identity lookup or request', async () => {
    let tokenReads = 0;
    let fetches = 0;
    const client = createAcceptedClient({
        workerUrl: 'https://food.example.workers.dev',
        getInstallationToken: () => { tokenReads += 1; return TOKEN; },
        fetchImpl: (async () => { fetches += 1; return jsonResponse(recognizedEstimate()); }) as typeof fetch,
    });

    assert.equal((await client.scanFood('   ')).ok, false);
    assert.equal((await client.describeMeal('   ')).ok, false);
    assert.deepEqual({ tokenReads, fetches }, { tokenReads: 0, fetches: 0 });
});

test('provider and malformed response failures remain sanitized', async () => {
    const provider = createAcceptedClient({
        workerUrl: 'https://food.example.workers.dev',
        getInstallationToken: () => TOKEN,
        fetchImpl: (async () => jsonResponse({}, 503)) as typeof fetch,
    });
    assert.equal((await provider.describeMeal('rice')).ok, false);

    const malformed = createAcceptedClient({
        workerUrl: 'https://food.example.workers.dev',
        getInstallationToken: () => TOKEN,
        fetchImpl: (async () => jsonResponse({ status: 'recognized', components: [] })) as typeof fetch,
    });
    const result = await malformed.describeMeal('rice');
    assert.deepEqual(result, {
        ok: false,
        kind: 'invalid-response',
        message: 'The estimation service returned an unusable result. Try again or enter it manually.',
    });
});

test('an explicit retry of the same photo keeps one action identifier so it is not charged twice', async () => {
    const requestIds: string[] = [];
    let failNext = true;
    const client = createFoodEstimateClient({
        workerUrl: 'https://worker.example',
        hasConsent: async () => true,
        getInstallationToken: () => TOKEN,
        getAiAuthorization: () => ({ ok: true, grant: 'signed-grant' }),
        fetchImpl: (async (_url: string, init: RequestInit) => {
            requestIds.push((init.headers as Record<string, string>)['X-Eatlog-Request-ID']);
            if (failNext) {
                failNext = false;
                return jsonResponse({ error: { code: 'UPSTREAM_TIMEOUT' } }, 504);
            }
            return jsonResponse(recognizedEstimate());
        }) as unknown as typeof fetch,
    });

    const first = await client.scanFood('photo-bytes', 'Lunch');
    assert.equal(first.ok, false);
    // The user presses Retry on the same unchanged photo: one submission, one identifier.
    const retried = await client.scanFood('photo-bytes', 'Lunch');
    assert.equal(retried.ok, true);

    assert.match(requestIds[0], /^[A-Za-z0-9-]{16,128}$/);
    assert.equal(requestIds[1], requestIds[0]);

    // A different photo is a different action.
    await client.scanFood('a-different-photo', 'Lunch');
    assert.notEqual(requestIds[2], requestIds[0]);
});

test('duplicate taps while an estimate is running share it instead of starting a second', async () => {
    const requestIds: string[] = [];
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const client = createFoodEstimateClient({
        workerUrl: 'https://worker.example',
        hasConsent: async () => true,
        getInstallationToken: () => TOKEN,
        getAiAuthorization: () => ({ ok: true, grant: 'signed-grant' }),
        fetchImpl: (async (_url: string, init: RequestInit) => {
            requestIds.push((init.headers as Record<string, string>)['X-Eatlog-Request-ID']);
            await gate;
            return jsonResponse(recognizedEstimate());
        }) as unknown as typeof fetch,
    });

    const both = Promise.all([client.describeMeal('one cup of rice'), client.describeMeal('one cup of rice')]);
    release();
    const [first, second] = await both;

    assert.equal(requestIds.length, 1);
    assert.equal(first.ok, true);
    assert.deepEqual(second, first);
});

test('cancelling one caller leaves the shared estimate running for the other', async () => {
    let calls = 0;
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const client = createFoodEstimateClient({
        workerUrl: 'https://worker.example',
        hasConsent: async () => true,
        getInstallationToken: () => TOKEN,
        getAiAuthorization: () => ({ ok: true, grant: 'signed-grant' }),
        fetchImpl: (async () => {
            calls += 1;
            await gate;
            return jsonResponse(recognizedEstimate());
        }) as unknown as typeof fetch,
    });

    const controller = new AbortController();
    const leaving = client.describeMeal('one cup of rice', { signal: controller.signal });
    const staying = client.describeMeal('one cup of rice');
    controller.abort();

    // The screen that left stops waiting; it does not cancel work someone else is waiting for,
    // and it never claims the provider handed the tokens back.
    assert.deepEqual(await leaving, { ok: false, kind: 'cancelled', message: 'Estimate cancelled.' });
    release();
    assert.equal((await staying).ok, true);
    assert.equal(calls, 1);
});

test('a description longer than the service accepts is refused before it is uploaded', async () => {
    let calls = 0;
    const client = createFoodEstimateClient({
        workerUrl: 'https://worker.example',
        hasConsent: async () => true,
        getInstallationToken: () => TOKEN,
        getAiAuthorization: () => ({ ok: true, grant: 'signed-grant' }),
        fetchImpl: (async () => { calls += 1; return jsonResponse(recognizedEstimate()); }) as unknown as typeof fetch,
    });

    const result = await client.describeMeal('a'.repeat(2001));
    assert.equal(result.ok === false && result.kind, 'description-too-long');
    assert.equal(calls, 0);
});

/*
 * Milestone 1 regression case for the food-estimation plan (service review, finding 1). The
 * identifier used to be derived from the payload alone, so it identified the content rather than
 * the action: logging the same meal again on another day sent an identifier the Worker still had
 * on file, while a genuine transport retry and a genuine second submission looked identical.
 */
test('a second deliberate estimate of the same food is a new action, not a retry of the first', async () => {
    const requestIds: string[] = [];
    const client = createFoodEstimateClient({
        workerUrl: 'https://worker.example',
        hasConsent: async () => true,
        getInstallationToken: () => TOKEN,
        getAiAuthorization: () => ({ ok: true, grant: 'signed-grant' }),
        fetchImpl: (async (_url: string, init: RequestInit) => {
            requestIds.push((init.headers as Record<string, string>)['X-Eatlog-Request-ID']);
            return jsonResponse(recognizedEstimate());
        }) as unknown as typeof fetch,
    });

    await client.describeMeal('one cup of rice');
    await client.describeMeal('one cup of rice');

    assert.notEqual(requestIds[1], requestIds[0]);
});

test('clearing remembered actions retires their identifiers', async () => {
    const requestIds: string[] = [];
    const client = createFoodEstimateClient({
        workerUrl: 'https://worker.example',
        hasConsent: async () => true,
        getInstallationToken: () => TOKEN,
        getAiAuthorization: () => ({ ok: true, grant: 'signed-grant' }),
        fetchImpl: (async (_url: string, init: RequestInit) => {
            requestIds.push((init.headers as Record<string, string>)['X-Eatlog-Request-ID']);
            return jsonResponse({ error: { code: 'UPSTREAM_TIMEOUT' } }, 504);
        }) as unknown as typeof fetch,
    });

    await client.describeMeal('one cup of rice');
    // Consent withdrawal, a change of identity, and Delete all data each land here. An action
    // must not outlive the account it belonged to.
    client.clearActions();
    await client.describeMeal('one cup of rice');

    assert.notEqual(requestIds[1], requestIds[0]);
});

test('a malformed success body is named as an invalid response, not as a network failure', async () => {
    const client = createAcceptedClient({
        workerUrl: 'https://worker.example',
        getInstallationToken: () => TOKEN,
        fetchImpl: (async () => new Response('{"status":"recog', {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })) as typeof fetch,
    });

    const result = await client.describeMeal('rice');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'invalid-response');
});

test('a JSON body that is not an estimate object is rejected rather than mapped', async () => {
    for (const body of ['null', '"rice"', '[]', '42']) {
        const client = createAcceptedClient({
            workerUrl: 'https://worker.example',
            getInstallationToken: () => TOKEN,
            fetchImpl: (async () => new Response(body, {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })) as typeof fetch,
        });
        const result = await client.describeMeal('rice');
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.kind, 'invalid-response');
    }
});
