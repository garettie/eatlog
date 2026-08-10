import type {
  ActivityLevel,
  CalculationMethod,
  GoalType,
  ProteinPreference,
  Sex,
  WeightUnit,
} from '../db/database';
import { formatLocalISO, parseLocalISO } from './calendar';

export const NUTRITION_SAFETY_POLICY = Object.freeze({
  minimumAge: 18,
  maximumAge: 78,
  minimumHeightCm: 100,
  maximumHeightCm: 250,
  minimumWeightKg: 30,
  maximumWeightKg: 300,
  minimumCalories: 1000,
  maximumCalories: 6000,
  minimumProteinGPerKg: 0.8,
  minimumFatEnergyFraction: 0.2,
  minimumCarbsG: 130,
  macroCalorieToleranceKcal: 10,
  goalRateStepKgPerWeek: 0.05,
  maximumCutRateFractionPerWeek: 0.01,
  maximumCutRateKgPerWeek: 0.9,
  maximumBulkRateFractionPerWeek: 0.005,
  maximumBulkRateKgPerWeek: 0.5,
} as const);

export const WELLNESS_DISCLAIMER =
  'Eatlog estimates calorie and macro targets for adults\' general wellness. It is not medical advice. If you are pregnant or breastfeeding, have a medical condition or eating-disorder history, or need specialized nutrition, consult a qualified health professional before using targets.';

export const ESTIMATE_DISCLAIMER =
  'These targets are estimates based on your information and logs. They do not guarantee weight change or accuracy.';

export const MEAL_ESTIMATE_DISCLAIMER =
  'Photo and description nutrition is estimated. Review portions and nutrients before logging.';

export class NutritionSafetyError extends RangeError {
  override name = 'NutritionSafetyError';
}

export interface SafetyProfileInput {
  display_name?: string;
  sex: Sex;
  height_cm: number;
  birth_date: string;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  goal_rate_kg_per_week: number;
  protein_preference: ProteinPreference;
  weight_unit: WeightUnit;
  target_weight_kg: number | null;
}

export interface ProfileSafetyContext {
  currentWeightKg?: number | null;
  referenceDate?: string | Date;
  requireCurrentWeight?: boolean;
  checkGoalDirection?: boolean;
}

export interface TargetSafetyInput {
  effective_date?: string;
  tdee_estimate?: number;
  target_calories: number;
  target_protein_g: number;
  target_fat_g: number;
  target_carbs_g: number;
  calculation_method?: CalculationMethod;
}

export interface TargetSafetyContext {
  goalType?: GoalType;
  referenceWeightKg?: number | null;
}

const VALID_SEXES: readonly Sex[] = ['male', 'female'];
const VALID_ACTIVITY_LEVELS: readonly ActivityLevel[] = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
];
const VALID_GOAL_TYPES: readonly GoalType[] = ['cut', 'maintain', 'bulk'];
const VALID_PROTEIN_PREFERENCES: readonly ProteinPreference[] = [
  'low',
  'moderate',
  'high',
  'extra_high',
];
const VALID_WEIGHT_UNITS: readonly WeightUnit[] = ['kg', 'lb'];
const VALID_CALCULATION_METHODS: readonly CalculationMethod[] = [
  'initial_estimate',
  'profile_recalculation',
  'manual',
  'adaptive',
];

function localDateFrom(value: string | Date): Date {
  if (typeof value === 'string') return parseLocalISO(value);
  if (!Number.isFinite(value.getTime())) throw new RangeError('Reference date is invalid');
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
  return date;
}

function roundRate(value: number): number {
  return Number(value.toFixed(2));
}

function roundDownToStep(value: number): number {
  const step = NUTRITION_SAFETY_POLICY.goalRateStepKgPerWeek;
  return roundRate(Math.floor((value + Number.EPSILON) / step) * step);
}

function subtractCalendarYears(date: Date, years: number): Date {
  const targetYear = date.getFullYear() - years;
  const lastDay = new Date(0);
  lastDay.setHours(0, 0, 0, 0);
  lastDay.setFullYear(targetYear, date.getMonth() + 1, 0);
  const result = new Date(0);
  result.setHours(0, 0, 0, 0);
  result.setFullYear(targetYear, date.getMonth(), Math.min(date.getDate(), lastDay.getDate()));
  return result;
}

export function ageOnDate(birthDate: string, referenceDate: string | Date = new Date()): number {
  const dob = parseLocalISO(birthDate);
  const reference = localDateFrom(referenceDate);
  let age = reference.getFullYear() - dob.getFullYear();
  const monthDiff = reference.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < dob.getDate())) age -= 1;
  return age;
}

export function ageFromLocalBirthDate(birthDate: string): number {
  return ageOnDate(birthDate);
}

export function birthDateBounds(referenceDate: Date = new Date()): { earliest: Date; latest: Date } {
  const reference = localDateFrom(referenceDate);
  const latest = subtractCalendarYears(reference, NUTRITION_SAFETY_POLICY.minimumAge);
  const earliest = subtractCalendarYears(reference, NUTRITION_SAFETY_POLICY.maximumAge + 1);
  earliest.setDate(earliest.getDate() + 1);
  return { earliest, latest };
}

export function goalRateBounds(
  goal: GoalType,
  currentWeightKg?: number | null,
): { min: number; max: number; defaultRate: number } {
  if (goal === 'maintain') return { min: 0, max: 0, defaultRate: 0 };

  const absoluteMaximum = goal === 'cut'
    ? NUTRITION_SAFETY_POLICY.maximumCutRateKgPerWeek
    : NUTRITION_SAFETY_POLICY.maximumBulkRateKgPerWeek;
  const relativeMaximum = Number.isFinite(currentWeightKg)
    ? currentWeightKg! * (goal === 'cut'
      ? NUTRITION_SAFETY_POLICY.maximumCutRateFractionPerWeek
      : NUTRITION_SAFETY_POLICY.maximumBulkRateFractionPerWeek)
    : absoluteMaximum;
  const maximum = Math.max(
    NUTRITION_SAFETY_POLICY.goalRateStepKgPerWeek,
    roundDownToStep(Math.min(absoluteMaximum, relativeMaximum)),
  );
  const defaultMagnitude = Math.min(
    goal === 'cut' ? 0.5 : 0.25,
    maximum,
  );
  return goal === 'cut'
    ? { min: -maximum, max: -NUTRITION_SAFETY_POLICY.goalRateStepKgPerWeek, defaultRate: -defaultMagnitude }
    : { min: NUTRITION_SAFETY_POLICY.goalRateStepKgPerWeek, max: maximum, defaultRate: defaultMagnitude };
}

function rateMatchesStep(rate: number): boolean {
  const step = NUTRITION_SAFETY_POLICY.goalRateStepKgPerWeek;
  return Math.abs(rate / step - Math.round(rate / step)) < 1e-9;
}

function enumIssue(value: unknown, label: string, values: readonly string[]): string | null {
  return values.includes(value as string) ? null : `${label} is invalid.`;
}

export function validateBirthDate(
  birthDate: string,
  referenceDate: string | Date = new Date(),
): string | null {
  try {
    const reference = localDateFrom(referenceDate);
    const referenceISO = formatLocalISO(reference);
    const birthISO = formatLocalISO(parseLocalISO(birthDate));
    if (birthISO > referenceISO) return 'Birth date cannot be in the future.';
    const age = ageOnDate(birthDate, reference);
    if (age < NUTRITION_SAFETY_POLICY.minimumAge || age > NUTRITION_SAFETY_POLICY.maximumAge) {
      return `Targets are available for adults ages ${NUTRITION_SAFETY_POLICY.minimumAge} through ${NUTRITION_SAFETY_POLICY.maximumAge}.`;
    }
    return null;
  } catch {
    return 'Enter a valid birth date (YYYY-MM-DD).';
  }
}

export function validateHeightCm(heightCm: number): string | null {
  if (!Number.isFinite(heightCm)
    || heightCm < NUTRITION_SAFETY_POLICY.minimumHeightCm
    || heightCm > NUTRITION_SAFETY_POLICY.maximumHeightCm) {
    return `Height must be between ${NUTRITION_SAFETY_POLICY.minimumHeightCm} and ${NUTRITION_SAFETY_POLICY.maximumHeightCm} cm.`;
  }
  return null;
}

export function validateWeightKg(weightKg: number, label = 'Weight'): string | null {
  if (!Number.isFinite(weightKg)
    || weightKg < NUTRITION_SAFETY_POLICY.minimumWeightKg
    || weightKg > NUTRITION_SAFETY_POLICY.maximumWeightKg) {
    return `${label} must be between ${NUTRITION_SAFETY_POLICY.minimumWeightKg} and ${NUTRITION_SAFETY_POLICY.maximumWeightKg} kg.`;
  }
  return null;
}

export function validateGoalRate(
  rateKgPerWeek: number,
  goal: GoalType,
  currentWeightKg?: number | null,
): string | null {
  if (!Number.isFinite(rateKgPerWeek)) return 'Goal rate must be finite.';
  const range = goalRateBounds(goal, currentWeightKg);
  if (rateKgPerWeek < range.min || rateKgPerWeek > range.max || !rateMatchesStep(rateKgPerWeek)) {
    const low = Math.min(Math.abs(range.min), Math.abs(range.max));
    const high = Math.max(Math.abs(range.min), Math.abs(range.max));
    return `Goal rate must be between ${low.toFixed(2)} and ${high.toFixed(2)} kg/week for this weight.`;
  }
  return null;
}

export function profileSafetyIssues(
  profile: SafetyProfileInput,
  context: ProfileSafetyContext = {},
): string[] {
  const issues: string[] = [];
  const enumChecks: Array<[unknown, string, readonly string[]]> = [
    [profile.sex, 'Sex', VALID_SEXES],
    [profile.activity_level, 'Activity level', VALID_ACTIVITY_LEVELS],
    [profile.goal_type, 'Goal type', VALID_GOAL_TYPES],
    [profile.protein_preference, 'Protein preference', VALID_PROTEIN_PREFERENCES],
    [profile.weight_unit, 'Weight unit', VALID_WEIGHT_UNITS],
  ];
  for (const [value, label, values] of enumChecks) {
    const issue = enumIssue(value, label, values);
    if (issue) issues.push(issue);
  }

  const birthIssue = validateBirthDate(profile.birth_date, context.referenceDate);
  if (birthIssue) issues.push(birthIssue);
  const heightIssue = validateHeightCm(profile.height_cm);
  if (heightIssue) issues.push(heightIssue);

  const currentWeight = context.currentWeightKg;
  if (context.requireCurrentWeight && validateWeightKg(currentWeight ?? Number.NaN, 'Current weight')) {
    issues.push(validateWeightKg(currentWeight ?? Number.NaN, 'Current weight')!);
  } else if (currentWeight != null) {
    const currentWeightIssue = validateWeightKg(currentWeight, 'Current weight');
    if (currentWeightIssue) issues.push(currentWeightIssue);
  }

  const targetWeightIssue = validateWeightKg(profile.target_weight_kg ?? Number.NaN, 'Target weight');
  if (targetWeightIssue) issues.push(targetWeightIssue);

  const rateIssue = validateGoalRate(profile.goal_rate_kg_per_week, profile.goal_type, currentWeight);
  if (rateIssue) issues.push(rateIssue);

  if (context.checkGoalDirection !== false && currentWeight != null && profile.target_weight_kg != null) {
    if (profile.goal_type === 'cut' && profile.target_weight_kg >= currentWeight) {
      issues.push('A cut target weight must be below current weight.');
    }
    if (profile.goal_type === 'bulk' && profile.target_weight_kg <= currentWeight) {
      issues.push('A bulk target weight must be above current weight.');
    }
  }

  return [...new Set(issues)];
}

export function validateProfile(
  profile: SafetyProfileInput,
  context: ProfileSafetyContext = {},
): string | null {
  return profileSafetyIssues(profile, context)[0] ?? null;
}

export function assertProfileSafe(
  profile: SafetyProfileInput,
  context: ProfileSafetyContext = {},
): void {
  const issue = validateProfile(profile, context);
  if (issue) throw new NutritionSafetyError(issue);
}

function macroCalories(target: TargetSafetyInput): number {
  return target.target_protein_g * 4 + target.target_fat_g * 9 + target.target_carbs_g * 4;
}

export function targetSafetyIssues(
  target: TargetSafetyInput,
  context: TargetSafetyContext = {},
): string[] {
  const issues: string[] = [];
  if (target.effective_date != null) {
    try {
      parseLocalISO(target.effective_date);
    } catch {
      issues.push('Target effective date must be a valid local date.');
    }
  }
  if (target.calculation_method != null && !VALID_CALCULATION_METHODS.includes(target.calculation_method)) {
    issues.push('Target calculation method is invalid.');
  }

  if (target.tdee_estimate != null
    && (!Number.isFinite(target.tdee_estimate) || target.tdee_estimate <= 0)) {
    issues.push('TDEE estimate must be finite and positive.');
  }
  const values = [target.target_calories, target.target_protein_g, target.target_fat_g, target.target_carbs_g];
  if (!values.every((value) => Number.isFinite(value) && value >= 0)) {
    issues.push('Enter finite, non-negative calories and macro values.');
    return [...new Set(issues)];
  }
  if (!Number.isInteger(target.target_calories)
    || target.target_calories < NUTRITION_SAFETY_POLICY.minimumCalories
    || target.target_calories > NUTRITION_SAFETY_POLICY.maximumCalories) {
    issues.push(`Calories must be whole kcal between ${NUTRITION_SAFETY_POLICY.minimumCalories.toLocaleString()} and ${NUTRITION_SAFETY_POLICY.maximumCalories.toLocaleString()}.`);
  }

  if (context.referenceWeightKg != null) {
    const weightIssue = validateWeightKg(context.referenceWeightKg, 'Current weight');
    if (weightIssue) issues.push(weightIssue);
    else if (target.target_protein_g < context.referenceWeightKg * NUTRITION_SAFETY_POLICY.minimumProteinGPerKg) {
      issues.push(`Protein must be at least ${(context.referenceWeightKg * NUTRITION_SAFETY_POLICY.minimumProteinGPerKg).toFixed(1)} g.`);
    }
  }
  if (target.target_fat_g < target.target_calories * NUTRITION_SAFETY_POLICY.minimumFatEnergyFraction / 9) {
    issues.push('Fat must provide at least 20% of target energy.');
  }
  if (target.target_carbs_g < NUTRITION_SAFETY_POLICY.minimumCarbsG) {
    issues.push(`Carbohydrates must be at least ${NUTRITION_SAFETY_POLICY.minimumCarbsG} g.`);
  }
  if (Math.abs(macroCalories(target) - target.target_calories) > NUTRITION_SAFETY_POLICY.macroCalorieToleranceKcal) {
    issues.push(`Macro calories must be within ${NUTRITION_SAFETY_POLICY.macroCalorieToleranceKcal} kcal of the calorie target.`);
  }

  if (context.goalType && target.tdee_estimate != null && Number.isFinite(target.tdee_estimate)) {
    if (context.goalType === 'cut' && target.target_calories >= target.tdee_estimate) {
      issues.push('A cut target must be below TDEE.');
    }
    if (context.goalType === 'bulk' && target.target_calories <= target.tdee_estimate) {
      issues.push('A bulk target must be above TDEE.');
    }
    if (context.goalType === 'maintain' && target.target_calories !== Math.round(target.tdee_estimate)) {
      issues.push('A maintenance target must match rounded TDEE.');
    }
  }

  return [...new Set(issues)];
}

export function validateTarget(
  target: TargetSafetyInput,
  context: TargetSafetyContext = {},
): string | null {
  return targetSafetyIssues(target, context)[0] ?? null;
}

export function assertTargetSafe(
  target: TargetSafetyInput,
  context: TargetSafetyContext = {},
): void {
  const issue = validateTarget(target, context);
  if (issue) throw new NutritionSafetyError(issue);
}

export function validateMacroTargets(
  target: Omit<TargetSafetyInput, 'effective_date' | 'calculation_method' | 'tdee_estimate'>,
  context: TargetSafetyContext & { tdeeEstimate?: number } = {},
): string | null {
  return validateTarget(
    {
      ...target,
      ...(context.tdeeEstimate == null ? {} : { tdee_estimate: context.tdeeEstimate }),
    },
    context,
  );
}
