import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GOAL_RATE_WARNING_THRESHOLD,
  goalRateBounds,
  goalRateSeverity,
  isGoalRateValid,
  normalizeGoalRate,
} from './goalRate';

test('goal rates normalize direction and snapping without silently clamping', () => {
  assert.equal(normalizeGoalRate(0.63, 'cut'), -0.65);
  assert.equal(normalizeGoalRate(-0.33, 'bulk'), 0.35);
  assert.equal(normalizeGoalRate(4, 'cut'), -4);
  assert.equal(normalizeGoalRate(4, 'bulk'), 4);
  assert.equal(normalizeGoalRate(0.5, 'maintain'), 0);
});

test('weight-relative rate bounds use the approved fractions and caps', () => {
  assert.deepEqual(goalRateBounds('cut', 30), { min: -0.3, max: -0.05, defaultRate: -0.3 });
  assert.deepEqual(goalRateBounds('bulk', 80), { min: 0.05, max: 0.4, defaultRate: 0.25 });
  assert.deepEqual(goalRateBounds('bulk', 100), { min: 0.05, max: 0.5, defaultRate: 0.25 });
});

test('goal-rate severity progresses from the slow edge to the fast edge', () => {
  assert.equal(goalRateSeverity(-0.05, 'cut', 80), 0);
  assert.ok(Math.abs(goalRateSeverity(-0.425, 'cut', 80) - 0.5) < 1e-12);
  assert.equal(goalRateSeverity(-0.8, 'cut', 80), 1);
  assert.equal(goalRateSeverity(0.05, 'bulk', 80), 0);
  assert.equal(goalRateSeverity(0.4, 'bulk', 80), 1);
  assert.ok(goalRateSeverity(0.35, 'bulk', 80) >= GOAL_RATE_WARNING_THRESHOLD);
});

test('goal-rate validation rejects sign, step, and weight-relative boundary violations', () => {
  assert.equal(isGoalRateValid(-0.05, 'cut', 80), true);
  assert.equal(isGoalRateValid(-0.8, 'cut', 80), true);
  assert.equal(isGoalRateValid(-0.85, 'cut', 80), false);
  assert.equal(isGoalRateValid(0.4, 'bulk', 80), true);
  assert.equal(isGoalRateValid(0.45, 'bulk', 80), false);
  assert.equal(isGoalRateValid(0.1, 'bulk', 80), true);
  assert.equal(isGoalRateValid(0, 'maintain', 80), true);
  assert.equal(isGoalRateValid(0.05, 'cut', 80), false);
});
