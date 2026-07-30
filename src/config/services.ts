/**
 * Build-time provider configuration. Values are intentionally absent by
 * default; developers inject them through the Expo build environment.
 *
 * Expo requires static dot-notation references to inline EXPO_PUBLIC values.
 */
const geminiApiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() ?? '';
const usdaApiKey = process.env.EXPO_PUBLIC_USDA_API_KEY?.trim() ?? '';

export const serviceConfig = {
  geminiApiKey,
  usdaApiKey,
  availability: {
    gemini: geminiApiKey.length > 0,
    usda: usdaApiKey.length > 0,
    openFoodFacts: true,
  },
} as const;
