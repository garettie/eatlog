import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const profileScreensSource = readFileSync(
  resolve(testDirectory, '../screens/ProfilePlanScreens.tsx'),
  'utf8',
);
const databaseSource = readFileSync(
  resolve(testDirectory, '../db/database.ts'),
  'utf8',
);
const reviewStateSource = readFileSync(
  resolve(testDirectory, '../components/sheet-states/ReviewState.tsx'),
  'utf8',
);
const datePickerSource = readFileSync(
  resolve(testDirectory, '../components/DatePicker.tsx'),
  'utf8',
);
const onboardingSource = readFileSync(
  resolve(testDirectory, '../screens/OnboardingScreen.tsx'),
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
const analyticsSource = readFileSync(
  resolve(testDirectory, '../screens/AnalyticsScreen.tsx'),
  'utf8',
);
const personalDetailsSource = profileScreensSource.slice(
  profileScreensSource.indexOf('export function PersonalDetailsScreen'),
  profileScreensSource.indexOf('export function UnitsScreen'),
);
const planPreviewSource = profileScreensSource.slice(
  profileScreensSource.indexOf('export function PlanPreviewScreen'),
);

test('every date the app asks for uses one modal picker', () => {
  // No native date dialog remains; meals, weight, and birthdays share DatePicker.
  for (const source of [reviewStateSource, weightInputSource, personalDetailsSource, onboardingSource]) {
    assert.doesNotMatch(source, /DateSelector|DateTimePicker/);
  }
  assert.match(reviewStateSource, /showDatePicker\(showDialog, \{ title: "Log date", value: effectiveLogDate, today/);
  assert.match(weightInputSource, /showDatePicker\(showDialog, \{\s*title: 'Log date',/);
  // A weigh-in can't precede birth or be in the future; meal dates are unbounded.
  assert.match(weightInputSource, /minDate: formatLocalISO\(birthDate\),\s*maxDate: today,/);
  assert.match(reviewStateSource, /formatLogDateLabel\(effectiveLogDate\)/);
  assert.match(weightInputSource, /formatLogDateLabel\(effectiveDate\)/);
  // The picker leads with the chosen date and offers Today when it is choosable.
  assert.match(datePickerSource, /showDialog\(\{\s*title,\s*headline,/);
  assert.match(datePickerSource, /label: 'Today', tone: 'neutral'/);
  assert.match(datePickerSource, /getFixedMonthGrid/);
});

test('birthdays use the picker with the age bounds, opening on a set birthday\'s month', () => {
  for (const source of [personalDetailsSource, onboardingSource]) {
    assert.match(source, /showDatePicker\(birthDateDialog\.show, \{\s*title: 'Birth date',/);
    assert.match(source, /minDate: formatLocalISO\(dateBounds\.earliest\),\s*maxDate: formatLocalISO\(dateBounds\.latest\),/);
    assert.match(source, /<SheetDialogOverlay host=\{birthDateDialog\} \/>/);
  }
  // Settings edits a real birthday, so it opens on its month; onboarding walks year, month,
  // day only until the placeholder has been replaced.
  assert.doesNotMatch(personalDetailsSource, /startView: 'years'/);
  assert.match(onboardingSource, /startView: birthDateChosen \? 'days' : 'years',/);
  assert.match(datePickerSource, /const first = minDate \? yearOf\(minDate\)/);
  assert.match(datePickerSource, /view: guided \? 'months' : 'days',/);
  assert.match(datePickerSource, /go\(\{ view: 'days', month: new Date\(shownYear, monthIndex, 1\) \}\)/);
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
  assert.match(weightInputSource, /maxDate: today,/);
  // Days past the bound can't be tapped, and paging stops at the bound's month.
  assert.match(datePickerSource, /\(maxDate != null && iso > maxDate\)/);
  assert.match(datePickerSource, /disabled=\{disabled\}/);
  assert.match(datePickerSource, /const canPageForward = !maxDate \|\| monthKey < monthKeyOf\(maxDate\);/);
});

test('personal details uses the shared date picker instead of a birth-date text field', () => {
  assert.match(personalDetailsSource, /showDatePicker\(/);
  assert.doesNotMatch(personalDetailsSource, /<Field label="Birth date"/);
});

test('personal details previews calculation changes and saves presentation-only changes directly', () => {
  assert.match(personalDetailsSource, /const calculationChanged = next\.sex/);
  assert.match(personalDetailsSource, /navigation\.navigate\('PlanPreview', await prepareCalculatedPlan\(next\)\)/);
  assert.match(personalDetailsSource, /updateProfilePresentation\(\{\s*display_name: next\.display_name,\s*weight_unit: next\.weight_unit,/);

  const scrollEnd = personalDetailsSource.indexOf('</ScrollView>');
  const saveAction = personalDetailsSource.indexOf('title="Save changes"');
  assert.ok(scrollEnd >= 0, 'Personal details should retain its scrollable form');
  assert.ok(saveAction > scrollEnd, 'Save changes should remain visible outside the scroll area');
});

test('plan preview rejects stale inputs and concurrent target changes before commit', () => {
  assert.match(planPreviewSource, /const refreshed = await refreshPlanPreview\(route\.params\)/);
  assert.match(profileScreensSource, /ageOnDate\(nextProfile\.birth_date, effectiveDate\)/);
  assert.match(planPreviewSource, /refreshed\.baselineTarget\.id !== route\.params\.baselineTarget\.id/);
  assert.match(planPreviewSource, /expectedCurrentTargetId: refreshed\.baselineTarget\.id/);
  assert.match(planPreviewSource, /cause instanceof CurrentPlanChangedError/);
  assert.ok(
    planPreviewSource.indexOf('if (baselineChanged') < planPreviewSource.indexOf('await updateProfileAndPlan({'),
    'A stale preview must stop before plan persistence',
  );
  assert.match(databaseSource, /SELECT id FROM daily_targets WHERE effective_date <= \? ORDER BY effective_date DESC, id DESC LIMIT 1/);
  assert.match(databaseSource, /currentTarget\?\.id !== params\.expectedCurrentTargetId/);
});

test('adaptive pause copy distinguishes a TDEE floor conflict', () => {
  assert.match(analyticsSource, /tdee_floor_conflict: \{\s*title: 'Plan recalculation needed'/);
  assert.match(analyticsSource, /Recalculate your plan in Profile before using adaptive updates/);
  assert.doesNotMatch(analyticsSource, /reason === 'target_out_of_policy' \? 'No safe target could be calculated' : 'No target change recommended'/);
});
