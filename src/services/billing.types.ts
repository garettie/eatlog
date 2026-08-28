export const EATLOG_ENTITLEMENT_ID = 'eatlog_paid';
export const EATLOG_OFFERING_ID = 'default';
export const MANOK_PRODUCT_IDS = ['eatlog_manok', 'eatlog_manok:monthly', 'eatlog_manok_monthly'] as const;
export const ITIK_PRODUCT_ID = 'eatlog_itik';

export type AccessReason =
  | 'none'
  | 'unavailable'
  | 'malformed'
  | 'expired'
  | 'revoked';

interface AccessBase {
  checkedAt: string;
}

export type EatlogAccess =
  | (AccessBase & { kind: 'pugo'; reason?: AccessReason })
  | (AccessBase & {
      kind: 'manok-trial';
      expiresAt: string;
      willRenew: boolean;
      productId: string;
      billingState: 'active' | 'grace';
    })
  | (AccessBase & {
      kind: 'manok';
      expiresAt: string | null;
      willRenew: boolean;
      productId: string;
      billingState: 'active' | 'grace';
    })
  | (AccessBase & {
      kind: 'itik';
      productId: string;
      purchasedAt: string | null;
    })
  | (AccessBase & {
      kind: 'complimentary';
      expiresAt: string | null;
    });

export interface RevenueCatEntitlementSnapshot {
  identifier?: unknown;
  isActive?: unknown;
  willRenew?: unknown;
  periodType?: unknown;
  latestPurchaseDate?: unknown;
  expirationDate?: unknown;
  store?: unknown;
  productIdentifier?: unknown;
  billingIssueDetectedAt?: unknown;
}

export interface RevenueCatCustomerSnapshot {
  requestDate?: unknown;
  entitlement?: RevenueCatEntitlementSnapshot | null;
}

export interface BillingProduct {
  tier: 'manok' | 'itik';
  packageIdentifier: string;
  productIdentifier: string;
  priceString: string;
  trialEligible: boolean;
}

export interface BillingOffering {
  identifier: typeof EATLOG_OFFERING_ID;
  manok: BillingProduct | null;
  itik: BillingProduct | null;
}

export interface FreeUsage {
  remaining24Hours: number;
  nextEligibleAt: string | null;
}

export interface TrialUsage {
  initialRemaining24Hours: number;
  initialRemainingTrial: number;
  clarificationRemaining24Hours: number;
  clarificationRemainingTrial: number;
  nextInitialEligibleAt: string | null;
  nextClarificationEligibleAt: string | null;
}

export interface PaidUsage {
  remaining24Hours: number;
  remaining30Days: number;
  nextEligibleAt: string | null;
}

export type EatlogUsage =
  | { kind: 'none' }
  | ({ kind: 'free' } & FreeUsage)
  | ({ kind: 'trial' } & TrialUsage)
  | ({ kind: 'paid' } & PaidUsage);

export type BillingActionState =
  | 'success'
  | 'cancelled'
  | 'pending'
  | 'failed'
  | 'entitlement-pending'
  | 'no-purchase';

export interface BillingActionResult {
  state: BillingActionState;
  message: string;
}

export type EntitlementStatus = 'checking' | 'free' | 'paid';
export type PaidAccessDecision = 'paid' | 'free' | 'unavailable';

export const PAID_ACCESS_UNAVAILABLE_MESSAGE = "Couldn't verify your plan. Check your connection and try again.";

function iso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function checkedAt(snapshot: RevenueCatCustomerSnapshot, now: Date): string {
  return iso(snapshot.requestDate) ?? now.toISOString();
}

function isManokProduct(value: string): boolean {
  return (MANOK_PRODUCT_IDS as readonly string[]).includes(value);
}

export function hasPaidFeatures(access: EatlogAccess, now = new Date()): boolean {
  if (access.kind === 'pugo') return false;
  const expiry = accessExpiresAt(access);
  return expiry === null || Date.parse(expiry) > now.getTime();
}

export function entitlementStatus(access: EatlogAccess | null, now = new Date()): EntitlementStatus {
  if (access === null) return 'checking';
  if (access.kind === 'pugo') {
    return access.reason === 'unavailable' || access.reason === 'malformed' ? 'checking' : 'free';
  }
  return hasPaidFeatures(access, now) ? 'paid' : 'checking';
}

export function canBuyItik(access: EatlogAccess): boolean {
  return access.kind !== 'itik' && (access.kind !== 'manok' && access.kind !== 'manok-trial' || !access.willRenew);
}

function accessExpiresAt(access: EatlogAccess): string | null {
  if (access.kind === 'manok' || access.kind === 'manok-trial' || access.kind === 'complimentary') {
    return access.expiresAt;
  }
  return null;
}

export function shouldApplyAccessUpdate(
  current: EatlogAccess | null,
  next: EatlogAccess,
  now = new Date(),
): boolean {
  const nextCheckedAt = Date.parse(next.checkedAt);
  if (!Number.isFinite(nextCheckedAt)) return false;
  const transient = next.kind === 'pugo'
    && (next.reason === 'unavailable' || next.reason === 'malformed');
  if (current === null) return !transient;

  const currentCheckedAt = Date.parse(current.checkedAt);
  if (Number.isFinite(currentCheckedAt) && nextCheckedAt < currentCheckedAt) return false;

  if (transient) {
    const expiry = accessExpiresAt(current);
    return current.kind !== 'pugo' && expiry !== null && Date.parse(expiry) <= now.getTime();
  }
  return true;
}

export function normalizeAccess(
  snapshot: RevenueCatCustomerSnapshot | null | undefined,
  now = new Date(),
): EatlogAccess {
  if (!snapshot || typeof snapshot !== 'object') {
    return { kind: 'pugo', checkedAt: now.toISOString(), reason: 'unavailable' };
  }
  const checked = checkedAt(snapshot, now);
  const entitlement = snapshot.entitlement;
  if (!entitlement || typeof entitlement !== 'object') {
    return { kind: 'pugo', checkedAt: checked, reason: 'none' };
  }
  if (entitlement.identifier !== EATLOG_ENTITLEMENT_ID
    || typeof entitlement.isActive !== 'boolean'
    || typeof entitlement.productIdentifier !== 'string') {
    return { kind: 'pugo', checkedAt: checked, reason: 'malformed' };
  }
  const productId = entitlement.productIdentifier;
  const expiry = entitlement.expirationDate == null ? null : iso(entitlement.expirationDate);
  if (entitlement.expirationDate != null && !expiry) {
    return { kind: 'pugo', checkedAt: checked, reason: 'malformed' };
  }
  if (expiry && new Date(expiry).getTime() <= now.getTime()) {
    return { kind: 'pugo', checkedAt: checked, reason: 'expired' };
  }
  if (!entitlement.isActive) {
    return { kind: 'pugo', checkedAt: checked, reason: 'revoked' };
  }

  if (productId === ITIK_PRODUCT_ID) {
    if (expiry !== null) return { kind: 'pugo', checkedAt: checked, reason: 'malformed' };
    return {
      kind: 'itik',
      productId,
      purchasedAt: iso(entitlement.latestPurchaseDate),
      checkedAt: checked,
    };
  }
  if (entitlement.store === 'PROMOTIONAL') {
    return { kind: 'complimentary', expiresAt: expiry, checkedAt: checked };
  }
  if (!isManokProduct(productId) || typeof entitlement.willRenew !== 'boolean') {
    return { kind: 'pugo', checkedAt: checked, reason: 'malformed' };
  }
  if (!expiry) return { kind: 'pugo', checkedAt: checked, reason: 'malformed' };
  const billingState = entitlement.billingIssueDetectedAt == null ? 'active' : 'grace';
  if (entitlement.periodType === 'TRIAL') {
    return {
      kind: 'manok-trial',
      expiresAt: expiry,
      willRenew: entitlement.willRenew,
      productId,
      checkedAt: checked,
      billingState,
    };
  }
  if (entitlement.periodType !== 'NORMAL' && entitlement.periodType !== 'INTRO') {
    return { kind: 'pugo', checkedAt: checked, reason: 'malformed' };
  }
  return {
    kind: 'manok',
    expiresAt: expiry,
    willRenew: entitlement.willRenew,
    productId,
    checkedAt: checked,
    billingState,
  };
}
