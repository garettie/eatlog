import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canBuyItik,
  entitlementStatus,
  hasItik,
  normalizeAccess,
  shouldApplyAccessUpdate,
  type EatlogAccess,
  type RevenueCatEntitlementSnapshot,
} from './billing.types';

const NOW = new Date('2026-08-22T00:00:00.000Z');

function access(overrides: Partial<RevenueCatEntitlementSnapshot> = {}) {
  return normalizeAccess({
    requestDate: NOW.toISOString(),
    entitlement: {
      identifier: 'eatlog_paid',
      isActive: true,
      willRenew: true,
      periodType: 'NORMAL',
      latestPurchaseDate: '2026-08-01T00:00:00.000Z',
      expirationDate: '2026-09-01T00:00:00.000Z',
      store: 'PLAY_STORE',
      productIdentifier: 'eatlog_manok:monthly',
      billingIssueDetectedAt: null,
      ...overrides,
    },
  }, NOW);
}

test('classifies every active entitlement as Itik by its shape: subscription, trial, purchase, complimentary, grace', () => {
  assert.deepEqual(normalizeAccess({ requestDate: NOW.toISOString(), entitlement: null }, NOW), {
    kind: 'none', checkedAt: NOW.toISOString(), reason: 'none',
  });
  assert.deepEqual(access(), {
    kind: 'subscription',
    expiresAt: '2026-09-01T00:00:00.000Z',
    willRenew: true,
    productId: 'eatlog_manok:monthly',
    checkedAt: NOW.toISOString(),
    billingState: 'active',
    trial: false,
  });
  const trial = access({ periodType: 'TRIAL' });
  assert.equal(trial.kind === 'subscription' && trial.trial, true);
  const grace = access({ billingIssueDetectedAt: '2026-08-20T00:00:00Z' });
  assert.equal(grace.kind === 'subscription' ? grace.billingState : null, 'grace');
  assert.deepEqual(access({
    productIdentifier: 'eatlog_itik',
    expirationDate: null,
    willRenew: false,
  }), {
    kind: 'purchase',
    productId: 'eatlog_itik',
    purchasedAt: '2026-08-01T00:00:00.000Z',
    checkedAt: NOW.toISOString(),
  });
  assert.deepEqual(access({
    store: 'PROMOTIONAL',
    productIdentifier: 'rc_promo_eatlog_paid',
    willRenew: false,
  }), {
    kind: 'complimentary',
    expiresAt: '2026-09-01T00:00:00.000Z',
    checkedAt: NOW.toISOString(),
  });
});

test('a new product or cadence behind the entitlement is Itik with no app change', () => {
  assert.equal(access({ productIdentifier: 'eatlog_itik_yearly' }).kind, 'subscription');
  assert.equal(access({ productIdentifier: 'eatlog_itik', expirationDate: '2026-09-01T00:00:00Z' }).kind, 'subscription');
  assert.equal(access({ productIdentifier: 'eatlog_itik_once', expirationDate: null }).kind, 'purchase');
});

test('expired, refunded, revoked, and malformed access resolve to no entitlement', () => {
  assert.deepEqual(access({ isActive: false, expirationDate: '2026-08-21T23:59:59Z' }), {
    kind: 'none', checkedAt: NOW.toISOString(), reason: 'expired',
  });
  assert.deepEqual(access({ isActive: false }), {
    kind: 'none', checkedAt: NOW.toISOString(), reason: 'revoked',
  });
  assert.equal(access({ identifier: 'wrong' }).kind, 'none');
  assert.equal(access({ expirationDate: 'not-a-date' }).kind, 'none');
  assert.equal(access({ periodType: 'PREPAID' }).kind, 'none');
  assert.equal(access({ willRenew: undefined }).kind, 'none');
  assert.equal(normalizeAccess(undefined, NOW).kind, 'none');
});

test('the double-payment guard blocks a second Itik product only while paying twice', () => {
  const none = normalizeAccess({ entitlement: null }, NOW);
  const renewing = access();
  const cancelled = access({ willRenew: false });
  const purchase = access({ productIdentifier: 'eatlog_itik', expirationDate: null, willRenew: false });
  assert.equal(hasItik(none), false);
  assert.equal(hasItik(renewing, NOW), true);
  assert.equal(canBuyItik(none), true);
  assert.equal(canBuyItik(renewing), false);
  assert.equal(canBuyItik(cancelled), true);
  assert.equal(canBuyItik(purchase), false);
});

test('unresolved and transient access are checking rather than confirmed free', () => {
  const none = normalizeAccess({ entitlement: null }, NOW);
  const unavailable = normalizeAccess(undefined, NOW);
  const malformed = access({ identifier: 'wrong' });
  const trial = access({ periodType: 'TRIAL' });

  assert.equal(entitlementStatus(null), 'checking');
  assert.equal(entitlementStatus(unavailable), 'checking');
  assert.equal(entitlementStatus(malformed), 'checking');
  assert.equal(entitlementStatus(none), 'free');
  assert.equal(entitlementStatus(trial, NOW), 'paid');
});

test('access updates resolve authoritative startup states and reject transient or stale snapshots', () => {
  const paid = access();
  const free = normalizeAccess({ requestDate: NOW.toISOString(), entitlement: null }, NOW);
  const staleRevocation = {
    kind: 'none' as const,
    checkedAt: '2026-08-21T23:59:59.000Z',
    reason: 'revoked' as const,
  };
  const lookupFailure = {
    kind: 'none' as const,
    checkedAt: '2026-08-22T00:01:00.000Z',
    reason: 'unavailable' as const,
  };
  const malformed = { ...lookupFailure, reason: 'malformed' as const };
  const currentRevocation = { ...lookupFailure, reason: 'revoked' as const };
  const expired = { ...lookupFailure, reason: 'expired' as const };

  assert.equal(shouldApplyAccessUpdate(null, lookupFailure, NOW), false);
  assert.equal(shouldApplyAccessUpdate(null, malformed, NOW), false);
  assert.equal(shouldApplyAccessUpdate(null, paid, NOW), true);
  assert.equal(shouldApplyAccessUpdate(null, free, NOW), true);
  assert.equal(shouldApplyAccessUpdate(null, currentRevocation, NOW), true);
  assert.equal(shouldApplyAccessUpdate(null, expired, NOW), true);
  assert.equal(shouldApplyAccessUpdate(free, lookupFailure, NOW), false);
  assert.equal(shouldApplyAccessUpdate(free, malformed, NOW), false);
  assert.equal(shouldApplyAccessUpdate(paid, staleRevocation, NOW), false);
  assert.equal(shouldApplyAccessUpdate(paid, lookupFailure, NOW), false);
  assert.equal(shouldApplyAccessUpdate(paid, currentRevocation, NOW), true);
});

test('locally expired paid access stays gated and may settle as unavailable pending confirmation', () => {
  const paid = access();
  const afterExpiry = new Date('2026-09-01T00:00:01.000Z');
  const lookupFailure: EatlogAccess = {
    kind: 'none',
    checkedAt: afterExpiry.toISOString(),
    reason: 'unavailable',
  };

  assert.equal(hasItik(paid, afterExpiry), false);
  assert.equal(entitlementStatus(paid, afterExpiry), 'checking');
  assert.equal(shouldApplyAccessUpdate(paid, lookupFailure, afterExpiry), true);
});

test('a lifetime-duration complimentary grant has no expiration date and behaves like Itik', () => {
  const lifetime = access({
    store: 'PROMOTIONAL',
    productIdentifier: 'rc_promo_eatlog_paid',
    expirationDate: null,
    willRenew: false,
  });

  assert.deepEqual(lifetime, {
    kind: 'complimentary',
    expiresAt: null,
    checkedAt: NOW.toISOString(),
  });
  assert.equal(hasItik(lifetime, new Date('2099-01-01T00:00:00Z')), true);
  assert.equal(canBuyItik(lifetime), true);

  const laterUnavailable: EatlogAccess = {
    kind: 'none',
    checkedAt: '2026-08-23T00:00:00.000Z',
    reason: 'unavailable',
  };
  assert.equal(shouldApplyAccessUpdate(lifetime, laterUnavailable, NOW), false);
});
