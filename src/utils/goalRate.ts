import type { GoalType } from '../db/database';
import { goalRateBounds, validateGoalRate } from './nutritionSafety';

export { goalRateBounds } from './nutritionSafety';

export const GOAL_RATE_STEP_KG = 0.05;
export const GOAL_RATE_WARNING_THRESHOLD = 0.75;

export const GOAL_RATE_RANGES = {
  cut: goalRateBounds('cut'),
  maintain: goalRateBounds('maintain'),
  bulk: goalRateBounds('bulk'),
} as const satisfies Record<GoalType, { min: number; max: number; defaultRate: number }>;

export function normalizeGoalRate(rateKgPerWeek: number, goal: GoalType): number {
  if (goal === 'maintain') return 0;
  const directedRate = goal === 'cut' ? -Math.abs(rateKgPerWeek) : Math.abs(rateKgPerWeek);
  return Number((Math.round(directedRate / GOAL_RATE_STEP_KG) * GOAL_RATE_STEP_KG).toFixed(2));
}

export function goalRateSeverity(rateKgPerWeek: number, goal: GoalType, currentWeightKg?: number | null, tdeeKcal?: number | null): number {
  if (goal === 'maintain') return 0;
  const range = goalRateBounds(goal, currentWeightKg, tdeeKcal);
  const slowest = Math.min(Math.abs(range.min), Math.abs(range.max));
  const fastest = Math.max(Math.abs(range.min), Math.abs(range.max));
  const speed = Math.abs(rateKgPerWeek);
  return Math.min(1, Math.max(0, (speed - slowest) / (fastest - slowest)));
}

export function isGoalRateValid(rateKgPerWeek: number, goal: GoalType, currentWeightKg?: number | null): boolean {
  return validateGoalRate(rateKgPerWeek, goal, currentWeightKg) == null;
}
