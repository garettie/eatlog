import { GEMINI_API_KEY } from '../config/api';
import { FoodResult } from './foodSearch';
import { getCachedFood } from '../db/database';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] as const;

const LABEL_SCHEMA = {
  type: 'object' as const,
  properties: {
    name: { type: 'string' as const, description: 'Product/food name from label or visible food' },
    brand: { type: 'string' as const, nullable: true, description: 'Brand name if visible on packaging' },
    servingSizeGrams: { type: 'number' as const, nullable: true, description: 'Serving size in grams (weight of one serving)' },
    servingLabel: { type: 'string' as const, nullable: true, description: 'Serving description, e.g. "1 bar (55g)"' },
    caloriesPer100g: { type: 'number' as const, description: 'Calories (kcal) per 100 grams' },
    proteinPer100g: { type: 'number' as const, description: 'Protein in grams per 100g' },
    carbsPer100g: { type: 'number' as const, description: 'Carbohydrates in grams per 100g' },
    fatPer100g: { type: 'number' as const, description: 'Fat in grams per 100g' },
  },
  required: ['name', 'caloriesPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g'],
};

const DESCRIBE_SCHEMA = {
  type: 'object' as const,
  properties: {
    mealName: { type: 'string' as const, description: 'Short descriptive name for the meal' },
    components: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const, description: 'Ingredient/food name' },
          estimatedGrams: { type: 'number' as const, description: 'Estimated weight of this component in grams for the described portion' },
          caloriesPer100g: { type: 'number' as const, description: 'Calories per 100g' },
          proteinPer100g: { type: 'number' as const, description: 'Protein in grams per 100g' },
          carbsPer100g: { type: 'number' as const, description: 'Carbs in grams per 100g' },
          fatPer100g: { type: 'number' as const, description: 'Fat in grams per 100g' },
          brand: { type: 'string' as const, nullable: true },
          preparation: { type: 'string' as const, nullable: true, description: 'e.g. grilled, raw, boiled' },
          servingLabel: { type: 'string' as const, nullable: true, description: 'e.g. 1 cup (158g)' },
        },
        required: ['name', 'estimatedGrams', 'caloriesPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g'],
      },
    },
  },
  required: ['mealName', 'components'],
};

interface ScanResult {
  name: string;
  brand: string | null;
  servingSizeGrams: number | null;
  servingLabel: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

interface DescribeResponse {
  mealName: string;
  components: {
    name: string;
    estimatedGrams: number;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
    brand?: string | null;
    preparation?: string | null;
    servingLabel?: string | null;
  }[];
}

function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(s.length, 1024); i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
}

async function callGeminiText<T>(model: string, prompt: string, schema: any): Promise<T | null> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.1,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    return JSON.parse(text) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGeminiVision(model: string, base64Image: string): Promise<ScanResult | null> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{
      parts: [
        {
          text: 'Extract nutritional information from this food photo. If the image shows a nutrition label, read the exact numbers from it. If the image shows actual food (fruit, meal, etc.), estimate the macros. Return all values per 100 grams. Use the precise numbers from the label if visible, not estimates.',
        },
        {
          inlineData: { mimeType: 'image/jpeg', data: base64Image },
        },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: LABEL_SCHEMA,
      temperature: 0.1,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as ScanResult;
    if (!parsed.name || parsed.caloriesPer100g == null) return null;

    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeScanName(name: string): string {
  const lowered = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return lowered.replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

export async function scanFood(imageBase64: string): Promise<FoodResult | null> {
  if (!GEMINI_API_KEY) return null;

  const imageHash = hashString(imageBase64);

  for (const model of MODELS) {
    const result = await callGeminiVision(model, imageBase64);
    if (!result) continue;

    const cleanName = normalizeScanName(result.name);

    return {
      id: `scan-${imageHash}`,
      name: cleanName,
      source: 'scan',
      sourceFoodId: imageHash,
      dataType: 'scan',
      brand: result.brand,
      preparation: null,
      normalizedName: cleanName.toLowerCase(),
      caloriesPer100g: result.caloriesPer100g,
      proteinPer100g: result.proteinPer100g,
      carbsPer100g: result.carbsPer100g,
      fatPer100g: result.fatPer100g,
      servingSizeGrams: result.servingSizeGrams,
      servingLabel: result.servingLabel,
      alternateSourceIds: [],
    };
  }

  return null;
}

export async function describeMeal(text: string): Promise<{ mealName: string; components: FoodResult[] } | null> {
  if (!GEMINI_API_KEY) return null;

  const prompt = `Estimate the nutritional breakdown of this meal description. Break it down into individual ingredients/components. For each component, estimate the grams based on the description or use realistic typical portion sizes. Return precise per-100g nutritional values using standard nutrition database estimates for common ingredients. Be specific with food names (e.g. "white rice" not "carb", "chicken breast" not "protein").\n\nMeal description: ${text}`;

  for (const model of MODELS) {
    const result = await callGeminiText<DescribeResponse>(model, prompt, DESCRIBE_SCHEMA);
    if (!result?.mealName || !result.components?.length) continue;

    const components: FoodResult[] = await Promise.all(
      result.components.map(async (comp, idx) => {
        const cleanName = normalizeScanName(comp.name);
        const normalizedName = cleanName.toLowerCase();
        const cached = await getCachedFood(normalizedName);

        return {
          id: `describe-${Date.now()}-${idx}`,
          name: cleanName,
          source: 'describe' as const,
          sourceFoodId: '',
          dataType: 'describe' as const,
          brand: cached?.brand ?? comp.brand ?? null,
          preparation: cached?.preparation ?? comp.preparation ?? null,
          normalizedName,
          caloriesPer100g: cached?.calories_per_100g ?? comp.caloriesPer100g,
          proteinPer100g: cached?.protein_g_per_100g ?? comp.proteinPer100g,
          carbsPer100g: cached?.carbs_g_per_100g ?? comp.carbsPer100g,
          fatPer100g: cached?.fat_g_per_100g ?? comp.fatPer100g,
          servingSizeGrams: comp.estimatedGrams,
          servingLabel: cached?.serving_label ?? comp.servingLabel ?? null,
          alternateSourceIds: [],
        };
      }),
    );

    return { mealName: result.mealName.trim(), components };
  }

  return null;
}
