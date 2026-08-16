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
const personalDetailsSource = profileScreensSource.slice(
  profileScreensSource.indexOf('export function PersonalDetailsScreen'),
  profileScreensSource.indexOf('export function UnitsScreen'),
);

test('Android uses the native date wheel with explicit visible actions', () => {
  assert.ok(androidPickerStart >= 0, 'Android should open the imperative native picker');
  assert.match(androidPickerSource, /display: 'spinner'/);
  assert.match(androidPickerSource, /positiveButton: \{ label: 'Set date' \}/);
  assert.match(androidPickerSource, /negativeButton: \{ label: 'Cancel' \}/);
  assert.match(androidPickerSource, /event\.type === 'set'/);
  assert.match(
    androidPickerSource,
    /onConfirmRef\.current\(clampDate\(dateOnly\(date\), minDate, maxDate\)\)/,
  );
});

test('Android does not fall back to JavaScript scroll-wheel snapping', () => {
  assert.doesNotMatch(dateSelectorSource, /function DateWheel/);
  assert.doesNotMatch(dateSelectorSource, /snapToOffsets/);
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
