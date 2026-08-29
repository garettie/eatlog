import type { EatlogTier } from '../TierBirdIcon';
import type { EatlogAccess, EatlogUsage } from '../../services/billing.types';

export type Access = EatlogAccess;

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function accessName(kind: Access['kind']): string {
  if (kind === 'manok-trial' || kind === 'manok') return 'Monthly';
  if (kind === 'itik') return 'Lifetime';
  if (kind === 'complimentary') return 'Complimentary';
  return 'Free';
}

export function accessTier(kind: Access['kind']): EatlogTier | null {
  if (kind === 'manok-trial' || kind === 'manok') return 'manok';
  if (kind === 'itik') return 'itik';
  if (kind === 'pugo') return 'pugo';
  return null;
}

export function accessDetail(access: Access): string {
  if (access.kind === 'manok-trial' || access.kind === 'manok') {
    if (access.billingState === 'grace') return 'Payment needs attention. Your paid features still work for now.';
    if (!access.expiresAt) return 'Paid features are active.';
    return access.willRenew ? `Renews ${dateLabel(access.expiresAt)}` : `Ends ${dateLabel(access.expiresAt)}`;
  }
  if (access.kind === 'itik') {
    return `Yours for good${access.purchasedAt ? ` · Bought ${dateLabel(access.purchasedAt)}` : ''}`;
  }
  if (access.kind === 'complimentary') {
    return access.expiresAt ? `Available until ${dateLabel(access.expiresAt)}` : 'Yours for good, courtesy of Eatlog.';
  }
  if (access.reason === 'expired') return 'Paid access ended. Your logbook is untouched.';
  if (access.reason === 'revoked') return 'Paid access was removed. Your logbook is untouched.';
  if (access.reason === 'malformed' || access.reason === 'unavailable') {
    return "We couldn't confirm a purchase. Free logging and estimates still work.";
  }
  return 'Free logging plus 5 AI estimates per rolling 24 hours.';
}

/** The line a blocked Pugo user needs first: when their next free estimate arrives. */
export function quotaResetLabel(usage: EatlogUsage): string | null {
  if (usage.kind === 'free') {
    return usage.nextEligibleAt ? `Your next free estimate unlocks at ${timeLabel(usage.nextEligibleAt)}.` : null;
  }
  if (usage.kind === 'trial') {
    const next = usage.nextInitialEligibleAt ?? usage.nextClarificationEligibleAt;
    return next ? `Your next request unlocks at ${timeLabel(next)}.` : null;
  }
  if (usage.kind === 'paid') {
    return usage.nextEligibleAt ? `Your next request unlocks at ${timeLabel(usage.nextEligibleAt)}.` : null;
  }
  return null;
}
