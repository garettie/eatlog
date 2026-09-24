import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acceptAiGrant,
  clearAiGrant,
  createSubscriptionApi,
  getAiAuthorization,
  restorePaidAccess,
  setLocalAccessForAi,
  setPaidAccessStore,
} from './subscriptionApi';
import { hasItik } from './billing.types';

const PAID = {
  kind: 'subscription' as const,
  checkedAt: '2026-08-22T00:00:00Z',
  expiresAt: '2026-09-22T00:00:00Z',
  willRenew: true,
  productId: 'eatlog_manok',
  billingState: 'active' as const,
  trial: false,
};

const NONE = {
  kind: 'none' as const,
  checkedAt: '2026-08-22T00:00:00Z',
  reason: 'none' as const,
};

test('inline response grants authorize until expiry and reject malformed or expired values', () => {
  setLocalAccessForAi(PAID);
  clearAiGrant();
  const now = Date.parse('2026-08-22T00:00:00Z');
  const expiresAt = '2026-08-22T00:05:00.000Z';

  assert.equal(acceptAiGrant('short', expiresAt, now), false);
  assert.equal(acceptAiGrant('signed.header.payload-value', 'invalid', now), false);
  assert.equal(acceptAiGrant('signed.header.payload-value', new Date(now).toISOString(), now), false);
  assert.equal(acceptAiGrant('signed.header.payload-value', expiresAt, now), true);
  assert.deepEqual(getAiAuthorization(now + 60_000), { ok: true, grant: 'signed.header.payload-value' });
  assert.deepEqual(getAiAuthorization(Date.parse(expiresAt)), { ok: false, kind: 'entitlement-unavailable' });
});

test('remote AI fails closed without an entitlement, during Worker outage, and after grant expiry', async () => {
  setLocalAccessForAi(null);
  assert.deepEqual(getAiAuthorization(), { ok: false, kind: 'entitlement-unavailable' });
  setLocalAccessForAi(NONE);
  assert.deepEqual(getAiAuthorization(), { ok: false, kind: 'entitlement-unavailable' });
  setLocalAccessForAi({ kind: 'none', checkedAt: '2026-08-22T00:00:00Z', reason: 'unavailable' });
  assert.deepEqual(getAiAuthorization(), { ok: false, kind: 'entitlement-unavailable' });
  setLocalAccessForAi({ kind: 'none', checkedAt: '2026-08-22T00:00:00Z', reason: 'malformed' });
  assert.deepEqual(getAiAuthorization(), { ok: false, kind: 'entitlement-unavailable' });
  setLocalAccessForAi(PAID);
  clearAiGrant();
  assert.deepEqual(getAiAuthorization(), { ok: false, kind: 'entitlement-unavailable' });
  const api = createSubscriptionApi({
    workerUrl: 'https://staging.example',
    fetchImpl: (async () => { throw new Error('raw worker outage'); }) as typeof fetch,
  });
  await assert.rejects(api.refresh('a'.repeat(32)), /raw worker outage/);
  assert.deepEqual(getAiAuthorization(), { ok: false, kind: 'entitlement-unavailable' });
});

test('refresh keeps the signed grant only in memory and authorizes until expiry', async () => {
  setLocalAccessForAi(PAID);
  const expiresAt = '2026-08-22T00:05:00.000Z';
  const api = createSubscriptionApi({
    workerUrl: 'https://staging.example',
    now: () => Date.parse('2026-08-22T00:00:00Z'),
    fetchImpl: (async () => new Response(JSON.stringify({ access: PAID, grant: { token: 'signed.header.payload-value', expiresAt } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch,
  });
  await api.refresh('a'.repeat(32));
  assert.deepEqual(getAiAuthorization(Date.parse('2026-08-22T00:01:00Z')), { ok: true, grant: 'signed.header.payload-value' });
  assert.deepEqual(getAiAuthorization(Date.parse(expiresAt)), { ok: false, kind: 'entitlement-unavailable' });
});

test('refresh refuses a grant offered beside no entitlement, since hosted AI is Itik only', async () => {
  setLocalAccessForAi(NONE);
  const now = Date.parse('2026-08-22T00:00:00Z');
  const api = createSubscriptionApi({
    workerUrl: 'https://staging.example',
    now: () => now,
    fetchImpl: (async () => new Response(JSON.stringify({
      access: NONE,
      grant: { token: 'signed.none.payload-value', expiresAt: '2026-08-23T00:00:00.000Z' },
      usage: { kind: 'none' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch,
  });

  assert.deepEqual(await api.refresh('a'.repeat(32)), { usage: { kind: 'none' } });
  assert.deepEqual(getAiAuthorization(now + 60_000), { ok: false, kind: 'entitlement-unavailable' });
});

test('manual access refresh sends force while automatic refresh stays cache-first', async () => {
  const bodies: string[] = [];
  const api = createSubscriptionApi({
    workerUrl: 'https://staging.example',
    fetchImpl: (async (_input, init) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ access: PAID, usage: { kind: 'none' } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch,
  });

  await api.refresh('a'.repeat(32));
  await api.refresh('a'.repeat(32), true);
  assert.deepEqual(bodies.map((body) => JSON.parse(body)), [{}, { force: true }]);
});

test('a no-entitlement answer never demotes a device holding unexpired Itik', async () => {
  // The Worker's view of RevenueCat can lag the device's. Taking a stale "none" at face value
  // would turn away a subscriber for reasons that are not theirs.
  const now = Date.parse('2026-08-22T00:00:00Z');
  const trial = { ...PAID, trial: true };
  setLocalAccessForAi(trial);
  clearAiGrant();
  assert.equal(acceptAiGrant('signed.trial.payload-value', '2026-08-23T00:00:00.000Z', now), true);

  const api = createSubscriptionApi({
    workerUrl: 'https://staging.example',
    now: () => now,
    fetchImpl: (async () => new Response(JSON.stringify({
      access: NONE,
      usage: { kind: 'none' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch,
  });

  // The trial grant is kept.
  assert.deepEqual(await api.refresh('a'.repeat(32)), { usage: { kind: 'none' } });
  assert.deepEqual(getAiAuthorization(now + 60_000), { ok: true, grant: 'signed.trial.payload-value' });

  // With no usable grant of its own, the app reports the estimate as unavailable.
  clearAiGrant();
  await api.refresh('a'.repeat(32));
  assert.deepEqual(getAiAuthorization(now + 60_000), { ok: false, kind: 'entitlement-unavailable' });

});

test('a locally expired paid snapshot blocks AI before a still-valid grant can authorize', async () => {
  const accessExpiresAt = '2026-08-22T00:02:00.000Z';
  const grantExpiresAt = '2026-08-22T00:05:00.000Z';
  const expiringPaid = { ...PAID, expiresAt: accessExpiresAt };
  setLocalAccessForAi(expiringPaid);
  const api = createSubscriptionApi({
    workerUrl: 'https://staging.example',
    now: () => Date.parse('2026-08-22T00:00:00Z'),
    fetchImpl: (async () => new Response(JSON.stringify({
      access: expiringPaid,
      grant: { token: 'signed.header.payload-value', expiresAt: grantExpiresAt },
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch,
  });
  await api.refresh('a'.repeat(32));

  assert.deepEqual(getAiAuthorization(Date.parse('2026-08-22T00:03:00Z')), {
    ok: false,
    kind: 'entitlement-unavailable',
  });
});

test('a contradictory Worker refresh cannot replace verified local paid access', async () => {
  setLocalAccessForAi(PAID);
  clearAiGrant();
  const api = createSubscriptionApi({
    workerUrl: 'https://staging.example',
    fetchImpl: (async () => new Response(JSON.stringify({
      access: { kind: 'none', checkedAt: '2026-08-22T00:01:00Z', reason: 'revoked' },
      usage: { kind: 'none' },
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch,
  });

  const result = await api.refresh('a'.repeat(32));

  assert.deepEqual(result, { usage: { kind: 'none' } });
  assert.deepEqual(getAiAuthorization(), { ok: false, kind: 'entitlement-unavailable' });
});

test('a hung refresh request times out instead of stalling forever, and does not demote a previously accepted grant', async () => {
  setLocalAccessForAi(PAID);
  const expiresAt = '2026-08-23T00:00:00.000Z';
  const accept = acceptAiGrant('signed.header.payload-value', expiresAt, Date.parse('2026-08-22T00:00:00Z'));
  assert.equal(accept, true);
  const api = createSubscriptionApi({
    workerUrl: 'https://staging.example',
    timeoutMs: 20,
    fetchImpl: ((_input, init) => new Promise((_resolve, reject) => {
      (init?.signal as AbortSignal).addEventListener('abort', () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })) as typeof fetch,
  });

  await assert.rejects(api.refresh('a'.repeat(32)), /Subscription service unavailable/);
  assert.deepEqual(getAiAuthorization(Date.parse('2026-08-22T00:01:00Z')), {
    ok: true,
    grant: 'signed.header.payload-value',
  });
});

test('any change in access kind clears the cached AI grant', async () => {
  const now = Date.parse('2026-08-22T00:00:00Z');
  const grantExpiresAt = '2026-08-23T00:00:00.000Z';
  const TRIAL = { ...PAID, expiresAt: '2026-09-05T00:00:00Z', trial: true };
  const PURCHASE = {
    kind: 'purchase' as const,
    checkedAt: '2026-08-22T00:00:00Z',
    productId: 'eatlog_itik',
    purchasedAt: '2026-08-22T00:00:00Z',
  };

  // A trial converting to paid stays a subscription, which is what the Worker signed, so the
  // grant still speaks for it.
  setLocalAccessForAi(TRIAL);
  assert.equal(acceptAiGrant('signed.header.payload-value', grantExpiresAt, now), true);
  setLocalAccessForAi(PAID);
  assert.deepEqual(getAiAuthorization(now), { ok: true, grant: 'signed.header.payload-value' });

  // subscription -> purchase changes the signed access kind and must clear.
  setLocalAccessForAi(PAID);
  assert.equal(acceptAiGrant('signed.header.payload-value', grantExpiresAt, now), true);
  setLocalAccessForAi(PURCHASE);
  assert.deepEqual(getAiAuthorization(now), { ok: false, kind: 'entitlement-unavailable' });

  // purchase -> complimentary must also clear.
  setLocalAccessForAi(PURCHASE);
  assert.equal(acceptAiGrant('signed.header.payload-value', grantExpiresAt, now), true);
  setLocalAccessForAi({ kind: 'complimentary', checkedAt: '2026-08-22T00:00:00Z', expiresAt: null });
  assert.deepEqual(getAiAuthorization(now), { ok: false, kind: 'entitlement-unavailable' });

  // Settled behavior: staying on the same paid kind keeps the grant.
  setLocalAccessForAi(PAID);
  assert.equal(acceptAiGrant('signed.header.payload-value', grantExpiresAt, now), true);
  setLocalAccessForAi({ ...PAID, checkedAt: '2026-08-22T00:01:00Z' });
  assert.deepEqual(getAiAuthorization(now), { ok: true, grant: 'signed.header.payload-value' });
});

function memoryAccessStore(initial: string | null = null) {
  let value = initial;
  return {
    read: async () => value,
    write: async (next: string) => { value = next; },
    current: () => value,
  };
}

test('verified paid access survives a cold start until the entitlement expires', async () => {
  const store = memoryAccessStore();
  setPaidAccessStore(store);
  const now = Date.parse('2026-08-22T00:00:00Z');

  setLocalAccessForAi(PAID);

  setLocalAccessForAi(null);
  assert.deepEqual(await restorePaidAccess(now), PAID);

  setLocalAccessForAi(null);
  assert.equal(await restorePaidAccess(Date.parse('2026-09-22T00:00:01Z')), null);
  setPaidAccessStore(null);
});

test('the AI grant is never written to disk, even immediately after being accepted, so a cold start never restores it', async () => {
  const store = memoryAccessStore();
  setPaidAccessStore(store);
  const now = Date.parse('2026-08-22T00:00:00Z');

  setLocalAccessForAi(PAID);
  assert.equal(acceptAiGrant('signed.header.payload-value', '2026-08-23T00:00:00.000Z', now), true);

  assert.equal(store.current()?.includes('signed.header.payload-value'), false);
  assert.equal(store.current()?.includes('"grant"'), false);

  setLocalAccessForAi(null);
  const restored = await restorePaidAccess(Date.parse('2026-08-22T00:01:00Z'));

  assert.deepEqual(restored, PAID);
  assert.deepEqual(getAiAuthorization(Date.parse('2026-08-22T00:01:00Z')), {
    ok: false,
    kind: 'entitlement-unavailable',
  });
  setPaidAccessStore(null);
});

test('a revoked plan is restored as no entitlement, never as Itik', async () => {
  const store = memoryAccessStore();
  setPaidAccessStore(store);
  const now = Date.parse('2026-08-22T00:02:00Z');

  setLocalAccessForAi(PAID);
  setLocalAccessForAi({ kind: 'none', checkedAt: '2026-08-22T00:01:00Z', reason: 'revoked' });
  setLocalAccessForAi(null);

  // Persisting a resolved no-entitlement lets a cold start open on an honest state, and restoring
  // it can only narrow access: the paid snapshot it replaced is unreachable afterwards.
  const restored = await restorePaidAccess(now);
  assert.equal(restored?.kind, 'none');
  assert.equal(hasItik(restored!, new Date(now)), false);
  assert.deepEqual(getAiAuthorization(now), { ok: false, kind: 'entitlement-unavailable' });
  setPaidAccessStore(null);
});

test('an unresolved plan is never persisted, so a transient failure cannot outlive the session', async () => {
  const store = memoryAccessStore();
  setPaidAccessStore(store);

  setLocalAccessForAi({ kind: 'none', checkedAt: '2026-08-22T00:01:00Z', reason: 'unavailable' });
  assert.equal(store.current(), null);

  setLocalAccessForAi({ kind: 'none', checkedAt: '2026-08-22T00:01:00Z', reason: 'malformed' });
  assert.equal(store.current(), null);

  setLocalAccessForAi(null);
  assert.equal(await restorePaidAccess(Date.parse('2026-08-22T00:02:00Z')), null);
  setPaidAccessStore(null);
});
