/**
 * Build-time provider configuration. Values are intentionally absent by
 * default; developers inject them through the Expo build environment.
 */
function buildValue(name: 'EXPO_PUBLIC_GEMINI_API_KEY' | 'EXPO_PUBLIC_USDA_API_KEY'): string {
  return process.env[name]?.trim() ?? '';
}

const geminiApiKey = buildValue('EXPO_PUBLIC_GEMINI_API_KEY');
const usdaApiKey = buildValue('EXPO_PUBLIC_USDA_API_KEY');

export const serviceConfig = {
  geminiApiKey,
  usdaApiKey,
  availability: {
    gemini: geminiApiKey.length > 0,
    usda: usdaApiKey.length > 0,
    openFoodFacts: true,
  },
} as const;
