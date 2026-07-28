import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeNormalizedWeeklyRate,
  computeWeightTrend,
  type ScaleReading,
} from './weightTrend';

test('first trend value equals the first scale value', () => {
  assert.deepEqual(computeWeightTrend([
    { logDate: '2026-01-01', scaleWeightKg: 80 },
  ]), [
    { logDate: '2026-01-01', scaleWeightKg: 80, trendWeightKg: 80 },
  ]);
});

test('multiple EWMA steps round to three decimals after each step', () => {
  const trend = computeWeightTrend([
    { logDate: '2026-01-01', scaleWeightKg: 80 },
    { logDate: '2026-01-02', scaleWeightKg: 79 },
    { logDate: '2026-01-03', scaleWeightKg: 78 },
    { logDate: '2026-01-04', scaleWeightKg: 77.5 },
  ]);
  assert.deepEqual(trend.map((row) => row.trendWeightKg), [80, 79.85, 79.573, 79.262]);
});

test('unsorted input becomes chronological without mutating input', () => {
  const readings: ScaleReading[] = [
    { logDate: '2026-01-03', scaleWeightKg: 78 },
    { logDate: '2026-01-01', scaleWeightKg: 80 },
    { logDate: '2026-01-02', scaleWeightKg: 79 },
  ];
  const snapshot = structuredClone(readings);
  const trend = computeWeightTrend(readings);
  assert.deepEqual(trend.map((row) => row.logDate), [
    '2026-01-01',
    '2026-01-02',
    '2026-01-03',
  ]);
  assert.deepEqual(readings, snapshot);
});

test('duplicate dates throw', () => {
  assert.throws(() => computeWeightTrend([
    { logDate: '2026-01-01', scaleWeightKg: 80 },
    { logDate: '2026-01-01', scaleWeightKg: 79 },
  ]), /Duplicate weight date/);
});

test('non-finite and non-positive scale weights throw', () => {
  for (const scaleWeightKg of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => computeWeightTrend([
      { logDate: '2026-01-01', scaleWeightKg },
    ]), /finite and positive/);
  }
});

test('backdated input produces the same full result as a fresh chronological run', () => {
  const chronological = [
    { logDate: '2026-01-01', scaleWeightKg: 80 },
    { logDate: '2026-01-02', scaleWeightKg: 79 },
    { logDate: '2026-01-03', scaleWeightKg: 78 },
  ];
  const backdated = [chronological[0], chronological[2], chronological[1]];
  assert.deepEqual(computeWeightTrend(backdated), computeWeightTrend(chronological));
});

test('normalized weekly rate uses actual elapsed calendar days', () => {
  const rate = computeNormalizedWeeklyRate(
    { logDate: '2026-01-01', trendWeightKg: 80 },
    { logDate: '2026-01-11', trendWeightKg: 79 },
  );
  assert.ok(rate !== null && Math.abs(rate - -0.7) < 1e-12);
});

test('same-date normalized weekly rate returns null', () => {
  assert.equal(computeNormalizedWeeklyRate(
    { logDate: '2026-01-01', trendWeightKg: 80 },
    { logDate: '2026-01-01', trendWeightKg: 79 },
  ), null);
});
