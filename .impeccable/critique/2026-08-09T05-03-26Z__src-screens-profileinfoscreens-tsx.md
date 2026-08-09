---
timestamp: 2026-08-09T05-03-26Z
slug: src-screens-profileinfoscreens-tsx
target: How Eatlog Works screen
total_score: 21
max_score: 36
na_heuristics: "5"
p0_count: 0
p1_count: 2
---
# How Eatlog Works critique

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Native navigation and link feedback are clear. |
| 2 | Match with the real world | 2 | BMR, TDEE, half-life, regression, and coefficients create a jargon barrier. |
| 3 | User control and freedom | 3 | Native Back and browser handoff provide clear exits. |
| 4 | Consistency and standards | 3 | M3 and Onest are consistent, but formula panels do not match the shared card vocabulary. |
| 5 | Error prevention | n/a | The screen has no input or consequential decision. |
| 6 | Recognition rather than recall | 2 | Later sections require users to remember earlier terms and rules. |
| 7 | Flexibility and efficiency | 1 | The screen provides one long technical reading path. |
| 8 | Aesthetic and minimalist design | 2 | Clean grouping cannot offset the volume and equal visual weight of method details. |
| 9 | Error recovery | 3 | Link errors identify the problem and recovery action. |
| 10 | Help and documentation | 2 | The content is cited but organized around implementation details instead of user questions. |
| **Total** | | **21/36** | **Acceptable; simplify before release.** |

## Design specificity verdict

The content is specific to Eatlog, but the repeated heading, paragraph, formula panel, divider pattern feels like a technical settings appendix. The screen explains the machinery before it explains why the product helps. A stronger Eatlog story is: the app starts with a personal estimate, your logs create evidence, Eatlog suggests a change, and you decide what happens.

The deterministic scan returned zero findings. That confirms the source avoids the scanner's known visual anti-patterns, but it does not measure comprehension. No Android device or emulator was connected, so no runtime overlay or screenshot inspection was available.

## Overall impression

The screen is honest and well cited, but too detailed for its primary audience. The main opportunity is progressive disclosure: show the mental model first and place the technical proof behind one optional action.

## What works

- The screen states that targets and food results are estimates instead of presenting them as measurements.
- The approval message gives users control over adaptive target changes.
- Semantic headers, labeled links, M3 tokens, and Onest roles provide a sound accessible base.

## Priority issues

### P1: Method detail overwhelms the mental model

The first section introduces an equation, activity coefficients, and an energy conversion before users learn the practical benefit. Later sections add smoothing, regression, evidence thresholds, and a blend ratio.

Fix: replace the main path with three plain-language steps. Keep exact methods in a collapsed source section.

### P1: User benefit and approval arrive too late

The strongest ideas, including scale-noise smoothing and user approval, appear after substantial scrolling.

Fix: describe the benefit of each step and put the approval reassurance before research material.

### P2: Repetitive panels flatten the hierarchy

Formula rows, stat tiles, dividers, callouts, and six source links carry similar weight.

Fix: use one shared card for the three-step model, one calm callout, and one source disclosure.

### P2: Color meaning drifts

Lavender appears as a default heading accent and nutrient colors compete inside a help article.

Fix: reserve calorie blue for the starting target and lavender for trend or adaptive signals. Use neutral M3 colors elsewhere.

### P2: Research appears as required reading

Six links form the last visible block and exceed the four-item working-memory limit.

Fix: collapse the source list by default and use plain-language titles when expanded.

## Persona red flags

- **Jordan, first-timer:** The screen opens with formulas and unexplained abbreviations, so it does not answer what Eatlog does within five seconds.
- **Casey, distracted mobile user:** The useful reassurance sits below a long technical scroll that is difficult to resume after interruption.
- **Sam, accessibility-dependent user:** Formula operators and abbreviations may read poorly in TalkBack, while visual grouping carries part of their meaning.

## Minor observations

- The native title and the page title compete.
- Food estimates and trend weight combine two concerns in one heading.
- The Profile row description primes users for a technical appendix.

## Questions considered

- The user has already chosen the priority: regular-user comprehension over full calculation detail.
- The user has already chosen the scope: keep sources available and align colors with the existing app.
