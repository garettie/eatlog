---
target: Eatlog homepage after real screenshot replacement
total_score: 24
max_score: 32
na_heuristics: 7,9
p0_count: 0
p1_count: 2
timestamp: 2026-08-24T08-35-49Z
slug: release-site-index-html
---
Method: dual-agent (A: CritiqueDesignA · B: CritiqueEvidenceB)

# Eatlog homepage critique

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3/4 | Release and acquisition state are not actionable. |
| 2 | Match between system and real world | 4/4 | Real screens, plain language, and honest pricing fit the product. |
| 3 | User control and freedom | 3/4 | The phone plan table hides tiers in a non-focusable scroller. |
| 4 | Consistency and standards | 3/4 | Nutrient colors are reused for generic status; inert pills look interactive. |
| 5 | Error prevention | 3/4 | Release availability remains ambiguous. |
| 6 | Recognition rather than recall | 2/4 | Phone comparison requires hidden horizontal scrolling and row memory. |
| 7 | Flexibility and efficiency | n/a | No repeat expert workflow on this Persuade page. |
| 8 | Aesthetic and minimalist design | 3/4 | Strong hierarchy, but phone comparison adds avoidable friction. |
| 9 | Error recovery | n/a | No transaction or recoverable error state on the homepage. |
| 10 | Help and documentation | 3/4 | Support and FAQ are strong; the plan note does not link Terms in context. |
| **Total** |  | **24/32** | **Good** |

## Design specificity verdict

The page is authored for Eatlog rather than category-interchangeable. The scale dial, calibration rail, real app screens, egg marks, Filipino tier names, and exact bird artwork make the product recognizable. The weakest point is behavioral specificity: the page builds conviction but has no real acquisition destination.

The deterministic CLI detector returned zero findings. The injected browser detector found crushed display tracking on five major headings, cramped plan-table padding, an overlong plan note, and a hero-kicker pattern. Its single-font warning is a false positive because Eatlog deliberately uses Onest across four bundled weights. Five hidden line-length findings came from the required preflight script and are false positives.

No user-visible overlay was presented because the critique ran in a hidden headless browser. The detector overlay executed successfully in the isolated critique tab.

## Overall impression

Sober, specific, and credible. The real screenshots finally prove the product. The biggest opportunity is to turn the plan decision and final page ending into a deliberate commitment instead of a legal detour.

## What is working

- Real dashboard and meal-review captures carry the product story at desktop and phone widths.
- Calibration marks, egg forms, tier birds, and Onest create a coherent Eatlog visual world.
- Local-data copy, consent qualifiers, medical caveats, focus states, reduced motion, and screenshot alt text build trust without filler.

## Priority issues

### P1. No conversion action

The hero tours the page and the final CTA opens Privacy. A convinced visitor cannot install, pre-register, or take another acquisition step. Use a real store or pre-registration destination when available. Until then, state the exact release status and avoid implying availability.

Suggested command: `/impeccable clarify`, then `/impeccable overdrive` after the destination is resolved.

### P1. Phone plan comparison hides paid tiers

The 720px table is inside a 362px viewport. Manok and Itik are off-screen with no label, cue, keyboard access, sticky labels, or alternate view. Replace it on phones with an accessible tier selector that keeps feature names fixed and displays one tier at a time.

Suggested command: `/impeccable adapt`.

### P2. Nutrient colors lose their meaning

Carb green marks generic availability and Included states. Expenditure lavender is used as a generic privacy background. Return generic states and trust sections to the neutral tonal stack.

Suggested command: `/impeccable normalize`.

### P2. Capability labels look clickable

Create backup, Restore backup, Export CSV, and Delete all data are inert bordered pills with action verbs. Render them as a clearly labeled capability list, not controls.

Suggested command: `/impeccable clarify`.

### P2. Detector finish findings

Display headings use tighter than the -0.04em craft floor. The comparison wrapper is cramped and the plan note exceeds the reading measure. Relax display tracking, add comparison breathing room, and constrain the note.

Suggested command: `/impeccable typeset` and `/impeccable layout`.

## Persona red flags

- **Jordan, first-timer:** The first action tours the page instead of completing acquisition. `iOS v1 source ready` is internal release language. The local-data pills look pressable.
- **Riley, stress tester:** The release state has no destination. Terms is not linked at the pricing decision. Mobile and desktop comparisons behave differently.
- **Casey, distracted mobile user:** Paid tiers sit outside a hidden scroller. The page is long, and the final thumb-zone action leads to Privacy rather than acquisition.

## Minor observations

- The dashboard begins near the bottom of the first phone viewport. Tightening the hero would bring product evidence forward.
- Link Terms directly in the plan note.
- Keep the single Onest family; the detector warning is not actionable.
- The hero kicker is used once and carries the scale-calibration language, so its detector warning is not material.

## Questions considered

- What can a convinced visitor do before the Play listing or pre-registration URL exists?
- Can the pricing decision become as culturally specific and direct as the tier birds?
- What should the visitor remember at the end: legal caution, release status, or choosing Eatlog?
