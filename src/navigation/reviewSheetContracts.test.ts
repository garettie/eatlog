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
const mealSelectorSource = readFileSync(
  resolve(testDirectory, '../components/MealSelector.tsx'),
  'utf8',
);
const mealReviewSource = readFileSync(
  resolve(testDirectory, '../utils/mealReview.ts'),
  'utf8',
);

test('expanded meal components keep identity stable and defer nutrition editing', () => {
  assert.match(reviewStateSource, /accessibilityState=\{\{ expanded: false \}\}/);
  assert.match(reviewStateSource, /accessibilityState=\{\{ expanded: isExpanded \}\}/);
  assert.match(reviewStateSource, /value=\{comp\.food\.name\}/);
  assert.doesNotMatch(reviewStateSource, /isExpanded\s*\? portionSummary/);
  assert.doesNotMatch(reviewStateSource, /Calculated live/);
  assert.equal(reviewStateSource.match(/\{cal\} kcal/g)?.length, 1);
  assert.match(reviewStateSource, /nutritionExpandedIds/);
  assert.match(reviewStateSource, /accessibilityState=\{\{ expanded: nutritionExpanded \}\}/);
  assert.match(reviewStateSource, /<DisclosureChevron expanded=\{nutritionExpanded\} \/>/);
  assert.match(reviewStateSource, />\s*Nutrition values\s*<\/Text>/);
  assert.doesNotMatch(reviewStateSource, /Advanced nutrition/);
});

test('expanded component layout uses one grouped list and responsive nutrition fields', () => {
  assert.match(reviewStateSource, /overflow-hidden rounded-2xl bg-m3-surface-container border/);
  assert.match(reviewStateSource, /\$\{isExpanded \? "bg-m3-surface-container-high" : ""\}/);
  assert.match(reviewStateSource, /multiline/);
  assert.match(reviewStateSource, /min-w-\[132px\] flex-1/);
  assert.match(reviewStateSource, />\s*Remove food\s*<\/Text>/);
  assert.match(reviewStateSource, /border-t border-m3-outline-variant\/50 px-4 py-4 gap-3/);
  assert.match(reviewStateSource, /border-t border-m3-outline-variant\/70/);
  assert.doesNotMatch(reviewStateSource, /\{componentContext \? \(/);
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
test('meal destination stays visible in one compact row', () => {
  assert.match(reviewStateSource, /const compactLogDateLabel/);
  assert.match(reviewStateSource, /effectiveLogDate === today/);
  assert.match(reviewStateSource, /month: "short"/);
  assert.match(reviewStateSource, /day: "numeric"/);
  assert.match(reviewStateSource, /<MealSelector[\s\S]*compact[\s\S]*disabled=\{logging\}/);
  assert.doesNotMatch(reviewStateSource, /destinationEditorVisible/);
  assert.match(mealSelectorSource, /compactLabel: 'Bfast'/);
  assert.match(mealSelectorSource, /compact \? m\.compactLabel : m\.label/);
});

test('component disclosure motion is transform-only and reduced-motion safe', () => {
  assert.match(reviewStateSource, /function DisclosureChevron/);
  assert.match(reviewStateSource, /duration: reducedMotion \? 0 : 250/);
  assert.match(reviewStateSource, /transform: \[\{ rotate: `\$\{rotation\.value\}deg` \}\]/);
  assert.match(reviewStateSource, /<DisclosureChevron expanded=\{isExpanded\} \/>/);
  assert.doesNotMatch(reviewStateSource, /<DisclosureChevron expanded \/>/);
  assert.doesNotMatch(reviewStateSource, /<DisclosureChevron expanded=\{false\} \/>/);
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

test('tapping a diary meal opens its review sheet without an animation-frame handoff', () => {
  const openEditMealSource = tabNavigatorSource.slice(
    tabNavigatorSource.indexOf('const openEditMeal'),
    tabNavigatorSource.indexOf('const resetToEntry'),
  );

  assert.match(openEditMealSource, /stateKey: 'review'/);
  assert.match(openEditMealSource, /describeResult: result/);
  assert.doesNotMatch(openEditMealSource, /requestAnimationFrame/);
});

test('component disclosures announce state and Undo respects accessibility timing', () => {
  assert.match(reviewStateSource, /announceForAccessibility/);
  assert.match(reviewStateSource, /getRecommendedTimeoutMillis\(UNDO_TIMEOUT_MS\)/);
  assert.match(reviewStateSource, /<SheetBackButton onPress=\{onGoBack\} \/>/);
  assert.match(reviewStateSource, /accessibilityRole="header"/);
  assert.match(mealPhotoEditorSource, /accessibilityState=\{\{ disabled: busy \|\| disabled, busy \}\}/);
});

test('portion mode and amount editor share one contrasting control row', () => {
  assert.match(portionStepperSource, /flex-row items-center/);
  assert.match(portionStepperSource, /<View className="flex-1 min-w-0">/);
  assert.match(portionStepperSource, /tone="inset"/);
  assert.match(segmentedControlSource, /tone === 'inset'/);
  assert.match(segmentedControlSource, /bg-m3-surface-container border-m3-outline-variant\/50/);
  assert.match(portionStepperSource, /const editorInvalid/);
  assert.match(portionStepperSource, /w-\[104px\] shrink-0/);
  assert.match(portionStepperSource, /h-\[52px\] bg-m3-surface-container rounded-xl/);
  assert.doesNotMatch(portionStepperSource, /onServingsDelta|formatServingSummary/);
  assert.match(portionStepperSource, />\s*g\s*<\/Text>/);
  assert.match(portionStepperSource, /\{servingIndicator\}/);
  assert.match(reviewStateSource, /accessibilityLabel="Food name"/);
  assert.match(reviewStateSource, /font-medium tabular-nums rounded-xl/);
  // The portion summary moved out of the component into utils/mealReview; its behaviour is
  // covered directly by utils/portionSummary.test.ts.
  assert.match(mealReviewSource, /Math\.abs\(servings - 1\) < 0\.001 \? serving\.grams : grams/);
});

test('grams editor centers the value independently of its suffix', () => {
  assert.match(portionStepperSource, /className="relative w-full h-full items-center justify-center"/);
  assert.match(portionStepperSource, /w-full h-full text-center bg-transparent/);
  assert.match(portionStepperSource, /pointerEvents="none"/);
  assert.match(portionStepperSource, /absolute right-2/);
  assert.doesNotMatch(portionStepperSource, /w-28 min-h-\[48px\] text-right/);
});
