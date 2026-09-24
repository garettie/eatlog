import type { Tier } from './userApiKey';

/**
 * Every place the app shows a tier by name reads it from here, so renaming the tiers is a
 * change to this one table.
 */
export const TIER_NAMES: Record<Tier, string> = {
  pugo: 'Pugo',
  manok: 'Manok',
  itik: 'Itik',
};
