# Meal Card Sharing Implementation Plan

> **Superseded.** This untracked plan describes an older 4:5 JPEG/overlay design that is not the shipped contract. Use `src/utils/shareContract.json`, `src/components/share/MealCard.tsx`, `release/qa/UI_SMOKE_SCRIPT.md`, `release/qa/DEVICE_MATRIX.md`, and `release/store/SCREENSHOT_PLAN.md` for the current 9:16 PNG Photo/Framed/Nutrition implementation with a permanent Eatlog mark and no mark toggle.

## Status and objective

Approved for implementation. No feature code has been written.

Add local meal-card export to Diary photo meals. A user can open a saved meal photo, choose one of three fixed overlays, save the rendered image to Photos or Gallery, or pass it to the native Android or iOS share sheet. The same composer opens from a new Diary swipe action placed directly left of Delete.

The feature remains local-first. Eatlog renders one derived JPEG on-device and sends it only to a destination the user selects. It adds no account, backend, upload endpoint, social graph, analytics event, or database field.

Success means:

- Every Diary meal with a stored photo exposes Share from the photo viewer and from the row's swipe actions.
- Both entry points open one composer with the same meal snapshot and selected-overlay behavior.
- The exported image is a 1080 by 1350 JPEG. It preserves the complete source photo inside a fixed 4:5 canvas and uses solid tonal padding when the aspect ratios differ.
- Summary, Macros, and Components overlays render the logged title and deterministic nutrition totals. The Components option uses stored component rows and performs no inference.
- Save image writes the selected result to the device library. Share opens the platform share sheet with that result.
- Generated files stay in cache, contain no source EXIF metadata, and are deleted after the save or share attempt.
- Standalone foods and meals without a photo retain Delete as their only swipe action.
- Android and iOS Back, permission, cancellation, missing-photo, long-content, reduced-motion, and screen-reader paths work.

## Fixed product decisions

| Decision | Contract |
| --- | --- |
| Feature name | Use `Share meal` for the composer title, `Share` for actions, and `Save image` for gallery saving. Do not call the save action Download. |
| Export shape | Fixed 4:5 canvas at 1080 by 1350 output pixels. Show the complete photo with `contain`; use `surface-container-lowest` for any padding. Do not crop or stretch. |
| Entry points | Photo-viewer toolbar and a meal-only swipe action. The swipe action sits left of the rightmost Delete action. |
| Templates | `Summary`, `Macros`, and `Components`. Do not add a template editor or style picker. |
| Component truth | Use the saved `FoodLog[]` in Diary. Show `Estimated components` when any component source is `scan` or `describe`; otherwise show `Components`. Do not generate or infer ingredients during export. |
| Branding | Add a small `Eatlog` text mark inside each overlay. Do not add a URL, slogan, QR code, or promotional footer. |
| Private context | Keep diary date, meal period, calorie target, weight, goal, profile data, and component source names off the image. |
| Share scope | Share the generated image through the OS sheet. Do not build in-app contacts, feeds, public links, or share tracking. |
| Availability | Show Share only when `MealGroup.photoUri` is non-null. A missing file after opening becomes a recoverable error. |
| Release | The two new native modules and permission config require a new Android/iOS binary. Do not ship this feature as an OTA update to an older runtime. |

## Current checkout baseline

The next agent must recheck these facts before editing because the checkout can change.

| Area | Current implementation |
| --- | --- |
| Diary state | `src/screens/DiaryScreen.tsx` stores `viewingPhoto` as `{ uri, mealName }`, so it discards the loaded macros and components before opening the viewer. |
| Meal data | `MealGroup` in `src/components/JournalSection.tsx` already contains `id`, `name`, `photoUri`, and `components: FoodLog[]`. No query or migration is needed. |
| Totals | `MealRow` reduces its component rows into calories, protein, carbohydrates, and fat. The share payload must use the same arithmetic. |
| Thumbnail | `NutritionCard` owns an independently tappable photo rail and reports local image failure only inside the card. |
| Viewer | `src/components/MealPhotoViewer.tsx` is one full-screen `Modal` with Close, a one-line title, and a contained image. |
| Swipe row | Generic `SwipeRow` in `JournalSection.tsx` renders one 72dp Delete action and is shared by food and meal rows. It synchronously resets reused rows when `identity` changes. |
| Existing sharing | `expo-sharing` is installed. Backup and CSV export check `Sharing.isAvailableAsync()`, call `Sharing.shareAsync()`, then delete their temporary files. |
| Existing photo storage | `src/utils/mealPhotos.ts` stores canonical meal JPEGs in `documentDirectory/meal-photos`. Backup and orphan cleanup treat that directory as app data. Share output must never enter it. |
| Missing packages | `react-native-view-shot` and `expo-media-library` are absent from `package.json` and `package-lock.json`. |
| Test setup | Node tests cover pure TypeScript and config plugins. No React Native component renderer or screenshot-test harness exists. |
| Working tree at plan creation | Only `.pi-subagents/` was untracked before this plan. Preserve it and any later unrelated changes. |

## User experience contract

### Photo viewer

Keep the current full-screen photo viewer as the default result of tapping a Diary thumbnail.

- Keep Close at the left, the truncated meal title centered, and add a 48dp Share icon button at the right.
- Give the icon `accessibilityLabel="Share meal"` and a hint that it opens image choices.
- Keep the original photo contained on black. Do not put overlay controls on the inspection view.
- Tapping Share changes the same modal from photo mode to composer mode. Do not stack a second native `Modal` over the photo viewer.
- Android Back from composer mode returns to the photo when the user entered through the viewer. Back from the photo closes the modal.

### Diary swipe action

Widen `SwipeRow` with an optional `onShare` callback.

- Render a horizontal right-action container. The visual order is Share, then Delete, so Delete remains at the far right.
- Keep each action 72dp wide and at least 48dp tall.
- Give Share a `secondaryContainer` background with `onSecondaryContainer` icon and text. Preserve the current destructive treatment for Delete.
- Give the left corners to Share when present. Let the row's clipped container provide the outside right corners.
- On Share press, call `ref.current?.reset()`, clear `hasActiveSwipe.current`, then open the composer. The swipe row must not remain exposed behind the modal.
- Pass `onShare` only from `MealRow` when `meal.photoUri` exists. `FoodRow` and photo-less `MealRow` keep the current single Delete action.
- Preserve `identity`, `useLayoutEffect`, friction, threshold, and overshoot behavior.

Update the meal card's accessibility contract when a photo exists:

- Hint: `Opens meal editor. Swipe left for Share or Delete.`
- Actions: Edit, Share, Delete.
- Handle action names explicitly. Do not route an unknown action to Edit.

### Composer layout

Use the existing Material 3 dark vocabulary. This is an Operate surface.

1. A safe-area top bar shows Back or Close on the left and `Share meal` centered.
2. A horizontal paged carousel fills the main area. Each page centers one 4:5 preview and keeps a stable page width in portrait or landscape.
3. Reuse `SegmentedControl` under the preview with Summary, Macros, and Components. Swiping the carousel updates the control; tapping the control scrolls the carousel.
4. The safe-area footer places `Save image` as the secondary tonal action and `Share` as the primary action.

Use `useWindowDimensions()` to fit the preview by both available width and height. Keep 16dp outer spacing and 48dp controls. Do not hard-code a phone height. Disable carousel and segmented-control changes while capture, save, or share work is active.

Use platform scrolling for the carousel. Do not add another carousel package. Respect reduced motion when programmatic template changes scroll to a page.

### Overlay cards

Every card has an opaque background and an opaque tonal information panel. Use no gradient, blur, glass, shadow, or transparent text treatment. Use Onest, tabular figures, hairline boundaries, and named macro colors.

| Template | Content | Layout |
| --- | --- | --- |
| Summary | Meal title, calories, P/C/F, Eatlog mark | Photo-first card with a compact bottom panel. Title gets two lines. Calories retain a fixed numeric column. |
| Macros | Meal title, large calories, three macro values, Eatlog mark | A taller bottom panel with calories as the focal figure and equal P/C/F columns. Use macro colors only for their own label/value. |
| Components | Meal title, compact calories and P/C/F, component heading, component names, Eatlog mark | A larger bottom panel. Show the first four component names, then `+n more` as the fifth row when more than five exist. With five or fewer, show all of them. |

Content rules:

- Round calories and macro grams for display only. Keep unrounded totals in the payload.
- Keep the stored component order. Do not sort, merge, rewrite, or deduplicate names.
- Limit the meal title to two lines and each component to one line with ellipsis.
- Hide the Components template when the payload has zero components. Meal groups should not reach that state, but the UI must not render an empty component panel.
- Use `Estimated components` when at least one source equals `scan` or `describe`.
- Use `Components` for manual, USDA, Open Food Facts, or mixed non-AI sources.
- Do not show serving grams, per-component macros, brands, preparation, provider names, or uncertainty prose in v1.

### Navigation by origin

The modal needs to know how the user entered it.

| Origin | Initial mode | Back or Close from composer |
| --- | --- | --- |
| Photo thumbnail | Photo | Return to photo mode |
| Photo toolbar Share | Composer after mode change | Return to photo mode |
| Diary swipe Share | Composer | Dismiss to Diary |

Reset the selected template to Summary whenever the meal ID, photo URI, or initial mode changes. A template selected for one meal must not carry into another meal.

## Data contract

Create `src/utils/mealSharing.ts` with a UI-independent payload builder.

```ts
export type MealShareTemplateId = 'summary' | 'macros' | 'components';

export interface ShareableMealInput {
  id: number;
  name: string;
  photoUri?: string | null;
  components: FoodLog[];
}

export interface MealSharePayload {
  mealId: number;
  name: string;
  photoUri: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  componentNames: string[];
  componentHeading: 'Components' | 'Estimated components';
}

export function buildMealSharePayload(meal: ShareableMealInput): MealSharePayload | null;
```

Builder rules:

- Return `null` when `photoUri` is null or empty.
- Trim the meal name for export and fall back to `Meal` only if corrupted data contains an empty name.
- Sum the existing absolute `calories`, `protein_g`, `carbs_g`, and `fat_g` values once.
- Copy component names and the source-derived heading into an immutable snapshot.
- Do not include `log_date`, `meal`, source IDs, or profile state.

Use structural typing so `MealGroup` can enter the builder without moving the existing interface or making a utility depend on a UI component.

`DiaryScreen` should replace `viewingPhoto` with one modal state:

```ts
type MealMediaState = {
  payload: MealSharePayload;
  initialMode: 'photo' | 'share';
} | null;
```

Create separate handlers for thumbnail viewing and direct swipe sharing. Both call `buildMealSharePayload()` and set the same state. No handler may fetch from SQLite.

## Image generation and file lifecycle

### Capture

Install the Expo SDK 54-compatible versions through Expo:

```bash
npx expo install react-native-view-shot expo-media-library
```

Do not type package versions by hand. Let `expo install` choose versions compatible with the checked-in Expo SDK.

Render every visible preview through the same `MealShareCard` used for export. Do not maintain a second hidden approximation.

- Put `collapsable={false}` on each capturable card root.
- Keep a ref for each rendered template ID.
- Track photo readiness per template through `Image.onLoad` and `Image.onError`.
- Disable Save and Share until the selected template's image has loaded and its ref exists.
- Freeze template navigation while an operation runs.

Capture the selected ref with `captureRef()`:

```ts
const pixelRatio = PixelRatio.get();
const capturedUri = await captureRef(selectedCardRef, {
  result: 'tmpfile',
  format: 'jpg',
  quality: 0.95,
  width: 1080 / pixelRatio,
  height: 1350 / pixelRatio,
});
```

Use an opaque root so JPEG output has no undefined transparent areas. After capture, copy the result to a cache filename ending in `.jpg`, such as `eatlog-meal-${Date.now()}.jpg`. This guarantees the extension required by Media Library and avoids putting the meal title in attachment metadata.

Keep both the capture URI and named cache URI in local variables. Delete each with idempotent cache cleanup in `finally`, after `shareAsync()` or `saveToLibraryAsync()` resolves or rejects. Never copy output into `documentDirectory/meal-photos`.

### Save image

Use `expo-media-library` only after the user taps Save image.

1. Call `MediaLibrary.requestPermissionsAsync(true, [])` for write-only access with no granular read request.
2. If granted, call `MediaLibrary.saveToLibraryAsync(cacheJpegUri)`.
3. Show `Meal image saved.` through Diary's existing toast path.
4. Keep the composer open so the user can share the same layout afterward. A later Share action captures a fresh image.

If the user denies access and `canAskAgain` is false, offer Open settings through `Linking.openSettings()`. Do not request media permission when the composer opens or when the user taps Share.

### Native share

Reuse the established `expo-sharing` pattern:

```ts
if (!await Sharing.isAvailableAsync()) {
  throw new Error('Sharing is unavailable on this device.');
}

await Sharing.shareAsync(cacheJpegUri, {
  mimeType: 'image/jpeg',
  dialogTitle: 'Share meal',
  UTI: 'public.jpeg',
});
```

Treat resolution as share-sheet dismissal, not proof that another app published or sent the image. Do not show a `Shared` success toast.

### Operation state

Use one state value: `null | 'capture-save' | 'capture-share'`.

- Disable both footer actions and template changes for either busy state.
- Show a spinner only inside the action the user started.
- Guard against a second tap before React commits the busy state with an operation ref.
- Clear the ref and state in `finally`.
- Do not cache rendered images across operations in v1.

## Native configuration and permission hygiene

Add the Media Library plugin to `app.json`:

```json
[
  "expo-media-library",
  {
    "photosPermission": "Allow Eatlog to access photos to scan meals.",
    "savePhotosPermission": "Allow Eatlog to save meal images to your photo library.",
    "granularPermissions": []
  }
]
```

Keep the existing camera and photo-picker purpose strings. The plugin supplies `NSPhotoLibraryAddUsageDescription` for iOS add-only saving.

Expo Media Library SDK 54 checks `WRITE_EXTERNAL_STORAGE` for write operations below Android 13 and treats writes as permission-free on Android 13 and newer. Make these config changes:

- Remove `android.permission.WRITE_EXTERNAL_STORAGE` from `android.blockedPermissions` because gallery saving now uses it on Android 12 and older.
- Add `android.permission.READ_MEDIA_VISUAL_USER_SELECTED`, `android.permission.READ_MEDIA_IMAGES`, `android.permission.READ_MEDIA_VIDEO`, and `android.permission.READ_MEDIA_AUDIO` to `blockedPermissions`.
- Preserve the checkout's existing `android.permission.READ_EXTERNAL_STORAGE` behavior for the pre-Android-13 gallery-picker path.
- Keep `granularPermissions: []` so the dependency does not add Android 13 media-read permissions.
- Keep the explicit `android.permissions` list limited to Health Connect Weight read and write. Media Library owns its legacy write declaration.
- Keep `android.permission.SYSTEM_ALERT_WINDOW` blocked and `microphonePermission: false` unchanged.

After configuration, inspect the resolved production config and a generated merged manifest. The expected runtime behavior is:

| Platform | Save behavior |
| --- | --- |
| Android API 26 to 32 | Save image asks for legacy write access only after the button tap, and the existing legacy gallery-read path remains unchanged. |
| Android API 33+ | Save image writes through MediaStore without a runtime photo-read prompt. |
| iOS | Save image requests add-only library access using the new purpose string. Share requests no Photos permission. |

Do not infer permission correctness from `app.json`. Verify the built manifest and device dialogs.

Because these packages add native modules and purpose strings, schedule a new binary. Eatlog's runtime uses `runtimeVersion.policy: "appVersion"`; do not publish this JavaScript to an installed binary that lacks the modules.

## SDK references

These references are the implementation authority. Package versions still come from `npx expo install`.

- Expo SDK 54 `react-native-view-shot`: https://docs.expo.dev/versions/v54.0.0/sdk/captureRef/
- Expo SDK 54 Media Library: https://docs.expo.dev/versions/v54.0.0/sdk/media-library/
- Expo SDK 54 Sharing: https://docs.expo.dev/versions/v54.0.0/sdk/sharing/
- Expo permissions guide: https://docs.expo.dev/guides/permissions/

## Error and feedback contract

| Condition | Required response |
| --- | --- |
| Stored photo file is missing or fails to decode | Replace the preview with `This meal photo is no longer available.` Hide or disable Save and Share. Close still works. |
| Selected page has not loaded | Disable both actions and expose busy state to accessibility. Do not capture a placeholder. |
| Capture fails | Alert `Couldn't create the meal image. Try again.` Keep the composer and selected template. |
| Sharing unavailable | Alert `Sharing isn't available on this device.` Keep the composer open. |
| Share sheet canceled | Return to the composer without success or error copy. |
| Save permission denied, request allowed | Keep the composer open. A later Save tap may request again. |
| Save permission denied permanently | Alert with Cancel and Open settings. |
| Media Library save fails | Alert `Couldn't save the meal image. Try again.` Keep the composer open. |
| User backgrounds the app during a system sheet | Preserve the modal and template. Clear busy state after the native promise settles. |
| Modal closes | Clear the payload, selected template, readiness set, operation ref, and transient errors. |

Log one short `console.error` with a stable prefix for capture, save, or share failures. Do not log the meal title, component names, photo URI, generated URI, or share destination.

## Accessibility, motion, and layout

- Keep all icon and text actions at least 48 by 48dp.
- Give every top-bar, segmented, swipe, Save, and Share action a label, hint where useful, disabled state, and busy state.
- Add Share as a custom accessibility action on photo meal cards. Preserve Edit and Delete.
- Mark the template selector as three radio choices through the existing `SegmentedControl` contract.
- Announce `Meal image saved.` through the existing accessible toast.
- Keep the exported card readable without relying on color. P, C, and F letters remain present beside their colors.
- Use Onest through existing NativeWind text roles. Do not set `fontWeight` against a named Onest family outside current utilities.
- Use tabular numbers for calories and macro grams.
- Use `numberOfLines` and fixed numeric columns so long names cannot push macros off-canvas.
- Respect `useReducedMotion()`. Programmatic carousel changes use no animated scroll when reduced motion is enabled.
- Preserve system Back through `Modal.onRequestClose` and the origin-specific navigation table.
- Test font scale, TalkBack, VoiceOver, portrait, and landscape. The saved card keeps its 4:5 output regardless of device orientation.

## File-by-file change map

| File | Change |
| --- | --- |
| `package.json` | Add Expo-resolved `react-native-view-shot` and `expo-media-library`. Keep existing scripts except for any focused config-plugin test command required below. |
| `package-lock.json` | Accept only the lockfile changes produced by `npx expo install`. |
| `app.json` | Add Media Library plugin and add-only iOS copy. Replace blocked write storage with blocked read permissions as specified. |
| `src/utils/mealSharing.ts` | Create share template types, the immutable payload builder, total aggregation, and component-heading logic. |
| `src/utils/mealSharing.test.ts` | Create deterministic unit tests for payload creation, totals, estimated labeling, component order, empty photo rejection, and name fallback. |
| `src/components/MealShareComposer.tsx` | Create carousel, segmented synchronization, three card variants, capture, cache lifecycle, save/share actions, loading, permission, and error handling. Keep the card renderer in this file unless it becomes unreadable. |
| `src/components/MealPhotoViewer.tsx` | Widen props to `MealSharePayload`, add photo/share modes, add toolbar Share, preserve photo inspection, and implement origin-aware Back. |
| `src/components/JournalSection.tsx` | Add optional Share to `SwipeRow`, pass it only for photo meals, reset before open, widen `JournalEntryRow` callbacks, and update meal accessibility actions/hints. |
| `src/screens/DiaryScreen.tsx` | Replace narrow photo state with `MealMediaState`; create photo and direct-share handlers; pass the same payload to the viewer; route save success to `showToast`. |
| `plugins/withEatlogHealthConnect.test.js` | Update the expected blocked-permission list and assert the Media Library plugin uses empty granular permissions and the approved purpose strings. Keep Health Connect assertions unchanged. |
| `release/legal/THIRD_PARTY_SOFTWARE.md` | Regenerate with `npm run notices` so both new packages and transitive licenses appear. Do not hand-edit generated rows. |
| `release/config/NATIVE_CONFIGURATION.md` | Document point-of-use image saving, legacy write-only behavior below API 33, blocked Android 13 media-read permissions, preserved legacy gallery-read behavior, iOS add-only copy, and the new-binary boundary. |
| `release/store/REVIEW_MATERIAL.md` | Add the Diary share/save path and clarify that the user chooses the destination through system UI. |
| `release/store/POLICY_WORKSHEETS.md` | Replace the stale Weight-only manifest claim with the exact intended write-only media behavior. Do not classify user-directed OS sharing as Eatlog backend collection. |
| `release/qa/UI_SMOKE_SCRIPT.md` | Add template selection, saved-image verification, share-sheet cancel, and missing-photo cases. |
| `release/qa/DEVICE_MATRIX.md` | Add Android legacy/current save permission checks and iOS add-only/save/share checks. |
| `release/OWNER_RELEASE_CHECKLIST.md` | Replace `no write-storage request` with the verified API-scoped expectation and add generated-image checks. |

Do not rewrite `release/FINAL_ACCOUNT_FREE_AUDIT.md` as if old evidence covered this feature. A release agent may replace or append that audit only after a new binary and permission inspection exist.

## Implementation sequence

### 1. Establish the native baseline

- Record `git status --short` and preserve `.pi-subagents/` plus later unrelated work.
- Run the current test suite and typecheck before dependency changes.
- Install both packages with Expo.
- Update `app.json` and the native-config assertions.
- Run `npx expo config --type public` and the available config/plugin tests.
- Inspect a generated Android manifest before starting UI work. Stop if media-read permissions survive or write-only saving cannot work on the supported API floor.

### 2. Build and test the pure payload

- Add `mealSharing.ts` and its Node tests.
- Use full-precision totals in the payload and round in presentation code.
- Verify AI-source labeling without changing stored data.
- Confirm the helper needs no SQLite or React Native import except the `FoodLog` type.

### 3. Build the composer

- Render the fixed 4:5 card and the three approved templates.
- Add carousel and segmented-control synchronization.
- Add per-template image readiness and missing-file behavior.
- Add selected-ref capture at 1080 by 1350 JPEG output.
- Add cache naming, save, share, cleanup, busy guard, alerts, and toast callback.
- Inspect the generated JPEG dimensions and metadata on-device.

### 4. Integrate the viewer

- Change the viewer to accept one payload and initial mode.
- Add the photo-toolbar Share button.
- Implement photo-origin Back and swipe-origin Close behavior in the same modal.
- Reset mode and template state on payload changes.

### 5. Integrate Diary rows

- Add optional Share to `SwipeRow` without changing `FoodRow` behavior.
- Render Share left of Delete and reset the row before opening.
- Pass full meal input to Diary handlers instead of URI and name.
- Add the screen-reader Share action only to photo meals.
- Verify reused rows reset across day and month navigation.

### 6. Update release evidence

- Regenerate third-party notices.
- Update native configuration, review, policy, smoke, matrix, and owner-checklist documents named above.
- Keep historical audits historical until the new binary has evidence.

### 7. Run bounded visual QA

- Capture one before screenshot of the current viewer and meal swipe.
- Capture after screenshots for the photo toolbar, each template, the two swipe actions, and one error state.
- Review Android phone layouts in one batch. Review iOS and any supported large/landscape case in the same pass when devices exist.
- Fix the complete defect batch, confirm once, and stop polishing.

## Automated tests

Add `src/utils/mealSharing.test.ts` cases for:

- Null, empty, and whitespace-only photo URIs returning `null`.
- Totals across one component and several components with decimal nutrition.
- Rounding staying outside the payload helper.
- Stored component order and names remaining unchanged.
- `Estimated components` for `scan`, `describe`, and mixed AI/manual rows.
- `Components` for manual, USDA, and Open Food Facts rows.
- Empty meal-name fallback.
- One, five, and more-than-five component display-model cases if the cap helper lives in the utility.

Update native-config tests to assert:

- Media Library plugin exists with `granularPermissions: []`.
- iOS save copy matches the approved sentence.
- Android 13 media-read permissions stay blocked and existing `READ_EXTERNAL_STORAGE` baseline remains unchanged.
- Legacy write storage is no longer blocked because Save uses it below API 33.
- Health Connect Weight permissions and ImagePicker microphone removal remain unchanged.

Do not add a React Native test framework for this feature alone. Keep layout and native-sheet verification in the device matrix.

## Device and visual acceptance matrix

### Core cases

| Case | Expected result |
| --- | --- |
| Photo thumbnail | Opens unchanged inspection viewer with Close, centered title, and Share. |
| Viewer Share | Opens Summary template. Back returns to the photo. |
| Swipe Share | Appears left of Delete only for a photo meal, resets the row, and opens Summary directly. Back dismisses to Diary. |
| Photo-less meal | Shows Delete only; no Share accessibility action. |
| Standalone food | Remains unchanged. |
| Template swipe | Carousel, segmented value, accessibility selection, and exported template agree. |
| Save | Selected template appears in Photos or Gallery at 1080 by 1350. A toast confirms the save. |
| Share | Native sheet receives a JPEG for the selected template. Cancellation returns without a false success message. |
| Offline | Save and share composer work without a network request. |
| Repeat | Saving or sharing twice creates two valid operations with no stale template or busy state. |

### Content ranges

- Meal titles: one word, two lines, 100 characters, emoji, and non-Latin text.
- Components: 1, 5, 6, and 20 rows.
- Component names: short, 80 characters, duplicate names, and non-Latin text.
- Nutrition: zero values, decimals, four-digit calories, and three-digit macro grams.
- Photos: square, portrait, landscape, panorama, rotated EXIF input, and missing file.

The full photo must remain visible in every output. Tonal padding is acceptable. Stretching and silent cropping fail acceptance.

### Native cases

- Android API 26: write-only permission grant, denial, permanent denial, save, share, and Back.
- Android API 36: no media-read prompt, gallery save, several share targets, cancellation, process background/resume, and TalkBack.
- Current Samsung-class Android: Gallery visibility and OEM share targets.
- Minimum supported iOS: add-only prompt, denial, Settings recovery, save, share cancellation, and VoiceOver.
- Current iOS: Photos result, several share targets, background/resume, safe areas, and large text.

Inspect the saved JPEG:

- Dimensions equal 1080 by 1350.
- Orientation displays upright.
- No source EXIF location, camera model, original filename, or capture timestamp survives.
- Text uses Onest and remains legible after a messaging app recompresses it.

## Verification commands

Run targeted checks while implementing, then the full set before handoff:

```bash
npx tsx --test src/utils/mealSharing.test.ts
node plugins/withEatlogHealthConnect.test.js
npm run typecheck
npm test
npm run notices
npm run notices:check
npx expo install --check
npx expo config --type public
npx expo config --type introspect
npx expo export --platform android --dev
npx expo export --platform ios --dev
git diff --check
git status --short
```

Inspect the diff after generated notice changes. Stage only files in this plan. Report device classes that were tested and keep untested physical-device cases open instead of inferring success from an Expo export.

## Out of scope

- Sharing a standalone food or a meal without a photo.
- Captions, hashtags, editable titles, stickers, filters, crop tools, pinch positioning, and custom colors.
- Square, story, landscape, or user-selectable export ratios.
- Video, animated cards, multiple-photo collages, and batch sharing.
- In-app recipients, public profiles, feeds, cloud URLs, deep links, and share analytics.
- Re-estimating components or calling Gemini during sharing.
- Persisting the selected template or generated image.
- Changing canonical meal photos, backup format, database schema, Diary grouping, delete/undo, or photo cleanup.

## Handoff completion criteria

The implementing agent can mark this plan complete only when:

- Both entry points use the same payload and composer.
- All three templates export the selected content at the required dimensions.
- Save and share succeed on tested Android and iOS targets, or the handoff names the exact untested device gate.
- The built Android manifest adds no Android 13 media-read permission, preserves the audited legacy gallery-read path, and matches write-only save behavior.
- iOS contains the approved add-only purpose string.
- Cache cleanup runs after success, cancellation, and error.
- Automated checks pass, screenshots show the required UI states, and unrelated work remains untouched.
- The final summary separates source verification, Expo export verification, and physical-device verification.
