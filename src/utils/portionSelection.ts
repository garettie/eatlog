import type { FoodPortion, FoodResult } from '../services/foodSearchTypes';

export type PortionMode = 'servings' | 'grams';
export type FoodAmountOptionKind = 'last-logged' | 'reviewed' | 'serving' | 'reference';

export interface FoodAmountOption {
  id: string;
  kind: FoodAmountOptionKind;
  label: string;
  grams: number;
  servingId: string | null;
}

export interface PortionSelection {
  grams: number;
  mode: PortionMode;
  selectedServingId: string | null;
  selectedAmountId: string;
}

export const MIN_SERVINGS = 0.1;

function sameAmount(first: number, second: number): boolean {
  return Math.abs(first - second) < 0.01;
}

function amountLabel(kind: Exclude<FoodAmountOptionKind, 'serving'>): string {
  if (kind === 'last-logged') return 'Last logged';
  if (kind === 'reviewed') return 'Reviewed amount';
  return '100 g';
}

export function buildFoodAmountOptions(food: FoodResult): FoodAmountOption[] {
  const servings = food.portions.map((portion): FoodAmountOption => ({
    id: `serving:${portion.id}`,
    kind: 'serving',
    label: portion.label,
    grams: portion.grams,
    servingId: portion.id,
  }));
  const options: FoodAmountOption[] = [];

  if (
    food.defaultAmount.kind !== 'serving'
    && !servings.some((option) => sameAmount(option.grams, food.defaultAmount.grams))
  ) {
    options.push({
      id: food.defaultAmount.kind,
      kind: food.defaultAmount.kind,
      label: amountLabel(food.defaultAmount.kind),
      grams: food.defaultAmount.grams,
      servingId: food.defaultAmount.servingId,
    });
  }

  options.push(...servings);

  if (!options.some((option) => sameAmount(option.grams, 100))) {
    options.push({
      id: 'reference-100g',
      kind: 'reference',
      label: '100 g',
      grams: 100,
      servingId: null,
    });
  }

  return options;
}

export function initialPortionSelection(food: FoodResult): PortionSelection {
  const options = buildFoodAmountOptions(food);
  const defaultOption = food.defaultAmount.kind === 'serving'
    ? options.find((option) => option.servingId === food.defaultAmount.servingId)
    : options.find((option) => option.kind === food.defaultAmount.kind)
      ?? options.find((option) => sameAmount(option.grams, food.defaultAmount.grams));
  const selected = defaultOption ?? options[0];
  const selectedServingId = selected?.kind === 'serving'
    ? selected.servingId
    : food.portions.some((portion) => portion.id === food.defaultAmount.servingId)
      ? food.defaultAmount.servingId
      : null;
  return {
    grams: food.defaultAmount.grams,
    mode: selected?.kind === 'serving' ? 'servings' : 'grams',
    selectedServingId,
    selectedAmountId: selected?.id ?? 'reference-100g',
  };
}

export function selectedServing(
  food: Pick<FoodResult, 'portions'>,
  selection: Pick<PortionSelection, 'selectedServingId'>,
): FoodPortion | null {
  if (!selection.selectedServingId) return null;
  return food.portions.find((portion) => portion.id === selection.selectedServingId) ?? null;
}

export function selectFoodAmount(
  selection: PortionSelection,
  option: FoodAmountOption,
): PortionSelection {
  return {
    grams: option.grams,
    mode: option.kind === 'serving' ? 'servings' : 'grams',
    selectedServingId: option.kind === 'reference'
      ? selection.selectedServingId
      : option.servingId ?? selection.selectedServingId,
    selectedAmountId: option.id,
  };
}

export function setPortionMode(
  selection: PortionSelection,
  mode: PortionMode,
  serving: FoodPortion | null,
): PortionSelection {
  if (mode === selection.mode || (mode === 'servings' && !serving)) return selection;
  return { ...selection, mode };
}

export function setServingAmount(
  selection: PortionSelection,
  servings: number,
  serving: FoodPortion | null,
): PortionSelection {
  if (!serving || !Number.isFinite(servings) || servings < MIN_SERVINGS) return selection;
  return {
    ...selection,
    grams: servings * serving.grams,
    mode: 'servings',
    selectedAmountId: 'custom-serving',
  };
}

export function setGramsAmount(selection: PortionSelection, grams: number): PortionSelection {
  if (!Number.isFinite(grams) || grams <= 0) return selection;
  return {
    ...selection,
    grams,
    mode: 'grams',
    selectedAmountId: 'custom-grams',
  };
}

export function servingsForSelection(
  selection: Pick<PortionSelection, 'grams'>,
  serving: FoodPortion | null,
): number {
  return serving ? selection.grams / serving.grams : 0;
}
