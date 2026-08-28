import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acceptAiGrant,
  clearAiGrant,
  createSubscriptionApi,
  getAiAuthorization,
  setLocalAccessForAi,
} from './subscriptionApi';

const PAID = {
  kind: 'manok' as const,
  checkedAt: '2026-08-22T00:00:00Z',
  expiresAt: '2026-09-22T00:00:00Z',
  willRenew: true,
  productId: 'eatlog_manok',
  billingState: 'active' as const,
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

test('remote AI fails closed for Pugo, Worker outage, and expired grants', async () => {
  setLocalAccessForAi(null);
  assert.deepEqual(getAiAuthorization(), { ok: false, kind: 'entitlement-unavailable' });
  setLocalAccessForAi({ kind: 'pugo', checkedAt: '2026-08-22T00:00:00Z' });
  assert.deepEqual(getAiAuthorization(), { ok: false, kind: 'paid-access-required' });
  setLocalAccessForAi({ kind: 'pugo', checkedAt: '2026-08-22T00:00:00Z', reason: 'unavailable' });
  assert.deepEqual(getAiAuthorization(), { ok: false, kind: 'entitlement-unavailable' });
  setLocalAccessForAi({ kind: 'pugo', checkedAt: '2026-08-22T00:00:00Z', reason: 'malformed' });
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
      access: { kind: 'pugo', checkedAt: '2026-08-22T00:01:00Z', reason: 'revoked' },
      usage: { kind: 'none' },
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch,
  });

  const result = await api.refresh('a'.repeat(32));

  assert.deepEqual(result, { usage: { kind: 'none' } });
  assert.deepEqual(getAiAuthorization(), { ok: false, kind: 'entitlement-unavailable' });
});
