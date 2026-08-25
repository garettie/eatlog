# Eatlog remote-estimate consent and release-contract implementation plan

Executor: Luna Max, maximum reasoning

Plan date: 2026-08-14

Repository: `/home/sgaret/projects/eatlog`

Drafted against: `main` at `51836cb`

## 1. Objective

Add one short, native-looking consent screen to Eatlog's onboarding for Google Gemini meal estimates. Users can enable estimates or continue using Eatlog without them. Reuse the same full-screen experience when a user who has not enabled estimates later invokes Scan, Upload photo, Describe, an AI search fallback, or re-estimation.

Enforce the choice at the network boundary so no photo, description, clarification context, installation token, or request reaches the Worker unless the current consent version has been accepted.

Keep the Eatlog mark permanent on every share card. Update stale source-of-truth, QA, privacy, and store-review documents after the behavior is implemented and verified.

This pass must not rename Eatlog.

## 2. Fixed product decisions

Treat these as settled. Do not ask the owner to choose again.

1. Consent appears as a proper Eatlog screen in onboarding. Do not use `Alert.alert`, a system-looking prompt, a legal-text wall, a checkbox, or a bottom-sheet paragraph.
2. Use this exact visible copy unless a factual source change makes it inaccurate:

   **Title**

   `AI meal estimates`

   **Message**

   `Scan and Describe send the photo or text you choose to Google Gemini so Eatlog can estimate the meal. Nothing is sent until you use these features.`

   **Primary action**

   `Okay`

   **Secondary action**

   `Not now`

3. `Not now` completes onboarding and opens Eatlog. It must not close the app, trap the user, or disable manual logging, personal history, USDA/Open Food Facts search, weight tracking, Analytics, backup, export, or sharing.
4. A user who chose `Not now` sees the same full-screen consent UI only after invoking an AI estimate feature. Declining again returns to the exact prior state without sending data or losing typed text, a selected image, edits, or search input.
5. A user can turn online estimates off from Profile > Privacy. Turning them off blocks future Gemini requests. The user can enable them again through the same consent screen.
6. Camera, photo picker, add-only photo saving, and Health Connect permissions stay at their existing point of use. Do not add them to onboarding and do not bundle them into this consent.
7. The Eatlog mark is permanent on every share-card layout. There is no mark toggle.
8. Broad dead-code cleanup is deferred. Remove only imports, variables, or branches made obsolete by this implementation. Do not update the dead-code regression baseline.
9. Update stale documentation after the code and tests pass. Do not write future behavior into docs before it exists.
10. Do not commit, push, deploy, build in EAS, submit to a store, change cloud secrets, or run paid Gemini traffic unless the owner asks.

## 3. Policy boundary

The implementation should satisfy these current store requirements without turning the screen into policy prose:

- Apple requires disclosure and explicit permission before sharing personal data with third parties, including third-party AI. Apple also requires an understandable withdrawal path and says paid functionality must not depend on unnecessary data access. Source: [Apple App Review Guidelines, sections 5.1.1 and 5.1.2](https://developer.apple.com/app-store/review/guidelines/).
- Google requires an in-app disclosure before consent when sensitive-data handling is outside the user's reasonable expectation. Consent requires an affirmative action. Navigation away cannot count as acceptance. Source: [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311).
- Google recommends a decline choice and continued app use. Source: [Google prominent disclosure guidance](https://support.google.com/googleplay/android-developer/answer/11150561?hl=en).

The fixed screen copy names the selected data, recipient, purpose, and trigger. Profile > Privacy and the public privacy policy retain the full Cloudflare, IP address, installation-token, retention, deletion, and provider detail.

Do not add a Terms acceptance checkbox, a blanket privacy acceptance checkbox, an ATT request, a nutrition disclaimer acknowledgement, or an account-deletion consent flow. Eatlog has no tracking SDK, advertising, authentication, or cloud account.

## 4. Definition of done

The pass is complete when all of these statements are true:

- A fresh production-configured install shows the consent screen as the final onboarding choice before Setup Complete.
- Both buttons finish onboarding. `Okay` stores accepted consent. `Not now` stores a declined decision.
- No decision, a declined decision, corrupt storage, an old consent version, or a storage read failure prevents every Gemini request.
- The default `foodScan` client checks consent before it loads the installation token and before it calls `fetch`.
- Scan and Upload photo ask for consent before opening camera or gallery when consent is missing or declined.
- Describe, AI search fallback, Add component description, meal re-estimation, and component re-estimation ask before sending and preserve current input after a decline.
- The full-screen on-demand prompt has one active instance. Concurrent calls cannot create stacked screens or duplicate requests.
- Android Back and iOS dismissal count as `Not now`, never acceptance.
- Profile > Privacy shows whether online estimates are enabled and lets the user turn them off or invoke the consent screen to enable them.
- Delete all data clears the consent decision. Backups and CSV exports do not include the decision.
- Food search through USDA and Open Food Facts does not depend on Gemini consent.
- Every share-card layout continues to show the Eatlog mark. No documentation or accessibility contract refers to a mark toggle.
- Tests, typecheck, exports, metadata, artwork, notices, Expo checks, and Worker checks pass, apart from the known pre-existing dead-code regression list.
- The final report separates automated evidence, visual/device evidence, and unrun owner/store work.

## 5. Current repository facts to verify before editing

Run these checks before changing files because another agent may have moved `main` since this plan was written:

```bash
git status --short
git rev-parse --short HEAD
git log -5 --oneline
rg -n "scanFood\(|describeMeal\(|clarifyMeal\(|clarifyComponent\(" src
rg -n "share_branding|Eatlog mark control|Toggle the Eatlog mark|directly" src release PRODUCT.md AGENTS.md STORE_RELEASE_IMPLEMENTATION_PLAN.md
```

At plan creation:

- `HEAD` was `51836cb` on `main`, equal to `origin/main`.
- `.pi-subagents/` and `MEAL_SHARING_IMPLEMENTATION_PLAN.md` were untracked. Preserve `.pi-subagents/`. Do not silently delete either item.
- The old alert disclosure was added in `8f94f98` and removed in `8eb2377`. The pure storage code and tests can inform the new service, but do not restore the alert UI.
- `src/services/foodScan.ts` exposes four remote operations: `scan`, `describe`, `clarify-meal`, and `clarify-component`.
- Direct UI call sites exist in:
  - `src/components/sheet-states/FoodSheetContent.tsx`
  - `src/components/sheet-states/DescribeInputState.tsx`
  - `src/components/sheet-states/SearchInputState.tsx`
  - `src/components/AddComponentSection.tsx`
- `src/components/share/MealCard.tsx` already renders `BrandMark` in Photo, Framed, and Nutrition layouts. `src/components/share/ShareOverlay.tsx` has no mark toggle.
- The schema still contains `profile.share_branding_enabled`, and `database.ts` still exports accessors. Leave them in place during this pass. Removing a legacy column adds migration risk and is unrelated to the consent work.
- `npm run fallow:dead-code` currently fails on 10 unused exports and 2 unused types. Record the before output. Do not make the list larger.

If these facts differ, inspect the new code and adapt the plan. Preserve the product decisions in section 2.

## 6. Architecture

Use three layers. Each layer has a separate job.

### 6.1 Persisted consent service

Create:

- `src/services/remoteEstimateConsent.ts`
- `src/services/remoteEstimateConsent.test.ts`

Store the decision in an app-private file under `Paths.document`, outside SQLite. Follow the injectable storage pattern in `src/services/installIdentity.ts` and the prior pure disclosure service from `8f94f98`.

Recommended public contract:

```ts
export const REMOTE_ESTIMATE_CONSENT_VERSION = 1;

export type RemoteEstimateConsentDecision = 'accepted' | 'declined';

export interface RemoteEstimateConsentRecord {
  version: number;
  decision: RemoteEstimateConsentDecision;
}

export interface RemoteEstimateConsentStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}

export function createRemoteEstimateConsent(storage: RemoteEstimateConsentStorage): {
  getDecision(): Promise<RemoteEstimateConsentDecision | null>;
  isAccepted(): Promise<boolean>;
  accept(): Promise<void>;
  decline(): Promise<void>;
  clear(): Promise<void>;
};

export function getRemoteEstimateConsentDecision(): Promise<RemoteEstimateConsentDecision | null>;
export function hasRemoteEstimateConsent(): Promise<boolean>;
export function acceptRemoteEstimateConsent(): Promise<void>;
export function declineRemoteEstimateConsent(): Promise<void>;
export function clearRemoteEstimateConsent(): Promise<void>;
```

Behavior:

- Return `null` for a missing file, invalid JSON, an unknown decision, or a record with another version.
- Only the current version with `decision: 'accepted'` permits a Gemini request.
- Persist `declined` so the app does not reopen the consent screen at startup. A later explicit AI action may show it again.
- Reset the cached service promise after initialization failure so a later call can retry.
- Do not log raw file contents, the installation token, a description, or image data.
- An acceptance write failure must fail closed. Do not treat an in-memory tap as consent when persistence failed.
- A decline write failure may still let the user continue without estimates. Report the storage problem without sending data. The next AI action can ask again.
- Keep the file outside backup/export. Do not add a SQLite migration.
- Increment `REMOTE_ESTIMATE_CONSENT_VERSION` only when the recipient, selected data, or purpose changes. Copy-only edits that do not change meaning do not require a version bump.

### 6.2 Full-screen consent coordinator

Create:

- `src/context/RemoteEstimateConsentContext.tsx`
- `src/components/RemoteEstimateConsentContent.tsx`

The context should expose a small interface:

```ts
interface RemoteEstimateConsentContextValue {
  decision: RemoteEstimateConsentDecision | null;
  requestConsent(): Promise<boolean>;
  accept(): Promise<boolean>;
  decline(): Promise<void>;
  refresh(): Promise<void>;
}
```

Implementation rules:

- In `App.tsx`, mount one provider inside the keyed `NavigationContainer` and wrap `RootNavigator`. The existing `dataEpoch` remount after Delete all data must also remount the provider so it cannot retain an accepted state after the consent file is cleared.
- Render the on-demand experience in a React Native full-screen `Modal` or an equivalent root-level full-screen layer. It must sit above Gorhom sheets and the share overlay.
- Reuse `RemoteEstimateConsentContent` inside onboarding and the modal. Do not maintain two copies of the message or action labels.
- `requestConsent()` returns `true` at once when the current accepted record exists.
- If consent is missing or declined, `requestConsent()` opens one screen and resolves only after the user chooses.
- Share one pending promise between simultaneous callers. Do not stack modals or resolve more than once.
- Primary acceptance writes the current accepted record before resolving `true`.
- `Not now`, Android Back, and any native dismissal resolve `false`. They never call the estimate service.
- The provider refreshes its state after accept, decline, reset, and a return to the foreground if needed. Do not poll.
- If acceptance cannot be saved, keep the screen open, show a short inline error, and resolve no caller as accepted.
- Do not use `Alert.alert` for consent or consent-storage errors.

### 6.3 Network-boundary enforcement

Modify:

- `src/services/foodScan.ts`
- `src/services/foodScan.test.ts`

Add `consent-required` to `FoodEstimationFailureKind`.

Extend `FoodEstimateClientOptions` with an injectable consent check:

```ts
hasConsent?: () => boolean | Promise<boolean>;
```

Use `hasRemoteEstimateConsent` for the default client. Tests must inject a deterministic function.

The private `estimate()` function must check consent in this order:

1. Validate that the Worker URL exists.
2. Check current consent.
3. Load or create the installation token.
4. Create the request and call `fetch`.

A false result or a consent-storage error returns `failure('consent-required')`. It must not call the installation-token loader or `fetch`.

Keep UI preflight checks for good interaction timing. The service check remains the final guard against a missed or future call site.

## 7. Onboarding screen

Modify:

- `src/screens/OnboardingScreen.tsx`
- `src/screens/SetupCompleteScreen.tsx` only if its scanner hint needs factual alignment

Add the consent choice as the final onboarding step after the user reviews starting targets and before navigation to Setup Complete.

### 7.1 Flow changes

- Split the existing `handleSave()` responsibility so the plan review can move to the consent step without saving twice.
- The step before consent keeps the calculated target review.
- Its action advances to consent instead of navigating to Setup Complete.
- Both consent actions save the initial profile and target once, then navigate to Setup Complete.
- The accepted action persists acceptance before the app exposes AI requests.
- The declined action persists decline when possible and still finishes setup.
- Guard against double taps with the existing `savedRef` and `isSubmitting` behavior.
- A profile-save failure keeps the user in onboarding and preserves the chosen values.
- A consent-write failure on acceptance shows an inline error and does not finish as accepted.
- If online estimates are unavailable because `EXPO_PUBLIC_FOOD_WORKER_URL` is not configured, skip the consent step and retain the existing six-step flow. Do not ask the user to enable a feature missing from that build.
- Compute the progress maximum from whether the consent step exists. Do not leave an empty footer on the calculation step after changing `TOTAL_STEPS`.

### 7.2 Layout contract

Mode: Operate.

Use the current onboarding visual language:

- `SafeAreaView`, `ScrollView`, and `ResponsiveContent` with the existing form maximum width.
- M3 dark surfaces and Onest through NativeWind.
- One restrained `auto-awesome` or `photo-camera` icon treatment.
- One title, one message, one primary pill, one quiet secondary text action, and an optional `Privacy` link.
- No nested cards, bullet list, provider-logo row, shield illustration, checkbox, legal heading, or paragraph about every local feature.
- Primary and secondary actions remain reachable on the smallest supported screen and at the largest text size.
- Touch targets stay at least 48 dp/pt.
- Use `accessibilityRole="header"` for the title and descriptive labels for both actions.
- Keep the visible primary label as `Okay`; give it the accessibility label `Okay. Enable AI meal estimates.` so its result is explicit when read out of visual context.
- The secondary action must remain visible to screen readers and sighted users. Do not reduce contrast or hide it behind Back.
- Respect reduced motion. Do not add a new animation system.

Use the fixed copy from section 2. Do not expand it with Cloudflare, IP address, token, retention, terms, or medical language. Put those details in Privacy.

### 7.3 Existing installations

An existing installation may have a profile but no consent file because the old disclosure was removed.

- Do not force that user through onboarding again at app launch.
- Keep the app usable.
- The first explicit Gemini action opens the same full-screen consent experience.
- A decline leaves the current screen or sheet intact and sends nothing.
- A later explicit AI action may ask again.

## 8. Gate every AI entry point

Use the provider's `requestConsent()` for interaction timing and the service check for final enforcement.

### 8.1 Camera and gallery

Modify `src/components/sheet-states/FoodSheetContent.tsx`.

- Check consent before `ImagePicker.requestCameraPermissionsAsync()`.
- Check consent before `ImagePicker.launchImageLibraryAsync()`.
- Declining from a top-level Scan or Upload photo shortcut closes the transient sheet or returns it to its prior entry state without a flash of `Scanning`.
- Declining from inside the Add sheet returns to the entry methods.
- Do not request camera or photo access before AI consent.
- Keep existing request IDs, cancellation, and in-flight protection.
- Accepting resumes the selected action once.

### 8.2 Describe meal

Modify `src/components/sheet-states/DescribeInputState.tsx`.

- Ask only after the user taps Estimate.
- Keep the typed description after `Not now`.
- Do not set loading until consent returns `true`.
- Accepting resumes one request.

### 8.3 AI fallback from food search

Modify `src/components/sheet-states/SearchInputState.tsx`.

- Gate only `Estimate “query” with AI`.
- Do not gate local history, USDA, Open Food Facts, result details, quick log, or manual entry.
- Keep the search query and results after `Not now`.

### 8.4 Add component description

Modify `src/components/AddComponentSection.tsx`.

- Gate its Describe mode before `describeMeal()`.
- Preserve the current mode and text after `Not now`.
- Search and manual component entry remain available.

### 8.5 Meal and component re-estimation

Modify the wrappers in `src/components/sheet-states/FoodSheetContent.tsx`. Change `ReviewState.tsx` only if the existing wrapper contract cannot represent a declined request cleanly.

- Gate both `clarifyMeal()` and `clarifyComponent()`.
- Preserve the meal name, component name, amounts, photo context, and undo state after decline.
- Do not show a provider/network error when the user chose `Not now`.
- Accepting resumes one clarification request.

### 8.6 Unexpected direct calls

The `consent-required` failure from `foodScan.ts` is a defensive result. UI code should normally preflight through the provider.

- Map an unexpected defensive failure to concise copy such as `Enable online estimates to use this.`
- Do not convert it into a generic network or provider error.
- Do not open a consent screen from inside the service layer.

## 9. Privacy controls and reset

Modify:

- `src/screens/ProfileInfoScreens.tsx`
- `src/services/dataReset.ts`

### 9.1 Profile > Privacy

Replace the generic meal-estimate info row with an interactive section that still states what leaves the device.

Required behavior:

- Name Google Gemini in the on-screen detail.
- Show `Enabled` or `Off` from the persisted decision.
- When enabled, expose `Turn off online estimates`.
- When off or undecided, expose `Enable online estimates`, which opens the same full-screen consent UI.
- Turning off writes `declined` and updates the screen without restarting the app.
- Keep the detailed IP address and app-specific token sentence on this Privacy screen.
- Keep food-search disclosure separate. Gemini consent must not disable USDA or Open Food Facts.
- Keep Health Connect in its current Android-only section.

Do not add a global Preferences toggle elsewhere. Privacy owns this control.

### 9.2 Delete all data

Call `clearRemoteEstimateConsent()` from `resetLocalData()` alongside meal-photo deletion and before database replacement.

Requirements:

- A completed reset returns to onboarding with no consent decision.
- A canceled reset does not clear consent.
- A reset failure must not claim completion.
- Keep the consent file outside `.eatlog-backup` and CSV export.

## 10. Permanent share branding

The runtime source already implements the chosen behavior. Do not reintroduce a toggle.

Verify:

- `MealCard.tsx` renders `BrandMark` in Photo, Framed, and Nutrition.
- Photo-less cards use Nutrition and retain the mark.
- Exported 1080 by 1920 PNGs contain the mark.
- `ShareOverlay.tsx` exposes no mark control or mark state.

Leave these compatibility artifacts for the deferred cleanup pass:

- `profile.share_branding_enabled`
- `getShareBrandingEnabled()`
- `setShareBrandingEnabled()`
- the exported CSV column
- migration tests for the legacy column

Update documentation and accessibility expectations from an interactive mark control to a permanent mark. Do not describe an inaccessible control that does not exist.

## 11. Automated tests

Write tests before or with each behavior change. Do not weaken existing assertions to make a failure disappear.

### 11.1 Consent service tests

Cover:

- missing storage returns `null` and not accepted;
- current accepted record returns accepted;
- current declined record returns declined and not accepted;
- accepted and declined writes use the current version;
- corrupt JSON returns `null`;
- older and future versions return `null`;
- unknown decisions return `null`;
- `clear()` removes the record;
- read failure fails closed;
- accept write failure never reports acceptance;
- persisted decisions survive a new service instance.

### 11.2 Food-estimate boundary tests

Extend `src/services/foodScan.test.ts` to cover:

- accepted consent preserves the existing Scan and Describe request contract;
- missing consent returns `consent-required`;
- declined consent returns `consent-required`;
- consent-check failure returns `consent-required`;
- the installation-token loader is not called when consent is absent;
- `fetch` is not called when consent is absent;
- Scan, Describe, meal clarification, and component clarification all use the same guard;
- accepted requests still send the installation header and the bounded Worker-owned payload;
- no input text or image appears in logged errors.

Existing factory tests should inject `hasConsent: async () => true` unless the test exercises denial.

### 11.3 Coordinator tests

Keep state logic pure enough to test without rendering a native modal. Cover:

- accepted state resolves without presenting;
- two simultaneous requests share one pending decision;
- acceptance resolves all waiting callers once;
- decline resolves `false` and sends no request;
- dismissal and Back resolve `false`;
- acceptance persistence failure resolves no caller as `true`;
- repeated feature taps after a stored decline can present again;
- a stored decline does not open anything at startup.

### 11.4 Reset and documentation checks

- Add a focused test for clearing consent during completed reset if the native reset service can be tested without a brittle mock stack. If not, keep the call explicit and cover `clear()` in the service test, then mark reset as device/static evidence.
- Update metadata validation assertions if reviewer notes change.
- Run the share-card contract tests unchanged. Permanent branding should need no new runtime branch.

## 12. Manual UI and accessibility checks

Run on a development or release-equivalent binary after automated checks pass. Use synthetic meal text and images.

### 12.1 Fresh install, accept

1. Clear app data and launch.
2. Complete the current profile and target steps.
3. Confirm the final consent screen uses the exact copy and actions.
4. Tap `Okay`.
5. Finish setup, relaunch, and invoke Describe.

Expected:

- no clipping, keyboard obstruction, or empty footer;
- no second consent screen;
- Describe sends once and returns an editable estimate;
- Profile > Privacy shows Enabled.

### 12.2 Fresh install, decline

1. Clear app data and complete onboarding.
2. Tap `Not now`.
3. Confirm Today, manual logging, food search, weight, Analytics, backup, export, and share remain usable.
4. Tap Describe, then choose `Not now` again.

Expected:

- Eatlog stays open;
- no network request, installation-token creation, or system permission prompt occurs from the declined AI action;
- the typed description remains;
- Profile > Privacy shows Off.

### 12.3 Later acceptance

1. From the declined state, tap Scan.
2. Confirm the consent screen appears before the camera permission request.
3. Accept.
4. Grant or deny camera permission as a separate system choice.

Expected:

- consent and camera permission remain separate;
- acceptance resumes Scan once;
- later Scan and Describe calls do not reprompt.

### 12.4 Withdrawal

1. Open Profile > Privacy with estimates enabled.
2. Turn online estimates off.
3. Invoke re-estimation on an existing estimated meal.

Expected:

- the control changes to Off;
- the full-screen consent UI appears before transmission;
- `Not now` preserves all edits and does not show a network error.

### 12.5 Reset

1. Enable estimates.
2. Complete Delete all data.
3. Complete onboarding again.

Expected:

- consent is requested as a fresh decision;
- no previous accepted state survives reset.

### 12.6 Layout and assistive technology

Repeat the consent screen on:

- the smallest supported Android and iPhone layouts;
- landscape or split-screen where supported;
- largest text size;
- TalkBack and VoiceOver;
- reduced motion;
- Android Back and iOS native dismissal.

Expected:

- title, message, both actions, and Privacy link are readable and reachable;
- focus stays inside the full-screen modal while open;
- reading order is title, message, primary action, secondary action, Privacy;
- Back or dismissal declines;
- no action sits behind a home indicator, keyboard, or navigation bar.

Capture before and after screenshots for the onboarding surface if a simulator or device is available. If none is available, state that no visual result was produced.

## 13. Documentation reconciliation

Update documents only after the implementation and relevant checks pass. Use current source and actual command output. Do not copy old test counts or old commit IDs.

### 13.1 Product and agent instructions

Update `PRODUCT.md`:

- change the platform from Android-only sideloading to Android-first public release with iOS v1 support;
- mark Profile editing, backup/restore, CSV export, reset, Health Connect, meal sharing, iOS source support, migration tests, and service tests as implemented;
- describe the optional online-estimate consent and withdrawal path;
- keep Health Connect Android-only and HealthKit outside v1;
- remove old claims about 36 tests and missing database/service/navigation coverage;
- retain the local-first, account-free, scanner-first product principles;
- state that the Eatlog share mark is permanent.

Update `AGENTS.md`:

- replace the stale `TODO` test command with the current `npm test` command and document `TMPDIR=/tmp` when needed;
- keep lint accurately described as not configured;
- add `npm run fallow:dead-code` as the dead-code check rather than calling it lint;
- replace the project-learning sentence that requires an Eatlog mark control with one that requires the mark on every share card;
- add one concise learning: remote Gemini consent uses a full-screen onboarding/on-demand flow, a decline keeps Eatlog usable, and the service must fail closed before loading the installation token or calling `fetch`.

### 13.2 Privacy and release evidence

Update:

- `release/site/privacy.md`
- `release/privacy/DATA_INVENTORY.md`
- `release/FINAL_ACCOUNT_FREE_AUDIT.md`
- relevant sections of `STORE_RELEASE_IMPLEMENTATION_PLAN.md`

Required content:

- users choose whether to enable Gemini estimates;
- Scan, Describe, clarification, and re-estimation require the current accepted version;
- users can decline and keep using the rest of Eatlog;
- Profile > Privacy provides withdrawal;
- the local consent file is excluded from backup and CSV export;
- reset clears it;
- food search remains a separate network behavior;
- provider-console retention and logging claims remain owner-verification items;
- the current audit names the exact audited commit and actual check results;
- signed binaries, physical-device tests, production-service verification, public-page publication, and store-console work remain open unless the agent performed them.

Do not describe the draft public policy as live.

### 13.3 QA and store-review material

Update:

- `release/qa/UI_SMOKE_SCRIPT.md`
- `release/qa/DEVICE_MATRIX.md`
- `release/qa/IOS_SOURCE_AUDIT.md`
- `release/store/POLICY_WORKSHEETS.md`
- `release/store/REVIEW_MATERIAL.md`
- `release/store/SCREENSHOT_PLAN.md`
- reviewer-note source in `release/store/metadata.mjs`

Replace direct-request expectations with:

- fresh onboarding includes the concise consent screen;
- acceptance permits later AI requests without repeated prompts;
- `Not now` enters Eatlog and sends nothing;
- a later explicit AI action reopens the full-screen consent flow;
- withdrawal from Privacy blocks later requests;
- camera/photo/Health Connect permissions remain point-of-use system choices.

Replace share-branding expectations with:

- the Eatlog mark is visible on Photo, Framed, Nutrition, and photo-less fallback cards;
- no mark control, toggle state, or toggle accessibility semantics exist;
- Save image and Share remain visible with the pager and dots.

Keep `release/store/SCREENSHOT_PLAN.md` honest: the estimate-review screenshot should not show a consent overlay after acceptance. Add an onboarding-consent capture only if it helps store review or the permissions declaration.

### 13.4 Obsolete untracked sharing plan

`MEAL_SHARING_IMPLEMENTATION_PLAN.md` is untracked and describes an older 4:5 JPEG design with no implemented code. Do not use it as authority.

Do not delete it. Add a prominent `Superseded` banner and point readers to the current 9:16 PNG source, QA, and release material.

## 14. Deferred cleanup

Do not turn this pass into a repository cleanup project.

Record the existing dead-code output before editing. At plan creation it included:

- `insertProfile`
- `getShareBrandingEnabled`
- `setShareBrandingEnabled`
- `insertDailyTarget`
- `getLatestDailyTarget`
- `STORY_DESIGN_WIDTH`
- `STORY_DESIGN_HEIGHT`
- `MEAL_ESTIMATE_DISCLAIMER`
- `validateProfile` from `nutritionSafety.ts`
- `GOAL_RATE_RANGES`
- `FoodEstimationResult`
- `InstallationIdentityStorage`

Some items may disappear because this implementation uses an exported type. That is fine. Do not remove unrelated items or change `.fallow-regression.json`.

After the release-hardening implementation is stable, the owner can assign a separate cleanup pass that proves each removal against callers, migrations, backups, and exports.

## 15. Verification sequence

Run from the repository root. Use actual command output in the final report.

### 15.1 Before editing

```bash
git status --short
git diff --check
npm run typecheck
env TMPDIR=/tmp npm test
npm run fallow:dead-code
```

The dead-code command may fail on the known baseline. Save the exact list for comparison.

### 15.2 Focused checks during implementation

```bash
env TMPDIR=/tmp npx tsx --test src/services/remoteEstimateConsent.test.ts src/services/foodScan.test.ts
npm run typecheck
```

If the test runner cannot create its IPC socket inside the sandbox, rerun only the approved test command outside that sandbox and report the environment limitation.

### 15.3 Full local gate

```bash
env TMPDIR=/tmp npm test
npm run typecheck
npm run notices:check
npm run store:metadata:check
npm run store:artwork:check
npx expo install --check
npx expo-doctor
npx expo config --type public
env TMPDIR=/tmp npx expo export --platform android --dev
env TMPDIR=/tmp npx expo export --platform ios --dev
env TMPDIR=/tmp npx expo prebuild --platform android --no-install
env TMPDIR=/tmp npx expo prebuild --platform ios --no-install
npm run fallow:dead-code
git diff --check
git status --short
```

Use disposable output locations or a clean temporary clone for exports and prebuilds when practical. Do not overwrite user-owned native folders or unrelated work.

### 15.4 Worker regression gate

Consent is client-side, but the release documents describe the Worker. Confirm no accidental Worker regression:

```bash
cd worker
npm test
npm run typecheck
npm run dry-run
npm audit --omit=dev
```

Return to the repository root before the final status check.

### 15.5 Diff review

Inspect:

```bash
git diff --stat
git diff -- src/services/remoteEstimateConsent.ts src/services/foodScan.ts src/screens/OnboardingScreen.tsx src/screens/ProfileInfoScreens.tsx src/services/dataReset.ts
git diff -- PRODUCT.md AGENTS.md release STORE_RELEASE_IMPLEMENTATION_PLAN.md
git status --short
```

Confirm each changed line belongs to consent, permanent-branding documentation, stale-doc reconciliation, tests, or orphans created by those changes.

## 16. Failure handling

- If consent storage cannot be read, block remote estimates and let local features work.
- If acceptance cannot be written, show an inline error and do not send.
- If decline cannot be written, continue without estimates and ask again only after a later explicit AI action.
- If a user dismisses the consent screen, resolve as declined.
- If an AI call reaches `foodScan` without consent, return `consent-required` before token creation or `fetch`.
- If camera/gallery permission is denied after AI consent, use the existing permission recovery UI. Do not conflate the two choices.
- If the public privacy URL is absent in a development build, the consent screen still shows the core disclosure. Do not render a dead link.
- If a test exposes a conflict with backup, reset, or migration behavior, fix the root cause. Do not update a fixture to hide it.
- If another active agent changed a target file, stop and inspect the overlap before editing. Preserve unrelated changes.

## 17. Out of scope

- App rename, package identifier change, or brand redesign
- New AI providers or Worker API changes
- Changes to the nutrition algorithm or safety bounds
- HealthKit or Apple Health
- Account, login, cloud sync, subscriptions, receipt validation, or cross-store entitlement
- New camera, gallery, Health Connect, ATT, notification, or Terms consent screens
- Removing the legacy share-branding database column
- Broad dead-code cleanup
- Store-account enrollment, pricing entry, banking, tax, signing, cloud builds, TestFlight, submission, or release
- Claims of physical-device success without a device run

## 18. Final report required from Luna

Return a short report with these headings:

1. `Implemented`
2. `Files changed`
3. `Behavior verified`
4. `Automated checks`
5. `Device or visual checks`
6. `Known limitations`
7. `Release gates still owned by the user`

The report must include:

- final commit hash or working-tree base;
- the exact consent copy and actions shipped;
- every AI entry point guarded;
- confirmation that decline keeps Eatlog usable;
- confirmation that the service blocks before token loading and `fetch`;
- confirmation that the mark is permanent and no toggle remains in docs;
- actual test and check results, with failures quoted accurately;
- before and after dead-code findings;
- any checks not run and why;
- `git status --short` output summary;
- no claim of signed-binary, device, production-service, or store readiness without evidence.

Do not commit or push unless the owner asks after reviewing the diff.
