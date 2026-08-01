import type { GoalType } from '../db/database';

export const GOAL_RATE_STEP_KG = 0.05;
export const GOAL_RATE_WARNING_THRESHOLD = 0.75;

export const GOAL_RATE_RANGES = {
  cut: { min: -1, max: -0.1, defaultRate: -0.5 },
  maintain: { min: 0, max: 0, defaultRate: 0 },
  bulk: { min: 0.05, max: 0.5, defaultRate: 0.25 },
} as const satisfies Record<GoalType, { min: number; max: number; defaultRate: number }>;

export function normalizeGoalRate(rateKgPerWeek: number, goal: GoalType): number {
  if (goal === 'maintain') return 0;
  const range = GOAL_RATE_RANGES[goal];
  const directedRate = goal === 'cut' ? -Math.abs(rateKgPerWeek) : Math.abs(rateKgPerWeek);
  const clamped = Math.min(range.max, Math.max(range.min, directedRate));
  return Number((Math.round(clamped / GOAL_RATE_STEP_KG) * GOAL_RATE_STEP_KG).toFixed(2));
}

export function goalRateSeverity(rateKgPerWeek: number, goal: GoalType): number {
  if (goal === 'maintain') return 0;
  const range = GOAL_RATE_RANGES[goal];
  const slowest = Math.min(Math.abs(range.min), Math.abs(range.max));
  const fastest = Math.max(Math.abs(range.min), Math.abs(range.max));
  const speed = Math.abs(normalizeGoalRate(rateKgPerWeek, goal));
  return Math.min(1, Math.max(0, (speed - slowest) / (fastest - slowest)));
}

export function isGoalRateValid(rateKgPerWeek: number, goal: GoalType): boolean {
  if (!Number.isFinite(rateKgPerWeek)) return false;
  const range = GOAL_RATE_RANGES[goal];
  return rateKgPerWeek >= range.min && rateKgPerWeek <= range.max;
}
