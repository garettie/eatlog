# Adaptive Recommendation Production Review

Review scope:

- `src/utils/adaptiveRecommendations.ts`
- `src/utils/weightTrend.ts`
- `src/utils/calculations.ts`
- `src/utils/calendar.ts`
- `src/services/adaptiveReviews.ts`
- `src/db/database.ts`
- `src/utils/adaptiveRecommendations.test.ts`
- `src/utils/weightTrend.test.ts`

Verification performed on 2026-08-06:

- `npm test`: 59 tests passed.
- `npm run typecheck`: passed.
- Targeted TypeScript simulations were run for endpoint errors, sparse readings, macro allocation, and date parsing.

## 1. Release Recommendation

**Not ready for release as an automatic recommendation system.**

The implementation is mathematically coherent for clean, complete, well-aligned evidence, and the sign convention for loss/gain is correct. It is not robust enough for production because eligibility does not establish complete intake, the estimator uses only two trend endpoints, the BMR floor can override the advertised TDEE change limit, profile and output validation is incomplete, and the evidence hash is too weak and incomplete for durable audit/idempotency semantics.

A constrained beta could be released only with explicit user review, a pause-on-uncertainty policy, finite-output checks, strict profile validation, and clear copy that logged-day averages are not measured energy expenditure.

## 2. Algorithm Reconstruction

### Evidence window

For review date `R`:

```text
windowStart = R - 13 calendar days
windowEnd   = R
```

This is 14 inclusive calendar dates. `parseLocalISO` requires strict `YYYY-MM-DD` and `addCalendarDays` uses local calendar arithmetic.

Daily calorie rows inside that window are grouped by date and summed. Rows whose grouped total is not positive are dropped. The average is therefore:

```text
A = sum(calories[d] for positive logged dates d) / count(positive logged dates)
```

This is an average over logged positive days, not an average over all 14 calendar days.

Weight rows inside the window are sorted by date. The first and last trend values are selected:

```text
W0 = first trendWeightKg
W1 = last trendWeightKg
D  = calendarDaysBetween(first date, last date)
```

### Equations

The implementation in `adaptiveRecommendations.ts:254-272` uses:

```text
weightChangeKg       = W1 - W0
weightChangeRate     = (W1 - W0) / D                 kg/day
dailyEnergyChange    = (W1 - W0) * 7700 / D         kcal/day
rawTdee              = A - dailyEnergyChange       kcal/day
smoothedTdee         = 0.7 * rawTdee + 0.3 * previousTdee
clampedTdee          = min(1.1 * previousTdee,
                            max(0.9 * previousTdee, smoothedTdee))
currentBmr           = Mifflin-St Jeor at W1 and age(reviewDate)
tdeeFloor            = 1.2 * currentBmr
proposedTdee         = max(tdeeFloor, clampedTdee)
unflooredTarget      = proposedTdee + goalRateKgPerWeek * 7700 / 7
preMacroTarget       = round(max(tdeeFloor, unflooredTarget))
```

`calculateMacrosForCalories` then receives `preMacroTarget`. If the remaining calories after protein and fat are below 200 kcal, it forces 50 g carbohydrate and recomputes `targetCalories`; therefore the returned `targetCalories` is not always exactly `preMacroTarget`.

### Sign verification

The weight signs are correct under the fixed 7,700 kcal/kg model:

- Weight loss: `W1 - W0 < 0`, so daily energy change is negative. Subtracting it raises raw TDEE above average intake.
- Weight gain: `W1 - W0 > 0`, so daily energy change is positive. Subtracting it lowers raw TDEE below average intake.
- Flat trend: raw TDEE equals average logged intake.

The goal-rate signs are also correct when inputs follow the product convention:

- `cut`: negative `goalRateKgPerWeek`, target below proposed TDEE.
- `maintain`: zero rate.
- `bulk`: positive rate, target above proposed TDEE.

The implementation does **not** enforce that convention. A `cut` with a positive rate produces a bulk-style target, and a `bulk` with a negative rate produces a cut-style target.

## 3. Findings

Severity reflects recommendation risk, not code complexity.

### CRITICAL: Non-finite and invalid profile inputs can produce non-finite recommendations

**Location:** `src/utils/adaptiveRecommendations.ts:234-301`, especially `calcBMR` call at lines 265-271 and `calculateMacrosForCalories` at lines 276-282.

**Example:**

```ts
profile: {
  sex: 'male', heightCm: Number.NaN, birthDate: '1990-06-15',
  goalType: 'maintain', goalRateKgPerWeek: 0,
  proteinPreference: 'moderate',
}
```

**Actual behavior:** `currentBmr`, `tdeeFloor`, `proposedTdee`, and macro values become `NaN`; the function returns them. `previousTdee` is validated, but the profile and resulting values are not.

Other examples include `heightCm = 0`, a future birth date yielding negative age, `heightCm = 1e308`, or an invalid runtime `goalType`/`proteinPreference` passed through a type assertion. Invalid `goalType` or preference indexes an object with `undefined`, causing `NaN`. Invalid `sex` is silently treated as female by `calcBMR` in `calculations.ts:36-43`.

**Expected behavior:** Reject invalid profile evidence and assert every returned numeric field is finite and within configured product bounds before persistence or display.

**Correction:** Validate finite positive height, valid date, non-negative plausible age, valid discriminated-union values, finite positive weight, finite non-negative rate, and finite previous TDEE. Add a final `assertFiniteRecommendation` guard.

### CRITICAL: No safety policy exists for automatic adjustment

**Location:** `adaptiveRecommendations.ts:234-301`; profile model in `database.ts:21-35` has no pregnancy, eating-disorder, medication, diabetes, edema, illness, or clinician-review state.

**Example:** A user with medically driven edema gains 1 kg between endpoints, or a user taking medication that changes weight has a `rawTdee` reduced by `7700 / 13 = 592 kcal/day` before smoothing.

**Actual behavior:** The system interprets any trend-weight movement as energy-balance evidence and can produce a new target. There is no pause, warning, or clinician-oversight route.

**Expected behavior:** Automatic adjustment must pause when weight data may not represent tissue-energy change, or clearly require user confirmation under a documented product policy.

**Correction:** Add a safety-policy decision before calculation. Do not invent medical thresholds in code; define product-approved conditions and route them to `pause` or `clinician_review` rather than silently calculating.

### HIGH: Eligibility does not establish complete or unbiased calorie intake

**Location:** `adaptiveRecommendations.ts:92-110`, `153-181`; database query `adaptiveReviews.ts:67-76` uses `HAVING SUM(calories) > 0`.

**Example:** Ten days contain 2,000 logged kcal and four days are missing. The calculation accepts the user at the exact minimum. If the four missing days were actually 1,000 kcal, actual 14-day mean is 1,714 kcal but calculated mean is 2,000 kcal. If missing days were 3,000 kcal, the bias reverses.

**Actual behavior:** Any positive total counts as a complete intake day. Missing days are removed from the denominator, so missing-not-at-random behavior directly biases TDEE.

**Expected behavior:** Distinguish `complete`, `partial`, `fasting`, and `missing` days, require an approved coverage score, and either calculate over a common interval or pause when coverage is insufficient.

**Correction:** Store or derive explicit day-completeness evidence. At minimum require a product-defined number of complete days spanning the weight interval, not merely 10 positive rows anywhere in 14 days.

### HIGH: Calorie and weight intervals can be misaligned

**Location:** `adaptiveRecommendations.ts:92-151`, `254-261`; `adaptiveReviews.ts:67-85`.

**Example:** Eligible weight endpoints are Jan 4 and Jan 11, giving `D = 7`. Ten calorie days Jan 1-Jan 10 are accepted. Jan 1-Jan 3 are outside the endpoint interval but included in `A`.

If those three early days average 500 kcal and the seven endpoint-interval days average 2,000 kcal, the calculation uses `A = 1,550` instead of 2,000, biasing raw TDEE down by 450 kcal/day.

**Actual behavior:** Calories use the whole rolling window; weight change uses first-to-last weight span.

**Expected behavior:** Intake and weight evidence must cover the same effective interval, or the model must explicitly weight calories by the interval represented by the slope.

**Correction:** Define the estimation interval first, then filter calories and weights to it. Require sufficient complete intake coverage inside `[firstWeightDate, lastWeightDate]`.

### HIGH: Endpoint-only trend estimation is vulnerable to ordinary scale noise and EWMA lag

**Location:** `adaptiveRecommendations.ts:254-261`; `weightTrend.ts:18-41`.

**Example:** Stable user, average intake 2,000 kcal, previous TDEE 2,000, 80 kg first trend and 79.5 kg last trend over 13 days. The endpoint movement implies:

```text
rawTdee = 2000 - (-0.5 * 7700 / 13) = 2296 kcal/day
smoothedTdee = 0.7 * 2296 + 0.3 * 2000 = 2207 kcal/day
```

The normal clamp allows a 200 kcal increase, so the proposed TDEE becomes 2,200 kcal/day even if the 0.5 kg change is sodium, glycogen, menstrual-cycle water, constipation, travel, or a scale artifact.

`computeWeightTrend` applies fixed `alpha = 0.15` per reading, not per elapsed day. With four readings at Jan 1, Jan 2, Jan 3, and Jan 14, scale values 80, 80, 80, 79 produce trend values 80, 80, 80, 79.85. The apparent 1 kg loss becomes only 0.15 kg in the adaptive endpoint calculation, and the time constant changes when readings are sparse.

**Expected behavior:** Estimate a slope from all available trend readings, account for sampling intervals, and downgrade confidence for sparse or noisy data.

**Correction:** Use ordinary least-squares slope over all valid trend points in the common interval as the minimal improvement. Theil-Sen or cluster means are stronger when outliers are common. Keep endpoint fallback only for an explicitly lower-confidence mode.

### HIGH: The BMR floor bypasses the stated +/-10% TDEE change limit

**Location:** `adaptiveRecommendations.ts:273-285`.

**Example:** `previousTdee = 1,200`, flat weight, valid profile with `tdeeFloor = 2,106`.

```text
smoothedTdee = 1760
clampedTdee  = 1320       // normal upper change is +120
proposedTdee = 2106       // floor overrides clamp
```

This is a +906 kcal/day, +75.5% jump. The existing test explicitly documents this override, but it contradicts the normal adjustment limit and makes the limit misleading.

**Expected behavior:** Either pause for manual review when the safety floor is outside the allowed update band, or use a separate documented safety action. Do not silently jump across the normal cap.

**Correction:** If `tdeeFloor > previousTdee * (1 + maximumChangeFraction)`, return `pause`/`manual_review`. Otherwise apply the floor inside the bounded range.

### HIGH: Goal-rate direction is not validated

**Location:** `adaptiveRecommendations.ts:276-282`; `goalRate.ts:31-45` defines validation but the adaptive engine does not call it.

**Example:** `goalType: 'cut'`, `goalRateKgPerWeek: 0.5`, flat weight, proposed TDEE 2,106.

```text
target = 2106 + 0.5 * 7700 / 7 = 2656 kcal/day
```

**Actual behavior:** A cut produces a gain target. A bulk with `-0.5` produces a loss target.

**Expected behavior:** Reject or normalize contradictory signs before calculation. Normalization is only appropriate if the product explicitly treats the stored rate as unsigned UI input.

**Correction:** Call `isGoalRateValid` with the goal type and make invalid persisted data ineligible rather than silently changing intent.

### HIGH: Output target can exceed the calculated target due to macro allocation

**Location:** `calculations.ts:60-89`, called by `adaptiveRecommendations.ts:278-282`.

**Example:** `targetCalories = 800`, `goalType = 'cut'`, `proteinPreference = 'extra_high'`, `weightKg = 200`.

```text
protein = 500 g
fat     = 22.2 g
carbs   = forced 50 g
returned targetCalories = 2400
```

**Actual behavior:** The carb floor changes the calorie target by +1,600 kcal. Adaptive output has no postcondition that the final target is within policy bounds or near the requested target.

**Expected behavior:** Macro allocation should either reject impossible inputs, reduce protein/fat under a policy, or report that the calorie target cannot satisfy the macro constraints.

**Correction:** Validate macro feasibility and apply an explicit minimum-calorie/policy decision before allocation. Do not silently replace the recommendation with a materially different number.

### HIGH: Evidence hash omits previous TDEE and algorithm configuration

**Location:** `adaptiveRecommendations.ts:196-232`; `AdaptiveEvidencePayload` lines 33-40.

**Example:** Same evidence, same `previousTargetId`, and `previousTdee` changes from 2,000 to 2,200 due to restored or corrected target data.

**Actual behavior:** `evidenceHash` is identical although smoothing, clamping, and the recommendation change. The hash also stays unchanged if `7700`, smoothing weights, BMR floor multiplier, or clamp policy changes in a future release.

**Expected behavior:** A stale-check hash must fingerprint every input and algorithm configuration that can change output.

**Correction:** Include `algorithmVersion`, `previousTdee`, and a serialized configuration object in the canonical payload.

### HIGH: Fixed FNV-1a 32-bit hash is inadequate for audit identity

**Location:** `adaptiveRecommendations.ts:224-232`.

**Example:** A 32-bit hash has approximately 50% birthday-collision probability around 77,000 distinct payloads. It is not suitable for security, tamper evidence, or a long-lived audit identifier.

**Actual behavior:** A collision can make changed evidence look unchanged in `adaptiveReviews.ts:144-166` or `resolveReview`.

**Expected behavior:** Use a cryptographic digest for audit/idempotency, or explicitly document that the value is only a non-security cache hint.

**Correction:** Use SHA-256 over a versioned canonical UTF-8 payload. If a cryptographic package is added later, use the Expo-supported digest API rather than a hand-rolled security hash.

### MEDIUM: Hash canonicalization is incomplete for public callers

**Location:** `adaptiveRecommendations.ts:196-222`.

**Examples:**

- `NaN` and `Infinity` serialize as `null` in JSON, so distinct invalid payloads can hash identically.
- `-0` serializes as `0`.
- Duplicate same-date calorie rows are sorted by date only; their order can affect JSON ordering even if their sum is equivalent.
- Floating values that differ only below display precision hash differently, while practical values may be indistinguishable.

**Actual behavior:** `calculateAdaptiveRecommendation` gets normalized unique calorie rows, but the public `hashAdaptiveEvidence` function accepts an unvalidated payload and does not apply the same normalization or validation.

**Expected behavior:** Hash exactly the validated evidence representation used by calculation.

**Correction:** Canonicalize through one validated normalization path, reject non-finite values, define precision policy, and include algorithm version.

### MEDIUM: Numeric overflow is possible after per-row validation

**Location:** `adaptiveRecommendations.ts:92-110`, `254-282`.

**Example:** Two finite calorie rows of `1e308` on different dates produce a finite per-row check but a sum of `Infinity` in the reducer.

**Actual behavior:** `averageIntakeKcal` and downstream outputs become infinite; no final finite check catches it.

**Expected behavior:** Reject values outside configured domain bounds and validate aggregate sums.

**Correction:** Bound calories and weights at the domain boundary, use checked accumulation, and assert finite average, slope, raw TDEE, floor, target, and macros.

### MEDIUM: Negative calorie rows are accepted and can manufacture a positive day

**Location:** `adaptiveRecommendations.ts:92-110`.

**Example:** Same date contains `+2,000` and `-1,999` calories.

**Actual behavior:** The day is counted with 1 kcal. The service query also hides non-positive grouped totals with `HAVING SUM(calories) > 0`.

**Expected behavior:** Food log corrections should be represented by valid row semantics, and negative totals should be rejected or explicitly reconciled before adaptive evidence.

**Correction:** Reject negative daily totals or validate correction provenance. Do not use a positive-total predicate as a completeness signal.

### MEDIUM: Future and age-inconsistent evidence is not rejected

**Location:** `adaptiveRecommendations.ts:183-194`; `windowFor` at lines 82-85.

**Example:** `birthDate = '2090-01-01'`, `reviewDate = '2026-01-14'` yields age `-64`. A future review date can also make future weight rows eligible if the caller supplies it.

**Actual behavior:** BMR uses negative age; no error is raised.

**Expected behavior:** Birth date must precede review date and meet product age policy. Review/weight dates must not be future relative to the data-collection clock unless explicitly supported.

**Correction:** Validate temporal ordering and route minors or unsupported age ranges through product policy.

### MEDIUM: The service reports a full window even when it queried a shortened effective window

**Location:** `adaptiveReviews.ts:67-85` and `adaptiveRecommendations.ts:82-151`.

`loadEvidence` starts its SQL query at `max(windowStart, target.effective_date)`, but the recommendation still reports `windowStart = reviewDate - 13`. This can be intentional after a plan change, but the stored review does not expose the actual evidence start or coverage denominator.

**Expected behavior:** Store and display the actual effective interval, or make the distinction explicit in the review record.

**Correction:** Add `evidenceStart`, `completeIntakeDayCount`, and coverage metadata, or use the actual interval in the recommendation payload.

### LOW: Magic numbers and duplicated policy reduce maintainability

**Location:** `adaptiveRecommendations.ts:158-179`, `254-282`; `adaptiveReviews.ts:33-48`.

The values `10`, `4`, `7`, `13`, `7700`, `0.7`, `0.3`, `0.9`, `1.1`, `1.2`, and macro constants are embedded or duplicated. Changing a threshold requires coordinated edits and does not change the hash.

**Correction:** Inject a versioned `AdaptiveAlgorithmConfig` and use it in calculation, eligibility, explanation, and hashing.

## 4. Evidence Window Audit

| Scenario | Current behavior | Risk | Required policy |
| --- | --- | --- | --- |
| First weight after window start | Allowed if it is on or before `windowStart + 3` | First endpoint may still be day 4; only a 7-day span can pass | Require an explicit minimum interval and report actual endpoint dates |
| Last weight before window end | Allowed if it is on or after `windowStart + 10` | Last endpoint may be four days old; recent intake is disconnected | Align intake interval to weight endpoints or require recent endpoint |
| Calories outside first-last interval | Included in full 14-day average | Direct slope/intake mismatch; can bias TDEE by hundreds | Filter calories to common interval |
| Weight readings clustered near one end | Four readings can pass if one early and one late; intermediate rows may add little information | Endpoint noise dominates | Fit all points and score distribution |
| Minimum 10 intake days | Ten positive days pass, regardless of 4 missing days | Missing-not-at-random bias | Require complete-day coverage and span |
| Missing days systematically different | Missing days are omitted | Unobserved intake bias is silent | Ask user to complete data or pause |
| Legitimate zero-calorie fast | Zero total is dropped | A real fast is indistinguishable from no logging | Add explicit fasting/completeness state |
| Partially logged day | Any positive total counts | Underlogging looks like a low-intake day | Require completion signal or minimum logging rule |
| Multiple calorie rows/date | Rows are summed; equivalent splits are stable in calculator | Good behavior, but negative corrections are not safe | Keep sum behavior, reject invalid totals |
| Multiple weight rows/date | Throws in trend and adaptive normalization | Safe for DB uniqueness, but direct imports fail hard | Keep rejection and surface actionable error |

The current rules are insufficient because they measure row presence, not evidence quality. Ten of fourteen positive days plus four weight rows is not enough to infer energy expenditure for users with incomplete or biased logging.

## 5. Mathematical and Statistical Stress Test

For an endpoint movement error `e` over `D` days, the raw TDEE error magnitude is:

```text
7700 * e / D kcal/day
```

If previous TDEE is unchanged and the BMR floor is inactive, smoothing passes 70% of that error into the update.

| Endpoint movement | 7 days raw / smoothed | 10 days raw / smoothed | 13 days raw / smoothed |
| ---: | ---: | ---: | ---: |
| 0.10 kg | 110 / 77 | 77 / 54 | 59 / 42 |
| 0.25 kg | 275 / 193 | 193 / 135 | 148 / 104 |
| 0.50 kg | 550 / 385 | 385 / 270 | 296 / 207 |
| 1.00 kg | 1,100 / 770 | 770 / 539 | 592 / 414 |

The normal +/-10% clamp limits a 2,000 kcal previous TDEE to +/-200 kcal, but the floor can override that limit upward. The clamp therefore hides some endpoint noise but does not make the estimate accurate; it creates a persistent directional bias when noise repeatedly points one way.

### Scenario interpretation

The following simulations use the current implementation, 10 positive 2,000-ish calorie rows unless noted, four weight rows, and valid dates. `raw`, `smooth`, and `clamp` are rounded for display. `floor` is the 1.2 BMR floor. A target can differ from proposed TDEE because of goal-rate adjustment and macro allocation.

| Scenario | Avg intake | Start kg | End kg | Days | Prev TDEE | Raw | Smooth | Clamp | Floor | Proposed | Target | Interpretation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Maintenance | 2,100 | 80 | 80 | 13 | 2,400 | 2,100 | 2,190 | 2,190 | 2,106 | 2,190 | 2,190 | Stable weight, but prior estimate still drives upward |
| Slow loss | 2,200 | 80 | 79.75 | 13 | 2,200 | 2,348 | 2,304 | 2,304 | 2,103 | 2,304 | 2,103 | Cut adjustment is floored, so target is near floor |
| Fast apparent loss | 1,800 | 80 | 79 | 13 | 2,200 | 2,392 | 2,335 | 2,335 | 2,094 | 2,335 | 2,094 | Large apparent loss raises expenditure while cut target hits floor |
| Slow gain | 2,200 | 80 | 80.25 | 13 | 2,200 | 2,052 | 2,096 | 2,096 | 2,109 | 2,109 | 2,384 | Gain is floor-dominated |
| Fast apparent gain | 1,800 | 80 | 81 | 13 | 2,200 | 1,208 | 1,505 | 1,980 | 2,118 | 2,118 | 2,668 | Floor overrides a large downward update |
| Underlogging | 1,500 | 80 | 79 | 13 | 2,200 | 2,092 | 2,125 | 2,125 | 2,094 | 2,125 | 2,125 | Weight loss makes low logged intake look plausible |
| Missing low days | 2,400 | 80 | 79 | 13 | 2,200 | 2,992 | 2,755 | 2,420 | 2,094 | 2,420 | 2,420 | Omitted low days inflate intake and clamp upward |
| Missing high days | 1,600 | 80 | 79 | 13 | 2,200 | 2,192 | 2,195 | 2,195 | 2,094 | 2,195 | 2,195 | Omitted high days bias in opposite direction |
| Noisy endpoints | 2,000 | 80.5 | 79.5 | 13 | 2,000 | 2,592 | 2,415 | 2,200 | 2,100 | 2,200 | 2,200 | One kg endpoint differential reaches cap |
| Low previous TDEE | 2,000 | 80 | 80 | 13 | 1,200 | 2,000 | 1,760 | 1,320 | 2,106 | 2,106 | 2,106 | +906 kcal floor jump, bypassing cap |
| High previous TDEE | 2,000 | 80 | 80 | 13 | 4,000 | 2,000 | 2,600 | 3,600 | 2,106 | 3,600 | 3,600 | Historical overestimate decays slowly |
| BMR floor activation | 1,500 | 200 | 200 | 13 | 2,000 | 1,500 | 1,650 | 1,800 | 3,750 | 3,750 | 3,750 | Very large floor-driven target |
| Minimum evidence, 7-day span | 2,000 | 80 | 79.75 | 7 | 2,000 | 2,275 | 2,193 | 2,193 | 2,103 | 2,193 | 2,193 | Passes minimum with only 7 elapsed days and interval mismatch possible |
| Long-span, 13-day | 2,000 | 80 | 79.75 | 13 | 2,000 | 2,148 | 2,104 | 2,104 | 2,103 | 2,104 | 2,104 | Same movement is materially less influential than 7-day case |
| Contradictory cut, +0.5 kg/week | 2,000 | 80 | 80 | 13 | 2,000 | 2,000 | 2,000 | 2,000 | 2,106 | 2,106 | 2,656 | Cut goal generates gain target |

### Physiological disturbances

The model cannot distinguish tissue energy change from water/gut changes:

- Rapid early water loss: 1 kg over 13 days is interpreted as approximately 592 kcal/day of additional expenditure before smoothing.
- Menstrual-cycle retention/release, high sodium, glycogen replenishment, illness, travel, or constipation: a 0.5 kg endpoint differential has approximately 296 kcal/day raw effect over 13 days.
- Underreported intake: if actual mean is 2,200 but logged mean is 1,700 while weight remains stable, the model estimates 1,700 before prior blending and floor rules; it does not know the missing 500 kcal.
- Stable intake with noisy endpoints: one-sided noise repeatedly pushes the estimate until the clamp or floor stops it.

### Estimator comparison

| Estimator | Strength | Weakness | Recommendation |
| --- | --- | --- | --- |
| First-last endpoints | Minimal and responsive | Highest sensitivity to endpoint noise and interval mismatch | Do not use as sole production estimator |
| OLS over all trend points | Simple, uses all data, slope has a measurable residual error | Still sensitive to severe outliers and assumes linear trend | Best minimal production replacement |
| Theil-Sen | Robust to isolated outliers and water spikes | More code and less familiar diagnostics | Use if outliers are common and sample count is adequate |
| Early/late cluster means | Reduces endpoint noise while preserving simple explanation | Requires cluster definition and enough readings in each cluster | Good alternative when UI already exposes clusters |
| Longer window | Reduces short-term water noise | Slower response to real maintenance changes | Prefer 21-28 days when product can tolerate slower updates |
| Confidence-weighted update | Makes sparse/noisy evidence move TDEE less | Requires a calibrated quality score | Add after basic interval/completeness fixes |

Recommended simplest production approach: common-interval evidence, explicit complete-day coverage, OLS slope over every trend reading, residual/reading-count quality gates, then bounded update. Add Theil-Sen only if real data shows frequent outliers.

## 6. Smoothing and Adjustment Limits

`0.7 * raw + 0.3 * previous` gives new evidence 70% weight. This is a responsive update, not strong smoothing. A one-kilogram apparent loss over 13 days moves a 2,000 kcal estimate to 2,414 before the clamp; the clamp then produces 2,200. The clamp dominates for large evidence changes, while smoothing dominates for smaller changes.

The interaction is:

1. Raw energy balance can be wrong due to intake bias or water movement.
2. Smoothing preserves 70% of that error.
3. The +/-10% clamp limits normal updates.
4. The BMR floor can bypass the clamp upward.
5. Goal-rate adjustment is applied after the TDEE update and has no independent maximum.
6. Macro allocation can replace a low target with a higher carbohydrate-floor target.
7. Rounding occurs at multiple layers, so displayed values are not the exact internal values.

Safer defaults are product-policy decisions, not medical facts. A reasonable starting configuration for investigation is `newEstimateWeight = 0.3` to `0.5`, `maximumTdeeChangeFraction = 0.05` to `0.10`, and an absolute change cap in kcal/day. The exact values must be calibrated against real user data and should be paired with confidence, not used as a substitute for evidence quality.

The floor should never silently bypass the normal cap. If the floor is outside the allowed band, pause automatic adaptation and explain why.

## 7. Physiological and Safety Validation

These are product-policy categories, not claims that this code can provide medical safety.

### Should throw an error

- Invalid date syntax or impossible calendar date.
- Non-finite or non-positive weight.
- Non-finite calories, aggregate overflow, or negative daily total without an explicit correction model.
- Non-finite or non-positive previous TDEE.
- Invalid enum value.
- Birth date after review date.
- Invalid height or weight domain according to product-approved bounds.
- Contradictory goal-rate sign if the product does not normalize it.

### Should make the user ineligible

- Fewer than configured complete intake days.
- Insufficient common-interval coverage.
- Fewer than configured weight readings.
- Endpoint span below configured minimum.
- Weight readings too concentrated, excessive residual error, or insufficient slope confidence.

### Should pause automatic adjustment

- BMR floor outside the allowed TDEE change band.
- Large unexplained weight jump or trend residual.
- Evidence hash/model version mismatch.
- Recently changed profile, target, unit, or plan.
- Data imported from a source with unresolved duplicate/conflicting measurements.

### Should show a warning

- Logged intake is estimated or sparse.
- Target is floor-dominated.
- Weight trend is noisy or short-span.
- The new recommendation is based on a low-confidence slope.

### Requires clinician oversight

Pregnancy, suspected eating-disorder risk, diabetes or glucose-lowering medication, medication-driven weight changes, edema, significant illness, and other clinically relevant conditions. The current profile has no way to identify these states, so general release cannot claim safety for them.

Minors and very old users also require explicit product policy. Do not infer an age-safety rule from Mifflin-St Jeor alone.

## 8. Date Handling Review

What is correct:

- `parseLocalISO` strictly rejects malformed and impossible dates, including `2026-02-30` and non-zero-padded dates.
- Leap years, month boundaries, year boundaries, and DST are handled by local calendar arithmetic plus UTC day-component difference.
- String comparisons are safe after strict `YYYY-MM-DD` validation.
- `windowStart = reviewDate - 13` and `windowEnd = reviewDate` represent 14 inclusive dates.
- `calendarDaysBetween('2026-01-01', '2026-01-14')` is 13, so it measures elapsed intervals, not inclusive date count.

Assumptions and gaps:

- The seven-day requirement means seven elapsed days, which needs eight distinct calendar dates. If product means seven calendar observations, this is an off-by-one policy mismatch.
- `ageOnDate` does not reject review dates before birth dates.
- The adaptive engine does not reject future review dates or future measurements relative to today.
- `normalizeDailyCalories` validates finite calories before filtering by window, so adding an out-of-window `NaN` row throws instead of being irrelevant. Weight values outside the window are filtered before numeric validation, creating inconsistent behavior.
- The service relies on SQLite lexical `BETWEEN`, which is safe only because all persisted dates remain strict canonical strings.

## 9. Hashing and Determinism

Deterministic properties currently present:

- Canonical object property insertion order is explicit.
- Daily and weight arrays are sorted by date.
- Input row order does not change the calculated recommendation after normalization.
- Repeating the same calculation produces the same result.
- `-0` is normalized by JSON serialization, intentionally or not.

Limitations:

- FNV-1a 32-bit is collision-prone and non-cryptographic.
- `previousTdee` is not included even though it changes output.
- Algorithm constants and version are not included.
- Public hash input is not normalized or validated like calculation input.
- `NaN` and infinities become JSON `null`.
- Precision policy is undefined.
- Hash purpose is not specified: cache key, idempotency key, stale-review fingerprint, audit identity, and security digest have different requirements.

Recommended versioned payload:

```ts
interface CanonicalAdaptiveEvidenceV1 {
  algorithmVersion: 1;
  config: {
    windowDays: number;
    kcalPerKg: number;
    newEstimateWeight: number;
    maximumTdeeChangeFraction: number;
    minimumActivityMultiplier: number;
  };
  windowStart: string;
  windowEnd: string;
  dailyCalories: Array<{ date: string; calories: number }>;
  weights: Array<{
    date: string;
    scaleWeightKg: number;
    trendWeightKg: number;
  }>;
  profile: AdaptiveProfileEvidence;
  previousTdee: number;
  previousTargetId: number;
}
```

Canonicalize validated values once, serialize with stable property order, and digest with SHA-256. If the value is only a local cache hint, state that explicitly and do not use it as an audit/security identity.

## 10. TypeScript and Maintainability Review

The current TypeScript compiles and public interfaces are readable. The main correctness concern is that compile-time union types are treated as runtime validation. SQLite row data, backup data, tests, and type assertions can violate those types.

Specific maintainability issues:

- The same eligibility constants are represented in the calculator and copied into `adaptiveReviews.ts:33-48`.
- `calculateAdaptiveRecommendation` normalizes evidence, then calls `evaluateAdaptiveEligibility`, which normalizes it again. This is deterministic but wasteful and makes future normalization divergence possible.
- `AdaptiveWeightReading.scaleWeightKg` is validated but not used in the model. The function trusts caller-provided `trendWeightKg` without checking provenance or recomputing it.
- `currentBmr` and `tdeeFloor` are returned unrounded while TDEE fields are rounded; this is defensible but should be explicit in the output contract.
- The model has no quality/confidence output, so callers cannot explain whether a recommendation is strong or merely eligible.
- `7700`, floor multipliers, smoothing weights, and clamp percentages are undocumented policy constants in executable code.

## 11. Existing Test Coverage

Existing tests are useful but mostly validate intended happy-path mechanics:

- Eligibility threshold boundaries, early/late coverage, and seven-day span.
- Correct loss/gain sign direction.
- +/-10% clamp and floor override.
- Goal target direction for valid signs.
- Hash ordering and one fixed FNV output.
- Missing food dates omitted.
- EWMA ordering, duplicate dates, invalid scale weights, and calendar-day rate.

Missing high-value coverage:

- Invalid profile evidence and invalid enum values.
- Future birth date and future measurement/review date.
- NaN, infinity, aggregate overflow, and negative calorie corrections.
- Common-interval mismatch between calorie and weight evidence.
- Partial/fasting/zero-calorie day semantics.
- Missing-not-at-random intake bias.
- Sparse EWMA behavior and irregular reading intervals.
- Endpoint outliers, water-weight shocks, and trend residuals.
- Goal-rate direction rejection.
- Final macro target feasibility and post-allocation policy bounds.
- Hash changes when previous TDEE or algorithm version changes.
- Hash behavior for invalid values, duplicate equivalent rows, `-0`, and precision normalization.
- Final-output finite invariant.
- Property-based and metamorphic invariants.

## 12. Comprehensive Test Plan

The repository uses Node's built-in `node:test` through `tsx --test`, not Vitest. The following is near-executable syntax for new tests in the existing style. Add `fast-check` only after approving a new dev dependency; it is not currently installed.

### Unit tests

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

test('window is 14 inclusive dates', () => { /* review Jan 14 -> Jan 1..14 */ });
test('daily rows sum by date and sort deterministically', () => { /* split rows */ });
test('out-of-window valid rows do not affect output', () => { /* before/after window */ });
test('negative daily totals reject', () => { /* correction policy */ });
test('zero total requires explicit fasting/completeness state', () => { /* policy */ });
test('duplicate weight dates reject', () => { /* existing behavior */ });
test('scale/trend contradiction rejects or downgrades confidence', () => { /* new policy */ });
test('loss raises raw TDEE and gain lowers it', () => { /* exact equations */ });
test('flat trend makes raw TDEE equal average intake', () => { /* exact */ });
test('OLS uses all trend readings', () => { /* intermediate point changes slope */ });
test('goal sign matches goal type', () => { /* cut positive throws */ });
test('floor outside change band pauses instead of jumping', () => { /* low prior TDEE */ });
test('final macro target is finite and policy-valid', () => { /* extreme profile */ });
test('future birth date rejects', () => { /* age < 0 */ });
test('all returned numeric fields are finite', () => { /* inspect every number */ });
test('hash includes previous TDEE', () => { /* same evidence, changed prior */ });
test('hash includes algorithm version/config', () => { /* version bump changes hash */ });
```

### Boundary tests

Test immediately below, at, and above each threshold:

- 9, 10, and 11 complete intake days.
- 3, 4, and 5 weight readings.
- 6, 7, and 8 elapsed endpoint days.
- First weight on `windowStart + 3` and `windowStart + 4`.
- Last weight on `windowStart + 9` and `windowStart + 10`.
- 0, positive, negative, NaN, infinity, and maximum policy-bound calories.
- Previous TDEE just below, at, and above any configured minimum/maximum.
- Floor exactly at, just below, and just above the normal upper change band.
- Goal rates at range boundaries and one step outside.
- Birth date on review date, one day before, and one day after.
- Leap day, month end, year end, and DST transition.

### Property-based tests with `fast-check`

```ts
import fc from 'fast-check';

test('row order is irrelevant', () => {
  fc.assert(fc.property(validEvidenceArbitrary(), (input) => {
    const a = calculateAdaptiveRecommendation(input);
    const b = calculateAdaptiveRecommendation(shuffleRows(input));
    assert.deepEqual(a, b);
  }));
});

test('out-of-window valid rows are irrelevant', () => {
  fc.assert(fc.property(validEvidenceArbitrary(), outOfWindowRowsArbitrary(), (input, extra) => {
    assert.deepEqual(
      calculateAdaptiveRecommendation(input),
      calculateAdaptiveRecommendation(addRows(input, extra)),
    );
  }));
});

test('calorie translation is approximately one-for-one', () => {
  fc.assert(fc.property(validEvidenceArbitrary(), fc.integer({ min: -200, max: 200 }), (input, delta) => {
    const base = calculateAdaptiveRecommendation(input);
    const shifted = calculateAdaptiveRecommendation(shiftEveryLoggedDay(input, delta));
    assert.ok(Math.abs((shifted.rawTdee - base.rawTdee) - delta) <= 1);
  }));
});

test('flat trend maps raw TDEE to average intake', () => {
  fc.assert(fc.property(flatWeightEvidenceArbitrary(), (input) => {
    const result = calculateAdaptiveRecommendation(input);
    assert.ok(Math.abs(result.rawTdee - result.averageIntakeKcal) <= 1);
  }));
});

test('outputs stay finite', () => {
  fc.assert(fc.property(validEvidenceArbitrary(), (input) => {
    const result = calculateAdaptiveRecommendation(input);
    for (const value of Object.values(result)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value));
    }
  }));
});
```

### Metamorphic tests

| Transformation | Expected result |
| --- | --- |
| Shuffle all rows | Identical output and hash |
| Add valid out-of-window rows | Identical output and hash |
| Split one calorie total into same-day rows | Identical output and hash after normalization |
| Shift all dates together, preserving intervals and age | Identical numeric output and equivalent canonical hash except dates |
| Add constant `X` to every calorie day | Raw TDEE increases approximately `X`; later clamp/floor may make final output non-linear |
| Replace endpoint-only weights with intermediate points on the same linear trend | Identical slope under regression; current implementation may change because trend values are caller-supplied |
| Add symmetric noise around unchanged trend | Estimate changes only within configured confidence/quality tolerance; current implementation can change materially |
| Duplicate a calorie row | Same output only if duplicate is split-equivalent; duplicate weight row must throw |
| Change floating precision without changing configured canonical precision | Identical output/hash after explicit quantization; current code does not promise this |
| Repeat calculation | Identical output/hash |

The date-shift test should compare numeric output, not literal hash, unless the canonical payload intentionally excludes absolute dates. The current hash includes dates, so a shifted date set must change the literal hash even when the model result is invariant.

### Mutation-testing targets

The suite must fail for each mutation:

- Reverse energy-change sign.
- Replace raw subtraction with addition.
- Change 7,700 to 770 or 77,000.
- Remove elapsed-day division.
- Change smoothing weights from 0.7/0.3.
- Remove the TDEE clamp.
- Remove the BMR floor.
- Reverse `min` and `max` clamp bounds.
- Change inclusive early/late date comparisons to exclusive.
- Drop a hash field.
- Allow duplicate weight dates.
- Treat missing intake as zero.
- Include calories outside the common weight interval.
- Use only first and last points after adding intermediate trend points.
- Allow contradictory goal-rate signs.
- Skip final finite-output validation.

## 13. Recommended Architecture

Minimal separation of responsibilities:

1. `normalizeAdaptiveEvidence`: strict dates, domains, duplicate policy, complete-day status, common interval.
2. `scoreAdaptiveEvidence`: complete-day coverage, span, weight distribution, residual error, source/conflict state.
3. `estimateWeightTrend`: time-aware EWMA or regression-ready trend series.
4. `estimateTdee`: slope over all trend points and calorie average, returning estimate plus uncertainty.
5. `updateTdee`: smoothing, relative and absolute caps, floor conflict decision.
6. `applyGoalCalories`: signed rate validation and explicit target bounds.
7. `calculateMacros`: feasibility checks and a result that says whether macro constraints changed calories.
8. `safetyPolicy`: pause/warn/clinician-review outcomes.
9. `canonicalAdaptiveEvidence`: versioned canonical payload and digest.
10. `explainRecommendation`: user-facing reasons, evidence interval, coverage, confidence, and safety state.

Use explicit configuration instead of magic numbers:

```ts
export interface AdaptiveAlgorithmConfig {
  windowDays: number;
  minimumCompleteIntakeDays: number;
  minimumWeightReadings: number;
  minimumWeightSpanDays: number;
  kcalPerKg: number;
  newEstimateWeight: number;
  maximumTdeeChangeFraction: number;
  maximumTdeeChangeKcal: number;
  minimumActivityMultiplier: number;
  minimumWeightCoverage: number;
  algorithmVersion: number;
}
```

Return a discriminated result instead of throwing for normal evidence insufficiency:

```ts
type AdaptiveResult =
  | { kind: 'recommendation'; recommendation: AdaptiveRecommendation; quality: EvidenceQuality }
  | { kind: 'ineligible'; reasons: string[]; quality: EvidenceQuality }
  | { kind: 'paused'; reason: string; quality: EvidenceQuality }
  | { kind: 'invalid'; field: string; message: string };
```

Throw for programmer/data-contract violations. Return `ineligible` or `paused` for expected user-data states so UI can explain them without treating them as crashes.

## 14. Recommended Eligibility Rules

Product-policy values require calibration, but the rule shape should be:

- Use a common interval from the first accepted weight endpoint to the last accepted endpoint.
- Require the minimum elapsed span, with the inclusive/exclusive meaning documented.
- Require minimum complete intake days inside that interval.
- Require a minimum fraction of complete days across the interval, not only a count.
- Require at least one weight in both early and late portions and enough distribution for slope estimation.
- Reject duplicate/conflicting weights or resolve them before calculation.
- Reject untrusted trend values or recompute them from scale history.
- Treat zero-calorie fasting as explicit user-confirmed data, not missing data.
- Reject or flag partial days.
- Reject future dates and birth dates after review date.
- Pause when the regression residual or endpoint disagreement exceeds configured quality limits.
- Include all criteria and actual counts in the review record.

## 15. Recommended Safety Rules

- Never persist or display non-finite recommendations.
- Do not silently bypass the TDEE change cap when applying the floor.
- Add an absolute kcal/day cap in addition to a percentage cap.
- Bound the final target and macro feasibility using product-approved policy values.
- Do not automatically adjust for pregnancy, eating-disorder risk, diabetes/weight-affecting medication, edema, acute illness, or clinician-directed plans.
- Show whether the target is floor-dominated, clamp-dominated, or evidence-dominated.
- Require explicit user acceptance for every automatic change until the estimator has production validation.
- Preserve previous target and evidence details for audit.
- Treat a model/config version change as stale evidence.

## 16. Concrete Suggested Patch

The following is a focused future patch, not applied in this session. It addresses the highest-impact defects without rewriting the whole application.

### A. Add config, goal validation, and floor conflict handling

```ts
const ADAPTIVE_CONFIG = {
  windowDays: 14,
  minimumCompleteIntakeDays: 10,
  minimumWeightReadings: 4,
  minimumWeightSpanDays: 7,
  kcalPerKg: 7700,
  newEstimateWeight: 0.5,
  maximumTdeeChangeFraction: 0.1,
  maximumTdeeChangeKcal: 250,
  minimumActivityMultiplier: 1.2,
  algorithmVersion: 2,
} as const;

function assertFinitePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${field} must be finite and positive`);
  }
}

function validateAdaptiveProfile(
  profile: AdaptiveProfileEvidence,
  reviewDate: string,
): void {
  assertFinitePositive(profile.heightCm, 'Height');
  if (!Number.isFinite(profile.goalRateKgPerWeek)) {
    throw new RangeError('Goal rate must be finite');
  }
  const age = ageOnDate(profile.birthDate, reviewDate);
  if (age < 0) throw new RangeError('Birth date cannot be after review date');
  if (!isGoalRateValid(profile.goalRateKgPerWeek, profile.goalType)) {
    throw new RangeError('Goal rate does not match goal type');
  }
}

const lowerTdee = input.previousTdee * (1 - ADAPTIVE_CONFIG.maximumTdeeChangeFraction);
const upperTdee = Math.min(
  input.previousTdee * (1 + ADAPTIVE_CONFIG.maximumTdeeChangeFraction),
  input.previousTdee + ADAPTIVE_CONFIG.maximumTdeeChangeKcal,
);
const boundedTdee = Math.min(upperTdee, Math.max(lowerTdee, smoothedTdee));
if (tdeeFloor > upperTdee) {
  throw new RangeError('Safety floor exceeds automatic TDEE change limit');
}
const proposedTdee = Math.max(tdeeFloor, boundedTdee);
```

The exact constants must be product-approved. The important behavior is that a floor conflict pauses instead of creating an undocumented jump.

### B. Replace endpoint slope with all-point OLS

```ts
function estimateSlopeKgPerDay(
  readings: AdaptiveWeightReading[],
): number {
  if (readings.length < 2) throw new RangeError('At least two weights required');
  const origin = parseLocalISO(readings[0].date).getTime();
  const xs = readings.map((row) =>
    (parseLocalISO(row.date).getTime() - origin) / (24 * 60 * 60 * 1000));
  const ys = readings.map((row) => row.trendWeightKg);
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const denominator = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
  if (denominator <= 0) throw new RangeError('Weight dates have no span');
  return xs.reduce((sum, x, index) => sum + (x - xMean) * (ys[index] - yMean), 0)
    / denominator;
}

const slopeKgPerDay = estimateSlopeKgPerDay(evidence.weights);
const dailyEnergyChange = slopeKgPerDay * ADAPTIVE_CONFIG.kcalPerKg;
const rawTdee = averageIntakeKcal - dailyEnergyChange;
```

Before this function, validate residuals and completeness. OLS is the minimal change; use Theil-Sen if observed outliers justify it.

### C. Version and complete the canonical payload

```ts
interface CanonicalAdaptiveEvidence {
  algorithmVersion: number;
  config: typeof ADAPTIVE_CONFIG;
  windowStart: string;
  windowEnd: string;
  dailyCalories: AdaptiveDailyCalories[];
  weights: AdaptiveWeightReading[];
  profile: AdaptiveProfileEvidence;
  previousTdee: number;
  previousTargetId: number;
}

function canonicalEvidence(
  payload: Omit<CanonicalAdaptiveEvidence, 'algorithmVersion' | 'config'>,
): CanonicalAdaptiveEvidence {
  return {
    algorithmVersion: ADAPTIVE_CONFIG.algorithmVersion,
    config: ADAPTIVE_CONFIG,
    windowStart: payload.windowStart,
    windowEnd: payload.windowEnd,
    dailyCalories: payload.dailyCalories
      .map((row) => ({ date: row.date, calories: row.calories }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    weights: payload.weights
      .map((row) => ({ ...row }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    profile: { ...payload.profile },
    previousTdee: payload.previousTdee,
    previousTargetId: payload.previousTargetId,
  };
}
```

Use a SHA-256 digest for this canonical JSON in the future implementation. Keep the current FNV value only as a migration field if existing local records require it.

### D. Add a final finite-output assertion

```ts
function assertFiniteRecommendation(result: AdaptiveRecommendation): void {
  for (const [field, value] of Object.entries(result)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new RangeError(`Adaptive result ${field} is not finite`);
    }
  }
}
```

Call this immediately before returning and before database persistence. This is a containment guard, not a replacement for input validation.

## 17. Immediate Test Cases

Add these first, before changing the estimator:

1. `heightCm: NaN` rejects and cannot return a recommendation.
2. Future birth date rejects.
3. `goalType: 'cut'` with positive rate rejects.
4. Ten positive days plus four missing days is ineligible without complete-day confirmation.
5. A zero-calorie fasting day follows explicit fasting policy.
6. Calories before the first weight do not affect a common-interval estimate.
7. A 0.5 kg endpoint perturbation over 13 days produces the documented raw/smoothed effect.
8. Sparse EWMA readings do not silently change the meaning of alpha with elapsed interval, or the test documents the chosen behavior.
9. BMR floor above the upper TDEE band pauses instead of jumping.
10. Same evidence with changed `previousTdee` changes the hash.
11. Same evidence with changed algorithm version changes the hash.
12. Extreme macro inputs cannot return a target outside policy bounds or must return an explicit infeasible result.
13. Two finite `1e308` calorie rows reject aggregate overflow.
14. Invalid out-of-window rows follow one documented validation policy.
15. Every recommendation number is finite.

## 18. Remaining Uncertainties

- Product has not defined whether seven elapsed days or seven inclusive calendar dates is intended.
- Product has not defined what constitutes a complete intake day or a confirmed fast.
- Product has not selected target calorie, goal-rate, age, and user-safety policy bounds.
- Product has not defined whether the hash is for cache identity, idempotency, audit, or security.
- No production dataset is available to calibrate smoothing, absolute caps, regression confidence, or water-weight handling.
- The current database path usually supplies validated enums and recomputed trend values, but the adaptive utility itself is public and does not enforce those upstream assumptions.
- Medical exclusions and clinician-review behavior require product and legal/clinical decisions, not numerical-model tuning.

## 19. Prioritized Final Report

### 1. Release recommendation

**Not ready for release as an automatic recommendation system.** Release only after the critical blockers below are addressed. A safeguarded beta may be considered with explicit acceptance, pause states, and prominent uncertainty explanations.

### 2. Critical blockers

- Non-finite and invalid profile inputs can produce persisted or displayed `NaN` values.
- Eligibility treats positive logged rows as complete intake and does not protect against missing-not-at-random bias.
- Intake average and weight-change interval can represent different dates.
- Endpoint-only trend estimation can convert ordinary water/scale noise into hundreds of kcal/day of TDEE movement.
- The BMR floor can bypass the advertised +/-10% TDEE cap by more than 75% in a realistic numeric example.
- No automatic pause/clinician-review policy exists for medically confounded weight changes.
- Evidence hash omits `previousTdee` and algorithm configuration and uses a 32-bit non-cryptographic digest.

### 3. High-priority improvements

- Add strict runtime validation for profile, evidence, goal direction, aggregates, and final outputs.
- Define complete-day, fasting-day, partial-day, and missing-day semantics.
- Calculate calorie evidence over the same interval as the weight slope.
- Replace first-last slope with all-point OLS plus residual and distribution quality checks.
- Make floor conflicts pause automatic adjustment rather than bypass the cap.
- Add absolute and relative TDEE change limits.
- Version and complete the canonical evidence payload; use SHA-256 for audit/idempotency.
- Return `ineligible` and `paused` reasons separately from programmer/data errors.

### 4. Lower-priority improvements

- Centralize duplicated thresholds and magic constants in a config object.
- Avoid normalizing the same evidence twice in one calculation.
- Store actual evidence interval and coverage metadata in adaptive reviews.
- Add confidence/explanation fields to recommendation records.
- Define numeric precision/quantization rules for persistence and hashing.
- Add targeted tests for DST, leap years, aggregate overflow, and direct utility callers.

### 5. Recommended algorithm changes

- Normalize and validate evidence first.
- Choose a common estimation interval from accepted weight readings.
- Require complete intake coverage in that interval.
- Estimate weight slope with OLS over all trend points; consider Theil-Sen if outliers are frequent.
- Compute raw TDEE with a configurable kcal/kg constant.
- Use lower new-evidence weight initially, then calibrate from production data.
- Apply relative and absolute TDEE caps.
- Pause if the BMR floor conflicts with those caps.
- Validate signed goal rate before applying the weekly adjustment.
- Make macro infeasibility explicit instead of silently changing target calories.

### 6. Recommended eligibility rules

- Minimum complete intake days inside the common weight interval.
- Minimum coverage fraction across that interval.
- Explicit fasting confirmation for zero-calorie days.
- No partial days counted as complete.
- Minimum weight count and elapsed span, with inclusive/exclusive semantics documented.
- Early and late weight coverage plus adequate distribution across the interval.
- Duplicate/conflicting measurements resolved before calculation.
- Future dates and birth-date ordering rejected.
- Regression residual and endpoint disagreement gates.
- Evidence quality and actual interval stored with every recommendation.

### 7. Recommended safety rules

- Throw/reject invalid and non-finite inputs; never persist non-finite outputs.
- Pause automatic adjustment for floor conflicts, large unexplained changes, stale evidence, or low confidence.
- Add product-approved final calorie and macro bounds.
- Require clinician oversight for pregnancy, eating-disorder risk, diabetes/weight-affecting medication, edema, acute illness, and clinician-directed plans.
- Warn when the target is floor-dominated, clamp-dominated, or based on sparse/estimated intake.
- Require explicit user acceptance until the model is validated on real data.

### 8. Test cases to add immediately

1. Invalid height, future birth date, invalid enum, contradictory goal sign, and non-finite previous TDEE.
2. Aggregate calorie overflow, negative totals, explicit zero-calorie fasting, and partial-day evidence.
3. Common-interval filtering with calories before/after weight endpoints.
4. 0.1, 0.25, 0.5, and 1 kg endpoint perturbations over 7, 10, and 13 days.
5. Sparse and irregular EWMA readings.
6. BMR floor just below, at, and above the automatic change band.
7. Extreme macro feasibility and final target bounds.
8. Hash changes for previous TDEE, config, and algorithm version.
9. Property-based row-order, irrelevant-row, calorie-shift, flat-trend, finite-output, and determinism invariants.
10. Mutation tests for signs, constants, clamps, inclusive dates, duplicate policy, missing intake, and hash fields.

### 9. Suggested code patch

Use the focused future patch in section 16: centralized config, runtime profile validation, common-interval evidence, OLS slope, floor-conflict pause, finite-output assertion, and versioned canonical evidence. Do not apply it blindly until complete-day semantics, target bounds, and medical safety policy are decided.

### 10. Remaining uncertainties

- Product meaning of seven-day span is not fixed.
- Complete-day and fasting-day definitions are not fixed.
- Numeric safety bounds and clinician-review triggers require product/clinical decisions.
- Hash purpose and migration requirements are not documented.
- No production dataset exists to calibrate smoothing, caps, confidence, or water-weight handling.
