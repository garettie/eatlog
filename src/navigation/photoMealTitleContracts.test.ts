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

test('photo capture pauses for a meal title before the first scan request', () => {
  assert.match(foodSheetSource, /'photo-title'/);
  assert.match(foodSheetSource, /<PhotoMealTitleState/);
  assert.doesNotMatch(foodSheetSource, /scanFood\(base64\)/);
  assert.match(foodSheetSource, /scanFood\([^,]+,\s*mealTitle/);
});

test('sheet sizing stays stable and measures compact states by content', () => {
  assert.doesNotMatch(tabNavigatorSource, /const enableDynamicSizing/);
  assert.doesNotMatch(tabNavigatorSource, /enableDynamicSizing=\{/);
  assert.match(foodSheetSource, /CONTENT_SIZED_STATES[\s\S]*'estimation-error'/);
  assert.match(tabNavigatorSource, /contentHeight=\{contentHeight\}/);
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
