import type { BillingPackage, EatlogAccess } from '../../services/billing.types';
import { PAID_PLAN_NAME } from '../../services/tierNames';
import type { Tier } from '../../services/userApiKey';

export type Access = EatlogAccess;

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The localized store price for the one-time product. */
export function packagePrice(item: BillingPackage): string {
  return `${item.priceString} once`;
}

export function packageCadence(_item: BillingPackage): string {
  return 'One-time purchase';
}

export function packageDescription(_item: BillingPackage): string {
  return 'One payment. No renewal. Hosted AI has fair-use limits.';
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
  if (access.reason === 'expired') return `${PAID_PLAN_NAME} ended. Your logbook is untouched.`;
  if (access.reason === 'revoked') return `${PAID_PLAN_NAME} was removed. Your logbook is untouched.`;
  if (access.reason === 'malformed' || access.reason === 'unavailable') {
    return "We couldn't confirm a purchase. Your logbook still works.";
  }
  return tier === 'manok'
    ? 'Free Eatlog. AI estimates use your Google key.'
    : 'Free Eatlog. Add a Google key if you want AI estimates.';
}
