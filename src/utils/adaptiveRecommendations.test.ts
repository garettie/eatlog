import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADAPTIVE_ALGORITHM_CONFIG,
  type AdaptiveAlgorithmConfig,
} from './adaptiveAlgorithmConfig';
import {
  AdaptiveInputError,
  calculateAdaptiveRecommendation,
  estimateWeightSlopeKgPerDay,
  evaluateAdaptiveEligibility,
  hashAdaptiveEvidence,
  type AdaptiveDailyCalories,
  type AdaptiveEvidencePayload,
  type AdaptiveProfileEvidence,
  type AdaptiveRecommendation,
  type AdaptiveRecommendationInput,
  type AdaptiveWeightReading,
} from './adaptiveRecommendations';
import { addCalendarDays } from './calendar';
import { gateAdaptiveReview } from './adaptiveReviewGate';

const reviewDate = '2026-01-28';
const dailyCalories: AdaptiveDailyCalories[] = Array.from({ length: 28 }, (_, index) => ({
  date: addCalendarDays(reviewDate, index - 27),
  calories: 2000,
}));
const weights: AdaptiveWeightReading[] = [
  { date: '2026-01-01', scaleWeightKg: 80, trendWeightKg: 80 },
  { date: '2026-01-08', scaleWeightKg: 80, trendWeightKg: 80 },
  { date: '2026-01-15', scaleWeightKg: 80, trendWeightKg: 80 },
  { date: '2026-01-28', scaleWeightKg: 80, trendWeightKg: 80 },
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

function successful(input: AdaptiveRecommendationInput): AdaptiveRecommendation {
  const result = calculateAdaptiveRecommendation(input);
  assert.equal(result.kind, 'recommendation');
  return result.recommendation;
}

function config(overrides: Partial<AdaptiveAlgorithmConfig> = {}): AdaptiveAlgorithmConfig {
  return { ...ADAPTIVE_ALGORITHM_CONFIG, ...overrides };
}

function evidencePayload(
  overrides: Partial<AdaptiveEvidencePayload> = {},
): AdaptiveEvidencePayload {
  return {
    algorithmVersion: ADAPTIVE_ALGORITHM_CONFIG.algorithmVersion,
    config: config(),
    configuredWindowStart: '2026-01-01',
    configuredWindowEnd: reviewDate,
    estimationStart: '2026-01-01',
    estimationEnd: reviewDate,
    dailyCalories,
    intakeDayConfirmations: [],
    weights,
    profile,
    previousTdee: 2000,
    previousTargetId: 42,
    ...overrides,
  };
}

function closeTo(actual: number, expected: number, tolerance = 1e-10): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('eligibility reports aligned evidence and configured/effective intervals', () => {
  const result = evaluateAdaptiveEligibility({ reviewDate, dailyCalories, weights });
  assert.equal(result.configuredWindowStart, '2026-01-01');
  assert.equal(result.configuredWindowEnd, reviewDate);
  assert.equal(result.estimationStart, '2026-01-01');
  assert.equal(result.estimationEnd, reviewDate);
  assert.equal(result.alignedIntakeDayCount, 28);
  assert.equal(result.alignedWeightReadingCount, 4);
  assert.equal(result.elapsedSpanDays, 27);
  assert.equal(result.daysSinceLastWeight, 0);
  assert.equal(result.intakeEvidenceCompleteness, 'positive_logged_days_provisional');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.eligible, true);
});

test('eligibility applies existing thresholds after calorie/weight alignment', () => {
  const result = evaluateAdaptiveEligibility({
    reviewDate,
    dailyCalories,
    weights: [
      { date: '2026-01-04', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-09', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-14', scaleWeightKg: 80, trendWeightKg: 80 },
      { date: '2026-01-18', scaleWeightKg: 80, trendWeightKg: 80 },
    ],
  });
  assert.equal(result.alignedIntakeDayCount, 15);
  assert.equal(result.alignedWeightReadingCount, 4);
  assert.equal(result.elapsedSpanDays, 14);
  assert.deepEqual(result.reasons, ['stale_weight_evidence']);
  assert.equal(result.eligible, false);
});

test('ineligible calculation returns explicit reasons instead of throwing', () => {
  const result = calculateAdaptiveRecommendation(recommendationInput({
    weights: weights.slice(0, 1),
  }));
  assert.equal(result.kind, 'ineligible');
  assert.ok(result.reasons.includes('insufficient_weight_readings'));
  assert.ok(result.reasons.includes('insufficient_weight_span'));
});

test('OLS slope is near zero for flat weight', () => {
  closeTo(estimateWeightSlopeKgPerDay(weights.map((row) => ({
    date: row.date,
    weightKg: row.scaleWeightKg,
  }))), 0);
});

test('OLS slope has the correct sign and magnitude for linear loss and gain', () => {
  const dates = ['2026-01-01', '2026-01-03', '2026-01-08', '2026-01-14'];
  const loss = dates.map((date, index) => ({
    date,
    weightKg: 80 - [0, 2, 7, 13][index] * 0.05,
  }));
  const gain = dates.map((date, index) => ({
    date,
    weightKg: 80 + [0, 2, 7, 13][index] * 0.04,
  }));
  closeTo(estimateWeightSlopeKgPerDay(loss), -0.05);
  closeTo(estimateWeightSlopeKgPerDay(gain), 0.04);
});

test('adding intermediate points on the same line does not change OLS slope', () => {
  const endpoints = [
    { date: '2026-01-01', weightKg: 80 },
    { date: '2026-01-14', weightKg: 79.35 },
  ];
  const withIntermediate = [
    endpoints[0],
    { date: '2026-01-04', weightKg: 79.85 },
    { date: '2026-01-09', weightKg: 79.6 },
    endpoints[1],
  ];
  closeTo(estimateWeightSlopeKgPerDay(endpoints), -0.05);
  closeTo(estimateWeightSlopeKgPerDay(withIntermediate), -0.05);
});

test('OLS rejects fewer than two dates, duplicate dates, and invalid weights', () => {
  assert.throws(() => estimateWeightSlopeKgPerDay([
    { date: '2026-01-01', weightKg: 80 },
  ]), /at least two/);
  assert.throws(() => estimateWeightSlopeKgPerDay([
    { date: '2026-01-01', weightKg: 80 },
    { date: '2026-01-01', weightKg: 79 },
  ]), /Duplicate/);
  assert.throws(() => estimateWeightSlopeKgPerDay([
    { date: '2026-01-01', weightKg: 80 },
    { date: '2026-01-02', weightKg: Number.NaN },
  ]), /finite and positive/);
});

test('calculation uses raw scale weights for OLS rather than trend endpoints', () => {
  const result = successful(recommendationInput({
    weights: weights.map((row, index) => ({
      ...row,
      scaleWeightKg: 80 - index * 0.25,
      trendWeightKg: 80,
    })),
  }));
  assert.ok(result.weightSlopeKgPerDay < 0);
  assert.ok(result.estimatedTdee > result.averageIntakeKcal);
});

test('proposed TDEE is clamped to plus or minus the configured limit', () => {
  const previousTdee = 2500;
  const gain = successful(recommendationInput({
    previousTdee,
    weights: weights.map((row, index) => ({
      ...row,
      scaleWeightKg: index === weights.length - 1 ? 84 : row.scaleWeightKg,
    })),
  }));
  const loss = successful(recommendationInput({
    previousTdee,
    weights: weights.map((row, index) => ({
      ...row,
      scaleWeightKg: index === weights.length - 1 ? 76 : row.scaleWeightKg,
    })),
  }));
  assert.equal(gain.proposedTdee, 2250);
  assert.equal(loss.proposedTdee, 2750);
});

test('optional absolute TDEE limit applies alongside the relative limit', () => {
  const result = successful(recommendationInput({
    previousTdee: 2500,
    config: config({ maximumTdeeChangeKcal: 100 }),
    weights: weights.map((row, index) => ({
      ...row,
      scaleWeightKg: index === weights.length - 1 ? 76 : row.scaleWeightKg,
    })),
  }));
  assert.equal(result.proposedTdee, 2600);
});

test('BMR-floor conflict produces a paused result', () => {
  const result = calculateAdaptiveRecommendation(recommendationInput({
    dailyCalories: dailyCalories.map((row) => ({ ...row, calories: 1500 })),
    weights: weights.map((row) => ({ ...row, scaleWeightKg: 200, trendWeightKg: 200 })),
    profile: { ...profile, heightCm: 200, birthDate: '2000-01-01' },
    previousTdee: 2000,
  }));
  assert.equal(result.kind, 'paused');
  assert.equal(result.reason, 'tdee_floor_conflict');
  assert.ok(result.tdeeFloor > result.permittedUpperTdee);
});

test('macro allocation conflict produces a paused result', () => {
  const heavyWeights = weights.map((row) => ({
    ...row,
    scaleWeightKg: 100,
    trendWeightKg: 100,
  }));
  const result = calculateAdaptiveRecommendation(recommendationInput({
    dailyCalories: dailyCalories.map((row) => ({ ...row, calories: 1300 })),
    weights: heavyWeights,
    profile: {
      ...profile,
      sex: 'female',
      heightCm: 100,
      birthDate: '1926-01-14',
      goalType: 'cut',
      goalRateKgPerWeek: -1,
      proteinPreference: 'extra_high',
    },
    previousTdee: 1300,
  }));
  assert.equal(result.kind, 'paused');
  assert.equal(result.reason, 'macro_target_infeasible');
  assert.ok(Math.abs(result.allocatedTargetCalories - result.requestedTargetCalories)
    > ADAPTIVE_ALGORITHM_CONFIG.macroCalorieToleranceKcal);
});

test('cut, maintain, and bulk goal rates adjust target calories', () => {
  const shared = {
    dailyCalories: dailyCalories.map((row) => ({ ...row, calories: 2500 })),
    weights: weights.map((row) => ({ ...row, scaleWeightKg: 60, trendWeightKg: 60 })),
    previousTdee: 2500,
  };
  const cut = successful(recommendationInput({
    ...shared,
    profile: { ...profile, sex: 'female', heightCm: 160, goalType: 'cut', goalRateKgPerWeek: -0.5 },
  }));
  const maintain = successful(recommendationInput({
    ...shared,
    profile: { ...profile, sex: 'female', heightCm: 160, goalType: 'maintain', goalRateKgPerWeek: 0 },
  }));
  const bulk = successful(recommendationInput({
    ...shared,
    profile: { ...profile, sex: 'female', heightCm: 160, goalType: 'bulk', goalRateKgPerWeek: 0.5 },
  }));
  assert.equal(cut.targetCalories, 1950);
  assert.equal(maintain.targetCalories, 2500);
  assert.equal(bulk.targetCalories, 3050);
});

test('calories outside the aligned interval do not affect average intake', () => {
  const alignedWeights = [
    { date: '2026-01-04', scaleWeightKg: 80, trendWeightKg: 80 },
    { date: '2026-01-11', scaleWeightKg: 80, trendWeightKg: 80 },
    { date: '2026-01-18', scaleWeightKg: 80, trendWeightKg: 80 },
    { date: '2026-01-28', scaleWeightKg: 80, trendWeightKg: 80 },
  ];
  const calories = dailyCalories.map((row) => ({
    ...row,
    calories: row.date < '2026-01-04' ? 5000 : 2000,
  }));
  const result = successful(recommendationInput({ dailyCalories: calories, weights: alignedWeights }));
  assert.equal(result.estimationStart, '2026-01-04');
  assert.equal(result.alignedIntakeDayCount, 25);
  assert.equal(result.averageIntakeKcal, 2000);
});

test('adding calories to every aligned logged day raises estimated TDEE equally', () => {
  const baseline = successful(recommendationInput());
  const increase = 175;
  const changed = successful(recommendationInput({
    dailyCalories: dailyCalories.map((row) => ({ ...row, calories: row.calories + increase })),
  }));
  closeTo(changed.estimatedTdee - baseline.estimatedTdee, increase);
});

test('shuffling evidence rows does not change slope, fingerprint, or recommendation', () => {
  const first = successful(recommendationInput());
  const shuffled = successful(recommendationInput({
    dailyCalories: [...dailyCalories].reverse(),
    weights: [weights[2], weights[0], weights[3], weights[1]],
  }));
  assert.equal(shuffled.weightSlopeKgPerDay, first.weightSlopeKgPerDay);
  assert.equal(shuffled.evidenceHash, first.evidenceHash);
  assert.deepEqual(shuffled, first);
});

test('valid out-of-window rows do not change recommendation', () => {
  const first = successful(recommendationInput());
  const changed = successful(recommendationInput({
    dailyCalories: [
      { date: '2025-12-01', calories: 9999 },
      ...dailyCalories,
      { date: '2026-01-29', calories: 9999 },
    ],
    weights: [
      { date: '2025-12-01', scaleWeightKg: 200, trendWeightKg: 200 },
      ...weights,
      { date: '2026-01-29', scaleWeightKg: 20, trendWeightKg: 20 },
    ],
  }));
  assert.deepEqual(changed, first);
});

test('fingerprint changes with previous TDEE and algorithm version', () => {
  const first = hashAdaptiveEvidence(evidencePayload());
  const previousChanged = hashAdaptiveEvidence(evidencePayload({ previousTdee: 2100 }));
  const versionConfig = config({ algorithmVersion: 5 });
  const versionChanged = hashAdaptiveEvidence(evidencePayload({
    algorithmVersion: 5,
    config: versionConfig,
  }));
  assert.match(first, /^fnv1a32-v2:[0-9a-f]{8}$/);
  assert.notEqual(first, previousChanged);
  assert.notEqual(first, versionChanged);
});

test('fingerprint normalizes equivalent calorie evidence independent of row order', () => {
  const split = dailyCalories.flatMap((row) => [
    { date: row.date, calories: 750 },
    { date: row.date, calories: 1250 },
  ]);
  assert.equal(
    hashAdaptiveEvidence(evidencePayload()),
    hashAdaptiveEvidence(evidencePayload({ dailyCalories: split.reverse() })),
  );
});

test('strict runtime validation rejects invalid external values', () => {
  const invalidInputs: AdaptiveRecommendationInput[] = [
    recommendationInput({ reviewDate: '2026-02-30' }),
    recommendationInput({ dailyCalories: [{ date: '2026-01-01', calories: -1 }] }),
    recommendationInput({
      dailyCalories: [
        { date: '2026-01-01', calories: 1e308 },
        { date: '2026-01-01', calories: 1e308 },
      ],
    }),
    recommendationInput({ weights: [{ date: '2026-01-01', scaleWeightKg: 0, trendWeightKg: 80 }] }),
    recommendationInput({ weights: [{ date: '2026-01-01', scaleWeightKg: 80, trendWeightKg: Number.NaN }] }),
    recommendationInput({ profile: { ...profile, heightCm: 0 } }),
    recommendationInput({ profile: { ...profile, birthDate: '2027-01-01' } }),
    recommendationInput({ profile: { ...profile, sex: 'other' as never } }),
    recommendationInput({ profile: { ...profile, goalType: 'lose' as never } }),
    recommendationInput({ profile: { ...profile, proteinPreference: 'maximum' as never } }),
    recommendationInput({ previousTdee: Number.POSITIVE_INFINITY }),
    recommendationInput({ previousTargetId: 0 }),
    recommendationInput({ previousTargetId: 1.5 }),
    recommendationInput({
      intakeDayConfirmations: [{
        date: '2026-01-08',
        status: 'unknown' as never,
        source: 'adaptive_review',
      }],
    }),
    recommendationInput({
      intakeDayConfirmations: [{
        date: '2026-01-08',
        status: 'complete',
        source: 'import' as never,
      }],
    }),
  ];
  for (const input of invalidInputs) {
    assert.throws(() => calculateAdaptiveRecommendation(input), AdaptiveInputError);
  }
});

test('contradictory and out-of-range goal rates reject', () => {
  for (const invalidProfile of [
    { ...profile, goalType: 'cut' as const, goalRateKgPerWeek: 0.5 },
    { ...profile, goalType: 'bulk' as const, goalRateKgPerWeek: -0.5 },
    { ...profile, goalType: 'maintain' as const, goalRateKgPerWeek: 0.1 },
  ]) {
    assert.throws(
      () => calculateAdaptiveRecommendation(recommendationInput({ profile: invalidProfile })),
      /Goal rate is invalid/,
    );
  }
});

test('fingerprint rejects non-finite values before serialization', () => {
  assert.throws(
    () => hashAdaptiveEvidence(evidencePayload({ previousTdee: Number.NaN })),
    AdaptiveInputError,
  );
});

test('every numeric recommendation field is finite', () => {
  const result = successful(recommendationInput());
  const numericFields = Object.values(result).filter((value): value is number => typeof value === 'number');
  assert.ok(numericFields.length > 0);
  assert.ok(numericFields.every(Number.isFinite));
});

test('missing food dates remain absent rather than being zero-filled', () => {
  const calories = dailyCalories.slice(0, 10);
  const result = successful(recommendationInput({ dailyCalories: calories }));
  assert.equal(result.alignedIntakeDayCount, 10);
  assert.equal(result.averageIntakeKcal, 2000);
});

test('normal provisional days proceed without confirmation', () => {
  const result = calculateAdaptiveRecommendation(recommendationInput());
  assert.equal(result.kind, 'recommendation');
  assert.equal(
    result.recommendation.eligibility.intakeEvidenceCompleteness,
    'positive_logged_days_provisional',
  );
});

const sparseReviewDate = '2026-02-04';
const sparseCalories: AdaptiveDailyCalories[] = Array.from({ length: 28 }, (_, index) => ({
  date: addCalendarDays(sparseReviewDate, index - 27),
  calories: 2000,
}));

function sparseWeights(
  offsets: number[],
  weightAt: (elapsedFromWindowStart: number, index: number) => number = () => 80,
): AdaptiveWeightReading[] {
  return offsets.map((offset, index) => {
    const weight = weightAt(offset + 27, index);
    return {
      date: addCalendarDays(sparseReviewDate, offset),
      scaleWeightKg: weight,
      trendWeightKg: weight,
    };
  });
}

interface SparseScenario {
  name: string;
  readings: AdaptiveWeightReading[];
  expectedKind: 'ineligible' | 'recommendation';
  expectedSlope?: number;
}

const sparseScenarios: SparseScenario[] = [
  {
    name: 'one reading in 35 days',
    readings: sparseWeights([-1]),
    expectedKind: 'ineligible',
  },
  {
    name: 'two readings one week apart',
    readings: sparseWeights([-13, -6]),
    expectedKind: 'ineligible',
  },
  {
    name: 'two readings four weeks apart',
    readings: sparseWeights([-28, 0]),
    expectedKind: 'ineligible',
  },
  {
    name: 'four readings clustered in one week',
    readings: sparseWeights([-7, -6, -5, -4]),
    expectedKind: 'ineligible',
  },
  {
    name: 'five readings spread across 28 days',
    readings: sparseWeights([-27, -21, -14, -7, 0]),
    expectedKind: 'recommendation',
    expectedSlope: 0,
  },
  {
    name: 'two readings per week for four weeks',
    readings: sparseWeights([-26, -24, -19, -17, -12, -10, -5, 0]),
    expectedKind: 'recommendation',
    expectedSlope: 0,
  },
  {
    name: 'five readings per week for four weeks',
    readings: sparseWeights([
      -27, -26, -23, -22, -21,
      -20, -19, -16, -15, -14,
      -13, -12, -9, -8, -7,
      -6, -5, -2, -1, 0,
    ]),
    expectedKind: 'recommendation',
    expectedSlope: 0,
  },
  {
    name: 'one missing week between otherwise regular readings',
    readings: sparseWeights([-21, -20, -7, 0]),
    expectedKind: 'recommendation',
    expectedSlope: 0,
  },
  {
    name: 'no recent reading',
    readings: sparseWeights([-27, -21, -14, -8]),
    expectedKind: 'ineligible',
  },
  {
    name: 'single 0.5 kg outlier at the beginning',
    readings: sparseWeights([-21, -14, -7, 0], (_, index) => index === 0 ? 80.5 : 80),
    expectedKind: 'recommendation',
    expectedSlope: -3 / 140,
  },
  {
    name: 'single 0.5 kg outlier at the end',
    readings: sparseWeights([-21, -14, -7, 0], (_, index) => index === 3 ? 80.5 : 80),
    expectedKind: 'recommendation',
    expectedSlope: 3 / 140,
  },
  {
    name: 'symmetric noise around a flat true weight',
    readings: sparseWeights([-21, -14, -7, 0], (_, index) => [80.5, 79.5, 79.5, 80.5][index]),
    expectedKind: 'recommendation',
    expectedSlope: 0,
  },
  {
    name: 'linear loss with irregular reading dates',
    readings: sparseWeights([-21, -18, -10, 0], (elapsed) => 80 - elapsed * 0.05),
    expectedKind: 'recommendation',
    expectedSlope: -0.05,
  },
  {
    name: 'linear gain with irregular reading dates',
    readings: sparseWeights([-21, -17, -6, 0], (elapsed) => 80 + elapsed * 0.04),
    expectedKind: 'recommendation',
    expectedSlope: 0.04,
  },
];

for (const scenario of sparseScenarios) {
  test(`sparse evidence: ${scenario.name}`, () => {
    const result = calculateAdaptiveRecommendation({
      reviewDate: sparseReviewDate,
      dailyCalories: sparseCalories,
      weights: scenario.readings,
      profile,
      previousTdee: 2000,
      previousTargetId: 42,
    });
    assert.equal(result.kind, scenario.expectedKind);
    if (result.kind === 'recommendation') {
      assert.notEqual(scenario.expectedSlope, undefined);
      closeTo(result.recommendation.weightSlopeKgPerDay, scenario.expectedSlope!);
    }
  });
}

test('28-day window includes ages 26 and 27 days but excludes age 28 days', () => {
  for (const [ageDays, expectedCount] of [[26, 1], [27, 1], [28, 0]] as const) {
    const result = evaluateAdaptiveEligibility({
      reviewDate: sparseReviewDate,
      dailyCalories: sparseCalories,
      weights: sparseWeights([-ageDays]),
    });
    assert.equal(result.alignedWeightReadingCount, expectedCount, `${ageDays + 1} inclusive dates`);
  }
});

test('four readings are required; three readings remain ineligible', () => {
  const three = calculateAdaptiveRecommendation(recommendationInput({
    reviewDate: sparseReviewDate,
    dailyCalories: sparseCalories,
    weights: sparseWeights([-21, -14, 0]),
  }));
  const four = calculateAdaptiveRecommendation(recommendationInput({
    reviewDate: sparseReviewDate,
    dailyCalories: sparseCalories,
    weights: sparseWeights([-21, -14, -7, 0]),
  }));
  assert.equal(three.kind, 'ineligible');
  assert.ok(three.reasons.includes('insufficient_weight_readings'));
  assert.equal(four.kind, 'recommendation');
});

test('weight spans of 13, 14, and 15 elapsed days enforce the 14-day boundary', () => {
  for (const [span, expectedKind] of [[13, 'ineligible'], [14, 'recommendation'], [15, 'recommendation']] as const) {
    const result = calculateAdaptiveRecommendation(recommendationInput({
      reviewDate: sparseReviewDate,
      dailyCalories: sparseCalories,
      weights: sparseWeights([-span, -Math.ceil(span * 2 / 3), -Math.ceil(span / 3), 0]),
    }));
    assert.equal(result.kind, expectedKind, `${span}-day span`);
  }
});

test('latest reading ages of 6, 7, and 8 days enforce the 7-day recency boundary', () => {
  for (const [ageDays, expectedKind] of [[6, 'recommendation'], [7, 'recommendation'], [8, 'ineligible']] as const) {
    const result = calculateAdaptiveRecommendation(recommendationInput({
      reviewDate: sparseReviewDate,
      dailyCalories: sparseCalories,
      weights: sparseWeights([-27, -21, -14, -ageDays]),
    }));
    assert.equal(result.kind, expectedKind, `${ageDays}-day-old latest reading`);
    if (result.kind === 'ineligible' && ageDays === 8) {
      assert.ok(result.reasons.includes('stale_weight_evidence'));
    }
  }
});

test('four weekly readings spanning 21 days qualify', () => {
  const result = calculateAdaptiveRecommendation(recommendationInput({
    reviewDate: sparseReviewDate,
    dailyCalories: sparseCalories,
    weights: sparseWeights([-21, -14, -7, 0]),
  }));
  assert.equal(result.kind, 'recommendation');
});

test('twice-weekly readings spanning exactly 14 days qualify', () => {
  const result = calculateAdaptiveRecommendation(recommendationInput({
    reviewDate: sparseReviewDate,
    dailyCalories: sparseCalories,
    weights: sparseWeights([-14, -11, -7, -4, 0]),
  }));
  assert.equal(result.kind, 'recommendation');
});

test('an eligible user becomes stale after eight days without a new weigh-in', () => {
  const originalWeights = sparseWeights([-19, -14, -7, 0]);
  const eligible = calculateAdaptiveRecommendation(recommendationInput({
    reviewDate: sparseReviewDate,
    dailyCalories: sparseCalories,
    weights: originalWeights,
  }));
  const laterReviewDate = addCalendarDays(sparseReviewDate, 8);
  const stale = calculateAdaptiveRecommendation(recommendationInput({
    reviewDate: laterReviewDate,
    dailyCalories: Array.from({ length: 28 }, (_, index) => ({
      date: addCalendarDays(laterReviewDate, index - 27),
      calories: 2000,
    })),
    weights: originalWeights,
  }));
  assert.equal(eligible.kind, 'recommendation');
  assert.equal(stale.kind, 'ineligible');
  assert.ok(stale.reasons.includes('stale_weight_evidence'));
});

test('a stale user becomes eligible immediately after a new weigh-in', () => {
  const originalWeights = sparseWeights([-19, -14, -7, 0]);
  const laterReviewDate = addCalendarDays(sparseReviewDate, 8);
  const laterCalories = Array.from({ length: 28 }, (_, index) => ({
    date: addCalendarDays(laterReviewDate, index - 27),
    calories: 2000,
  }));
  const stale = calculateAdaptiveRecommendation(recommendationInput({
    reviewDate: laterReviewDate,
    dailyCalories: laterCalories,
    weights: originalWeights,
  }));
  const restored = calculateAdaptiveRecommendation(recommendationInput({
    reviewDate: laterReviewDate,
    dailyCalories: laterCalories,
    weights: [...originalWeights, {
      date: laterReviewDate,
      scaleWeightKg: 80,
      trendWeightKg: 80,
    }],
  }));
  assert.equal(stale.kind, 'ineligible');
  assert.equal(restored.kind, 'recommendation');
});

test('old readings fall outside the rolling 28-day window', () => {
  const result = calculateAdaptiveRecommendation(recommendationInput({
    reviewDate: sparseReviewDate,
    dailyCalories: sparseCalories,
    weights: sparseWeights([-28, -21, -14, -7, 0]),
  }));
  assert.equal(result.kind, 'recommendation');
  assert.equal(result.recommendation.alignedWeightReadingCount, 4);
  assert.equal(result.recommendation.estimationStart, addCalendarDays(sparseReviewDate, -21));
});

test('eligibility restoration changes the fingerprint used for a pending review', () => {
  const originalWeights = sparseWeights([-19, -14, -7, 0]);
  const first = calculateAdaptiveRecommendation(recommendationInput({
    reviewDate: sparseReviewDate,
    dailyCalories: sparseCalories,
    weights: originalWeights,
  }));
  assert.equal(first.kind, 'recommendation');
  const laterReviewDate = addCalendarDays(sparseReviewDate, 8);
  const laterCalories = Array.from({ length: 28 }, (_, index) => ({
    date: addCalendarDays(laterReviewDate, index - 27),
    calories: 2000,
  }));
  const restored = calculateAdaptiveRecommendation(recommendationInput({
    reviewDate: laterReviewDate,
    dailyCalories: laterCalories,
    weights: [...originalWeights, {
      date: laterReviewDate,
      scaleWeightKg: 80,
      trendWeightKg: 80,
    }],
  }));
  assert.equal(restored.kind, 'recommendation');
  assert.notEqual(restored.recommendation.evidenceHash, first.recommendation.evidenceHash);
});

const suspiciousDate = '2026-01-10';
const suspiciousCalories = dailyCalories.map((row) => ({
  ...row,
  calories: row.date === suspiciousDate ? 500 : 2000,
}));

function intakeConfirmation(
  date: string,
  status: 'complete' | 'partial' | 'intentional_fast',
) {
  return { date, status, source: 'adaptive_review' as const };
}

test('a suspicious low day triggers confirmation with personal-pattern context', () => {
  const result = calculateAdaptiveRecommendation(recommendationInput({
    dailyCalories: suspiciousCalories,
  }));
  assert.equal(result.kind, 'holding');
  assert.equal(result.reason, 'intake_confirmation_required');
  assert.deepEqual(result.confirmationDays, [{
    date: suspiciousDate,
    calories: 500,
    recentMedianCalories: 2000,
  }]);
});

test('suspicious-day detection is controlled by algorithm configuration', () => {
  const result = calculateAdaptiveRecommendation(recommendationInput({
    dailyCalories: suspiciousCalories,
    config: config({ suspiciousIntakeMedianFraction: 0.2 }),
  }));
  assert.equal(result.kind, 'recommendation');
});

test('confirming a suspicious day as complete includes it normally', () => {
  const result = successful(recommendationInput({
    dailyCalories: suspiciousCalories,
    intakeDayConfirmations: [intakeConfirmation(suspiciousDate, 'complete')],
  }));
  assert.equal(result.alignedIntakeDayCount, 28);
  closeTo(result.averageIntakeKcal, (27 * 2000 + 500) / 28);
});

test('confirming a suspicious day as partial excludes it', () => {
  const result = successful(recommendationInput({
    dailyCalories: suspiciousCalories,
    intakeDayConfirmations: [intakeConfirmation(suspiciousDate, 'partial')],
  }));
  assert.equal(result.alignedIntakeDayCount, 27);
  assert.equal(result.averageIntakeKcal, 2000);
});

test('confirming an intentional fast records an explicit exclusion policy', () => {
  const result = successful(recommendationInput({
    dailyCalories: suspiciousCalories,
    intakeDayConfirmations: [intakeConfirmation(suspiciousDate, 'intentional_fast')],
  }));
  assert.equal(ADAPTIVE_ALGORITHM_CONFIG.intentionalFastTreatment, 'exclude_from_intake');
  assert.equal(result.alignedIntakeDayCount, 27);
  assert.equal(result.averageIntakeKcal, 2000);
});

test('multiple suspicious days require answers for each date', () => {
  const secondDate = '2026-01-20';
  const calories = suspiciousCalories.map((row) => ({
    ...row,
    calories: row.date === secondDate ? 600 : row.calories,
  }));
  const unanswered = calculateAdaptiveRecommendation(recommendationInput({ dailyCalories: calories }));
  assert.equal(unanswered.kind, 'holding');
  assert.deepEqual(unanswered.confirmationDays.map((day) => day.date), [suspiciousDate, secondDate]);
  const oneAnswered = calculateAdaptiveRecommendation(recommendationInput({
    dailyCalories: calories,
    intakeDayConfirmations: [intakeConfirmation(suspiciousDate, 'complete')],
  }));
  assert.equal(oneAnswered.kind, 'holding');
  assert.deepEqual(oneAnswered.confirmationDays.map((day) => day.date), [secondDate]);
});

test('unanswered confirmation holds the exact current target', () => {
  const calculation = calculateAdaptiveRecommendation(recommendationInput({
    dailyCalories: suspiciousCalories,
  }));
  const currentTarget = {
    targetCalories: 2100,
    targetProteinG: 150,
    targetFatG: 70,
    targetCarbsG: 220,
  };
  const gate = gateAdaptiveReview(calculation, currentTarget);
  assert.equal(gate.kind, 'holding');
  assert.equal(gate.reason, 'intake_confirmation_required');
  assert.strictEqual(gate.currentTarget, currentTarget);
  assert.deepEqual(gate.currentTarget, currentTarget);
});

test('recommendation recalculates immediately after the final confirmation', () => {
  const secondDate = '2026-01-20';
  const calories = suspiciousCalories.map((row) => ({
    ...row,
    calories: row.date === secondDate ? 600 : row.calories,
  }));
  const oneRemaining = calculateAdaptiveRecommendation(recommendationInput({
    dailyCalories: calories,
    intakeDayConfirmations: [intakeConfirmation(suspiciousDate, 'complete')],
  }));
  const resolved = calculateAdaptiveRecommendation(recommendationInput({
    dailyCalories: calories,
    intakeDayConfirmations: [
      intakeConfirmation(suspiciousDate, 'complete'),
      intakeConfirmation(secondDate, 'partial'),
    ],
  }));
  assert.equal(oneRemaining.kind, 'holding');
  assert.equal(resolved.kind, 'recommendation');
});

test('previously confirmed dates are not asked again', () => {
  for (const status of ['complete', 'partial', 'intentional_fast'] as const) {
    const result = calculateAdaptiveRecommendation(recommendationInput({
      dailyCalories: suspiciousCalories,
      intakeDayConfirmations: [intakeConfirmation(suspiciousDate, status)],
    }));
    assert.notEqual(result.kind, 'holding', status);
  }
});

test('intake status changes invalidate the evidence fingerprint', () => {
  const provisional = successful(recommendationInput());
  const confirmed = successful(recommendationInput({
    intakeDayConfirmations: [intakeConfirmation('2026-01-08', 'complete')],
  }));
  assert.notEqual(confirmed.evidenceHash, provisional.evidenceHash);
});

test('partial-day exclusion can make intake evidence ineligible', () => {
  const tenDays = dailyCalories.slice(0, 10).map((row) => ({
    ...row,
    calories: row.date === '2026-01-05' ? 500 : 2000,
  }));
  const provisional = calculateAdaptiveRecommendation(recommendationInput({ dailyCalories: tenDays }));
  const partial = calculateAdaptiveRecommendation(recommendationInput({
    dailyCalories: tenDays,
    intakeDayConfirmations: [intakeConfirmation('2026-01-05', 'partial')],
  }));
  assert.equal(provisional.kind, 'holding');
  assert.equal(partial.kind, 'ineligible');
  assert.ok(partial.reasons.includes('insufficient_aligned_intake_days'));
  assert.equal(partial.eligibility.alignedIntakeDayCount, 9);
});

test('confirmed-complete status restores intake eligibility', () => {
  const tenDays = dailyCalories.slice(0, 10).map((row) => ({
    ...row,
    calories: row.date === '2026-01-05' ? 500 : 2000,
  }));
  const partial = calculateAdaptiveRecommendation(recommendationInput({
    dailyCalories: tenDays,
    intakeDayConfirmations: [intakeConfirmation('2026-01-05', 'partial')],
  }));
  const complete = calculateAdaptiveRecommendation(recommendationInput({
    dailyCalories: tenDays,
    intakeDayConfirmations: [intakeConfirmation('2026-01-05', 'complete')],
  }));
  assert.equal(partial.kind, 'ineligible');
  assert.equal(complete.kind, 'recommendation');
});

test('pending-review persistence is allowed only after confirmations resolve', () => {
  const unresolved = gateAdaptiveReview(
    calculateAdaptiveRecommendation(recommendationInput({ dailyCalories: suspiciousCalories })),
    { targetCalories: 2000 },
  );
  const resolved = gateAdaptiveReview(
    calculateAdaptiveRecommendation(recommendationInput({
      dailyCalories: suspiciousCalories,
      intakeDayConfirmations: [intakeConfirmation(suspiciousDate, 'complete')],
    })),
    { targetCalories: 2000 },
  );
  assert.equal(unresolved.kind, 'holding');
  assert.equal(resolved.kind, 'persist');
});
