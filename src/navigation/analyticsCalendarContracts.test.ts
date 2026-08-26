import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const calendarSource = readFileSync(
  resolve(testDirectory, '../components/MonthlyCalorieCalendar.tsx'),
  'utf8',
);
const analyticsSource = readFileSync(
  resolve(testDirectory, '../screens/AnalyticsScreen.tsx'),
  'utf8',
);
const shiftMonthSource = analyticsSource.slice(
  analyticsSource.indexOf('const shiftCalorieMonth'),
  analyticsSource.indexOf('const retryCalorieMonth'),
);

test('weekly adherence shows calorie totals and signed target deviation without coverage copy', () => {
  assert.match(calendarSource, /Week total/);
  assert.match(calendarSource, /vs target/);
  assert.match(calendarSource, /week\.totalCalories/);
  assert.match(calendarSource, /signedCalories\(week\.deltaCalories\)/);
  assert.doesNotMatch(calendarSource, /\/[57] logged/);
  assert.doesNotMatch(calendarSource, /function comparisonLabel/);
});

test('calendar supports selected-day details without a legend', () => {
  assert.match(calendarSource, /const \[selectedDate, setSelectedDate\]/);
  assert.match(calendarSource, /accessibilityState=\{\{ selected \}\}/);
  assert.match(calendarSource, /selectedDay \? \(/);
  assert.doesNotMatch(calendarSource, /legend/i);
});

test('monthly adherence has its own card and failed loads preserve the prior grid', () => {
  assert.match(
    analyticsSource,
    /<Card className="p-5">\s*\{calorieCalendar\}\s*<\/Card>/,
  );
  assert.doesNotMatch(shiftMonthSource, /setCalorieMonth\(null\)/);
});
