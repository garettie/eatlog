---
target: monthly calendar showing weekly calorie surplus/deficit in Analytics
total_score: 22
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
timestamp: 2026-08-26T01-16-48Z
slug: src-components-monthlycaloriecalendar-tsx
---
## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Loading, retry, disabled navigation, and today state are visible. Weekly logging coverage is not. |
| 2 | Match between system and real world | 2 | `Under` and `over` mean intake versus target, not physiological energy deficit or surplus. TDEE appears in the same card. |
| 3 | User control and freedom | 2 | Previous and next work, but there is no jump to month or return to current month control. |
| 4 | Consistency and standards | 3 | Typography, calorie colors, and 48dp month controls fit Eatlog. The independent calendar month conflicts with the screen range. |
| 5 | Error prevention | 2 | A weekly verdict can appear after only one logged day. |
| 6 | Recognition rather than recall | 2 | Ring progress, overflow, dashes, dimmed spillover dates, future dates, and missing logs have no visible key. |
| 7 | Flexibility and efficiency | 2 | Sequential month browsing works for nearby dates but becomes tedious over a long history. |
| 8 | Aesthetic and minimalist design | 3 | The grid is restrained, but one Calories card contains metrics, a trend chart, a second time control, and the calendar. |
| 9 | Error recovery | 2 | Retry is clear, but an uncached failed month load removes the last successful grid. |
| 10 | Help and documentation | 1 | The interface never explains the weekly math, ring states, spillover inclusion, or missing-day treatment. |
| **Total** |  | **22/40** | **Acceptable. Interpretation needs work before this is trustworthy analytics.** |

## Design specificity verdict

The feature is partly authored for Eatlog. Calorie-blue completion rings, tabular figures, historical targets, Monday-to-Sunday rows, and weekly comparisons fit the Adaptive Training Instrument direction. The data model also respects target changes and full spillover weeks.

The calendar grid itself is category-standard. Its distinctive idea is the weekly comparison, yet that is the least resolved part. The right column hides coverage and says only `under` or `over`. It does not turn the data into an honest, product-specific instrument.

The unanchored review found the main semantic problem before detector evidence entered synthesis. The implementation does not calculate energy surplus or deficit. It sums logged intake minus the calorie target for logged days. Because TDEE appears above the calendar, users can still read `over` and `under` as energy balance. That interpretation is false.

The deterministic scan returned `[]`, exit code 0, with zero rule findings in `src/components/MonthlyCalorieCalendar.tsx`. This is useful but limited. The detector found no structural design-rule violations; it cannot judge whether the metric tells the truth. There were no false positives. Browser automation was unavailable, so no reliable user-visible overlay or current rendered screenshot exists.

## Overall impression

The component is compact, careful, and accessible in several source-level details. Its central claim is too confident. A row can say `400 under` after two logged days, while the UI hides that only two days contributed. The single biggest opportunity is to make the right column state exactly what was measured and how much evidence supports it.

## Cognitive load

Cognitive load is moderate, with three checklist failures.

- Visual hierarchy fails because the trend chart and independently controlled calendar share one Calories card.
- Working memory fails because users must infer several ring and opacity states without a key.
- Progressive disclosure fails because sighted users cannot select a day or week to inspect the values behind it.

No decision point exceeds four options. The range selector has four values, and month navigation has two actions.

## Emotional journey

The opening is calm and familiar: a named month, standard arrows, weekday columns, and a visible today marker. The weekly column should be the payoff. Instead, terse `over` and `under` verdicts create the main low point because they withhold logging coverage and can sound judgmental.

The feature ends without a useful conclusion or bridge to action. After the weekly rows, the user simply reaches the next card. A failed uncached month load also replaces useful context with an error instead of keeping the last successful view.

## What works

- The calendar math resolves the active historical target for each date and includes complete spillover weeks. Tests cover month boundaries, missing and future days, target changes, spillover dates, and unavailable targets.
- Month controls use 48dp targets, expose disabled state, and include loading, failure, and retry feedback.
- Calorie blue, darker overflow blue, compact calendar type, and tabular numbers follow Eatlog's visual system without decorative noise.

## Priority issues

### [P1] The calendar does not show calorie surplus or deficit

The weekly value is logged calorie intake minus the summed intake target. It is not intake minus expenditure. `Over` therefore means over the nutrition target, not an energy surplus, and `under` does not mean an energy deficit.

Why it matters: the Calories card puts TDEE near this calendar. A user can reasonably infer that the weekly column reports energy balance and make a wrong conclusion about expected weight change.

Fix: name the metric `Vs target` everywhere. Rename the section `Daily calories vs target`. If the product truly needs energy surplus or deficit, define and calculate it from a defensible expenditure estimate as a separate feature. Do not relabel the current arithmetic.

Suggested command: `$impeccable clarify`

### [P1] Weekly verdicts overstate incomplete evidence

The calculation excludes unlogged and future days, but any nonzero set of logged days can produce a weekly delta. The interface hides `loggedDays` even though the model already supplies it.

Why it matters: one logged day can become a verdict on the whole week. `Under` may also read as praise in a nutrition app, which makes the missing evidence more dangerous.

Fix: pair every delta with coverage, such as `-400 vs target` and `2/7 logged`. When coverage is weak, lead with `2/7 logged` and demote the partial delta. Use a minus or plus sign plus `vs target` instead of bare `under` or `over`.

Suggested command: `$impeccable clarify`

### [P1] One card presents two unrelated time scopes

The Analytics range selector drives the metrics and trend chart. The calendar below them browses an independent month. Both live inside the Calories card under the subtitle `Trend period`.

Why it matters: shared containment implies shared scope. After a user changes the month, the card silently describes two different periods.

Fix: move the calendar into its own `Daily calories` card with `Month view · vs target` as supporting copy. If it stays inside Calories, label the two sections `Trend` and `Calendar month` and keep each control beside the content it changes.

Suggested command: `$impeccable layout`

### [P2] Sighted and low-vision users cannot decode or inspect a day

The component exposes rich day text to screen readers but no equivalent visible detail. Ring progress, darker overflow, a dashed target-unavailable track, opacity, and an empty ring carry several meanings without a key. The fixed 22 to 36dp rings and one-line weekly result also make large text fragile.

Why it matters: a user cannot answer `What happened Tuesday?` in Analytics. Low-vision users who do not run TalkBack receive less information than screen-reader users, and large localized summaries may clip.

Fix: add one compact legend, make day cells selectable, and show a selected-day row such as `2,340 kcal · 140 over target`. Test the largest platform font setting. Allow weekly summaries to stack or wrap, and group each week into one useful accessibility summary to reduce a 50-element TalkBack traversal.

Suggested command: `$impeccable adapt`

### [P2] A failed month load erases useful context

Browsing to an uncached month sets the rendered month to null before the new data succeeds. A failure leaves only the error and Retry state.

Why it matters: the user loses the last valid comparison during a recoverable failure.

Fix: keep the last successful grid visible while the requested month loads. On failure, mark the grid as stale, name the month that failed, and keep Retry beside that message. Replace the grid only after success.

Suggested command: `$impeccable harden`

## Persona red flags

### Alex, power user

- Alex cannot jump to a month or return to the current month after browsing history. Repeated arrow presses are the only path.
- The screen range and calendar month are independent, so Alex must inspect two controls to establish scope.
- Rings are not actionable. Investigating a spike requires switching to Diary and finding the date again.

### Sam, accessibility-dependent user

- TalkBack labels are thorough, but a six-week month can expose more than 50 static nodes across weekday, day, and weekly labels.
- Fixed ring dimensions and `numberOfLines={1}` on weekly summaries risk clipping at large font scales.
- Visible meaning depends on progress, dashing, darker blue, and opacity without a textual key.

### Casey, distracted mobile user

- Casey may scan `under` as a favorable weekly result without noticing that only a few days were logged.
- Month arrows meet the touch-target requirement, but returning across many months requires repeated taps near the top of a long card.
- The chart and calendar appear to share a time period because they share a card, even when they do not.

## Minor observations

- `Week` is too vague for the right column. `Vs target` names the measure.
- `No log` should become `0/7 logged` for a week.
- Two `T` and two `S` weekday initials are conventional but slower to scan than `Tu`, `Th`, `Sa`, and `Su` if width allows.
- Spillover dates are muted but still contribute to the weekly result. A selected week's date range would make that behavior clear.
- The current-day white outline is restrained and consistent with Eatlog.

## Questions to consider

- Is the product trying to show adherence to an intake target or estimated energy balance? The current implementation supports only the first.
- Should a week with two logged days be allowed to show a positive or negative verdict at all?
- Is the calendar's main job to spot unusual days, judge weekly adherence, or navigate history? It hints at all three but fully supports none.
- If a ring looks unusual, why can the user not open that day directly?
