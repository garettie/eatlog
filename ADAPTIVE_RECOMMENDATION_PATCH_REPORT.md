# Adaptive Recommendation Robustness Patch Report

## 1. Baseline results

Original robustness-pass baseline on 2026-08-06:

- `npm test`: passed — 59 tests, 59 passed, 0 failed.
- `npm run typecheck`: passed — `tsc --noEmit` completed successfully.

Before the sparse-user and intake-confirmation continuation, the expanded suite
also passed with 89 tests. No lint or formatting script is defined in
`package.json`.

The worktree already contained unrelated changes to `AGENTS.md`, `package.json`,
and `package-lock.json`. This patch preserves those changes.

## 2. Files changed

- `src/db/database.ts`
- `src/screens/AnalyticsScreen.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/services/adaptiveReviews.ts`
- `src/utils/adaptiveAlgorithmConfig.ts` (new)
- `src/utils/adaptiveRecommendations.ts`
- `src/utils/adaptiveRecommendations.test.ts`
- `src/utils/adaptiveReviewGate.ts` (new)
- `src/utils/weightTrend.ts`
- `src/utils/weightTrend.test.ts`
- `ADAPTIVE_RECOMMENDATION_PATCH_REPORT.md` (new)

Database schema version 7 adds persisted adaptive intake-day confirmations.

## 3. Exact behavior changes

### Versioned configuration

`ADAPTIVE_ALGORITHM_CONFIG` is algorithm version 4. It centralizes the evidence
window, eligibility, trend half-life, energy conversion, estimate blending,
TDEE limits, BMR floor, macro tolerance, suspicious-intake detection, and
intentional-fast treatment.

The sparse-weight defaults are:

- 28 inclusive calendar dates (`reviewDate - 27 days` through `reviewDate`).
- At least 4 accepted readings.
- At least 14 elapsed calendar days from first to last accepted reading.
- Latest accepted reading no more than 7 calendar days old.
- No first-four-days or final-four-days coverage rule.

These are initial product-policy defaults. They are not claimed to be clinically
validated.

The intake-confirmation defaults are:

- At least 7 included logged days before applying the personal-pattern check.
- A provisional positive day is suspicious when its total is strictly below
  50% of the median of the user's included aligned logged days.
- Intentional fasts use `exclude_from_intake`, preserving the repository's
  existing positive-logged-day semantics while recording that the date was a
  fast rather than missing evidence.

The detection values are configuration, not clinical or universal thresholds.

### Runtime and finite-output protection

The calculation boundary rejects malformed or impossible dates; non-finite or
non-positive weights, height, and previous TDEE; non-finite or negative calorie
rows; future birth dates; invalid runtime enum values; goal-rate/goal-type
contradictions; and non-positive/non-integer previous target IDs. Intake
confirmation dates, statuses, and sources are also runtime-validated.

Calorie grouping and aligned accumulation use checked addition. Overflow is
rejected. Every numeric recommendation output is asserted finite immediately
before return.

### Conservative TDEE and macro handling

The blended estimate remains:

```text
updatedTdee = newEstimateWeight * estimatedTdee
            + (1 - newEstimateWeight) * previousTdee
```

The relative limit and optional absolute limit are both applied. A BMR-derived
floor above the permitted upper update bound returns
`paused / tdee_floor_conflict`; it does not throw or bypass the limit.

If the existing macro allocator changes the requested calorie total beyond its
existing tolerance, calculation returns `paused / macro_target_infeasible`.

## 4. Result states and API changes

The pure calculation result now distinguishes:

- `recommendation`
- `ineligible` with exact evidence reasons
- `holding / intake_confirmation_required` with suspicious date context
- `paused / tdee_floor_conflict`
- `paused / macro_target_infeasible`

The service-facing state distinguishes:

- `holding / insufficient_evidence`
- `holding / intake_confirmation_required`
- `paused`
- `ready`
- `next-review`

Every holding state carries the current target. `gateAdaptiveReview` is the pure
boundary used by the service: only `kind: 'persist'` can create or refresh a
pending recommendation. Unanswered intake confirmations therefore keep the
existing calorie and macro target unchanged and cannot create a pending review.

`confirmAdaptiveIntakeDay(reviewDate, logDate, status)` persists an answer and
immediately calls the review calculation again. The UI offers `Complete log`,
`Partially logged`, and `Intentional fast` for each required date.

## 5. Time-aware weight smoothing

Weight trend smoothing uses elapsed calendar days and the configured 7-day
half-life:

```text
alpha = 1 - exp(-ln(2) * elapsedDays / halfLifeDays)
trend = alpha * scaleWeight + (1 - alpha) * previousTrend
```

The first trend equals the first scale reading. A seven-day gap leaves 50% of
the prior trend's influence; fourteen days leave 25%. Stored values still round
deterministically to three decimals after every step.

`computeWeightTrend` requires chronological input and rejects duplicates and
reverse ordering. There is one production caller,
`recomputeWeightTrendWithDb`, which queries `weight_logs ORDER BY log_date ASC`.
Manual save/update, delete, undo/restore, and Health Connect reconciliation all
route through that shared recomputation function.

Existing stored trend rows are not proactively backfilled. They are recomputed
the next time one of those weight mutations runs.

## 6. Weight slope estimation

TDEE estimation uses OLS over every accepted **raw scale reading**, with elapsed
calendar days from the first accepted reading as x and kilograms as y. The
result is kilograms/day:

```text
dailyEnergyChange = weightSlopeKgPerDay * kcalPerKg
estimatedTdee = alignedAverageIntakeKcal - dailyEnergyChange
```

Raw weights avoid adding smoothing lag and serial correlation to the energy
estimate. Time-aware trend weights remain for display and the existing
BMR/macro inputs.

## 7. Evidence alignment and sparse-user behavior

Accepted weights define the inclusive usable interval:

```text
estimationStart = first accepted weight date
estimationEnd = last accepted weight date
```

Only included calorie evidence inside that interval affects eligibility and
average intake. Missing dates are absent, never zero-filled. Results expose the
configured interval, effective interval, aligned intake count, aligned weight
count, elapsed span, and last-reading age.

For a review on 2026-02-04, the weight window is 2026-01-08 through 2026-02-04:

- Weekly readings on Jan 14, Jan 21, Jan 28, and Feb 4 qualify on weight
  evidence: 4 readings, 21 elapsed days, latest age 0.
- Three weekly readings fail the 4-reading minimum.
- Five roughly twice-weekly readings from Jan 21 through Feb 4 qualify at the
  exact 14-day span boundary.
- Four readings clustered inside one week fail the 14-day span rule.
- Ages 6 and 7 for the latest otherwise-valid reading qualify; age 8 fails the
  recency rule.
- A missing middle week can still qualify when 4 real readings span at least 14
  days and the latest is no more than 7 days old.

No readings are interpolated or fabricated. A newly logged weight increments the
application data version, causing Analytics to reload and re-evaluate. Pending
reviews are refreshed against the current review date, so a new reading can
restore eligibility immediately.

## 8. Provisional intake and confirmation flow

Positive logged days are provisionally included; they are not labeled verified
complete. `intakeEvidenceCompleteness` is
`positive_logged_days_provisional`.

The flow is:

1. Normalize positive logged-day totals inside the effective weight interval.
2. Apply stored confirmations. Confirmed partial and intentional-fast dates are
   excluded; confirmed-complete dates are included.
3. Build the configured personal median from included aligned days.
4. Flag only unconfirmed provisional days below the configured relative rule.
5. If all other evidence is eligible and suspicious dates remain, return
   `holding / intake_confirmation_required` and preserve the current target.
6. Show each date, logged calories, recent logged-day median, and the three
   neutral confirmation choices.
7. Persist each answer with source `adaptive_review`, then recalculate
   immediately. Multiple suspicious dates keep holding until the final required
   answer is stored.
8. Create a pending recommendation only after the final answer resolves the
   gate and the remaining evidence is eligible.

Ordinary provisional days proceed without interaction. Confirmed partial days
do not contribute calories or eligible intake-day count. Confirmed-complete days
contribute normally. Intentional fasts are stored distinctly from missing dates
and excluded under the configured inherited positive-day policy.

Confirmations are stored in `adaptive_intake_day_confirmations`, keyed by date,
with status, confirmation source, and timestamp. Upsert semantics prevent the
same confirmed date from being repeatedly questioned.

The wording does not characterize low intake as incorrect and does not make a
clinical claim.

## 9. Evidence fingerprinting

The canonical fingerprint payload includes:

- Algorithm version and complete algorithm configuration.
- Configured and effective intervals.
- Normalized aligned included calories.
- Normalized aligned intake confirmations, including status and source.
- Normalized accepted weight evidence.
- Runtime-validated profile evidence.
- Previous TDEE and previous target ID.

Evidence and confirmations are sorted, and equivalent calorie rows are grouped,
so input row order does not change the fingerprint. Status changes do change it.
Non-finite values are rejected before serialization.

No supported SHA-256 implementation is installed. The patch retains the
explicit non-security `fnv1a32-v2:<hex>` fingerprint. FNV-1a 32-bit has collision
risk and is not an audit-grade digest; the prefix and algorithm version preserve
a future migration path.

## 10. Tests added and updated

Focused tests cover:

- Exact 1-, 7-, and 14-day smoothing, seven-day half-life behavior, sparse
  weekly versus daily decay, ordering, duplicates, invalid weights, and
  deterministic rounding.
- OLS flat/loss/gain slopes, intermediate collinear points, raw-weight use,
  outliers, symmetric noise, row shuffling, and irregular dates.
- 27/28/29 inclusive window-date boundaries; 3 versus 4 readings; 13/14/15-day
  spans; latest ages 6/7/8; clustered, weekly, twice-weekly, dense, missing-week,
  stale, restored, and rolling-expiry patterns.
- Aligned calorie intervals, out-of-window invariance, missing dates, checked
  overflow, finite outputs, goal-rate consistency, TDEE limits, BMR-floor pause,
  and macro infeasibility.
- Normal provisional intake, configurable suspicious detection, complete,
  partial, intentional-fast, multiple-day, unanswered, final-answer,
  already-confirmed, fingerprint-change, eligibility-loss/restoration, target
  preservation, and pending-persistence behavior.

Existing behavior tests continue to run; none were deleted or weakened to hide
a failure.

## 11. Final verification

Run after all code and report changes on 2026-08-06:

- `npm test`: passed — 114 tests, 114 passed, 0 failed.
- `npm run typecheck`: passed — `tsc --noEmit` completed successfully.
- `git diff --check`: passed with no output.
- Lint/format: no script is defined in `package.json`.

## 12. Unresolved product-policy decisions

- The 28-date/4-reading/14-span/7-recency thresholds are initial product
  defaults, not clinically validated thresholds.
- The 7-day pattern minimum and 50%-of-personal-median suspicious-day rule need
  product validation against real logging behavior.
- Intentional fasts currently inherit positive-day semantics and are excluded
  from both the average and eligible intake count. Product may later choose a
  different explicit fasting policy.
- There is no explicit completeness signal for ordinary unflagged provisional
  days; low-friction inclusion remains intentional.
- The UI does not yet provide a settings/history screen for revising a stored
  confirmation after the review flow.

## 13. Known limitations

- The suspicious-day heuristic can miss partial days that resemble the user's
  normal pattern and can flag legitimate low days; confirmation prevents it from
  silently deciding either case.
- A stored confirmation remains attached to its date if food logs for that date
  later change. The evidence hash still changes with calorie edits, but changing
  the confirmation requires another upsert path.
- Confirmation records are included in full SQLite backups but are not yet a
  separate CSV export artifact.
- FNV-1a remains collision-prone.
- Historical stored trend weights are not proactively backfilled.

## 14. Recommended next verification task

Run an end-to-end Android check using a migrated version-6 database: create a
review with one suspicious date, confirm each outcome, relaunch between answers,
verify no pending row exists while unanswered, then log a new weight and confirm
that stale eligibility and the Analytics card update immediately.

Passing unit and type checks is necessary but does not make this implementation
production-ready or clinically validated.
