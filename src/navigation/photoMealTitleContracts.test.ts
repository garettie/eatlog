import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const foodSheetSource = readFileSync(
  resolve(testDirectory, '../components/sheet-states/FoodSheetContent.tsx'),
  'utf8',
);
const tabNavigatorSource = readFileSync(
  resolve(testDirectory, './TabNavigator.tsx'),
  'utf8',
);
const sheetSource = readFileSync(
  resolve(testDirectory, '../components/Sheet.tsx'),
  'utf8',
);
const weightInputSource = readFileSync(
  resolve(testDirectory, '../components/sheet-states/WeightInputState.tsx'),
  'utf8',
);
const photoTitleSource = readFileSync(
  resolve(testDirectory, '../components/sheet-states/PhotoMealTitleState.tsx'),
  'utf8',
);
const entryMethodSource = readFileSync(
  resolve(testDirectory, '../components/sheet-states/EntryMethodState.tsx'),
  'utf8',
);

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('photo capture pauses for a meal title before the first scan request', () => {
  assert.match(foodSheetSource, /'photo-title'/);
  assert.match(foodSheetSource, /<PhotoMealTitleState/);
  assert.doesNotMatch(foodSheetSource, /scanFood\(base64\)/);
  assert.match(foodSheetSource, /scanFood\([^,]+,\s*mealTitle/);
});

test('camera and gallery selection stay local until Estimate as new', () => {
  const cameraFlow = sourceBetween(foodSheetSource, 'const handleCamera', 'const handleGallery');
  const galleryFlow = sourceBetween(foodSheetSource, 'const handleGallery', 'const handlePhotoEstimate');
  for (const selectionFlow of [cameraFlow, galleryFlow]) {
    assert.doesNotMatch(selectionFlow, /requestConsent/);
    assert.doesNotMatch(selectionFlow, /prepareFoodEstimateImage/);
    assert.doesNotMatch(selectionFlow, /scanFood/);
  }

  const estimateFlow = sourceBetween(foodSheetSource, 'const handlePhotoEstimate', 'const handleReuseMeal');
  const consentIndex = estimateFlow.indexOf('requestConsent()');
  const preparationIndex = estimateFlow.indexOf('prepareFoodEstimateImage');
  const scanIndex = estimateFlow.indexOf('scanFood(base64, mealTitle)');
  assert.ok(consentIndex >= 0 && consentIndex < preparationIndex);
  assert.ok(preparationIndex < scanIndex);
  assert.match(estimateFlow, /pendingPhoto\.preparedBase64 = base64/);
  assert.doesNotMatch(estimateFlow, /pendingPhotoRef\.current = null/);
  assert.doesNotMatch(estimateFlow, /transitionTo\('scanning', \{ pushHistory: false \}\)/);
});

test('history reuse performs no remote work and persists only the new photo', () => {
  const reuseFlow = sourceBetween(foodSheetSource, 'const handleReuseMeal', 'const handleReuseRetry');
  assert.match(reuseFlow, /getMealComponents\(meal\.meal_id\)/);
  assert.match(reuseFlow, /persistPendingPhoto\(\)/);
  assert.match(reuseFlow, /mealName: meal\.meal_name/);
  assert.match(reuseFlow, /editMealId: null/);
  assert.doesNotMatch(reuseFlow, /meal\.photo_uri/);
  assert.doesNotMatch(reuseFlow, /meal\.meal_type|meal\.log_date/);
  assert.doesNotMatch(reuseFlow, /requestConsent|prepareFoodEstimateImage|scanFood/);

  const persistenceFlow = sourceBetween(foodSheetSource, 'const persistPendingPhoto', 'const commitRenderedState');
  assert.match(persistenceFlow, /savedUri !== undefined/);
  assert.match(persistenceFlow, /savePromise/);
});

test('photo title keeps reusable state, local recovery, and unavailable-AI entry behavior', () => {
  assert.match(photoTitleSource, /mealTitle: string/);
  assert.match(photoTitleSource, /suggestions\.slice\(0, 3\)/);
  assert.match(photoTitleSource, /Identify meal/);
  assert.match(photoTitleSource, /Reuse a past meal/);
  assert.match(photoTitleSource, /Estimate as new/);
  assert.match(photoTitleSource, /onRetrySuggestions/);
  assert.match(foodSheetSource, /hasReusableMeals\(\)/);
  assert.match(foodSheetSource, /setPhotoEstimateError\(FAILURE_MESSAGES\[scanResult\.kind\]\)/);
  const cancelFlow = sourceBetween(foodSheetSource, 'const handleScanCancel', 'const handleClarify');
  assert.match(cancelFlow, /onGoBack\(\)/);
  assert.doesNotMatch(cancelFlow, /discardPendingPhoto/);
  assert.match(entryMethodSource, /reusableMealsAvailable \? \(/);
  assert.match(entryMethodSource, /Reuse with camera/);
  assert.match(entryMethodSource, /Reuse with photo/);
});

test('photo estimate action stays above query-driven reuse results', () => {
  const estimateIndex = photoTitleSource.indexOf('title="Estimate as new"');
  const reuseResultsIndex = photoTitleSource.indexOf('Reuse a past meal');

  assert.ok(estimateIndex >= 0);
  assert.ok(reuseResultsIndex >= 0);
  assert.ok(estimateIndex < reuseResultsIndex);
  assert.match(
    foodSheetSource,
    /renderedStateKey === 'photo-title'[\s\S]*Math\.max\(previousHeight, measuredHeight\)/,
  );
});

test('sheet sizing stays stable and measures compact states by content', () => {
  assert.doesNotMatch(tabNavigatorSource, /const enableDynamicSizing/);
  assert.doesNotMatch(tabNavigatorSource, /enableDynamicSizing=\{/);
  assert.match(foodSheetSource, /CONTENT_SIZED_STATES[\s\S]*'estimation-error'/);
  assert.match(tabNavigatorSource, /contentHeight=\{contentHeight\}/);
  assert.match(
    sheetSource,
    /keyboardBehavior=\{contentHeight === undefined \? "fillParent" : "interactive"\}/,
  );
});

test('first measured detent propagates before the compact sheet opens', () => {
  assert.match(
    sheetSource,
    /const snapToCurrentDetent = \(\) => \{[\s\S]*prevStateKeyRef\.current = stateKey;[\s\S]*snapToIndex\(0\)/,
  );
  assert.match(
    sheetSource,
    /if \(stateChanged \|\| becameReady\) \{[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*snapToCurrentDetent\(\)/,
  );
  assert.match(sheetSource, /wasSizingReady\.current = sizingReady;/);
  assert.match(
    sheetSource,
    /contentHeight === null && lastContentSnapPointRef\.current !== null/,
  );
  assert.doesNotMatch(tabNavigatorSource, /sheetContentHeightFramesRef/);
  const loadingBranch = weightInputSource.match(
    /if \(!ready && !loadError\) \{([\s\S]*?)if \(loadError \|\| !birthDate\)/,
  );
  assert.ok(loadingBranch);
  assert.doesNotMatch(loadingBranch[1], /onLayout=/);
});
