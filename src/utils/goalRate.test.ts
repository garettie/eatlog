import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GOAL_RATE_WARNING_THRESHOLD,
  goalRateSeverity,
  isGoalRateValid,
  normalizeGoalRate,
} from './goalRate';

test('goal rates normalize direction, snapping, and configured bounds', () => {
  assert.equal(normalizeGoalRate(0.63, 'cut'), -0.65);
  assert.equal(normalizeGoalRate(-0.33, 'bulk'), 0.35);
  assert.equal(normalizeGoalRate(4, 'cut'), -1);
  assert.equal(normalizeGoalRate(4, 'bulk'), 0.5);
  assert.equal(normalizeGoalRate(0.5, 'maintain'), 0);
});

test('goal-rate severity progresses from the slow edge to the fast edge', () => {
  assert.equal(goalRateSeverity(-0.1, 'cut'), 0);
  assert.ok(Math.abs(goalRateSeverity(-0.55, 'cut') - 0.5) < 1e-12);
  assert.equal(goalRateSeverity(-1, 'cut'), 1);
  assert.equal(goalRateSeverity(0.05, 'bulk'), 0);
  assert.equal(goalRateSeverity(0.5, 'bulk'), 1);
  assert.ok(goalRateSeverity(0.4, 'bulk') >= GOAL_RATE_WARNING_THRESHOLD);
});

test('goal-rate validation uses the same bounds as the selectors', () => {
  assert.equal(isGoalRateValid(-0.1, 'cut'), true);
  assert.equal(isGoalRateValid(-0.05, 'cut'), false);
  assert.equal(isGoalRateValid(0.5, 'bulk'), true);
  assert.equal(isGoalRateValid(0.55, 'bulk'), false);
  assert.equal(isGoalRateValid(0, 'maintain'), true);
});
