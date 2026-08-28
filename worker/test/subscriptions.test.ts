import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_GRANT_AUDIENCE,
  AI_GRANT_MAX_TTL_MS,
  MemorySubscriptionStore,
  THIRTY_DAYS_MS,
  accessExpired,
  accessExpiresAt,
  aggregateAiUsage,
  normalizeRevenueCatSubscriber,
  signAiGrant,
  verifyAiGrant,
  type GrantClaims,
} from '../src/subscriptions.js';

const NOW = Date.parse('2026-08-22T00:00:00Z');

test('aggregate token fixtures calculate configured cost without request content', () => {
  assert.deepEqual(aggregateAiUsage(1_000, 250, 0.1, 0.4), {
    inputTokens: 1_000,
    outputTokens: 250,
    totalTokens: 1_250,
    estimatedCostUsd: 0.0002,
  });
  assert.equal(aggregateAiUsage(1, 1, Number.NaN, 1).estimatedCostUsd, null);
});

function subscriber(kind: 'trial' | 'manok' | 'itik' | 'complimentary'): unknown {
  const product = kind === 'itik'
    ? 'eatlog_itik'
    : kind === 'complimentary' ? 'rc_promo_eatlog_paid_monthly' : 'eatlog_manok';
  return { subscriber: {
    original_app_user_id: 'user-id',
    entitlements: { eatlog_paid: {
      product_identifier: product,
      expires_date: kind === 'itik' ? null : '2026-09-22T00:00:00Z',
      purchase_date: '2026-08-22T00:00:00Z',
    } },
    subscriptions: kind === 'itik' ? {} : { [product]: {
      store: kind === 'complimentary' ? 'promotional' : 'play_store',
      original_transaction_id: 'stable-subscription', period_type: kind === 'trial' ? 'trial' : 'normal',
      unsubscribe_detected_at: null, billing_issues_detected_at: null,
    } },
    non_subscriptions: kind === 'itik' ? { [product]: [{ id: 'stable-lifetime', purchase_date: '2026-08-01T00:00:00Z' }] } : {},
  } };
}

test('RevenueCat server normalization covers trial, paid, lifetime, complimentary, expiry, refund, and malformed records', () => {
  assert.equal(normalizeRevenueCatSubscriber(subscriber('trial'), NOW).access.kind, 'manok-trial');
  assert.equal(normalizeRevenueCatSubscriber(subscriber('manok'), NOW).access.kind, 'manok');
  assert.equal(normalizeRevenueCatSubscriber(subscriber('itik'), NOW).access.kind, 'itik');
  assert.equal(normalizeRevenueCatSubscriber(subscriber('complimentary'), NOW).access.kind, 'complimentary');
  assert.equal(normalizeRevenueCatSubscriber({ subscriber: { entitlements: {} } }, NOW).access.kind, 'pugo');
  assert.equal(normalizeRevenueCatSubscriber({ subscriber: { entitlements: { eatlog_paid: { product_identifier: 'eatlog_manok', expires_date: '2026-08-01T00:00:00Z' } } } }, NOW).access.kind, 'pugo');
  assert.equal(normalizeRevenueCatSubscriber({ nope: true }, NOW).access.kind, 'pugo');
});

test('complimentary access without a stable RevenueCat user identity fails closed', () => {
  const malformed = subscriber('complimentary') as any;
  delete malformed.subscriber.original_app_user_id;

  assert.deepEqual(normalizeRevenueCatSubscriber(malformed, NOW), {
    access: {
      kind: 'pugo',
      checkedAt: new Date(NOW).toISOString(),
      reason: 'malformed',
    },
    subjectIdentity: null,
  });
});

test('RevenueCat v1 subscription fields verify Manok and keep renewal identity stable', () => {
  const first = subscriber('trial') as any;
  const subscription = first.subscriber.subscriptions.eatlog_manok;
  delete subscription.original_transaction_id;
  subscription.original_purchase_date = '2026-08-22T00:00:00Z';
  subscription.store_transaction_id = 'test-transaction-1';

  const initial = normalizeRevenueCatSubscriber(first, NOW);
  subscription.store_transaction_id = 'test-transaction-2';
  const renewed = normalizeRevenueCatSubscriber(first, NOW);

  assert.equal(initial.access.kind, 'manok-trial');
  assert.ok(initial.subjectIdentity);
  assert.equal(renewed.subjectIdentity, initial.subjectIdentity);
});

test('server lifecycle normalization covers Manok cancellation/grace, Itik precedence, refund fallback, and complimentary revocation', () => {
  const grace = subscriber('manok') as any;
  grace.subscriber.subscriptions.eatlog_manok.billing_issues_detected_at = '2026-08-21T00:00:00Z';
  assert.equal((normalizeRevenueCatSubscriber(grace, NOW).access as any).billingState, 'grace');
  grace.subscriber.subscriptions.eatlog_manok.unsubscribe_detected_at = '2026-08-21T00:00:00Z';
  assert.equal((normalizeRevenueCatSubscriber(grace, NOW).access as any).willRenew, false);

  const transition = subscriber('manok') as any;
  transition.subscriber.entitlements.eatlog_paid.product_identifier = 'eatlog_itik';
  transition.subscriber.entitlements.eatlog_paid.expires_date = null;
  transition.subscriber.non_subscriptions.eatlog_itik = [{ id: 'stable-lifetime', purchase_date: '2026-08-21T00:00:00Z' }];
  assert.equal(normalizeRevenueCatSubscriber(transition, NOW).access.kind, 'itik');

  const refundedItik = subscriber('manok') as any;
  refundedItik.subscriber.non_subscriptions.eatlog_itik = [{ id: 'refunded-lifetime', purchase_date: '2026-08-20T00:00:00Z' }];
  assert.equal(normalizeRevenueCatSubscriber(refundedItik, NOW).access.kind, 'manok');
  assert.equal(normalizeRevenueCatSubscriber({ subscriber: { entitlements: {} } }, NOW).access.kind, 'pugo');
});

test('signed AI grants reject forged, expired, wrong-audience, and overlong grants', async () => {
  const base: GrantClaims = { aud: AI_GRANT_AUDIENCE, sub: 'subject', access: 'manok', iat: NOW, exp: NOW + 60_000 };
  const valid = await signAiGrant(base, 'signing-secret');
  assert.deepEqual(await verifyAiGrant(valid, 'signing-secret', NOW), base);
  assert.equal(await verifyAiGrant(`${valid}x`, 'signing-secret', NOW), null);
  assert.equal(await verifyAiGrant(valid, 'wrong-secret', NOW), null);
  assert.equal(await verifyAiGrant(await signAiGrant({ ...base, exp: NOW - 1 }, 'signing-secret'), 'signing-secret', NOW), null);
  assert.equal(await verifyAiGrant(await signAiGrant({ ...base, aud: 'wrong' as typeof AI_GRANT_AUDIENCE }, 'signing-secret'), 'signing-secret', NOW), null);
  assert.equal(await verifyAiGrant(await signAiGrant({ ...base, exp: NOW + 31 * 24 * 60 * 60_000 }, 'signing-secret'), 'signing-secret', NOW), null);
});

test('signed AI grants accept every paid access class', async () => {
  for (const access of ['manok-trial', 'manok', 'itik', 'complimentary'] as const) {
    const claims: GrantClaims = { aud: AI_GRANT_AUDIENCE, sub: access, access, iat: NOW, exp: NOW + 60_000 };
    assert.deepEqual(await verifyAiGrant(await signAiGrant(claims, 'signing-secret'), 'signing-secret', NOW), claims);
  }
});

test('trial quotas keep initial and clarification daily and whole-trial limits separate', async () => {
  const store = new MemorySubscriptionStore();
  for (let index = 0; index < 5; index += 1) assert.equal((await store.reserve('trial', 'manok-trial', 'scan', `i-${index}`, NOW)).allowed, true);
  const daily = await store.reserve('trial', 'manok-trial', 'describe', 'i-over', NOW);
  assert.equal(daily.code, 'TRIAL_DAILY_LIMIT');
  assert.equal((await store.reserve('trial', 'manok-trial', 'clarify-meal', 'c-1', NOW)).allowed, true);
  for (let index = 5; index < 30; index += 1) {
    assert.equal((await store.reserve('trial-total', 'manok-trial', 'scan', `t-${index}`, NOW - (30 - index) * 25 * 60 * 60 * 1000)).allowed, true);
  }
  for (let index = 0; index < 5; index += 1) assert.equal((await store.reserve('trial-total', 'manok-trial', 'scan', `recent-${index}`, NOW)).allowed, true);
  assert.equal((await store.reserve('trial-total', 'manok-trial', 'scan', 'total-over', NOW + 25 * 60 * 60 * 1000)).code, 'TRIAL_ALLOWANCE_EXHAUSTED');
});

test('paid quotas enforce rolling boundaries for Manok, Itik, and complimentary access', async () => {
  for (const access of ['manok', 'itik', 'complimentary'] as const) {
    const store = new MemorySubscriptionStore();
    for (let index = 0; index < 30; index += 1) assert.equal((await store.reserve(access, access, 'scan', `${index}`, NOW)).allowed, true);
    assert.equal((await store.reserve(access, access, 'scan', 'daily-over', NOW)).code, 'FAIR_USE_DAILY_LIMIT');
  }
  const monthly = new MemorySubscriptionStore();
  for (let index = 0; index < 250; index += 1) {
    const day = Math.floor(index / 10);
    const at = NOW - (24 - day) * 24 * 60 * 60 * 1000;
    assert.equal((await monthly.reserve('monthly', 'manok', 'scan', `${index}`, at)).allowed, true);
  }
  assert.equal((await monthly.reserve('monthly', 'manok', 'scan', 'monthly-over', NOW)).code, 'FAIR_USE_30_DAY_LIMIT');
});

test('concurrent requests, idempotent retries, refunds, and finalization charge atomically', async () => {
  const store = new MemorySubscriptionStore();
  const decisions = await Promise.all(Array.from({ length: 35 }, (_, index) => store.reserve('subject', 'manok', 'scan', `request-${index}`, NOW)));
  assert.equal(decisions.filter((item) => item.allowed).length, 30);
  const duplicate = await store.reserve('subject', 'manok', 'scan', 'request-0', NOW);
  assert.equal(duplicate.allowed, true);
  assert.equal(duplicate.duplicate, true);
  await store.refund('subject', 'request-0');
  assert.equal((await store.reserve('subject', 'manok', 'scan', 'replacement', NOW)).allowed, true);
  await store.finalize('subject', 'replacement');
  await store.refund('subject', 'replacement');
  assert.equal((await store.usage('subject', 'manok', NOW)).kind, 'paid');
});

test('webhooks are idempotent, reject out-of-order events, and invalidate complimentary access', async () => {
  const store = new MemorySubscriptionStore();
  await store.putCached('customer', { ...normalizeRevenueCatSubscriber(subscriber('complimentary'), NOW), validUntil: NOW + 60_000 });
  assert.equal(await store.recordWebhook('event-1', NOW, ['customer']), 'accepted');
  assert.equal(await store.recordWebhook('event-1', NOW, ['customer']), 'duplicate');
  assert.equal(await store.recordWebhook('event-old', NOW - 1, ['customer']), 'stale');
  assert.equal(await store.getCached('customer', NOW), null);
});

test('quota and webhook idempotency state is reusable after the 30-day retention window', async () => {
  const store = new MemorySubscriptionStore();
  assert.equal((await store.reserve('subject', 'manok', 'scan', 'request', NOW)).allowed, true);
  await store.finalize('subject', 'request');
  assert.equal((await store.reserve('subject', 'manok', 'scan', 'request', NOW + 31 * 24 * 60 * 60 * 1000)).duplicate, false);
  assert.equal(await store.recordWebhook('event', NOW, ['customer']), 'accepted');
  assert.equal(await store.recordWebhook('event', NOW + 31 * 24 * 60 * 60 * 1000, ['customer']), 'accepted');
});

test('promotional grants resolve from the subscription record because v1 entitlements carry no store', () => {
  const promotional = subscriber('complimentary') as any;
  assert.equal(promotional.subscriber.entitlements.eatlog_paid.store, undefined);

  const verified = normalizeRevenueCatSubscriber(promotional, NOW);
  assert.equal(verified.access.kind, 'complimentary');
  assert.ok(verified.subjectIdentity);

  promotional.subscriber.subscriptions = {};
  assert.equal(normalizeRevenueCatSubscriber(promotional, NOW).access.kind, 'pugo');
});

test('AI grants stay valid until the verified entitlement expires', async () => {
  const expiry = NOW + 20 * 24 * 60 * 60 * 1000;
  const claims: GrantClaims = { aud: AI_GRANT_AUDIENCE, sub: 'subject', access: 'manok', iat: NOW, exp: expiry };
  const token = await signAiGrant(claims, 'signing-secret');

  assert.deepEqual(await verifyAiGrant(token, 'signing-secret', NOW + 19 * 24 * 60 * 60 * 1000), claims);
  assert.equal(await verifyAiGrant(token, 'signing-secret', expiry), null);
});

test('verified access survives a RevenueCat outage until the entitlement expires', async () => {
  const store = new MemorySubscriptionStore();
  const verified = normalizeRevenueCatSubscriber(subscriber('manok'), NOW);
  await store.putCached('customer', { ...verified, validUntil: NOW + 60 * 60 * 1000 });

  const stale = NOW + 5 * 24 * 60 * 60 * 1000;
  assert.equal(await store.getCached('customer', stale), null);
  assert.equal((await store.getCached('customer', stale, true))?.access.kind, 'manok');

  const expired = Date.parse('2026-09-23T00:00:00Z');
  assert.equal(await store.getCached('customer', expired, true), null);
});

test('a lifetime-duration complimentary grant has no expiration date and stays permanent, like Itik', () => {
  const lifetime = subscriber('complimentary') as any;
  lifetime.subscriber.entitlements.eatlog_paid.expires_date = null;

  const verified = normalizeRevenueCatSubscriber(lifetime, NOW);
  assert.equal(verified.access.kind, 'complimentary');
  assert.equal((verified.access as any).expiresAt, null);
  assert.ok(verified.subjectIdentity);
  assert.equal(accessExpired(verified.access, NOW + 10 * THIRTY_DAYS_MS), false);
  assert.equal(accessExpiresAt(verified.access), null);
});

test('a lifetime complimentary grant without a stable RevenueCat identity still fails closed', () => {
  const lifetime = subscriber('complimentary') as any;
  lifetime.subscriber.entitlements.eatlog_paid.expires_date = null;
  delete lifetime.subscriber.original_app_user_id;

  assert.deepEqual(normalizeRevenueCatSubscriber(lifetime, NOW), {
    access: { kind: 'pugo', checkedAt: new Date(NOW).toISOString(), reason: 'malformed' },
    subjectIdentity: null,
  });
});

test('an AI grant for a lifetime complimentary user is capped at the max grant TTL, not left unbounded', async () => {
  const lifetime = subscriber('complimentary') as any;
  lifetime.subscriber.entitlements.eatlog_paid.expires_date = null;
  const verified = normalizeRevenueCatSubscriber(lifetime, NOW);

  const exp = Math.min(NOW + AI_GRANT_MAX_TTL_MS, accessExpiresAt(verified.access) ?? Number.POSITIVE_INFINITY);
  assert.equal(exp, NOW + AI_GRANT_MAX_TTL_MS);
  const token = await signAiGrant({ aud: AI_GRANT_AUDIENCE, sub: 'subject', access: 'complimentary', iat: NOW, exp }, 'signing-secret');
  assert.ok(await verifyAiGrant(token, 'signing-secret', NOW + AI_GRANT_MAX_TTL_MS - 1));
  assert.equal(await verifyAiGrant(token, 'signing-secret', NOW + AI_GRANT_MAX_TTL_MS), null);
});
