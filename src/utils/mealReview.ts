import type { EstimateContextComponent, MealDivision } from '../services/foodScan';
import type { FoodResult } from '../services/foodSearch';
import { formatPortionLabel } from './portionLabels';
import {
  initialPortionSelection,
  servingsForSelection,
  type PortionSelection,
} from './portionSelection';

export interface EditableComponent {
  food: FoodResult;
  per100g: { calories: number; protein: number; carbs: number; fat: number };
  selection: PortionSelection;
  portionValid: boolean;
  originalName: string;
  nutritionAcknowledged: boolean;
}

export type UndoAction =
  | { kind: 'remove'; comp: EditableComponent; idx: number }
  | {
      kind: 'meal-reestimate';
      components: EditableComponent[];
      mealName: string;
      division: MealDivision | null;
      eatenPortions: number | null;
    }
  | {
      kind: 'component-reestimate';
      previous: EditableComponent;
      replacementId: string;
    };

export const UNDO_TIMEOUT_MS = 10_000;

export function toEditable(food: FoodResult): EditableComponent {
  return {
    food,
    per100g: {
      calories: Math.round(food.caloriesPer100g ?? 0),
      protein: Math.round((food.proteinPer100g ?? 0) * 10) / 10,
      carbs: Math.round((food.carbsPer100g ?? 0) * 10) / 10,
      fat: Math.round((food.fatPer100g ?? 0) * 10) / 10,
    },
    selection: initialPortionSelection(food),
    portionValid: true,
    originalName: food.name,
    nutritionAcknowledged: true,
  };
}

/**
 * Scales every food in the meal by the same factor, for when the estimate covers
 * more food than the user ate — a whole pizza they took three slices of, a bowl of
 * soup meant for the table. Portion mode and the chosen serving survive so a
 * "1 cup rice" row still reads in cups afterwards, and the amount chip drops to a
 * custom selection because the scaled grams no longer match any preset.
 *
 * Scaling is relative to the current amounts rather than the original estimate, so
 * a food the user already hand-corrected keeps that correction in proportion.
 */
export function scaleComponentPortions(
  components: EditableComponent[],
  factor: number,
): EditableComponent[] {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return components;
  return components.map((component) => {
    const grams = Math.round(component.selection.grams * factor * 10) / 10;
    if (!Number.isFinite(grams) || grams <= 0) return component;
    return {
      ...component,
      selection: {
        ...component.selection,
        grams,
        selectedAmountId:
          component.selection.mode === 'servings' ? 'custom-serving' : 'custom-grams',
      },
    };
  });
}

function pluralize(singular: string): string {
  if (/(s|ch|sh|x|z)$/i.test(singular)) return `${singular}es`;
  if (/[^aeiou]y$/i.test(singular)) return `${singular.slice(0, -1)}ies`;
  return `${singular}s`;
}

/**
 * How the meal is counted, from either of two sources: a shared dish the estimate
 * says divides into portions (`servesTotal` slices of one pizza), or a single food
 * whose own serving is the unit (`servesTotal` null). An ordinary plate uses one
 * whole (`servesTotal` 1), shown as a percentage and adjustable in quarters.
 */
export type MealPortionScale =
  | { kind: 'plate'; unit: 'meal'; servesTotal: 1 }
  | { kind: 'count'; unit: string; servesTotal: null }
  | { kind: 'shared'; unit: string; servesTotal: number };

export function mealPortionStep(scale: MealPortionScale): number {
  return scale.kind === 'plate' ? 0.25 : 1;
}

export function scaleFromDivision(division: MealDivision): MealPortionScale {
  return { kind: 'shared', unit: division.servingUnit, servesTotal: division.servesTotal };
}

/**
 * The estimate covers one whole food, so eating more than all of it means a second
 * one that was never in the photo. That is a real thing to log — a second helping,
 * one of the two pizzas on the table — so the ceiling sits above the whole rather
 * than at it. With no known whole to double, a flat cap keeps a stuck stepper from
 * running away.
 */
export const MEAL_PORTION_CEILING_MULTIPLE = 2;
export const MEAL_PORTION_COUNT_CEILING = 20;

export function mealPortionCeiling(scale: MealPortionScale): number {
  return scale.kind === 'count'
    ? MEAL_PORTION_COUNT_CEILING
    : scale.servesTotal * MEAL_PORTION_CEILING_MULTIPLE;
}

/**
 * "3 of 8 slices" / "1 of 4 bowls" / "10 slices" / "1 empanada". Past the whole,
 * and when there is no whole, the label drops the total and just counts.
 *
 * The unit agrees with whichever number it follows: a total is always at least two
 * so it stays plural even at "1 of 8 slices", while a bare count is singular at one.
 */
export function formatMealPortion(eaten: number, scale: MealPortionScale): string {
  const count = Math.round(eaten * 100) / 100;
  if (scale.kind === 'plate') return `${Math.round(count * 100)}%`;
  if (scale.kind === 'count' || count > scale.servesTotal) {
    return `${count} ${count === 1 ? scale.unit : pluralize(scale.unit)}`;
  }
  return `${count} of ${scale.servesTotal} ${pluralize(scale.unit)}`;
}

export function componentNameChanged(component: EditableComponent): boolean {
  return (
    component.food.name.trim().toLowerCase() !==
    component.originalName.trim().toLowerCase()
  );
}

export function toEstimateContext(components: EditableComponent[]): EstimateContextComponent[] {
  return components
    .map((component) => ({
      name: component.food.name.trim(),
      estimatedGrams: component.selection.grams,
    }))
    .filter(
      (component) =>
        component.name.length > 0 &&
        Number.isFinite(component.estimatedGrams) &&
        component.estimatedGrams > 0,
    );
}

export function formatCollapsedPortion(
  component: EditableComponent,
  serving: FoodResult['portions'][number] | null,
): string {
  const grams = Math.round(component.selection.grams * 10) / 10;
  if (!serving || component.selection.mode !== 'servings') return `${grams}g`;

  const servings = servingsForSelection(component.selection, serving);
  const servingsLabel = String(Math.round(servings * 100) / 100);
  const servingLabel = formatPortionLabel(
    serving.label,
    Math.abs(servings - 1) < 0.001 ? serving.grams : grams,
  );
  return Math.abs(servings - 1) < 0.001
    ? servingLabel
    : `${servingsLabel} × ${servingLabel}`;
}

export function componentReviewStatus(
  component: EditableComponent,
): { label: string; isError: boolean } | null {
  if (!component.food.name.trim()) return { label: 'Name required', isError: true };
  if (!component.portionValid) return { label: 'Fix portion', isError: true };
  if (componentNameChanged(component) && !component.nutritionAcknowledged) {
    return { label: 'Review nutrition', isError: true };
  }
  if (component.food.confidence === 'low') {
    return { label: 'Check estimate', isError: false };
  }
  return null;
}

export function computeMealTotals(components: EditableComponent[]): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  totalGrams: number;
} {
  let cal = 0,
    pro10 = 0,
    carb10 = 0,
    fat10 = 0,
    totalGrams = 0;
  for (const comp of components) {
    const ratio = comp.selection.grams / 100;
    cal += Math.round(comp.per100g.calories * ratio);
    pro10 += Math.round(comp.per100g.protein * ratio * 10);
    carb10 += Math.round(comp.per100g.carbs * ratio * 10);
    fat10 += Math.round(comp.per100g.fat * ratio * 10);
    totalGrams += comp.selection.grams;
  }
  return {
    calories: cal,
    protein: pro10 / 10,
    carbs: carb10 / 10,
    fat: fat10 / 10,
    totalGrams: Math.round(totalGrams),
  };
}

export function describeLogBlocker(
  components: EditableComponent[],
  mealName: string,
): string | null {
  if (components.length === 0) return 'Add a food before logging.';
  if (!mealName.trim()) return 'Name this meal before logging.';
  if (components.some((component) => !component.food.name.trim())) {
    return 'Name every food before logging.';
  }
  if (
    components.some(
      (component) => componentNameChanged(component) && !component.nutritionAcknowledged,
    )
  ) {
    return 'Review nutrition for renamed foods.';
  }
  if (components.some((component) => !component.portionValid)) {
    return 'Enter a valid portion for every food.';
  }
  return null;
}

export function isLoggingBlocked(components: EditableComponent[], mealName: string): boolean {
  return describeLogBlocker(components, mealName) !== null;
}

export function applyUndo(
  action: UndoAction,
  components: EditableComponent[],
  mealName: string,
): { components: EditableComponent[]; mealName: string } {
  if (action.kind === 'remove') {
    const next = [...components];
    next.splice(Math.min(action.idx, next.length), 0, action.comp);
    return { components: next, mealName };
  }
  if (action.kind === 'meal-reestimate') {
    return { components: action.components, mealName: action.mealName };
  }
  return {
    components: components.map((component) =>
      component.food.id === action.replacementId ? action.previous : component,
    ),
    mealName,
  };
}

export function renameComponent(
  components: EditableComponent[],
  idx: number,
  name: string,
): EditableComponent[] {
  return components.map((c, i) =>
    i === idx
      ? {
          ...c,
          food: { ...c.food, name, normalizedName: name.toLowerCase() },
          nutritionAcknowledged:
            name.trim().toLowerCase() === c.originalName.trim().toLowerCase(),
        }
      : c,
  );
}

export function acknowledgeComponentNutrition(
  components: EditableComponent[],
  idx: number,
): EditableComponent[] {
  return components.map((component, index) =>
    index === idx ? { ...component, nutritionAcknowledged: true } : component,
  );
}

export function removeComponentAt(components: EditableComponent[], idx: number): EditableComponent[] {
  return components.filter((_, currentIndex) => currentIndex !== idx);
}

export function setComponentPer100g(
  components: EditableComponent[],
  idx: number,
  field: keyof EditableComponent['per100g'],
  value: number,
): EditableComponent[] {
  const rounded = field === 'calories' ? Math.round(value) : Math.round(value * 10) / 10;
  return components.map((c, i) =>
    i === idx ? { ...c, per100g: { ...c.per100g, [field]: rounded } } : c,
  );
}

export function replaceComponent(
  components: EditableComponent[],
  id: string,
  next: EditableComponent,
): EditableComponent[] {
  return components.map((current) => (current.food.id === id ? next : current));
}
