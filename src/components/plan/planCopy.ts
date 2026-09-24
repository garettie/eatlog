import type { BillingPackage, EatlogAccess } from '../../services/billing.types';
import { TIER_NAMES } from '../../services/tierNames';
import type { Tier } from '../../services/userApiKey';

export type Access = EatlogAccess;

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const UNIT_NAMES = { D: 'day', W: 'week', M: 'month', Y: 'year' } as const;

/** Reads a whole ISO 8601 period such as `P1M` or `P7D`; anything else is null. */
function parsePeriod(value: string): { count: number; unit: string } | null {
  const match = /^P(\d+)([DWMY])$/.exec(value);
  if (!match) return null;
  return { count: Number(match[1]), unit: UNIT_NAMES[match[2] as keyof typeof UNIT_NAMES] };
}

function duration(value: string): string | null {
  const period = parsePeriod(value);
  if (!period) return null;
  return `${period.count} ${period.unit}${period.count === 1 ? '' : 's'}`;
}

/** The price as the store bills it: `₱799 once`, `₱79 / month`, `₱499 / 3 months`. */
export function packagePrice(item: BillingPackage): string {
  if (item.period === null) return `${item.priceString} once`;
  const period = parsePeriod(item.period);
  if (!period) return item.priceString;
  return `${item.priceString} / ${period.count === 1 ? period.unit : `${period.count} ${period.unit}s`}`;
}

export function packageCadence(item: BillingPackage): string {
  if (item.period === null) return 'One-time purchase';
  const period = parsePeriod(item.period);
  if (period?.count === 1) return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[period.unit] ?? 'Subscription';
  return 'Subscription';
}

/** `1 month free`, only when the store offers this user a trial. */
export function packageTrial(item: BillingPackage): string | null {
  const length = item.freeTrial ? duration(item.freeTrial) : null;
  return length ? `${length} free` : null;
}

export function packageDescription(item: BillingPackage): string {
  if (item.period === null) return 'One payment. No renewal.';
  const trial = packageTrial(item);
  if (trial) return `${trial}, then ${packagePrice(item)} until canceled.`;
  return 'Renews until canceled.';
}

/**
 * The line under the tier on the Plan screen. It states what the entitlement is and when it
 * ends, never a promise the store terms do not make.
 */
export function accessDetail(access: Access, tier: Tier): string {
  if (access.kind === 'subscription') {
    if (access.billingState === 'grace') return 'Payment needs attention. Eatlog AI still works for now.';
    const ends = `${access.willRenew ? 'Renews' : 'Ends'} ${dateLabel(access.expiresAt)}`;
    return access.trial ? `Free trial · ${ends}` : ends;
  }
  if (access.kind === 'purchase') {
    return access.purchasedAt ? `Bought ${dateLabel(access.purchasedAt)}` : 'One-time purchase';
  }
  if (access.kind === 'complimentary') {
    return access.expiresAt ? `Available until ${dateLabel(access.expiresAt)}` : 'Courtesy of Eatlog.';
  }
  if (access.reason === 'expired') return `${TIER_NAMES.itik} ended. Your logbook is untouched.`;
  if (access.reason === 'revoked') return `${TIER_NAMES.itik} was removed. Your logbook is untouched.`;
  if (access.reason === 'malformed' || access.reason === 'unavailable') {
    return "We couldn't confirm a purchase. Your logbook still works.";
  }
  return tier === 'manok' ? 'AI estimates on your own Google key.' : 'Everything but AI estimates.';
}
