import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canBuyItik,
  entitlementStatus,
  hasPaidFeatures,
  normalizeAccess,
  shouldApplyAccessUpdate,
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

test('normalizes Pugo, trial, Manok, Itik, complimentary, and grace access', () => {
  assert.deepEqual(normalizeAccess({ requestDate: NOW.toISOString(), entitlement: null }, NOW), {
    kind: 'pugo', checkedAt: NOW.toISOString(), reason: 'none',
  });
  assert.equal(access({ periodType: 'TRIAL' }).kind, 'manok-trial');
  assert.equal(access().kind, 'manok');
  const grace = access({ billingIssueDetectedAt: '2026-08-20T00:00:00Z' });
  assert.equal(grace.kind, 'manok');
  assert.equal(grace.kind === 'manok' ? grace.billingState : null, 'grace');
  assert.deepEqual(access({
    productIdentifier: 'eatlog_itik',
    expirationDate: null,
    willRenew: false,
  }), {
    kind: 'itik',
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

test('expired, refunded, revoked, unknown, and malformed access fail closed to Pugo', () => {
  assert.deepEqual(access({ isActive: false, expirationDate: '2026-08-21T23:59:59Z' }), {
    kind: 'pugo', checkedAt: NOW.toISOString(), reason: 'expired',
  });
  assert.deepEqual(access({ isActive: false }), {
    kind: 'pugo', checkedAt: NOW.toISOString(), reason: 'revoked',
  });
  assert.equal(access({ productIdentifier: 'unknown_product' }).kind, 'pugo');
  assert.equal(access({ identifier: 'wrong' }).kind, 'pugo');
  assert.equal(access({ expirationDate: 'not-a-date' }).kind, 'pugo');
  assert.equal(normalizeAccess(undefined, NOW).kind, 'pugo');
});

test('paid feature and Manok-to-Itik predicates preserve transition rules', () => {
  const pugo = normalizeAccess({ entitlement: null }, NOW);
  const renewingManok = access();
  const cancelledManok = access({ willRenew: false });
  const itik = access({ productIdentifier: 'eatlog_itik', expirationDate: null, willRenew: false });
  assert.equal(hasPaidFeatures(pugo), false);
  assert.equal(hasPaidFeatures(renewingManok), true);
  assert.equal(canBuyItik(renewingManok), false);
  assert.equal(canBuyItik(cancelledManok), true);
  assert.equal(canBuyItik(itik), false);
});

test('unresolved access is checking rather than confirmed free', () => {
  const pugo = normalizeAccess({ entitlement: null }, NOW);
  const trial = access({ periodType: 'TRIAL' });

  assert.equal(entitlementStatus(null), 'checking');
  assert.equal(entitlementStatus(pugo), 'free');
  assert.equal(entitlementStatus(trial), 'paid');
});

test('access updates reject stale snapshots and transient lookup failures', () => {
  const current = access();
  const staleRevocation = {
    kind: 'pugo' as const,
    checkedAt: '2026-08-21T23:59:59.000Z',
    reason: 'revoked' as const,
  };
  const lookupFailure = {
    kind: 'pugo' as const,
    checkedAt: '2026-08-22T00:01:00.000Z',
    reason: 'unavailable' as const,
  };
  const currentRevocation = { ...lookupFailure, reason: 'revoked' as const };

  assert.equal(shouldApplyAccessUpdate(current, staleRevocation), false);
  assert.equal(shouldApplyAccessUpdate(current, lookupFailure), false);
  assert.equal(shouldApplyAccessUpdate(current, currentRevocation), true);
});
