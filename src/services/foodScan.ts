import { serviceConfig } from '../config/services';
import { FoodResult } from './foodSearch';
import { getCachedFood } from '../db/database';
import {
    buildMealDescriptionPrompt,
    FOOD_COMPONENT_SCHEMA,
    FOOD_ESTIMATE_SCHEMA,
    GeminiFoodEstimateResponse,
    IMAGE_ANALYSIS_PROMPT,
    isRecognizedFoodEstimate,
    isUnrecognizedFoodEstimate,
    isValidGeminiFoodComponent,
} from './foodScanPrompts';

export interface DescribeResult {
    mealName: string;
    components: FoodResult[];
}

export type FoodEstimationFailureKind = 'unavailable' | 'network' | 'timeout' | 'provider' | 'invalid-response' | 'unrecognized';
export type FoodEstimationResult =
    | { ok: true; result: DescribeResult }
    | { ok: false; kind: FoodEstimationFailureKind; message: string };

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] as const;

const SINGLE_COMPONENT_SCHEMA = {
    type: 'object' as const,
    properties: {
        component: FOOD_COMPONENT_SCHEMA,
    },
    required: ['component'],
};

interface SingleComponentResponse {
    component: GeminiFoodEstimateResponse['components'][number];
}

function hashString(s: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(s.length, 1024); i++) {
        hash = ((hash << 5) - hash) + s.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
}

async function callGemini<T>(model: string, parts: any[], schema: any): Promise<{ value: T } | { kind: FoodEstimationFailureKind }> {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${serviceConfig.geminiApiKey}`;

    const body = {
        contents: [{ parts }],
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

        if (!res.ok) return { kind: 'provider' };

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return { kind: 'invalid-response' };

        try { return { value: JSON.parse(text) as T }; } catch { return { kind: 'invalid-response' }; }
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return { kind: 'timeout' };
        return { kind: 'network' };
    } finally {
        clearTimeout(timeoutId);
    }
}

function failure(kind: FoodEstimationFailureKind): FoodEstimationResult {
    const messages: Record<FoodEstimationFailureKind, string> = {
        unavailable: 'Estimates are unavailable in this build.',
        network: 'Could not reach the estimation service. Check your connection and try again.',
        timeout: 'The estimation service took too long. Try again.',
        provider: 'The estimation service could not complete this request. Try again.',
        'invalid-response': 'The estimation service returned an unusable result. Try again or enter it manually.',
        unrecognized: 'No usable food was recognized. Try a clearer photo or a more specific description.',
    };
    return { ok: false, kind, message: messages[kind] };
}

function normalizeScanName(name: string): string {
    const lowered = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return lowered.replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

async function mapComponents(
    components: GeminiFoodEstimateResponse['components'],
    source: 'scan' | 'describe',
    timestamp: number,
): Promise<FoodResult[]> {
    return Promise.all(
        components.map(async (comp, idx) => {
            const cleanName = normalizeScanName(comp.name);
            const normalizedName = cleanName.toLowerCase();
            const cached = await getCachedFood(normalizedName);

            const perServingGrams = comp.servingSizeGrams && comp.servingSizeGrams > 0
                ? comp.servingSizeGrams
                : null;
            const perServingLabel = comp.servingLabel ?? (perServingGrams ? `${perServingGrams}g` : null);

            const calPer100g = cached?.calories_per_100g ?? comp.caloriesPer100g;
            const proPer100g = cached?.protein_g_per_100g ?? comp.proteinPer100g;
            const carbPer100g = cached?.carbs_g_per_100g ?? comp.carbsPer100g;
            const fatPer100g = cached?.fat_g_per_100g ?? comp.fatPer100g;

            return {
                id: `${source}-${timestamp}-${idx}`,
                name: cleanName,
                source,
                sourceFoodId: '',
                dataType: source,
                brand: cached?.brand ?? comp.brand ?? null,
                preparation: cached?.preparation ?? comp.preparation ?? null,
                normalizedName,
                caloriesPer100g: Math.round(calPer100g * 10) / 10,
                proteinPer100g: Math.round(proPer100g * 10) / 10,
                carbsPer100g: Math.round(carbPer100g * 10) / 10,
                fatPer100g: Math.round(fatPer100g * 10) / 10,
                servingSizeGrams: cached?.serving_size_g ?? perServingGrams,
                servingLabel: cached?.serving_label ?? perServingLabel,
                estimatedGrams: comp.estimatedGrams,
                confidence: comp.confidence,
                confidenceReason: comp.confidenceReason,
                alternateSourceIds: [],
            };
        }),
    );
}

export async function scanFood(imageBase64: string): Promise<FoodEstimationResult> {
    if (!imageBase64.trim()) return failure('unrecognized');
    if (!serviceConfig.availability.gemini) return failure('unavailable');

    const timestamp = Date.now();

    let lastKind: FoodEstimationFailureKind = 'invalid-response';
    for (const model of MODELS) {
        const response = await callGemini<GeminiFoodEstimateResponse>(model, [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            { text: IMAGE_ANALYSIS_PROMPT },
        ], FOOD_ESTIMATE_SCHEMA);

        if (!('value' in response)) { lastKind = response.kind; continue; }
        const result = response.value;
        if (isUnrecognizedFoodEstimate(result)) return failure('unrecognized');
        if (!isRecognizedFoodEstimate(result)) { lastKind = 'invalid-response'; continue; }

        const components = await mapComponents(result.components, 'scan', timestamp);
        return { ok: true, result: { mealName: result.mealName.trim(), components } };
    }

    return failure(lastKind);
}

export async function describeMeal(text: string): Promise<FoodEstimationResult> {
    const trimmed = text.trim();
    if (!trimmed) return failure('unrecognized');
    if (!serviceConfig.availability.gemini) return failure('unavailable');
    const prompt = buildMealDescriptionPrompt(trimmed);

    const timestamp = Date.now();

    let lastKind: FoodEstimationFailureKind = 'invalid-response';
    for (const model of MODELS) {
        const response = await callGemini<GeminiFoodEstimateResponse>(model, [{ text: prompt }], FOOD_ESTIMATE_SCHEMA);
        if (!('value' in response)) { lastKind = response.kind; continue; }
        const result = response.value;
        if (isUnrecognizedFoodEstimate(result)) return failure('unrecognized');
        if (!isRecognizedFoodEstimate(result)) { lastKind = 'invalid-response'; continue; }

        const components = await mapComponents(result.components, 'describe', timestamp);
        return { ok: true, result: { mealName: result.mealName.trim(), components } };
    }

    return failure(lastKind);
}

export async function clarifyMeal(opts: {
    name: string;
    imageBase64?: string;
}): Promise<{ mealName: string; components: FoodResult[] } | null> {
    if (!serviceConfig.availability.gemini) return null;

    const { name, imageBase64 } = opts;
    const timestamp = Date.now();

    if (imageBase64) {
        const prompt = `The user says this food or meal shown in the photo is called "${name}". Analyze the photo carefully. Break it down into individual ingredients/components based on what you actually see. For each component, estimate the total grams visible in the photo, per-100g nutritional values using standard nutrition database estimates, and a typical serving size in grams using real-world units (e.g. 1 egg ≈ 50g, 1 piece of chicken ≈ 150g, 1 slice of bread ≈ 30g, 1 cup of rice ≈ 180g). Be specific with food names.`;

        for (const model of MODELS) {
            const response = await callGemini<GeminiFoodEstimateResponse>(model, [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            ], FOOD_ESTIMATE_SCHEMA);
            if (!('value' in response) || !isRecognizedFoodEstimate(response.value)) continue;
            const result = response.value;
            const components = await mapComponents(result.components, 'scan', timestamp);
            return { mealName: name, components };
        }
    } else {
        const prompt = `The user says this meal is called "${name}". Estimate the nutritional breakdown. Break it down into individual ingredients/components. For each component, estimate the total grams using realistic typical portion sizes. Also provide a typical serving size in grams using real-world units (e.g. 1 egg ≈ 50g, 1 sachet of noodles ≈ 80g, 1 medium fries ≈ 117g). Return precise per-100g nutritional values using standard nutrition database estimates. Be specific with food names (e.g. "white rice" not "carb", "chicken breast" not "protein").`;

        for (const model of MODELS) {
            const response = await callGemini<GeminiFoodEstimateResponse>(model, [{ text: prompt }], FOOD_ESTIMATE_SCHEMA);
            if (!('value' in response) || !isRecognizedFoodEstimate(response.value)) continue;
            const result = response.value;
            const components = await mapComponents(result.components, 'describe', timestamp);
            return { mealName: name, components };
        }
    }

    return null;
}

export async function clarifyComponent(opts: {
    name: string;
    imageBase64?: string;
}): Promise<FoodResult | null> {
    if (!serviceConfig.availability.gemini) return null;

    const { name, imageBase64 } = opts;
    const timestamp = Date.now();
    const prompt = imageBase64
        ? `The user has renamed one component in this meal photo to "${name}". Analyze only that named component. Return its estimated visible portion, per-100g nutrition, and a typical serving size. Do not break down or return the rest of the meal.`
        : `The user has renamed one meal component to "${name}". Estimate only that component's portion, per-100g nutrition, and a typical serving size. Do not add other meal components.`;
    const parts = imageBase64
        ? [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }]
        : [{ text: prompt }];

    for (const model of MODELS) {
        const response = await callGemini<SingleComponentResponse>(
            model,
            parts,
            SINGLE_COMPONENT_SCHEMA,
        );
        if (!('value' in response) || !isValidGeminiFoodComponent(response.value.component)) continue;
        const [component] = await mapComponents([response.value.component], imageBase64 ? 'scan' : 'describe', timestamp);
        return component ?? null;
    }

    return null;
}
