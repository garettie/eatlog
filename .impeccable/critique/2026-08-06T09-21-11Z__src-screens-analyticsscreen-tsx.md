---
target: Analytics screen
total_score: 28
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
timestamp: 2026-08-06T09-21-11Z
slug: src-screens-analyticsscreen-tsx
---
⚠️ DEGRADED: single-context (sub-agents declined by user)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Loading, retry, busy, stale-data, and selected-range states are present; chart selection and silent background refreshes are less explicit. |
| 2 | Match System / Real World | 3/4 | Weight, pace, and logging language is direct; `TDEE` and paused recommendation reasons still require domain knowledge. |
| 3 | User Control and Freedom | 3/4 | Range choice, dismissal, retry, Keep, Accept, and add-check-in actions are clear; accepted target changes have no visible undo path. |
| 4 | Consistency and Standards | 3/4 | M3 surfaces, Onest, nutrient colors, tabular figures, and 48dp primary actions are coherent; the global-looking range has inconsistent scope and confirmation choices use 44dp controls. |
| 5 | Error Prevention | 2/4 | Stale-review detection is strong, but target acceptance lacks a prominent delta/rationale summary and the chart can imply continuity across missing scale readings. |
| 6 | Recognition Rather Than Recall | 3/4 | The legend, date range, progress copy, and one-time explainer help; goal values and range scope still require cross-referencing. |
| 7 | Flexibility and Efficiency | 3/4 | Four ranges, tap/scrub inspection, and direct weight entry support repeat use; detailed chart data is unavailable to accessibility users. |
| 8 | Aesthetic and Minimalist Design | 3/4 | The surface is calm and cohesive, but the visual emphasis favors noisy scale data and the long card stack obscures the decision hierarchy. |
| 9 | Error Recovery | 3/4 | Initial and recommendation failures have clear retries and preserve the rest of Analytics; paused-state copy is technical and resolution failures collapse into a generic state. |
| 10 | Help and Documentation | 2/4 | The dismissible intro explains trend weight and Accept semantics, but there is no durable contextual help for TDEE, eligibility, or calculation conflicts. |
| **Total** |  | **28/40** | **Good foundation; analytical hierarchy and explanation need work.** |

## Design Specificity Verdict

**LLM assessment:** Product-specific system, category-generic analytical storytelling. The adaptive recommendation states, named nutrient colors, calm M3 surface stack, and weight-versus-trend model clearly belong to Eatlog. The chart itself could still come from almost any weight tracker: two lines, three ticks, a legend, and a flat goal line. It does not yet visualize Eatlog's differentiator—the relationship between logged intake, trend weight, planned pace, and adaptive target decisions.

**Deterministic scan:** The Impeccable detector returned zero findings for both `src/screens/AnalyticsScreen.tsx` and `src/components/WeightChart.tsx`. That confirms the implementation avoids the detector's common visual anti-patterns. It does not contradict the critique: the important issues are information architecture, chart semantics, and analytical usefulness, which are outside a syntax-pattern detector's reach.

**Visual overlays:** No reliable overlay was produced. This is an Android React Native target, and the session had no Android runtime or current Analytics screenshot. Source structure, exact visual tokens, and component behavior were used as fallback evidence.

## Overall Impression

Analytics looks like a serious instrument, but it reads as a stack of reports rather than one explanation of progress. The largest opportunity is to make the screen answer a single question in order: **Am I moving toward my goal, what evidence supports that, and is there an action to take?**

## What's Working

1. **The screen handles real states, not just a happy-path mockup.** Initial loading/error, recommendation retry, stale-review recovery, insufficient evidence, intake confirmation, paused calculations, ready review, and next-review states are all represented.
2. **The visual system is disciplined.** M3 tonal surfaces, hairline borders, Onest roles, tabular figures, nutrient colors, and reduced-motion-aware range morphing make the surface coherent with the rest of Eatlog.
3. **The chart has a solid interaction base.** It morphs the existing coordinate domain, supports tap and horizontal scrubbing, clamps the tooltip, shows exact scale/trend values, and exposes a useful aggregate accessibility label.

## Priority Issues

### [P1] The chart makes noisy scale weight more important than trend weight

**Why it matters:** The screen teaches that trend weight is the decision signal, but the rendering gives the raw scale series a 2.5px high-contrast white line plus markers while trend is a 1.75px lavender line at 0.8 opacity. Users will naturally follow the louder, more volatile series and overreact to water-weight noise.

**Fix:** Make trend the primary 2.5–3px fully opaque series. Render scale as subdued individual dots, optionally with a very faint connector only in 1M. At longer ranges, reduce or aggregate scale marks while keeping the trend continuous. Add direct end labels (`Trend 72.4 kg`, `Scale 72.9 kg`) so the legend becomes secondary.

**Suggested command:** `$impeccable polish`

### [P1] The range selector looks global but changes only part of the screen

**Why it matters:** `1M / 3M / 6M / 1Y` appears directly under the screen title. Weight and Energy use it, Logging consistency remains fixed at 30 days, and Recommendation remains weekly. The UI makes users infer which cards changed after every tap.

**Fix:** Put the selector inside a named `History` group containing Weight and Energy, or place a compact range control in each affected card. Keep Logging consistency explicitly fixed at 30 days and Recommendation explicitly tied to its analysis window. Do not make the heatmap follow the selected range.

**Suggested command:** `$impeccable layout`

### [P1] The actionable recommendation is buried beneath historical reporting

**Why it matters:** A ready recommendation or intake-confirmation request is the only high-consequence task on this screen, yet it appears after Weight, Logging consistency, and Energy. On a phone, the user can miss the product's core adaptive value entirely.

**Fix:** Add a compact recommendation status directly under the header. When action is required, elevate the full Recommendation card before History; when no action is required, show a compact `Next review` status and keep details lower. Preserve Current/Proposed cards for the decision itself.

**Suggested command:** `$impeccable layout`

### [P2] The chart implies continuous scale readings and provides weak goal context

**Why it matters:** Every scale point is joined with `L`, so a ten-day gap looks like a continuous measured trajectory. The dashed goal line shows a destination but not whether the current trend is on the planned path; its value also requires reading elsewhere.

**Fix:** Break the scale path across missing days or remove the scale connector. Label the goal line directly with value and unit. Add a restrained planned-pace reference anchored to the effective plan—not an exact arrival-date prediction—and mark target-plan changes so historical behavior is interpreted against the plan active at the time.

**Suggested command:** `$impeccable clarify`

### [P2] Energy is a number card, not an analysis—and macro history is absent

**Why it matters:** Average intake, current target, and TDEE are three detached values. The average uses only food-logged days, so `2,050 kcal` can look authoritative even when only a small fraction of the range was logged. For a macro tracker, there is also no historical protein/carbs/fat adherence.

**Fix:** Replace the large average block with a range-aware intake visualization: daily bars plus a 7-day average for 1M, weekly averages for longer ranges, with target/TDEE reference lines and target-change markers. Always show coverage as `logged days / days in range` and downgrade conclusions when coverage is low. Beneath it, use three compact nutrient adherence rails for average protein, carbs, and fat against the effective targets—one row, not three more charts.

**Suggested command:** `$impeccable shape`

## Recommended Information Model

| Order | Section | What it should answer | Visualization |
|---|---|---|---|
| 1 | Adaptive status | Is there something I need to decide or confirm? | Compact status banner; expand to Current vs Proposed only when actionable |
| 2 | Progress summary | Am I moving toward the plan? | Trend change, actual vs planned weekly rate, distance to goal, evidence span |
| 3 | Weight history | Is the movement real or daily noise? | Dominant trend line, subdued scale dots, goal/planned-pace reference, target-change markers |
| 4 | Intake and macros | What behavior may explain the trend? | Range-aware calorie bars/averages with coverage plus three compact macro adherence rails |
| 5 | Logging consistency | Is the evidence reliable enough? | Keep the 30-day 10×3 food/weight blocks; add 30-day counts/percentages alongside this-week counts |

Do not add pie charts, BMI, streaks, estimated calories burned, or a precise goal-arrival date. They either add little decision value, conflict with Eatlog's non-gamified positioning, or imply certainty the data does not support.

## Cognitive Load

**Moderate: 3 of 8 checks fail.** Chunking, minimal choices, one-at-a-time decisions, and progressive disclosure are strong. The failures are hierarchy (history outranks action), grouping (the range control's scope is unclear), and working memory (users must remember weight/energy evidence while scrolling to the recommendation decision). No decision point exceeds four visible options; the range selector has four and each intake-confirmation day has three.

## Persona Red Flags

**Alex, experienced tracker:** The chart's loud scale line slows interpretation because Alex knows the trend is the useful signal. The global-looking range does not consistently control the screen, and there is no intake-versus-trend view to explain why the adaptive recommendation changed.

**Sam, accessibility-dependent user:** The chart exposes a good aggregate image label, but tap/scrub point inspection has no equivalent adjustable actions or accessible data list. The three intake-confirmation buttons are 44dp rather than the project's 48dp Android floor.

**Casey, distracted mobile user:** A ready recommendation can sit several screens below the header. Casey may check the graph, leave, and never reach Accept/Keep or the intake-confirmation task. The one-column card stack is calm but too long for the action priority.

## Minor Observations

- `TDEE estimate` should expand to `Estimated daily expenditure` or have concise inline help; the current acronym is avoidable jargon.
- The goal legend says only `Goal`; direct-label it with the actual weight to eliminate lookup.
- The progress icon is always `trending-up`, even for loss, maintenance, insufficient data, or moving away. Use status-specific symbols or omit it.
- The 1Y chart has only three x-axis labels and a fixed 176dp height. That is acceptable for overview, but long-range scale points need aggregation to avoid visual mud.
- The one-time intro is good onboarding, but durable help should remain available after dismissal through a small labeled info action.

## Questions to Consider

1. Should Analytics prioritize **adaptive decisions first**, **progress interpretation first**, or keep a neutral report order?
2. For the next pass, should scope be **chart hierarchy only**, **chart plus intake/macro visualization**, or **full screen information architecture**?
