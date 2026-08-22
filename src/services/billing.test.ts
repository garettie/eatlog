import assert from 'node:assert/strict';
import test from 'node:test';

import { createBillingClient } from './billing';
import type { EatlogAccess } from './billing.types';

const NOW = new Date('2026-08-22T00:00:00.000Z');
const PUGO: EatlogAccess = { kind: 'pugo', checkedAt: NOW.toISOString() };

function customerInfo(kind: 'pugo' | 'manok' | 'itik' = 'manok'): any {
  const entitlement = kind === 'pugo' ? undefined : {
    identifier: 'eatlog_paid', isActive: true, willRenew: kind === 'manok', periodType: 'NORMAL',
    latestPurchaseDate: '2026-08-01T00:00:00Z',
    expirationDate: kind === 'itik' ? null : '2026-09-01T00:00:00Z',
    store: 'TEST_STORE', productIdentifier: kind === 'itik' ? 'eatlog_itik_lifetime' : 'eatlog_manok',
    billingIssueDetectedAt: null,
  };
  return { requestDate: NOW.toISOString(), entitlements: { all: entitlement ? { eatlog_paid: entitlement } : {} } };
}

function pkg(tier: 'manok' | 'itik'): any {
  return {
    identifier: tier === 'manok' ? '$rc_monthly' : '$rc_lifetime',
    product: {
      identifier: tier === 'manok' ? 'eatlog_manok' : 'eatlog_itik_lifetime',
      priceString: tier === 'manok' ? '₱79.00' : '₱799.00',
      defaultOption: tier === 'manok' ? { freePhase: {} } : null,
      introPrice: null,
    },
  };
}

function adapter(overrides: Record<string, unknown> = {}) {
  const manok = pkg('manok');
  const itik = pkg('itik');
  const offering = { identifier: 'default', monthly: manok, lifetime: itik, availablePackages: [manok, itik] };
  return {
    configureCalls: [] as unknown[],
    configure(value: unknown) { this.configureCalls.push(value); },
    async getCustomerInfo() { return customerInfo(); },
    async invalidateCustomerInfoCache() {},
    async getOfferings() { return { current: offering, all: { default: offering } }; },
    async purchasePackage(value: any) { return { customerInfo: customerInfo(value.product.identifier.includes('itik') ? 'itik' : 'manok') }; },
    async restorePurchases() { return customerInfo('itik'); },
    async showManageSubscriptions() {},
    addCustomerInfoUpdateListener() {},
    removeCustomerInfoUpdateListener() { return true; },
    ...overrides,
  } as any;
}

test('configures once with the installation token and consumes localized default offering products', async () => {
  const sdk = adapter();
  const client = createBillingClient({ apiKey: 'test_public_key', purchases: sdk, getInstallationToken: async () => 'a'.repeat(32), now: () => NOW });
  await Promise.all([client.configure(), client.configure(), client.customerInfo()]);
  assert.equal(sdk.configureCalls.length, 1);
  assert.deepEqual(sdk.configureCalls[0], { apiKey: 'test_public_key', appUserID: 'a'.repeat(32) });
  assert.deepEqual(await client.offering(), {
    identifier: 'default',
    manok: { tier: 'manok', packageIdentifier: '$rc_monthly', productIdentifier: 'eatlog_manok', priceString: '₱79.00', trialEligible: true },
    itik: { tier: 'itik', packageIdentifier: '$rc_lifetime', productIdentifier: 'eatlog_itik_lifetime', priceString: '₱799.00', trialEligible: false },
  });
});

test('maps purchase success, cancellation, failure, pending, and delayed entitlement refresh', async () => {
  assert.equal((await createBillingClient({ apiKey: 'key', purchases: adapter(), getInstallationToken: async () => 'a'.repeat(32), now: () => NOW }).purchase('manok', PUGO)).state, 'success');
  for (const [code, expected] of [['1', 'cancelled'], ['20', 'pending'], ['10', 'failed']] as const) {
    const client = createBillingClient({
      apiKey: 'key', purchases: adapter({ purchasePackage: async () => { throw { code }; } }),
      getInstallationToken: async () => 'a'.repeat(32), now: () => NOW,
    });
    assert.equal((await client.purchase('manok', PUGO)).state, expected);
  }
  const delayed = createBillingClient({
    apiKey: 'key', purchases: adapter({ purchasePackage: async () => ({ customerInfo: customerInfo('pugo') }) }),
    getInstallationToken: async () => 'a'.repeat(32), now: () => NOW,
  });
  assert.equal((await delayed.purchase('manok', PUGO)).state, 'entitlement-pending');
});

test('restores access, reports no purchase, and prevents Itik repurchase or renewing Manok transition', async () => {
  const client = createBillingClient({ apiKey: 'key', purchases: adapter(), getInstallationToken: async () => 'a'.repeat(32), now: () => NOW });
  assert.equal((await client.restore(PUGO)).access.kind, 'itik');
  const none = createBillingClient({ apiKey: 'key', purchases: adapter({ restorePurchases: async () => customerInfo('pugo') }), getInstallationToken: async () => 'a'.repeat(32), now: () => NOW });
  assert.equal((await none.restore(PUGO)).state, 'no-purchase');
  const itik = { kind: 'itik', productId: 'eatlog_itik_lifetime', purchasedAt: null, checkedAt: NOW.toISOString() } as const;
  assert.equal((await client.purchase('itik', itik)).message, 'Eatlog Itik is already active.');
  const manok = { kind: 'manok', productId: 'eatlog_manok', expiresAt: '2026-09-01T00:00:00Z', willRenew: true, checkedAt: NOW.toISOString(), billingState: 'active' } as const;
  assert.equal((await client.purchase('itik', manok)).state, 'failed');
});

test('RevenueCat outage leaves Pugo available and does not expose provider details', async () => {
  const secret = 'provider transaction secret';
  const client = createBillingClient({
    apiKey: 'key', purchases: adapter({ getCustomerInfo: async () => { throw new Error(secret); } }),
    getInstallationToken: async () => 'a'.repeat(32), now: () => NOW,
  });
  const access = await client.customerInfo();
  assert.equal(access.kind, 'pugo');
  assert.equal(JSON.stringify(access).includes(secret), false);
});
