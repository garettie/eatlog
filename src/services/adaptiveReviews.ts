import type { SQLiteDatabase } from 'expo-sqlite';

import {
  AdaptiveReview,
  DailyTarget,
  Profile,
  WeightLog,
  getDb,
} from '../db/database';
import {
  AdaptiveEligibility as CalculatedEligibility,
  AdaptiveRecommendation,
  calculateAdaptiveRecommendation,
  evaluateAdaptiveEligibility,
} from '../utils/adaptiveRecommendations';
import { addCalendarDays, calendarDaysBetween, todayISO } from '../utils/calendar';

export interface AdaptiveEligibility {
  intakeDayCount: number;
  requiredIntakeDayCount: 10;
  weightLogCount: number;
  requiredWeightLogCount: 4;
  hasEarlyWeight: boolean;
  hasLateWeight: boolean;
  endpointSpanDays: number;
  requiredEndpointSpanDays: 7;
}

export type AdaptiveReviewState =
  | { kind: 'collecting'; reviewDate: string; eligibility: AdaptiveEligibility }
  | { kind: 'ready'; review: AdaptiveReview }
  | { kind: 'next-review'; nextReviewDate: string; latestDecision: AdaptiveReview };

export type ResolveAdaptiveReviewResult =
  | { status: 'resolved'; target: DailyTarget | null }
  | { status: 'stale'; review: AdaptiveReview };

interface DailyCaloriesRow {
  log_date: string;
  calories: number;
}

interface ReviewEvidence {
  profile: Profile;
  target: DailyTarget;
  dailyCalories: DailyCaloriesRow[];
  weights: WeightLog[];
  eligibility: CalculatedEligibility;
  recommendation: AdaptiveRecommendation | null;
}

function toPublicEligibility(value: CalculatedEligibility): AdaptiveEligibility {
  return {
    intakeDayCount: value.intakeDayCount,
    requiredIntakeDayCount: 10,
    weightLogCount: value.weightLogCount,
    requiredWeightLogCount: 4,
    hasEarlyWeight: value.hasEarlyWeight,
    hasLateWeight: value.hasLateWeight,
    endpointSpanDays: value.endpointSpanDays,
    requiredEndpointSpanDays: 7,
  };
}

async function loadEvidence(db: SQLiteDatabase, reviewDate: string): Promise<ReviewEvidence> {
  const windowStart = addCalendarDays(reviewDate, -13);
  const profile = await db.getFirstAsync<Profile>('SELECT * FROM profile WHERE id = 1');
  const target = await db.getFirstAsync<DailyTarget>(
    'SELECT * FROM daily_targets WHERE effective_date <= ? ORDER BY effective_date DESC, id DESC LIMIT 1',
    [reviewDate],
  );
  if (!profile || !target) throw new Error('Profile and current target are required');
  const evidenceStart = target.effective_date > windowStart ? target.effective_date : windowStart;

  const dailyCalories = await db.getAllAsync<DailyCaloriesRow>(
    `SELECT log_date, SUM(calories) AS calories
     FROM food_logs
     WHERE log_date BETWEEN ? AND ?
     GROUP BY log_date
     HAVING SUM(calories) > 0
     ORDER BY log_date ASC`,
    [evidenceStart, reviewDate],
  );
  const weights = await db.getAllAsync<WeightLog>(
    'SELECT * FROM weight_logs WHERE log_date BETWEEN ? AND ? ORDER BY log_date ASC',
    [evidenceStart, reviewDate],
  );
  const eligibilityInput = {
    reviewDate,
    dailyCalories: dailyCalories.map((row) => ({ date: row.log_date, calories: row.calories })),
    weights: weights.map((row) => ({
      date: row.log_date,
      scaleWeightKg: row.scale_weight_kg,
      trendWeightKg: row.trend_weight_kg,
    })),
  };
  const eligibility = evaluateAdaptiveEligibility(eligibilityInput);
  const recommendation = eligibility.eligible
    ? calculateAdaptiveRecommendation({
        ...eligibilityInput,
        profile: {
          sex: profile.sex,
          heightCm: profile.height_cm,
          birthDate: profile.birth_date,
          goalType: profile.goal_type,
          goalRateKgPerWeek: profile.goal_rate_kg_per_week,
          proteinPreference: profile.protein_preference,
        },
        previousTdee: target.tdee_estimate,
        previousTargetId: target.id,
      })
    : null;
  return { profile, target, dailyCalories, weights, eligibility, recommendation };
}

function reviewValues(reviewDate: string, evidence: ReviewEvidence) {
  const recommendation = evidence.recommendation;
  if (!recommendation) throw new Error('Eligible recommendation required');
  return [
    reviewDate,
    recommendation.windowStart,
    recommendation.windowEnd,
    recommendation.eligibility.intakeDayCount,
    recommendation.eligibility.weightLogCount,
    recommendation.averageIntakeKcal,
    recommendation.startTrendWeightKg,
    recommendation.endTrendWeightKg,
    recommendation.elapsedDays,
    recommendation.rawTdee,
    recommendation.previousTdee,
    recommendation.proposedTdee,
    evidence.target.target_calories,
    evidence.target.target_protein_g,
    evidence.target.target_fat_g,
    evidence.target.target_carbs_g,
    recommendation.targetCalories,
    recommendation.targetProteinG,
    recommendation.targetFatG,
    recommendation.targetCarbsG,
    recommendation.evidenceHash,
  ] as const;
}

async function writePendingReview(
  db: SQLiteDatabase,
  reviewDate: string,
  evidence: ReviewEvidence,
  existingId?: number,
): Promise<AdaptiveReview> {
  const values = reviewValues(reviewDate, evidence);
  if (existingId != null) {
    await db.runAsync(
      `UPDATE adaptive_reviews SET
         review_date = ?, window_start = ?, window_end = ?, intake_day_count = ?, weight_log_count = ?,
         average_intake_kcal = ?, start_trend_weight_kg = ?, end_trend_weight_kg = ?, elapsed_days = ?,
         raw_tdee = ?, previous_tdee = ?, proposed_tdee = ?, previous_target_calories = ?,
         previous_target_protein_g = ?, previous_target_fat_g = ?, previous_target_carbs_g = ?,
         proposed_target_calories = ?, proposed_target_protein_g = ?, proposed_target_fat_g = ?,
         proposed_target_carbs_g = ?, evidence_hash = ?, status = 'pending', resulting_target_id = NULL,
         resolved_at = NULL
       WHERE id = ? AND status IN ('pending', 'superseded')`,
      [...values, existingId],
    );
  } else {
    await db.runAsync(
      `INSERT INTO adaptive_reviews (
         review_date, window_start, window_end, intake_day_count, weight_log_count, average_intake_kcal,
         start_trend_weight_kg, end_trend_weight_kg, elapsed_days, raw_tdee, previous_tdee, proposed_tdee,
         previous_target_calories, previous_target_protein_g, previous_target_fat_g, previous_target_carbs_g,
         proposed_target_calories, proposed_target_protein_g, proposed_target_fat_g, proposed_target_carbs_g,
         evidence_hash, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [...values],
    );
  }
  const review = await db.getFirstAsync<AdaptiveReview>(
    'SELECT * FROM adaptive_reviews WHERE review_date = ?',
    [reviewDate],
  );
  if (!review) throw new Error('Pending adaptive review missing');
  return review;
}

async function refreshPending(
  db: SQLiteDatabase,
  pending: AdaptiveReview,
): Promise<AdaptiveReviewState> {
  const evidence = await loadEvidence(db, pending.review_date);
  if (!evidence.eligibility.eligible) {
    await db.runAsync(
      "UPDATE adaptive_reviews SET status = 'superseded', resolved_at = datetime('now', 'localtime') WHERE id = ? AND status = 'pending'",
      [pending.id],
    );
    return {
      kind: 'collecting',
      reviewDate: pending.review_date,
      eligibility: toPublicEligibility(evidence.eligibility),
    };
  }
  if (evidence.recommendation!.evidenceHash !== pending.evidence_hash) {
    const refreshed = await writePendingReview(db, pending.review_date, evidence, pending.id);
    if (refreshed.status === 'accepted' || refreshed.status === 'kept') {
      return { kind: 'next-review', nextReviewDate: addCalendarDays(refreshed.review_date, 7), latestDecision: refreshed };
    }
    if (refreshed.status === 'superseded') {
      return {
        kind: 'collecting',
        reviewDate: refreshed.review_date,
        eligibility: toPublicEligibility(evidence.eligibility),
      };
    }
    return { kind: 'ready', review: refreshed };
  }
  return { kind: 'ready', review: pending };
}

export async function getAdaptiveReviewState(reviewDate: string): Promise<AdaptiveReviewState> {
  const db = await getDb();
  const pending = await db.getFirstAsync<AdaptiveReview>(
    "SELECT * FROM adaptive_reviews WHERE status = 'pending' ORDER BY review_date DESC LIMIT 1",
  );
  if (pending) return refreshPending(db, pending);

  const activeTarget = await db.getFirstAsync<DailyTarget>(
    'SELECT * FROM daily_targets WHERE effective_date <= ? ORDER BY effective_date DESC, id DESC LIMIT 1',
    [reviewDate],
  );
  const latestDecision = activeTarget == null
    ? null
    : await db.getFirstAsync<AdaptiveReview>(
        `SELECT * FROM adaptive_reviews
         WHERE status IN ('accepted', 'kept')
           AND (resulting_target_id = ? OR (review_date >= ? AND resolved_at >= ?))
         ORDER BY review_date DESC LIMIT 1`,
        [activeTarget.id, activeTarget.effective_date, activeTarget.created_at],
      );
  if (latestDecision) {
    const nextReviewDate = addCalendarDays(latestDecision.review_date, 7);
    if (calendarDaysBetween(latestDecision.review_date, reviewDate) < 7) {
      return { kind: 'next-review', nextReviewDate, latestDecision };
    }
  }

  const evidence = await loadEvidence(db, reviewDate);
  if (!evidence.eligibility.eligible) {
    return {
      kind: 'collecting',
      reviewDate,
      eligibility: toPublicEligibility(evidence.eligibility),
    };
  }

  const existing = await db.getFirstAsync<AdaptiveReview>(
    'SELECT * FROM adaptive_reviews WHERE review_date = ?',
    [reviewDate],
  );
  if (existing && existing.status !== 'superseded') {
    return existing.status === 'pending'
      ? refreshPending(db, existing)
      : { kind: 'next-review', nextReviewDate: addCalendarDays(existing.review_date, 7), latestDecision: existing };
  }
  try {
    return { kind: 'ready', review: await writePendingReview(db, reviewDate, evidence, existing?.id) };
  } catch (error) {
    const winner = await db.getFirstAsync<AdaptiveReview>(
      'SELECT * FROM adaptive_reviews WHERE review_date = ?',
      [reviewDate],
    );
    if (winner?.status === 'pending') return { kind: 'ready', review: winner };
    if (winner?.status === 'accepted' || winner?.status === 'kept') {
      return { kind: 'next-review', nextReviewDate: addCalendarDays(winner.review_date, 7), latestDecision: winner };
    }
    throw error;
  }
}

async function resolveReview(
  reviewId: number,
  resolution: 'accepted' | 'kept',
): Promise<ResolveAdaptiveReviewResult> {
  const db = await getDb();
  let result: ResolveAdaptiveReviewResult | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const review = await txn.getFirstAsync<AdaptiveReview>(
      'SELECT * FROM adaptive_reviews WHERE id = ?',
      [reviewId],
    );
    if (!review) throw new Error('Adaptive review not found');
    if (review.status === 'accepted') {
      const target = review.resulting_target_id == null
        ? null
        : await txn.getFirstAsync<DailyTarget>('SELECT * FROM daily_targets WHERE id = ?', [review.resulting_target_id]);
      result = { status: 'resolved', target };
      return;
    }
    if (review.status === 'kept') {
      result = { status: 'resolved', target: null };
      return;
    }
    if (review.status === 'superseded') {
      result = { status: 'stale', review };
      return;
    }
    const evidence = await loadEvidence(txn, review.review_date);
    if (!evidence.eligibility.eligible || evidence.recommendation!.evidenceHash !== review.evidence_hash) {
      const refreshed = evidence.eligibility.eligible
        ? await writePendingReview(txn, review.review_date, evidence, review.id)
        : review;
      if (!evidence.eligibility.eligible) {
        await txn.runAsync(
          "UPDATE adaptive_reviews SET status = 'superseded', resolved_at = datetime('now', 'localtime') WHERE id = ?",
          [review.id],
        );
        refreshed.status = 'superseded';
      }
      result = { status: 'stale', review: refreshed };
      return;
    }

    const claimed = await txn.runAsync(
      `UPDATE adaptive_reviews SET status = ?, resolved_at = datetime('now', 'localtime')
       WHERE id = ? AND status = 'pending'`,
      [resolution, review.id],
    );
    if (claimed.changes === 0) {
      const current = await txn.getFirstAsync<AdaptiveReview>('SELECT * FROM adaptive_reviews WHERE id = ?', [review.id]);
      if (!current) throw new Error('Adaptive review not found');
      const target = current.resulting_target_id == null
        ? null
        : await txn.getFirstAsync<DailyTarget>('SELECT * FROM daily_targets WHERE id = ?', [current.resulting_target_id]);
      result = current.status === 'superseded'
        ? { status: 'stale', review: current }
        : { status: 'resolved', target };
      return;
    }

    let target: DailyTarget | null = null;
    if (resolution === 'accepted') {
      const inserted = await txn.runAsync(
        `INSERT INTO daily_targets
          (effective_date, tdee_estimate, target_calories, target_protein_g, target_fat_g, target_carbs_g, calculation_method)
         VALUES (?, ?, ?, ?, ?, ?, 'adaptive')`,
        [
          todayISO(),
          review.proposed_tdee,
          review.proposed_target_calories,
          review.proposed_target_protein_g,
          review.proposed_target_fat_g,
          review.proposed_target_carbs_g,
        ],
      );
      await txn.runAsync('UPDATE adaptive_reviews SET resulting_target_id = ? WHERE id = ?', [inserted.lastInsertRowId, review.id]);
      target = await txn.getFirstAsync<DailyTarget>('SELECT * FROM daily_targets WHERE id = ?', [inserted.lastInsertRowId]);
    }
    result = { status: 'resolved', target };
  });
  if (!result) throw new Error('Adaptive resolution transaction failed');
  return result;
}

export function acceptAdaptiveReview(reviewId: number): Promise<ResolveAdaptiveReviewResult> {
  return resolveReview(reviewId, 'accepted');
}

export function keepAdaptiveReview(reviewId: number): Promise<ResolveAdaptiveReviewResult> {
  return resolveReview(reviewId, 'kept');
}
