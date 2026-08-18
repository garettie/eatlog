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

test('photo capture pauses for a meal title before the first scan request', () => {
  assert.match(foodSheetSource, /'photo-title'/);
  assert.match(foodSheetSource, /<PhotoMealTitleState/);
  assert.doesNotMatch(foodSheetSource, /scanFood\(base64\)/);
  assert.match(foodSheetSource, /scanFood\([^,]+,\s*mealTitle/);
});

test('sheet sizing stays stable and gives estimation errors a compact detent', () => {
  assert.doesNotMatch(tabNavigatorSource, /const enableDynamicSizing/);
  assert.doesNotMatch(tabNavigatorSource, /enableDynamicSizing=\{/);
  assert.match(tabNavigatorSource, /case 'estimation-error':\s+return \['42%', '100%'\];/);
});
