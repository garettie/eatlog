import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const dateSelectorSource = readFileSync(
  resolve(testDirectory, '../components/DateSelector.tsx'),
  'utf8',
);
const androidPickerStart = dateSelectorSource.indexOf('DateTimePickerAndroid.open');
const androidPickerSource = dateSelectorSource.slice(
  androidPickerStart,
  dateSelectorSource.indexOf('return () =>', androidPickerStart),
);
const profileScreensSource = readFileSync(
  resolve(testDirectory, '../screens/ProfilePlanScreens.tsx'),
  'utf8',
);
const reviewStateSource = readFileSync(
  resolve(testDirectory, '../components/sheet-states/ReviewState.tsx'),
  'utf8',
);
const weightInputSource = readFileSync(
  resolve(testDirectory, '../components/sheet-states/WeightInputState.tsx'),
  'utf8',
);
const diarySource = readFileSync(
  resolve(testDirectory, '../screens/DiaryScreen.tsx'),
  'utf8',
);
const personalDetailsSource = profileScreensSource.slice(
  profileScreensSource.indexOf('export function PersonalDetailsScreen'),
  profileScreensSource.indexOf('export function UnitsScreen'),
);

test('Android uses native date pickers with explicit visible actions', () => {
  assert.ok(androidPickerStart >= 0, 'Android should open the imperative native picker');
  assert.match(androidPickerSource, /display: maxDate \? 'default' : 'spinner'/);
  assert.match(androidPickerSource, /positiveButton: \{ label: 'Set date' \}/);
  assert.match(androidPickerSource, /negativeButton: \{ label: 'Cancel' \}/);
  assert.match(androidPickerSource, /event\.type === 'set'/);
  assert.match(
    androidPickerSource,
    /onConfirmRef\.current\(clampDate\(dateOnly\(date\), minDate, maxDate\)\)/,
  );
});

test('Android never combines the bounded date maximum with the spinner display', () => {
  assert.doesNotMatch(androidPickerSource, /display: 'spinner'/);
  assert.match(androidPickerSource, /maximumDate: maxDate/);
});

test('Android does not fall back to JavaScript scroll-wheel snapping', () => {
  assert.doesNotMatch(dateSelectorSource, /function DateWheel/);
  assert.doesNotMatch(dateSelectorSource, /snapToOffsets/);
});

test('logging date pickers offer a native weekday-aware Today action', () => {
  assert.match(dateSelectorSource, /maximumDate\?: Date/);
  assert.match(dateSelectorSource, /showTodayAction\?: boolean/);
  assert.match(androidPickerSource, /neutralButton:/);
  assert.match(androidPickerSource, /neutralButtonPressed/);
  assert.match(reviewStateSource, /showTodayAction/);
  assert.match(weightInputSource, /showTodayAction/);
  assert.match(reviewStateSource, /formatLogDateLabel\(effectiveLogDate\)/);
  assert.match(weightInputSource, /formatLogDateLabel\(effectiveDate\)/);
});

test('future meal dates remain selectable and reachable in Diary', () => {
  assert.doesNotMatch(
    reviewStateSource,
    /maximumDate=\{parseLocalISO\(todayISO\(\)\)\}/,
  );
  assert.doesNotMatch(
    diarySource,
    /const canGoNext = monthAnchor\.getTime\(\) < currentMonth\.getTime\(\)/,
  );
});

test('future weight measurements remain blocked', () => {
  assert.match(
    weightInputSource,
    /maximumDate=\{parseLocalISO\(todayISO\(\)\)\}/,
  );
});

test('personal details uses the shared date selector instead of a birth-date text field', () => {
  assert.match(personalDetailsSource, /<DateSelector/);
  assert.doesNotMatch(personalDetailsSource, /<Field label="Birth date"/);
});

test('personal details saves directly from a fixed action outside the scroll area', () => {
  assert.doesNotMatch(personalDetailsSource, /navigation\.navigate\('PlanPreview'/);
  assert.match(personalDetailsSource, /updateProfilePresentation\(next\)/);

  const scrollEnd = personalDetailsSource.indexOf('</ScrollView>');
  const saveAction = personalDetailsSource.indexOf('title="Save changes"');
  assert.ok(scrollEnd >= 0, 'Personal details should retain its scrollable form');
  assert.ok(saveAction > scrollEnd, 'Save changes should remain visible outside the scroll area');
});
