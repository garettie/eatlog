import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const reviewStateSource = readFileSync(
  resolve(testDirectory, '../components/sheet-states/ReviewState.tsx'),
  'utf8',
);
const tabNavigatorSource = readFileSync(
  resolve(testDirectory, './TabNavigator.tsx'),
  'utf8',
);
const portionStepperSource = readFileSync(
  resolve(testDirectory, '../components/PortionStepper.tsx'),
  'utf8',
);
const segmentedControlSource = readFileSync(
  resolve(testDirectory, '../components/SegmentedControl.tsx'),
  'utf8',
);
const mealPhotoEditorSource = readFileSync(
  resolve(testDirectory, '../components/MealPhotoEditor.tsx'),
  'utf8',
);

test('expanded meal components keep identity stable with visible portion macros', () => {
  assert.match(reviewStateSource, /accessibilityState=\{\{ expanded: false \}\}/);
  assert.match(reviewStateSource, /accessibilityState=\{\{ expanded: true \}\}/);
  assert.match(reviewStateSource, /value=\{comp\.food\.name\}/);
  assert.doesNotMatch(reviewStateSource, /isExpanded\s*\? portionSummary/);
  assert.match(reviewStateSource, />\s*Calculated live\s*<\/Text>/);
  assert.match(reviewStateSource, />\s*Nutrition values\s*<\/Text>/);
  assert.doesNotMatch(reviewStateSource, /Advanced nutrition|nutritionExpandedIds/);
});

test('expanded component layout uses one grouped list and responsive nutrition fields', () => {
  assert.match(reviewStateSource, /overflow-hidden rounded-2xl bg-m3-surface-container border/);
  assert.match(reviewStateSource, /\$\{isExpanded \? "bg-m3-surface-container-high" : ""\}/);
  assert.match(reviewStateSource, /multiline/);
  assert.match(reviewStateSource, /min-w-\[132px\] flex-1/);
  assert.match(reviewStateSource, />\s*Remove food\s*<\/Text>/);
  assert.match(reviewStateSource, /border-t border-m3-outline-variant\/50 px-4 py-4 gap-3/);
  assert.doesNotMatch(reviewStateSource, /<View className="px-4 pb-4">/);
});

test('meal review omits redundant summary and footer copy', () => {
  assert.match(reviewStateSource, />\s*Foods\s*<\/Text>/);
  assert.doesNotMatch(reviewStateSource, /Foods ·|1 needs review|kcal total/);
  assert.doesNotMatch(
    reviewStateSource,
    /Review nutrition for grilled chicken|Change meal or log date/,
  );
  assert.match(reviewStateSource, /title=\{editMealId \? "Update meal" : "Log meal"\}/);
});

test('expanded component content is not clipped by animated height measurement', () => {
  const componentRows = reviewStateSource.slice(
    reviewStateSource.indexOf('components.map((comp, idx)'),
    reviewStateSource.indexOf('<AddComponentSection'),
  );

  assert.doesNotMatch(componentRows, /LinearTransition/);
  assert.doesNotMatch(componentRows, /pendingScrollIdRef|scrollViewRef\.current\?\.scrollTo/);
});

test('component disclosure motion is transform-only and reduced-motion safe', () => {
  assert.match(reviewStateSource, /function DisclosureChevron/);
  assert.match(reviewStateSource, /duration: reducedMotion \? 0 : 250/);
  assert.match(reviewStateSource, /transform: \[\{ rotate: `\$\{rotation\.value\}deg` \}\]/);
  assert.doesNotMatch(reviewStateSource, /layout=\{|scrollViewRef\.current\?\.scrollTo/);
});

test('renamed foods require an explicit nutrition decision', () => {
  assert.match(reviewStateSource, /nutritionAcknowledged/);
  assert.match(reviewStateSource, /Nutrition based on/);
  assert.match(reviewStateSource, /\{comp\.originalName\.trim\(\)\}/);
  assert.match(reviewStateSource, />\s*Keep values\s*<\/Text>/);
  assert.match(reviewStateSource, /hasUnreviewedNutrition/);
});

test('review dismissal keeps discard protection for direct entry flows', () => {
  assert.match(tabNavigatorSource, /sheet\.stateKey !== 'review'/);
});

test('component disclosures announce state and Undo respects accessibility timing', () => {
  assert.match(reviewStateSource, /announceForAccessibility/);
  assert.match(reviewStateSource, /getRecommendedTimeoutMillis\(UNDO_TIMEOUT_MS\)/);
  assert.match(reviewStateSource, /<SheetBackButton onPress=\{onGoBack\} \/>/);
  assert.match(reviewStateSource, /accessibilityRole="header"/);
  assert.match(mealPhotoEditorSource, /accessibilityState=\{\{ disabled: busy \|\| disabled, busy \}\}/);
});

test('portion mode uses a contrasting dashboard-style toggle track', () => {
  assert.match(portionStepperSource, /tone="inset"/);
  assert.match(segmentedControlSource, /tone === 'inset'/);
  assert.match(segmentedControlSource, /bg-m3-surface-container border-m3-outline-variant\/50/);
  assert.match(portionStepperSource, /const editorInvalid/);
  assert.match(portionStepperSource, /bg-m3-surface-container rounded-xl/);
  assert.doesNotMatch(portionStepperSource, /bg-m3-surface-container-high rounded-xl py-3/);
  assert.match(portionStepperSource, />\s*g\s*<\/Text>/);
  assert.match(reviewStateSource, /accessibilityLabel="Food name"/);
  assert.match(reviewStateSource, /font-medium tabular-nums rounded-xl/);
});

test('grams editor centers the value independently of its suffix', () => {
  assert.match(portionStepperSource, /className="relative w-full min-h-\[48px\] items-center justify-center"/);
  assert.match(portionStepperSource, /w-full min-h-\[48px\] text-center bg-transparent/);
  assert.match(portionStepperSource, /pointerEvents="none"/);
  assert.match(portionStepperSource, /absolute right-4/);
  assert.doesNotMatch(portionStepperSource, /w-28 min-h-\[48px\] text-right/);
});
