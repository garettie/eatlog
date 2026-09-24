import type {
  CustomerInfo,
  MakePurchaseResult,
  PurchasesError,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';

import { getInstallationToken } from './installIdentity';
import {
  canBuyItik,
  EATLOG_ENTITLEMENT_ID,
  EATLOG_OFFERING_ID,
  hasItik,
  normalizeAccess,
  type BillingActionResult,
  type BillingOffering,
  type BillingPackage,
  type EatlogAccess,
  type RevenueCatCustomerSnapshot,
} from './billing.types';
import { TIER_NAMES } from './tierNames';

interface BillingOperationResult extends BillingActionResult {
  access: EatlogAccess;
}

interface PurchasesAdapter {
  configure(options: { apiKey: string; appUserID: string }): void;
  getCustomerInfo(): Promise<CustomerInfo>;
  invalidateCustomerInfoCache(): Promise<void>;
  getOfferings(): Promise<{ current: PurchasesOffering | null; all: Record<string, PurchasesOffering> }>;
  purchasePackage(pkg: PurchasesPackage): Promise<MakePurchaseResult>;
  restorePurchases(): Promise<CustomerInfo>;
  addCustomerInfoUpdateListener(listener: (info: CustomerInfo) => void): void;
  removeCustomerInfoUpdateListener(listener: (info: CustomerInfo) => void): boolean;
}

export interface BillingClientOptions {
  apiKey: string;
  purchases?: PurchasesAdapter;
  getInstallationToken?: () => Promise<string>;
  openURL?: (url: string) => Promise<unknown>;
  now?: () => Date;
}

const BILLING_UNAVAILABLE = 'Billing is unavailable on this installed build. Your logbook still works.';

function snapshot(info: CustomerInfo): RevenueCatCustomerSnapshot {
  return {
    requestDate: info.requestDate,
    entitlement: info.entitlements?.all?.[EATLOG_ENTITLEMENT_ID] ?? null,
  };
}

function noAccessUnavailable(now: Date): EatlogAccess {
  return { kind: 'none', checkedAt: now.toISOString(), reason: 'unavailable' };
}

function itikOffering(offerings: { current: PurchasesOffering | null; all: Record<string, PurchasesOffering> }): PurchasesOffering | null {
  return offerings.all[EATLOG_OFFERING_ID]
    ?? (offerings.current?.identifier === EATLOG_OFFERING_ID ? offerings.current : null);
}

/** The store's own terms for a package, so a new cadence or trial needs no app change. */
function publicPackage(pkg: PurchasesPackage): BillingPackage {
  const { product } = pkg;
  const period = product.subscriptionPeriod?.trim() || null;
  const freeTrial = period === null
    ? null
    : product.defaultOption?.freePhase?.billingPeriod.iso8601
      ?? (product.introPrice?.price === 0 ? product.introPrice.period : null);
  return {
    packageIdentifier: pkg.identifier,
    productIdentifier: product.identifier,
    priceString: product.priceString,
    period,
    freeTrial,
  };
}

function purchaseFailure(error: unknown): BillingActionResult {
  const cause = error as Partial<PurchasesError> | null;
  if (cause?.code === '1' || cause?.userCancelled === true) {
    return { state: 'cancelled', message: 'Purchase canceled. Your current plan is unchanged.' };
  }
  if (cause?.code === '20') {
    return { state: 'pending', message: 'Payment is pending. Paid access will appear after the store completes it.' };
  }
  if (cause?.code === '5') {
    return { state: 'failed', message: "This plan isn't available in this build." };
  }
  if (cause?.code === '3') {
    return { state: 'failed', message: "Purchases aren't available on this device or store account." };
  }
  if (cause?.code === '10' || cause?.code === '35') {
    return { state: 'failed', message: 'The store could not be reached. Check your connection and try again.' };
  }
  if (cause?.code === '42') {
    return { state: 'failed', message: 'The Test Store simulated a failed purchase. No charge was made.' };
  }
  return { state: 'failed', message: "Couldn't complete the purchase. Check the store and try again." };
}

async function defaultAdapter(): Promise<PurchasesAdapter> {
  const module = await import('react-native-purchases');
  return module.default;
}

async function defaultOpenURL(url: string): Promise<void> {
  const { Linking } = await import('react-native');
  await Linking.openURL(url);
}

export function createBillingClient(options: BillingClientOptions) {
  const now = options.now ?? (() => new Date());
  const loadInstallationToken = options.getInstallationToken ?? getInstallationToken;
  const openURL = options.openURL ?? defaultOpenURL;
  let adapterPromise: Promise<PurchasesAdapter> | null = options.purchases
    ? Promise.resolve(options.purchases)
    : null;
  let configurePromise: Promise<string> | null = null;

  function adapter(): Promise<PurchasesAdapter> {
    adapterPromise ??= defaultAdapter();
    return adapterPromise;
  }

  async function configure(): Promise<string> {
    if (!options.apiKey.trim()) throw new Error(BILLING_UNAVAILABLE);
    if (!configurePromise) {
      configurePromise = (async () => {
        const appUserID = await loadInstallationToken();
        (await adapter()).configure({ apiKey: options.apiKey.trim(), appUserID });
        return appUserID;
      })().catch((error) => {
        configurePromise = null;
        throw error;
      });
    }
    return configurePromise;
  }

  async function customerInfo(force = false): Promise<EatlogAccess> {
    try {
      await configure();
      const sdk = await adapter();
      if (force) await sdk.invalidateCustomerInfoCache();
      return normalizeAccess(snapshot(await sdk.getCustomerInfo()), now());
    } catch {
      return noAccessUnavailable(now());
    }
  }

  async function offering(): Promise<BillingOffering | null> {
    try {
      await configure();
      const selected = itikOffering(await (await adapter()).getOfferings());
      return selected
        ? { identifier: EATLOG_OFFERING_ID, packages: selected.availablePackages.map(publicPackage) }
        : null;
    } catch {
      return null;
    }
  }

  async function purchase(packageIdentifier: string, currentAccess: EatlogAccess): Promise<BillingOperationResult> {
    if (currentAccess.kind === 'purchase') {
      return { state: 'success', message: `Eatlog ${TIER_NAMES.itik} is already active.`, access: currentAccess };
    }
    if (!canBuyItik(currentAccess)) {
      return {
        state: 'failed',
        message: `Your ${TIER_NAMES.itik} subscription still renews. Cancel it in the store before buying another option.`,
        access: currentAccess,
      };
    }
    try {
      await configure();
      const sdk = await adapter();
      const selected = itikOffering(await sdk.getOfferings());
      const pkg = selected?.availablePackages.find((item) => item.identifier === packageIdentifier) ?? null;
      if (!pkg) return { state: 'failed', message: "This plan isn't available in this build.", access: currentAccess };
      const result = await sdk.purchasePackage(pkg);
      const access = normalizeAccess(snapshot(result.customerInfo), now());
      if (!hasItik(access, now())) {
        return {
          state: 'entitlement-pending',
          message: 'Purchase complete. Access is still updating. Tap Refresh plan in a moment.',
          access: currentAccess,
        };
      }
      return { state: 'success', message: `Eatlog ${TIER_NAMES.itik} is active.`, access };
    } catch (error) {
      return { ...purchaseFailure(error), access: currentAccess };
    }
  }

  async function restore(currentAccess: EatlogAccess): Promise<BillingOperationResult> {
    try {
      await configure();
      const access = normalizeAccess(snapshot(await (await adapter()).restorePurchases()), now());
      if (access.kind === 'none') {
        return { state: 'no-purchase', message: `No active ${TIER_NAMES.itik} purchase was found on this store account.`, access };
      }
      return { state: 'success', message: `Eatlog ${TIER_NAMES.itik} was restored.`, access };
    } catch {
      return { state: 'failed', message: "Couldn't restore purchases. Check the store account and try again.", access: currentAccess };
    }
  }

  async function manageSubscription(): Promise<BillingActionResult> {
    try {
      await configure();
      const info = await (await adapter()).getCustomerInfo();
      const managementURL = info.managementURL?.trim();
      if (!managementURL) {
        const store = info.entitlements?.all?.[EATLOG_ENTITLEMENT_ID]?.store;
        if (store === 'TEST_STORE') {
          return {
            state: 'failed',
            message: 'Test Store subscriptions have no device settings. They expire automatically during accelerated testing.',
          };
        }
        return { state: 'failed', message: 'No active store subscription settings are available.' };
      }
      await openURL(managementURL);
      return { state: 'success', message: 'Store subscription management opened.' };
    } catch {
      return { state: 'failed', message: "Couldn't open subscription settings. Open the store app and select Subscriptions." };
    }
  }

  async function subscribe(listener: (access: EatlogAccess) => void): Promise<() => void> {
    await configure();
    const sdk = await adapter();
    const handle = (info: CustomerInfo) => listener(normalizeAccess(snapshot(info), now()));
    sdk.addCustomerInfoUpdateListener(handle);
    return () => { sdk.removeCustomerInfoUpdateListener(handle); };
  }

  return { configure, customerInfo, offering, purchase, restore, manageSubscription, subscribe };
}
