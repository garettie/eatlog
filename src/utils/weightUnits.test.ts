import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatWeight,
  fromKilograms,
  parseWeightInput,
  toKilograms,
} from './weightUnits';

test('kg and lb conversions are reciprocal without utility-layer rounding', () => {
  const weightKg = 81.23456;
  assert.ok(Math.abs(toKilograms(fromKilograms(weightKg, 'lb'), 'lb') - weightKg) < 1e-12);
  assert.equal(toKilograms(weightKg, 'kg'), weightKg);
  assert.equal(fromKilograms(weightKg, 'kg'), weightKg);
});

test('period and comma decimal separators parse identically', () => {
  assert.equal(parseWeightInput('81.25'), 81.25);
  assert.equal(parseWeightInput('81,25'), 81.25);
});

test('mixed separators, extra decimals, incomplete, and non-finite input fail', () => {
  for (const value of ['81,2.5', '81.2.5', '81.250', '81.', '81,', '.', ',', '', 'Infinity', 'NaN']) {
    assert.equal(parseWeightInput(value), null, value);
  }
});

test('formatted weights have one decimal place and no suffix', () => {
  assert.equal(formatWeight(81.25, 'kg'), '81.3');
  assert.equal(formatWeight(81.25, 'lb'), '179.1');
});

test('canonical storage boundary can round converted kilograms to three decimals', () => {
  const unrounded = toKilograms(179.1, 'lb');
  assert.notEqual(unrounded, 81.238);
  assert.equal(Math.round(unrounded * 1000) / 1000, 81.238);
});
