import type { GoalType, ProteinPreference, Sex } from '../db/database';
import {
  calcBMR,
  calculateMacrosForCalories,
  type MacroTargets,
} from './calculations';
import {
  addCalendarDays,
  calendarDaysBetween,
  parseLocalISO,
} from './calendar';

export interface AdaptiveDailyCalories {
  date: string;
  calories: number;
}

export interface AdaptiveWeightReading {
  date: string;
  scaleWeightKg: number;
  trendWeightKg: number;
}

export interface AdaptiveProfileEvidence {
  sex: Sex;
  heightCm: number;
  birthDate: string;
  goalType: GoalType;
  goalRateKgPerWeek: number;
  proteinPreference: ProteinPreference;
}

export interface AdaptiveEvidencePayload {
  windowStart: string;
  windowEnd: string;
  dailyCalories: AdaptiveDailyCalories[];
  weights: AdaptiveWeightReading[];
  profile: AdaptiveProfileEvidence;
  previousTargetId: number;
}

export interface AdaptiveEligibility {
  intakeDayCount: number;
  requiredIntakeDayCount: 10;
  weightLogCount: number;
  requiredWeightLogCount: 4;
  hasEarlyWeight: boolean;
  hasLateWeight: boolean;
  endpointSpanDays: number;
  requiredEndpointSpanDays: 7;
  eligible: boolean;
}

export interface AdaptiveEligibilityInput {
  reviewDate: string;
  dailyCalories: AdaptiveDailyCalories[];
  weights: AdaptiveWeightReading[];
}

export interface AdaptiveRecommendationInput extends AdaptiveEligibilityInput {
  profile: AdaptiveProfileEvidence;
  previousTdee: number;
  previousTargetId: number;
}

export interface AdaptiveRecommendation extends MacroTargets {
  windowStart: string;
  windowEnd: string;
  eligibility: AdaptiveEligibility;
  averageIntakeKcal: number;
  startTrendWeightKg: number;
  endTrendWeightKg: number;
  elapsedDays: number;
  rawTdee: number;
  previousTdee: number;
  proposedTdee: number;
  currentBmr: number;
  tdeeFloor: number;
  evidenceHash: string;
}

function windowFor(reviewDate: string): { windowStart: string; windowEnd: string } {
  parseLocalISO(reviewDate);
  return { windowStart: addCalendarDays(reviewDate, -13), windowEnd: reviewDate };
}

function isWithin(date: string, start: string, end: string): boolean {
  parseLocalISO(date);
  return date >= start && date <= end;
}

function normalizeDailyCalories(
  rows: AdaptiveDailyCalories[],
  windowStart: string,
  windowEnd: string,
): AdaptiveDailyCalories[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!Number.isFinite(row.calories)) {
      throw new RangeError('Daily calories must be finite');
    }
    if (isWithin(row.date, windowStart, windowEnd)) {
      totals.set(row.date, (totals.get(row.date) ?? 0) + row.calories);
    }
  }
  return [...totals]
    .map(([date, calories]) => ({ date, calories }))
    .filter((row) => row.calories > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeWeights(
  rows: AdaptiveWeightReading[],
  windowStart: string,
  windowEnd: string,
): AdaptiveWeightReading[] {
  const filtered = rows
    .map((row) => ({ ...row }))
    .filter((row) => isWithin(row.date, windowStart, windowEnd))
    .sort((a, b) => a.date.localeCompare(b.date));

  filtered.forEach((row, index) => {
    if (
      !Number.isFinite(row.scaleWeightKg)
      || row.scaleWeightKg <= 0
      || !Number.isFinite(row.trendWeightKg)
      || row.trendWeightKg <= 0
    ) {
      throw new RangeError('Weight evidence must be finite and positive');
    }
    if (index > 0 && row.date === filtered[index - 1].date) {
      throw new RangeError(`Duplicate weight date: ${row.date}`);
    }
  });
  return filtered;
}

function normalizedEvidence(input: AdaptiveEligibilityInput): {
  windowStart: string;
  windowEnd: string;
  dailyCalories: AdaptiveDailyCalories[];
  weights: AdaptiveWeightReading[];
} {
  const { windowStart, windowEnd } = windowFor(input.reviewDate);
  return {
    windowStart,
    windowEnd,
    dailyCalories: normalizeDailyCalories(input.dailyCalories, windowStart, windowEnd),
    weights: normalizeWeights(input.weights, windowStart, windowEnd),
  };
}

export function evaluateAdaptiveEligibility(input: AdaptiveEligibilityInput): AdaptiveEligibility {
  const evidence = normalizedEvidence(input);
  const firstWeight = evidence.weights[0];
  const lastWeight = evidence.weights[evidence.weights.length - 1];
  const earlyEnd = addCalendarDays(evidence.windowStart, 3);
  const lateStart = addCalendarDays(evidence.windowStart, 10);
  const endpointSpanDays = firstWeight && lastWeight
    ? calendarDaysBetween(firstWeight.date, lastWeight.date)
    : 0;
  const result = {
    intakeDayCount: evidence.dailyCalories.length,
    requiredIntakeDayCount: 10 as const,
    weightLogCount: evidence.weights.length,
    requiredWeightLogCount: 4 as const,
    hasEarlyWeight: evidence.weights.some((row) => row.date <= earlyEnd),
    hasLateWeight: evidence.weights.some((row) => row.date >= lateStart),
    endpointSpanDays,
    requiredEndpointSpanDays: 7 as const,
  };

  return {
    ...result,
    eligible: result.intakeDayCount >= result.requiredIntakeDayCount
      && result.weightLogCount >= result.requiredWeightLogCount
      && result.hasEarlyWeight
      && result.hasLateWeight
      && result.endpointSpanDays >= result.requiredEndpointSpanDays,
  };
}

function ageOnDate(birthDate: string, date: string): number {
  const birth = parseLocalISO(birthDate);
  const onDate = parseLocalISO(date);
  let age = onDate.getFullYear() - birth.getFullYear();
  if (
    onDate.getMonth() < birth.getMonth()
    || (onDate.getMonth() === birth.getMonth() && onDate.getDate() < birth.getDate())
  ) {
    age -= 1;
  }
  return age;
}

function canonicalEvidence(payload: AdaptiveEvidencePayload): AdaptiveEvidencePayload {
  parseLocalISO(payload.windowStart);
  parseLocalISO(payload.windowEnd);
  return {
    windowStart: payload.windowStart,
    windowEnd: payload.windowEnd,
    dailyCalories: payload.dailyCalories
      .map((row) => ({ date: row.date, calories: row.calories }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    weights: payload.weights
      .map((row) => ({
        date: row.date,
        scaleWeightKg: row.scaleWeightKg,
        trendWeightKg: row.trendWeightKg,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    profile: {
      sex: payload.profile.sex,
      heightCm: payload.profile.heightCm,
      birthDate: payload.profile.birthDate,
      goalType: payload.profile.goalType,
      goalRateKgPerWeek: payload.profile.goalRateKgPerWeek,
      proteinPreference: payload.profile.proteinPreference,
    },
    previousTargetId: payload.previousTargetId,
  };
}

export function hashAdaptiveEvidence(payload: AdaptiveEvidencePayload): string {
  const json = JSON.stringify(canonicalEvidence(payload));
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function calculateAdaptiveRecommendation(
  input: AdaptiveRecommendationInput,
): AdaptiveRecommendation {
  if (!Number.isFinite(input.previousTdee) || input.previousTdee <= 0) {
    throw new RangeError('Previous TDEE must be finite and positive');
  }

  const evidence = normalizedEvidence(input);
  const eligibility = evaluateAdaptiveEligibility(input);
  if (!eligibility.eligible) {
    throw new RangeError('Adaptive evidence is not eligible');
  }

  const start = evidence.weights[0];
  const end = evidence.weights[evidence.weights.length - 1];
  const elapsedDays = calendarDaysBetween(start.date, end.date);
  const averageIntakeKcal = evidence.dailyCalories.reduce(
    (sum, row) => sum + row.calories,
    0,
  ) / evidence.dailyCalories.length;
  const dailyEnergyChange = (end.trendWeightKg - start.trendWeightKg) * 7700 / elapsedDays;
  const rawTdee = averageIntakeKcal - dailyEnergyChange;
  const smoothedTdee = 0.7 * rawTdee + 0.3 * input.previousTdee;
  const currentBmr = calcBMR({
    sex: input.profile.sex,
    weight_kg: end.trendWeightKg,
    height_cm: input.profile.heightCm,
    age: ageOnDate(input.profile.birthDate, input.reviewDate),
  });
  const tdeeFloor = 1.2 * currentBmr;
  const clampedTdee = Math.min(
    input.previousTdee * 1.1,
    Math.max(input.previousTdee * 0.9, smoothedTdee),
  );
  const proposedTdee = Math.max(tdeeFloor, clampedTdee);
  const unflooredTarget = proposedTdee + input.profile.goalRateKgPerWeek * 7700 / 7;
  const macros = calculateMacrosForCalories({
    targetCalories: Math.round(Math.max(tdeeFloor, unflooredTarget)),
    goalType: input.profile.goalType,
    proteinPreference: input.profile.proteinPreference,
    weightKg: end.trendWeightKg,
  });
  const evidenceHash = hashAdaptiveEvidence({
    windowStart: evidence.windowStart,
    windowEnd: evidence.windowEnd,
    dailyCalories: evidence.dailyCalories,
    weights: evidence.weights,
    profile: input.profile,
    previousTargetId: input.previousTargetId,
  });

  return {
    ...macros,
    windowStart: evidence.windowStart,
    windowEnd: evidence.windowEnd,
    eligibility,
    averageIntakeKcal,
    startTrendWeightKg: start.trendWeightKg,
    endTrendWeightKg: end.trendWeightKg,
    elapsedDays,
    rawTdee: Math.round(rawTdee),
    previousTdee: Math.round(input.previousTdee),
    proposedTdee: Math.round(proposedTdee),
    currentBmr,
    tdeeFloor,
    evidenceHash,
  };
}
