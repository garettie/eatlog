---
target: FAB entry sheet layout
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-08-10T01-24-11Z
slug: src-components-sheet-states-entrymethodstate-tsx
---
Method: dual-agent (A: be857978 · B: 4a2cb1d2)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Good feedback and recovery; overflow is invisible. |
| 2 | Match system / real world | 3 | Labels are direct; “in this build” is developer-facing. |
| 3 | User control and freedom | 4 | Back, backdrop close, pan-down, and alternate routes are supported. |
| 4 | Consistency and standards | 3 | Strong M3 hierarchy; primary press feedback diverges from the specified scale response. |
| 5 | Error prevention | 3 | Review prevents accidental logging, but that contract is not visible up front. |
| 6 | Recognition rather than recall | 4 | Every route has an icon, label, grouping, and TalkBack hint. |
| 7 | Flexibility and efficiency | 4 | Six direct routes serve both new and repeat users. |
| 8 | Aesthetic and minimalist design | 2 | Six visible choices and possible hidden overflow weaken focus. |
| 9 | Error recovery | 4 | Retry, Search, Describe, Manual, Settings, and Back paths are preserved. |
| 10 | Help and documentation | 2 | Sighted first-timers do not see the estimate/review contract. |
| **Total** | | **32/40** | **Good** |

## Design Specificity Verdict

The information architecture is distinctly Eatlog: a dominant Scan pill, paired Photo/Describe methods, grouped Quick log rows, and a separate Weight row. The visual ingredients are still conventional Material 3, but the hierarchy is authored for scanner-first food logging rather than interchangeable app chrome.

The deterministic detector returned exit code 0 with `[]`: zero rules, severities, or source locations. That supports the implementation’s baseline discipline, but it does not detect the source-level layout risks below. No browser overlay was available or authoritative for this Android React Native target.

## Overall Impression

The sheet has the right hierarchy and unusually strong touch/TalkBack fundamentals. Its main weakness is not visual taste; it is container math. A fixed 60% snap point is carrying roughly 448dp of minimum content with no scroll indicator, while the paired secondary actions ignore narrow-width and large-font layouts.

## What’s Working

1. The scanner-first hierarchy is precise and matches the product contract (`src/components/sheet-states/EntryMethodState.tsx:88-135`).
2. Actions use explicit labels, semantic roles/hints, and 56–72dp targets (`EntryMethodState.tsx:14-62`).
3. Failure states preserve credible recovery routes instead of discarding the task (`FoodSheetContent.tsx:562-583,696-729`).

## Priority Issues

### P1 — Lower actions can sit below an invisible fold

**Why it matters:** The entry state is fixed at 60% (`TabNavigator.tsx:240-243`), while the content’s minimum height approaches 448dp before the handle, safe area, or font scaling. `showsVerticalScrollIndicator={false}` hides the only overflow cue (`EntryMethodState.tsx:84`). Quick log or Weight can look absent.

**Fix:** Size the entry sheet to content up to a safe-area maximum, then scroll only on overflow. If fixed snaps remain, add a responsive taller snap or visible overflow cue.

**Suggested command:** `$impeccable layout`

### P2 — Paired tiles are brittle on narrow and large-text layouts

**Why it matters:** Upload and Describe always remain horizontal (`EntryMethodState.tsx:96-109`). Around 320dp width, each tile leaves very little room after the 40dp icon, padding, and gap; the project’s existing `isNarrow` signal is unused.

**Fix:** Use `useResponsiveLayout().isNarrow` to compact or stack this pair. Verify at 320dp and increased Android font scale.

**Suggested command:** `$impeccable adapt`

### P2 — “Scan a meal” hides the estimate/review contract

**Why it matters:** A first-timer cannot tell whether Scan means barcode capture, photo estimation, or immediate logging. The explanatory copy exists only in the accessibility hint (`EntryMethodState.tsx:90-95`).

**Fix:** Add one visible line: “Take a photo. Review the estimate.” Keep Scan dominant.

**Suggested command:** `$impeccable clarify`

### P2 — Unavailable recovery can offer another unavailable route

**Why it matters:** The entry state removes Describe when estimates are unavailable, but the estimation-error state always offers `Describe instead` (`FoodSheetContent.tsx:562-582,721-723`). That creates a dead-end loop.

**Fix:** Pass provider availability into the recovery state and omit Describe when unavailable; retain Search and Manual.

**Suggested command:** `$impeccable harden`

### P3 — Availability copy exposes implementation language

**Why it matters:** “Unavailable in this build” sounds like packaging diagnostics, not user guidance (`EntryMethodState.tsx:114-120`).

**Fix:** Say: “Photo and description estimates are unavailable. You can still use Recent meals or Search foods.”

**Suggested command:** `$impeccable clarify`

## Persona Red Flags

- **Casey, distracted mobile user:** An unmarked scroll can hide Quick log or Weight, forcing exploration in a sheet intended for one-tap entry.
- **Jordan, first-timer:** “Scan” does not explain photo estimation, review, or that nothing logs automatically.
- **Sam, accessibility-dependent user:** TalkBack semantics are strong, but large text stresses the unconditional two-column tile layout.

## Minor Observations

- `Add entry` uses a 20px title between the documented 16px Title and 24px Headline roles (`EntryMethodState.tsx:86`).
- The white primary action uses opacity feedback instead of the specified brief scale-down (`EntryMethodState.tsx:21`).
- The row divider’s hard-coded `ml-[68px]` is visually correct today but coupled to icon/padding geometry (`EntryMethodState.tsx:128`).

## Questions to Consider

1. Why is a known-height primary logging surface fixed at 60% rather than content-sized?
2. Should the visible promise be “Scan,” or the more accurate “photograph, estimate, review”?
3. Should repeat users reach Recents sooner, or is scanner primacy intentionally absolute on every open?
