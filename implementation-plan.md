# Marco Native Audit Implementation Plan

## Purpose

Use this plan to address findings from the native Android audit completed on 2026-07-31. The audit scored Marco **14/20 (Good)**:

| Dimension | Score | Primary concern |
|---|---:|---|
| Accessibility | 3/4 | Unlabeled recovery controls and one contrast failure |
| Performance | 2/4 | No virtualized lists and eager tab loading |
| Appearance & Theming | 3/4 | Semantic colors bypass token indirection in older components |
| Platform Conformance | 4/4 | Native Android behavior is strong and should be preserved |
| Adaptivity | 2/4 | Inconsistent keyboard handling and fixed-width edge cases |

This is an implementation plan, not a redesign. Preserve the existing Android-only Expo architecture, Material 3 Expressive dark theme, Inter typography, NativeWind styling, scanner-first entry flow, local-first data model, and four-tab navigation with a separate Add FAB.

## Scope And Constraints

- Android-only, Expo SDK 54 managed workflow, React Native 0.81, TypeScript 5.9.
- Keep `Today`, `Diary`, `Analytics`, and `Profile` as the four destinations.
- Keep the center Add control as a button, not a fifth tab.
- Use `FlatList` or an equivalent React Native-compatible virtualized list where content is unbounded.
- Keep all touch targets at least 48dp, excluding purely decorative elements.
- Preserve `@gorhom/bottom-sheet` keyboard behavior and Android `adjustPan`; do not add `android_keyboardInputMode="adjustResize"` to interactive sheets.
- Use `M3` tokens or NativeWind tokens for semantic colors. Raw values remain acceptable only for fixed artwork or native API boundaries.
- Do not add backend, authentication, cloud sync, credential UI, iOS behavior, or tablet/foldable navigation in this pass.
- Do not modify unrelated user-owned worktree changes.

## Baseline

Before editing, inspect the worktree and record the current verification state:

```bash
git status --short
npm test
npx tsc --noEmit
npx expo export --platform android --dev
```

If a command fails, record whether it is pre-existing before changing code. Do not rewrite tests to hide failures.

## Priority Model

- **P0 Blocking:** prevents task completion or makes recovery impossible. None identified in this audit.
- **P1 Major:** fix before release; affects accessibility, performance, or common Android behavior.
- **P2 Minor:** fix in the next hardening pass; workaround exists.
- **P3 Polish:** improve consistency or resilience after P1/P2 work.

## Phase 1: Virtualize Dynamic Content

**Priority:** P1

**Impeccable command:** `/impeccable optimize`

### Problem

Dynamic content is rendered with `ScrollView` plus `.map()` throughout the app. Recent foods, search results, review components, and diary entries can grow without a rendering bound. No `FlatList`, `SectionList`, or `FlashList` is currently used.

### Files

- `src/components/sheet-states/RecentFoodsState.tsx`
- `src/components/sheet-states/SearchInputState.tsx`
- `src/components/sheet-states/ReviewState.tsx`
- `src/components/JournalSection.tsx`
- `src/screens/DiaryScreen.tsx`
- `src/components/AddComponentSection.tsx`

### Tasks

1. Replace unbounded recent-food and recent-meal `.map()` rendering with a bottom-sheet-compatible `FlatList` or `BottomSheetFlatList`.
2. Virtualize search results if the service can return more than one viewport of rows.
3. Keep the existing search input, keyboard behavior, empty state, error state, pin actions, and result accessibility labels.
4. Virtualize diary entries without breaking swipe-to-delete, undo, grouped meal rendering, photos, or accessibility actions.
5. Use stable IDs for `keyExtractor`; remove index-based keys such as `entry-slot-${index}`.
6. Keep review component lists bounded by a documented maximum or virtualize them if component count is not bounded.
7. Preserve `keyboardShouldPersistTaps="handled"` on lists containing inputs or action rows.
8. Avoid nesting virtualized lists inside same-direction scroll containers. If a sectioned diary list is introduced, flatten sections into list data or use one sectioned virtualized parent.

### Acceptance criteria

- A seeded history with 500 foods and 100 photographed meals does not mount every row at once.
- Recent foods, search results, and diary rows scroll without visible jank on a mid-range Android device.
- Pin, edit, delete, undo, photo opening, and TalkBack actions remain functional.
- No warning about nested virtualized lists appears during normal flows.

### Verification

- Run typecheck, tests, and Android export.
- Exercise Recent, Search, Review, and Diary with seeded large data.
- Confirm row mounts remain bounded during scroll using development logging or profiling.

## Phase 2: Reduce Startup And Render Work

**Priority:** P1

**Impeccable command:** `/impeccable optimize`

### Problem

All four tabs mount eagerly through `lazy: false`, while several screens perform database work on mount. Dashboard and Analytics also perform derived calculations directly in render bodies. List rows and sheet states create inline callbacks on each render.

### Files

- `src/navigation/TabNavigator.tsx`
- `App.tsx`
- `src/navigation/RootNavigator.tsx`
- `src/screens/DashboardScreen.tsx`
- `src/screens/AnalyticsScreen.tsx`
- `src/screens/DiaryScreen.tsx`
- `src/components/JournalSection.tsx`
- `src/components/sheet-states/ReviewState.tsx`
- `src/components/sheet-states/RecentFoodsState.tsx`
- `src/components/sheet-states/SearchInputState.tsx`

### Tasks

1. Set non-primary tabs to lazy loading where compatible with current navigation behavior. Start with Analytics and Profile; verify Diary behavior before changing it.
2. Keep the first frame useful. Do not introduce a second blank startup gate after database initialization without a visible loading or error state.
3. Move Dashboard derived values from lines 314-385 into focused `useMemo` blocks keyed only by their actual inputs.
4. Move Analytics filters, ranges, and average calculations into memoized derivations.
5. Move Diary aggregate reductions into existing memoized calculations rather than running four reductions on every render.
6. Memoize high-frequency leaf rows and pure controls only where props are stable and render cost justifies it. Do not wrap every component by default.
7. Stabilize callbacks passed to mapped rows with `useCallback` where that enables memoized children.
8. Clean up `ReviewState`'s removal timeout on unmount.
9. Keep photo cleanup deferred after interactions, as it is today.

### Acceptance criteria

- Initial launch does not mount and query every secondary tab before the user visits it.
- Toggling Dashboard consumed/remaining does not recompute unrelated date, weight, and profile derivations.
- Analytics range changes update only the required chart and metrics.
- No state update occurs after `ReviewState` unmounts with an active undo timer.
- No behavior changes to database loading, tab persistence, sheet state, or navigation.

### Verification

- Measure cold launch to first useful screen before and after.
- Use React Native development profiling to confirm fewer unnecessary renders on Dashboard and Diary.
- Run the automated and export gates.

## Phase 3: Accessibility Hardening

**Priority:** P1

**Impeccable command:** `/impeccable harden`

### Problem

Most primary flows have accessibility coverage, but error and fallback paths contain unlabeled controls. Several compact controls do not meet the 48dp target requirement, and one future-day label uses insufficient contrast.

### Files

- `src/components/sheet-states/FoodSheetContent.tsx`
- `src/components/sheet-states/SearchInputState.tsx`
- `src/components/sheet-states/DescribeInputState.tsx`
- `src/components/sheet-states/EntryMethodState.tsx`
- `src/components/DiaryEditSheet.tsx`
- `src/components/AddComponentSection.tsx`
- `src/components/MealSelector.tsx`
- `src/components/TappableRow.tsx`
- `src/components/WeekStrip.tsx`
- `src/components/sheet-states/RecentFoodsState.tsx`
- `src/components/sheet-states/ReviewState.tsx`
- `src/components/MacroRail.tsx`
- `src/components/Sheet.tsx`

### Tasks

1. Add explicit `accessibilityLabel` and `accessibilityRole="button"` to every unlabeled retry, fallback, result, cancel, save, clear, and add control identified by the audit.
2. Make labels contextual. A result row should announce food name and relevant nutrition, not only “button”.
3. Add labels to `EntryMethodState` rows, `MealSelector` choices, and `TappableRow` radio rows while preserving `accessibilityState={{ selected }}` or checked state.
4. Group each `MacroRail` cell into one accessible announcement, for example `Calories: 1,245 of 2,000`.
5. Increase pin/unpin and remove-component effective touch areas to at least 48dp. Keep the visual icon size unchanged if desired.
6. Raise `WeekStrip` future-day text opacity to a readable token value and verify contrast against the actual surface.
7. Add useful `accessibilityHint` text to controls that open sheets, navigate to editors, or trigger multi-step actions. Do not add redundant hints to self-explanatory buttons.
8. Keep live regions on loading, error, and toast states.
9. Do not treat the decorative sheet handle as the only close affordance. Ensure a labeled close/back path remains available to TalkBack users.

### Acceptance criteria

- Every interactive control in happy, loading, empty, and error states has a meaningful TalkBack name.
- Every actionable target is at least 48dp by 48dp, including icon-only controls.
- TalkBack announces macro values as coherent units rather than disconnected text nodes.
- Future-day labels meet readable contrast without changing their semantic disabled/future state.
- Existing `accessibilityActions` for diary rows and the ruler continue to work.

### Verification

- Run a TalkBack pass through onboarding, Today, Add, Search, Review, Diary edit, and Profile.
- Test retry, manual fallback, clear search, pin, remove component, save, and cancel paths.
- Repeat with Android font scale at 200%.

## Phase 4: Keyboard And Adaptivity Hardening

**Priority:** P1/P2

**Impeccable command:** `/impeccable adapt`, followed by `/impeccable harden` for form and keyboard recovery details.

### Problem

`OnboardingScreen` uses Android `KeyboardAvoidingView` behavior `height`, while `ProfilePlanScreens` disables it and relies on `adjustPan`. Profile forms also omit `keyboardShouldPersistTaps`. Fixed-width numeric columns may clip at large font scales.

### Files

- `app.json`
- `src/screens/OnboardingScreen.tsx`
- `src/screens/ProfilePlanScreens.tsx`
- `src/components/Sheet.tsx`
- `src/components/JournalSection.tsx`
- `src/components/sheet-states/RecentFoodsState.tsx`
- `src/components/sheet-states/WeightInputState.tsx`
- `src/components/PortionStepper.tsx`

### Tasks

1. Keep `softwareKeyboardLayoutMode: "pan"` for bottom-sheet compatibility.
2. Standardize full-screen form behavior after physical-device testing. Prefer one documented Android strategy rather than mixing `height` and disabled KAV without reason.
3. Add `keyboardShouldPersistTaps="handled"` to the ProfilePlanScreens ScrollView.
4. Test Save, Cancel, row selection, and navigation while the keyboard is open.
5. Add `underlineColorAndroid="transparent"` to the onboarding target-rate input to match the other numeric fields.
6. Replace fixed `w-[88px]` calorie columns with a flexible minimum width where this does not destabilize the row layout.
7. Verify numeric inputs, labels, and errors at 200% font scale; do not use `allowFontScaling={false}` as a shortcut.
8. Preserve measured chart resizing through `onLayout`.

### Acceptance criteria

- Keyboard never hides the focused field or primary action on onboarding and Profile forms.
- Buttons respond on the first tap when the keyboard is visible where the platform permits it.
- Bottom-sheet inputs retain current `interactive` behavior and Back dismissal.
- 200% font scale does not clip calorie values, weight inputs, errors, or save actions.

### Verification

- Test onboarding and Profile on at least two Android API/device profiles.
- Test manual food, search, weight, and review sheets with the keyboard open.
- Test portrait multi-window at phone width if available.

## Phase 5: Reduced Motion Completion

**Priority:** P2

**Impeccable command:** `/impeccable animate`

### Problem

Reduced-motion handling is strong overall, but FoodSheetContent's cross-state exit/re-entry path and GoalTypeSelector's press scale are not explicitly gated.

### Files

- `src/components/sheet-states/FoodSheetContent.tsx`
- `src/components/GoalTypeSelector.tsx`

### Tasks

1. Gate FoodSheetContent exit and re-entry `withTiming` durations with the existing reduced-motion value.
2. Replace or conditionally disable GoalTypeSelector's `active:scale-[0.97]` when reduced motion is enabled.
3. Preserve instant state changes and content visibility when animations are disabled.

### Acceptance criteria

- No nonessential movement occurs with Android Remove Animations/reduced motion enabled.
- Normal motion timing remains unchanged when reduced motion is disabled.
- Sheet state transitions do not flicker or remount unnecessarily.

### Verification

- Run each affected flow with system Remove Animations enabled and disabled.
- Confirm no content is hidden when animation is suppressed.

## Phase 6: Semantic Token Cleanup

**Priority:** P1/P3

**Impeccable command:** `/impeccable polish`

### Problem

Older components use approximately 50 raw hex values in icon colors, text colors, placeholders, and native styles. The values match the current design system, but bypassing `M3` makes future theme changes error-prone.

### Files

- `src/screens/OnboardingScreen.tsx`
- `src/screens/SetupCompleteScreen.tsx`
- `src/screens/ProfilePlanScreens.tsx`
- `src/components/PrimaryButton.tsx`
- `src/components/SegmentedControl.tsx`
- `src/components/TappableRow.tsx`
- `src/components/GoalTypeSelector.tsx`
- `src/components/DiaryEditSheet.tsx`
- `src/components/PortionStepper.tsx`
- `src/components/AddComponentSection.tsx`
- `src/components/sheet-states/EntryMethodState.tsx`
- `src/components/sheet-states/DescribeInputState.tsx`
- `src/components/sheet-states/ReviewState.tsx`
- `src/components/sheet-states/ScanningState.tsx`
- `src/components/sheet-states/SearchInputState.tsx`
- `src/components/ProfileNavigator.tsx`
- `src/theme/tokens.ts`
- `tailwind.config.js`

### Tasks

1. Import `M3` and replace raw semantic hex values with token references.
2. Replace `ProfilePlanScreens`' raw `placeholderTextColor` with `M3.placeholder`.
3. Replace `SegmentedControl`'s raw white thumb color with `M3.primary`.
4. Replace `PrimaryButton`'s raw black foreground with `M3.onPrimary`.
5. Add a Tailwind placeholder token only if it improves consistency with existing NativeWind usage; do not duplicate token values unnecessarily.
6. Leave fixed artwork and pre-NativeWind startup surfaces documented as exceptions where token APIs cannot be used.

### Acceptance criteria

- Runtime semantic colors have one authoritative source.
- Dark appearance remains visually unchanged.
- No raw semantic color is introduced in new or touched code without a documented reason.
- Typecheck and Android export pass after cleanup.

## Phase 7: Image And Dependency Cleanup

**Priority:** P2/P3

**Impeccable command:** `/impeccable optimize`

### Problem

Meal photos are stored and rendered at full resolution for small thumbnails, with no explicit image caching strategy. `react-native-gifted-charts` and `react-native-linear-gradient` have no source imports. `@expo/ngrok` is in production dependencies.

### Files

- `src/utils/mealPhotos.ts`
- `src/components/JournalSection.tsx`
- `src/components/sheet-states/RecentFoodsState.tsx`
- `package.json`
- `package-lock.json`

### Tasks

1. Confirm both chart/gradient dependencies have zero imports before removal.
2. Remove unused runtime dependencies and verify Expo export.
3. Move `@expo/ngrok` to `devDependencies` only if the local workflow still supports its existing command usage.
4. Evaluate thumbnail generation or image resizing at capture time while retaining original media for the full-screen viewer.
5. If adding an image library, verify Expo SDK 54 compatibility first and measure APK/bundle impact.
6. Do not add image infrastructure if local file URIs and current data volume make it unnecessary after profiling.

### Acceptance criteria

- APK no longer includes confirmed unused dependencies.
- Diary and Recent thumbnails load without visible quality regression.
- Full-screen meal photos retain current quality.
- Photo failure fallback remains intact.

## Phase 8: Release Verification

**Impeccable commands:** `/impeccable audit`, `/impeccable critique`, then `/impeccable polish`.

### Automated gate

Run:

```bash
npm test
npx tsc --noEmit
npx expo export --platform android --dev
git diff --check
```

Record exact results. No release claim is valid without reading command output.

### Physical Android matrix

| Area | Required cases |
|---|---|
| Accessibility | TalkBack onboarding, Add flow, Search recovery, Diary actions, Profile forms |
| Font scaling | Default, 150%, and 200% font scale |
| Reduced motion | System Remove Animations enabled and disabled |
| Keyboard | Onboarding, Profile, manual food, search, review, weight |
| Performance | 500 foods, 100 photos, repeated tab and sheet opening |
| Navigation | Four tabs, Add from every tab, Back through sheets, dirty-form discard |
| Visual | Dark theme, future dates, empty/error/loading states, token cleanup regression |
| Build | Signed APK install, cold start, force-stop/reopen, upgrade fixture if available |

### Exit criteria

- No P0 or P1 findings remain.
- All automated gates pass.
- TalkBack can complete common logging and recovery flows.
- Large seeded histories remain responsive.
- Keyboard and 200% font-scale checks pass on physical Android hardware.
- Native audit is rerun and results are recorded.

## Deferred Post-MVP Work

These items were identified but are intentionally outside this implementation pass:

- Tablet navigation rail or expanded-width layout.
- Foldable hinge/posture handling.
- Landscape support; the app remains portrait-locked.
- Android multi-window adaptation beyond phone-width verification.
- Dynamic Color integration; current static dark M3 scheme remains the product identity.
- Replacing `@expo/vector-icons` with a smaller icon delivery strategy unless APK profiling shows meaningful impact.

## Recommended Execution Order

1. Baseline and worktree check.
2. Virtualize dynamic lists.
3. Reduce eager startup and render work.
4. Harden labels, touch targets, grouped announcements, and contrast.
5. Standardize keyboard behavior and verify large text.
6. Complete reduced-motion gates.
7. Migrate semantic colors to tokens.
8. Remove dead dependencies and optimize images only if profiling supports it.
9. Run automated gates, physical-device matrix, and the native audit again.

## Impeccable Command Sequence

Use commands against the relevant surface only after the corresponding source changes are ready. These commands are review and hardening passes, not substitutes for tests or physical Android verification.

1. **`/impeccable optimize`**: Virtualize dynamic lists, reduce eager tab work, remove confirmed dead dependencies, and address measured render/image costs.
2. **`/impeccable harden`**: Add missing TalkBack labels, correct touch targets, group macro announcements, fix contrast, clean timers, and harden keyboard/error recovery.
3. **`/impeccable adapt`**: Verify 200% font scaling, fixed-width rows, keyboard behavior, and phone-width multi-window behavior.
4. **`/impeccable animate`**: Complete reduced-motion gates for FoodSheetContent and GoalTypeSelector without changing content behavior.
5. **`/impeccable polish`**: Finish semantic color-token migration and consistency cleanup after functional work is stable.
6. **`/impeccable audit`**: Re-run the native technical audit and compare scores against the 14/20 baseline.
7. **`/impeccable critique`**: Re-check interaction clarity and hierarchy after implementation changes.
8. **`/impeccable polish`**: Final pass after audit and critique findings are resolved.

## Completion Record

Update this section as implementation proceeds:

Impeccable passes reviewed during implementation: `/impeccable optimize`, `/impeccable harden`, `/impeccable adapt`, `/impeccable animate`, and `/impeccable polish`. Native audit and physical-device checks remain pending because this workspace has no Android device or TalkBack/font-scale test environment.

| Phase | Status | Verification | Notes |
|---|---|---|---|
| Baseline | Partial | `npm test`, `npx tsc --noEmit`, `git diff --check` pass | Android export did not complete in the available run; physical checks unavailable |
| Virtualize dynamic content | Implemented | Typecheck and tests pass | Bottom-sheet lists and the diary use stable keyed virtualized rows; large-data device profiling pending |
| Startup/render performance | Implemented | Typecheck and tests pass | Lazy tabs, memoized derived data, and timer cleanup applied |
| Accessibility hardening | Implemented | Typecheck and tests pass | Labels, hints, grouped macro announcements, and 48dp targets applied; TalkBack pending |
| Keyboard/adaptivity | Implemented | Typecheck and tests pass | Keyboard persistence, flexible columns, and tokenized placeholders applied; 200% font-scale check pending |
| Reduced motion | Implemented | Typecheck and tests pass | Sheet transitions and selector motion are gated; system-toggle check pending |
| Token cleanup | Implemented | Typecheck and `git diff --check` pass | Semantic colors migrated in touched UI surfaces |
| Image/dependency cleanup | Partial | Lockfile refresh completed | Confirmed dead chart/gradient dependencies removed; image optimization deferred until profiling |
| Release verification | Partial | `npm test`, `npx tsc --noEmit`, `git diff --check` pass | Android export and physical-device matrix still pending |
