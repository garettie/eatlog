---
target: the meal review sheet
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-29T16-31-19Z
slug: src-components-sheet-states-reviewstate-tsx
---
# Critique: Meal Review Sheet (ReviewState.tsx)

Score: 29/40 (Good). Method: single-context (native RN, detector clean, no browser).

## Health scores
1 Status 3 | 2 Real-world 3 | 3 Control/Freedom 4 | 4 Consistency 2 | 5 Error prevention 3 | 6 Recognition 3 | 7 Flexibility 2 | 8 Minimalist 3 | 9 Error recovery 4 | 10 Help 2

## Specificity
Authored for Eatlog (M3 Expressive tokens, macro color coding, honesty note, undo-first). Details are product-specific but don't agree with each other.

## Priority issues
- [P1] Same nutrition data drawn two ways (summary card cal+3 vs per-food 4-equal-columns). Unify macro-row grammar. -> layout
- [P1] Primary interactions have no motion: row expand pops in, calorie total snaps. Add entering FadeInUp on expanded block (safe vs layout-clip constraint) + withTiming on totalMacros.calories. -> animate
- [P1] Two mismatched Redo buttons: meal-level bare pill vs component-level filled container. Unify. -> polish
- [P2] Accordion slams previous row shut on open, no transition, blocks comparison. Allow multiple or animate collapse. -> animate
- [P2] Editable nutrition is two disclosures deep (row -> Nutrition values). Surface for renamed foods. -> distill

## Persona red flags
- Alex: no bulk remove/re-estimate; accordion = per-food open/edit/close.
- Casey: opened food near bottom can land under keyboard; no scroll-into-view on expand.
- Sam: absolute Pressable overlay over collapsed row content — verify no double-announce.

## Minor
- "Nutrition stays unchanged until you redo it." always present once name diverges; could retire after ack.
- Redo icon hard-swaps to spinner, no crossfade.
- No press-scale anywhere; active:opacity only.
