---
target: meal review sheet
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-17T03-29-58Z
slug: src-components-sheet-states-reviewstate-tsx
---
Method: dual-agent (A: MealReviewDesign · B: MealReviewEvidence)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 2/4 | Live totals, errors, loading, and undo are present, but a disabled Log Meal action can be caused by an issue hidden inside a collapsed food. |
| 2 | Match system / real world | 3/4 | Meal, portion, serving, grams, and macro language is natural; “component” and the relationship between “This portion” and basis nutrition are implementation-heavy. |
| 3 | User control and freedom | 3/4 | Back, discard guard, direct editing, date cancel, and undo cover major exits; remove/re-estimate recovery is time-limited. |
| 4 | Consistency and standards | 2/4 | M3 tokens and touch targets are consistent, but the photo is double-inset, the row changes identity when expanded, and Review recreates the shared back/title pattern. |
| 5 | Error prevention | 3/4 | Invalid names, portions, and unreviewed renamed nutrition block logging; the blocker is not surfaced beside the fixed action. |
| 6 | Recognition rather than recall | 2/4 | Labels and disclosures are clear, but users must remember which food needs attention after its detailed editor is collapsed. |
| 7 | Flexibility and efficiency | 2/4 | Direct entry, amount presets, and one-open-row disclosure help; destination controls sit after the full list and the expanded inspector is slow to scan. |
| 8 | Aesthetic and minimalist design | 2/4 | Color discipline is strong, but nested rounded treatments, repeated nutrition representations, and equal-weight sections create avoidable noise. |
| 9 | Error recovery | 3/4 | Errors preserve work and most failures are local; the fixed action neither explains nor navigates to a hidden blocker. |
| 10 | Help and documentation | 2/4 | Confidence and rename warnings are useful; the editable basis-versus-calculated portion relationship is not explained by hierarchy or copy. |
| **Total** |  | **24/40** | **Acceptable foundation; significant structural improvement needed.** |

## Design Specificity Verdict

**LLM assessment:** Moderately product-specific, structurally generic. Meal photography, estimate confidence, portion-aware totals, semantic macro colors, AI re-estimation, and undo are unmistakably Eatlog. The fixed form header → hero metric → accordion inspector → sticky CTA composition could belong to an inventory editor. The scanner-first review promise is present as content, not as the organizing hierarchy.

**Deterministic scan:** `detect.mjs --json src/components/sheet-states/ReviewState.tsx` returned `[]` with exit 0: zero rule findings, zero locations, no suspected false positives. This is compatible with the critique: the problems are information architecture and composition, not banned-pattern violations.

**Visual overlays:** None. Expo web could not start because the project intentionally lacks `react-dom@19.1.0` and `react-native-web@^0.21.0`; no real rendered sheet URL existed, so no browser tab or detector overlay was claimed. Findings below are source-grounded visual inferences, not pixel observations.

## Overall Impression

The sheet is cluttered, but not because it contains irrelevant capability. It is cluttered because every capability is presented at nearly the same visual rank. The 36px calorie total dominates the screen, while the actual task—verify the estimated foods and portions—has no section heading, progress state, or clear review path. Expansion then turns one food into a long nutrition-record inspector.

The overhaul should make this a guided review surface, not a shorter version of the same form. One compact meal summary, one explicit foods group, one attached editor, one persistent commit context.

## What’s Working

1. **Trust is product-specific.** Meal photo, low-confidence reasons, preparation context, re-estimation, and undo directly support scanner-first estimation rather than decorating a generic form.
2. **Interaction safety is strong.** The sheet allows only one expanded food, keeps expanded height in normal scroll layout, uses 48dp targets, preserves work on errors, exposes disclosure state, and respects reduced motion.
3. **Nutrition language is disciplined.** Onest, tabular figures, tonal M3 surfaces, and semantic calorie/protein/carb/fat colors are used consistently without shadows or decorative nutrient color.

## Priority Issues

### [P1] The hierarchy is inverted and the review path is invisible

**What:** The sheet stacks photo, optional confidence banner, a 36px calorie hero, macro chips, unlabelled food rows, Add component, Date, and meal type. The aggregate total is the visual apex; the food review task has no `Foods` heading, count, or reviewed/needs-attention state (`ReviewState.tsx:880–930, 932–1305`).

**Why it matters:** A scan result should answer “what did Eatlog recognize, and what needs checking?” Instead it first answers “what is the total?” Users either trust the hero blindly or open foods without knowing which ones require attention.

**Fix:** Replace the hero block with a compact meal summary rail. Introduce a clear `Foods · n` section and put `Needs review` status on affected rows. Keep collapsed rows lean—identity, portion, kcal, and status—rather than adding another card or forcing every row open.

**Suggested command:** `/impeccable shape`

### [P1] Expansion becomes an evenly weighted nutrition inspector

**What:** Expanded content stacks confidence reason, editable name, rename warning/actions, Portion controls, a four-cell `This portion` macro strip, and four editable `Nutrition values` fields. Rounded warnings, chips, tracks, fields, and macro surfaces nest inside one rounded outer card (`ReviewState.tsx:1033–1255`; `PortionStepper.tsx:97–219`). The row header also replaces the food name with a portion summary (`ReviewState.tsx:992–1014`).

**Why it matters:** Users lose identity at the moment they request detail, then parse two macro representations with similar visual weight. The problem is not the number of capabilities; it is the absence of dominance and subordination.

**Fix:** Keep one rounded outer food container and one expansion. Inside it, use three flat bands separated by full-width dividers: identity/confidence, portion with immediate calculated macros, and editable nutrition basis. Reserve tonal blocks only for warnings. Keep food identity stable and edit it in place; do not add a second name header. Make basis values visibly subordinate to the portion result.

**Suggested command:** `/impeccable layout`

### [P1] The fixed commit action is disconnected from destination and blockers

**What:** Date and meal type live after the full food list, but Log Meal remains fixed. Logging can be disabled by invalid portions or unreviewed renamed nutrition hidden inside a collapsed food, with no footer explanation (`ReviewState.tsx:1266–1360`).

**Why it matters:** Users can feel ready to log before confirming `Dinner · Today`, or encounter a disabled primary action without knowing where to repair the meal. This is the sheet’s most serious navigation failure.

**Fix:** Put a compact, tappable `Dinner · Today` context row in the fixed commit area. When blocked, show one concise reason above the button—`Review nutrition for Chicken` or `Fix the rice portion`—and make it expand/focus the first offending food.

**Suggested command:** `/impeccable harden`

### [P2] The sheet has a real horizontal-grid bug and unstable field width

**What:** `BottomSheetScrollView` already owns a 20dp horizontal inset (`ReviewState.tsx:880–884`), while `MealPhotoEditor` adds another `px-5` (`MealPhotoEditor.tsx:82–149`). The photo control is therefore 40dp narrower than neighboring full-width sections. The meal-name input also shrinks when the conditional Re-estimate sibling appears (`ReviewState.tsx:825–860`).

**Why it matters:** These are the width inconsistencies the eye reads as accidental assembly. Scanner media looks demoted, and editing the meal name causes a visible geometry jump.

**Fix:** Make the parent the sole owner of the 20dp grid. Remove horizontal page padding from `MealPhotoEditor`. Keep the meal-name field full width; place re-estimation as a stable supporting action/status below it rather than a conditional horizontal sibling.

**Suggested command:** `/impeccable layout`

### [P2] Collapsed rows expose too many equal-weight actions

**What:** Every collapsed food has a full-row disclosure plus a separate 48dp red remove action. Three foods create at least six row actions before Add, Date, meal type, and Log (`ReviewState.tsx:968–1031`).

**Why it matters:** Remove competes with review on the primary scan-confirmation path. Repeated red controls make the list busier and increase accidental-destructive attention even though undo exists.

**Fix:** Make the collapsed row one coherent review target. Move `Remove food` into the expanded editor as a clearly labeled secondary destructive action, retaining undo. Rename `Add component` to `Add food` to match the user’s domain.

**Suggested command:** `/impeccable distill`

## Persona Red Flags

**Casey — distracted, one-handed mobile user:** The sticky Log button is reachable, but `Dinner · Today` is below every food. Per-row remove competes with expand. After interruption, there is no review progress or visible marker for the food that still blocks completion.

**Jordan — first-time macro tracker:** The 36px total implies the job is already done, while `component`, `This portion`, and basis nutrition require understanding Eatlog’s data model. Expansion changes the row’s identity slot from food name to grams and reveals a long inspector without explaining which values are result versus source.

**Sam — screen-reader / low-vision / motor-access user:** Disclosure labeling and 48dp targets are solid. A disabled Log button can still have no announced reason or link to the offending row. Meal-level clarification error lacks the live-region treatment used by other errors, and invalid macro drafts do not expose an invalid accessibility state.

## Minor Observations

- Review recreates the back/title row instead of composing `SheetBackButton`; the contextual accessibility label is better and should be preserved if consolidated.
- `Review meal` and the meal-name value both use `text-lg`, so the editable value competes with the screen title instead of fitting a named design-system role.
- Low confidence appears globally and per row, but the global banner does not navigate to affected foods or communicate review progress.
- Only `MealPhotoEditor` is disabled during logging; food fields, remove, add, date, and meal type can still visibly change after the save payload is captured.
- Undo uses `text-white` rather than the semantic surface token.

## Questions to Consider

- If the user gives this review ten seconds, should the top answer be total calories or `3 foods · 1 needs review`?
- Which two internal states deserve tonal emphasis: uncertainty and invalid data, or every editable subsection?
- Should collapsed rows stay lean with status, or show compact P/C/F for cross-food comparison at the cost of density?
- Why is `Dinner · Today` discovered after Add food rather than beside the action that commits it?
