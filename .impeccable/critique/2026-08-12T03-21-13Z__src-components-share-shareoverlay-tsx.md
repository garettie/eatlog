---
target: share implementation
total_score: 23
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
timestamp: 2026-08-12T03-21-13Z
slug: src-components-share-shareoverlay-tsx
---
Method: dual-agent (A: /root/share_design_review · B: /root/share_detector_evidence)

# Share implementation critique

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 2/4 | Meal output actions become dim while the photo/card is loading, but no visible status explains what is pending. |
| 2 | Match System / Real World | 3/4 | “Full bleed” and “Stat” expose design vocabulary without group labels or explanation. |
| 3 | User Control and Freedom | 3/4 | Close, Android Back, and pan-down exits are present, but a missing meal photo has no retry or alternate output path. |
| 4 | Consistency and Standards | 2/4 | The Android entry points use an `ios-share` glyph, while the overlay uses Material `share`; “Streak” also conflicts with the app’s established “Logging consistency” vocabulary. |
| 5 | Error Prevention | 2/4 | A stale photo is allowed to open the composer before failing, and branding can silently fall back to enabled if preference hydration fails. |
| 6 | Recognition Rather Than Recall | 2/4 | Meal sharing is hidden behind tapping the photo or swiping left; the resting meal card has no visible share affordance. |
| 7 | Flexibility and Efficiency | 3/4 | Three meal layouts plus Save and Share provide useful options, but individual meal sharing has no photo-free fallback. |
| 8 | Aesthetic and Minimalist Design | 3/4 | The preview is focused and polished in source, but the bundled meal composer exposes up to nine task choices around it. |
| 9 | Error Recovery | 2/4 | Capture/save/share failures reduce to generic “Try again” alerts, and the broken-photo state offers no recovery action. |
| 10 | Help and Documentation | 1/4 | Public reviewer and privacy material describes a removed 1080×1350 JPEG and Summary/Macros/Components implementation. |
| **Total** |  | **23/40** | **Acceptable — strong artifact design, significant release and journey gaps** |

## Design Specificity Verdict

**LLM assessment:** Authored at the card layer; generic and internally conflicted at the flow layer. The photo-first Meal variants combine personal imagery, Onest, tabular nutrition, and Eatlog’s macro colors in a way that belongs to this product ([MealCard.tsx](/home/sgaret/eatlog/src/components/share/MealCard.tsx:56), [ShareCardPrimitives.tsx](/home/sgaret/eatlog/src/components/share/ShareCardPrimitives.tsx:173)). The Day card’s vertical macro capsules are also distinctive ([DaySummaryCard.tsx](/home/sgaret/eatlog/src/components/share/DaySummaryCard.tsx:57)).

The Streak card could belong unchanged to almost any habit or fitness app: a 96px streak number, “Longest streak,” and seven completion pills ([StreakCard.tsx](/home/sgaret/eatlog/src/components/share/StreakCard.tsx:51)). That is not just generic; it contradicts Eatlog’s serious-instrument positioning and explicit ban on streak gamification ([PRODUCT.md](/home/sgaret/eatlog/PRODUCT.md:138), [DESIGN.md](/home/sgaret/eatlog/DESIGN.md:280)). The text-pill `BrandBadge` also leaves the app’s distinctive egg identity behind and uses calorie blue as a decorative dot ([ShareCardPrimitives.tsx](/home/sgaret/eatlog/src/components/share/ShareCardPrimitives.tsx:46)).

**Deterministic scan:** The required scan returned `[]` with exit code 0: **0 findings** in [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:1). That clean result credibly confirms baseline mechanics in the scanned file: the branding toggle has switch semantics, Close is labeled and 48dp, the preview has a composite image label, and Save/Share expose disabled and busy state ([ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:93), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:366), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:406), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:463)). It does not validate the imported card components or judge product coherence, discovery, copy, or release documentation. There were no false positives.

**Visual overlays:** No reliable overlay is available. This session exposed no browser canvas/mutable injection API or Android device automation; `adb`, emulator, Chromium, and Playwright executables were absent. No live server was started. Runtime appearance claims in this report are therefore source-derived, not screenshot-verified.

## Overall Impression

The implementation has a real visual idea, especially when a personal meal photo becomes the 9:16 artifact. The surrounding journey feels assembled around every technically shareable metric instead of edited around one clear user intent. The biggest opportunity is to make the composer outcome-first: preserve the live artifact, let the entry point determine what is being shared, keep output actions persistently reachable, and reveal customization only when requested.

## What’s Working

- **The preview is the exported artifact.** `StoryCanvas` establishes a fixed 360×640 design surface, while capture creates a 1080×1920 PNG. The user is editing the composition that will be shared, not a loose mock ([ShareCardPrimitives.tsx](/home/sgaret/eatlog/src/components/share/ShareCardPrimitives.tsx:7), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:254)).
- **The Meal card earns the photo’s prominence.** Full bleed, Framed, and Stat are genuinely different information compositions rather than color swaps. The full-bleed treatment is the emotional peak because it foregrounds the user’s own meal while keeping nutrition legible ([MealCard.tsx](/home/sgaret/eatlog/src/components/share/MealCard.tsx:63), [MealCard.tsx](/home/sgaret/eatlog/src/components/share/MealCard.tsx:103), [MealCard.tsx](/home/sgaret/eatlog/src/components/share/MealCard.tsx:146)).
- **Native interaction hygiene is mostly sound.** Repeated operations are guarded, reduced motion is respected, permission denial can route to Settings, Save is announced, controls meet the 48dp Android floor, and the shared sheet honors Back and safe-area insets ([ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:242), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:281), [Sheet.tsx](/home/sgaret/eatlog/src/components/Sheet.tsx:81), [SegmentedControl.tsx](/home/sgaret/eatlog/src/components/SegmentedControl.tsx:106)).

## Cognitive Load

**Moderate: 3 of 8 checklist failures.** Chunking, grouping, visual hierarchy, working-memory support, and basic progressive disclosure pass. Single focus, one-thing-at-a-time, and minimal choices fail because a meal share can ask the user to choose content, layout, branding, and destination simultaneously.

Decision points above four visible choices:

- Diary meal with streak data: Meal/Day/Streak + Full bleed/Framed/Stat + badge + Save + Share = **9** visible task choices ([DiaryScreen.tsx](/home/sgaret/eatlog/src/screens/DiaryScreen.tsx:594), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:382)).
- Diary meal without streak data: Meal/Day + three layouts + badge + Save + Share = **8**.
- Diary day header with streak data: Day/Streak + badge + Save + Share = **5** ([DiaryScreen.tsx](/home/sgaret/eatlog/src/screens/DiaryScreen.tsx:614)).

## Emotional Journey

- **Entry:** Today and Analytics rely on an icon-only, iOS-shaped share symbol. Diary meal sharing is more obscure: tap the image or discover the left-swipe action. The journey begins with recognition rather than confidence ([DashboardScreen.tsx](/home/sgaret/eatlog/src/screens/DashboardScreen.tsx:420), [JournalSection.tsx](/home/sgaret/eatlog/src/components/JournalSection.tsx:90), [JournalSection.tsx](/home/sgaret/eatlog/src/components/JournalSection.tsx:250)).
- **Rise and peak:** Opening onto the large live preview, then seeing a personal meal photo in Full bleed, creates the strongest sense of ownership.
- **Valleys:** Output actions can start below the first compact-phone viewport; an initially dim action has no loading explanation; unfamiliar layout names invite trial-and-error; a broken photo replaces the artifact with a dead-end alert card.
- **End:** Save ends well with a snackbar and accessibility announcement ([ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:303), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:503)). Share correctly hands control to the OS chooser, but the app cannot distinguish completion from cancellation and provides no additional closure after the chooser returns.

## Priority Issues

### 1. [P1] “Streak” violates the product’s stated psychology

**What:** Analytics calls the feature “Logging consistency,” but its share action constructs a `streak`, and the exported card celebrates current and longest streaks ([AnalyticsScreen.tsx](/home/sgaret/eatlog/src/screens/AnalyticsScreen.tsx:888), [StreakCard.tsx](/home/sgaret/eatlog/src/components/share/StreakCard.tsx:41)).

**Why it matters:** Eatlog explicitly rejects streaks and gamification noise. This card changes the product’s voice from a calm measurement instrument into a generic habit tracker at the exact moment the artifact becomes public ([PRODUCT.md](/home/sgaret/eatlog/PRODUCT.md:142), [DESIGN.md](/home/sgaret/eatlog/DESIGN.md:107)). The “today grace” calculation can also show a current streak while today’s visible pill is incomplete, creating an apparent contradiction ([shareCards.ts](/home/sgaret/eatlog/src/utils/shareCards.ts:153)).

**Fix:** Replace Streak with a Consistency card that reuses the incumbent rolling 30-day block and visible `n/7 this week` language. Remove current/longest streak semantics entirely.

**Suggested command:** `$impeccable shape`

### 2. [P1] A missing meal photo turns sharing into a dead end

**What:** A meal payload cannot exist without a photo URI, and a stale URI opens a composer whose only preview says the photo is unavailable while both outputs stay disabled ([shareCards.ts](/home/sgaret/eatlog/src/utils/shareCards.ts:95), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:393)).

**Why it matters:** The primary individual-meal task becomes impossible after entry, with no Retry, Use nutrition card, or Share day fallback. It also conflicts with the app’s established semantic-icon fallback language ([DESIGN.md](/home/sgaret/eatlog/DESIGN.md:111), [NutritionCard.tsx](/home/sgaret/eatlog/src/components/NutritionCard.tsx:97)).

**Fix:** Make `photoUri` optional in meal share data. Render a deliberate nutrition-first/icon composition when no photo exists or image loading fails, state that the photo could not be used, and keep Save/Share available. If photo-free meal sharing is intentionally out of scope, the stale-photo fallback is still mandatory.

**Suggested command:** `$impeccable harden`

### 3. [P2] The composer makes customization compete with completion

**What:** Diary entry points bundle Meal, Day, and Streak into one request, then add three styles, branding, Save, and Share. The output row sits at the end of the same `ScrollView` as every control ([DiaryScreen.tsx](/home/sgaret/eatlog/src/screens/DiaryScreen.tsx:594), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:359), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:463)).

**Why it matters:** The user asked to share a specific thing, but the UI reopens that decision and pushes the actual action down the sheet. Source-derived sizing on a representative 360×800dp viewport puts a roughly 404dp meal preview plus the selectors, branding, hint, and footer beyond the initial 92%-height viewport.

**Fix:** Let the entry point lock the content. Move alternate cards behind a secondary “More cards” disclosure if they must remain. Keep Save/Share in a safe-area-aware sticky footer and let only preview/settings scroll.

**Suggested command:** `$impeccable distill`

### 4. [P2] Discovery, iconography, and labels disagree about the action

**What:** Android entry points use `ios-share`, the overlay uses `share`, meal sharing is hidden behind image tap/swipe, selector groups are unlabeled, and “Full bleed”/“Stat” assume design vocabulary ([DashboardScreen.tsx](/home/sgaret/eatlog/src/screens/DashboardScreen.tsx:420), [DiaryScreen.tsx](/home/sgaret/eatlog/src/screens/DiaryScreen.tsx:617), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:55)). The Story helper implies an Instagram path, but the code opens only the generic OS share chooser ([ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:320), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:458)).

**Why it matters:** First-timers must infer both where Share lives and what several choices mean. The Android-native promise is weakened by an iOS glyph, and destination-specific copy raises an expectation the app cannot guarantee.

**Fix:** Standardize the Material `share` icon; add a visible share affordance to photo meals; label groups “What to share” and “Style”; rename styles to user outcomes such as “Photo,” “Framed photo,” and “Nutrition”; describe the generic device share menu rather than Instagram.

**Suggested command:** `$impeccable clarify`

### 5. [P1] Release-facing documentation describes a different feature

**What:** Reviewer and privacy material promises Summary/Macros/Components cards rendered as a 1080×1350 JPEG and cites removed implementation files ([REVIEW_MATERIAL.md](/home/sgaret/eatlog/release/store/REVIEW_MATERIAL.md:11), [DATA_INVENTORY.md](/home/sgaret/eatlog/release/privacy/DATA_INVENTORY.md:58), [DATA_INVENTORY.md](/home/sgaret/eatlog/release/privacy/DATA_INVENTORY.md:71)). Current source offers Meal/Day/Streak and captures a 1080×1920 PNG ([ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:48), [ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:262)).

**Why it matters:** Store reviewers will follow instructions that do not match the build, and privacy/permission documentation makes concrete false claims about user-generated files. This is a release trust defect, not editorial polish.

**Fix:** Update every reviewer, privacy, metadata, and source-evidence reference from the implemented contract, then add a release check that asserts format, dimensions, and supported card kinds from one source of truth.

**Suggested command:** `$impeccable harden`

## Persona Red Flags

### Jordan — first-timer

- Today exposes only `ios-share`; Diary meal sharing requires discovering the image tap or left swipe.
- “Full bleed” and “Stat” have no visible “Style” context and assume design knowledge.
- The broken-photo state says what failed but offers no next action.
- A Diary meal can open with three unrelated content types, so Jordan must re-decide what was just requested.

### Sam — accessibility-dependent user

- Individual segments are semantic radios, but neither segmented-control container exposes an accessible group label such as “Content” or “Style” ([SegmentedControl.tsx](/home/sgaret/eatlog/src/components/SegmentedControl.tsx:72)).
- The in-app preview has a strong composite accessibility label, but that semantic description cannot travel with the exported bitmap; recipients depend on the destination app and user-supplied alt text.
- Completed days in the exported Streak card rely on blue-versus-dark pill styling without a checkmark or other non-color status mark ([StreakCard.tsx](/home/sgaret/eatlog/src/components/share/StreakCard.tsx:94)).

### Casey — distracted, one-handed mobile user

- Save and Share are after the scroll content rather than persistently in the bottom thumb zone.
- A meal composer can show eight or nine choices before the one intended action is complete.
- An interrupted or failed photo load leaves no one-tap fallback.
- Alerts for capture/share failures require dismissal, then a manual return to the same footer action.

## Minor Observations

- `LiquidMacroCapsule` places its only variable-height fill at the top of the capsule, so the source-derived result grows downward rather than rising from the bottom; the 4px highlight also remains at that top edge ([ShareCardPrimitives.tsx](/home/sgaret/eatlog/src/components/share/ShareCardPrimitives.tsx:100)).
- `BrandBadge` is a generic word pill rather than the recognizable egg/ruler identity, and its blue dot spends the calorie semantic color as decoration ([ShareCardPrimitives.tsx](/home/sgaret/eatlog/src/components/share/ShareCardPrimitives.tsx:46)).
- “Shown on every card you post” is inaccurate for Save image. “Shown on exported cards” covers both paths ([ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:102)).
- Branding starts `true`, hydrates asynchronously, and logs load failure only to the console. Because the overlay mounts with the tab shell, a race is likely brief, but failed hydration can still export an unwanted badge ([ShareOverlay.tsx](/home/sgaret/eatlog/src/components/share/ShareOverlay.tsx:153), [TabNavigator.tsx](/home/sgaret/eatlog/src/navigation/TabNavigator.tsx:467)).
- The targeted utility test file contains five builder/calculation cases and passes, but no component, native capture, permission, accessibility, or screenshot test covers the actual share composer ([shareCards.test.ts](/home/sgaret/eatlog/src/utils/shareCards.test.ts:51)).
