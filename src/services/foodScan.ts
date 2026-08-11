import { serviceConfig } from '../config/services';
import { buildFoodPortions, normalizeFoodName } from './foodSearchCore';
import type { FoodResult } from './foodSearch';
import { getInstallationToken, isInstallationToken } from './installIdentity';
import {
    type FoodEstimateResponse,
    isRecognizedFoodEstimate,
    isUnrecognizedFoodEstimate,
} from './foodScanContract';

export interface DescribeResult {
    mealName: string;
    components: FoodResult[];
    originalDescription?: string;
}

export interface EstimateContextComponent {
    name: string;
    estimatedGrams: number;
}

export interface MealClarificationInput {
    name: string;
    originalDescription?: string;
    components: EstimateContextComponent[];
    imageBase64?: string;
}

export interface ComponentClarificationInput extends MealClarificationInput {
    mealName: string;
}

export type FoodEstimationFailureKind = 'unavailable' | 'network' | 'timeout' | 'provider' | 'invalid-response' | 'unrecognized';
export type FoodEstimationResult =
    | { ok: true; result: DescribeResult }
    | { ok: false; kind: FoodEstimationFailureKind; message: string };

type EstimateOperation = 'scan' | 'describe' | 'clarify-meal' | 'clarify-component';
const MAX_CONTEXT_COMPONENTS = 20;
const MAX_CONTEXT_DESCRIPTION_LENGTH = 500;
const MAX_CONTEXT_NAME_LENGTH = 120;
const MAX_CONTEXT_GRAMS = 10_000;
const MAX_CLARIFICATION_NAME_LENGTH = 200;

interface EstimateContext {
    originalDescription?: string;
    mealName?: string;
    components: EstimateContextComponent[];
}

interface EstimateInput {
    text?: string;
    imageBase64?: string;
    context?: EstimateContext;
}

export interface FoodEstimateClientOptions {
    workerUrl: string;
    fetchImpl?: typeof fetch;
    getInstallationToken?: () => string | Promise<string>;
    now?: () => number;
    timeoutMs?: number;
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
    return lowered.replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

function buildEstimateContext(input: {
    originalDescription?: string;
    mealName?: string;
    components: EstimateContextComponent[];
}): EstimateContext | undefined {
    const components = input.components
        .map((component) => ({
            name: component.name.trim().slice(0, MAX_CONTEXT_NAME_LENGTH),
            estimatedGrams: component.estimatedGrams,
        }))
        .filter((component) => component.name
            && Number.isFinite(component.estimatedGrams)
            && component.estimatedGrams > 0
            && component.estimatedGrams <= MAX_CONTEXT_GRAMS)
        .slice(0, MAX_CONTEXT_COMPONENTS);
    if (components.length === 0) return undefined;
    const originalDescription = input.originalDescription?.trim().slice(0, MAX_CONTEXT_DESCRIPTION_LENGTH);
    const mealName = input.mealName?.trim().slice(0, MAX_CONTEXT_NAME_LENGTH);
    return {
        ...(originalDescription ? { originalDescription } : {}),
        ...(mealName ? { mealName } : {}),
        components,
    };
}

function mapComponents(
    components: FoodEstimateResponse['components'],
    source: 'scan' | 'describe',
    timestamp: number,
): FoodResult[] {
    return components.map((component, index) => {
        const name = normalizeScanName(component.name);
        const normalized = normalizeFoodName(name, component.brand ?? null);
        const portions = buildFoodPortions([
            { id: 'serving', label: component.servingLabel ?? `${component.servingSizeGrams ?? 0} g`, grams: component.servingSizeGrams },
        ]);
        const serving = portions[0] ?? null;
        return {
            id: `${source}-${timestamp}-${index}`,
            name,
            source,
            sourceFoodId: '',
            dataType: source,
            brand: component.brand ?? null,
            preparation: component.preparation ?? normalized.preparation,
            normalizedName: normalized.normalizedName,
            caloriesPer100g: Math.round(component.caloriesPer100g * 10) / 10,
            proteinPer100g: Math.round(component.proteinPer100g * 10) / 10,
            carbsPer100g: Math.round(component.carbsPer100g * 10) / 10,
            fatPer100g: Math.round(component.fatPer100g * 10) / 10,
            portions,
            defaultAmount: {
                kind: 'reviewed',
                grams: component.estimatedGrams,
                servingId: serving?.id ?? null,
            },
            confidence: component.confidence,
            confidenceReason: component.confidenceReason,
            alternateSourceIds: [],
        };
    });
}

export function createFoodEstimateClient(options: FoodEstimateClientOptions) {
    const fetchImpl = options.fetchImpl ?? fetch;
    const loadInstallationToken = options.getInstallationToken ?? getInstallationToken;
    const now = options.now ?? Date.now;
    const timeoutMs = options.timeoutMs ?? 22000;

    async function estimate(
        operation: EstimateOperation,
        input: EstimateInput,
    ): Promise<FoodEstimationResult> {
        if (!options.workerUrl) return failure('unavailable');
        let installId: string;
        try {
            installId = await loadInstallationToken();
            if (!isInstallationToken(installId)) return failure('unavailable');
        } catch {
            return failure('unavailable');
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(`${options.workerUrl}/v1/estimate`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Eatlog-Install-ID': installId,
                },
                body: JSON.stringify({ operation, ...input }),
                signal: controller.signal,
            });
            if (!response.ok) return failure('provider');
            if (!(response.headers.get('content-type') ?? '').includes('application/json')) return failure('invalid-response');
            const result = await response.json() as FoodEstimateResponse;
            if (isUnrecognizedFoodEstimate(result)) return failure('unrecognized');
            if (!isRecognizedFoodEstimate(result)) return failure('invalid-response');
            const source = operation === 'scan' || input.imageBase64 ? 'scan' : 'describe';
            const originalDescription = operation === 'describe' ? input.text : input.context?.originalDescription;
            return {
                ok: true,
                result: {
                    mealName: result.mealName.trim(),
                    components: mapComponents(result.components, source, now()),
                    ...(originalDescription ? { originalDescription } : {}),
                },
            };
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return failure('timeout');
            return failure('network');
        } finally {
            clearTimeout(timeout);
        }
    }

    async function scanFood(imageBase64: string): Promise<FoodEstimationResult> {
        if (!imageBase64.trim()) return failure('unrecognized');
        return estimate('scan', { imageBase64 });
    }

    async function describeMeal(text: string): Promise<FoodEstimationResult> {
        const trimmed = text.trim();
        if (!trimmed) return failure('unrecognized');
        return estimate('describe', { text: trimmed });
    }

    async function clarifyMeal(options: MealClarificationInput): Promise<DescribeResult | null> {
        const result = await estimate('clarify-meal', {
            text: options.name.trim().slice(0, MAX_CLARIFICATION_NAME_LENGTH),
            imageBase64: options.imageBase64,
            context: buildEstimateContext(options),
        });
        return result.ok ? result.result : null;
    }

    async function clarifyComponent(options: ComponentClarificationInput): Promise<FoodResult | null> {
        const result = await estimate('clarify-component', {
            text: options.name.trim().slice(0, MAX_CLARIFICATION_NAME_LENGTH),
            imageBase64: options.imageBase64,
            context: buildEstimateContext(options),
        });
        return result.ok ? result.result.components[0] ?? null : null;
    }

    return { scanFood, describeMeal, clarifyMeal, clarifyComponent };
}

const defaultClient = createFoodEstimateClient({ workerUrl: serviceConfig.foodWorkerUrl });

export const scanFood = defaultClient.scanFood;
export const describeMeal = defaultClient.describeMeal;
export const clarifyMeal = defaultClient.clarifyMeal;
export const clarifyComponent = defaultClient.clarifyComponent;
