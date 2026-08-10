# Eatlog Public Store Release Implementation Plan

**Status:** Proposed implementation plan

**Last updated:** 2026-08-10

**Destinations:** Google Play, then TestFlight and the Apple App Store

**Release model:** Local-first app, developer-operated food Worker, no account system

**Brand decision:** The product name remains **Eatlog**. This plan contains no rename task.

## 1. Purpose

This plan takes the existing signed Android product from private APK use to a controlled Google Play release, then adds the minimum iOS work needed for TestFlight and App Store distribution. It covers code, native configuration, safety rules, privacy, store accounts, metadata, testing, service operations, rollout, and rollback.

The first public release succeeds when an adult can install Eatlog from either store, create a safe plan, log and review food, track weight, keep or change recommendations, back up and restore owned data, understand every off-device data flow, and recover from provider or permission failures without data loss.

## 2. Fixed decisions and assumptions

- The installed product name remains **Eatlog** on Android and iOS.
- Store listing titles may add a descriptive suffix when a store requires title distinction. The installed display name and product brand remain Eatlog.
- Android ships first. The team uses the Android closed test to validate product and operating procedures before the iOS public submission.
- iOS v1 includes the core logging, search, scan, diary, weight, analytics, backup, restore, export, and reset flows.
- iOS v1 hides Health Connect. Apple Health and HealthKit remain post-v1 work.
- Eatlog remains local-first. The app adds no account, authentication, cloud database, social feature, subscription, or forced sync for v1.
- Eatlog costs **PHP 299 as a one-time upfront store purchase** in the Philippines. It has no subscription, in-app purchase, or app-side paywall.
- Google Play and the Apple App Store process purchases. Eatlog does not collect card or bank details.
- Android and iOS purchases are separate store transactions because Eatlog has no cross-platform account or entitlement service.
- Direct APK distribution bypasses the PHP 299 storefront purchase. Keep preview APKs limited to named testers after the paid launch, or accept that recipients can use them without buying the Play version.
- The developer continues to provision food-service credentials. Users never enter or manage API keys.
- The existing Worker remains the gateway for Gemini and USDA.
- Open Food Facts remains an explicit-search provider. It does not become a typeahead provider.
- Barcode scanning, offline food search, notifications, localization, light theme, and cloud sync remain outside this release.
- Target guardrails must be defined before public distribution. Engineering must not invent health thresholds.
- Store policy and SDK requirements change. Recheck every linked official source at the start of the submission week.

## 3. Current verified baseline

The repository already contains the product surface needed for a useful first release:

- Onboarding, profile editing, calculated and manual plans, versioned targets, and adaptive recommendations.
- Camera, gallery, description, local, USDA, Open Food Facts, recent, pinned, and manual food entry paths.
- Today, Diary, Analytics, weight entry, Health Connect on Android, backup, restore, CSV export, reset, privacy, help, and about screens.
- A local SQLite database with sequential migrations and legacy Eatlog/Marco backup compatibility.
- A Cloudflare Worker with input limits, hashed installation identifiers, per-install/IP/emergency rate limits, redacted logs, Gemini fallback models, and USDA proxying.
- A configured EAS project and working development/preview APK profiles.
- Canonical Eatlog icon and splash assets.

Verification completed during the release-readiness audit:

- [x] Root TypeScript check passes.
- [x] Root test suite passes: 177 tests.
- [x] Worker test suite passes: 17 tests.
- [x] Android production JavaScript export completes.
- [x] The deployed Worker `/healthz` endpoint responds.

Known release gaps:

| Area | Current state | Required release state |
| --- | --- | --- |
| Nutrition safety | Adult-only policy, defined limits, shared validator, and direct failure paths implemented; physical/device and store-policy review remain | Final release/device verification |
| Android permissions | Unused microphone permission requested | Generated manifest contains only required permissions |
| iOS remote services | Scan, Describe, and USDA depend on Android ID | App-scoped installation identity works on Android and iOS |
| iOS platform UI | Health Connect remains visible; no bundle identifier or store build | Android-only health UI hidden; signed TestFlight build passes |
| Privacy | In-app summary exists | Public policy, in-app link, consent copy, store declarations, support contact |
| Store builds | Internal APK profiles only | Production AAB and IPA profiles with remote build numbers |
| Native recovery | Backup code has defensive checks; full device restore path lacks release evidence | Backup, restore, rollback, reset, and cross-platform transfer pass on devices |
| Migration evidence | Focused v7 to v8 and v8 to v9 tests | Fresh install and supported v4 to current upgrade pass |
| Dependencies | Expo Doctor reports peer, maintenance, and local-install issues | Clean install produces a release build with documented exceptions only |
| Store materials | Icons exist | Complete metadata, screenshots, feature graphic, URLs, forms, and review notes |
| Operations | Worker runbook exists | Budget, alerts, smoke test, deployment record, support, and rollback drill complete |

## 4. Definition of done

### 4.1 Product gate

- [ ] A fresh adult user completes onboarding and receives a target that passes the defined safety policy.
- [ ] Every target source uses the same guardrail layer: initial, profile recalculation, manual, and adaptive.
- [ ] Cut, maintain, and bulk target direction rules reject contradictory target weights.
- [ ] Scan, gallery, description, search, recent, pinned, and manual entry paths all finish in a saved log.
- [ ] Provider and permission failures preserve Retry, Search, Describe, and Manual recovery paths.
- [ ] Diary edit/delete/undo, weight entry, Analytics, and adaptive Accept/Keep behave as documented.
- [ ] Backup, restore, CSV export, and delete-all complete without silent data loss.

### 4.2 Privacy and policy gate

- [ ] Eatlog publishes a public privacy policy and support page over HTTPS.
- [ ] The app links both pages from Profile.
- [ ] The policy names Eatlog, the developer, Cloudflare, Google Gemini, USDA FoodData Central, Open Food Facts, Health Connect, and every transmitted data class.
- [ ] The Google Play Data Safety answers match the release binary and policy.
- [ ] The Google Health Apps declaration matches nutrition, weight-management, and Health Connect behavior.
- [ ] The Apple App Privacy answers match the iOS binary and third-party SDK behavior.
- [ ] The generated Android manifest contains no `RECORD_AUDIO` permission.
- [ ] The app asks only for camera, photos, and Health Connect access at the point of use.
- [ ] Store metadata avoids medical claims and states that calculated and AI-assisted results are estimates.

### 4.3 Engineering gate

- [ ] `npm ci`, tests, typecheck, Expo Doctor review, and production exports pass from a clean checkout.
- [ ] Worker install, tests, typecheck, and dry-run pass from `worker/`.
- [ ] Google Play receives a signed AAB targeting API 36 or the current required level.
- [ ] App Store Connect receives a signed IPA built with Apple’s current required Xcode and iOS SDK.
- [ ] Build numbers increment through EAS remote version management.
- [ ] The production EAS environment contains the Worker URL and no client-visible provider secret.
- [ ] The release commit, tag, build IDs, submission IDs, Worker version, and rollback target are recorded.

### 4.4 Device gate

- [ ] The Android matrix passes on the minimum supported API, a current Google device/API, and one Samsung-class OEM device.
- [ ] The iOS matrix passes on the minimum supported iOS version reported by the build and on iOS 26 or the current version.
- [ ] At least one small and one large phone pass per platform.
- [ ] Real devices cover camera, gallery, document picker, sharing, restore, and accessibility.
- [ ] No P0 or P1 issue remains open. Every accepted lower-priority issue has a written reason and owner.

## 5. Delivery sequence

| Milestone | Outcome | Depends on | Exit gate |
| --- | --- | --- | --- |
| M0 | Scope and owner inputs locked | None | Section 6 complete |
| M1 | Nutrition plan safety hardened | M0 | Section 7 tests and review complete |
| M2 | Privacy, permissions, support, and licenses complete | M0 | Section 8 declarations drafted and binary audited |
| M3 | Build and dependency baseline clean | M0 | Section 9 checks pass |
| M4 | Core services work across Android and iOS | M2, M3 | Section 10 integration checks pass |
| M5 | Native data recovery and device matrix pass | M1, M4 | Section 11 evidence recorded |
| M6 | Production Worker and provider operations ready | M2 | Section 12 runbook drill complete |
| M7 | Store records and materials complete | M0, M2 | Section 13 complete |
| M8 | Google Play closed test complete | M1 through M7 | Production access and Android release gate pass |
| M9 | TestFlight beta complete | M1 through M7 | iOS release gate pass |
| M10 | Staged public releases complete | M8, M9 | Monitoring gates pass |

Engineering can run M1, M2, M3, and store-account setup in parallel. Store screenshots must wait for release UI and privacy copy. Public submission must wait for M5 and M6.

### 5.1 Work that does not require paid store developer accounts

An agent can complete most release preparation before Google Play or Apple Developer enrollment:

| Work | Without paid store accounts | Remaining account-bound proof |
| --- | --- | --- |
| M1 nutrition safety | Complete | None beyond final store-policy review |
| M2 privacy and permissions | Complete in code and policy source; public pages can use any suitable static host | Enter final URLs and declarations in each store |
| M3 dependency/config baseline | Complete; EAS can prepare Android AAB configuration and iOS simulator configuration | Play App Signing and Apple distribution signing |
| M4 cross-platform/iOS code | Complete in source; Android builds, iOS JS exports, and iOS simulator builds can be tested | Signed iPhone/TestFlight build needs Apple membership |
| M5 tests, migration, and recovery | Complete for Node, Android preview builds, and available simulators/devices | Play-installed and TestFlight-installed final-binary passes |
| M6 Worker operations | Complete with existing Cloudflare, Gemini, USDA, and EAS access | None from the app stores |
| M7 copy and artwork | Complete as files and draft form answers | Create records, enter price, upload assets, and submit forms |
| M8 Google Play | Blocked | Developer account, payments profile, paid price, app record, test tracks, review, rollout |
| M9 App Store | Blocked | Developer membership, Paid Apps Agreement, banking/tax, app record, signing, TestFlight, review, rollout |

The agent can create code, tests, release configuration, privacy/support page source, metadata, screenshots, artwork specifications, form worksheets, QA scripts, and runbooks. The owner must supply or approve legal identity, agreements, banking, tax information, store price, developer enrollment, and any credential prompt tied to two-factor authentication.

Account-free build boundary:

- Android: EAS can create preview APKs and prepare a signed production AAB without a Play Console account. Google Play App Signing, paid pricing, track installation, and final policy checks still require Play Console.
- iOS: the agent can implement iOS support, export the iOS JavaScript bundle, and prepare an unsigned simulator build. App Store distribution certificates, physical TestFlight installation, and App Review require Apple Developer Program membership.
- Paid app logic: the upfront PHP 299 charge lives in the stores. Eatlog needs no StoreKit, Play Billing, subscription, or in-app purchase implementation for this business model.

Do not postpone both enrollments until submission day. A new personal Play account may need the 12-tester/14-day closed test, and Apple enrollment, agreements, banking, or tax verification can take time. Enrollment can happen after core engineering starts, but it must finish before final distribution testing.

## 6. Milestone M0: lock scope, accounts, and owner inputs

### M0.1 Confirm release identity

- [x] Keep the product display name `Eatlog`.
- [x] Keep Android package `com.sgaret.eatlog`.
- [ ] Reserve the proposed iOS bundle identifier `com.sgaret.eatlog`, or another stable Eatlog identifier if Apple reports it unavailable.
- [ ] Use a store title with an Eatlog descriptor if the bare title cannot be reserved. Example pattern: `Eatlog: Macro Tracker`. Treat the descriptor as listing copy, not a product rename.
- [ ] Use the same icon, capitalization, developer identity, support address, and privacy domain across both stores.

### M0.2 Collect account inputs

- [ ] Confirm an active Google Play Console account.
- [ ] Record whether the Google account is personal or organization-owned and its creation date.
- [ ] Confirm an active Apple Developer Program membership and App Store Connect access.
- [ ] Record Apple Team ID and the person who controls two-factor authentication.
- [ ] Accept current store agreements.
- [x] Price Eatlog at PHP 299 as a one-time upfront purchase in the Philippines.
- [ ] Confirm the closest equivalent prices for other launch countries before release.
- [x] Keep subscriptions, in-app purchases, paywalls, receipt servers, and cross-store entitlements out of v1.
- [x] Accept that an Android purchase does not grant the iOS version, and an iOS purchase does not grant the Android version.
- [ ] Decide who may receive direct preview APKs after launch and remove any public APK download link before the paid Play release.
- [ ] Choose launch countries. If Apple distribution includes the EU, complete and verify Digital Services Act trader status.
- [ ] Choose the public developer/legal name that will appear in policies and listings.
- [ ] Create a monitored support email address.
- [ ] Choose the HTTPS host for `/privacy` and `/support`.
- [ ] Budget for developer memberships, EAS build usage, domain/static hosting, Gemini usage, and test devices.
- [ ] Complete every identity, contact, payment-profile, and device-verification task shown in Play Console and App Store Connect.

### M0.3 Lift the iOS implementation constraint before coding

The owner authorized iOS v1 source and simulator-readiness work on 2026-08-10. `AGENTS.md` now describes an Android-first public release followed by iOS, keeps Health Connect Android-only, and keeps HealthKit and Apple Health outside v1.

### M0 exit criteria

- [ ] All account owners and required identifiers are known.
- [ ] The privacy/support host and contact email are known.
- [x] Adult-only v1 and Android-first ordering are accepted.
- [x] The iOS code constraint has been updated before iOS implementation begins.

## 7. Milestone M1: nutrition safety and product hardening

### M1.1 Write one target-safety policy

Create a short policy. It must define:

- Minimum supported age. Use 18 for v1.
- Maximum supported age and handling for invalid or unknown dates.
- Allowed body-weight and height ranges.
- Goal-rate limits that account for current body weight and goal direction.
- Minimum and maximum calculated energy targets.
- Minimum protein, fat, and carbohydrate boundaries.
- Rules for manual targets.
- Rules for adaptive recommendations and accepted plan changes.
- Cases that require the app to stop calculation and ask the user to consult a qualified professional.
- Disclaimer wording for onboarding, plan preview, help, and store copy.

Engineering must translate policy values into named constants and tests. Do not hide policy values inside screen components.

Policy used by this batch:

- Ages 18 through 78.
- Height 100 through 250 cm; weight 30 through 300 kg.
- Calculated and manual calories 1,000 through 6,000 kcal/day.
- Protein at least 0.8 g/kg, fat at least 20% of target energy, and carbohydrates at least 130 g/day.
- Macro-derived energy must be within 10 kcal of the calorie target.
- Goal-rate step 0.05 kg/week; cut maximum `min(1% of body weight, 0.9 kg/week)`; bulk maximum `min(0.5% of body weight, 0.5 kg/week)`.
- Cut targets must be below current weight; bulk targets must be above current weight; maintain targets must match rounded TDEE.
- Unsafe or infeasible calculations stop with a direct error or paused adaptive state; the app does not silently clamp or rewrite targets.
- Disclosures cover general wellness estimates and advise qualified professional review for pregnancy, breastfeeding, medical conditions, eating-disorder history, or specialized nutrition.

### M1.2 Enforce adult-only onboarding and profile editing

Target files:

- `src/screens/OnboardingScreen.tsx`
- `src/screens/ProfilePlanScreens.tsx`
- `src/utils/calculations.ts`
- related tests under `src/utils/` and `src/screens/` if component tests are introduced

Tasks:

- [x] Change the accepted minimum age from 5 to 18.
- [x] Set the date selector’s maximum birth date to the date exactly 18 years before today.
- [x] Parse `YYYY-MM-DD` as a local calendar date instead of relying on UTC string parsing.
- [x] Reject future dates, invalid calendar dates, and ages outside policy.
- [x] Use the same validation in onboarding and Profile.
- [x] Give existing underage profiles a blocking correction screen. Allow birth-date correction, data export, and delete-all. Do not calculate or recommend a plan until the profile passes.
- [x] Preserve historical logs when an existing user corrects profile data.

Verification:

- [x] Test birthdays one day below, on, and one day above the 18-year boundary.
- [x] Test leap-day birthdays.
- [x] Test local dates in positive and negative UTC offsets.
- [x] Test an existing underage profile without deleting its logs.

### M1.3 Create one validation path for all targets

Target files:

- `src/utils/calculations.ts`
- `src/utils/goalRate.ts`
- `src/utils/planValidation.ts`
- `src/utils/adaptiveRecommendations.ts`
- screens that preview or accept targets

Tasks:

- [x] Validate finite inputs before BMR, TDEE, rate, and macro math.
- [x] Apply policy-defined calorie and macro boundaries after calculation.
- [x] Reject calculations that cannot satisfy all policy-defined boundaries.
- [x] Apply one target validator to initial estimates, profile recalculation, manual targets, and adaptive recommendations.
- [x] Keep manual and calculated target policies consistent unless the safety policy names a reason for a difference.
- [x] Reject a cut target at or above current weight.
- [x] Reject a bulk target at or below current weight.
- [x] Define maintain-target behavior in the policy and enforce it.
- [x] Prevent adaptive Accept from crossing the same target boundaries.
- [x] Keep historical targets unchanged. Insert a new effective target only after the user reviews and accepts it.
- [x] Show a direct error when a safe plan cannot be calculated. Do not clamp in silence.

Verification matrix:

- [x] Minimum and maximum age, height, and weight.
- [x] Lowest and highest allowed cut and bulk rate at several body weights.
- [x] Male and female formula branches.
- [x] Each activity level and protein preference.
- [x] Manual targets at every boundary.
- [x] Negative, zero, `NaN`, infinite, and oversized values.
- [x] Adaptive recommendation just inside and outside each boundary.
- [x] Regression case for the current low-calorie calculation path.

### M1.4 Add clear health and estimation language

Target files:

- `src/screens/OnboardingScreen.tsx`
- plan preview screens
- `src/screens/ProfileInfoScreens.tsx`
- store metadata created in M7

Tasks:

- [x] State that calorie and macro targets are estimates for general wellness use.
- [x] State that meal-photo and description results are estimates and require review.
- [x] Tell users to consult a qualified professional for medical conditions, pregnancy, eating-disorder history, or specialized nutrition needs.
- [x] Avoid diagnosis, treatment, guaranteed weight change, and guaranteed accuracy claims.
- [x] Keep the copy concise and visible at decision points.

### M1 exit criteria

- [x] Target-safety policy values are recorded in named constants and tests.
- [x] All target sources pass one shared guardrail suite.
- [x] Adult gating works for new and existing profiles.
- [x] No valid UI path produces a target outside policy.

## 8. Milestone M2: privacy, permissions, support, and legal disclosures

### M2.1 Build a release data inventory

Document each data flow before writing policy text:

| Data | Location or recipient | Purpose | Retention question to resolve |
| --- | --- | --- | --- |
| Profile, food logs, weights, targets | On-device SQLite | Core tracking | Until user deletes or restores |
| Saved meal photos | App storage | Diary history | Until log/photo deletion or reset |
| Health Connect weights | Android Health Connect and local database | Optional weight sync | Controlled by the user, Android, and Eatlog; Eatlog removes its own records when possible |
| Meal photo sent for estimation | Worker, then Gemini | User-requested estimate | Confirm Worker and Gemini handling and retention |
| Food description | Worker, then Gemini | User-requested estimate | Confirm provider handling and retention |
| USDA query and selected ID | Worker, then USDA | Food search/details | Confirm logs and cache behavior |
| Open Food Facts query | Open Food Facts from device | Explicit full search | Confirm provider terms; disclose direct transfer |
| App-scoped installation token | Worker | Abuse prevention and rate limiting | Worker hashes it; define token lifetime |
| Request IP | Cloudflare and upstream network providers | Delivery and rate limiting | Confirm platform logs and configured retention |
| Worker operational metadata | Cloudflare metrics/logs | Availability and abuse monitoring | Keep bodies, prompts, IDs, and secrets out of logs |

### M2.2 Publish privacy and support pages

Required public pages:

- `/privacy`: complete privacy policy with effective date and contact.
- `/support`: support email, basic troubleshooting, backup warning, current app version instructions, and response expectations.

Privacy policy contents:

- [ ] Developer identity and Eatlog name.
- [x] Local-first storage and no-account behavior.
- [x] Camera/photo access and user-triggered transmission.
- [x] Gemini, USDA, Open Food Facts, Cloudflare, and Health Connect roles.
- [x] Data categories, purposes, retention, deletion, and sharing.
- [x] App-scoped rate-limit token and IP processing.
- [x] Apple or Google processes the upfront purchase and payment details; Eatlog receives no card or bank data.
- [x] Backup/export behavior and user responsibility for shared files.
- [x] Health data handling and permission revocation.
- [x] Adult-only scope.
- [x] Policy-change process and contact address.
- [x] Links to relevant provider policies where useful.

Page requirements:

- [ ] Public HTTPS access without login.
- [ ] Mobile-readable layout.
- [ ] Stable URLs under a domain the owner controls.
- [ ] No placeholder contact or company details.
- [x] Version-controlled source or saved release copy.

### M2.3 Update in-app disclosure and consent

Target files:

- `src/screens/ProfileInfoScreens.tsx`
- `src/screens/ProfileScreen.tsx`
- scan/description entry flow
- navigation types/routes as needed

Tasks:

- [ ] Link the public privacy policy and support page from Profile.
- [x] Expand the privacy screen to describe the Worker, installation token, IP/rate limiting, and direct Open Food Facts requests.
- [x] Present a one-time disclosure before the first photo or description leaves the device.
- [x] Name Gemini as the recipient and state the purpose.
- [x] Require an affirmative action to continue; cancel leaves the content on device.
- [x] Store only the disclosure version and acceptance state locally.
- [x] Show disclosure again after a material data-flow change.
- [x] Keep search disclosure near explicit online search behavior.

### M2.4 Remove unused permissions and audit generated native files

Target files:

- `app.json`
- generated Android manifest and iOS Info.plist used only for verification

Tasks:

- [x] Remove explicit `android.permission.RECORD_AUDIO`.
- [x] Set `microphonePermission: false` in the `expo-image-picker` plugin.
- [x] Rewrite camera and photo permission strings to describe meal scanning, not food-label scanning alone.
- [x] Confirm camera access appears only when the user starts a camera flow.
- [x] Confirm gallery access appears only when the user starts a gallery flow.
- [x] Confirm Health Connect requests only weight permissions used by the app.
- [ ] Confirm the Health Connect system privacy/rationale action opens Eatlog's privacy information or its public policy as required.
- [x] Generate native projects or inspect the EAS build artifact to audit final permissions.
- [ ] Record the Android manifest permission list and iOS usage strings in release evidence.

### M2.5 Complete provider identification and licensing

Target files:

- `src/services/foodSearchRemote.ts`
- `src/screens/ProfileInfoScreens.tsx`
- public privacy/support/legal pages

Tasks:

- [x] Move Open Food Facts search from legacy `/cgi/search.pl` to its supported search interface.
- [x] Use the required User-Agent shape: `Eatlog/<version> (<support-email>)`.
- [ ] Register Eatlog/API usage with Open Food Facts if their current process requires it.
- [x] Add visible Open Food Facts database attribution and ODbL link.
- [x] Add USDA FoodData Central attribution and its public-domain/CC0 status.
- [x] Add Google Gemini and Cloudflare service acknowledgements without implying endorsement.
- [x] Generate a third-party software notice from production dependencies and bundled fonts.
- [x] Keep the project’s 0BSD app license visible in About.

### M2.6 Prepare store policy worksheets

Google Play worksheet:

- [x] Data Safety answers for transmitted photos, descriptions, searches, app-scoped token, and provider processing.
- [x] Confirmation that local-only profile, log, and health records do not leave the device unless the user exports or invokes a network feature.
- [x] Health Apps declaration with Nutrition and Weight Management plus every applicable Health Connect category.
- [x] Health Connect permission justification.
- [x] Ads: none.
- [x] Account creation: none; store account-deletion rules do not apply.
- [x] Content rating and target audience: adults.

Apple worksheet:

- [x] App Privacy answers for all app and third-party SDK behavior.
- [ ] Privacy policy URL and support URL.
- [x] Updated age-rating questionnaire.
- [x] Medical or treatment-information answer based on final copy, with no claim that Eatlog is a medical device.
- [x] Export-compliance answer.
- [ ] Third-party SDK privacy manifest and required-reason API review.
- [x] Review notes that explain local-first storage, optional remote estimates, and the absence of login.

### M2 exit criteria

- [ ] Public pages are live and linked in the app.
- [ ] A release-binary permission audit matches the written policy.
- [ ] Both store worksheets are complete and reviewed against the binary.
- [ ] Provider identification and attribution meet current terms.

## 9. Milestone M3: dependency, configuration, and release baseline

### M3.1 Reproduce from a clean checkout

Tasks:

- [ ] Preserve current unrelated work and use a dedicated release branch when implementation starts.
- [x] Run root `npm ci` with a writable temp directory when needed.
- [ ] Run `npm ci` in `worker/`.
- [x] Run `npx expo install --check`.
- [x] Run `npx expo-doctor`.
- [ ] Run `npm audit --omit=dev`; review high/critical findings and document accepted exceptions.
- [ ] Verify no build depends on untracked files or global packages.

### M3.2 Resolve the current dependency findings

- [x] Confirm the exact `react-native-reanimated` peer range in the clean install.
- [x] If Expo Doctor still requires a direct `react-native-worklets` dependency, add the Expo-compatible version and resolve any strict-mode warnings instead of ignoring the peer requirement.
- [x] Confirm `react-native-svg` resolves to the Expo-supported `15.12.1` version from the lockfile.
- [ ] Replace the unmaintained `expo-health-connect` plugin or own a local config plugin that produces the required Android 13 permission-rationale intent and Android 14+ permission-usage alias.
- [ ] Compare generated manifests before removing the old plugin. Preserve all required Health Connect entries.
- [x] Investigate the `app.config.js`/`app.json` Expo Doctor warning. Document it only if evaluated config proves the warning is a false positive.

### M3.3 Update Expo native configuration

Target files:

- `app.json`
- `app.config.js`
- `eas.json`
- `.gitignore`

Tasks:

- [x] Remove the Android compile/target SDK 35 override and use Expo SDK 54’s API 36 defaults, or set both to 36 if explicit values remain necessary.
- [x] Keep Android minimum SDK 26 unless device-support policy changes.
- [ ] Add `ios.bundleIdentifier` after Apple reservation.
- [ ] Add a development iOS identifier variant so dev and production builds can coexist.
- [ ] Keep `ios.supportsTablet: false` for v1.
- [ ] Add an accurate `ios.config.usesNonExemptEncryption` value.
- [ ] Confirm the 1024 by 1024 iOS icon has no transparency and follows the canonical Eatlog mask.
- [ ] Add production permission strings.
- [ ] Keep EAS project ID, owner, update URL, and runtime-version policy.

### M3.4 Create production EAS profiles

Required `eas.json` behavior:

- [x] Add `cli.version` and `cli.appVersionSource: "remote"`.
- [x] Add a `production` build profile with `channel: "production"`, production environment selection, and `autoIncrement: true`.
- [x] Build Android as `app-bundle`.
- [ ] Build iOS for App Store distribution.
- [x] Keep preview as an internal APK for direct device QA.
- [ ] Add an Android internal-track submit profile with `releaseStatus: "draft"` for the first upload.
- [ ] Add a production Android submit profile only after closed testing.
- [ ] Add an iOS submit profile with App Store Connect app ID after the record exists.
- [ ] Keep service-account JSON and `.p8` credentials out of git. Prefer EAS-managed credentials or secret file variables.

Version policy:

- Keep `expo.version` as the marketing version. The first store release may remain `1.1.0`.
- Let EAS remote version management control Android `versionCode` and iOS `buildNumber`.
- Increment the marketing version only for a user-visible release.
- Tag the exact public commit as `v<marketing-version>` after both store binaries are fixed.

### M3.5 Define EAS Update policy

- [x] Bind public builds to the `production` channel.
- [ ] Keep `runtimeVersion.policy: "appVersion"` unless a tested policy change has a clear benefit.
- [ ] Allow OTA updates only for JavaScript/assets compatible with the installed native runtime.
- [ ] Require the same tests and smoke flow before an OTA publish.
- [ ] Do not use OTA to bypass store review for native behavior, privacy changes, permissions, or incompatible database migrations.
- [ ] Record every production update ID and rollback target.
- [ ] Practice reverting a preview-channel update before using production OTA.

### M3 exit criteria

- [ ] Clean checkout verification passes.
- [ ] Expo Doctor has no unexplained release-impacting finding.
- [ ] Evaluated production config has stable identifiers and required SDK levels.
- [ ] EAS can produce production build plans for Android and iOS without exposing secrets.

## 10. Milestone M4: cross-platform service and iOS enablement

### M4.1 Replace Android ID with an app-scoped installation identity

Recommended design:

- Add one service module that owns installation-token creation and retrieval.
- Generate a random 32-character hexadecimal token from a secure UUID or random bytes.
- Persist it in app-private file storage already provided by `expo-file-system`.
- Keep the token outside the SQLite backup so a restore onto another device does not clone the rate-limit identity.
- Guard first creation with one shared promise so concurrent startup requests cannot create different tokens.
- Regenerate only after uninstall, missing/corrupt storage, or an explicit internal recovery path.
- Never display or log the raw token.

Target files:

- proposed `src/services/installIdentity.ts`
- `src/services/foodScan.ts`
- `src/services/foodSearchRemote.ts`
- related service tests
- Worker tests if the accepted format changes

Tasks:

- [ ] Make scan/description token retrieval asynchronous.
- [ ] Make Worker-backed USDA token retrieval asynchronous.
- [ ] Preserve dependency injection in tests.
- [ ] Keep the Worker’s 16 to 64 hexadecimal validation if the new token fits it.
- [ ] Confirm the Worker hashes the token before rate-limit storage.
- [ ] Handle token-storage failure as a recoverable service-unavailable state.

Verification:

- [ ] First call creates one valid token.
- [ ] Concurrent first calls return the same token.
- [ ] App restart returns the same token.
- [ ] Corrupt token storage regenerates a valid token without a crash.
- [ ] Backup/restore does not copy the token.
- [ ] Android and iOS send the same header format.
- [ ] No logs contain the token.

### M4.2 Hide Android-only health behavior on iOS

Target files:

- `src/screens/ProfileScreen.tsx`
- `src/screens/ProfileInfoScreens.tsx`
- `src/screens/DataSyncScreens.tsx`
- `src/navigation/ProfileNavigator.tsx`
- `src/navigation/TabNavigator.tsx`
- `src/services/healthConnect.ts`

Tasks:

- [ ] Remove the Health Connect row and route from iOS navigation.
- [ ] Skip foreground Health Connect sync on iOS.
- [ ] Remove Health Connect wording from iOS privacy and delete-all copy.
- [ ] Keep Android behavior unchanged.
- [ ] Ignore Android Health Connect sync metadata safely when an Android backup is restored on iOS.
- [ ] Keep Apple Health/HealthKit out of v1 code and metadata.

### M4.3 Validate every native iOS surface

- [ ] Camera permission, capture, cancel, retry, and denial.
- [ ] Photo picker selection, cancellation, limited-library access, and large images.
- [ ] Image manipulation and upload timeouts.
- [ ] Date and number input behavior.
- [ ] Keyboard avoidance in onboarding, manual food, and Profile forms.
- [ ] Bottom-sheet heights, gestures, discard gates, and safe-area insets.
- [ ] Tab/FAB geometry on small and large iPhones.
- [ ] Document picker for `.eatlog-backup` and legacy `.marco-backup`.
- [ ] Share sheet for backups and CSV exports.
- [ ] Restore an Android-created backup on iOS.
- [ ] Restore an iOS-created backup on Android.
- [ ] Dark status bar, splash, icon, and launch behavior.
- [ ] App resume after camera/photo picker and low-memory interruption.

### M4.4 Verify iOS store configuration

- [ ] App Store bundle identifier matches evaluated Expo config.
- [ ] Distribution certificate and provisioning profile exist in EAS.
- [ ] The generated Info.plist contains camera/photo descriptions and no microphone description.
- [ ] The binary contains required privacy manifests and approved-reason entries from dependencies.
- [ ] `supportsTablet` remains false and App Store Connect expects iPhone assets only.
- [ ] The archive uses Xcode 26/iOS 26 SDK or the current Apple minimum.

### M4 exit criteria

- [ ] Scan, Describe, and USDA work on both platforms with the new token.
- [ ] iOS exposes no dead Health Connect control.
- [ ] A signed iOS internal build completes the core logging and data-ownership flows.

## 11. Milestone M5: automated verification, migration, recovery, and device QA

### M5.1 Strengthen automated tests

Add focused tests for:

- [ ] Adult date boundaries and local-date parsing.
- [ ] Shared target-safety validation across all target origins.
- [ ] Goal/target direction.
- [ ] Extreme calculations and invalid numbers.
- [ ] Adaptive recommendation safety boundaries.
- [ ] Installation-token creation, persistence, corruption, and concurrency.
- [ ] Platform-specific Health Connect visibility and service guards.
- [ ] Open Food Facts endpoint, User-Agent, parsing, errors, and cancellation.
- [ ] Privacy disclosure version/acceptance state.

### M5.2 Add full supported migration evidence

Target files:

- `src/db/database.ts`
- migration tests and fixture databases under a test-fixture directory

Tasks:

- [ ] Create a representative schema-v4 fixture with profile, targets, food logs, meals, weights, photos, pins, and caches where those tables exist.
- [ ] Run the real sequential migration path to the current schema.
- [ ] Verify row IDs, dates, relationships, target history, origins, indexes, and `PRAGMA user_version`.
- [ ] Test a fresh empty database.
- [ ] Test legacy Marco-origin Health Connect data handling.
- [ ] Test rejection of a future/newer database version without modifying it.
- [ ] Keep fixture contents synthetic and free of personal data.

### M5.3 Prove backup and restore on devices

Required cases:

- [ ] Backup with no photos.
- [ ] Backup with several photos and Unicode food names.
- [ ] Cancel during cancellable backup work.
- [ ] Share/save cancellation.
- [ ] Restore current `.eatlog-backup`.
- [ ] Restore supported legacy `.marco-backup`.
- [ ] Restore a supported older schema and run migrations.
- [ ] Reject wrong extension, empty file, oversized archive, path traversal, missing manifest, hash mismatch, missing database, invalid database, and future schema.
- [ ] Force a restore failure after the live database replacement and prove automatic rollback restores database and photos.
- [ ] Force a rollback failure in a test harness and prove the app reports an unrecoverable state without claiming success.
- [ ] Restore Android to Android, iOS to iOS, Android to iOS, and iOS to Android.
- [ ] Confirm CSV remains readable export only and cannot enter restore.

Every run records source app version, source schema, destination platform, result, and photo counts.

### M5.4 Create a small automated UI smoke suite

Recommended approach: Maestro flows outside the app runtime. A documented manual script remains acceptable if tooling blocks Maestro, but the manual script must produce screenshots and a signed checklist.

Automate stable paths:

- [ ] Fresh onboarding with a safe adult profile.
- [ ] Manual food entry and Today totals.
- [ ] Diary edit, delete, and undo.
- [ ] Weight entry and Analytics visibility.
- [ ] Profile navigation, privacy page, and export screen.

Keep camera, gallery system UI, Health Connect, share sheets, and destructive restore in the physical-device matrix.

### M5.5 Physical-device test matrix

Android targets:

- API 26 device/emulator for minimum support.
- Current API 36 Google device/emulator.
- One Samsung device with current One UI.
- One constrained device or emulator with low memory and small screen.

iOS targets:

- Minimum iOS version supported by the evaluated SDK 54 build.
- iOS 26 or current production iOS.
- One small iPhone and one large iPhone.
- At least one physical iPhone for camera, picker, files, and sharing.

Run these scenarios on the matrix:

1. Install, first launch, onboarding, process kill, and resume.
2. Age and target safety boundaries.
3. Camera and photo permissions: grant, deny, select "do not ask again," cancel, retry.
4. Scan, Describe, USDA, Open Food Facts, local cache, recent, pin, and manual logging.
5. Airplane mode, slow connection, timeout, HTTP error, malformed provider response, and rate limit.
6. Edit, delete, undo, repeat, and backdated logging.
7. Weight entry, Health Connect Android grant/revoke, and Analytics.
8. Adaptive review Accept and Keep.
9. Backup, restore, corrupt restore, rollback, export, and reset.
10. Android Back, iOS swipe-back, sheet discard gates, background/foreground, and process recreation.
11. TalkBack or VoiceOver labels, focus order, adjustable controls, announcements, and reduced motion.
12. Large text, long food names, large calorie values, and empty/error/loading states.

### M5.6 Release verification command set

Run from a clean checkout for each release candidate:

```bash
env TMPDIR=/tmp npm ci
env TMPDIR=/tmp npm test
npm run typecheck
npx expo install --check
npx expo-doctor
env TMPDIR=/tmp npx expo export --platform android
env TMPDIR=/tmp npx expo export --platform ios

cd worker
npm ci
npm test
npm run typecheck
npm run dry-run
```

Then inspect:

```bash
npx expo config --type public
eas build:version:get --platform android
eas build:version:get --platform ios
eas env:list --environment production
```

Do not place secret values in captured logs.

### M5 exit criteria

- [ ] Automated release checks pass from a clean checkout.
- [ ] Full supported migration and restore evidence exists.
- [ ] The device matrix has no open P0/P1 issue.
- [ ] The release-candidate commit has no unrelated diff.

## 12. Milestone M6: Worker and provider production operations

### M6.1 Confirm production secrets and limits

- [ ] Keep `USDA_API_KEY`, `GEMINI_API_KEY`, and `RATE_LIMIT_SALT` as Worker secrets.
- [ ] Rotate any key that appeared in an older client build or local log.
- [ ] Confirm production and preview EAS environments contain only the public Worker URL.
- [ ] Confirm install, IP, and emergency limits in deployed Worker bindings.
- [ ] Set Gemini project quota and budget alerts.
- [ ] Set Cloudflare usage/error notifications supported by the account plan.
- [ ] Record who can rotate keys and deploy or roll back the Worker.

### M6.2 Verify privacy-preserving observability

- [ ] Keep request bodies, queries, prompts, responses, raw IDs, ID hashes, headers, and secrets out of logs.
- [ ] Verify sampled logs contain route, status, latency, upstream category, cache outcome, and rejection category only.
- [ ] Inspect a release smoke-test log sample by hand.
- [ ] Use Play Android Vitals, TestFlight/App Store crash reports, Worker metrics, and the support inbox for v1 monitoring.
- [ ] Do not add a third-party app telemetry SDK before v1 unless the owner accepts its privacy and dependency cost.

### M6.3 Run production smoke tests

Run after every Worker deployment and before store review:

- [ ] `GET /healthz`.
- [ ] Valid common and full USDA searches.
- [ ] Valid USDA food detail.
- [ ] Valid Describe request using non-sensitive synthetic text.
- [ ] Valid Scan request using a non-sensitive test image, with cost approval.
- [ ] Wrong methods.
- [ ] Malformed JSON and invalid fields.
- [ ] Oversized text and image.
- [ ] Invalid/missing install token.
- [ ] Rate limiting and `Retry-After`.
- [ ] Upstream timeout and malformed upstream response in test harness.
- [ ] Redacted 4xx/5xx logs.

### M6.4 Maintain a release runbook

Record for each release:

- Worker URL and deployed version.
- Previous healthy version and rollback command.
- Secret rotation dates.
- Gemini models and fallback order.
- USDA and Open Food Facts contract checks.
- Quota/budget confirmation.
- Smoke-test results.
- On-call/support owner.

Rollback drill:

1. Deploy a harmless preview Worker version.
2. Confirm the preview app reaches it.
3. Roll back to the recorded healthy version.
4. Repeat the smoke test.
5. Record the result before using the process in production.

### M6 exit criteria

- [ ] Production services pass smoke tests.
- [ ] A named owner can deploy, rotate keys, and roll back.
- [ ] Budget and error notifications work.
- [ ] Logs match the privacy policy.

## 13. Milestone M7: store records, metadata, artwork, and review material

### M7.1 Create store records

Google Play Console:

- [ ] Create the app with package `com.sgaret.eatlog`.
- [ ] Select app, default language, paid pricing, and target countries.
- [ ] Create and verify the Google payments profile with the correct legal name, physical address, Philippines bank account, support details, and tax information.
- [ ] Set the Philippines app price to PHP 299 before the app is published on any public track.
- [ ] Never publish this package as free. Google does not allow an app that has been offered for free to become paid; correcting that mistake would require a new package.
- [ ] Review Google Play service fees, Philippines tax handling, payout threshold, and expected net proceeds.
- [ ] Keep internal APK distribution restricted to testers so it does not become a free public alternative to the paid listing.
- [ ] Enable Play App Signing and preserve the EAS upload key.
- [ ] Set up API/service-account access after the first record exists.
- [ ] Confirm whether the account requires the 12-tester/14-day production-access process.

App Store Connect:

- [ ] Reserve the Eatlog bundle ID.
- [ ] Create the app record with primary language and stable SKU.
- [ ] Have the Account Holder accept the current Paid Apps Agreement.
- [ ] Complete Apple banking and required tax forms before expecting payouts.
- [ ] Set the Philippines as the base storefront and select the price point that displays PHP 299. If Apple does not offer that exact point, stop and obtain owner approval for the closest price.
- [ ] Review Apple commission, Philippines tax treatment, and expected net proceeds.
- [ ] Set target countries and confirm Apple-generated equivalent prices.
- [ ] Complete agreements and EU trader status if applicable.
- [ ] Create an App Store Connect API key or configure EAS-managed credentials.

### M7.2 Write one approved source of store copy

Create source copy that both stores adapt. It must include:

- Product name: Eatlog.
- One-time upfront price: PHP 299 in the Philippines, with no subscription or in-app purchase.
- One-sentence value proposition.
- Local-first ownership statement.
- Scanner, description, search, manual, diary, weight, analytics, adaptive review, backup, and export features.
- Adult general-wellness scope.
- Estimate and provider disclosures.
- No unsupported accuracy, health-outcome, user-count, testimonial, or social-proof claims.
- No claim of full offline operation because scan, Describe, USDA, and Open Food Facts need network access.
- No Apple Health claim in iOS v1.

Google fields:

- [ ] Title within current Play limit.
- [ ] Short description.
- [ ] Full description.
- [ ] Release notes.
- [ ] App category: Health & Fitness unless Console guidance changes.
- [ ] Support email and privacy URL.

Apple fields:

- [ ] Title within 30 characters. Keep Eatlog first.
- [ ] Subtitle within 30 characters.
- [ ] Keywords within 100 characters without unsupported competitor claims.
- [ ] Description within 4,000 characters.
- [ ] Promotional text if useful.
- [ ] Release notes.
- [ ] Primary category: Health & Fitness. Consider Food & Drink as secondary if available and accurate.
- [ ] Privacy, support, and optional marketing URLs.

### M7.3 Produce store artwork from the canonical brand

- [ ] Derive every raster from the canonical 1024 by 1024 flat-white egg mask.
- [ ] Export Play high-resolution icon and feature graphic using current Console dimensions.
- [ ] Use the existing adaptive and monochrome Android assets.
- [ ] Export an opaque 1024 by 1024 App Store icon.
- [ ] Do not add promotional badges, ratings, awards, or claims.

Screenshot story:

1. Today progress and fast Add entry.
2. Scan or photo review with editable components.
3. Food search with useful common results.
4. Diary with meals and real photo treatment.
5. Analytics weight trend and logging consistency.
6. Adaptive recommendation Accept/Keep.
7. Backup/data ownership or Profile plan controls.

Screenshot rules:

- [ ] Use synthetic data and non-identifying food photos.
- [ ] Capture from release builds with final fonts, icon, copy, and safe areas.
- [ ] Show Android and iOS UI from their own binaries.
- [ ] Meet each store’s current device-size and count requirements.
- [ ] Keep text readable on the product page.
- [ ] Avoid UI that the shipped binary does not contain.

### M7.4 Complete reviewer material

Google notes/checks:

- [ ] Explain Health Connect weight read/write use.
- [ ] Provide steps for camera, gallery, backup, and reset.
- [ ] Keep production Worker online during review.

Apple review notes:

- [ ] State that Eatlog is a paid upfront download with no login, subscription, in-app purchase, or extra paid feature.
- [ ] Explain that Scan and Describe send user-selected content to Gemini through the Eatlog Worker.
- [ ] Explain that all saved logs remain on device unless the user exports a file.
- [ ] Give a short path through onboarding, manual entry, scan, backup, and reset.
- [ ] State that iOS v1 does not expose Health Connect or HealthKit.
- [ ] Give reviewer support contact and time zone.

### M7 exit criteria

- [ ] Both store records exist with stable identifiers.
- [ ] All required copy, URLs, forms, artwork, screenshots, and reviewer notes are ready.
- [ ] Store claims match the tested binary and privacy policy.

## 14. Milestone M8: Google Play internal and closed release

### M8.1 Build and upload the Android release candidate

Pre-build:

- [ ] Freeze the candidate commit.
- [ ] Run M5 verification.
- [ ] Confirm production environment values without printing secrets.
- [ ] Confirm target API and generated permission list.
- [ ] Confirm Worker production smoke test.

Build and submit:

```bash
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest submit --platform android --profile internal --latest
```

- [ ] Record EAS build ID, artifact checksum, version, version code, Git commit, and submission ID.
- [ ] Let EAS Submit create or populate the internal test release as supported by current Expo tooling.
- [ ] Keep the initial release in draft until store forms and tester list are checked.
- [ ] Inspect Play pre-launch report and App Bundle Explorer.

### M8.2 Internal test

- [ ] Add a small trusted tester group.
- [ ] Run the Android physical-device matrix against the Play-installed build.
- [ ] Verify Play App Signing did not change runtime behavior.
- [ ] Verify production API access, Health Connect, backup, restore, and app updates.
- [ ] Fix all P0/P1 findings and repeat the build gate.

### M8.3 Closed test and production access

If the account is a personal account created after 2023-11-13:

- [ ] Enroll at least 12 testers.
- [ ] Keep all required testers opted in for 14 continuous days.
- [ ] Give testers a scenario checklist and feedback address.
- [ ] Track meaningful use: onboarding, at least one log, one edit, one weight, one export/backup attempt, and failure feedback.
- [ ] Keep a dated issue and response log for the production-access questionnaire.
- [ ] Apply for production access only after the continuous period and release gates pass.

For other account types, still run a closed test long enough to cover the device and recovery matrix.

### M8.4 Android production rollout

- [ ] Upload or promote the exact closed-test candidate unless a fix requires a new build.
- [ ] Start with a 10 percent staged rollout.
- [ ] Observe at least one full day and enough real sessions to inspect crashes, ANRs, provider failures, support messages, and Worker usage.
- [ ] Increase to 25 percent, 50 percent, then 100 percent only when no P0/P1 signal appears.
- [ ] Record each rollout change and observation.

Android halt conditions:

- Data loss or corrupt restore.
- Unsafe target generation.
- Privacy or permission mismatch.
- Startup crash or broad core-flow failure.
- Worker cost/abuse spike or leaked secret.
- Material store-policy discrepancy.

### M8 exit criteria

- [ ] Google grants production access where required.
- [ ] The staged rollout reaches 100 percent without a halt condition.
- [ ] Support and Worker operations remain within planned capacity.

## 15. Milestone M9: TestFlight and App Store release

### M9.1 Build and upload the iOS release candidate

Pre-build:

- [ ] Freeze the candidate commit after Android fixes have landed.
- [ ] Run M5 verification and the full iOS matrix.
- [ ] Confirm App Privacy worksheet, Info.plist strings, privacy manifests, and export compliance.
- [ ] Confirm the production Worker and support pages are live.

Build and submit:

```bash
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production --latest
```

- [ ] Record EAS build ID, version, build number, Git commit, and submission ID.
- [ ] Confirm App Store Connect finishes processing the build.

### M9.2 Internal TestFlight

- [ ] Add internal testers.
- [ ] Install from TestFlight, not a development build.
- [ ] Run the iOS device matrix.
- [ ] Verify camera, gallery, files, share sheet, backup/restore, cross-platform backup, and remote providers.
- [ ] Inspect TestFlight crash reports and tester screenshots.
- [ ] Fix all P0/P1 findings and upload a new build number.

### M9.3 External TestFlight

- [ ] Create an external tester group.
- [ ] Complete Beta App Review information and beta release notes.
- [ ] Recruit a small group outside the development environment.
- [ ] Give them the same core and recovery scenarios used for Android.
- [ ] Collect confusion points around permissions, estimates, plan safety, and data ownership.
- [ ] Close or accept every issue before App Review submission.

### M9.4 App Review and release

- [ ] Select the tested build in App Store Connect.
- [ ] Complete metadata, screenshots, privacy answers, age rating, review contact, and notes.
- [ ] Use manual release after approval for the first version.
- [ ] Submit for review.
- [ ] Answer reviewer questions with direct steps and policy links.
- [ ] If rejected, record the guideline, reproduce the issue, change only the required scope, retest, and resubmit.
- [ ] After approval, start Apple’s phased release.
- [ ] Monitor crashes, reviews, support, and Worker usage through the phased period.

iOS halt conditions match Android, plus:

- Incorrect privacy manifest or App Privacy answer.
- Camera/photo usage-string mismatch.
- Core remote services unavailable because of installation-token or networking behavior.
- Dead Android-only feature visible on iOS.

### M9 exit criteria

- [ ] External TestFlight has no open P0/P1 issue.
- [ ] Apple approves the tested build.
- [ ] The phased release completes without a halt condition.

## 16. Milestone M10: post-launch operation and rollback

### M10.1 First-release monitoring

Check each day during both staged releases:

- Play Android Vitals or App Store/TestFlight crash reports.
- Store review and policy messages.
- Support inbox and recurring user confusion.
- Worker request volume, 429s, 5xx responses, latency, and CPU.
- Gemini and USDA quotas/cost.
- Backup/restore and data-loss reports.
- Unsafe or implausible target reports.

### M10.2 Incident priorities

| Priority | Examples | Required response |
| --- | --- | --- |
| P0 | Data loss, privacy leak, unsafe target, exposed secret, widespread startup crash | Halt rollout, disable affected remote path if possible, preserve evidence, fix and retest |
| P1 | Scan/search unavailable for a large user group, restore broken without loss, Health Connect corrupts sync, major navigation blocker | Pause rollout increase, prepare hotfix, run focused and release gates |
| P2 | Localized UI defect, confusing copy, device-specific layout issue with workaround | Record, prioritize, fix in normal update |
| P3 | Cosmetic issue or enhancement | Backlog after release stabilization |

### M10.3 Rollback choices

Worker failure:

1. Roll back the Worker to the recorded healthy version.
2. Smoke-test it.
3. Keep app fallbacks available while service recovers.

JavaScript-only app failure with compatible native runtime:

1. Halt store rollout increases.
2. Revert or fix on the same runtime.
3. Run full OTA verification.
4. Publish to a preview channel first.
5. Publish to production and record the update ID.

Native, permission, privacy, or database failure:

1. Halt Play rollout or pause Apple phased release.
2. Do not attempt an incompatible OTA fix.
3. Increment build numbers and prepare a store hotfix.
4. Run the full release gate before submission.

Store binaries cannot be replaced in place. Preserve the prior source tag and signing credentials, but ship a higher build/version for native fixes.

### M10.4 Release record

Store one release record containing:

- Marketing version and build numbers.
- Git commit and tag.
- EAS Android/iOS build IDs and checksums.
- Store submission IDs and rollout dates.
- Worker version and rollback target.
- Production environment variable names, without values.
- Test and device evidence.
- Privacy policy version.
- Data Safety, Health Apps, and App Privacy submission dates.
- Known accepted issues.
- Support and incident owner.

## 17. Final release checklists

### 17.1 Shared candidate checklist

- [ ] Name remains Eatlog across the binary, policy, artwork, and listing.
- [ ] Version/build identifiers are correct.
- [ ] Adult and target-safety gates pass.
- [ ] Privacy/support URLs work.
- [ ] Permission audit matches policy.
- [ ] No provider secret exists in the app bundle or `EXPO_PUBLIC_*` values.
- [ ] Both stores show the approved paid price before public release.
- [ ] Google Play has never published `com.sgaret.eatlog` as a free app.
- [ ] Worker smoke test and rollback target pass.
- [ ] Tests, typecheck, Doctor review, exports, and native builds pass.
- [ ] Migration and recovery evidence passes.
- [ ] Screenshots match the binary.
- [ ] No placeholder text, credentials, personal data, or test endpoint remains.
- [ ] Git diff contains only release work.

### 17.2 Google Play checklist

- [ ] Package ID `com.sgaret.eatlog`.
- [ ] API 36 or current required target.
- [ ] Signed AAB and unique version code.
- [ ] Play App Signing enabled.
- [ ] Store listing and feature graphic complete.
- [ ] Data Safety complete.
- [ ] Health Apps declaration complete.
- [ ] Health Connect permissions justified.
- [ ] Content rating, target audience, pricing, and countries complete.
- [ ] Payments profile, bank account, tax information, and payout details complete.
- [ ] Privacy policy and support email valid.
- [ ] Pre-launch report reviewed.
- [ ] Closed-test requirement complete where applicable.
- [ ] Staged rollout and halt owner set.

### 17.3 Apple checklist

- [ ] Bundle ID reserved and matches binary.
- [ ] Signed IPA and unique build number.
- [ ] Built with current required Xcode/iOS SDK.
- [ ] Camera/photo strings accurate; no microphone string.
- [ ] Privacy manifests and required-reason APIs valid.
- [ ] App Privacy and export compliance complete.
- [ ] Age rating, category, pricing, countries, and EU trader status complete.
- [ ] Paid Apps Agreement, banking, and tax forms active.
- [ ] Screenshots, subtitle, keywords, description, and release notes complete.
- [ ] Review contact and notes complete.
- [ ] Internal and external TestFlight gates pass.
- [ ] Manual release and phased rollout selected.

## 18. Deferred work that does not block v1

- Apple Health/HealthKit.
- Cloud accounts and multi-device sync.
- Barcode scanning.
- Bundled offline food search.
- Subscriptions, in-app purchases, receipt servers, and cross-store entitlements.
- Notifications and reminders.
- Light theme.
- Localization.
- Social or coach features.
- Third-party product analytics or crash SDK.
- Automated EAS release workflows. Add tag-triggered automation after one manual Android and one manual iOS release prove the credential and review process.

## 19. Recommended implementation batches

Keep diffs reviewable and verify each batch before starting the next:

1. **Safety policy and tests:** adult gating, local date parsing, shared target validation, adaptive boundaries.
2. **Privacy and permissions:** data inventory, public pages, consent, support links, microphone removal, permission audit.
3. **Dependency and Android build baseline:** API 36, Health Connect plugin strategy, peer dependencies, clean Expo Doctor review.
4. **Cross-platform installation identity:** new token service, client integration, Worker contract tests.
5. **iOS platform guards and config:** bundle ID, Health Connect hiding, usage strings, files/share/camera behavior.
6. **Recovery evidence:** full migration fixture, device backup/restore/rollback, cross-platform archives.
7. **Store materials and operations:** screenshots, metadata, declarations, Worker runbook, account setup.
8. **Google Play closed release:** AAB, internal/closed testing, production-access application, staged rollout.
9. **TestFlight and App Store:** IPA, internal/external TestFlight, review, phased release.
10. **Release automation:** add EAS Workflows only after the manual path has succeeded on both stores.

Every implementation batch requires its own success criteria, focused tests, full root test/typecheck, relevant platform export/build, and diff review. Do not combine unrelated UI changes or new features with release hardening.

## 20. Official references

Recheck these before submission:

- [Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- [Google Play testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Google Play Health Apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en)
- [Google Play Health Content and Services policy](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en)
- [Google Play Data Safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Google Play paid-app pricing rules](https://support.google.com/googleplay/android-developer/answer/6334373?hl=en)
- [Google Play payments profile setup](https://support.google.com/googleplay/android-developer/answer/7161426?hl=en)
- [Google Play merchant support by country](https://support.google.com/googleplay/android-developer/answer/9306917?hl=en)
- [Apple upcoming submission requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple third-party SDK and privacy-manifest requirements](https://developer.apple.com/support/third-party-SDK-requirements/)
- [Apple paid-app pricing](https://developer.apple.com/help/app-store-connect/manage-app-pricing/set-a-price)
- [Apple Paid Apps Agreement](https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements/)
- [Apple tax information](https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information/)
- [Expo SDK 54 release notes](https://expo.dev/changelog/sdk-54)
- [Expo app-store submission guide](https://docs.expo.dev/deploy/submit-to-app-stores/)
- [Expo ImagePicker permission configuration](https://docs.expo.dev/versions/v54.0.0/sdk/imagepicker/)
- [Open Food Facts API documentation](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [USDA FoodData Central API guide](https://fdc.nal.usda.gov/api-guide/)

## 21. Release-hardening evidence: 2026-08-10

### Completed account-free batch

- Changed `app.json`: removed explicit microphone permission, disabled ImagePicker microphone permission, changed camera/photo copy to meal scanning, set Android compile/target SDK 36, and retained min SDK 26 plus Health Connect read/write weight permissions.
- Changed `eas.json`: added EAS CLI `>= 16.26.0`, remote app-version management, and a production Android AAB profile using the production environment/channel with auto-increment. Existing development and preview APK profiles are unchanged.
- Changed `package.json` and `package-lock.json`: added Expo-selected direct dependency `react-native-worklets@0.5.1`, required by `react-native-reanimated@4.1.7` peer range `0.5 - 0.8`.

### Completed M1 nutrition-safety batch

- Added `src/utils/nutritionSafety.ts` as the shared policy and validator for profile, goal-rate, macro, calorie, target-direction, and local-date checks.
- Hardened initial, profile-recalculation, manual, and adaptive target paths; unsafe values now reject or pause instead of being silently clamped or rewritten.
- Added blocking `ProfileCorrectionScreen` with correction review, export, and delete-all recovery while preserving existing logs.
- Added onboarding/profile disclaimers and adaptive target safety checks, plus boundary/regression coverage in utility and database tests.
- Added `src/db/profileCorrection.test.ts`: an in-memory SQLite fixture proves an underage existing profile resolves to `ProfileCorrection` while historical food logs, weights, and targets remain byte-for-byte unchanged.

### Verification

- `env TMPDIR=/tmp npm ci`: passed; installed 781 packages. npm reported 31 dependency-audit vulnerabilities and blocked `esbuild@0.28.1` postinstall under the local install-scripts policy.
- `env TMPDIR=/tmp npm test`: passed, 177 tests; includes the underage profile correction-path regression.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- `npx expo install --check`: passed, dependencies up to date.
- `npx expo-doctor`: 16 of 18 checks passed; remaining warnings documented below.
- `npx expo export --platform android`: passed; artifact `dist/`.
- `npx expo config --type public`: evaluated config contains compile/target SDK 36, min SDK 26, only Health Connect READ_WEIGHT/WRITE_WEIGHT permissions, and `microphonePermission: false`.
- `npx expo prebuild --platform android --no-install`: passed; artifacts `android/gradle.properties` and `android/app/src/main/AndroidManifest.xml`.
- Generated `android/gradle.properties` sets min SDK 26, compile SDK 36, and target SDK 36. Generated manifest requests only Health Connect READ_WEIGHT/WRITE_WEIGHT among app-configured sensitive permissions, contains the Android 13 rationale intent, and contains the Android 14+ `ViewPermissionUsageActivity` alias. Its `RECORD_AUDIO` line is a manifest-merger removal directive from ImagePicker, not a requested permission.
- `src/services/healthConnect.ts` requests only Weight read/write access and reads, writes, and deletes only Weight records.
- Android Gradle manifest-merging could not run because the local command allowlist blocks `gradlew`; no AAB/APK was built or distributed.

### Remaining Doctor findings and decisions

- Expo Doctor still warns that `app.config.js` does not use `app.json`. This is a static-analysis false positive: `app.config.js` imports `app.json`, spreads `expo`, and evaluated public config retains its values. No config change is needed.
- Expo Doctor marks `expo-health-connect@0.1.0` unmaintained. It must remain for now because its generated manifest preserves the Android 13 `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` intent and Android 14+ `ViewPermissionUsageActivity` alias. Do not suppress this warning.
- Before replacing Health Connect, choose one approach: a local copied config plugin preserves current manifest behavior under project control but adds maintenance ownership; an actively maintained package removes ownership cost but must first prove identical generated-manifest behavior. No replacement occurred in this batch.

### Remaining blockers and next batch

- Do not mark M2 or M3 complete: physical permission flows, final merged release manifest, audit remediation, worker verification, device testing, signing, store records, paid-account tasks, and iOS work remain unverified or out of scope.
- M1 implementation and automated verification are complete, including the existing-profile correction-path regression. No M1 numeric policy values changed.
- M1 has no remaining implementation or verification blocker. Continue M2 privacy/permissions and M3 clean-checkout release verification; M2-M10 work remains open.

### Phase 0 account-free evidence: 2026-08-10

- Changed files: `AGENTS.md`, `release/OWNER_INPUTS.md`, and this plan.
- Commands: `git status --short --branch`, `git log -8 --oneline --decorate`, `git worktree list --porcelain`, `git branch --list 'codex/store-release-readiness'`, and `git switch -c codex/store-release-readiness`.
- Result: passed. Work continues on local branch `codex/store-release-readiness` from `622a0b2`; no push, tag, release, store record, or paid action occurred.
- Artifact: `release/OWNER_INPUTS.md` records every unknown owner value with the build, submission, or public-release deadline.
- Decision: Android ships first; iOS v1 source/configuration work is authorized; `com.sgaret.eatlog` and `com.sgaret.eatlog.dev` are candidate iOS identifiers; Apple reservation remains account-bound and unverified.
- Unresolved risks: **OWNER INPUT** public developer/legal name, support email, privacy/support host, launch countries, device inventory, and operations owner; **STORE ACCOUNT** Play and Apple enrollment, app records, agreements, pricing evidence, banking, tax, and Apple bundle-ID reservation; **CREDENTIAL** store submission access and two-factor owner; **PHYSICAL DEVICE** Android and iPhone matrix; **PAID SERVICE** memberships, final signed/cloud builds, submissions, hosting, and production provider actions.

### Phase 1 / M2 account-free evidence: 2026-08-10

- Changed app source: `src/services/remoteEstimateDisclosure.ts`, `src/services/remoteEstimateDisclosureAlert.ts`, Scan/Describe/Search/Review sheet states, `src/config/services.ts`, Open Food Facts client/tests, Profile privacy/about/attribution screens, conditional public links, and reset behavior. The redundant “Take a photo. Review the estimate.” helper was removed from the FAB entry sheet; ordinary logging has no recurring privacy paragraph.
- Changed policy/legal source: `release/privacy/DATA_INVENTORY.md`, `release/site/privacy.md`, `release/site/support.md`, `release/store/POLICY_WORKSHEETS.md`, `release/legal/`, `release/OWNER_INPUTS.md`, and root `LICENSE`.
- Generated artifact: `release/legal/THIRD_PARTY_SOFTWARE.md` contains 729 unique production package/version license records from `package-lock.json`; `release/legal/ONEST-OFL-1.1.txt` preserves the bundled font notice. `scripts/generate-third-party-notices.mjs` makes the inventory reproducible and fails on missing or inconsistent license identifiers.
- Provider decision: explicit Open Food Facts full search now uses the official Search-a-licious privacy-preserving `POST /search` interface and parses `hits`. The provider is disabled unless a valid owner-controlled support email produces `Eatlog/<version> (<support-email>)`; no contact was invented. Common/type-ahead mode remains USDA-only through the Worker, and cancellation/partial-provider behavior remains intact.
- Disclosure decision: version 1 stores only `{version, accepted}` in an app-private file outside SQLite backups. Scan, Describe, AI fallback, and re-estimation all await the same first-use affirmative gate before transmission. Decline writes nothing, performs no provider call, and leaves the selected source unchanged. Material behavior/copy changes require a version increment.
- Commands and results: `npm test` passed 188/188; `npm run typecheck` passed; `npm run notices:check` passed; `git diff --check` passed; local Android and iOS JavaScript exports passed with artifacts `/tmp/eatlog-m2-android.JBeak1` and `/tmp/eatlog-m2-ios.YHpYQ8`. An initial typecheck found one test-only AbortSignal assertion error; the assertion was corrected and the recorded rerun passed.
- Test evidence: disclosure acceptance/reuse/version/corruption/storage failure/cancellation; no-transmission decline; valid HTTPS/configured User-Agent; supported Open Food Facts request body, `hits` parsing, missing-contact fail-closed behavior, non-JSON error, and abort; required in-app attribution coverage. Existing timeout, provider partial failure, and caller-cancellation tests remain passing.
- Visual/device result: **ENVIRONMENT LIMITATION** `adb devices -l` could not start the WSL ADB daemon (`could not install *smartsocket* listener: Operation not permitted`); no Android emulator executable, Xcode, or `xcrun` is available. No screenshot or physical permission result is claimed.
- Remaining M2 blockers: **OWNER INPUT** public developer/legal name, support contact/response expectation, controlled HTTPS host and final URLs, Open Food Facts API-usage registration, and page publication; **CREDENTIAL** production Gemini/Cloudflare contract, retention, and logging review; **PAID SERVICE** production Gemini service/account decision; **STORE ACCOUNT** final Data Safety, Health Apps, App Privacy, age-rating, export-compliance, and reviewer-form submission; **PHYSICAL DEVICE** permission/disclosure/share/Health Connect verification; **ENVIRONMENT LIMITATION** final merged release-binary Android/iOS permission and privacy-manifest audit. M2 exit criteria remain unchecked.
