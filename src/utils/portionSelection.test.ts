import assert from 'node:assert/strict';
import test from 'node:test';

import type { FoodResult } from '../services/foodSearchTypes';
import {
  buildFoodAmountOptions,
  initialPortionSelection,
  selectFoodAmount,
  selectedServing,
  servingsForSelection,
  setGramsAmount,
  setPortionMode,
  setServingAmount,
} from './portionSelection';

function food(overrides: Partial<FoodResult> = {}): FoodResult {
  return {
    id: 'food',
    name: 'Rice',
    source: 'usda',
    sourceFoodId: '1',
    dataType: 'Foundation',
    brand: null,
    preparation: null,
    normalizedName: 'rice',
    caloriesPer100g: 130,
    proteinPer100g: 2.7,
    carbsPer100g: 28,
    fatPer100g: 0.3,
    portions: [{ id: 'serving', label: '1 serving', grams: 50 }],
    defaultAmount: { kind: 'last-logged', grams: 180, servingId: 'serving' },
    alternateSourceIds: [],
    ...overrides,
  };
}

test('builds last logged, genuine serving, and reference amount options', () => {
  assert.deepEqual(buildFoodAmountOptions(food()).map(({ kind, grams }) => ({ kind, grams })), [
    { kind: 'last-logged', grams: 180 },
    { kind: 'serving', grams: 50 },
    { kind: 'reference', grams: 100 },
  ]);
  assert.equal(buildFoodAmountOptions(food())[0].servingId, 'serving');
});

test('genuine serving wins equal-weight shortcut without losing metadata', () => {
  const result = food({
    portions: [{ id: 'bottle', label: '1 bottle (250 ml)', grams: 250 }],
    defaultAmount: { kind: 'last-logged', grams: 250, servingId: 'bottle' },
  });
  const options = buildFoodAmountOptions(result);
  assert.deepEqual(options.map(({ kind, label, grams }) => ({ kind, label, grams })), [
    { kind: 'serving', label: '1 bottle (250 ml)', grams: 250 },
    { kind: 'reference', label: '100 g', grams: 100 },
  ]);
  const selection = initialPortionSelection(result);
  assert.equal(selection.mode, 'servings');
  assert.equal(selectedServing(result, selection)?.id, 'bottle');
});

test('reference shortcut is omitted when default amount is already 100 grams', () => {
  const result = food({
    portions: [],
    defaultAmount: { kind: 'last-logged', grams: 100, servingId: null },
  });
  assert.deepEqual(buildFoodAmountOptions(result), [{
    id: 'last-logged',
    kind: 'last-logged',
    label: 'Last logged',
    grams: 100,
    servingId: null,
  }]);
});

test('mode switches preserve canonical grams', () => {
  const result = food({
    portions: [{ id: 'serving', label: '1 bowl', grams: 200 }],
    defaultAmount: { kind: 'last-logged', grams: 73, servingId: 'serving' },
  });
  const initial = initialPortionSelection(result);
  const serving = selectedServing(result, initial);
  const inServings = setPortionMode(initial, 'servings', serving);
  assert.equal(inServings.grams, 73);
  assert.equal(servingsForSelection(inServings, serving), 0.365);
  assert.equal(setPortionMode(inServings, 'grams', serving).grams, 73);
});

test('amount shortcuts and serving edits update mode without synthetic serving metadata', () => {
  const result = food();
  const initial = initialPortionSelection(result);
  const options = buildFoodAmountOptions(result);
  const servingOption = options.find((option) => option.kind === 'serving')!;
  const referenceOption = options.find((option) => option.kind === 'reference')!;
  const servingSelection = selectFoodAmount(initial, servingOption);
  assert.equal(servingSelection.mode, 'servings');
  assert.equal(servingSelection.selectedServingId, 'serving');
  const referenceSelection = selectFoodAmount(servingSelection, referenceOption);
  assert.equal(referenceSelection.mode, 'grams');
  assert.equal(referenceSelection.selectedServingId, 'serving');
  assert.equal(selectedServing(result, referenceSelection)?.label, '1 serving');
});

test('last logged shortcut restores its genuine source serving', () => {
  const result = food({
    portions: [
      { id: 'serving', label: '1 serving', grams: 50 },
      { id: 'alternate', label: '1 bowl', grams: 200 },
    ],
  });
  const options = buildFoodAmountOptions(result);
  const initial = initialPortionSelection(result);
  const alternate = options.find((option) => option.servingId === 'alternate')!;
  const lastLogged = options.find((option) => option.kind === 'last-logged')!;
  const restored = selectFoodAmount(selectFoodAmount(initial, alternate), lastLogged);
  assert.equal(restored.mode, 'grams');
  assert.equal(restored.grams, 180);
  assert.equal(restored.selectedServingId, 'serving');
});

test('serving and gram edits reject non-positive values', () => {
  const result = food();
  const initial = initialPortionSelection(result);
  const serving = selectedServing(result, initial);
  assert.equal(setServingAmount(initial, 0, serving), initial);
  assert.equal(setGramsAmount(initial, 0), initial);
  assert.equal(setServingAmount(initial, 0.1, serving).grams, 5);
  assert.equal(setGramsAmount(initial, 73).grams, 73);
});
