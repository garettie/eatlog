import assert from 'node:assert/strict';
import test from 'node:test';

import {
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

test('remote AI fails closed for Pugo, Worker outage, and expired grants', async () => {
  setLocalAccessForAi({ kind: 'pugo', checkedAt: '2026-08-22T00:00:00Z' });
  assert.deepEqual(getAiAuthorization(), { ok: false, kind: 'paid-access-required' });
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
