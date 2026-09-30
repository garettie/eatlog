import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarTarget } from './calendarTarget';
import { buildCalorieCalendar, buildEnergyHistory } from './energyHistory';
import { targetOverflowProgress } from './calculations';

const earliest = { id: 1, effective_date: '2026-09-30', target_calories: 2000, tdee_estimate: 2200 };

test('imported dates before the first plan retain calendar totals, deviations and strip-ring progress', () => {
  const energy = [{ log_date: '2026-06-17', calories: 1500 }, { log_date: '2026-06-18', calories: 2500 }];
  const history = [earliest];
  const calendar = buildCalorieCalendar('2026-06-01', '2026-09-30', energy, history, earliest);
  const days = calendar.weeks.flatMap(week => week.days);
  const under = days.find(day => day.date === '2026-06-17')!;
  const over = days.find(day => day.date === '2026-06-18')!;
  assert.equal(under.calories, 1500);
  assert.equal(under.progress, 0.75);
  assert.equal(under.deltaCalories, -500);
  assert.equal(over.progress, 1);
  assert.equal(over.deltaCalories, 500);
  const stripTarget = calendarTarget(null, earliest)!;
  assert.equal(energy[0].calories / stripTarget.target_calories, under.progress);
  assert.equal(targetOverflowProgress(energy[1].calories, stripTarget.target_calories), 0.25);
  assert.deepEqual(history, [earliest]);
  assert.equal(buildEnergyHistory('1M', '2026-06-17', '2026-06-18', energy, history).points[0].targetCalories, null);
});

test('recorded historic target changes override the display reference', () => {
  const original = { ...earliest, id: 2, effective_date: '2026-06-17', target_calories: 1800 };
  const later = { ...earliest, id: 3, effective_date: '2026-06-18', target_calories: 2200 };
  const days = buildCalorieCalendar('2026-06-01', '2026-09-30', [
    { log_date: '2026-06-17', calories: 1800 }, { log_date: '2026-06-18', calories: 2200 },
  ], [later, original], earliest).weeks.flatMap(week => week.days);
  assert.equal(calendarTarget(original, earliest), original);
  assert.equal(days.find(day => day.date === '2026-06-17')!.targetCalories, 1800);
  assert.equal(days.find(day => day.date === '2026-06-18')!.targetCalories, 2200);
});

test('absent or invalid reference targets stay unavailable and future days stay unfilled', () => {
  assert.equal(calendarTarget(null, null), null);
  assert.equal(calendarTarget(null, { target_calories: 0 }), null);
  assert.equal(calendarTarget(null, { target_calories: Number.NaN }), null);
  const days = buildCalorieCalendar('2026-10-01', '2026-09-30', [{ log_date: '2026-10-02', calories: 1500 }], [], earliest)
    .weeks.flatMap(week => week.days);
  assert.equal(days.find(day => day.date === '2026-10-02')!.progress, 0);
});

test('later target updates preserve imported and historical rings and apply from their effective date', () => {
  const later = { ...earliest, id: 2, effective_date: '2026-10-02', target_calories: 2500 };
  const energy = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']
    .map(log_date => ({ log_date, calories: 1500 }));
  const before = buildCalorieCalendar('2026-09-01', '2026-10-03', energy, [earliest], earliest);
  const after = buildCalorieCalendar('2026-09-01', '2026-10-03', energy, [earliest, later], earliest);
  const pastDays = (model: typeof before) => model.weeks.flatMap(week => week.days)
    .filter(day => day.date < later.effective_date);
  assert.deepEqual(pastDays(after), pastDays(before));
  const october = buildCalorieCalendar('2026-10-01', '2026-10-03', energy, [earliest, later], earliest)
    .weeks.flatMap(week => week.days);
  assert.equal(october.find(day => day.date === '2026-10-01')!.targetCalories, 2000);
  assert.equal(october.find(day => day.date === '2026-10-02')!.targetCalories, 2500);
  assert.equal(october.find(day => day.date === '2026-10-02')!.progress, 0.6);
  assert.equal(calendarTarget(null, earliest)!.target_calories, 2000);
});
