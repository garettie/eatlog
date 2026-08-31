---
target: analytics screen
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-30T13-29-10Z
slug: src-screens-analyticsscreen-tsx
---
# Critique: Analytics screen (src/screens/AnalyticsScreen.tsx)

Method: dual-agent (A: ses_fad2a945fffew0LYhdr4E97JSG · B: ses_fad2a47b2ffeDEh4PDKtoJUAxw)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Per-card loading/error/retry + live regions; no background-refresh indicator on focus reload |
| 2 | Match System / Real World | 3 | "Days covered", "holding" leak model vocabulary; TDEE spelled out once only |
| 3 | User Control and Freedom | 2 | "Quick check" intake card blocks plan update with no dismiss/postpone; no undo after Accept |
| 4 | Consistency and Standards | 3 | Lavender = TDEE, weight trend, adaptive badge, evidence bars, event icon — one hue, ~5 meanings; range subtitle on Calories card but not Weight |
| 5 | Error Prevention | 4 | Stale review forces re-read; resolve buttons disable in flight; intake confirmation gates bad data out |
| 6 | Recognition Rather Than Recall | 3 | Cross-chart lavender remap forces recall; `—` metrics demand inference |
| 7 | Flexibility and Efficiency | 3 | Scrub tooltips, month caching, presets; but range resets to 1M every mount (L288) |
| 8 | Aesthetic and Minimalist Design | 3 | Disciplined flat tonal; Weight card carries 5 chart layers + legend + status + 4 metrics + CTA |
| 9 | Error Recovery | 4 | "Analytics couldn't load. Your data is still on this device." — model reassurance + retry |
| 10 | Help and Documentation | 2 | "Trend" (EWMA) never glossed; `—` never explained; dashed plan line unlabeled in-chart |
| **Total** | | **31/40** | **Good** |

## Design Specificity Verdict

**LLM assessment:** Authored for Eatlog, not category-interchangeable. Adaptive-review card with evidence eligibility, intake-confirmation flow with "I fasted", scale-vs-EWMA dual series, and weekly target-adherence calendar are decisions no generic fitness dashboard makes. Generic residue: 1M/3M/6M/1Y segmented control and equal-weight card stack are dashboard boilerplate; lavender's meaning drifts per chart. Specific where it matters (plan adaptation), interchangeable in chrome.

**Deterministic scan:** detect.mjs exit 0, 0 findings across AnalyticsScreen + 8 imported components. Mechanical checks all pass: no StyleSheet.create, no hardcoded hex/px, text-compact confined to chart/calendar/nutrition metadata (21 usages), all touchables labeled with roles, reduced-motion gating on all withTiming/FadeIn, no key-remount animation hacks, no shadows/elevation. Clean floor — issues are structural/semantic, not token violations.

**Visual overlays:** unavailable — native app, no react-native-web/react-dom installed, no emulator per project constraint. Source-level evidence only.

## Overall Impression

The adaptive review card is the product — evidence tiles, fasting-aware intake confirmation, stale-data guard, explicit Keep/Use. Accessibility infrastructure is real (adjustable chart actions, live regions). The drag is semantic: the plan-status answer teleports top-to-bottom by week, lavender answers five different questions, and the range control implies scope it doesn't have.

## What's Working

1. **Adaptive review card.** Evidence tiles, intake confirmation with fasting awareness, stale-data re-read before choosing, busy labels ("Keeping…"/"Updating…"), "Past entries stay unchanged" reassurance. This is the adaptive training instrument made visible.
2. **Accessibility is infrastructure, not decoration.** Both charts expose adjustable increment/decrement with spoken values; calendar days announce full status; live regions on async states.
3. **Number and type discipline.** tabular-nums on every live figure, compact type confined to metadata, tokens everywhere — detector agrees (0 findings).

## Priority Issues

**[P0] Plan-status position instability**
- What: `recommendationCard` renders top (L994) when actionable, bottom (L1143) when paused/next-review/not-ready.
- Why: the answer to "is my plan working?" changes screen position week to week; calm states ("Next plan check · Jul 4") sit below two charts and a calendar.
- Fix: one fixed plan slot directly under the header; compact one-line rendering for non-actionable states.
- Suggested command: /impeccable layout

**[P1] Range selector lies about its scope**
- What: 1M/3M/6M/1Y control at screen top (L987-991) implies global scope; calendar has its own month pager (L961-972); heatmap fixed at 30 days.
- Why: users tap 1Y and conclude the calendar is broken.
- Fix: move the control inside/beside the trend cards it drives, or per-card range subtitles everywhere.
- Suggested command: /impeccable clarify

**[P1] Lavender semantic overload**
- What: M3.expenditure = TDEE dashed line (EnergyChart:288), weight trend stroke/fill (WeightChart:597-631), adaptive badge (L882-889), evidence bars (L252), event icon (L942).
- Why: within one screen the same hue answers four-plus questions — the working-memory failure and biggest color-discipline break in an otherwise disciplined palette.
- Fix: give weight trend its own identity (or neutral onSurface like the intake trend) and reserve lavender for expenditure/plan.
- Suggested command: /impeccable colorize

**[P2] Weight card density**
- What: 5 chart layers + 4-entry legend + status + 4 metrics + CTA in one card (L1014-1076); Actual/Plan/To goal/Expected row duplicates the status line.
- Fix: fold Actual-vs-Plan into the status row; move To goal/Expected behind disclosure.
- Suggested command: /impeccable distill

**[P2] Maintain/no-target users get `—` as their answer**
- What: goalDistanceCopy/expectedGoalDateCopy return '—' with no target or maintain (L139-153); two of four progress metrics dead. "Reached" fires with zero ceremony.
- Fix: state-appropriate copy ("Holding steady", "Goal reached Aug 3") instead of dashes.
- Suggested command: /impeccable clarify

## Persona Red Flags

**Alex (power user):** range resets to 1M every visit (L288) — re-picks every session. "Not ready yet" evidence card at the bottom means plan status requires a full scroll. `—` metrics force inference.

**Sam (accessibility-dependent):** DayRing width ≈ 30-34px (1/7 grid cell) with no horizontal hitSlop — sub-48dp horizontally (MonthlyCalorieCalendar ~L125-148). Week deviation numbers are 11px compact, right-aligned. Rings encode progress visually-only, though status labels recover it for screen readers.

**Casey (distracted, one-handed):** glanceable verdict ("On pace" / n/7) sits mid-screen or below; first viewport is title + range control + sometimes plan card. Day-detail strip appears far below the tapped ring — eyes must travel.

## Minor Observations

- "Total Daily Energy Expenditure (TDEE)" wraps awkwardly in a min-w-[112px] metric (L1105); "TDEE" suffices after first use.
- Literal `bg-white`/`text-m3-on-primary` on buttons (L678, L928, L1007) bypasses the token.
- "Use Add to start your intake trend" (L1113) references the FAB with no inline action — dead copy on Analytics.
- No visible scrub affordance; charts look static until touched.
- "Current target" appears three times on one screen (L907, L1103, L947) — signals missing IA.
- Heatmap title uses min-h-[32px] justify-end alignment hack — fragile across font scales.

## Questions to Consider

1. Why does the answer to "is my plan working?" teleport between top and bottom depending on the week?
2. If lavender means five things, what is the legend actually teaching?
3. What is this screen for a user maintaining weight — half its metrics answer '—'?
4. If the first viewport could show only one sentence — "On track / Needs attention" + why — what below the fold would you miss?
5. The range control sits above content it doesn't control. What would users say it controls in a hallway test?
