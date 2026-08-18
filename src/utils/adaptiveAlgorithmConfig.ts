import { MANUAL_TARGET_CALORIE_TOLERANCE } from './planValidation';

export interface AdaptiveAlgorithmConfig {
  algorithmVersion: number;
  windowDays: number;
  minimumIntakeDays: number;
  minimumWeightReadings: number;
  minimumWeightSpanDays: number;
  maximumDaysSinceLastWeight: number;
  kcalPerKg: number;
  newEstimateWeight: number;
  maximumTdeeChangeFraction: number;
  maximumTdeeChangeKcal: number | null;
  maximumTargetChangeKcal: number;
  minimumActivityMultiplier: number;
  trendHalfLifeDays: number;
  macroCalorieToleranceKcal: number;
  suspiciousIntakeMinimumPatternDays: number;
  suspiciousIntakeMedianFraction: number;
  intentionalFastTreatment: 'include_logged_intake';
}

export const ADAPTIVE_ALGORITHM_CONFIG: Readonly<AdaptiveAlgorithmConfig> = Object.freeze({
  algorithmVersion: 7,
  windowDays: 28,
  minimumIntakeDays: 10,
  minimumWeightReadings: 4,
  minimumWeightSpanDays: 14,
  maximumDaysSinceLastWeight: 7,
  kcalPerKg: 7700,
  newEstimateWeight: 0.25,
  maximumTdeeChangeFraction: 0.05,
  maximumTdeeChangeKcal: 100,
  maximumTargetChangeKcal: 100,
  minimumActivityMultiplier: 1.2,
  trendHalfLifeDays: 7,
  macroCalorieToleranceKcal: MANUAL_TARGET_CALORIE_TOLERANCE,
  suspiciousIntakeMinimumPatternDays: 7,
  suspiciousIntakeMedianFraction: 0.5,
  intentionalFastTreatment: 'include_logged_intake',
});
