import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(
  resolve(testDirectory, '../screens/DashboardScreen.tsx'),
  'utf8',
);
const designSource = readFileSync(resolve(testDirectory, '../../DESIGN.md'), 'utf8');
const ringSource = dashboardSource.slice(
  dashboardSource.indexOf('function CircularProgress'),
  dashboardSource.indexOf('interface MacroProgressProps'),
);

test('dashboard calorie ring keeps white progress and darker white overflow', () => {
  assert.match(ringSource, /stroke=\{M3\.primary\}/);
  assert.match(ringSource, /stroke=\{M3\.onSurface\}/);
  assert.doesNotMatch(ringSource, /M3\.calories(?:Overflow)?/);
  assert.match(designSource, /dashboard calorie ring uses White Action with an Ink overflow arc/);
});
