import assert from 'node:assert/strict';
import test from 'node:test';

import {
  entitlementStatus,
  hasItik,
  needsRevalidation,
  normalizeAccess,
  PAID_REVERIFY_MARGIN_MS,
  paidAndSettled,
  shouldApplyAccessUpdate,
  type EatlogAccess,
} from './billing.types';

const NOW = new Date('2026-08-29T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

const subscription = (expiresIn: number): EatlogAccess => ({
  kind: 'subscription',
  expiresAt: at(expiresIn),
  willRenew: true,
  productId: 'eatlog_manok',
  checkedAt: at(0),
  billingState: 'active',
  trial: false,
});
const PURCHASE: EatlogAccess = {
  kind: 'purchase', productId: 'eatlog_itik', purchasedAt: at(-DAY), checkedAt: at(0),
};
const none = (reason: 'none' | 'expired' | 'revoked' | 'unavailable' | 'malformed'): EatlogAccess => ({
  kind: 'none', checkedAt: at(0), reason,
});

/**
 * Mirrors the ordering in EntitlementProvider's ensurePaidAccess using the same exported
 * predicates it calls, so this exercises the shipped rule rather than a copy of it.
 */
function decide(stored: EatlogAccess | null, confirmed: boolean, resolvesTo: EatlogAccess | null) {
  if (stored !== null && hasItik(stored, NOW)) return { decision: 'paid', lookups: 0 };
  const lookups = needsRevalidation(stored, confirmed, NOW) ? 1 : 0;
  const current = lookups === 1 ? resolvesTo : stored;
  const status = entitlementStatus(current, NOW);
  return { decision: status === 'checking' ? 'unavailable' : status, lookups };
}

test('a valid stored subscription answers instantly, with no lookup in front of it', () => {
  for (const stored of [subscription(30 * DAY), subscription(60_000), PURCHASE]) {
    assert.deepEqual(decide(stored, false, null), { decision: 'paid', lookups: 0 });
  }
});

test('an expired subscription is re-checked rather than trusted', () => {
  assert.deepEqual(decide(subscription(-1000), true, subscription(30 * DAY)), { decision: 'paid', lookups: 1 });
});

test('a stored free plan is re-checked before it is allowed to deny anything', () => {
  // Resubscribed while the app was closed.
  assert.deepEqual(decide(none('expired'), false, subscription(30 * DAY)), { decision: 'paid', lookups: 1 });
  // Genuinely still free.
  assert.deepEqual(decide(none('expired'), false, none('none')), { decision: 'free', lookups: 1 });
});

test('an unreachable store reports unavailable, never free', () => {
  assert.deepEqual(decide(null, false, none('unavailable')), { decision: 'unavailable', lookups: 1 });
  assert.deepEqual(decide(null, false, none('malformed')), { decision: 'unavailable', lookups: 1 });
});

test('a transient failure never revokes a live subscription', () => {
  for (const stored of [subscription(30 * DAY), PURCHASE]) {
    assert.equal(shouldApplyAccessUpdate(stored, none('unavailable'), NOW), false);
    assert.equal(shouldApplyAccessUpdate(stored, none('malformed'), NOW), false);
  }
  // An already-expired plan may be replaced, since it grants nothing either way.
  assert.equal(shouldApplyAccessUpdate(subscription(-1000), none('unavailable'), NOW), true);
});

test('a real revocation does replace a live subscription', () => {
  assert.equal(shouldApplyAccessUpdate(subscription(30 * DAY), { ...none('revoked'), checkedAt: at(1000) }, NOW), true);
  assert.equal(shouldApplyAccessUpdate(subscription(30 * DAY), { ...none('none'), checkedAt: at(1000) }, NOW), true);
});

test('automatic re-verification is skipped only while a subscription is settled', () => {
  assert.equal(paidAndSettled(subscription(30 * DAY), NOW), true);
  assert.equal(paidAndSettled(PURCHASE, NOW), true);
  // Verification resumes as expiry approaches, so a lapse is noticed without polling.
  assert.equal(paidAndSettled(subscription(PAID_REVERIFY_MARGIN_MS - 1000), NOW), false);
  assert.equal(paidAndSettled(subscription(-1000), NOW), false);
  assert.equal(paidAndSettled(null, NOW), false);
  assert.equal(paidAndSettled(none('none'), NOW), false);
});

test('a billing problem does not read as lost access while the paid period is still running', () => {
  const grace = normalizeAccess({
    requestDate: at(0),
    entitlement: {
      identifier: 'eatlog_paid', isActive: true, willRenew: true, periodType: 'NORMAL',
      expirationDate: at(30 * DAY), productIdentifier: 'eatlog_manok',
      billingIssueDetectedAt: at(-DAY),
    },
  }, NOW);
  assert.equal(grace.kind, 'subscription');
  assert.equal(hasItik(grace, NOW), true);
  assert.deepEqual(decide(grace, false, null), { decision: 'paid', lookups: 0 });
});

test('a free trial is trusted exactly like a paid subscription', () => {
  const trial = normalizeAccess({
    requestDate: at(0),
    entitlement: {
      identifier: 'eatlog_paid', isActive: true, willRenew: true, periodType: 'TRIAL',
      expirationDate: at(7 * DAY), productIdentifier: 'eatlog_manok',
    },
  }, NOW);
  assert.equal(trial.kind === 'subscription' && trial.trial, true);
  assert.deepEqual(decide(trial, false, null), { decision: 'paid', lookups: 0 });
  assert.equal(shouldApplyAccessUpdate(trial, none('unavailable'), NOW), false);
});

test('complimentary access with no end date is trusted and never polled', () => {
  const complimentary = normalizeAccess({
    requestDate: at(0),
    entitlement: {
      identifier: 'eatlog_paid', isActive: true, willRenew: false, periodType: 'NORMAL',
      expirationDate: null, productIdentifier: 'eatlog_reviewer', store: 'PROMOTIONAL',
    },
  }, NOW);
  assert.equal(complimentary.kind, 'complimentary');
  assert.deepEqual(decide(complimentary, false, null), { decision: 'paid', lookups: 0 });
  assert.equal(paidAndSettled(complimentary, NOW), true);
});
