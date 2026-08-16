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

test('expanded meal components use one stable disclosure with visible macros', () => {
  assert.match(reviewStateSource, /accessibilityState=\{\{ expanded: isExpanded \}\}/);
  assert.match(reviewStateSource, /isExpanded\s*\? portionSummary\s*:\s*comp\.food\.name\.trim\(\)/);
  assert.match(reviewStateSource, />This portion<\/Text>/);
  assert.match(reviewStateSource, />\s*Nutrition values\s*<\/Text>/);
  assert.doesNotMatch(reviewStateSource, /Advanced nutrition|nutritionExpandedIds/);
});

test('expanded component layout keeps one tonal card and responsive nutrition fields', () => {
  assert.match(reviewStateSource, /rounded-2xl border border-m3-outline-variant\/50 bg-m3-surface-container-high/);
  assert.match(reviewStateSource, /multiline/);
  assert.match(reviewStateSource, /min-w-\[132px\] flex-1/);
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
  assert.match(reviewStateSource, /Nutrition based on \{comp\.originalName\.trim\(\)\}/);
  assert.match(reviewStateSource, />\s*Keep values\s*<\/Text>/);
  assert.match(reviewStateSource, /hasUnreviewedNutrition/);
});

test('review dismissal keeps discard protection for direct entry flows', () => {
  assert.match(tabNavigatorSource, /sheet\.stateKey !== 'review'/);
});

test('component disclosures announce state and Undo respects accessibility timing', () => {
  assert.match(reviewStateSource, /announceForAccessibility/);
  assert.match(reviewStateSource, /getRecommendedTimeoutMillis\(UNDO_TIMEOUT_MS\)/);
});

test('portion mode uses a contrasting dashboard-style toggle track', () => {
  assert.match(portionStepperSource, /tone="inset"/);
  assert.match(segmentedControlSource, /tone === 'inset'/);
  assert.match(segmentedControlSource, /bg-m3-surface-container border-m3-outline-variant\/50/);
  assert.match(portionStepperSource, /const editorInvalid/);
  assert.match(portionStepperSource, /bg-m3-surface-container rounded-xl/);
  assert.doesNotMatch(portionStepperSource, /bg-m3-surface-container-high rounded-xl py-3/);
  assert.match(portionStepperSource, />\s*g\s*<\/Text>/);
  assert.match(reviewStateSource, /text-m3-on-surface text-sm font-semibold">\s*Food name/);
});

test('grams editor centers the value independently of its suffix', () => {
  assert.match(portionStepperSource, /className="relative w-full min-h-\[48px\] items-center justify-center"/);
  assert.match(portionStepperSource, /w-full min-h-\[48px\] text-center bg-transparent/);
  assert.match(portionStepperSource, /pointerEvents="none"/);
  assert.match(portionStepperSource, /absolute right-4/);
  assert.doesNotMatch(portionStepperSource, /w-28 min-h-\[48px\] text-right/);
});
