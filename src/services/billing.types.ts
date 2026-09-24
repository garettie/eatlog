export const EATLOG_ENTITLEMENT_ID = 'eatlog_paid';
export const EATLOG_OFFERING_ID = 'itik';

export type AccessReason =
  | 'none'
  | 'unavailable'
  | 'malformed'
  | 'expired'
  | 'revoked';

interface AccessBase {
  checkedAt: string;
}

/**
 * Every active `eatlog_paid` entitlement is Itik. The kind records how it was obtained, read
 * from the shape of the entitlement rather than from product identifiers, matching the Worker,
 * so a new Itik product or cadence needs no app change.
 */
export type EatlogAccess =
  | (AccessBase & { kind: 'none'; reason?: AccessReason })
  | (AccessBase & {
      kind: 'subscription';
      expiresAt: string;
      willRenew: boolean;
      productId: string;
      billingState: 'active' | 'grace';
      trial: boolean;
    })
  | (AccessBase & {
      kind: 'purchase';
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

export interface BillingPackage {
  packageIdentifier: string;
  productIdentifier: string;
  priceString: string;
  /** The store's billing period in ISO 8601, such as `P1M`, or null for a one-time purchase. */
  period: string | null;
  /** The length of a free trial the store offers this user, in ISO 8601, or null for none. */
  freeTrial: string | null;
}

export interface BillingOffering {
  identifier: typeof EATLOG_OFFERING_ID;
  packages: BillingPackage[];
}

export interface PaidUsage {
  remaining24Hours: number;
  remaining30Days: number;
  nextEligibleAt: string | null;
}

export type EatlogUsage =
  | { kind: 'none' }
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

export function hasItik(access: EatlogAccess, now = new Date()): boolean {
  if (access.kind === 'none') return false;
  const expiry = accessExpiresAt(access);
  return expiry === null || Date.parse(expiry) > now.getTime();
}

export function entitlementStatus(access: EatlogAccess | null, now = new Date()): EntitlementStatus {
  if (access === null) return 'checking';
  if (access.kind === 'none') {
    return access.reason === 'unavailable' || access.reason === 'malformed' ? 'checking' : 'free';
  }
  return hasItik(access, now) ? 'paid' : 'checking';
}

/** How close to expiry a paid plan must be before automatic re-verification resumes. */
export const PAID_REVERIFY_MARGIN_MS = 24 * 60 * 60 * 1000;

/**
 * True when the stored plan is paid and its expiry is far enough away that asking again
 * proves nothing. A subscription is settled by the date it carries, so the only automatic
 * reasons to re-verify are that date approaching or the store pushing a change.
 */
export function paidAndSettled(access: EatlogAccess | null, now = new Date()): boolean {
  if (access === null || !hasItik(access, now)) return false;
  const expiry = accessExpiresAt(access);
  return expiry === null || Date.parse(expiry) - now.getTime() > PAID_REVERIFY_MARGIN_MS;
}

/**
 * True when a stored plan must be re-resolved before it is allowed to deny a paid feature.
 * A restored snapshot is last session's answer: trusting it to say no would paywall a lapsed
 * subscriber who resubscribed, or someone who bought on another device.
 */
export function needsRevalidation(
  access: EatlogAccess | null,
  confirmedThisSession: boolean,
  now = new Date(),
): boolean {
  return !confirmedThisSession || entitlementStatus(access, now) === 'checking';
}

/**
 * The double-payment guard: a one-time purchase already covers Itik, and a subscription that
 * still renews would keep charging beside a second product. A cancelled subscription or a
 * complimentary grant can still buy.
 */
export function canBuyItik(access: EatlogAccess): boolean {
  if (access.kind === 'purchase') return false;
  return access.kind !== 'subscription' || !access.willRenew;
}

function accessExpiresAt(access: EatlogAccess): string | null {
  if (access.kind === 'subscription' || access.kind === 'complimentary') return access.expiresAt;
  return null;
}

export function shouldApplyAccessUpdate(
  current: EatlogAccess | null,
  next: EatlogAccess,
  now = new Date(),
): boolean {
  const nextCheckedAt = Date.parse(next.checkedAt);
  if (!Number.isFinite(nextCheckedAt)) return false;
  const transient = next.kind === 'none'
    && (next.reason === 'unavailable' || next.reason === 'malformed');
  if (current === null) return !transient;

  const currentCheckedAt = Date.parse(current.checkedAt);
  if (Number.isFinite(currentCheckedAt) && nextCheckedAt < currentCheckedAt) return false;

  if (transient) {
    const expiry = accessExpiresAt(current);
    return current.kind !== 'none' && expiry !== null && Date.parse(expiry) <= now.getTime();
  }
  return true;
}

export function normalizeAccess(
  snapshot: RevenueCatCustomerSnapshot | null | undefined,
  now = new Date(),
): EatlogAccess {
  if (!snapshot || typeof snapshot !== 'object') {
    return { kind: 'none', checkedAt: now.toISOString(), reason: 'unavailable' };
  }
  const checked = checkedAt(snapshot, now);
  const entitlement = snapshot.entitlement;
  if (!entitlement || typeof entitlement !== 'object') {
    return { kind: 'none', checkedAt: checked, reason: 'none' };
  }
  if (entitlement.identifier !== EATLOG_ENTITLEMENT_ID
    || typeof entitlement.isActive !== 'boolean'
    || typeof entitlement.productIdentifier !== 'string') {
    return { kind: 'none', checkedAt: checked, reason: 'malformed' };
  }
  const productId = entitlement.productIdentifier;
  const expiry = entitlement.expirationDate == null ? null : iso(entitlement.expirationDate);
  if (entitlement.expirationDate != null && !expiry) {
    return { kind: 'none', checkedAt: checked, reason: 'malformed' };
  }
  if (expiry && new Date(expiry).getTime() <= now.getTime()) {
    return { kind: 'none', checkedAt: checked, reason: 'expired' };
  }
  if (!entitlement.isActive) {
    return { kind: 'none', checkedAt: checked, reason: 'revoked' };
  }

  if (entitlement.store === 'PROMOTIONAL') {
    return { kind: 'complimentary', expiresAt: expiry, checkedAt: checked };
  }
  if (expiry === null) {
    return {
      kind: 'purchase',
      productId,
      purchasedAt: iso(entitlement.latestPurchaseDate),
      checkedAt: checked,
    };
  }
  if (typeof entitlement.willRenew !== 'boolean'
    || (entitlement.periodType !== 'TRIAL' && entitlement.periodType !== 'NORMAL' && entitlement.periodType !== 'INTRO')) {
    return { kind: 'none', checkedAt: checked, reason: 'malformed' };
  }
  return {
    kind: 'subscription',
    expiresAt: expiry,
    willRenew: entitlement.willRenew,
    productId,
    checkedAt: checked,
    billingState: entitlement.billingIssueDetectedAt == null ? 'active' : 'grace',
    trial: entitlement.periodType === 'TRIAL',
  };
}
