import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCalorieCalendar, buildEnergyHistory } from './energyHistory';

const targets = [
  { id: 1, effective_date: '2026-01-01', target_calories: 2200, tdee_estimate: 2600 },
  { id: 2, effective_date: '2026-01-08', target_calories: 2100, tdee_estimate: 2500 },
];

function findDay(month: ReturnType<typeof buildCalorieCalendar>, date: string) {
  for (const week of month.weeks) {
    const day = week.days.find((item) => item.date === date);
    if (day) return day;
  }
  throw new Error(`Missing calendar day ${date}`);
}

function findWeek(month: ReturnType<typeof buildCalorieCalendar>, date: string) {
  const week = month.weeks.find((item) => item.days.some((day) => day.date === date));
  if (!week) throw new Error(`Missing calendar week for ${date}`);
  return week;
}

const calendarTargets = [
  { id: 1, effective_date: '2026-01-01', target_calories: 2000, tdee_estimate: 2400 },
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

test('builds August 2026 status rings and complete spillover rows', () => {
  const result = buildCalorieCalendar('2026-08-01', '2026-08-31', [
    { log_date: '2026-08-01', calories: 2200 },
    { log_date: '2026-08-02', calories: 1800 },
    { log_date: '2026-08-03', calories: 2000 },
  ], calendarTargets);

  assert.equal(result.gridStart, '2026-07-27');
  assert.equal(result.gridEnd, '2026-09-06');
  assert.equal(result.weeks.length, 6);
  assert.deepEqual(
    result.weeks[0].days.map((day) => day.date),
    ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'],
  );
  assert.equal(findDay(result, '2026-08-01').status, 'over');
  assert.equal(findDay(result, '2026-08-01').progress, 1);
  assert.equal(findDay(result, '2026-08-02').status, 'under');
  assert.equal(findDay(result, '2026-08-02').progress, 0.9);
  assert.equal(findDay(result, '2026-08-03').status, 'target');
  assert.equal(findDay(result, '2026-08-03').deltaCalories, 0);
  assert.equal(findDay(result, '2026-09-01').inMonth, false);
});

test('marks missing and future days without counting them in weekly totals', () => {
  const result = buildCalorieCalendar('2026-08-01', '2026-08-16', [
    { log_date: '2026-08-17', calories: 2500 },
  ], calendarTargets);

  assert.equal(findDay(result, '2026-08-10').status, 'missing');
  assert.equal(findDay(result, '2026-08-17').status, 'future');
  assert.equal(findWeek(result, '2026-08-10').loggedDays, 0);
  assert.equal(findWeek(result, '2026-08-10').totalCalories, 0);
  assert.equal(findWeek(result, '2026-08-10').deltaCalories, null);
  assert.equal(findWeek(result, '2026-08-17').loggedDays, 0);
  assert.equal(findWeek(result, '2026-08-17').totalCalories, 0);
});

test('includes logged spillover days in weekly totals', () => {
  const result = buildCalorieCalendar('2026-08-01', '2026-08-31', [
    { log_date: '2026-07-31', calories: 1800 },
  ], calendarTargets);
  const week = findWeek(result, '2026-07-31');

  assert.equal(findDay(result, '2026-07-31').inMonth, false);
  assert.equal(week.loggedDays, 1);
  assert.equal(week.totalCalories, 1800);
  assert.equal(week.targetDays, 1);
  assert.equal(week.targetCalories, 2000);
  assert.equal(week.deltaCalories, -200);
});

test('applies target changes to each date inside a week', () => {
  const result = buildCalorieCalendar('2026-01-01', '2026-01-31', [
    { log_date: '2026-01-03', calories: 2000 },
    { log_date: '2026-01-04', calories: 1800 },
  ], [
    { id: 2, effective_date: '2026-01-04', target_calories: 1800, tdee_estimate: 2200 },
    { id: 1, effective_date: '2026-01-01', target_calories: 2000, tdee_estimate: 2400 },
  ]);
  const week = findWeek(result, '2026-01-03');

  assert.equal(findDay(result, '2026-01-03').targetCalories, 2000);
  assert.equal(findDay(result, '2026-01-04').targetCalories, 1800);
  assert.equal(week.targetCalories, 3800);
  assert.equal(week.deltaCalories, 0);
});

test('keeps logged calories when the target is unavailable', () => {
  const result = buildCalorieCalendar('2026-08-01', '2026-08-31', [
    { log_date: '2026-08-10', calories: 1900 },
  ], []);
  const week = findWeek(result, '2026-08-10');

  assert.equal(findDay(result, '2026-08-10').status, 'target-unavailable');
  assert.equal(week.loggedDays, 1);
  assert.equal(week.totalCalories, 1900);
  assert.equal(week.targetDays, 0);
  assert.equal(week.targetCalories, 0);
  assert.equal(week.deltaCalories, null);
});
