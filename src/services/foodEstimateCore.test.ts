import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_CLARIFICATION_TEXT_LENGTH,
  MAX_COMPONENTS,
  MAX_CONTEXT_DESCRIPTION_LENGTH,
  MAX_CONTEXT_NAME_LENGTH,
  MAX_ESTIMATE_BODY_BYTES,
  MAX_IMAGE_BYTES,
  type EstimateInput,
  normalizeFoodEstimate,
  statedNutrition,
} from './foodEstimateCore';
import { GEMINI_MAX_REQUEST_BYTES, buildGeminiEstimateBody } from './foodEstimateGemini';

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/** The largest request either route can be asked to send: a full image and every field at its cap. */
function largestInput(): EstimateInput {
  // Four-byte UTF-8 characters, so a length cap in characters is measured at its worst in bytes.
  const wide = (length: number) => '🍚'.repeat(length);
  return {
    operation: 'clarify-meal',
    text: wide(MAX_CLARIFICATION_TEXT_LENGTH),
    imageBase64: 'A'.repeat(Math.ceil(MAX_IMAGE_BYTES / 3) * 4),
    context: {
      originalDescription: wide(MAX_CONTEXT_DESCRIPTION_LENGTH),
      mealName: wide(MAX_CONTEXT_NAME_LENGTH),
      components: Array.from({ length: MAX_COMPONENTS }, () => ({ name: wide(MAX_CONTEXT_NAME_LENGTH), estimatedGrams: 9999.999 })),
    },
  };
}

test('the largest valid estimate fits the Eatlog AI request body limit', () => {
  const { operation, ...fields } = largestInput();
  assert.ok(byteLength(JSON.stringify({ operation, ...fields })) <= MAX_ESTIMATE_BODY_BYTES);
});

test('the largest valid estimate fits Google’s request limit on the direct route', () => {
  assert.ok(byteLength(buildGeminiEstimateBody(largestInput())) <= GEMINI_MAX_REQUEST_BYTES);
});

function food(grams: number, calories: number, protein: number, carbs: number, fat: number) {
  return {
    name: 'Rice', estimatedGrams: grams, servingSizeGrams: null, servingLabel: null,
    caloriesPer100g: calories, proteinPer100g: protein, carbsPer100g: carbs, fatPer100g: fat,
    brand: null, preparation: null, confidence: 'medium', confidenceReason: null,
  };
}

function estimate(...components: ReturnType<typeof food>[]) {
  return { status: 'recognized', unrecognizedReason: null, mealName: 'Rice and egg', servesTotal: null, servingUnit: null, components };
}

function total(components: Array<Record<string, unknown>>, field: string): number {
  return components.reduce((sum, component) => sum + (component[field] as number) * (component.estimatedGrams as number) / 100, 0);
}

test('stated nutrition recognizes labels in either order without mistaking food weights for macros', () => {
  assert.deepEqual(statedNutrition('Rice 200g, 420 kcal, protein: 25g, 50g carbs, fat 12 g'), {
    caloriesPer100g: 420, proteinPer100g: 25, carbsPer100g: 50, fatPer100g: 12,
  });
  assert.deepEqual(statedNutrition('200g chicken and 50g rice'), {});
  assert.deepEqual(statedNutrition('200g protein shake'), {});
  assert.deepEqual(statedNutrition('150g fat-free yogurt'), {});
  assert.deepEqual(statedNutrition('100 calories per serving'), {});
  assert.deepEqual(statedNutrition('Calories: 100 per 100g'), {});
  assert.deepEqual(statedNutrition('Per serving:\nCalories 100'), {});
  assert.deepEqual(statedNutrition('Two servings of cereal. Per serving:\nCalories: 100\nProtein: 5g\nCarbs: 20g\nFat: 2g'), {});
  assert.deepEqual(statedNutrition('Egg: 70 calories\nRice: 200 calories'), {});
  assert.deepEqual(statedNutrition('Milk 200ml, calories 60/100g'), {});
  assert.deepEqual(statedNutrition('Rice 200g protein 30g'), { proteinPer100g: 30 });
  assert.deepEqual(statedNutrition('30g protein 50g carbs'), { proteinPer100g: 30, carbsPer100g: 50 });
  assert.deepEqual(statedNutrition('Calories: 1,200\n- Protein (g): 45\n- Carbs = 150 g\n- Fat: 40g'), {
    caloriesPer100g: 1200, proteinPer100g: 45, carbsPer100g: 150, fatPer100g: 40,
  });
});

test('explicit meal totals override model guesses across components and leave missing nutrients estimated', () => {
  const input: EstimateInput = { operation: 'describe', text: 'Rice and egg, 450 cals, 25g protein, carbs 50g, fats: 14g' };
  const result = normalizeFoodEstimate(estimate(food(180, 130, 2.7, 28, 0.3), food(50, 155, 13, 1, 11)), 'describe', input)!;
  const components = result.components as Array<Record<string, unknown>>;
  assert.ok(Math.abs(total(components, 'caloriesPer100g') - 450) < 0.001);
  assert.ok(Math.abs(total(components, 'proteinPer100g') - 25) < 0.001);
  assert.ok(Math.abs(total(components, 'carbsPer100g') - 50) < 0.001);
  assert.ok(Math.abs(total(components, 'fatPer100g') - 14) < 0.001);
  assert.equal(result.mealName, 'Rice and egg');

  const partial = normalizeFoodEstimate(estimate(food(100, 130, 2.7, 28, 0.3)), 'describe',
    { operation: 'describe', text: 'rice, 200 calories' })!;
  const component = (partial.components as Array<Record<string, unknown>>)[0];
  assert.equal(component.caloriesPer100g, 200);
  assert.equal(component.proteinPer100g, 2.7);
});

test('explicit values survive meal re-estimation, but meal totals do not overwrite a component clarification', () => {
  const answer = estimate(food(100, 130, 2.7, 28, 0.3));
  const context = { originalDescription: 'Rice, 250 calories', components: [{ name: 'Rice', estimatedGrams: 100 }] };
  const meal = normalizeFoodEstimate(answer, 'clarify-meal', { operation: 'clarify-meal', text: 'Rice', context })!;
  const component = normalizeFoodEstimate(answer, 'clarify-component', { operation: 'clarify-component', text: 'Rice', context })!;
  assert.equal((meal.components as Array<Record<string, unknown>>)[0].caloriesPer100g, 250);
  assert.equal((component.components as Array<Record<string, unknown>>)[0].caloriesPer100g, 130);
});

test('unrepresentable stated nutrition fails rather than silently changing the user value', () => {
  const result = normalizeFoodEstimate(estimate(food(20, 130, 2.7, 28, 0.3)), 'describe',
    { operation: 'describe', text: 'Tiny bite, 500 calories' });
  assert.equal(result, null);
});
