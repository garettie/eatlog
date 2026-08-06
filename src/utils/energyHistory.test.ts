import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEnergyHistory } from './energyHistory';

const targets = [
  { id: 1, effective_date: '2026-01-01', target_calories: 2200, tdee_estimate: 2600 },
  { id: 2, effective_date: '2026-01-08', target_calories: 2100, tdee_estimate: 2500 },
];

test('builds daily points and waits for four logged days before showing a rolling average', () => {
  const result = buildEnergyHistory('1M', '2026-01-01', '2026-01-07', [
    { log_date: '2026-01-01', calories: 2000 },
    { log_date: '2026-01-02', calories: 2100 },
    { log_date: '2026-01-04', calories: 2200 },
    { log_date: '2026-01-07', calories: 2300 },
  ], targets);

  assert.equal(result.points.length, 7);
  assert.equal(result.points[2].averageCalories, null);
  assert.equal(result.points[5].intakeTrendCalories, null);
  assert.equal(result.points[6].intakeTrendCalories, 2150);
  assert.equal(result.loggedDayCount, 4);
  assert.equal(result.totalDayCount, 7);
});

test('uses preceding logged days for the rolling average at the range boundary', () => {
  const result = buildEnergyHistory('1M', '2026-01-07', '2026-01-08', [
    { log_date: '2026-01-02', calories: 1800 },
    { log_date: '2026-01-04', calories: 2000 },
    { log_date: '2026-01-06', calories: 2200 },
    { log_date: '2026-01-07', calories: 2400 },
  ], targets);

  assert.equal(result.points[0].intakeTrendCalories, 2100);
  assert.equal(result.loggedDayCount, 1);
});

test('groups longer ranges into coverage-aware weekly averages', () => {
  const result = buildEnergyHistory('3M', '2026-01-01', '2026-01-10', [
    { log_date: '2026-01-01', calories: 1800 },
    { log_date: '2026-01-02', calories: 2200 },
    { log_date: '2026-01-08', calories: 2100 },
  ], targets);

  assert.equal(result.points.length, 2);
  assert.deepEqual(
    result.points.map((point) => [point.dayCount, point.loggedDayCount, point.averageCalories]),
    [[7, 2, 2000], [3, 1, 2100]],
  );
  assert.equal(result.coverage, 0.3);
});

test('uses the target active at the end of each bucket', () => {
  const result = buildEnergyHistory('3M', '2026-01-01', '2026-01-14', [], targets);

  assert.equal(result.points[0].targetCalories, 2200);
  assert.equal(result.points[1].targetCalories, 2100);
  assert.equal(result.points[1].expenditureCalories, 2500);
});

test('rejects a reversed date range', () => {
  assert.throws(
    () => buildEnergyHistory('1M', '2026-01-02', '2026-01-01', [], targets),
    /must not precede/,
  );
});
