import { FOOD_ESTIMATE_SYSTEM_INSTRUCTION, promptFor, type EstimateInput } from './foodEstimateCore';

/**
 * How an estimate is asked of Gemini and how its reply is read back, shared by Eatlog AI (the
 * Worker, with the owner's key) and My key (the app, with the user's). Who authenticates the
 * call, and where it leaves from, stays with each route.
 */

export const GEMINI_ORIGIN = 'https://generativelanguage.googleapis.com';

// gemini-3.5-flash-lite is returning 503 "experiencing high demand" and, when it does answer,
// takes 30-60s for a request its sibling serves in 3-7s. It leads the list again once Google's
// capacity recovers; until then it is the fallback rather than the first call.
export const GEMINI_ESTIMATE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'] as const;

/** The least one model attempt is given, so a hung model cannot leave the next one unreachable. */
export const GEMINI_MODEL_FLOOR_MS = 9000;
const GEMINI_MAX_OUTPUT_TOKENS = 2048;
/** Google's limit on a whole generateContent request carrying inline image data. */
export const GEMINI_MAX_REQUEST_BYTES = 20 * 1024 * 1024;

/** The URL of one model's generateContent method. The key never goes in it. */
export function geminiModelUrl(model: string): string {
  return `${GEMINI_ORIGIN}/v1beta/models/${model}:generateContent`;
}

const FOOD_COMPONENT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Ingredient-level food or addition. A labeled product or explicit component clarification may remain one item; never return a parent dish plus children.' },
    estimatedGrams: { type: 'number', description: 'Total edible grams represented by this component in the entire stated or pictured food, before share selection.' },
    servingSizeGrams: { type: 'number', nullable: true, description: 'Grams per practical unit, or null.' },
    caloriesPer100g: { type: 'number' },
    proteinPer100g: { type: 'number' },
    carbsPer100g: { type: 'number' },
    fatPer100g: { type: 'number' },
    brand: { type: 'string', nullable: true },
    preparation: { type: 'string', nullable: true },
    servingLabel: { type: 'string', nullable: true, description: 'Label for exactly one practical unit matching servingSizeGrams, or null.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    confidenceReason: { type: 'string', nullable: true, description: 'Required concise uncertainty when confidence is low.' },
  },
  required: [
    'name', 'estimatedGrams', 'servingSizeGrams', 'caloriesPer100g', 'proteinPer100g',
    'carbsPer100g', 'fatPer100g', 'brand', 'preparation', 'servingLabel', 'confidence',
    'confidenceReason',
  ],
} as const;

export const FOOD_ESTIMATE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['recognized', 'unrecognized'] },
    unrecognizedReason: { type: 'string', nullable: true },
    mealName: { type: 'string', nullable: true, description: 'Overall meal label; null when unrecognized.' },
    servesTotal: { type: 'number', nullable: true, description: 'Countable portions the whole food divides into, or null.' },
    servingUnit: { type: 'string', nullable: true, description: 'Singular name of one portion; null when servesTotal is null.' },
    // Gemini rejects maxItems for these models; normalizeFoodEstimate enforces the cap.
    components: { type: 'array', description: 'Complete nonduplicated material ingredient breakdown; empty when unrecognized.', items: FOOD_COMPONENT_SCHEMA },
  },
  required: ['status', 'unrecognizedReason', 'mealName', 'servesTotal', 'servingUnit', 'components'],
} as const;

/** The generateContent body for one estimate. Identical for every model in the fallback list. */
export function buildGeminiEstimateBody(input: EstimateInput): string {
  const parts: Array<Record<string, unknown>> = [{ text: promptFor(input) }];
  if (input.imageBase64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: input.imageBase64 } });
  return JSON.stringify({
    systemInstruction: { parts: [{ text: FOOD_ESTIMATE_SYSTEM_INSTRUCTION }] },
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: FOOD_ESTIMATE_SCHEMA,
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    },
  });
}

/**
 * How long one model may take. A model that hangs rather than erroring would otherwise spend
 * the entire budget by itself and leave the fallbacks unreachable, so hold back a floor for
 * each model still to try.
 */
export function attemptBudget(remaining: number, modelsLeft: number): number {
  return Math.min(remaining, Math.max(GEMINI_MODEL_FLOOR_MS, remaining - modelsLeft * GEMINI_MODEL_FLOOR_MS));
}

/**
 * The answer text, joined across every part the model emitted for it.
 *
 * Reading only the first part discarded a reply the model happened to split in two, and
 * discarded any reply whose first part was a thought — both of them complete answers that were
 * paid for, thrown away, and then paid for again on the fallback model.
 */
export function candidateText(candidate: unknown): string | null {
  const parts = (candidate as { content?: { parts?: unknown } } | null)?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .filter((part) => part && typeof part === 'object' && (part as { thought?: unknown }).thought !== true)
    .map((part) => (part as { text?: unknown }).text)
    .filter((value): value is string => typeof value === 'string')
    .join('');
  return text === '' ? null : text;
}

/** A refusal, as opposed to a truncation or a malformed reply. Retrying it changes nothing. */
export function blockedFinish(reason: unknown): boolean {
  return typeof reason === 'string'
    && ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'RECITATION', 'SPII'].includes(reason.toUpperCase());
}
