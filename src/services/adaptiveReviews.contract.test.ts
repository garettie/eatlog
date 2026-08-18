import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(testDirectory, 'adaptiveReviews.ts'), 'utf8');

test('accepted adaptive targets preserve the non-adaptive evidence boundary', () => {
  assert.match(source, /calculation_method != 'adaptive'/);
  assert.match(source, /const resetDate = resetTarget\?\.effective_date \?\? target\.effective_date/);
  assert.match(source, /const evidenceStart = resetDate > windowStart \? resetDate : windowStart/);
});

test('review resolution revalidates and persists against one current date', () => {
  const resolutionDate = source.indexOf('const resolutionDate = todayISO()');
  const evidenceReload = source.indexOf('loadEvidence(txn, resolutionDate)', resolutionDate);
  const targetInsert = source.indexOf('          resolutionDate,', evidenceReload);
  assert.ok(resolutionDate >= 0, 'Resolution should capture the current date once');
  assert.ok(evidenceReload > resolutionDate, 'Resolution should reload evidence for the current date');
  assert.ok(targetInsert > evidenceReload, 'Accepted target should use the revalidated date');
  assert.doesNotMatch(source, /loadEvidence\(txn, review\.review_date\)/);
});

test('adaptive calculation receives the current user-visible target baseline', () => {
  assert.match(source, /previousTargetCalories: target\.target_calories/);
});
