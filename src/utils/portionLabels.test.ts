import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPortionLabel, formatServingSummary, parsePositivePortionInput } from './portionLabels';

test('parses positive portion input strictly with either decimal separator', () => {
  assert.equal(parsePositivePortionInput('1.5'), 1.5);
  assert.equal(parsePositivePortionInput('1,5'), 1.5);
  assert.equal(parsePositivePortionInput('.5'), 0.5);
  assert.equal(parsePositivePortionInput('0'), null);
  assert.equal(parsePositivePortionInput('-1'), null);
  assert.equal(parsePositivePortionInput('1.2.3'), null);
  assert.equal(parsePositivePortionInput('1 serving'), null);
});

test('does not append a weight already present in a portion label', () => {
  assert.equal(formatPortionLabel('1 cup (180g)', 180), '1 cup (180g)');
  assert.equal(formatPortionLabel('100 g', 100), '100 g');
  assert.equal(formatPortionLabel('1 glass (250ml)', 250, 'ml'), '1 glass (250ml)');
});

test('adds a missing portion weight once', () => {
  assert.equal(formatPortionLabel('1 cup', 180), '1 cup · 180g');
  assert.equal(formatPortionLabel('1 glass', 250, 'ml'), '1 glass · 250ml');
});

test('removes repeated parenthetical weights from provider labels', () => {
  assert.equal(formatPortionLabel('1 serving (100g)(100g)', 100), '1 serving (100g)');
  assert.equal(formatPortionLabel('1 serving (100 g) · (100g)', 100), '1 serving (100g)');
});

test('shows a distinct total only for multiple servings', () => {
  assert.equal(formatServingSummary('1 cup (180g)', 180, 180), '1 cup (180g)');
  assert.equal(formatServingSummary('1 cup (180g)', 180, 360), '1 cup (180g) · 360g total');
});
