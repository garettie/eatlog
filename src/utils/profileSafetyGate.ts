import {
  profileSafetyIssues,
  targetSafetyIssues,
  type SafetyProfileInput,
  type TargetSafetyInput,
} from './nutritionSafety';

export type ProfileSafetyRoute = 'Tabs' | 'ProfileCorrection';

export function resolveProfileSafetyRoute(params: {
  profile: SafetyProfileInput;
  currentWeightKg: number | null;
  target: TargetSafetyInput | null;
  referenceDate: string;
}): ProfileSafetyRoute {
  const profileIssues = profileSafetyIssues(params.profile, {
    currentWeightKg: params.currentWeightKg,
    requireCurrentWeight: true,
    checkGoalDirection: false,
    referenceDate: params.referenceDate,
  });
  const targetIssues = params.target
    ? targetSafetyIssues(params.target, {
      goalType: params.profile.goal_type,
      referenceWeightKg: params.currentWeightKg,
    })
    : ['An active nutrition target is required.'];
  return profileIssues.length === 0 && targetIssues.length === 0
    ? 'Tabs'
    : 'ProfileCorrection';
}
