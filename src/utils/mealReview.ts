import type { EstimateContextComponent } from '../services/foodScan';
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
