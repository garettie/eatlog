import * as Application from 'expo-application';

import { serviceConfig } from '../config/services';
import { buildFoodPortions, normalizeFoodName } from './foodSearchCore';
import type { FoodResult } from './foodSearch';
import {
    type GeminiFoodEstimateResponse,
    isRecognizedFoodEstimate,
    isUnrecognizedFoodEstimate,
} from './foodScanPrompts';

export interface DescribeResult {
    mealName: string;
    components: FoodResult[];
}

export type FoodEstimationFailureKind = 'unavailable' | 'network' | 'timeout' | 'provider' | 'invalid-response' | 'unrecognized';
export type FoodEstimationResult =
    | { ok: true; result: DescribeResult }
    | { ok: false; kind: FoodEstimationFailureKind; message: string };

type EstimateOperation = 'scan' | 'describe' | 'clarify-meal' | 'clarify-component';

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

function mapComponents(
    components: GeminiFoodEstimateResponse['components'],
    source: 'scan' | 'describe',
    timestamp: number,
): FoodResult[] {
    return components.map((component, index) => {
        const name = normalizeScanName(component.name);
        const normalized = normalizeFoodName(name, component.brand ?? null);
        const portions = buildFoodPortions([
            { id: 'reviewed', label: component.servingLabel ?? 'Reviewed amount', grams: component.estimatedGrams },
            { id: 'serving', label: component.servingLabel ?? `${component.servingSizeGrams ?? 0} g`, grams: component.servingSizeGrams },
        ]);
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
            defaultPortionId: portions[0].id,
            estimatedGrams: component.estimatedGrams,
            confidence: component.confidence,
            confidenceReason: component.confidenceReason,
            alternateSourceIds: [],
        };
    });
}

async function estimate(
    operation: EstimateOperation,
    input: { text?: string; imageBase64?: string },
): Promise<FoodEstimationResult> {
    if (!serviceConfig.foodWorkerUrl) return failure('unavailable');
    let installId: string;
    try {
        installId = Application.getAndroidId();
    } catch {
        return failure('unavailable');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);
    try {
        const response = await fetch(`${serviceConfig.foodWorkerUrl}/v1/estimate`, {
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
        const result = await response.json() as GeminiFoodEstimateResponse;
        if (isUnrecognizedFoodEstimate(result)) return failure('unrecognized');
        if (!isRecognizedFoodEstimate(result)) return failure('invalid-response');
        const source = operation === 'scan' || input.imageBase64 ? 'scan' : 'describe';
        return {
            ok: true,
            result: {
                mealName: result.mealName.trim(),
                components: mapComponents(result.components, source, Date.now()),
            },
        };
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return failure('timeout');
        return failure('network');
    } finally {
        clearTimeout(timeout);
    }
}

export async function scanFood(imageBase64: string): Promise<FoodEstimationResult> {
    if (!imageBase64.trim()) return failure('unrecognized');
    return estimate('scan', { imageBase64 });
}

export async function describeMeal(text: string): Promise<FoodEstimationResult> {
    const trimmed = text.trim();
    if (!trimmed) return failure('unrecognized');
    return estimate('describe', { text: trimmed });
}

export async function clarifyMeal(options: {
    name: string;
    imageBase64?: string;
}): Promise<DescribeResult | null> {
    const result = await estimate('clarify-meal', {
        text: options.name.trim(),
        imageBase64: options.imageBase64,
    });
    return result.ok ? result.result : null;
}

export async function clarifyComponent(options: {
    name: string;
    imageBase64?: string;
}): Promise<FoodResult | null> {
    const result = await estimate('clarify-component', {
        text: options.name.trim(),
        imageBase64: options.imageBase64,
    });
    return result.ok ? result.result.components[0] ?? null : null;
}
