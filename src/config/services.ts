/**
 * Build-time service configuration. URL is public and intentionally absent by
 * default; developers inject it through the Expo build environment.
 *
 * Expo requires static dot-notation references to inline EXPO_PUBLIC values.
 */
const foodWorkerUrl = process.env.EXPO_PUBLIC_FOOD_WORKER_URL?.trim().replace(/\/$/, '') ?? '';

export const serviceConfig = {
  foodWorkerUrl,
  availability: {
    gemini: foodWorkerUrl.length > 0,
    usda: foodWorkerUrl.length > 0,
    openFoodFacts: true,
  },
} as const;
