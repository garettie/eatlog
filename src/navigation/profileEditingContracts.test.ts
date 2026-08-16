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
const profileScreensSource = readFileSync(
  resolve(testDirectory, '../screens/ProfilePlanScreens.tsx'),
  'utf8',
);
const personalDetailsSource = profileScreensSource.slice(
  profileScreensSource.indexOf('export function PersonalDetailsScreen'),
  profileScreensSource.indexOf('export function UnitsScreen'),
);

test('Android date selection keeps an app-owned Set date action', () => {
  assert.doesNotMatch(dateSelectorSource, /DateTimePickerAndroid/);
  assert.match(dateSelectorSource, /accessibilityLabel="Set date"/);
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
