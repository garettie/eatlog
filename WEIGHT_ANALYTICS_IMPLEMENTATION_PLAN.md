# Weight Logging, Analytics, and Adaptive Recommendations

> Implementation plan for Marco. This document is prescriptive: decisions below are locked unless the user changes them before implementation.

## 1. Outcome and scope

Ship one complete local-first feature chain:

1. Persist the preferred weight unit.
2. Create and update daily scale-weight readings from the central FAB sheet.
3. Recompute every affected EWMA trend value deterministically.
4. Reflect weight changes immediately on Today and Analytics.
5. Replace the Analytics placeholder with weight, energy, progress, and recommendation surfaces.
6. Generate explainable weekly calorie recommendations from a trailing 14-day evidence window.
7. Require explicit Accept or Keep Current; never change targets silently.

Excluded from this increment:

- deleting weight entries;
- cloud sync or backup;
- Health Connect, wearables, steps, or activity imports;
- monthly recommendation cadence;
- manual target editing;
- settings beyond changing the weight unit inside weight entry;
- notifications.

Weekly is the only recommendation cadence. `4W`, `3M`, and `6M` are analytics ranges, not alternative recommendation schedules.

## 2. Non-negotiable data and UX rules

- Store all weights in kilograms. Convert only at UI boundaries.
- Persist dates as local calendar strings in `YYYY-MM-DD`; do not derive them with UTC `toISOString()`.
- Keep one `weight_logs` row per date.
- A same-date save updates the existing row.
- The first chronological trend weight equals its scale weight.
- Every later trend uses `0.15 * scale + 0.85 * previous trend`.
- Backdated changes recompute that row and all later rows atomically.
- Missing dates remain missing. Never create zero-weight or zero-intake rows.
- All weight and calorie figures use tabular numerals.
- Use the existing Material 3 tokens, NativeWind, Inter fonts, shared motion timings, and reduced-motion gates.
- Use the custom `DateSelector`; the native date-picker package has been removed.
- Android Back and discard behavior must match the existing sheet-state machine.
- SQLite reads within a screen remain serialized because concurrent prepared statements have caused Android bridge races.

## 3. Exact shared types and date semantics

Add these types in `src/db/database.ts`:

```ts
export type WeightUnit = 'kg' | 'lb';
export type AdaptiveReviewStatus =
  | 'pending'
  | 'accepted'
  | 'kept'
  | 'superseded';
```

Extend `Profile`:

```ts
weight_unit: WeightUnit;
```

Date ranges are inclusive.

- `4W`: today and the preceding 27 calendar days.
- `3M`: `addCalendarDays(addCalendarMonths(today, -3), 1)`.
- `6M`: `addCalendarDays(addCalendarMonths(today, -6), 1)`.
- Adaptive window: review date and the preceding 13 calendar days.

Add date-only helpers in `src/utils/calendar.ts` rather than repeating `Date` arithmetic:

```ts
parseLocalISO(dateISO: string): Date
formatLocalISO(date: Date): string
addCalendarDays(dateISO: string, days: number): string
addCalendarMonths(dateISO: string, months: number): string
calendarDaysBetween(startISO: string, endISO: string): number
```

Invalid ISO inputs throw. Calculations use local midnight and integer calendar-day differences, not elapsed milliseconds across DST boundaries.

Create `src/utils/weightUnits.ts`:

```ts
toKilograms(value: number, unit: WeightUnit): number
fromKilograms(weightKg: number, unit: WeightUnit): number
parseWeightInput(text: string): number | null
formatWeight(weightKg: number, unit: WeightUnit): string
```

- Conversions do not round.
- `parseWeightInput` accepts one `.` or `,`, rejects mixed/multiple separators and more than two decimal places, and returns `null` for incomplete/non-finite input.
- `formatWeight` converts from kilograms and returns one decimal place without a unit suffix.
- `saveWeightLog` performs the only canonical rounding: kilograms to three decimal places.

## 4. Database migrations

### 4.1 Migration sequencing

Raise `DATABASE_VERSION` from `1` to `3`. Refactor `initDatabase()` into sequential migrations:

```text
0 -> 1: existing base schema creation
1 -> 2: preferred weight unit
2 -> 3: adaptive reviews and supporting indexes
```

Run each migration through `withExclusiveTransactionAsync`. Advance `PRAGMA user_version` only after that migration succeeds. A database newer than the supported version remains a hard error.

Fresh databases must run all three migrations. Existing version-1 beta databases must retain every row.

### 4.2 Version 2

```sql
ALTER TABLE profile
ADD COLUMN weight_unit TEXT NOT NULL DEFAULT 'kg'
CHECK (weight_unit IN ('kg', 'lb'));
```

Existing profiles default to kilograms because their original onboarding selection cannot be reconstructed. The weight-entry sheet exposes the unit control so the user can correct and persist it during the first weigh-in.

Update `insertProfile()` to accept `weight_unit`. Onboarding maps:

- `metric -> kg`
- `imperial -> lb`

Add:

```ts
updateProfileWeightUnit(unit: WeightUnit): Promise<void>
```

It updates only profile row `id = 1`.

### 4.3 Version 3

Create:

```sql
CREATE TABLE adaptive_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_date TEXT NOT NULL UNIQUE,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  intake_day_count INTEGER NOT NULL,
  weight_log_count INTEGER NOT NULL,
  average_intake_kcal REAL NOT NULL,
  start_trend_weight_kg REAL NOT NULL,
  end_trend_weight_kg REAL NOT NULL,
  elapsed_days INTEGER NOT NULL,
  raw_tdee REAL NOT NULL,
  previous_tdee REAL NOT NULL,
  proposed_tdee REAL NOT NULL,
  previous_target_calories REAL NOT NULL,
  previous_target_protein_g REAL NOT NULL,
  previous_target_fat_g REAL NOT NULL,
  previous_target_carbs_g REAL NOT NULL,
  proposed_target_calories REAL NOT NULL,
  proposed_target_protein_g REAL NOT NULL,
  proposed_target_fat_g REAL NOT NULL,
  proposed_target_carbs_g REAL NOT NULL,
  evidence_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'accepted', 'kept', 'superseded')
  ),
  resulting_target_id INTEGER REFERENCES daily_targets(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX idx_weight_logs_date
ON weight_logs(log_date);

CREATE INDEX idx_food_logs_date
ON food_logs(log_date);

CREATE INDEX idx_daily_targets_effective_date
ON daily_targets(effective_date);

CREATE INDEX idx_adaptive_reviews_status_date
ON adaptive_reviews(status, review_date);
```

Do not add a unique index to `daily_targets` in this increment. Adaptive resolution prevents duplicate acceptance transactionally, while target history remains compatible with any later same-day manual-target feature.

`AdaptiveReview` mirrors every `adaptive_reviews` column using the repository’s existing snake-case database-row convention.

## 5. Pure calculation modules

### 5.1 Weight trend

Create `src/utils/weightTrend.ts`:

```ts
interface ScaleReading {
  logDate: string;
  scaleWeightKg: number;
}

interface TrendReading extends ScaleReading {
  trendWeightKg: number;
}

computeWeightTrend(readings: ScaleReading[]): TrendReading[]
```

Rules:

- Sort a copy by `logDate` ascending.
- Reject duplicate dates.
- Reject non-finite or non-positive weights.
- First trend equals first scale value.
- Later values use alpha `0.15`.
- Round stored trend values to three decimal places after each EWMA step so recomputation is stable across devices.
- Do not mutate the input.

Add:

```ts
computeNormalizedWeeklyRate(
  start: Pick<TrendReading, 'logDate' | 'trendWeightKg'>,
  end: Pick<TrendReading, 'logDate' | 'trendWeightKg'>
): number | null
```

Return `null` when the endpoints are the same date. Otherwise:

```text
(end trend - start trend) / elapsed calendar days * 7
```

### 5.2 Macro allocation

Refactor `src/utils/calculations.ts` without changing onboarding output:

```ts
calculateMacrosForCalories({
  targetCalories,
  goalType,
  proteinPreference,
  weightKg,
}): MacroTargets
```

`calculateTargets()` continues to compute the goal-adjusted calorie target, then delegates macro allocation to the new helper.

Adaptive calculations use `calculateMacrosForCalories()` after applying the calorie floor. Protein/fat/carbohydrate rules remain the existing rules.

### 5.3 Adaptive calculation

Create `src/utils/adaptiveRecommendations.ts`. It contains no React or SQLite imports.

Eligibility for a review date:

- Window is `reviewDate - 13 days` through `reviewDate`.
- At least 10 distinct dates with total logged calories greater than zero.
- At least four weight rows inside the window.
- At least one weight in window days 1–4.
- At least one weight in window days 11–14.
- The earliest and latest selected weights are at least seven calendar days apart.

Use the earliest weight row in the window as the start and the latest as the end.

Average intake:

```text
sum of daily calorie totals / number of food-logged dates
```

Missing food dates are excluded, never treated as zero. A food-logged date means its summed calories are greater than zero.

Calculation:

```text
weight_change_kg = end_trend - start_trend
daily_energy_change = weight_change_kg * 7700 / elapsed_days
raw_tdee = average_intake - daily_energy_change
smoothed_tdee = 0.70 * raw_tdee + 0.30 * previous_tdee
tdee_floor = 1.20 * current_bmr
proposed_tdee = max(
  tdee_floor,
  clamp(smoothed_tdee, previous_tdee * 0.90, previous_tdee * 1.10)
)
unfloored_target = proposed_tdee + goal_rate_kg_per_week * 7700 / 7
proposed_target_calories = max(tdee_floor, unfloored_target)
```

Current BMR uses:

- profile sex and height;
- age on the review date;
- the ending trend weight.

Round TDEE and calories to whole kcal. Round macros to one decimal place using the shared macro allocator.

The evidence hash is a stable FNV-1a hash of this ordered JSON payload:

```ts
{
  windowStart,
  windowEnd,
  dailyCalories: [{ date, calories }],
  weights: [{ date, scaleWeightKg, trendWeightKg }],
  profile: {
    sex,
    heightCm,
    birthDate,
    goalType,
    goalRateKgPerWeek,
    proteinPreference,
  },
  previousTargetId,
}
```

The hash detects changed evidence; it is not a security feature.

## 6. Weight database API

Replace direct feature use of `insertWeightLog()` with:

```ts
interface SaveWeightResult {
  log: WeightLog;
  wasUpdate: boolean;
  previousScaleWeightKg: number | null;
}

saveWeightLog(params: {
  logDate: string;
  scaleWeightKg: number;
}): Promise<SaveWeightResult>
```

Inside one exclusive transaction:

1. Validate `logDate` format and `20 <= scaleWeightKg <= 500`.
2. Read the existing row for the date.
3. `INSERT ... ON CONFLICT(log_date) DO UPDATE` only the scale value.
4. Read every weight row ordered by date ascending.
5. Run `computeWeightTrend`.
6. Update `trend_weight_kg` for every row from the changed date onward. Recomputing the entire pure sequence is allowed; database writes start at the changed date.
7. Return the saved row and previous scale value.

Replace onboarding’s `insertWeightLog()` call with `saveWeightLog()` in Phase A, then remove `insertWeightLog()`. The final code has one public weight-write path.

Add:

```ts
getWeightLogByDate(dateISO: string): Promise<WeightLog | null>
getLatestWeightLogOnOrBefore(dateISO: string): Promise<WeightLog | null>
getEarliestWeightLogAfter(dateISO: string): Promise<WeightLog | null>
getWeightLogsByDateRange(startISO: string, endISO: string): Promise<WeightLog[]>
getNearestWeightNeighbors(
  dateISO: string
): Promise<{ before: WeightLog | null; after: WeightLog | null }>
```

All range results are ascending.

Large-jump warning:

- Compare the proposed kilograms with both nearest neighboring readings, excluding the same-date row.
- A neighbor is suspicious when the absolute difference is greater than both `5 kg` and `5%` of that neighbor.
- Any suspicious neighbor triggers one confirmation alert.
- Copy: `This is a large change from a nearby check-in. Save it anyway?`
- Buttons: `Cancel` and `Save anyway`.
- It warns but never permanently blocks a valid 20–500 kg value.

## 7. FAB sheet integration

### 7.1 State contract

Extend `FoodSheetStateKey`:

```ts
| 'weight-input'
```

Extend `pendingAction`:

```ts
| 'weight'
```

Do not rename the sheet architecture during this feature; that would be an unrelated refactor.

Add `onWeight` to `EntryMethodState`. Render Weight last, immediately after Search:

- icon: `monitor-weight`;
- label: `Weight`;
- subtitle: `Log today or add a past check-in`.

Weight entry reached from the normal FAB pushes `entry` into Back history. Android Back returns to entry.

Add `openWeight()` in `TabNavigator` for dashboard/analytics shortcuts. Because it bypasses entry, it must set `fromBar: true`, reset history, and open `weight-input` directly. Cancel and Android Back close the sheet.

Add the `weight-input` snap point:

```text
['55%']
```

Do not enable dynamic sizing for this state.

### 7.2 `WeightInputState`

Create `src/components/sheet-states/WeightInputState.tsx`.

Props:

```ts
interface WeightInputStateProps {
  onLogComplete: (result: SaveWeightResult) => void;
}
```

UI:

1. Title: `Log weight`.
2. Date field using `DateSelector`.
3. Large direct decimal input with unit suffix.
4. `kg` / `lb` segmented control.
5. Primary button: `Log weight` for a new date, `Update weight` for an existing date.
6. Inline validation or save error.

Date bounds:

- minimum: profile birth date;
- maximum: today.

Initial state:

- date defaults to today;
- unit defaults to `profile.weight_unit`;
- if today exists, prefill it and show update copy;
- otherwise prefill the latest reading on or before today;
- if none exists, use the earliest later reading;
- if no rows exist, leave the input blank.

When the selected date changes:

- exact date exists: load that value and show update copy;
- otherwise use latest on-or-before;
- otherwise earliest after;
- the load becomes the new clean baseline.

Input rules:

- accept `.` or `,` as the decimal separator;
- display one decimal place when prefilled;
- permit at most two user-entered decimal places;
- convert pounds to kilograms and round canonical storage to three decimals;
- validate canonical kilograms against `20–500`;
- disable save while loading or saving.

Changing the unit:

- converts the current valid input rather than reinterpreting it;
- persists `profile.weight_unit` only after a successful weight save;
- dashboard and analytics reflect the new unit after the shared refresh.

Discard guard is dirty when date, value, or unit differs from the clean baseline. Successful save clears dirty state before closing.

The custom date selector opens above the bottom sheet. Its Cancel preserves the draft date; Set date loads the selected date as described above.

### 7.3 Completion and refresh

Add:

```ts
interface WeightLoggedInfo {
  logDate: string;
  scaleWeightKg: number;
  wasUpdate: boolean;
}
```

`FoodSheetContent` receives `onWeightLogged`, closes the sheet after success, and forwards the result.

Rename `logVersion` in `TabNavigator` and screen props to `dataVersion` because it now invalidates food, weight, target, and review data.

On weight completion:

- increment `dataVersion`;
- show `Weight logged` or `Weight updated`;
- no Undo action;
- close the sheet.

Pass `dataVersion` to Today, Diary, and Analytics. Each overlay-visible screen reloads on a version change. Focus reload remains in place.

## 8. Shared weight chart

Create `src/components/WeightChart.tsx` using the installed `react-native-svg`, not `LineChart`.

Reason: the existing chart spaces entries by array index. Weight analytics requires calendar-accurate gaps without fabricated missing values.

Props:

```ts
interface WeightChartProps {
  logs: WeightLog[];
  startDate: string;
  endDate: string;
  height: number;
  showXAxisLabels?: boolean;
}
```

Rendering:

- Measure width with `onLayout`.
- X coordinate is `(days from start / total range days) * plot width`.
- Y domain includes every scale and trend value, with 5% padding and a minimum 1 kg range.
- Draw one lavender SVG path through observed trend points.
- Draw one neutral circle at each observed scale weight.
- Do not draw a trend path with fewer than two readings.
- Do not invent points between dates; the path only connects stored observations.
- X labels: start, midpoint, and end only when `showXAxisLabels`.
- Accessibility label summarizes reading count, latest scale, latest trend, and range change.
- Reduced motion renders immediately; otherwise path and point opacity may enter over 250ms. Do not key-remount the chart.

Use this component on Today and Analytics.

## 9. Today dashboard

Extend `DashboardScreenProps`:

```ts
onOpenWeight: () => void;
dataVersion: number;
```

Query the last 30 calendar days with `getWeightLogsByDateRange`, not the latest 30 rows.

Display preferred units everywhere:

- kg: one decimal;
- lb: one decimal after conversion.

Card states:

### Zero readings

- Copy: `No weight check-ins yet`.
- Secondary copy: `Log weight to start your trend.`
- Button: `Log weight`, calling `onOpenWeight`.

### One reading

- Show scale weight and date.
- Trend weight may equal scale weight but label it `Starting weight`.
- Do not show a line, change, or weekly rate.
- Secondary action: `Add check-in`.

### Two or more readings

- Render `WeightChart`.
- Show latest trend weight.
- Show latest scale weight and its date.
- Show seven-day rate only when a reference reading exists 4–10 days before the latest reading.
- Select the reference closest to exactly seven days; ties choose the earlier date.
- Normalize with the actual elapsed days.
- Otherwise show `More check-ins needed` instead of a numeric rate.

The card press navigates to Analytics. Its explicit Log/Add action opens weight entry.

## 10. Analytics screen

Create `src/screens/AnalyticsScreen.tsx` and replace only the Analytics placeholder in `TabNavigator`. Sync remains a placeholder.

Props:

```ts
interface AnalyticsScreenProps {
  onOpenWeight: () => void;
  dataVersion: number;
}
```

Use `SafeAreaView`, one vertical `ScrollView`, and serialized database reads. Reload on focus and `dataVersion`.

### 10.1 Range selector

Use `SegmentedControl` with `4W`, `3M`, and `6M`; default `4W`.

Changing range:

- shows the previous data until the serialized reload completes;
- disables repeated range changes while loading;
- does not show a full-screen spinner after initial load.

### 10.2 Weight card

Query weights within the selected inclusive range.

Show:

- shared calendar-accurate chart;
- latest scale and trend;
- trend change from earliest to latest observation;
- normalized weekly rate using actual endpoint dates;
- selected unit.

States:

- zero: Log Weight CTA;
- one: latest/starting value with no change or rate;
- two+: full metrics.

### 10.3 Energy card

Query `getMacrosByDateRange` and the daily target effective today.

Show:

- average intake across food-logged dates;
- logging coverage as `logged days / total range days` and a percentage;
- current TDEE estimate;
- current calorie target.

No logged dates:

- average displays `—`;
- coverage displays `0 / N days`;
- never display `0 kcal average`.

### 10.4 Progress card

Actual rate is the Weight card’s normalized weekly trend rate.

Desired rate is `profile.goal_rate_kg_per_week`.

Classification:

- insufficient: fewer than two observations or endpoint span under seven days;
- maintain on pace: `abs(actual) <= 0.10 kg/week`;
- non-maintain on pace: same direction and absolute error is at most `max(0.10, abs(desired) * 0.25)`;
- moving away: actual has the opposite sign and `abs(actual) > 0.10`;
- faster than planned: same direction and `abs(actual) > abs(desired) + tolerance`;
- slower than planned: every other sufficient non-maintain result.

Copy stays descriptive, not prescriptive. Do not claim causality or recommend activity changes.

### 10.5 Recommendation card

States:

- `Collecting data`: show exactly which eligibility counts are missing.
- `Ready for review`: the user-facing representation of a persisted `pending` review; show current/proposed calories and macros, the analysis window, Accept, and Keep Current.
- `Next review`: show the earliest eligible review date after a resolved review and the latest accepted/kept decision.

Do not show an “adaptive” badge before the first accepted adaptive target.

## 11. Analytics database queries

Add:

```ts
getDailyCaloriesByDateRange(
  startISO: string,
  endISO: string
): Promise<Array<{ log_date: string; calories: number }>>

getDailyTargetsByDateRange(
  startISO: string,
  endISO: string
): Promise<DailyTarget[]>

getLatestAdaptiveReview(): Promise<AdaptiveReview | null>
getPendingAdaptiveReview(): Promise<AdaptiveReview | null>
```

Daily calories group by `log_date`, include only sums greater than zero, and order ascending.

Analytics screen queries profile, range weights, range calories, today’s target, and recommendation state sequentially.

## 12. Recommendation persistence and resolution

Create `src/services/adaptiveReviews.ts`.

Public API:

```ts
interface AdaptiveEligibility {
  intakeDayCount: number;
  requiredIntakeDayCount: 10;
  weightLogCount: number;
  requiredWeightLogCount: 4;
  hasEarlyWeight: boolean;
  hasLateWeight: boolean;
  endpointSpanDays: number;
  requiredEndpointSpanDays: 7;
}

type AdaptiveReviewState =
  | {
      kind: 'collecting';
      reviewDate: string;
      eligibility: AdaptiveEligibility;
    }
  | {
      kind: 'ready';
      review: AdaptiveReview;
    }
  | {
      kind: 'next-review';
      nextReviewDate: string;
      latestDecision: AdaptiveReview;
    };

getAdaptiveReviewState(reviewDate: string): Promise<AdaptiveReviewState>

type ResolveAdaptiveReviewResult =
  | { status: 'resolved'; target: DailyTarget | null }
  | { status: 'stale'; review: AdaptiveReview };

acceptAdaptiveReview(
  reviewId: number
): Promise<ResolveAdaptiveReviewResult>

keepAdaptiveReview(
  reviewId: number
): Promise<ResolveAdaptiveReviewResult>
```

Internal evidence loaders accept a `SQLiteDatabase` argument so the same queries can run on the dedicated transaction connection during resolution.

`nextReviewDate` is exactly seven calendar days after the latest accepted or kept `review_date`.

### 12.1 Review generation

`getAdaptiveReviewState`:

1. Return and refresh an existing pending review.
2. Find the latest accepted or kept review.
3. If fewer than seven calendar days have passed, return next-review state.
4. Load the 14-day evidence and evaluate eligibility.
5. If ineligible, return exact missing counts/coverage.
6. If eligible, calculate and persist one pending review for `reviewDate`. If that date already has a `superseded` row, update that row back to `pending` with the new evidence instead of inserting.
7. Handle a concurrent unique-key conflict by reading the row that won.

Pending reviews are refreshed in place before display:

- rebuild evidence;
- if still eligible and the hash changed, update all calculated fields and hash;
- if no longer eligible, mark it `superseded` and return collecting state.

### 12.2 Accept

Inside one exclusive transaction:

1. Read the pending review.
2. Rebuild its evidence through the transaction connection and calculate its current hash.
3. If the hash changed, do not accept; refresh the review and return a typed stale-review result so the UI requires a second explicit tap.
4. Confirm status is still `pending`.
5. Insert one `daily_targets` row effective on the local current date with `calculation_method = 'adaptive'`.
6. Update the review to `accepted`, set `resolved_at`, and set `resulting_target_id`.
7. Return the inserted target.

Only the first concurrent resolution may update `WHERE id = ? AND status = 'pending'`. A zero-row update is treated as already resolved and does not insert another target.

After success, increment `dataVersion` and show `New targets accepted`.

### 12.3 Keep Current

Inside one exclusive transaction:

1. Perform the same evidence and pending-status checks.
2. Update status to `kept` and set `resolved_at`.
3. Do not insert a target.

After success, increment `dataVersion` and show `Current targets kept`.

## 13. Error, loading, and accessibility behavior

- Initial screen failure: existing full-screen retry pattern.
- Card-level recommendation failure: recommendation card shows Retry; other analytics remains usable.
- Weight save failure: keep sheet open, preserve input, show assertive inline error.
- Date/profile prefill failure: keep sheet open and show Retry; do not guess a unit.
- All buttons expose role, label, disabled/busy state.
- Weight input exposes the active unit in its accessibility label.
- Chart has one concise summary label and does not expose every SVG primitive.
- Set-date, Save anyway, Accept, and Keep Current remain at least 48dp.
- Reduced motion sets durations to zero; it does not remove content.

## 14. Automated tests

Add `tsx` as the only new development dependency and scripts:

```json
{
  "test": "tsx --test src/utils/*.test.ts",
  "typecheck": "tsc --noEmit"
}
```

Use `node:test` and `node:assert/strict`.

Required pure tests:

### `weightTrend.test.ts`

- first value equals scale;
- multiple EWMA steps match three-decimal expected values;
- unsorted input becomes chronological;
- duplicate dates throw;
- backdated input produces the same full output as a fresh chronological run;
- normalized weekly rate uses actual elapsed days;
- same-date rate returns null.

### `calendar.test.ts`

- local ISO round-trip;
- leap day;
- month subtraction from a 29th/30th/31st;
- inclusive range boundaries;
- DST transition does not alter calendar-day count.

### `weightUnits.test.ts`

- kg and lb conversions are reciprocal within floating-point tolerance;
- `.` and `,` parse identically;
- mixed separators, extra decimals, incomplete values, and non-finite values fail;
- formatting produces one decimal place;
- canonical save rounding produces three-decimal kilograms.

### `adaptiveRecommendations.test.ts`

- each eligibility failure independently;
- exact 10-day/4-weight boundary passes;
- endpoint coverage is enforced;
- weight gain lowers inferred TDEE relative to equal intake;
- weight loss raises inferred TDEE relative to equal intake;
- ±10% clamp;
- BMR expenditure floor;
- calorie target floor;
- cut/maintain/bulk goal adjustments;
- deterministic evidence hash;
- missing food dates are excluded rather than zero-filled.

Database behavior cannot be reliably exercised through Node because `expo-sqlite` is native. Cover it with the device migration matrix below.

## 15. Device and migration verification matrix

Before calling the feature complete:

1. Fresh install creates schema version 3 and completes onboarding.
2. Version-1 database migrates without losing profile, food, meals, weights, targets, or cache.
3. Existing profile defaults to kg and can switch to lb through weight entry.
4. New onboarding persists kg/lb selection.
5. Today weight insert succeeds.
6. Same-date save updates rather than duplicates.
7. Backdated insert recomputes every later trend.
8. Leap-day and month-boundary dates save correctly.
9. Future date cannot be selected.
10. Suspicious jump requires confirmation but can be saved.
11. FAB Back returns to entry; dashboard shortcut Back closes.
12. Keyboard dismissal and discard guard work.
13. Today and Analytics refresh without tab switching.
14. Zero/one/many weight states render correctly.
15. Sparse dates preserve true chart gaps.
16. kg/lb displays agree after conversion.
17. Recommendation remains collecting below thresholds.
18. Eligible evidence creates one pending review.
19. Changed evidence refreshes or supersedes pending review.
20. Accept creates exactly one adaptive target.
21. Keep creates no target.
22. A resolved review blocks another for seven calendar days.
23. Force-stop/relaunch preserves all data and review state.
24. Reduced-motion behavior contains no timed transitions.

Run:

```bash
npm test
npm run typecheck
npx expo config --type public
npx expo export --platform android --dev
```

Then perform physical Android verification. Do not claim visual completion without it.

## 16. File-by-file change map

Modify:

- `src/db/database.ts`
  - migrations 2/3, types, weight APIs, analytics queries, review persistence helpers;
- `src/utils/calendar.ts`
  - exact calendar arithmetic;
- `src/utils/calculations.ts`
  - shared macro allocator and review-date age/BMR support;
- `src/screens/OnboardingScreen.tsx`
  - save preferred weight unit and use the single weight-write API;
- `src/components/sheet-states/EntryMethodState.tsx`
  - Weight action;
- `src/components/sheet-states/FoodSheetContent.tsx`
  - state key, transition, completion callback;
- `src/navigation/TabNavigator.tsx`
  - openWeight, dataVersion, Analytics screen, completion toasts, snap point;
- `src/screens/DashboardScreen.tsx`
  - new states, unit formatting, shared chart, shortcut;
- `package.json` / `package-lock.json`
  - test scripts and `tsx`;
- `macro-tracker-mvp-spec.md` and `PRODUCT.md`
  - update shipped/deferred status only after each phase passes verification.

Create:

- `src/components/sheet-states/WeightInputState.tsx`;
- `src/components/WeightChart.tsx`;
- `src/screens/AnalyticsScreen.tsx`;
- `src/utils/weightTrend.ts`;
- `src/utils/weightUnits.ts`;
- `src/utils/adaptiveRecommendations.ts`;
- `src/services/adaptiveReviews.ts`;
- corresponding pure `.test.ts` files.

Do not modify:

- Sync placeholder behavior;
- food search/scan services;
- Diary layout except the `dataVersion` prop rename;
- native dependencies;
- iOS behavior.

## 17. Implementation order and phase gates

### Phase A — Foundation

1. Add tests and pure calendar/trend/adaptive modules.
2. Add migrations 2/3.
3. Persist preferred unit.
4. Add atomic `saveWeightLog` and range queries.

Gate: tests/typecheck pass; fresh and v1 databases migrate without row loss.

### Phase B — Weight entry

1. Add sheet state and entry action.
2. Build `WeightInputState`.
3. Add jump confirmation and unit persistence.
4. Wire completion, toast, and `dataVersion`.

Gate: insert/update/backdate/Back/discard/refresh matrix passes on Android.

### Phase C — Weight presentation

1. Build shared SVG chart.
2. Replace Today’s weight card states.
3. Add preferred-unit formatting and rate calculation.

Gate: zero/one/sparse/many datasets render correctly on Android.

### Phase D — Analytics

1. Create screen and range queries.
2. Add Weight, Energy, and Progress cards.
3. Wire focus and overlay refresh.

Gate: all ranges, empty states, calculations, and calendar spacing verify.

### Phase E — Adaptive reviews

1. Add generation service and persistence.
2. Add recommendation-state UI.
3. Add Accept/Keep transactions and stale-evidence handling.
4. Update product/spec documentation.

Gate: deterministic tests, cadence, idempotency, stale evidence, persistence, and physical-device flows pass.

No later phase starts with a failing earlier gate.
