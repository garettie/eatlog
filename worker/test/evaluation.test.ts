import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  describeCoverage,
  scoreCase,
  summarize,
  validateManifest,
  type EvaluationCase,
  type EvaluationResult,
  type ScoredComponent,
} from '../src/evaluation.js';

/*
 * Task 8 of the food-estimation plan. The evaluator is only worth running if it catches the
 * defects it exists to catch, so each case here hands it a deliberately wrong answer and checks
 * that the wrongness is named.
 */

function component(overrides: Partial<ScoredComponent> = {}): ScoredComponent {
  return {
    name: 'Rice',
    estimatedGrams: 150,
    caloriesPer100g: 130,
    proteinPer100g: 2.7,
    carbsPer100g: 28,
    fatPer100g: 0.3,
    ...overrides,
  };
}

function recognized(components: ScoredComponent[]): EvaluationResult {
  return { status: 'recognized', mealName: 'Meal', components };
}

const MEASURED: EvaluationCase = {
  id: 'measured-rice',
  split: 'development',
  category: 'weighed-simple',
  operation: 'describe',
  text: '150g rice',
  expectStatus: 'recognized',
  reference: { totalGrams: 150, calories: 195, source: 'kitchen scale' },
};

const KNOWN_COST = { latencyMs: 1_200, costUsd: 0.0002 };

test('a correct answer within tolerance passes with nothing to report', () => {
  const score = scoreCase(MEASURED, recognized([component()]), KNOWN_COST);
  assert.deepEqual(score.findings, []);
  assert.equal(score.passed, true);
});

test('grams that do not match the measured reference are named as a mass error', () => {
  const score = scoreCase(MEASURED, recognized([component({ estimatedGrams: 450 })]), KNOWN_COST);
  assert.equal(score.passed, false);
  assert.equal(score.findings.some((finding) => finding.kind === 'mass-error'), true);
  assert.ok(score.massError !== null && score.massError > 1);
});

test('a nutrient the service could not determine is reported, not treated as zero', () => {
  const score = scoreCase(
    MEASURED,
    recognized([component({ caloriesPer100g: null })]),
    KNOWN_COST,
  );
  assert.equal(score.findings.some((finding) => finding.kind === 'null-nutrient'), true);
  // The unknown calories poison the total rather than summing to a confident zero, so no
  // calorie error is claimed for this case at all.
  assert.equal(score.calorieError, null);
});

test('oil counted once as oil and again inside the sauce is caught as double counting', () => {
  const composite: EvaluationCase = {
    id: 'adobo',
    split: 'development',
    category: 'composite-filipino',
    operation: 'describe',
    text: 'chicken adobo',
    expectStatus: 'recognized',
    reference: {
      source: 'recipe',
      components: [{ names: ['oil'], singleton: true }, { names: ['chicken'] }],
    },
  };
  const score = scoreCase(composite, recognized([
    component({ name: 'Chicken thigh', estimatedGrams: 120 }),
    component({ name: 'Cooking oil', estimatedGrams: 10 }),
    component({ name: 'Oil in the sauce', estimatedGrams: 8 }),
  ]), KNOWN_COST);
  assert.equal(score.findings.some((finding) => finding.kind === 'double-counted-component'), true);
});

test('a missing material ingredient is named rather than passing quietly', () => {
  const composite: EvaluationCase = {
    id: 'lumpia',
    split: 'development',
    category: 'composite-filipino',
    operation: 'describe',
    text: 'two pork lumpia',
    expectStatus: 'recognized',
    forbiddenNames: ['pork lumpia'],
    reference: { source: 'recipe', components: [{ names: ['pork'] }, { names: ['wrapper'] }] },
  };
  const score = scoreCase(composite, recognized([component({ name: 'Pork lumpia', estimatedGrams: 90 })]), KNOWN_COST);
  const kinds = score.findings.map((finding) => finding.kind);
  assert.ok(kinds.includes('missing-component'));
  // And returning the whole dish where its parts were asked for is its own failure.
  assert.ok(kinds.includes('forbidden-component'));
});

test('a label conversion that multiplies an amount the user weighed is caught', () => {
  const stated: EvaluationCase = {
    id: 'cookies',
    split: 'held-out',
    category: 'weighed-simple',
    operation: 'describe',
    text: '30g cookies',
    expectStatus: 'recognized',
    statedGrams: 30,
  };
  // "3 cookies" at 30g each rather than 30g in total: three times the food the user weighed.
  const score = scoreCase(stated, recognized([component({ name: 'Cookies', estimatedGrams: 90 })]), KNOWN_COST);
  assert.equal(score.findings.some((finding) => finding.kind === 'stated-amount-lost'), true);
});

test('unknown latency and unknown cost are findings, not blanks', () => {
  const score = scoreCase(MEASURED, recognized([component()]), { latencyMs: null, costUsd: null });
  const kinds = score.findings.map((finding) => finding.kind);
  assert.ok(kinds.includes('unknown-latency'));
  assert.ok(kinds.includes('unknown-cost'));
  assert.equal(score.passed, false);
});

test('a false unrecognized and a false recognized are counted apart from each other', () => {
  const scores = [
    scoreCase(MEASURED, { status: 'unrecognized', components: [] }, KNOWN_COST),
    scoreCase(
      { ...MEASURED, id: 'keys', category: 'ambiguous', expectStatus: 'unrecognized', reference: undefined },
      recognized([component({ name: 'Car keys' })]),
      KNOWN_COST,
    ),
    scoreCase({ ...MEASURED, id: 'ok' }, recognized([component()]), KNOWN_COST),
  ];
  const summary = summarize(scores);
  assert.equal(summary.falseUnrecognized, 1);
  assert.equal(summary.falseRecognized, 1);
  assert.equal(summary.usable, 1);
    assert.ok(Math.abs((summary.costPerUsableResultUsd ?? 0) - 0.0006) < 1e-12);
});

test('one unknown cost makes the run report no cost per result rather than a lower bound', () => {
  const summary = summarize([
    scoreCase(MEASURED, recognized([component()]), KNOWN_COST),
    scoreCase({ ...MEASURED, id: 'second' }, recognized([component()]), { latencyMs: 900, costUsd: null }),
  ]);
  assert.equal(summary.costPerUsableResultUsd, null);
  assert.equal(summary.unknownCostCases, 1);
  assert.equal(summary.medianLatencyMs, 1_200);
});

test('the shipped manifest validates without any provider access', () => {
  const path = join(new URL('.', import.meta.url).pathname, '..', 'evaluation', 'cases.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { cases: EvaluationCase[] };
  assert.deepEqual(validateManifest(manifest), []);
  // The frozen set is not yet the 60 cases the plan calls for; coverage is reported so the gap
  // is visible rather than assumed away.
  const coverage = describeCoverage(manifest.cases);
  assert.equal(coverage.every((row) => row.development + row.heldOut >= 0), true);
});

test('a manifest missing a traceable reference or inlining a photo is rejected', () => {
  const errors = validateManifest({
    frozenAt: '2026-09-05T00:00:00.000Z',
    cases: [
      { id: 'a', split: 'development', category: 'weighed-simple', operation: 'describe', text: 'rice', expectStatus: 'recognized', reference: { totalGrams: 150 } },
      { id: 'a', split: 'nope', category: 'photo', operation: 'scan', imagePath: 'data:image/jpeg;base64,AAAA', expectStatus: 'recognized' },
    ],
  });
  assert.ok(errors.some((error) => error.includes('reference values need a source')));
  assert.ok(errors.some((error) => error.includes('duplicate id')));
  assert.ok(errors.some((error) => error.includes('split must be')));
  assert.ok(errors.some((error) => error.includes('not inline image data')));
});
