export const GEMINI_ORIGIN = 'https://generativelanguage.googleapis.com';

export function geminiGenerateUrl(model: string, apiKey: string): string {
  return `${GEMINI_ORIGIN}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}
