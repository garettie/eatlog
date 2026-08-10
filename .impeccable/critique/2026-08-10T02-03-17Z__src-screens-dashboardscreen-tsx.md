---
target: dashboard
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-10T02-03-17Z
slug: src-screens-dashboardscreen-tsx
---
Method: dual-agent (A: 13b1d99c · B: b3f8e945)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 2 | Initial loading is visible, but a background refresh failure can leave stale totals on screen without warning. |
| 2 | Match System / Real World | 3 | Nutrition language is natural; `Today` versus `Dashboard` and macro-overflow visuals weaken the model. |
| 3 | User Control and Freedom | 3 | Retry, toggle, tabs, and Add are clear; the latest-entry card cannot open the represented entry/date. |
| 4 | Consistency and Standards | 3 | Shared M3 surfaces, nutrient colors, typography, and motion are cohesive; naming and one navigation promise diverge. |
| 5 | Error Prevention | 3 | Progress values are clamped and calorie overage is explicit, but stale refresh state is not prevented from reading as current. |
| 6 | Recognition Rather Than Recall | 2 | Main actions are labeled; the recent-food card lacks a `Last logged` context label and requires users to infer destination behavior. |
| 7 | Flexibility and Efficiency | 3 | Persistent Add, camera/gallery/describe paths, segmented values, and responsive two-pane behavior support fast use. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained and focused, but the ring duplicates figures and the black overflow mask adds interpretive noise. |
| 9 | Error Recovery | 1 | Fatal load has Retry; nonfatal refresh failure has no visible or announced recovery. |
| 10 | Help and Documentation | 2 | First-use estimate copy helps; ongoing interpretation of remaining/overflow states is unsupported. |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

**Authored for Eatlog, not category-interchangeable.** The nutrient-specific palette, scanner-first first-use state, logging-consistency heatmaps, tabular figures, Onest typography, tonal M3 elevation, and restrained motion create a credible adaptive training instrument. The generic `Dashboard` title inside the `Today` destination and the missing specified profile shortcut reduce specificity, but the surface is still materially stronger than a generic fitness dashboard.

**Deterministic scan:** `detect.mjs` returned exit code 0 and `[]`: 0 findings, no rules, locations, or false positives. That means the screen avoids the detector's known anti-patterns; it does not invalidate the source-derived responsive, behavioral, or accessibility issues below.

**Visual overlays:** unavailable. This is an Android-native React Native screen and the session had no usable native runtime/browser target with mutable script injection. No live server was started and no user-visible overlay exists. Fallback evidence was the clean CLI detector plus source inspection.

## Overall Impression

The dashboard has a clear point of view: calm, premium, instrument-like, and free of gamification noise. Daily nutrition owns the hierarchy and the first-meal funnel is excellent. The biggest opportunity is to make the surface as trustworthy and precise in failure and over-target states as it already looks in the happy path.

## What's Working

1. **A coherent, product-specific visual system.** Shared tonal cards, nutrient-only semantic color, tabular figures, Onest roles, and restrained white primary actions reinforce the product rather than decorate it (`src/components/Card.tsx:9-18`, `src/theme/tokens.ts:2-56`).
2. **A strong first-use logging funnel.** Camera leads, gallery and description remain credible fallbacks, and the copy sets the right expectation that estimates are reviewed before logging (`src/screens/DashboardScreen.tsx:505-550`).
3. **Good data compression without gamification.** The calorie ring and 30-day logging summaries provide a fast read while staying aligned with the serious-instrument positioning (`src/screens/DashboardScreen.tsx:374-476`, `src/screens/DashboardScreen.tsx:553-584`).

## Cognitive Load

**Moderate: 3/8 checklist failures.** Single focus, chunking, grouping, one-at-a-time decisions, minimal choices, and progressive disclosure are sound. The failures are inconsistent `Today`/`Dashboard` terminology, inferred context on the latest-entry shortcut, and weak feedback/recovery after refresh errors. The bottom bar exposes four destinations plus one visually distinct Add action; this is dense but intentional and does not constitute five competing destinations.

The larger cognitive cost is the `Remaining` mode: it changes the headline and every macro numerator at once, so users must reinterpret the entire card rather than reveal one complementary value (`src/screens/DashboardScreen.tsx:257-275`, `src/screens/DashboardScreen.tsx:439-474`).

## Emotional Journey

Arrival feels calm and controlled. The nutrition card creates confidence; the first-use scan state reassures users that estimates remain editable. The trust valley comes immediately after logging: a failed refresh can leave old totals looking authoritative. Over-target calories are explicit, but macro overflow becomes visually subtractive, which feels more like lost progress than precise measurement. The quiet logging heatmaps provide a strong non-gamified ending.

## Priority Issues

### [P1] A refresh failure can silently present stale nutrition

**Why it matters:** Today is the daily source of truth. After logging, unchanged totals can look current even when refresh failed (`src/screens/DashboardScreen.tsx:205-255`, `src/screens/DashboardScreen.tsx:287-305`).

**Fix:** Separate initial-load and refresh errors. Preserve existing data, but show an inline `Today's totals couldn't refresh. Your saved entries are unchanged.` banner with Retry, an active refresh indicator, and an assertive accessibility announcement.

**Suggested command:** `$impeccable harden`

### [P1] The calorie-ring row is unsafe at common compact widths

**Why it matters:** `isNarrow` activates below—not at—360dp, while the fixed 164dp ring plus two figure columns must fit inside roughly 272dp after padding. Four-digit figures can crowd or clip, especially at font scale 1.2 (`src/theme/layout.ts:13-22`, `src/screens/DashboardScreen.tsx:377-430`).

**Fix:** Use a card-width breakpoint around 400dp or `<= 360`, and switch to the existing stacked flank layout. Test 320/360/384/411dp and large text rather than shrinking critical values.

**Suggested command:** `$impeccable adapt`

### [P1] Upload and Describe fall below the 48dp Android touch floor

**Why it matters:** These are essential recovery paths when camera use fails, but `py-2` yields roughly 36dp controls (`src/screens/DashboardScreen.tsx:529-547`). This disproportionately harms motor-access users.

**Fix:** Give both controls `min-h-[48px]`, horizontal padding, centered content, and adequate wrapped separation. Verify TalkBack focus bounds.

**Suggested command:** `$impeccable harden`

### [P2] The latest-entry card overpromises its navigation

**Why it matters:** The accessibility label says `Open [food] in diary`, but the press only opens the Diary destination, not the represented date or item (`src/screens/DashboardScreen.tsx:480-504`). A backdated latest entry may not be visible when Diary opens.

**Fix:** Add a visible `Last logged` label and deep-link with date plus entry/meal ID. If deep-linking is deferred, use the truthful label `Open diary`.

**Suggested command:** `$impeccable clarify`

### [P2] Macro overflow visually reads as reduced progress

**Why it matters:** Above target, a black overlay grows across the filled nutrient rail. At 150%, the bar can resemble 50% completion; only calories receive explicit over-target text (`src/screens/DashboardScreen.tsx:100-137`, `src/screens/DashboardScreen.tsx:433-437`).

**Fix:** Keep the target-length rail nutrient-colored and show a distinct overflow marker or `+12g over` text. Add an accessible summary such as `Protein, 162 of 140 grams, 22 grams over`. Do not encode overflow only by subtractive black.

**Suggested command:** `$impeccable clarify`

## Persona Red Flags

**Alex — experienced macro tracker:** Opens Today, scans totals, logs through Add, checks the refresh, then opens the latest item. Remaining mode forces reinterpretation of every metric; a silent refresh failure undermines trust; and the latest item can land on the wrong Diary context.

**Sam — first-time or occasional logger:** The first-meal state is strong, but after any historical entry exists the explanatory logging CTA disappears and Add becomes chrome-only. `Today` versus `Dashboard` teaches two names for one place, and the recent-food card lacks explicit context.

**Casey — compact-device, large-text, or motor-access user:** At exactly 360dp/font scale 1.2, the safe stacked ring layout does not activate. Alternate logging controls are below 48dp. Loading and nonfatal refresh failures lack useful spoken status.

## Minor Observations

- Rename the visible heading to `Today`, or establish a deliberate reason for the destination/title mismatch (`src/screens/DashboardScreen.tsx:364-370`).
- Add the product-specified initials/profile shortcut without competing with the labeled Profile tab.
- Give the initial spinner an accessible status such as `Loading today's nutrition` (`src/screens/DashboardScreen.tsx:279-283`).
- Replace `Check your data` with a specific recovery message; it is vague and slightly accusatory (`src/screens/DashboardScreen.tsx:287-301`).
- Let long recent-food names wrap to two lines instead of truncating all context (`src/screens/DashboardScreen.tsx:493-499`).
- Announce calorie overage changes to accessibility services (`src/screens/DashboardScreen.tsx:433-437`).

## Questions to Consider

- Is Today primarily a next-action surface or a reporting surface? If action-oriented, should a compact log action remain in content after the first entry?
- Does Remaining deserve a full mode, or would a stable consumed view with adjacent remaining values reduce mental inversion?
- Should over-target feedback feel like neutral instrumentation, or should it visually erase part of the nutrient rail?
- Is the generic `Dashboard` title worth the vertical space when the destination already has the stronger name `Today`?
