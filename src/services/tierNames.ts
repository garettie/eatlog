import type { Tier } from './userApiKey';

/**
 * Every place the app shows a plan by name reads it from here, so renaming a plan is a change
 * to this module. There are two plans: free is plain Eatlog whether or not a Google key is
 * added, because the key is an AI setting rather than a plan.
 */
export const PAID_PLAN_NAME = 'Omelette';

export function planName(tier: Tier): string {
  return tier === 'itik' ? `Eatlog ${PAID_PLAN_NAME}` : 'Eatlog';
}
