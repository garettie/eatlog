/**
 * Build-time service configuration. URL is public and intentionally absent by
 * default; developers inject it through the Expo build environment.
 *
 * Expo requires static dot-notation references to inline EXPO_PUBLIC values.
 */
import {
  buildOpenFoodFactsUserAgent,
  normalizePublicHttpsUrl,
  normalizeSupportEmail,
} from '../services/publicReleaseConfig';

const appVersion = (require('../../app.json') as { expo: { version: string } }).expo.version;
const foodWorkerUrl = process.env.EXPO_PUBLIC_FOOD_WORKER_URL?.trim().replace(/\/$/, '') ?? '';
const supportEmail = normalizeSupportEmail(process.env.EXPO_PUBLIC_SUPPORT_EMAIL);
const openFoodFactsUserAgent = buildOpenFoodFactsUserAgent(appVersion, supportEmail);
const privacyPolicyUrl = normalizePublicHttpsUrl(process.env.EXPO_PUBLIC_PRIVACY_URL);
const supportUrl = normalizePublicHttpsUrl(process.env.EXPO_PUBLIC_SUPPORT_URL);

export const serviceConfig = {
  appVersion,
  foodWorkerUrl,
  openFoodFactsUserAgent,
  publicLinks: {
    privacyPolicyUrl,
    supportUrl,
  },
  availability: {
    gemini: foodWorkerUrl.length > 0,
    usda: foodWorkerUrl.length > 0,
    openFoodFacts: openFoodFactsUserAgent !== null,
  },
} as const;
