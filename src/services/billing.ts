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
  ITIK_PRODUCT_ID,
  MANOK_PRODUCT_IDS,
  normalizeAccess,
  type BillingActionResult,
  type BillingOffering,
  type EatlogAccess,
  type RevenueCatCustomerSnapshot,
} from './billing.types';

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

const PUGO_UNAVAILABLE = 'Billing is unavailable on this installed build. Eatlog Pugo remains available.';

function snapshot(info: CustomerInfo): RevenueCatCustomerSnapshot {
  return {
    requestDate: info.requestDate,
    entitlement: info.entitlements?.all?.[EATLOG_ENTITLEMENT_ID] ?? null,
  };
}

function pugoUnavailable(now: Date): EatlogAccess {
  return { kind: 'pugo', checkedAt: now.toISOString(), reason: 'unavailable' };
}

function isManokProduct(productId: string): boolean {
  return (MANOK_PRODUCT_IDS as readonly string[]).includes(productId);
}

function packageFor(offering: PurchasesOffering, tier: 'manok' | 'itik'): PurchasesPackage | null {
  const preferred = tier === 'manok' ? offering.monthly : offering.lifetime;
  if (preferred) return preferred;
  return offering.availablePackages.find((item) => tier === 'itik'
    ? item.product.identifier === ITIK_PRODUCT_ID
    : isManokProduct(item.product.identifier)) ?? null;
}

function trialEligible(pkg: PurchasesPackage): boolean {
  return pkg.product.defaultOption?.freePhase != null || pkg.product.introPrice?.price === 0;
}

function publicOffering(offering: PurchasesOffering): BillingOffering {
  const manok = packageFor(offering, 'manok');
  const itik = packageFor(offering, 'itik');
  return {
    identifier: EATLOG_OFFERING_ID,
    manok: manok ? {
      tier: 'manok',
      packageIdentifier: manok.identifier,
      productIdentifier: manok.product.identifier,
      priceString: manok.product.priceString,
      trialEligible: trialEligible(manok),
    } : null,
    itik: itik ? {
      tier: 'itik',
      packageIdentifier: itik.identifier,
      productIdentifier: itik.product.identifier,
      priceString: itik.product.priceString,
      trialEligible: false,
    } : null,
  };
}

function purchaseFailure(error: unknown): BillingActionResult {
  const cause = error as Partial<PurchasesError> | null;
  if (cause?.code === '1' || cause?.userCancelled === true) {
    return { state: 'cancelled', message: 'Purchase canceled. You still have Eatlog Pugo.' };
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
    if (!options.apiKey.trim()) throw new Error(PUGO_UNAVAILABLE);
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
      return pugoUnavailable(now());
    }
  }

  async function offering(): Promise<BillingOffering | null> {
    try {
      await configure();
      const offerings = await (await adapter()).getOfferings();
      const selected = offerings.all[EATLOG_OFFERING_ID]
        ?? (offerings.current?.identifier === EATLOG_OFFERING_ID ? offerings.current : null);
      return selected ? publicOffering(selected) : null;
    } catch {
      return null;
    }
  }

  async function purchase(tier: 'manok' | 'itik', currentAccess: EatlogAccess): Promise<BillingOperationResult> {
    if (tier === 'itik' && currentAccess.kind === 'itik') {
      return { state: 'success', message: 'Eatlog Itik is already active.', access: currentAccess };
    }
    if (tier === 'itik' && !canBuyItik(currentAccess)) {
      return {
        state: 'failed',
        message: "Cancel Manok before buying Itik. The store won't refund unused Manok time.",
        access: currentAccess,
      };
    }
    try {
      await configure();
      const sdk = await adapter();
      const offerings = await sdk.getOfferings();
      const selected = offerings.all[EATLOG_OFFERING_ID]
        ?? (offerings.current?.identifier === EATLOG_OFFERING_ID ? offerings.current : null);
      const pkg = selected ? packageFor(selected, tier) : null;
      if (!pkg) return { state: 'failed', message: "This plan isn't available in this build.", access: currentAccess };
      const result = await sdk.purchasePackage(pkg);
      const access = normalizeAccess(snapshot(result.customerInfo), now());
      if (access.kind === 'pugo') {
        return {
          state: 'entitlement-pending',
          message: 'Purchase complete. Access is still updating. Tap Refresh plan in a moment.',
          access,
        };
      }
      return { state: 'success', message: `${access.kind === 'itik' ? 'Eatlog Itik' : 'Eatlog Manok'} is active.`, access };
    } catch (error) {
      return { ...purchaseFailure(error), access: currentAccess };
    }
  }

  async function restore(currentAccess: EatlogAccess): Promise<BillingOperationResult> {
    try {
      await configure();
      const access = normalizeAccess(snapshot(await (await adapter()).restorePurchases()), now());
      if (access.kind === 'pugo') {
        return { state: 'no-purchase', message: 'No active Manok or Itik purchase was found on this store account.', access };
      }
      return { state: 'success', message: `${access.kind === 'itik' ? 'Eatlog Itik' : 'Paid access'} was restored.`, access };
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
