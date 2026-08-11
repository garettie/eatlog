import type { FoodLog } from '../db/database';

export type MealShareTemplateId = 'summary' | 'macros' | 'components';

export interface ShareableMealInput {
  id: number;
  name: string;
  photoUri?: string | null;
  components: FoodLog[];
}

export interface MealSharePayload {
  mealId: number;
  name: string;
  photoUri: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  componentNames: string[];
  componentHeading: 'Components' | 'Estimated components';
}

export function getMealShareComponentRows(componentNames: readonly string[]): string[] {
  return componentNames.length > 5
    ? [...componentNames.slice(0, 4), `+${componentNames.length - 4} more`]
    : [...componentNames];
}

export function getMealSharePreviewAccessibilityLabel(
  payload: MealSharePayload,
  template: MealShareTemplateId,
): string {
  const nutrition = `${Math.round(payload.calories)} kilocalories. Protein ${Math.round(payload.protein)} grams. Carbohydrates ${Math.round(payload.carbs)} grams. Fat ${Math.round(payload.fat)} grams.`;
  if (template === 'components') {
    return `Components preview. ${payload.name}. ${nutrition} ${payload.componentHeading}: ${getMealShareComponentRows(payload.componentNames).join(', ')}.`;
  }
  return `${template === 'summary' ? 'Summary' : 'Macros'} preview. ${payload.name}. ${nutrition}`;
}

export function buildMealSharePayload(meal: ShareableMealInput): MealSharePayload | null {
  const photoUri = meal.photoUri?.trim();
  if (!photoUri) return null;

  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let hasEstimatedComponent = false;
  const componentNames: string[] = [];

  for (const component of meal.components) {
    calories += Math.abs(component.calories);
    protein += Math.abs(component.protein_g);
    carbs += Math.abs(component.carbs_g);
    fat += Math.abs(component.fat_g);
    componentNames.push(component.name);
    hasEstimatedComponent ||= component.source === 'scan' || component.source === 'describe';
  }

  return {
    mealId: meal.id,
    name: meal.name.trim() || 'Meal',
    photoUri,
    calories,
    protein,
    carbs,
    fat,
    componentNames,
    componentHeading: hasEstimatedComponent ? 'Estimated components' : 'Components',
  };
}
