import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ageOnDate,
  birthDateBounds,
  NUTRITION_SAFETY_POLICY,
  profileSafetyIssues,
  targetSafetyIssues,
  validateBirthDate,
  validateHeightCm,
  validateGoalRate,
  validateWeightKg,
} from './nutritionSafety';
import { formatLocalISO, parseLocalISO } from './calendar';

const referenceDate = '2026-08-10';

test('adult birthday boundary is exact and local-calendar based', () => {
  assert.equal(ageOnDate('2008-08-11', referenceDate), 17);
  assert.equal(ageOnDate('2008-08-10', referenceDate), 18);
  assert.equal(ageOnDate('2008-08-09', referenceDate), 18);
  assert.notEqual(validateBirthDate('2008-08-11', referenceDate), null);
  assert.equal(validateBirthDate('2008-08-10', referenceDate), null);
  assert.equal(validateBirthDate('1948-08-10', referenceDate), null);
  assert.notEqual(validateBirthDate('1947-08-10', referenceDate), null);
});

test('leap-day birthdays use March 1 in non-leap years', () => {
  assert.equal(ageOnDate('2008-02-29', '2026-02-28'), 17);
  assert.equal(ageOnDate('2008-02-29', '2026-03-01'), 18);
  assert.notEqual(validateBirthDate('2008-02-29', '2026-02-28'), null);
  assert.equal(validateBirthDate('2008-02-29', '2026-03-01'), null);
});

test('local date parsing preserves birthdays in positive and negative UTC offsets', () => {
  const previousTimezone = process.env.TZ;
  for (const timezone of ['America/Los_Angeles', 'Pacific/Kiritimati']) {
    process.env.TZ = timezone;
    const date = parseLocalISO('2008-08-10');
    assert.equal(formatLocalISO(date), '2008-08-10', timezone);
    assert.equal(ageOnDate('2008-08-10', '2026-08-10'), 18, timezone);
  }
  if (previousTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimezone;
});

test('date selector bounds cover only ages 18 through 78', () => {
  const bounds = birthDateBounds(parseLocalISO(referenceDate));
  assert.equal(formatLocalISO(bounds.latest), '2008-08-10');
  assert.equal(formatLocalISO(bounds.earliest), '1947-08-11');
});

test('height and weight accept exact policy boundaries and reject adjacent values', () => {
  assert.equal(validateHeightCm(NUTRITION_SAFETY_POLICY.minimumHeightCm), null);
  assert.equal(validateHeightCm(NUTRITION_SAFETY_POLICY.maximumHeightCm), null);
  assert.notEqual(validateHeightCm(NUTRITION_SAFETY_POLICY.minimumHeightCm - 0.1), null);
  assert.notEqual(validateHeightCm(NUTRITION_SAFETY_POLICY.maximumHeightCm + 0.1), null);
  assert.equal(validateWeightKg(NUTRITION_SAFETY_POLICY.minimumWeightKg), null);
  assert.equal(validateWeightKg(NUTRITION_SAFETY_POLICY.maximumWeightKg), null);
  assert.notEqual(validateWeightKg(NUTRITION_SAFETY_POLICY.minimumWeightKg - 0.1), null);
  assert.notEqual(validateWeightKg(NUTRITION_SAFETY_POLICY.maximumWeightKg + 0.1), null);
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1e9]) {
    assert.notEqual(validateWeightKg(value), null);
  }
});

test('goal-rate policy uses current body weight and direction', () => {
  assert.equal(validateGoalRate(-0.8, 'cut', 80), null);
  assert.notEqual(validateGoalRate(-0.85, 'cut', 80), null);
  assert.equal(validateGoalRate(0.4, 'bulk', 80), null);
  assert.notEqual(validateGoalRate(0.45, 'bulk', 80), null);
  assert.equal(validateGoalRate(0, 'maintain', 80), null);
  assert.notEqual(validateGoalRate(0.05, 'maintain', 80), null);
});

function profile(overrides: Partial<Parameters<typeof profileSafetyIssues>[0]> = {}) {
  return {
    display_name: 'Test',
    sex: 'male' as const,
    height_cm: 180,
    birth_date: '1990-01-01',
    activity_level: 'moderate' as const,
    goal_type: 'maintain' as const,
    goal_rate_kg_per_week: 0,
    protein_preference: 'moderate' as const,
    weight_unit: 'kg' as const,
    target_weight_kg: 80,
    ...overrides,
  };
}

test('profile validator enforces cut, bulk, and maintenance direction rules', () => {
  assert.deepEqual(profileSafetyIssues(profile(), { currentWeightKg: 80, requireCurrentWeight: true }), []);
  assert.ok(profileSafetyIssues(profile({ goal_type: 'cut', goal_rate_kg_per_week: -0.5, target_weight_kg: 80 }), { currentWeightKg: 80, requireCurrentWeight: true }).some((issue) => /cut target weight/i.test(issue)));
  assert.ok(profileSafetyIssues(profile({ goal_type: 'bulk', goal_rate_kg_per_week: 0.25, target_weight_kg: 80 }), { currentWeightKg: 80, requireCurrentWeight: true }).some((issue) => /bulk target weight/i.test(issue)));
  assert.ok(profileSafetyIssues(profile({ goal_type: 'cut', goal_rate_kg_per_week: 0.05, target_weight_kg: 70 }), { currentWeightKg: 80, requireCurrentWeight: true }).length > 0);
  assert.deepEqual(profileSafetyIssues(profile({ goal_type: 'cut', goal_rate_kg_per_week: -0.5, target_weight_kg: 80 }), {
    currentWeightKg: 80,
    requireCurrentWeight: true,
    checkGoalDirection: false,
  }), []);
});

test('target validator accepts exact calorie boundaries and rejects unsafe values', () => {
  const minimum = {
    tdee_estimate: 1000,
    target_calories: 1000,
    target_protein_g: 64,
    target_fat_g: 24.9,
    target_carbs_g: 130,
  };
  const maximum = {
    tdee_estimate: 6000,
    target_calories: 6000,
    target_protein_g: 64,
    target_fat_g: 166.7,
    target_carbs_g: 1060.9,
  };
  assert.deepEqual(targetSafetyIssues(minimum, { goalType: 'maintain', referenceWeightKg: 80 }), []);
  assert.deepEqual(targetSafetyIssues(maximum, { goalType: 'maintain', referenceWeightKg: 80 }), []);
  for (const target of [
    { ...minimum, target_calories: 999 },
    { ...maximum, target_calories: 6001 },
    { ...minimum, target_protein_g: -1 },
    { ...minimum, target_fat_g: 0 },
    { ...minimum, target_carbs_g: 129 },
    { ...minimum, target_calories: Number.NaN },
    { ...minimum, target_calories: Number.POSITIVE_INFINITY },
  ]) {
    assert.ok(targetSafetyIssues(target, { goalType: 'maintain', referenceWeightKg: 80 }).length > 0);
  }
});
