import { GEMINI_API_KEY } from '../config/api';
import { FoodResult } from './foodSearch';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] as const;

const SCHEMA = {
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

function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(s.length, 1024); i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
}

async function callGemini(model: string, base64Image: string): Promise<ScanResult | null> {
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
      responseSchema: SCHEMA,
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
    const result = await callGemini(model, imageBase64);
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
