import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateAdaptiveRecommendation,
  evaluateAdaptiveEligibility,
  hashAdaptiveEvidence,
  type AdaptiveDailyCalories,
  type AdaptiveProfileEvidence,
  type AdaptiveRecommendationInput,
  type AdaptiveWeightReading,
} from './adaptiveRecommendations';

const reviewDate = '2026-01-14';
const dailyCalories: AdaptiveDailyCalories[] = Array.from({ length: 10 }, (_, index) => ({
  date: `2026-01-${String(index + 1).padStart(2, '0')}`,
  calories: 2000,
}));
const weights: AdaptiveWeightReading[] = [
  { date: '2026-01-01', scaleWeightKg: 80, trendWeightKg: 80 },
  { date: '2026-01-05', scaleWeightKg: 80, trendWeightKg: 80 },
  { date: '2026-01-10', scaleWeightKg: 80, trendWeightKg: 80 },
  { date: '2026-01-14', scaleWeightKg: 80, trendWeightKg: 80 },
];
const profile: AdaptiveProfileEvidence = {
  sex: 'male',
  heightCm: 180,
  birthDate: '1990-06-15',
  goalType: 'maintain',
  goalRateKgPerWeek: 0,
  proteinPreference: 'moderate',
};

function recommendationInput(
  overrides: Partial<AdaptiveRecommendationInput> = {},
): AdaptiveRecommendationInput {
  return {
    reviewDate,
    dailyCalories,
    weights,
    profile,
    previousTdee: 2000,
    previousTargetId: 42,
    ...overrides,
  };
}

test('eligibility reports an intake-day failure independently', () => {
  const result = evaluateAdaptiveEligibility({
    reviewDate,
    dailyCalories: dailyCalories.slice(0, 9),
    weights,
  });
  assert.equal(result.intakeDayCount, 9);
  assert.equal(result.weightLogCount, 4);
  assert.equal(result.hasEarlyWeight, true);
  assert.equal(result.hasLateWeight, true);
  assert.equal(result.endpointSpanDays, 13);
  assert.equal(result.eligible, false);
});

test('eligibility reports a weight-count failure independently', () => {
  const result = evaluateAdaptiveEligibility({
    reviewDate,
    dailyCalories,
    weights: [weights[0], weights[2], weights[3]],
  });
  assert.equal(result.intakeDayCount, 10);
  assert.equal(result.weightLogCount, 3);
  assert.equal(result.hasEarlyWeight, true);
  assert.equal(result.hasLateWeight, true);
  assert.equal(result.endpointSpanDays, 13);
  assert.equal(result.eligible, false);
});

test('eligibility enforces early endpoint coverage', () => {
  const result = evaluateAdaptiveEligibility({
    reviewDate,
    dailyCalories,
    weights: [
      { date: '2026-01-05', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-08', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-11', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-14', scaleWeightKg: 80, trendWeightKg: 80 },
    ],
  });
  assert.equal(result.hasEarlyWeight, false);
  assert.equal(result.hasLateWeight, true);
  assert.equal(result.endpointSpanDays, 9);
  assert.equal(result.eligible, false);
});

test('eligibility enforces late endpoint coverage', () => {
  const result = evaluateAdaptiveEligibility({
    reviewDate,
    dailyCalories,
    weights: [
      { date: '2026-01-01', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-04', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-07', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-10', scaleWeightKg: 80, trendWeightKg: 80 },
    ],
  });
  assert.equal(result.hasEarlyWeight, true);
  assert.equal(result.hasLateWeight, false);
  assert.equal(result.endpointSpanDays, 9);
  assert.equal(result.eligible, false);
});

test('eligibility enforces a seven-day endpoint span', () => {
  const result = evaluateAdaptiveEligibility({
    reviewDate,
    dailyCalories,
    weights: [
      { date: '2026-01-08', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-09', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-10', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-11', scaleWeightKg: 80, trendWeightKg: 80 },
    ],
  });
  assert.equal(result.endpointSpanDays, 3);
  assert.equal(result.eligible, false);
});

test('exact 10-intake-day and 4-weight boundary passes', () => {
  const result = evaluateAdaptiveEligibility({
    reviewDate,
    dailyCalories,
    weights: [
      { date: '2026-01-04', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-06', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-08', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-11', scaleWeightKg: 80, trendWeightKg: 80 },
    ],
  });
  assert.equal(result.intakeDayCount, 10);
  assert.equal(result.weightLogCount, 4);
  assert.equal(result.endpointSpanDays, 7);
  assert.equal(result.hasEarlyWeight, true);
  assert.equal(result.hasLateWeight, true);
  assert.equal(result.eligible, true);
});

test('weight gain lowers inferred TDEE relative to equal intake', () => {
  const stable = calculateAdaptiveRecommendation(recommendationInput());
  const gaining = calculateAdaptiveRecommendation(recommendationInput({
    weights: weights.map((row, index) => ({
      ...row,
      trendWeightKg: index === weights.length - 1 ? 81 : row.trendWeightKg,
    })),
  }));
  assert.ok(gaining.rawTdee < stable.rawTdee);
});

test('weight loss raises inferred TDEE relative to equal intake', () => {
  const stable = calculateAdaptiveRecommendation(recommendationInput());
  const losing = calculateAdaptiveRecommendation(recommendationInput({
    weights: weights.map((row, index) => ({
      ...row,
      trendWeightKg: index === weights.length - 1 ? 79 : row.trendWeightKg,
    })),
  }));
  assert.ok(losing.rawTdee > stable.rawTdee);
});

test('proposed TDEE is clamped to plus or minus 10 percent', () => {
  const previousTdee = 2500;
  const gain = calculateAdaptiveRecommendation(recommendationInput({
    previousTdee,
    weights: weights.map((row, index) => ({
      ...row,
      trendWeightKg: index === weights.length - 1 ? 84 : row.trendWeightKg,
    })),
  }));
  const loss = calculateAdaptiveRecommendation(recommendationInput({
    previousTdee,
    weights: weights.map((row, index) => ({
      ...row,
      trendWeightKg: index === weights.length - 1 ? 76 : row.trendWeightKg,
    })),
  }));
  assert.equal(gain.proposedTdee, 2250);
  assert.equal(loss.proposedTdee, 2750);
});

test('BMR expenditure floor can override the TDEE clamp', () => {
  const result = calculateAdaptiveRecommendation(recommendationInput({
    dailyCalories: dailyCalories.map((row) => ({ ...row, calories: 1500 })),
    weights: weights.map((row) => ({ ...row, scaleWeightKg: 200, trendWeightKg: 200 })),
    profile: {
      ...profile,
      heightCm: 200,
      birthDate: '2000-01-01',
    },
    previousTdee: 2000,
  }));
  assert.equal(result.proposedTdee, Math.round(result.tdeeFloor));
  assert.ok(result.proposedTdee > 2200);
});

test('calorie target cannot fall below the expenditure floor', () => {
  const result = calculateAdaptiveRecommendation(recommendationInput({
    weights: weights.map((row) => ({ ...row, scaleWeightKg: 200, trendWeightKg: 200 })),
    profile: {
      ...profile,
      heightCm: 200,
      birthDate: '2000-01-01',
      goalType: 'cut',
      goalRateKgPerWeek: -1,
    },
  }));
  assert.ok(result.targetCalories >= Math.round(result.tdeeFloor));
});

test('cut, maintain, and bulk goal rates adjust target calories', () => {
  const shared = {
    dailyCalories: dailyCalories.map((row) => ({ ...row, calories: 2500 })),
    weights: weights.map((row) => ({ ...row, scaleWeightKg: 60, trendWeightKg: 60 })),
    previousTdee: 2500,
  };
  const cut = calculateAdaptiveRecommendation(recommendationInput({
    ...shared,
    profile: { ...profile, sex: 'female', heightCm: 160, goalType: 'cut', goalRateKgPerWeek: -0.5 },
  }));
  const maintain = calculateAdaptiveRecommendation(recommendationInput({
    ...shared,
    profile: { ...profile, sex: 'female', heightCm: 160, goalType: 'maintain', goalRateKgPerWeek: 0 },
  }));
  const bulk = calculateAdaptiveRecommendation(recommendationInput({
    ...shared,
    profile: { ...profile, sex: 'female', heightCm: 160, goalType: 'bulk', goalRateKgPerWeek: 0.5 },
  }));
  assert.equal(cut.targetCalories, 1950);
  assert.equal(maintain.targetCalories, 2500);
  assert.equal(bulk.targetCalories, 3050);
});

test('evidence hash is deterministic for the ordered payload', () => {
  const input = recommendationInput();
  const first = calculateAdaptiveRecommendation(input);
  const reordered = calculateAdaptiveRecommendation({
    ...input,
    dailyCalories: [...input.dailyCalories].reverse(),
    weights: [...input.weights].reverse(),
  });
  assert.equal(first.evidenceHash, reordered.evidenceHash);

  const changedHash = hashAdaptiveEvidence({
    windowStart: first.windowStart,
    windowEnd: first.windowEnd,
    dailyCalories: input.dailyCalories.map((row, index) => (
      index === 0 ? { ...row, calories: row.calories + 1 } : row
    )),
    weights: input.weights,
    profile: input.profile,
    previousTargetId: input.previousTargetId,
  });
  assert.notEqual(first.evidenceHash, changedHash);
});

test('evidence hash uses stable 32-bit FNV-1a output', () => {
  assert.equal(hashAdaptiveEvidence({
    windowStart: '2026-01-01',
    windowEnd: '2026-01-14',
    dailyCalories: [{ date: '2026-01-01', calories: 2000 }],
    weights: [{ date: '2026-01-01', scaleWeightKg: 80, trendWeightKg: 80 }],
    profile,
    previousTargetId: 42,
  }), 'e67859af');
});

test('missing food dates are excluded rather than zero-filled', () => {
  const result = calculateAdaptiveRecommendation(recommendationInput());
  assert.equal(result.eligibility.intakeDayCount, 10);
  assert.equal(result.averageIntakeKcal, 2000);
});
