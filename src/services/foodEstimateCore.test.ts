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

test('the largest valid estimate fits Google’s request limit on the My key route', () => {
  assert.ok(byteLength(buildGeminiEstimateBody(largestInput())) <= GEMINI_MAX_REQUEST_BYTES);
});
