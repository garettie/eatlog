---
target: review sheet, specifically the expanded component view
total_score: 24
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
timestamp: 2026-08-16T13-24-28Z
slug: src-components-sheet-states-reviewstate-tsx
---
Method: dual-agent (A: /root/review_sheet_design · B: /root/review_sheet_evidence)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Totals, loading, validation, and undo are visible; the relationship between a renamed food and its unchanged nutrition is not. |
| 2 | Match System / Real World | 2 | Grams and servings are natural, but `per serving` reference values can be mistaken for nutrition for the selected multi-serving amount. |
| 3 | User Control and Freedom | 2 | Collapse, Back, and undo exist; direct-entry swipe/backdrop dismissal can bypass dirty-state protection. |
| 4 | Consistency and Standards | 3 | M3, Onest, touch targets, and portion controls are coherent; expansion drops the summary vocabulary used by the collapsed row and single-food review. |
| 5 | Error Prevention | 2 | Required names and valid portions are guarded, but a semantic rename can retain unrelated nutrition without explicit acknowledgement. |
| 6 | Recognition Rather Than Recall | 2 | Expanded users must remember the collapsed component's kcal, confidence, brand, and preparation context. |
| 7 | Flexibility and Efficiency | 3 | Presets, servings/grams, direct entry, and re-estimation support both fast and precise correction. |
| 8 | Aesthetic and Minimalist Design | 2 | Progressive disclosure is sound, but the expanded block has weak containment and compresses into a dense generic form. |
| 9 | Error Recovery | 3 | Save and re-estimate failures preserve work, and removal/re-estimation are undoable; dismissal and fixed undo timing remain gaps. |
| 10 | Help and Documentation | 2 | Contextual copy exists, but it neither explains stale nutrition after rename nor lets users perform the requested preparation check. |
| **Total** |  | **24/40** | **Acceptable — significant improvements needed** |

All ten heuristics apply to this Operate-mode review flow.

## Design Specificity Verdict

**LLM assessment:** Eatlog is recognizable in the meal-level total, nutrient colors, confidence language, portion model, and AI re-estimation. The expanded component is the weak seam. It becomes a category-interchangeable form and removes the product-specific evidence that motivated inspection: component kcal/macros, confidence and reason, preparation, brand, and provenance.

**Deterministic scan:** The Impeccable detector returned `[]` with exit status 0: zero findings, rules, or source locations. That means the implementation avoids the detector's known anti-patterns; it does not invalidate the interaction and hierarchy problems found through source review.

**Visual overlays:** None. This is a React Native target and no mutable browser automation or Android bridge is available in the session, so no reliable user-visible overlay was created. The fallback evidence is the target source, its state owner and sheet container, shared controls, PRODUCT.md, DESIGN.md, and runtime tokens.

## Overall Impression

The sheet is strong at meal-level review and weak at component-level correction. The biggest opportunity is to make expansion preserve context: users should see what the component is, why it may be wrong, and how their correction changes that component before they return to the meal total.

## Cognitive Load

The expanded state fails four of eight checks: chunking, visual hierarchy, minimal choices, and working-memory support. That is high cognitive load for a correction step. Single focus, one-open-at-a-time behavior, grouping, and nested progressive disclosure work in its favor.

The clear >4-option risk is the unbounded portion-preset row. Every provider portion becomes a peer chip, followed by the Servings/Grams mode choice and amount control. A food with five or more portions exceeds the working-memory guideline before the user reaches the actual amount editor.

The emotional arc starts well: the meal total and low-confidence warning convey oversight. It drops when the user opens a flagged component and the warning context and component outcome disappear. Live recalculation, re-estimation progress, undo, and the fixed Log/Update action recover confidence, but the end state is weakened if old nutrition can be saved under a new food name.

## What's Working

- Only one component expands at a time, and advanced nutrition has a second disclosure. That is disciplined progressive disclosure rather than a wall of forms.
- Meal totals update live, the primary action stays fixed, and removal and re-estimation are reversible. The feedback loop is immediate and safe in the main path.
- The native foundation is solid: BottomSheet-aware fields, 48dp controls, reduced-motion handling, live regions, tabular numerals, and interactive keyboard behavior all match Eatlog's system.

## Priority Issues

### [P1] Expansion removes the evidence needed to correct the component

**What:** Collapsed rows show name, portion, optional brand, low-confidence status, and kcal. The expanded header shows only an editable name, optional Re-estimate action, and collapse icon. The global warning explicitly asks users to check portions and preparation, but preparation and `confidenceReason` are not shown anywhere in the editor.

**Why it matters:** At the exact moment users investigate a risky estimate, the reason for concern disappears. They also cannot isolate the component's nutritional contribution from the meal total above.

**Fix:** Preserve a stable expanded summary with wrapped name, current portion, kcal, component P/C/F, confidence plus reason, and brand/preparation metadata. Keep the live component outcome immediately adjacent to the portion control. Expose preparation as editable or remove the promise that it can be checked.

**Suggested command:** `$impeccable layout`

Evidence: `src/components/sheet-states/ReviewState.tsx:814`, `:888`, `:1093`; `src/services/foodSearchTypes.ts:43`.

### [P1] A meaningful rename can silently keep the old food's nutrition

**What:** Editing a name changes only `food.name`; Re-estimate is optional. Save can therefore combine a new semantic label with the original per-100g values.

**Why it matters:** Changing `grilled chicken` to `fried chicken` can create a confidently mislabeled log. The current helper explains what Re-estimate does, not what keeping the old estimate means.

**Fix:** After a rename, state `Nutrition is still based on [original name]` and require an explicit choice between `Keep current nutrition` and `Re-estimate nutrition`, with re-estimation recommended for substantive changes. Keep the current component result visible while that decision is made.

**Suggested command:** `$impeccable harden`

Evidence: `src/components/sheet-states/ReviewState.tsx:392`, `:907`, `:964`, `:564`.

### [P1] Direct-entry dismissal can lose expanded edits

**What:** ReviewState registers a dirty guard, but sheets opened from the Diary/Today entry bar retain `fromBar`. That enables `forceClose`, whose swipe/backdrop path bypasses `canCloseRef`.

**Why it matters:** Back can protect a correction while a visually equivalent dismissal gesture silently discards it. This is especially damaging during one-handed or interrupted use.

**Fix:** Separate return routing from discard-guard bypass. All user-initiated Back, pan, and backdrop dismissal should consult the dirty guard; bypass it only after a successful log or explicit discard confirmation.

**Suggested command:** `$impeccable harden`

Evidence: `src/components/sheet-states/ReviewState.tsx:242`; `src/navigation/TabNavigator.tsx:98`, `:439`; `src/components/Sheet.tsx:94`.

### [P2] The editor is fragile on narrow screens and at large text sizes

**What:** The name field shares one row with an optional 84dp Re-estimate button and a 48dp collapse target. Advanced nutrition forces four numeric inputs into one horizontal row.

**Why it matters:** Editing activates the button and simultaneously leaves the name with roughly half the content width. Long food names become horizontally hidden, and four fields can compress or clip under large fonts while the keyboard reduces vertical space.

**Fix:** Use a full-width, 2–3-line name field and a separate action row. Change advanced nutrition to a 2×2 grid with persistent unit/basis labels, and auto-scroll the expanded block so the active field and its context remain visible above the keyboard and fixed footer.

**Suggested command:** `$impeccable adapt`

Evidence: `src/components/sheet-states/ReviewState.tsx:890`, `:1027`; `src/components/PortionStepper.tsx:96`.

### [P2] Expansion is not a stable accessible disclosure

**What:** Collapsed and expanded headers are different conditional Pressables. Neither exposes `accessibilityState.expanded`, and activating the collapsed row unmounts the focused node. Advanced nutrition correctly exposes its expanded state, making the component disclosure inconsistency more obvious.

**Why it matters:** Screen-reader users can lose their position and receive no concise confirmation that details opened. The fixed 10-second Undo window also ignores users who request more accessibility time.

**Fix:** Keep one persistent component-header disclosure across states, expose `expanded`, announce the transition, and move focus deliberately to the header or first field. Use the platform-recommended accessibility timeout for Undo.

**Suggested command:** `$impeccable audit`

Evidence: `src/components/sheet-states/ReviewState.tsx:888`, `:995`, `:1095`, `:1205`.

## Persona Red Flags

**Jordan (first-timer):** The instruction to check preparation cannot be completed. Confidence disappears after opening the row. `Per serving` does not clearly distinguish reference nutrition from nutrition for the selected number of servings, and rename copy does not reveal that the previous food's nutrition remains.

**Sam (accessibility-dependent):** Expansion replaces the focused disclosure without an expanded state or focus handoff. Four side-by-side nutrition fields are brittle under large text. Undo expires after a fixed 10 seconds.

**Casey (distracted mobile user):** A direct-entry swipe/backdrop can lose changes. The keyboard, long inline form, and fixed footer split component identity, portion, reference nutrition, and completion across scrolling. The compressed name/action row is hard to scan and operate one-handed.

## Minor Observations

- Remove is available only while collapsed, forcing an extra state change to delete the component being reviewed.
- Fixing a component name does not clear a previous sheet-level log error, so stale error text can persist.
- Clearing an advanced nutrition field temporarily looks valid while the underlying old value remains.
- A tall expanded component has only a bottom divider, not a distinct tonal boundary, so ownership of nested controls is weak.
- Portion presets are not capped or collapsed when provider data supplies many options.

## Questions to Consider

- Why does opening a low-confidence food remove the low-confidence evidence?
- Is Advanced nutrition editing source/reference data or the selected portion's result—and can a first-time user answer without remembering the current mode?
- Should a renamed food ever be loggable with nutrition still based on the old name without explicit acknowledgement?
