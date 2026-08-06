import type { GoalType, ProteinPreference, Sex } from '../db/database';
import {
  ADAPTIVE_ALGORITHM_CONFIG,
  type AdaptiveAlgorithmConfig,
} from './adaptiveAlgorithmConfig';
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
import { isGoalRateValid } from './goalRate';

export interface AdaptiveDailyCalories {
  date: string;
  calories: number;
}

export type AdaptiveIntakeConfirmationStatus = 'complete' | 'partial' | 'intentional_fast';
export type AdaptiveIntakeConfirmationSource = 'adaptive_review';

export interface AdaptiveIntakeDayConfirmation {
  date: string;
  status: AdaptiveIntakeConfirmationStatus;
  source: AdaptiveIntakeConfirmationSource;
}

export interface AdaptiveIntakeConfirmationDay {
  date: string;
  calories: number;
  recentMedianCalories: number;
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
  algorithmVersion: number;
  config: AdaptiveAlgorithmConfig;
  configuredWindowStart: string;
  configuredWindowEnd: string;
  estimationStart: string;
  estimationEnd: string;
  dailyCalories: AdaptiveDailyCalories[];
  intakeDayConfirmations: AdaptiveIntakeDayConfirmation[];
  weights: AdaptiveWeightReading[];
  profile: AdaptiveProfileEvidence;
  previousTdee: number;
  previousTargetId: number;
}

export type AdaptiveIneligibilityReason =
  | 'insufficient_aligned_intake_days'
  | 'insufficient_weight_readings'
  | 'stale_weight_evidence'
  | 'insufficient_weight_span';

export interface AdaptiveEligibility {
  configuredWindowStart: string;
  configuredWindowEnd: string;
  estimationStart: string | null;
  estimationEnd: string | null;
  intakeDayCount: number;
  requiredIntakeDayCount: number;
  weightLogCount: number;
  requiredWeightLogCount: number;
  alignedIntakeDayCount: number;
  alignedWeightReadingCount: number;
  daysSinceLastWeight: number | null;
  maximumDaysSinceLastWeight: number;
  hasRecentWeight: boolean;
  endpointSpanDays: number;
  elapsedSpanDays: number;
  requiredEndpointSpanDays: number;
  intakeEvidenceCompleteness: 'positive_logged_days_provisional';
  reasons: AdaptiveIneligibilityReason[];
  eligible: boolean;
}

export interface AdaptiveEligibilityInput {
  reviewDate: string;
  dailyCalories: AdaptiveDailyCalories[];
  weights: AdaptiveWeightReading[];
  intakeDayConfirmations?: AdaptiveIntakeDayConfirmation[];
  config?: AdaptiveAlgorithmConfig;
}

export interface AdaptiveRecommendationInput extends AdaptiveEligibilityInput {
  profile: AdaptiveProfileEvidence;
  previousTdee: number;
  previousTargetId: number;
}

export interface AdaptiveRecommendation extends MacroTargets {
  algorithmVersion: number;
  windowStart: string;
  windowEnd: string;
  estimationStart: string;
  estimationEnd: string;
  eligibility: AdaptiveEligibility;
  alignedIntakeDayCount: number;
  alignedWeightReadingCount: number;
  averageIntakeKcal: number;
  startTrendWeightKg: number;
  endTrendWeightKg: number;
  elapsedDays: number;
  weightSlopeKgPerDay: number;
  dailyEnergyChangeKcal: number;
  estimatedTdee: number;
  rawTdee: number;
  previousTdee: number;
  proposedTdee: number;
  currentBmr: number;
  tdeeFloor: number;
  evidenceHash: string;
}

export type AdaptivePauseReason = 'tdee_floor_conflict' | 'macro_target_infeasible';

export type AdaptiveCalculationResult =
  | { kind: 'recommendation'; recommendation: AdaptiveRecommendation }
  | {
      kind: 'holding';
      reason: 'intake_confirmation_required';
      eligibility: AdaptiveEligibility;
      confirmationDays: AdaptiveIntakeConfirmationDay[];
    }
  | {
      kind: 'ineligible';
      reasons: AdaptiveIneligibilityReason[];
      eligibility: AdaptiveEligibility;
    }
  | {
      kind: 'paused';
      reason: 'tdee_floor_conflict';
      eligibility: AdaptiveEligibility;
      tdeeFloor: number;
      permittedUpperTdee: number;
    }
  | {
      kind: 'paused';
      reason: 'macro_target_infeasible';
      eligibility: AdaptiveEligibility;
      requestedTargetCalories: number;
      allocatedTargetCalories: number;
    };

export class AdaptiveInputError extends RangeError {
  override name = 'AdaptiveInputError';
}

const VALID_SEXES: readonly Sex[] = ['male', 'female'];
const VALID_GOAL_TYPES: readonly GoalType[] = ['cut', 'maintain', 'bulk'];
const VALID_PROTEIN_PREFERENCES: readonly ProteinPreference[] = [
  'low',
  'moderate',
  'high',
  'extra_high',
];
const VALID_INTAKE_CONFIRMATION_STATUSES: readonly AdaptiveIntakeConfirmationStatus[] = [
  'complete',
  'partial',
  'intentional_fast',
];
const VALID_INTAKE_CONFIRMATION_SOURCES: readonly AdaptiveIntakeConfirmationSource[] = [
  'adaptive_review',
];

function inputError(message: string): never {
  throw new AdaptiveInputError(message);
}

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) inputError(`${label} must be finite`);
  return value;
}

function requireFinitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    inputError(`${label} must be finite and positive`);
  }
  return value;
}

function checkedAdd(left: number, right: number, label: string): number {
  const total = left + right;
  if (!Number.isFinite(total)) inputError(`${label} overflowed`);
  return total;
}

function requireValidDate(value: string, label: string): void {
  try {
    parseLocalISO(value);
  } catch {
    inputError(`${label} must be a valid local ISO date`);
  }
}

function validateConfig(config: AdaptiveAlgorithmConfig): void {
  const positiveIntegers: Array<[number, string]> = [
    [config.algorithmVersion, 'Algorithm version'],
    [config.windowDays, 'Window days'],
    [config.minimumIntakeDays, 'Minimum intake days'],
    [config.minimumWeightReadings, 'Minimum weight readings'],
    [config.minimumWeightSpanDays, 'Minimum weight span days'],
    [config.maximumDaysSinceLastWeight, 'Maximum days since last weight'],
    [config.suspiciousIntakeMinimumPatternDays, 'Suspicious intake minimum pattern days'],
  ];
  for (const [value, label] of positiveIntegers) {
    if (!Number.isInteger(value) || value <= 0) inputError(`${label} must be a positive integer`);
  }
  if (config.minimumWeightReadings < 2) {
    inputError('Minimum weight readings must support slope estimation');
  }
  requireFinitePositive(config.kcalPerKg, 'Kcal per kilogram');
  requireFinitePositive(config.minimumActivityMultiplier, 'Minimum activity multiplier');
  requireFinitePositive(config.trendHalfLifeDays, 'Trend half-life days');
  requireFinite(config.newEstimateWeight, 'New estimate weight');
  if (config.newEstimateWeight < 0 || config.newEstimateWeight > 1) {
    inputError('New estimate weight must be between zero and one');
  }
  requireFinite(config.maximumTdeeChangeFraction, 'Maximum TDEE change fraction');
  if (config.maximumTdeeChangeFraction < 0) {
    inputError('Maximum TDEE change fraction must be non-negative');
  }
  if (config.maximumTdeeChangeKcal !== null) {
    requireFinitePositive(config.maximumTdeeChangeKcal, 'Maximum TDEE change kcal');
  }
  requireFinite(config.macroCalorieToleranceKcal, 'Macro calorie tolerance');
  if (config.macroCalorieToleranceKcal < 0) {
    inputError('Macro calorie tolerance must be non-negative');
  }
  requireFinite(config.suspiciousIntakeMedianFraction, 'Suspicious intake median fraction');
  if (config.suspiciousIntakeMedianFraction <= 0 || config.suspiciousIntakeMedianFraction >= 1) {
    inputError('Suspicious intake median fraction must be between zero and one');
  }
  if (config.intentionalFastTreatment !== 'exclude_from_intake') {
    inputError('Intentional fast treatment is invalid');
  }
}

function windowFor(
  reviewDate: string,
  config: AdaptiveAlgorithmConfig,
): { windowStart: string; windowEnd: string } {
  requireValidDate(reviewDate, 'Review date');
  return {
    windowStart: addCalendarDays(reviewDate, -(config.windowDays - 1)),
    windowEnd: reviewDate,
  };
}

function isWithin(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function normalizeDailyCalories(
  rows: AdaptiveDailyCalories[],
  windowStart: string,
  windowEnd: string,
): AdaptiveDailyCalories[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    requireValidDate(row.date, 'Calorie date');
    requireFinite(row.calories, 'Daily calories');
    if (row.calories < 0) inputError('Daily calories must be non-negative');
    if (isWithin(row.date, windowStart, windowEnd)) {
      totals.set(
        row.date,
        checkedAdd(totals.get(row.date) ?? 0, row.calories, `Calories for ${row.date}`),
      );
    }
  }
  return [...totals]
    .map(([date, calories]) => ({ date, calories }))
    .filter((row) => row.calories > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeIntakeDayConfirmations(
  rows: AdaptiveIntakeDayConfirmation[],
  windowStart: string,
  windowEnd: string,
): AdaptiveIntakeDayConfirmation[] {
  const dates = new Set<string>();
  return rows.map((row) => {
    requireValidDate(row.date, 'Intake confirmation date');
    if (!VALID_INTAKE_CONFIRMATION_STATUSES.includes(row.status)) {
      inputError('Intake confirmation status is invalid');
    }
    if (!VALID_INTAKE_CONFIRMATION_SOURCES.includes(row.source)) {
      inputError('Intake confirmation source is invalid');
    }
    if (dates.has(row.date)) inputError(`Duplicate intake confirmation date: ${row.date}`);
    dates.add(row.date);
    return { ...row };
  })
    .filter((row) => isWithin(row.date, windowStart, windowEnd))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function median(values: number[]): number {
  if (values.length === 0) inputError('Median requires at least one value');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return requireFinite(value, 'Recent intake median');
}

function normalizeWeights(
  rows: AdaptiveWeightReading[],
  windowStart: string,
  windowEnd: string,
): AdaptiveWeightReading[] {
  const dates = new Set<string>();
  const validated = rows.map((row) => {
    requireValidDate(row.date, 'Weight date');
    requireFinitePositive(row.scaleWeightKg, 'Scale weight');
    requireFinitePositive(row.trendWeightKg, 'Trend weight');
    if (dates.has(row.date)) inputError(`Duplicate weight date: ${row.date}`);
    dates.add(row.date);
    return { ...row };
  });
  return validated
    .filter((row) => isWithin(row.date, windowStart, windowEnd))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function validateProfile(profile: AdaptiveProfileEvidence, reviewDate: string): void {
  if (!VALID_SEXES.includes(profile.sex)) inputError('Sex is invalid');
  if (!VALID_GOAL_TYPES.includes(profile.goalType)) inputError('Goal type is invalid');
  if (!VALID_PROTEIN_PREFERENCES.includes(profile.proteinPreference)) {
    inputError('Protein preference is invalid');
  }
  requireFinitePositive(profile.heightCm, 'Height');
  requireValidDate(profile.birthDate, 'Birth date');
  if (calendarDaysBetween(profile.birthDate, reviewDate) < 0) {
    inputError('Birth date cannot be later than the review date');
  }
  requireFinite(profile.goalRateKgPerWeek, 'Goal rate');
  if (!isGoalRateValid(profile.goalRateKgPerWeek, profile.goalType)) {
    inputError(`Goal rate is invalid for goal type ${profile.goalType}`);
  }
}

interface NormalizedEvidence {
  windowStart: string;
  windowEnd: string;
  dailyCalories: AdaptiveDailyCalories[];
  weights: AdaptiveWeightReading[];
  alignedDailyCalories: AdaptiveDailyCalories[];
  alignedIntakeDayConfirmations: AdaptiveIntakeDayConfirmation[];
  suspiciousIntakeDays: AdaptiveIntakeConfirmationDay[];
  estimationStart: string | null;
  estimationEnd: string | null;
}

function normalizedEvidence(input: AdaptiveEligibilityInput): NormalizedEvidence {
  const config = input.config ?? ADAPTIVE_ALGORITHM_CONFIG;
  validateConfig(config);
  const { windowStart, windowEnd } = windowFor(input.reviewDate, config);
  const dailyCalories = normalizeDailyCalories(input.dailyCalories, windowStart, windowEnd);
  const intakeDayConfirmations = normalizeIntakeDayConfirmations(
    input.intakeDayConfirmations ?? [],
    windowStart,
    windowEnd,
  );
  const weights = normalizeWeights(input.weights, windowStart, windowEnd);
  const estimationStart = weights[0]?.date ?? null;
  const estimationEnd = weights[weights.length - 1]?.date ?? null;
  const alignedRawDailyCalories = estimationStart && estimationEnd
    ? dailyCalories.filter((row) => isWithin(row.date, estimationStart, estimationEnd))
    : [];
  const alignedIntakeDayConfirmations = estimationStart && estimationEnd
    ? intakeDayConfirmations.filter((row) => isWithin(row.date, estimationStart, estimationEnd))
    : [];
  const confirmationByDate = new Map(
    alignedIntakeDayConfirmations.map((confirmation) => [confirmation.date, confirmation]),
  );
  const alignedDailyCalories = alignedRawDailyCalories.filter((row) => {
    const status = confirmationByDate.get(row.date)?.status;
    return status !== 'partial' && status !== 'intentional_fast';
  });
  const recentMedianCalories = alignedDailyCalories.length >= config.suspiciousIntakeMinimumPatternDays
    ? median(alignedDailyCalories.map((row) => row.calories))
    : null;
  const suspiciousIntakeDays = recentMedianCalories === null
    ? []
    : alignedDailyCalories
        .filter((row) => (
          !confirmationByDate.has(row.date)
          && row.calories < recentMedianCalories * config.suspiciousIntakeMedianFraction
        ))
        .map((row) => ({ ...row, recentMedianCalories }));
  return {
    windowStart,
    windowEnd,
    dailyCalories,
    weights,
    alignedDailyCalories,
    alignedIntakeDayConfirmations,
    suspiciousIntakeDays,
    estimationStart,
    estimationEnd,
  };
}

function eligibilityFor(
  evidence: NormalizedEvidence,
  config: AdaptiveAlgorithmConfig,
): AdaptiveEligibility {
  const elapsedSpanDays = evidence.estimationStart && evidence.estimationEnd
    ? calendarDaysBetween(evidence.estimationStart, evidence.estimationEnd)
    : 0;
  const daysSinceLastWeight = evidence.estimationEnd
    ? calendarDaysBetween(evidence.estimationEnd, evidence.windowEnd)
    : null;
  const hasRecentWeight = daysSinceLastWeight !== null
    && daysSinceLastWeight <= config.maximumDaysSinceLastWeight;
  const reasons: AdaptiveIneligibilityReason[] = [];
  if (evidence.alignedDailyCalories.length < config.minimumIntakeDays) {
    reasons.push('insufficient_aligned_intake_days');
  }
  if (evidence.weights.length < config.minimumWeightReadings) {
    reasons.push('insufficient_weight_readings');
  }
  if (!hasRecentWeight) reasons.push('stale_weight_evidence');
  if (elapsedSpanDays < config.minimumWeightSpanDays) {
    reasons.push('insufficient_weight_span');
  }
  return {
    configuredWindowStart: evidence.windowStart,
    configuredWindowEnd: evidence.windowEnd,
    estimationStart: evidence.estimationStart,
    estimationEnd: evidence.estimationEnd,
    intakeDayCount: evidence.alignedDailyCalories.length,
    requiredIntakeDayCount: config.minimumIntakeDays,
    weightLogCount: evidence.weights.length,
    requiredWeightLogCount: config.minimumWeightReadings,
    alignedIntakeDayCount: evidence.alignedDailyCalories.length,
    alignedWeightReadingCount: evidence.weights.length,
    daysSinceLastWeight,
    maximumDaysSinceLastWeight: config.maximumDaysSinceLastWeight,
    hasRecentWeight,
    endpointSpanDays: elapsedSpanDays,
    elapsedSpanDays,
    requiredEndpointSpanDays: config.minimumWeightSpanDays,
    intakeEvidenceCompleteness: 'positive_logged_days_provisional',
    reasons,
    eligible: reasons.length === 0,
  };
}

export function evaluateAdaptiveEligibility(input: AdaptiveEligibilityInput): AdaptiveEligibility {
  const config = input.config ?? ADAPTIVE_ALGORITHM_CONFIG;
  return eligibilityFor(normalizedEvidence(input), config);
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

export function estimateWeightSlopeKgPerDay(
  readings: ReadonlyArray<{ date: string; weightKg: number }>,
): number {
  if (readings.length < 2) {
    throw new RangeError('Weight slope requires at least two distinct dates');
  }
  const sorted = readings
    .map((reading) => {
      parseLocalISO(reading.date);
      if (!Number.isFinite(reading.weightKg) || reading.weightKg <= 0) {
        throw new RangeError('Slope weights must be finite and positive');
      }
      return { ...reading };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].date === sorted[index - 1].date) {
      throw new RangeError(`Duplicate weight date: ${sorted[index].date}`);
    }
  }

  let meanX = 0;
  let meanY = 0;
  let sumSquaresX = 0;
  let sumProducts = 0;
  sorted.forEach((reading, index) => {
    const count = index + 1;
    const x = calendarDaysBetween(sorted[0].date, reading.date);
    const deltaX = x - meanX;
    const deltaY = reading.weightKg - meanY;
    meanX += deltaX / count;
    meanY += deltaY / count;
    sumSquaresX += deltaX * (x - meanX);
    sumProducts += deltaX * (reading.weightKg - meanY);
    if (![meanX, meanY, sumSquaresX, sumProducts].every(Number.isFinite)) {
      throw new RangeError('Weight slope calculation overflowed');
    }
  });
  if (sumSquaresX === 0) throw new RangeError('Weight slope denominator is zero');
  const slope = sumProducts / sumSquaresX;
  if (!Number.isFinite(slope)) throw new RangeError('Weight slope must be finite');
  return slope;
}

function canonicalConfig(config: AdaptiveAlgorithmConfig): AdaptiveAlgorithmConfig {
  validateConfig(config);
  return {
    algorithmVersion: config.algorithmVersion,
    windowDays: config.windowDays,
    minimumIntakeDays: config.minimumIntakeDays,
    minimumWeightReadings: config.minimumWeightReadings,
    minimumWeightSpanDays: config.minimumWeightSpanDays,
    maximumDaysSinceLastWeight: config.maximumDaysSinceLastWeight,
    kcalPerKg: config.kcalPerKg,
    newEstimateWeight: config.newEstimateWeight,
    maximumTdeeChangeFraction: config.maximumTdeeChangeFraction,
    maximumTdeeChangeKcal: config.maximumTdeeChangeKcal,
    minimumActivityMultiplier: config.minimumActivityMultiplier,
    trendHalfLifeDays: config.trendHalfLifeDays,
    macroCalorieToleranceKcal: config.macroCalorieToleranceKcal,
    suspiciousIntakeMinimumPatternDays: config.suspiciousIntakeMinimumPatternDays,
    suspiciousIntakeMedianFraction: config.suspiciousIntakeMedianFraction,
    intentionalFastTreatment: config.intentionalFastTreatment,
  };
}

function canonicalEvidence(payload: AdaptiveEvidencePayload): AdaptiveEvidencePayload {
  if (!Number.isInteger(payload.algorithmVersion) || payload.algorithmVersion <= 0) {
    inputError('Algorithm version must be a positive integer');
  }
  if (payload.algorithmVersion !== payload.config.algorithmVersion) {
    inputError('Algorithm version must match the configuration version');
  }
  requireValidDate(payload.configuredWindowStart, 'Configured window start');
  requireValidDate(payload.configuredWindowEnd, 'Configured window end');
  requireValidDate(payload.estimationStart, 'Estimation start');
  requireValidDate(payload.estimationEnd, 'Estimation end');
  if (payload.estimationStart < payload.configuredWindowStart
    || payload.estimationEnd > payload.configuredWindowEnd
    || payload.estimationStart > payload.estimationEnd) {
    inputError('Estimation interval must be within the configured window');
  }
  validateProfile(payload.profile, payload.configuredWindowEnd);
  requireFinitePositive(payload.previousTdee, 'Previous TDEE');
  if (!Number.isInteger(payload.previousTargetId) || payload.previousTargetId <= 0) {
    inputError('Previous target ID must be a positive integer');
  }
  return {
    algorithmVersion: payload.algorithmVersion,
    config: canonicalConfig(payload.config),
    configuredWindowStart: payload.configuredWindowStart,
    configuredWindowEnd: payload.configuredWindowEnd,
    estimationStart: payload.estimationStart,
    estimationEnd: payload.estimationEnd,
    dailyCalories: normalizeDailyCalories(
      payload.dailyCalories,
      payload.estimationStart,
      payload.estimationEnd,
    ),
    intakeDayConfirmations: normalizeIntakeDayConfirmations(
      payload.intakeDayConfirmations,
      payload.estimationStart,
      payload.estimationEnd,
    ),
    weights: normalizeWeights(payload.weights, payload.estimationStart, payload.estimationEnd),
    profile: {
      sex: payload.profile.sex,
      heightCm: payload.profile.heightCm,
      birthDate: payload.profile.birthDate,
      goalType: payload.profile.goalType,
      goalRateKgPerWeek: payload.profile.goalRateKgPerWeek,
      proteinPreference: payload.profile.proteinPreference,
    },
    previousTdee: payload.previousTdee,
    previousTargetId: payload.previousTargetId,
  };
}

/** Non-security FNV-1a fingerprint; the prefix allows a future SHA-256 migration. */
export function hashAdaptiveEvidence(payload: AdaptiveEvidencePayload): string {
  const json = JSON.stringify(canonicalEvidence(payload));
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-v2:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function maximumTdeeChange(
  previousTdee: number,
  config: AdaptiveAlgorithmConfig,
): number {
  const relativeLimit = previousTdee * config.maximumTdeeChangeFraction;
  if (!Number.isFinite(relativeLimit)) inputError('Relative TDEE change limit overflowed');
  return config.maximumTdeeChangeKcal === null
    ? relativeLimit
    : Math.min(relativeLimit, config.maximumTdeeChangeKcal);
}

function assertFiniteRecommendation(recommendation: AdaptiveRecommendation): void {
  const numericOutputs = [
    recommendation.algorithmVersion,
    recommendation.alignedIntakeDayCount,
    recommendation.alignedWeightReadingCount,
    recommendation.averageIntakeKcal,
    recommendation.startTrendWeightKg,
    recommendation.endTrendWeightKg,
    recommendation.elapsedDays,
    recommendation.weightSlopeKgPerDay,
    recommendation.dailyEnergyChangeKcal,
    recommendation.estimatedTdee,
    recommendation.rawTdee,
    recommendation.previousTdee,
    recommendation.proposedTdee,
    recommendation.currentBmr,
    recommendation.tdeeFloor,
    recommendation.targetCalories,
    recommendation.targetProteinG,
    recommendation.targetFatG,
    recommendation.targetCarbsG,
  ];
  if (!numericOutputs.every(Number.isFinite)) {
    inputError('Adaptive recommendation contains a non-finite numeric output');
  }
}

export function calculateAdaptiveRecommendation(
  input: AdaptiveRecommendationInput,
): AdaptiveCalculationResult {
  const config = input.config ?? ADAPTIVE_ALGORITHM_CONFIG;
  validateConfig(config);
  requireFinitePositive(input.previousTdee, 'Previous TDEE');
  if (!Number.isInteger(input.previousTargetId) || input.previousTargetId <= 0) {
    inputError('Previous target ID must be a positive integer');
  }
  requireValidDate(input.reviewDate, 'Review date');
  validateProfile(input.profile, input.reviewDate);

  const evidence = normalizedEvidence(input);
  const eligibility = eligibilityFor(evidence, config);
  if (!eligibility.eligible) {
    return { kind: 'ineligible', reasons: eligibility.reasons, eligibility };
  }
  if (evidence.suspiciousIntakeDays.length > 0) {
    return {
      kind: 'holding',
      reason: 'intake_confirmation_required',
      eligibility,
      confirmationDays: evidence.suspiciousIntakeDays,
    };
  }

  const start = evidence.weights[0];
  const end = evidence.weights[evidence.weights.length - 1];
  const elapsedDays = calendarDaysBetween(start.date, end.date);
  const intakeTotal = evidence.alignedDailyCalories.reduce(
    (sum, row) => checkedAdd(sum, row.calories, 'Aligned calorie total'),
    0,
  );
  const averageIntakeKcal = intakeTotal / evidence.alignedDailyCalories.length;
  requireFinite(averageIntakeKcal, 'Average intake');
  const weightSlopeKgPerDay = estimateWeightSlopeKgPerDay(
    evidence.weights.map((row) => ({ date: row.date, weightKg: row.scaleWeightKg })),
  );
  const dailyEnergyChangeKcal = weightSlopeKgPerDay * config.kcalPerKg;
  requireFinite(dailyEnergyChangeKcal, 'Daily energy change');
  const estimatedTdee = averageIntakeKcal - dailyEnergyChangeKcal;
  requireFinite(estimatedTdee, 'Estimated TDEE');
  const updatedTdee = config.newEstimateWeight * estimatedTdee
    + (1 - config.newEstimateWeight) * input.previousTdee;
  requireFinite(updatedTdee, 'Updated TDEE');
  const currentBmr = calcBMR({
    sex: input.profile.sex,
    weight_kg: end.trendWeightKg,
    height_cm: input.profile.heightCm,
    age: ageOnDate(input.profile.birthDate, input.reviewDate),
  });
  requireFinite(currentBmr, 'Current BMR');
  const tdeeFloor = currentBmr * config.minimumActivityMultiplier;
  requireFinite(tdeeFloor, 'TDEE floor');
  const permittedChange = maximumTdeeChange(input.previousTdee, config);
  const lowerTdee = input.previousTdee - permittedChange;
  const upperTdee = input.previousTdee + permittedChange;
  if (![lowerTdee, upperTdee].every(Number.isFinite)) {
    inputError('Permitted TDEE update range overflowed');
  }
  if (tdeeFloor > upperTdee) {
    return {
      kind: 'paused',
      reason: 'tdee_floor_conflict',
      eligibility,
      tdeeFloor,
      permittedUpperTdee: upperTdee,
    };
  }
  const clampedTdee = Math.min(upperTdee, Math.max(lowerTdee, updatedTdee));
  const proposedTdee = Math.max(tdeeFloor, clampedTdee);
  const goalAdjustment = input.profile.goalRateKgPerWeek * config.kcalPerKg / 7;
  requireFinite(goalAdjustment, 'Goal calorie adjustment');
  const unflooredTarget = proposedTdee + goalAdjustment;
  requireFinite(unflooredTarget, 'Unfloored calorie target');
  const requestedTargetCalories = Math.round(Math.max(tdeeFloor, unflooredTarget));
  requireFinite(requestedTargetCalories, 'Requested calorie target');
  const macros = calculateMacrosForCalories({
    targetCalories: requestedTargetCalories,
    goalType: input.profile.goalType,
    proteinPreference: input.profile.proteinPreference,
    weightKg: end.trendWeightKg,
  });
  if (Math.abs(macros.targetCalories - requestedTargetCalories) > config.macroCalorieToleranceKcal) {
    return {
      kind: 'paused',
      reason: 'macro_target_infeasible',
      eligibility,
      requestedTargetCalories,
      allocatedTargetCalories: macros.targetCalories,
    };
  }
  const evidenceHash = hashAdaptiveEvidence({
    algorithmVersion: config.algorithmVersion,
    config,
    configuredWindowStart: evidence.windowStart,
    configuredWindowEnd: evidence.windowEnd,
    estimationStart: evidence.estimationStart!,
    estimationEnd: evidence.estimationEnd!,
    dailyCalories: evidence.alignedDailyCalories,
    intakeDayConfirmations: evidence.alignedIntakeDayConfirmations,
    weights: evidence.weights,
    profile: input.profile,
    previousTdee: input.previousTdee,
    previousTargetId: input.previousTargetId,
  });
  const recommendation: AdaptiveRecommendation = {
    ...macros,
    algorithmVersion: config.algorithmVersion,
    windowStart: evidence.windowStart,
    windowEnd: evidence.windowEnd,
    estimationStart: evidence.estimationStart!,
    estimationEnd: evidence.estimationEnd!,
    eligibility,
    alignedIntakeDayCount: evidence.alignedDailyCalories.length,
    alignedWeightReadingCount: evidence.weights.length,
    averageIntakeKcal,
    startTrendWeightKg: start.trendWeightKg,
    endTrendWeightKg: end.trendWeightKg,
    elapsedDays,
    weightSlopeKgPerDay,
    dailyEnergyChangeKcal,
    estimatedTdee,
    rawTdee: Math.round(estimatedTdee),
    previousTdee: Math.round(input.previousTdee),
    proposedTdee: Math.round(proposedTdee),
    currentBmr,
    tdeeFloor,
    evidenceHash,
  };
  assertFiniteRecommendation(recommendation);
  return { kind: 'recommendation', recommendation };
}
