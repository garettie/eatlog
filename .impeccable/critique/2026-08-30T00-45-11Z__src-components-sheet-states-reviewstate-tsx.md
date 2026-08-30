---
target: the meal review sheet and its component editors
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-30T00-45-11Z
slug: src-components-sheet-states-reviewstate-tsx
---
# Critique: Meal Review Sheet & Component Editors (ReviewState.tsx / SingleFoodReviewState.tsx)

Method: dual-agent (A: design-review sub-agent · B: detector sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Values snap on portion/macro edit with no motion; meal-level Redo has no persistent affordance before it appears |
| 2 | Match System / Real World | 4 | "1 egg", servings, grams — reads like real food language |
| 3 | User Control and Freedom | 4 | Undo covers remove/re-estimate; Back, discard guard, revert-on-blur all present |
| 4 | Consistency and Standards | 3 | Today's grammar-unification fix stops at the file boundary — SingleFoodReviewState still uses the old two-grammar layout |
| 5 | Error Prevention | 3 | Strong field validation, but empty-foods state uses alarm-red before any error attempt |
| 6 | Recognition Rather Than Recall | 3 | Good status badges, but meal-level Redo requires remembering "rename reveals it" |
| 7 | Flexibility and Efficiency | 2 | No bulk remove/redo, single-expand accordion blocks comparing two foods |
| 8 | Aesthetic and Minimalist Design | 3 | Clean sectioning; persistent warning line never dismisses once shown |
| 9 | Error Recovery | 4 | Actionable, specific failure copy; undo as second line of defense |
| 10 | Help and Documentation | 2 | No hint that Redo costs entitlement, or that renaming unlocks re-estimation |
| **Total** | | **31/40** | **Good** |

Up from 29/40 on 2026-08-29. The consistency and error-recognition gains from today's two commits (f745989, 35c5acb) are real, but land incompletely.

## Design Specificity Verdict

**Design review**: Authored for Eatlog, not generic — the macro grammar uses the product's own semantic tokens exactly as DESIGN.md specifies, tabular-nums appear everywhere a digit changes, and the "Nutrition stays unchanged until you redo it" honesty affordance is a distinctly Eatlog trust move most competitors skip. Where it slips into generic territory: `SingleFoodReviewState.tsx` still renders nutrition as a standalone `text-4xl` calorie number plus a separate `MacroChipGroup` of tinted chip cards — the exact "two grammars for the same data" pattern today's commits fixed only in `ReviewState.tsx`. A user logging one food today and a multi-food meal tomorrow sees two different visual languages for the identical concept.

**Deterministic scan**: `detect.mjs --json` against ReviewState.tsx, SingleFoodReviewState.tsx, PortionStepper.tsx, AddComponentSection.tsx returned exit 0, zero findings, no advisory findings. This is not a clean-code signal — it's a coverage gap. The detector's regex engine only matches literal CSS/Tailwind-class strings (`border-l-*`, `text-gray-*`, `bg-clip-text`, literal `<img>` tags), and its page-level analyzers (hierarchy, spacing, copy quality) only activate on files containing `<!doctype>`/`<html>`/`<head>` markers. RN + NativeWind `.tsx` source never contains those markers and routes through Reanimated/className tokens rather than raw CSS, so most of the tool's actual rule coverage never ran against these files. No false positives to report — there were no findings to be false.

**Visual overlays**: Not applicable. This is a native RN app with no dev server, web build, or Storybook to screenshot or inject into.

## Overall Impression

The sheet's core information design is now genuinely coherent inside `ReviewState.tsx` — the macro-row unification and Redo-pill unification landed today are real fixes, not cosmetic ones. But two of the prior critique's three P1s are only partially closed: the calorie/macro numbers still update with zero motion (contradicting Eatlog's own "motion confirms calculation" principle), and the unification that fixed one file left its sibling, `SingleFoodReviewState.tsx`, on the old two-grammar layout. The single biggest opportunity is finishing what today's commits started: propagate the same macro grammar to the single-food path, and give the numbers themselves the motion-as-confirmation treatment already used elsewhere in the app.

## What's Working

1. **Undo generation counter (`undoGenerationRef`) prevents race conditions between rapid consecutive actions.** Removing food A then immediately re-estimating food B correctly invalidates A's undo timer instead of leaving conflicting undo states — exactly the correctness work that keeps a "trust me, we didn't lose your data" feature trustworthy under stress use.
2. **The macro-row unification inside `ReviewState.tsx` is a genuinely good fix.** Before: summary card led with calories + divider + 3 columns while per-food rows used 4 equal columns. Now both read left-to-right as "the big number, then the three tinted ones" — the correct grammar for a screen whose whole job is "how much of what did I eat."
3. **Portion input validation with graceful revert-on-blur** (`PortionStepper`, `MacroTextInput`). Typing an invalid fraction never corrupts state; it reverts visually on blur with live accessible hints, quietly preventing an entire class of "why did my calories go to zero" bug reports.

## Priority Issues

**[P1] The macro-summary grammar unified today in `ReviewState.tsx` was not applied to `SingleFoodReviewState.tsx`.**
- **Why it matters**: Users move between logging a single food and a multi-food meal constantly in the same session. The identical concept — calories plus three macros for a quantity of food — is drawn two different ways, breaking the "learn once, apply everywhere" consistency the fix was meant to establish, and leaving it incomplete relative to its own goal.
- **Fix**: Replace the `text-4xl` + `MacroChipGroup` block in `SingleFoodReviewState.tsx` (~lines 227-244) with the same calorie-cell + divider + 3-column macro card used in `ReviewState.tsx`'s summary card (~lines 874-917). Check for other `MacroChipGroup` callers before deleting it.
- **Suggested command**: `/impeccable layout`

**[P1] Motion still does not confirm calculation, contradicting Eatlog's own stated design principle ("Motion confirms state, navigation, selection, and calculation").**
- **Why it matters**: This was the prior critique's P1 and remains open for the numbers themselves — today's commits animated row expansion and the Redo icon/spinner swap, but `totalMacros.calories` and every per-food macro cell still hard re-render with zero transition. A user dragging a portion editor and watching calories jump from 320 to 480 gets no confirmation the system registered the change, at exactly the moment that confirmation matters most.
- **Fix**: Animate the calorie/macro `Text` values with `useSharedValue`/`useAnimatedProps` or a brief `withTiming` opacity pulse gated by `reduced ? 0 : 150`, matching the existing pattern already used for `DisclosureChevron`.
- **Suggested command**: `/impeccable animate`

**[P2] Meal-level and component-level Redo are hidden behind an undiscoverable trigger, contradicting the product's own "redo any meal or component" promise.**
- **Why it matters**: The meal-level Redo pill only renders after the user has already edited the meal name; the component-level pill only renders on low-confidence or a renamed food. A user who thinks "this looks about right but I want a second opinion" — a plausible use of a paid Redo feature — has no path to it without first making an edit they may not want, which itself triggers the "review nutrition" warning as a side effect of just trying to unlock Redo.
- **Fix**: Give Redo a persistent, always-visible affordance per row rather than gating its *existence* on rename or confidence state. Gating the paywall/consent flow behind the tap is fine; gating the button's presence on unrelated user actions is the problem.
- **Suggested command**: `/impeccable shape`

**[P2] Collapse motion is asymmetric with expand motion, including on auto-collapse of the previously open row.**
- **Why it matters**: Expanding a row fades and rises in via `FadeInUp`; collapsing — whether an explicit tap or the automatic collapse when a different row opens — has no exit transition, the block just unmounts. The commit message documents this as a deliberate tradeoff (avoiding a mounted-body overlap glitch), but the result reads as unfinished: new content eases in, old content vanishes, most visibly in the common case of tapping food B while food A is open.
- **Fix**: If the overlap constraint is real, sequence a short exit fade (150ms) instead of dropping it. If that's not worth the complexity, the honest move is to strip motion from expand too, so both directions match.
- **Suggested command**: `/impeccable animate`

**[P3] The empty-foods state borrows error-red before the user has done anything wrong.**
- **Why it matters**: "This meal has no foods. Add a food before logging." renders in `text-m3-error` as soon as the last component is removed — before any log attempt. Error-container red is reserved for destructive/recoverable-error moments; using it for a routine mid-editing state creates a false sense of having broken something and dilutes the color's meaning for when it should actually alarm.
- **Fix**: Use `text-m3-on-surface-variant` while the sheet hasn't attempted a save; reserve `text-m3-error` for after a failed log attempt, consistent with how `logError`/`blockedReason` already work.
- **Suggested command**: `/impeccable polish`

## Persona Red Flags

**Jordan (first-timer)**: The meal-level Redo gesture (rename-to-reveal) is the clearest first-timer failure — a new user wanting a second AI opinion has no visible control to ask for one unless they stumble into editing the meal name first. Nothing on the collapsed sheet signals "you can ask me to redo this," directly undercutting the marketed "redo any meal" capability.

**Alex (power user)**: No bulk operations — no multi-select remove, no "redo all," and the single-expand accordion still forces sequential open/close/open to compare two foods' macros, exactly the workflow a power user auditing a multi-item meal needs. `clarifyingComponentId` being a single global value also means a second Redo tap elsewhere would silently no-op while one is already in flight, with no visual cue that it's blocked.

**Casey (distracted mobile)**: Expand/collapse tap-target asymmetry — expanding a row is a full-row tap (easy, forgiving), but collapsing it is a 48px chevron only, since the rest of the row is now an editable text field that opens the keyboard instead of collapsing. A distracted thumb reaching to close a row it just opened has a much smaller target than the one that opened it.

## Minor Observations

- The "Nutrition stays unchanged until you redo it." helper text persists indefinitely once the meal name diverges, with no way to dismiss it — flagged in the prior critique, still true.
- The Redo icon/spinner crossfade uses `FadeIn` on entry only, no matching exit fade — a partial improvement over the prior hard-swap, not a full crossfade.
- Per-row metadata and portion-summary text both truncate at `numberOfLines={2}`; a food with a long brand name, prep note, and portion summary together could clip before the user sees full context.
- `AddComponentSection`'s three-way mode tabs plus a separate cancel button sit at the edge of the "≤4 per decision" guideline, but they're distinct actions rather than options in one decision — a soft note, not a real violation.
- The detector found nothing to flag not because this surface is clean, but because its rule engine doesn't cover RN/NativeWind `.tsx` source structurally — treat this critique's judgment as resting on the design review alone, not on tooling confirmation.

## Questions to Consider

- What if the Redo affordance lived as a persistent small icon-button on every collapsed row, rather than being conjured by renaming or a confidence flag?
- What if the total-calories number used a short animated roll on every portion change, the way stock-price or timer apps confirm a value actually moved?
- What if `SingleFoodReviewState` were retired in favor of always routing single-food adds through `ReviewState` with a one-item component list — eliminating the two-grammar problem at the root instead of keeping two files in sync going forward?
