import assert from 'node:assert/strict';
import test from 'node:test';

import { createBillingClient } from './billing';
import type { EatlogAccess } from './billing.types';

const NOW = new Date('2026-08-22T00:00:00.000Z');
const NONE: EatlogAccess = { kind: 'none', checkedAt: NOW.toISOString() };
const RENEWING: EatlogAccess = {
  kind: 'subscription', productId: 'eatlog_manok', expiresAt: '2026-09-01T00:00:00Z', willRenew: true,
  checkedAt: NOW.toISOString(), billingState: 'active', trial: false,
};

function customerInfo(kind: 'none' | 'subscription' | 'purchase' = 'subscription', managementURL: string | null = null): any {
  const entitlement = kind === 'none' ? undefined : {
    identifier: 'eatlog_paid', isActive: true, willRenew: kind === 'subscription', periodType: 'NORMAL',
    latestPurchaseDate: '2026-08-01T00:00:00Z',
    expirationDate: kind === 'purchase' ? null : '2026-09-01T00:00:00Z',
    store: 'TEST_STORE', productIdentifier: kind === 'purchase' ? 'eatlog_itik' : 'eatlog_manok',
    billingIssueDetectedAt: null,
  };
  return { requestDate: NOW.toISOString(), managementURL, entitlements: { all: entitlement ? { eatlog_paid: entitlement } : {} } };
}

function oneTime(): any {
  return {
    identifier: '$rc_lifetime',
    product: { identifier: 'eatlog_itik', priceString: '₱799.00', subscriptionPeriod: null, defaultOption: null, introPrice: null },
  };
}

function monthly(freePhase: unknown = null): any {
  return {
    identifier: '$rc_monthly',
    product: {
      identifier: 'eatlog_itik_monthly', priceString: '₱79.00', subscriptionPeriod: 'P1M',
      defaultOption: { freePhase }, introPrice: null,
    },
  };
}

function offerings(...packages: any[]) {
  const itik = { identifier: 'itik', availablePackages: packages };
  const legacy = { identifier: 'default', availablePackages: [monthly({ billingPeriod: { iso8601: 'P1M' } })] };
  return { current: legacy, all: { default: legacy, itik } };
}

function adapter(overrides: Record<string, unknown> = {}) {
  return {
    configureCalls: [] as unknown[],
    configure(value: unknown) { this.configureCalls.push(value); },
    async getCustomerInfo() { return customerInfo(); },
    async invalidateCustomerInfoCache() {},
    async getOfferings() { return offerings(oneTime()); },
    async purchasePackage(value: any) { return { customerInfo: customerInfo(value.product.subscriptionPeriod ? 'subscription' : 'purchase') }; },
    async restorePurchases() { return customerInfo('purchase'); },
    async showManageSubscriptions() {},
    addCustomerInfoUpdateListener() {},
    removeCustomerInfoUpdateListener() { return true; },
    ...overrides,
  } as any;
}

function client(overrides: Record<string, unknown> = {}) {
  return createBillingClient({ apiKey: 'test_public_key', purchases: adapter(overrides), getInstallationToken: async () => 'a'.repeat(32), now: () => NOW });
}

test('configures once and reads only the itik offering, not the current default', async () => {
  const sdk = adapter();
  const billing = createBillingClient({ apiKey: 'test_public_key', purchases: sdk, getInstallationToken: async () => 'a'.repeat(32), now: () => NOW });
  await Promise.all([billing.configure(), billing.configure(), billing.customerInfo()]);
  assert.equal(sdk.configureCalls.length, 1);
  assert.deepEqual(sdk.configureCalls[0], { apiKey: 'test_public_key', appUserID: 'a'.repeat(32) });
  assert.deepEqual(await billing.offering(), {
    identifier: 'itik',
    packages: [{ packageIdentifier: '$rc_lifetime', productIdentifier: 'eatlog_itik', priceString: '₱799.00', period: null, freeTrial: null }],
  });
  const missing = client({ getOfferings: async () => ({ current: null, all: { default: offerings().all.default } }) });
  assert.equal(await missing.offering(), null);
});

test('labels packages from the store terms and reports a trial only when the store offers one', async () => {
  const withTrial = client({ getOfferings: async () => offerings(monthly({ billingPeriod: { iso8601: 'P1M' } }), oneTime()) });
  assert.deepEqual((await withTrial.offering())?.packages.map((item) => [item.period, item.freeTrial]), [['P1M', 'P1M'], [null, null]]);
  const noTrial = client({ getOfferings: async () => offerings(monthly(null)) });
  assert.equal((await noTrial.offering())?.packages[0].freeTrial, null);
  const iosIntro = monthly(null);
  iosIntro.product.defaultOption = null;
  iosIntro.product.introPrice = { price: 0, period: 'P1W' };
  const ios = client({ getOfferings: async () => offerings(iosIntro) });
  assert.equal((await ios.offering())?.packages[0].freeTrial, 'P1W');
});

test('maps purchase success, cancellation, failure, pending, and delayed entitlement refresh', async () => {
  let bought: string | null = null;
  const success = client({ getOfferings: async () => offerings(monthly(), oneTime()), purchasePackage: async (value: any) => {
    bought = value.identifier;
    return { customerInfo: customerInfo('purchase') };
  } });
  const result = await success.purchase('$rc_lifetime', NONE);
  assert.equal(result.state, 'success');
  assert.equal(result.message, 'Eatlog Itik is active.');
  assert.equal(bought, '$rc_lifetime');
  for (const [code, expected] of [['1', 'cancelled'], ['20', 'pending'], ['10', 'failed']] as const) {
    assert.equal((await client({ purchasePackage: async () => { throw { code }; } }).purchase('$rc_lifetime', NONE)).state, expected);
  }
  const delayed = await client({ purchasePackage: async () => ({ customerInfo: customerInfo('none') }) }).purchase('$rc_lifetime', NONE);
  assert.equal(delayed.state, 'entitlement-pending');
  assert.deepEqual(delayed.access, NONE);
  assert.equal((await client().purchase('$rc_monthly', NONE)).message, "This plan isn't available in this build.");
});

test('purchase cancellation keeps the current access instead of claiming none', async () => {
  const cancelled: EatlogAccess = { ...RENEWING, willRenew: false };
  assert.deepEqual(await client({ purchasePackage: async () => { throw { code: '1' }; } }).purchase('$rc_lifetime', cancelled), {
    state: 'cancelled',
    message: 'Purchase canceled. Your current plan is unchanged.',
    access: cancelled,
  });
});

test('restores access, reports no purchase, and never sells a second Itik product to someone paying', async () => {
  let purchases = 0;
  const billing = client({ purchasePackage: async () => { purchases += 1; return { customerInfo: customerInfo('purchase') }; } });
  const restored = await billing.restore(NONE);
  assert.equal(restored.access.kind, 'purchase');
  assert.equal(restored.message, 'Eatlog Itik was restored.');
  const none = await client({ restorePurchases: async () => customerInfo('none') }).restore(NONE);
  assert.equal(none.state, 'no-purchase');
  assert.equal(none.message, 'No active Itik purchase was found on this store account.');

  const bought = { kind: 'purchase', productId: 'eatlog_itik', purchasedAt: null, checkedAt: NOW.toISOString() } as const;
  assert.equal((await billing.purchase('$rc_lifetime', bought)).message, 'Eatlog Itik is already active.');
  const renewing = await billing.purchase('$rc_lifetime', RENEWING);
  assert.equal(renewing.state, 'failed');
  assert.match(renewing.message, /Cancel it in the store/);
  assert.equal(purchases, 0);
  const complimentary = { kind: 'complimentary', expiresAt: null, checkedAt: NOW.toISOString() } as const;
  assert.equal((await billing.purchase('$rc_lifetime', complimentary)).state, 'success');
  assert.equal(purchases, 1);
});

test('automatic CustomerInfo reads preserve the SDK cache while manual refresh can invalidate it', async () => {
  let invalidations = 0;
  const client = createBillingClient({
    apiKey: 'key',
    purchases: adapter({ invalidateCustomerInfoCache: async () => { invalidations += 1; } }),
    getInstallationToken: async () => 'a'.repeat(32),
    now: () => NOW,
  });

  await client.customerInfo();
  assert.equal(invalidations, 0);
  await client.customerInfo(true);
  assert.equal(invalidations, 1);
});

test('opens the RevenueCat management URL instead of the iOS-only management sheet', async () => {
  const opened: string[] = [];
  let nativeSheetCalls = 0;
  const managementURL = 'https://play.google.com/store/account/subscriptions?sku=eatlog_manok';
  const client = createBillingClient({
    apiKey: 'key',
    purchases: adapter({
      getCustomerInfo: async () => customerInfo('subscription', managementURL),
      showManageSubscriptions: async () => { nativeSheetCalls += 1; },
    }),
    getInstallationToken: async () => 'a'.repeat(32),
    openURL: async (url) => { opened.push(url); },
    now: () => NOW,
  });

  assert.deepEqual(await client.manageSubscription(), {
    state: 'success',
    message: 'Store subscription management opened.',
  });
  assert.deepEqual(opened, [managementURL]);
  assert.equal(nativeSheetCalls, 0);
});

test('explains when RevenueCat Test Store has no device subscription management page', async () => {
  const opened: string[] = [];
  const client = createBillingClient({
    apiKey: 'key',
    purchases: adapter({ getCustomerInfo: async () => customerInfo('subscription') }),
    getInstallationToken: async () => 'a'.repeat(32),
    openURL: async (url) => { opened.push(url); },
    now: () => NOW,
  });

  assert.deepEqual(await client.manageSubscription(), {
    state: 'failed',
    message: 'Test Store subscriptions have no device settings. They expire automatically during accelerated testing.',
  });
  assert.deepEqual(opened, []);
});

test('RevenueCat outage reports no entitlement as unavailable and does not expose provider details', async () => {
  const secret = 'provider transaction secret';
  const client = createBillingClient({
    apiKey: 'key', purchases: adapter({ getCustomerInfo: async () => { throw new Error(secret); } }),
    getInstallationToken: async () => 'a'.repeat(32), now: () => NOW,
  });
  const access = await client.customerInfo();
  assert.deepEqual([access.kind, access.kind === 'none' && access.reason], ['none', 'unavailable']);
  assert.equal(JSON.stringify(access).includes(secret), false);
});
