import type {
  AdaptiveCalculationResult,
  AdaptiveEligibility,
  AdaptiveIntakeConfirmationDay,
  AdaptivePauseReason,
  AdaptiveRecommendation,
} from './adaptiveRecommendations';

export type AdaptiveReviewGate<TTarget> =
  | { kind: 'persist'; recommendation: AdaptiveRecommendation }
  | {
      kind: 'holding';
      reason: 'insufficient_evidence' | 'intake_confirmation_required';
      eligibility: AdaptiveEligibility;
      currentTarget: TTarget;
      confirmationDays: AdaptiveIntakeConfirmationDay[];
    }
  | {
      kind: 'paused';
      reason: AdaptivePauseReason;
      eligibility: AdaptiveEligibility;
    };

export function gateAdaptiveReview<TTarget>(
  calculation: AdaptiveCalculationResult,
  currentTarget: TTarget,
): AdaptiveReviewGate<TTarget> {
  if (calculation.kind === 'recommendation') {
    return { kind: 'persist', recommendation: calculation.recommendation };
  }
  if (calculation.kind === 'holding') {
    return {
      kind: 'holding',
      reason: calculation.reason,
      eligibility: calculation.eligibility,
      currentTarget,
      confirmationDays: calculation.confirmationDays,
    };
  }
  if (calculation.kind === 'ineligible') {
    return {
      kind: 'holding',
      reason: 'insufficient_evidence',
      eligibility: calculation.eligibility,
      currentTarget,
      confirmationDays: [],
    };
  }
  return {
    kind: 'paused',
    reason: calculation.reason,
    eligibility: calculation.eligibility,
  };
}
