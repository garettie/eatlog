import type { FoodEstimateConfidence } from './foodSearchTypes';

export type FoodRecognitionStatus = 'recognized' | 'unrecognized';

export interface FoodEstimateComponent {
  name: string;
  estimatedGrams: number;
  servingSizeGrams: number | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  brand: string | null;
  preparation: string | null;
  servingLabel: string | null;
  confidence: FoodEstimateConfidence;
  confidenceReason: string | null;
}

export interface FoodEstimateResponse {
  status: FoodRecognitionStatus;
  unrecognizedReason: string | null;
  mealName: string | null;
  components: FoodEstimateComponent[];
}

export type RecognizedFoodEstimate = FoodEstimateResponse & {
  status: 'recognized';
  mealName: string;
};

export function isValidFoodEstimateComponent(component: FoodEstimateComponent | undefined): component is FoodEstimateComponent {
  return !!component?.name?.trim()
    && component.estimatedGrams > 0
    && [component.estimatedGrams, component.caloriesPer100g, component.proteinPer100g, component.carbsPer100g, component.fatPer100g].every(Number.isFinite)
    && [component.caloriesPer100g, component.proteinPer100g, component.carbsPer100g, component.fatPer100g].every((value) => value >= 0)
    && ['high', 'medium', 'low'].includes(component.confidence)
    && (component.confidence !== 'low' || !!component.confidenceReason?.trim());
}

export function isRecognizedFoodEstimate(result: FoodEstimateResponse | undefined): result is RecognizedFoodEstimate {
  return result?.status === 'recognized'
    && !!result.mealName?.trim()
    && Array.isArray(result.components)
    && result.components.length > 0
    && result.components.every(isValidFoodEstimateComponent);
}

export function isUnrecognizedFoodEstimate(result: FoodEstimateResponse | undefined): boolean {
  return result?.status === 'unrecognized'
    && result.mealName === null
    && Array.isArray(result.components)
    && result.components.length === 0;
}
