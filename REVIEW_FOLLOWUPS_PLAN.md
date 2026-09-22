# Review follow-ups: meal-title fix and UI polish brief

Written 2026-09-22 at the end of a long review session so a fresh session can execute it. Part 1 is
a complete implementation plan. Part 2 is deliberately **not** a plan: it is a brief for an
Impeccable-led critique that must happen before any UI step is written.

Verify every file and line reference against the current tree before relying on it; other agents
commit into this checkout concurrently.

---

## Part 0 — Loose end: commit the Worker test fix

`worker/test/index.test.ts:161` hard-coded `expires_date: '2026-09-22T00:00:00Z'` in the
`paidRevenueCat()` fixture. On 2026-09-22 the fixture expired and five entitlement-cache tests
failed (paid customers resolved to `pugo`). The working tree changes it to
`new Date(Date.now() + 30 * 86_400_000).toISOString()`; all 82 Worker tests pass with it.

- Confirm `git diff worker/test/index.test.ts` shows only that line, then commit it to `main`
  (name the file explicitly; never `git add -A`).

---

## Part 1 — Scan titles containing digits are discarded (logic fix, no Impeccable needed)

### Symptom

The owner scanned a meal titled **"24 Chicken 3 piece yangnyeom with garlic rice"** (24 Chicken is
a restaurant; "3 piece" is the menu item). The Diary shows **"Chicken 3 piece yangneom with ga…"**:
the brand number is gone and the spelling changed.

### Root cause (verified)

`src/services/foodScan.ts` (around line 415):

```ts
const providedMealTitle = scanTitle && !/\d/.test(scanTitle) ? scanTitle : undefined;
```

Any Scan title containing a digit is discarded and Gemini's `mealName` is used instead. The Worker
prompt (`worker/src/index.ts` around line 362) tells Gemini "Amounts never belong in mealName", so the
model treated "24" as an amount, dropped it, and wrote its own spelling.

`formatFoodDisplayName` is **not** at fault: running the exact title through it returns it
unchanged. `stripFoodAmount` in `src/utils/foodDisplayName.ts` already detects real amounts (leading
`72g`/`2 cups`/`2 eggs`, trailing amounts, parenthetical amounts) while leaving brand numbers alone
(counts above 20, and a number before a non-plural word such as "24 Chicken").

### Change

1. **App — `src/services/foodScan.ts`.** Replace the any-digit test with real amount detection:
   keep the user's title unless `stripFoodAmount(scanTitle) !== scanTitle` (i.e. the title actually
   states an amount). When it does state an amount, keep today's behavior and use the model's name,
   so the existing test `a scan title stating an amount sends the amount but keeps the estimated meal
   name` ("72g bear brand" → "Bear Brand milk") still holds. Import `stripFoodAmount` from
   `../utils/foodDisplayName`.
2. **Worker — `worker/src/index.ts` prompt.** Extend the mealName sentence so numbers that are part of
   a brand, restaurant, or product name are kept (examples: "24 Chicken", "7-Eleven", "100 Plus").
   Keep it to one short clause: food-estimation prompts sit under a test-enforced request-size
   budget (`AGENTS.md`), so run the Worker tests after editing. Describe relies on the model's name,
   so this is the only fix that reaches Describe.

### Decision already implied — confirm with the owner before shipping

With change 1, a mid-title count such as "3 piece" survives in the name, because `stripFoodAmount`
only strips leading, trailing, and parenthetical amounts. `AGENTS.md` currently says stated amounts
"must never appear in `mealName`". The session's recommendation was to keep menu-item counts ("3
piece", "2pc") because that is what the restaurant calls the item, but the owner has not answered.
Ask; if he agrees, tighten that `AGENTS.md` line to exempt menu-item names the user typed.

### Tests (write first, watch them fail)

In `src/services/foodScan.test.ts`:

- "24 Chicken 3 piece yangnyeom with garlic rice" as a Scan title → `mealName` equals the title
  (model returns something different in the mock).
- "72g bear brand" → model name (existing test; must stay green).
- "100 Plus" and "7-Eleven hotdog" → title kept.
- "2 cups chicken adobo" → model name.

In `src/utils/foodDisplayName.test.ts`, add `stripFoodAmount('24 Chicken 3 piece yangnyeom')`
unchanged, to pin the behavior change 1 depends on.

### Verify

- `env TMPDIR=/tmp npx tsx --test src/services/foodScan.test.ts src/utils/foodDisplayName.test.ts`
- `env TMPDIR=/tmp npm test` and `npx tsc --noEmit`
- The app change is JavaScript-only (EAS Update). The Worker prompt change needs the owner to deploy
  the Worker; do not infer its deployment state from git.

---

## Part 2 — UI polish: brief for an Impeccable-led session

**The owner does not trust design passes made without the `impeccable` skill.** Invoke it first and
run its critique on the recordings before proposing any step. The observations below came from an
ad-hoc pass and are provisional input, not findings.

### Material

- Recordings: `/mnt/d/Users/lenovo/Downloads/appui.mp4` (Today, Diary, Add entry, recent meals,
  search, Log weight, Analytics, Profile, Plan) and `/mnt/d/Users/lenovo/Downloads/uploadfood.mp4`
  (Upload photo → Identify meal → estimate wait → Review → Add food → date picker → Discard).
  Both are 464×1024 at only 17–20 fps; do not judge smoothness from them.
- Extracted frames: `tmp/ui-recordings/frames/` (1 fps contact sheets `appui_*.png`, `up_*.png`;
  full-size stills `today.png`, `diary.png`, `diary2.png`, `loading.png`; sequences
  `discard_seq.png`, `load_to_review.png`).
- Static ffmpeg for more frames: `tmp/ui-recordings/ffmpeg`, e.g.
  `tmp/ui-recordings/ffmpeg -ss 12 -i <video> -frames:v 1 out.png`.
- An earlier Impeccable critique of the review sheet exists (untracked):
  `.impeccable/critique/2026-08-28T08-04-05Z__src-components-sheet-states-reviewstate-tsx.md`.
  Read it first and check which of its findings still apply.
- There is no emulator or device access (company laptop, USB disabled). Visual verification after
  changes happens by the owner recording his phone.

### Owner decisions already made

1. **Replace the meal-date dialog with an inline calendar grid.** The review footer's date button
   opens `src/components/DateSelector.tsx` (native spinner: "TODAY / CANCEL / SET DATE"). Replace it
   for meal dates with a tap-based month grid inside the sheet, reusing the look of the Diary
   calendar (`src/components/WeekStrip.tsx`, the month view in `src/screens/DiaryScreen.tsx`,
   `src/components/MonthlyCalorieCalendar.tsx`). The owner chose the grid because every previous
   AI-built wheel picker failed. No scroll wheels. JavaScript-only so it ships over the air.
   `DateSelector` is also used for weight (`WeightInputState.tsx`) and birthday
   (`ProfilePlanScreens.tsx`); those bounded pickers are out of scope unless the critique argues
   otherwise and the owner agrees.
2. **Remove the P/C/F chips from Diary meal-section headers** (keep per-meal chips unless the
   critique argues otherwise).
3. **Remove the "Beta" badge from Search foods** (`EntryMethodState.tsx`, `badge="Beta"`).
4. **"Bfast" is open.** `src/components/MealSelector.tsx` uses `compactLabel: 'Bfast'` because
   "Breakfast" does not fit. The owner asked whether abbreviating is bad; the critique should decide
   between tighter chip padding, a smaller date button, or keeping it.

### Provisional observations for the critique to confirm or reject

- The stock Android `Alert.alert` "Discard changes?" dialog (`ReviewState.tsx`,
  `AddComponentView.tsx`) clashes with the custom sheets. Other `Alert.alert` uses exist in
  `MealPhotoEditor.tsx`, `WeightInputState.tsx`, `DiaryScreen.tsx`, `OnboardingScreen.tsx`,
  `ProfileInfoScreens.tsx`.
- The AI estimate wait (~12–15 s) is a bare spinner; the sheet changes height three times (Identify
  meal → loading → Review) although the photo is already known.
- Review shows one-decimal grams (20.4g) while Today and Diary show integers.
- Macros are drawn four ways (Today bars, Diary chips, Analytics tinted tiles, Profile plain text).
- Diary thumbnails pop in from empty grey squares.
- Minor: "PINNED AND RECENT" is the only all-caps label; the Log weight button's icon trails its
  label while other CTAs lead with the icon; a purple accent appears only on the adaptive badge and
  "Next review"; the Profile header card repeats targets the list below shows.
- Motion drift from source: onboarding transitions (`OnboardingScreen.tsx` ~217–234) use their own
  easings/durations instead of `src/theme/motion.ts`; `MacroSummaryCard.tsx` hard-codes 90/160 ms.

### Rejected — do not reintroduce

- Shortening AI meal names. Long names ("Tender Juicy Giant Hotdogs with Uncle John's Chicken
  Fingers and Rice") are intentional: they carry context for the model.
- Recent-meal suggestions under Describe (duplicates Recent meals and Search history).

### Constraints from `AGENTS.md` that bind this work

- The meal-review footer keeps the date action and the Breakfast/Lunch/Dinner/Snack selector visible
  together in one row; show `Today` or a short month/day without a year.
- Android date selection: never combine `maximumDate` with spinner display; JavaScript `ScrollView`
  wheels must not return.
- Bottom-sheet state changes use the 200 ms shell / 90 ms exit / 150 ms entrance choreography; never
  size an async sheet from its loading skeleton; never nest `BottomSheetScrollView` in
  `BottomSheetView`.
- NativeWind classes only; typography roles bind Onest; `text-compact` only for dense metadata.

### Output of that session

An Impeccable critique of the frames, then a numbered implementation plan for the four decisions plus
whatever critique findings the owner approves. Do not edit UI code before the owner approves that plan.
