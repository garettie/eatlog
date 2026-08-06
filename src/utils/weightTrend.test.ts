import assert from 'node:assert/strict';
import test from 'node:test';
import { ADAPTIVE_ALGORITHM_CONFIG } from './adaptiveAlgorithmConfig';
import {
  alphaForElapsedDays,
  computeNormalizedWeeklyRate,
  computeWeightTrend,
  type ScaleReading,
} from './weightTrend';

const halfLifeDays = ADAPTIVE_ALGORITHM_CONFIG.trendHalfLifeDays;

function closeTo(actual: number, expected: number, tolerance = 1e-12): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('one-day gap uses elapsed-time alpha', () => {
  closeTo(alphaForElapsedDays(1, halfLifeDays), 1 - Math.exp(-Math.LN2 / 7));
});

test('seven-day gap uses elapsed-time alpha', () => {
  closeTo(alphaForElapsedDays(7, halfLifeDays), 0.5);
});

test('fourteen-day gap uses elapsed-time alpha', () => {
  closeTo(alphaForElapsedDays(14, halfLifeDays), 0.75);
});

test('equal elapsed days produce equal decay across calendar boundaries', () => {
  const january = computeWeightTrend([
    { logDate: '2026-01-01', scaleWeightKg: 80 },
    { logDate: '2026-01-08', scaleWeightKg: 70 },
  ]);
  const yearBoundary = computeWeightTrend([
    { logDate: '2025-12-28', scaleWeightKg: 80 },
    { logDate: '2026-01-04', scaleWeightKg: 70 },
  ]);
  assert.equal(january[1].trendWeightKg, yearBoundary[1].trendWeightKg);
});

test('seven-day half-life leaves approximately half the prior influence', () => {
  closeTo(1 - alphaForElapsedDays(7, halfLifeDays), 0.5);
  const trend = computeWeightTrend([
    { logDate: '2026-01-01', scaleWeightKg: 80 },
    { logDate: '2026-01-08', scaleWeightKg: 70 },
  ]);
  assert.equal(trend[1].trendWeightKg, 75);
});

test('sparse weekly readings receive different per-reading decay than daily readings', () => {
  assert.ok(alphaForElapsedDays(7, halfLifeDays) > alphaForElapsedDays(1, halfLifeDays));
});

test('first trend value equals the first scale value', () => {
  assert.deepEqual(computeWeightTrend([
    { logDate: '2026-01-01', scaleWeightKg: 80 },
  ]), [
    { logDate: '2026-01-01', scaleWeightKg: 80, trendWeightKg: 80 },
  ]);
});

test('stored trends round deterministically to three decimals after each step', () => {
  const trend = computeWeightTrend([
    { logDate: '2026-01-01', scaleWeightKg: 80 },
    { logDate: '2026-01-02', scaleWeightKg: 79 },
    { logDate: '2026-01-08', scaleWeightKg: 78 },
    { logDate: '2026-01-22', scaleWeightKg: 77.5 },
  ]);
  assert.deepEqual(trend.map((row) => row.trendWeightKg), [80, 79.906, 79.052, 77.888]);
});

test('duplicate dates reject', () => {
  assert.throws(() => computeWeightTrend([
    { logDate: '2026-01-01', scaleWeightKg: 80 },
    { logDate: '2026-01-01', scaleWeightKg: 79 },
  ]), /Duplicate weight date/);
});

test('non-finite and non-positive scale weights reject', () => {
  for (const scaleWeightKg of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => computeWeightTrend([
      { logDate: '2026-01-01', scaleWeightKg },
    ]), /finite and positive/);
  }
});

test('finite scale weights that overflow stored rounding reject', () => {
  assert.throws(() => computeWeightTrend([
    { logDate: '2026-01-01', scaleWeightKg: Number.MAX_VALUE },
  ]), /overflowed/);
});

test('reverse date ordering rejects', () => {
  assert.throws(() => computeWeightTrend([
    { logDate: '2026-01-02', scaleWeightKg: 79 },
    { logDate: '2026-01-01', scaleWeightKg: 80 },
  ]), /chronological/);
});

test('output order is chronological, deterministic, and input is not mutated', () => {
  const readings: ScaleReading[] = [
    { logDate: '2026-01-01', scaleWeightKg: 80 },
    { logDate: '2026-01-04', scaleWeightKg: 79 },
    { logDate: '2026-01-11', scaleWeightKg: 78 },
  ];
  const snapshot = structuredClone(readings);
  const first = computeWeightTrend(readings);
  const second = computeWeightTrend(readings);
  assert.deepEqual(first.map((row) => row.logDate), [
    '2026-01-01',
    '2026-01-04',
    '2026-01-11',
  ]);
  assert.deepEqual(first, second);
  assert.deepEqual(readings, snapshot);
});

test('invalid elapsed days and half-life reject', () => {
  assert.throws(() => alphaForElapsedDays(0, 7), /Elapsed days/);
  assert.throws(() => alphaForElapsedDays(1, 0), /half-life/);
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
