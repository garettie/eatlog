# Eatlog Public Store Release Implementation Plan

**Status:** Account-free M2-M7 complete; M8-M10 not started

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
- [x] Store metadata avoids medical claims and states that calculated and AI-assisted results are estimates.

### 4.3 Engineering gate

- [x] `npm ci`, tests, typecheck, Expo Doctor review, and production exports pass from a clean checkout.
- [x] Worker install, tests, typecheck, and dry-run pass from `worker/`.
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
- [ ] Confirm the Health Connect system privacy/rationale action opens Eatlog's privacy information or its public policy as required. **PHYSICAL DEVICE:** source and generated-manifest checks pass; the system-launched flow still needs an Android 13 and Android 14+ device run.
- [x] Generate native projects or inspect the EAS build artifact to audit final permissions.
- [x] Record the Android manifest permission list and iOS usage strings in release evidence.

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

- [x] Preserve current unrelated work and use a dedicated release branch when implementation starts.
- [x] Run root `npm ci` with a writable temp directory when needed.
- [x] Run `npm ci` in `worker/`.
- [x] Run `npx expo install --check`.
- [x] Run `npx expo-doctor`.
- [x] Run `npm audit --omit=dev`; review high/critical findings and document accepted exceptions.
- [x] Verify no build depends on untracked files or global packages.

### M3.2 Resolve the current dependency findings

- [x] Confirm the exact `react-native-reanimated` peer range in the clean install.
- [x] If Expo Doctor still requires a direct `react-native-worklets` dependency, add the Expo-compatible version and resolve any strict-mode warnings instead of ignoring the peer requirement.
- [x] Confirm `react-native-svg` resolves to the Expo-supported `15.12.1` version from the lockfile.
- [x] Replace the unmaintained `expo-health-connect` plugin or own a local config plugin that produces the required Android 13 permission-rationale intent and Android 14+ permission-usage alias.
- [x] Compare generated manifests before removing the old plugin. Preserve all required Health Connect entries.
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
- [x] Add a development iOS identifier variant so dev and production builds can coexist.
- [x] Keep `ios.supportsTablet: false` for v1.
- [x] Add an accurate `ios.config.usesNonExemptEncryption` value.
- [x] Confirm the 1024 by 1024 iOS icon has no transparency and follows the canonical Eatlog mask.
- [x] Add production permission strings.
- [x] Keep EAS project ID, owner, update URL, and runtime-version policy.

### M3.4 Create production EAS profiles

Required `eas.json` behavior:

- [x] Add `cli.version` and `cli.appVersionSource: "remote"`.
- [x] Add a `production` build profile with `channel: "production"`, production environment selection, and `autoIncrement: true`.
- [x] Build Android as `app-bundle`.
- [x] Build iOS for App Store distribution.
- [x] Keep preview as an internal APK for direct device QA.
- [x] Add an Android internal-track submit profile with `releaseStatus: "draft"` for the first upload.
- [ ] Add a production Android submit profile only after closed testing.
- [ ] Add an iOS submit profile with App Store Connect app ID after the record exists.
- [x] Keep service-account JSON and `.p8` credentials out of git. Prefer EAS-managed credentials or secret file variables.

Version policy:

- Keep `expo.version` as the marketing version. The first store release may remain `1.1.0`.
- Let EAS remote version management control Android `versionCode` and iOS `buildNumber`.
- Increment the marketing version only for a user-visible release.
- Tag the exact public commit as `v<marketing-version>` after both store binaries are fixed.

### M3.5 Define EAS Update policy

- [x] Bind public builds to the `production` channel.
- [x] Keep `runtimeVersion.policy: "appVersion"` unless a tested policy change has a clear benefit.
- [x] Allow OTA updates only for JavaScript/assets compatible with the installed native runtime.
- [x] Require the same tests and smoke flow before an OTA publish.
- [x] Do not use OTA to bypass store review for native behavior, privacy changes, permissions, or incompatible database migrations.
- [x] Record every production update ID and rollback target.
- [ ] Practice reverting a preview-channel update before using production OTA.

### M3 exit criteria

- [x] Clean checkout verification passes.
- [x] Expo Doctor has no unexplained release-impacting finding.
- [x] Evaluated production config has stable identifiers and required SDK levels.
- [x] EAS can produce production build plans for Android and iOS without exposing secrets.

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

- [x] Make scan/description token retrieval asynchronous.
- [x] Make Worker-backed USDA token retrieval asynchronous.
- [x] Preserve dependency injection in tests.
- [x] Keep the Worker’s 16 to 64 hexadecimal validation if the new token fits it.
- [x] Confirm the Worker hashes the token before rate-limit storage.
- [x] Handle token-storage failure as a recoverable service-unavailable state.

Verification:

- [x] First call creates one valid token.
- [x] Concurrent first calls return the same token.
- [x] App restart returns the same token.
- [x] Corrupt token storage regenerates a valid token without a crash.
- [x] Backup/restore does not copy the token.
- [x] Android and iOS send the same header format.
- [x] No logs contain the token.

### M4.2 Hide Android-only health behavior on iOS

Target files:

- `src/screens/ProfileScreen.tsx`
- `src/screens/ProfileInfoScreens.tsx`
- `src/screens/DataSyncScreens.tsx`
- `src/navigation/ProfileNavigator.tsx`
- `src/navigation/TabNavigator.tsx`
- `src/services/healthConnect.ts`

Tasks:

- [x] Remove the Health Connect row and route from iOS navigation.
- [x] Skip foreground Health Connect sync on iOS.
- [x] Remove Health Connect wording from iOS privacy and delete-all copy.
- [x] Keep Android behavior unchanged.
- [x] Ignore Android Health Connect sync metadata safely when an Android backup is restored on iOS.
- [x] Keep Apple Health/HealthKit out of v1 code and metadata.

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

- [x] App Store bundle identifier matches evaluated Expo config.
- [ ] Distribution certificate and provisioning profile exist in EAS.
- [x] The generated Info.plist contains camera/photo descriptions and no microphone description.
- [ ] The binary contains required privacy manifests and approved-reason entries from dependencies.
- [x] `supportsTablet` remains false and App Store Connect expects iPhone assets only.
- [ ] The archive uses Xcode 26/iOS 26 SDK or the current Apple minimum.

### M4 exit criteria

- [ ] Scan, Describe, and USDA work on both platforms with the new token.
- [ ] iOS exposes no dead Health Connect control.
- [ ] A signed iOS internal build completes the core logging and data-ownership flows.

## 11. Milestone M5: automated verification, migration, recovery, and device QA

### M5.1 Strengthen automated tests

Add focused tests for:

- [x] Adult date boundaries and local-date parsing.
- [x] Shared target-safety validation across all target origins.
- [x] Goal/target direction.
- [x] Extreme calculations and invalid numbers.
- [x] Adaptive recommendation safety boundaries.
- [x] Installation-token creation, persistence, corruption, and concurrency.
- [x] Platform-specific Health Connect visibility and service guards.
- [x] Open Food Facts endpoint, User-Agent, parsing, errors, and cancellation.
- [x] Privacy disclosure version/acceptance state.

### M5.2 Add full supported migration evidence

Target files:

- `src/db/database.ts`
- migration tests and fixture databases under a test-fixture directory

Tasks:

- [x] Create a representative schema-v4 fixture with profile, targets, food logs, meals, weights, photos, pins, and caches where those tables exist.
- [x] Run the real sequential migration path to the current schema.
- [x] Verify row IDs, dates, relationships, target history, origins, indexes, and `PRAGMA user_version`.
- [x] Test a fresh empty database.
- [x] Test legacy Marco-origin Health Connect data handling.
- [x] Test rejection of a future/newer database version without modifying it.
- [x] Keep fixture contents synthetic and free of personal data.

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

- [x] Automated release checks pass from a clean checkout.
- [ ] Full supported migration and restore evidence exists.
- [ ] The device matrix has no open P0/P1 issue.
- [x] The release-candidate commit has no unrelated diff.

## 12. Milestone M6: Worker and provider production operations

### M6.1 Confirm production secrets and limits

- [x] Keep `USDA_API_KEY`, `GEMINI_API_KEY`, and `RATE_LIMIT_SALT` as Worker secrets.
- [ ] Rotate any key that appeared in an older client build or local log.
- [ ] Confirm production and preview EAS environments contain only the public Worker URL.
- [ ] Confirm install, IP, and emergency limits in deployed Worker bindings.
- [ ] Set Gemini project quota and budget alerts.
- [ ] Set Cloudflare usage/error notifications supported by the account plan.
- [ ] Record who can rotate keys and deploy or roll back the Worker.

### M6.2 Verify privacy-preserving observability

- [x] Keep request bodies, queries, prompts, responses, raw IDs, ID hashes, headers, and secrets out of logs.
- [x] Verify sampled logs contain route, status, latency, upstream category, cache outcome, and rejection category only.
- [ ] Inspect a release smoke-test log sample by hand.
- [ ] Use Play Android Vitals, TestFlight/App Store crash reports, Worker metrics, and the support inbox for v1 monitoring.
- [x] Do not add a third-party app telemetry SDK before v1 unless the owner accepts its privacy and dependency cost.

### M6.3 Run production smoke tests

Run after every Worker deployment and before store review:

- [x] `GET /healthz`.
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

- [x] Title within current Play limit.
- [x] Short description.
- [x] Full description.
- [x] Release notes.
- [x] App category: Health & Fitness unless Console guidance changes.
- [ ] Support email and privacy URL.

Apple fields:

- [x] Title within 30 characters. Keep Eatlog first.
- [x] Subtitle within 30 characters.
- [x] Keywords within 100 characters without unsupported competitor claims.
- [x] Description within 4,000 characters.
- [x] Promotional text if useful.
- [x] Release notes.
- [x] Primary category: Health & Fitness. Consider Food & Drink as secondary if available and accurate.
- [ ] Privacy, support, and optional marketing URLs.

### M7.3 Produce store artwork from the canonical brand

- [x] Derive every raster from the canonical 1024 by 1024 flat-white egg mask.
- [x] Export Play high-resolution icon and feature graphic using current Console dimensions.
- [x] Use the existing adaptive and monochrome Android assets.
- [x] Export an opaque 1024 by 1024 App Store icon.
- [x] Do not add promotional badges, ratings, awards, or claims.

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

- [x] Explain Health Connect weight read/write use.
- [x] Provide steps for camera, gallery, backup, and reset.
- [ ] Keep production Worker online during review.

Apple review notes:

- [x] State that Eatlog is a paid upfront download with no login, subscription, in-app purchase, or extra paid feature.
- [x] Explain that Scan and Describe send user-selected content to Gemini through the Eatlog Worker.
- [x] Explain that all saved logs remain on device unless the user exports a file.
- [x] Give a short path through onboarding, manual entry, scan, backup, and reset.
- [x] State that iOS v1 does not expose Health Connect or HealthKit.
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

### Phase 2 / M3 account-free evidence: 2026-08-10

- Changed configuration and dependency files: `app.json`, `app.config.js`, `eas.json`, `package.json`, `package-lock.json`, `plugins/withEatlogHealthConnect.js`, `plugins/withEatlogHealthConnect.test.js`, and regenerated `release/legal/THIRD_PARTY_SOFTWARE.md` with 728 current production package/version records.
- Changed release source: `release/config/NATIVE_CONFIGURATION.md`, `release/dependencies/DEPENDENCY_AUDIT.md`, `release/runbooks/OTA_POLICY.md`, and this plan.
- Clean-install result: root and Worker `env TMPDIR=/tmp npm ci` passed from temporary local clones without environment files or generated native projects. The updated root graph installed 780 packages; the Worker installed 40 packages. Tests, typecheck, and notices check also passed in the reconstructed clean root at `/tmp/eatlog-m3-new.KneF7R/repo`.
- Dependency result: root `npm audit --omit=dev` reports 12 high, 13 moderate, and zero critical findings after non-forced lockfile updates; Worker `npm audit --omit=dev` reports zero vulnerabilities. `brace-expansion`, `fast-uri`, `js-yaml`, `nanoid`, and `undici` were fixed within existing transitive ranges. The remaining `image-size` and `postcss` advisory paths are repository-input build tooling and are **ENVIRONMENT LIMITATION / blocked on upstream** for Expo SDK 54; npm proposes only a forced Expo 57 upgrade. Classification and reachability are in `release/dependencies/DEPENDENCY_AUDIT.md`.
- Health Connect decision: maintained `react-native-health-connect@3.5.3` remains. Its bundled Expo plugin did not prove equivalent because it lacks permission-delegate setup and the Android 14 permission-usage alias. The obsolete `expo-health-connect@0.1.0` dependency was removed after the project-owned plugin produced a byte-identical generated manifest and explicit `MainActivity` delegate registration. Only Weight read/write permissions remain.
- Native artifacts: baseline manifest `/tmp/eatlog-m3-clean.66IzGr/repo/android/app/src/main/AndroidManifest.xml`; replacement manifest `/tmp/eatlog-m3-new.KneF7R/generated-android/app/src/main/AndroidManifest.xml`; generated Kotlin activity beside the replacement manifest; iOS plist `/tmp/eatlog-m3-new.KneF7R/generated-ios/Eatlog/Info.plist`. `diff -u` on the manifests exited 0. The iOS plist contains camera/photo purpose strings and `ITSAppUsesNonExemptEncryption=false`, with no microphone string; the Xcode project uses bundle `com.sgaret.eatlog`, device family 1, and deployment target 15.1.
- Icon evidence: `assets/icon.png` is 1024 by 1024 and every decoded alpha byte is 255. Original-resolution visual inspection confirmed the canonical flat-white egg mask on the dark Eatlog background.
- Configuration result: production and `APP_VARIANT=development` Expo configs evaluate to `com.sgaret.eatlog` and `com.sgaret.eatlog.dev` on both platforms while keeping the installed name `Eatlog`. Production keeps owner/project/update/runtime settings, API 36 compile/target, API 26 minimum, iPhone-only support, and the candidate Apple identifier.
- Commands and results: `npm test` passed 5 plugin tests plus 188 existing tests; `npm run typecheck` passed; `npm run notices:check` passed; `npx expo install --check` passed using Expo's local SDK 54 map while networking was unavailable; final `npx expo-doctor` passed 18/18. Doctor initially reported the stale app-config heuristic, then passed after `app.config.js` adopted Expo's supported `({ config }) => ({ ...config })` merge; no warning was suppressed.
- Local preparation result: Android and iOS `npx expo prebuild --platform <platform> --no-install` passed in `/tmp`. Current EAS CLI configuration evaluation passed for both production platforms. Local archive inspection produced `/tmp/eatlog-m3-archive-android` and `/tmp/eatlog-m3-archive-ios`; both contain the owned plugin and exclude dependency folders, environment files, generated native folders, build output, and credential file types. No `eas build`, cloud build, signing, upload, update publish, or submission occurred. A later local pre-build inspection was interrupted and is not used as evidence.
- OTA decision: `runtimeVersion.policy: "appVersion"` remains. `release/runbooks/OTA_POLICY.md` defines native/database/privacy exclusions, verification evidence, halt conditions, and interactive rollback. No update was published.
- Remaining M3 blockers: **STORE ACCOUNT** Apple must reserve `com.sgaret.eatlog`, App Store Connect must supply an app ID, and Google production submission stays unset until closed testing; **CREDENTIAL** signing and store-submit credentials remain absent; **STORE ACCOUNT / CREDENTIAL** preview rollback practice requires an authorized EAS update record; **PHYSICAL DEVICE** Health Connect and iOS permission flows remain unverified; **ENVIRONMENT LIMITATION** Linux cannot run Xcode/CocoaPods aggregation or inspect a signed iOS archive; **PAID SERVICE** no cloud build or submission was run. These blockers do not invalidate the completed source/configuration M3 exit gate, but they remain release gates.

### Phase 3 / M4 account-free evidence: 2026-08-10

- Changed identity/request source: `src/services/installIdentity.ts`, `src/services/foodScan.ts`, `src/services/foodSearchRemote.ts`, their tests, the synthetic evaluation client, `expo-crypto` dependency records, and generated third-party notices. The service creates 16 secure random bytes as 32 lowercase hexadecimal characters, persists them in an app-private document file outside SQLite, shares concurrent initialization, retries after storage failure, and never returns internal causes or logs the token.
- Changed platform source: `src/services/platformFeatures.ts`, Health Connect service/navigation/Profile/privacy/reset guards, restored-sync-state cleanup and tests, the shared iOS date picker, and platform-neutral backup/export sharing errors. Android remains on its existing Health Connect and calendar paths. iOS does not load the Health Connect native bridge, schedule foreground sync, register the route, show the Profile row, or show Health Connect privacy/reset/export wording.
- Backup decision: current backups stage only `database.sqlite`, `manifest.json`, and referenced meal photos. Version-2 manifests now reject any file metadata outside that exact allowlist; the installation-identity filename is an explicit rejection test. Restore still clears device-specific Health Connect state and export ledger while preserving all weight rows, including Android-imported rows.
- Worker contract: the existing 16-to-64 hexadecimal validator accepts the 32-character token. Rate-limit storage receives a salted SHA-256 digest, never the raw token. The Worker redaction test excludes the raw token, digest, headers, request inputs, provider bodies, and secrets.
- Commands and results: focused identity/request tests passed 18/18; `env TMPDIR=/tmp npm test` passed 203/203; `npm run typecheck` passed after both code batches; Worker `npm test` passed 17/17; `npm run notices:check` passed; `git diff --check` passed. The first focused test attempt hit an **ENVIRONMENT LIMITATION** because sandboxed `tsx` could not create `/tmp/tsx-1000/15.pipe`; the approved local rerun passed and no network or paid service was used.
- Artifact: `release/qa/IOS_SOURCE_AUDIT.md` maps each iOS-native surface to inspected source and the exact remaining physical check. Earlier branch artifacts already prove evaluated bundle IDs, iPhone-only configuration, camera/photo usage strings, absent microphone usage, and encryption configuration.
- UX decision: the first-use Scan/Describe disclosure remains the only transmission gate. It is not repeated after acceptance, and no helper paragraph was added to the FAB, camera, gallery, Describe, search, review, or logging paths.
- Remaining M4 blockers: **PHYSICAL DEVICE** Android/iPhone permission, camera, picker, Files, sharing, interruption, layout, accessibility, cross-platform archive, and remote-service checks; **ENVIRONMENT LIMITATION** no Xcode, iOS Simulator, CocoaPods native aggregation, or signed-binary inspection; **CREDENTIAL / STORE ACCOUNT** no distribution certificate, provisioning profile, App Store record, or TestFlight build; **PAID SERVICE** no EAS cloud build or simulator was used. The final clean local iOS JavaScript export passed in Phase 7. M4 signed-build exit criteria remain unchecked.

### Phase 4 / M5 account-free evidence: 2026-08-10

- Changed migration source: the SQL formerly embedded in `src/db/database.ts` now runs through `src/db/databaseMigrations.ts` for both production and Node fixtures. `src/db/testFixtures/schemaV4.ts` deterministically creates a synthetic v4 database containing every table supported at v4, including profile, target history, adaptive review relationship, Unicode meal/food names, photo reference, standalone and meal-linked food rows, weights, cache, and pin.
- Migration result: the real v4→v5→v6→v7→v8→v9 path preserves IDs, dates, target/review foreign keys, meal/food relationships, photo URI, weights, caches, and pins; creates the expected indexes and Health Connect/intake tables; maps pre-Health-Connect weights to `eatlog`; passes `foreign_key_check`; and finishes at `PRAGMA user_version = 9`. The same runner creates a complete empty v9 database from v0. Existing Marco-origin and v8 food-type migration rollback tests remain intact. A v10 sentinel database is rejected before journal-mode or schema mutation.
- Changed recovery source: `src/services/dataBackup.ts`, `src/utils/backupManifest.ts`, `src/services/backupDatabaseValidation.ts`, `src/services/backupCancellation.ts`, and `src/services/restoreTransaction.ts`. Production restore now validates exact extracted file allowlists, compressed/expanded size boundaries, manifest/database counts, hashes, integrity, foreign keys, schema version, and photo relationships. Safety-copy failure no longer attempts rollback from an incomplete safety database.
- Recovery tests: current v2 Eatlog and legacy v1 Marco structures; no-photo and two-photo Unicode layouts; supported v4 validation followed by real migration; wrong/CSV/export extensions; zero/oversized archives; unsafe, duplicate, missing, and unexpected paths; missing/invalid manifest/database metadata; size/hash/count/version/integrity/foreign-key/photo mismatches; cancellation checkpoints; installation-identity exclusion; and platform-neutral Android→Android, Android→iOS, iOS→iOS, and iOS→Android format/database acceptance. A forced failure after live replacement restores synthetic database and photo state; a forced rollback failure returns an `AggregateError` and cannot produce a success result.
- Commands and results: focused sequential migration tests passed 6/6; focused migration/recovery tests passed 20/20; final `env TMPDIR=/tmp npm test` passed 5 config-plugin tests plus 219 TypeScript tests; `npm run typecheck` passed; `git diff --check` passed. All fixtures contain only labeled synthetic values.
- QA artifacts: `release/qa/UI_SMOKE_SCRIPT.md` gives exact onboarding, manual logging, Today, Diary edit/delete/undo, weight, Analytics, Profile, privacy, export, restore, and reset steps with a synthetic seed and expected results. `release/qa/DEVICE_MATRIX.md` covers API 26, API 36/current Google Android, Samsung-class Android, constrained/small Android, minimum/current iOS, small/large iPhones, provider failures, accessibility, backup corruption, rollback, and release halt severity.
- Automation decision: there is no existing UI harness, runnable emulator, or simulator in this environment. No unverified heavyweight framework was added. The UI automation and device boxes remain unchecked until a real binary runs the script with screenshots and a signed result record.
- Remaining M5 blockers: **PHYSICAL DEVICE** native ZIP creation/extraction, duplicate raw ZIP-entry behavior, Files/share cancellation, real photo rollback, all four cross-device archive transfers, UI/accessibility smoke, and the complete device matrix; **ENVIRONMENT LIMITATION** no Android emulator/ADB daemon or iOS Simulator/Xcode; **CREDENTIAL** Play-equivalent and TestFlight signed candidates are unavailable; **PAID SERVICE / STORE ACCOUNT** no distribution build was requested. M5 device and exit criteria remain unchecked, and no cross-device success is claimed.

### Phase 5 / M6 account-free evidence: 2026-08-10

- Changed Worker source and tests: `worker/src/index.ts`, `worker/test/index.test.ts`, `worker/wrangler.jsonc`, `worker/package.json`, `worker/scripts/smoke.mjs`, and `worker/README.md`. Blank-only secret values now fail closed. Installation-token tests cover missing, short, long, non-hex, 16/64-character acceptance, deterministic salted SHA-256 hashing, and salt separation. Synthetic tests cover valid Scan without a provider call, missing/oversized/malformed inputs, routes/methods, upstream shape/content/status/timeout failures, rate limiting with `Retry-After`, and dependency-free health execution.
- Logging result: Worker console JSON is restricted to exactly `route`, `status`, `latencyMs`, `upstream`, `cache`, and `rejection`. Tests prove it excludes request/response bodies, queries, prompts, provider bodies, raw tokens, salted hashes, IPs, headers, secrets, request IDs, and methods. Production sampled-log inspection remains credential-bound and unchecked.
- Configuration result: current Wrangler syntax declares the three required secret names without values, sampled custom logs with automatic invocation logs disabled, and six rate-limit bindings. Invocation logs were disabled because Cloudflare documents that they can contain request and response metadata outside Eatlog's allowlist. The dry-run enumerated install/IP/emergency limits for both USDA and Gemini and bundled 28.09 KiB / 7.44 KiB gzip without deploying.
- Operations artifacts: `release/runbooks/WORKER_RELEASE.md` defines candidate/version evidence, read-only and validation smoke modes, provider contract checks, exact log allowlist, owner-only deploy/rotation/rollback commands, rollback evidence, severity, and halt conditions. `release/OWNER_INPUTS.md` now records production binding, secret rotation, alert, Worker version, rollback target, EAS environment, and operations-owner requirements.
- Commands and results: `env TMPDIR=/tmp npm ci` passed with 40 packages; install scripts for `esbuild` and `workerd` were locally blocked but tests and bundling passed. `npm test` passed 18/18; `npm run typecheck` passed; `env XDG_CONFIG_HOME=/tmp/eatlog-wrangler-config TMPDIR=/tmp npm run dry-run` passed; `npm audit --omit=dev` reported zero vulnerabilities. The first test run failed only because the test assumed zero-millisecond latency; the assertion was corrected to require finite nonnegative latency. The first dry-run bundle completed but its debug log targeted a read-only home path; the recorded rerun used the writable task-specific config path and passed.
- Read-only production check: the already configured public Worker `GET /healthz` returned HTTP 200 with the expected health contract after a sandbox DNS failure was retried with approved network access. No validation traffic, USDA request, Gemini Describe/Scan, rate-limit exercise, deployment, secret change, quota change, or alert change occurred.
- Current official references checked: Cloudflare Wrangler dry-run/deployment/rollback, required-secret, observability, and rate-limit binding documentation; the Gemini models/generateContent API; and USDA FoodData Central search/detail, key, rate-limit, and licensing guidance.
- Remaining M6 blockers: **CREDENTIAL** production secret/binding/EAS-environment inspection, sampled log review, key-rotation status, provider retention review, and named deploy/rollback access; **OWNER INPUT** release/support/incident owner; **PAID SERVICE / CREDENTIAL** Gemini Describe/Scan production smoke and quota/budget alerts; **CREDENTIAL** Cloudflare usage/error notifications; **STORE ACCOUNT** Play/App Store monitoring consoles and support inbox; **PAID SERVICE** preview deployment/rollback drill. M6 production exit criteria remain unchecked.

### Phase 6 / M7 account-free evidence: 2026-08-10

- Changed metadata and review source: `release/store/metadata.mjs`, `release/store/STORE_FORM_WORKSHEET.md`, `release/store/REVIEW_MATERIAL.md`, `release/store/SCREENSHOT_PLAN.md`, `release/OWNER_INPUTS.md`, `scripts/validate-store-metadata.mjs`, `package.json`, and this plan. One versioned source now supplies both stores' copy, categories, reviewer notes, commercial facts, provider behavior, and alt text without fabricated contacts or URLs.
- Copy result: current official Google limits were checked at 30 characters for title, 80 for short description, 4,000 for full description, and 500 for release notes. Current Apple limits were checked at 30 for name, 30 for subtitle, 100 UTF-8 bytes for keywords, 4,000 for description and version notes, 170 for promotional text, and 4,000 bytes for review notes. Final counts are Google 6/77/1,756/255 and Apple 6/19/68 bytes/1,618/92/233, with 867-byte review notes.
- Claim decision: store copy preserves Eatlog, PHP 299 upfront Philippines pricing, no subscription/IAP/login/account/cloud database, separate platform purchases, local-first storage, adult general-wellness scope, editable estimates, and the network requirements for Scan, Describe, USDA, and explicit Open Food Facts full search. It contains Google's required non-medical sentence, no unsupported accuracy/outcome/social-proof/endorsement/offline claim, and no Apple Health or HealthKit claim in iOS public copy.
- Changed artwork source and tooling: `release/artwork/source/`, `release/artwork/export/`, `release/artwork/README.md`, `scripts/store-artwork-png.mjs`, `scripts/generate-store-artwork.mjs`, and `scripts/validate-store-artwork.mjs`. The generator hydrates the source SVGs from the canonical `assets/icon.png`; it does not redraw, recolor, trace, or generatively alter the egg mask.
- Artwork result: `google-play-icon-512.png` is 512×512 RGBA, fully opaque, and 10,055 bytes; `google-play-feature-graphic-1024x500.png` is 1024×500 RGB with no alpha and centered focal bounds `(343,18)–(681,481)`; `apple-app-store-icon-1024.png` is 1024×1024 RGB with no alpha and pixel-equivalent color content to the canonical icon. Original-resolution visual inspection confirmed the same white egg, scale marks, red indicator, and dark background with no badge, rating, award, price, text, or claim.
- Screenshot/reviewer decision: the shot list defines seven distinct Android and iPhone captures, exact current format/dimension guidance, synthetic seed data, alt text, safe-area/accessibility review, and a real-binary-only rule. No screenshot was generated, composited, platform-swapped, or claimed. Reviewer material covers onboarding, manual entry, the single first-use transmission gate, provider paths, Health Connect Weight-only use on Android, iOS platform exclusions, backup/export/restore/reset, and evidence recording.
- Commands and results: final `npm run store:metadata:check` passed; `npm run store:artwork:generate` passed; `npm run store:artwork:check` passed; all four new `.mjs` files passed `node --check`; `npm test` passed 5 config-plugin tests plus 219 TypeScript tests; `npm run typecheck` passed; and `git diff --check` passed. The first metadata validation caught its own false-positive diagnosis rule and the first artwork validation caught unresolved external SVG images; both implementation defects were fixed before the recorded passing reruns. The lean-ctx wrapper blocked `env TMPDIR=/tmp npm test`; the identical test command without the unnecessary environment prefix passed.
- UX decision: remote-processing details stay in store/reviewer/privacy material and the existing one-time affirmative gate. No recurring helper paragraph or disclosure was added to the FAB, Scan, Describe, review, or ordinary food-logging path.
- Remaining M7 blockers: **OWNER INPUT** public developer/legal name, support email and URLs, launch countries, preview-APK policy, reviewer contact/time zone, App Store SKU, copyright holder, and any EU trader decision; **STORE ACCOUNT** Play/App Store records, forms, agreements, paid-price evidence, country selection, payments/tax/banking, app signing, and uploads; **CREDENTIAL** signed release candidates and submission access; **PHYSICAL DEVICE / ENVIRONMENT LIMITATION** real Android/iPhone release screenshots and visual/device evidence; **PAID SERVICE** enrollment, final cloud builds, provider Scan capture if chosen, and submission. M7 account-free source is complete, but its record, screenshot, URL, and exit criteria remain unchecked.

### Phase 7 final account-free audit evidence: 2026-08-10

- Changed final-audit source: `app.json`, `App.tsx`, `package.json`, the owned Health Connect plugin and tests, `src/navigation/linking.ts`, `src/navigation/linking.test.ts`, `release/config/NATIVE_CONFIGURATION.md`, `.gitignore`, `release/FINAL_ACCOUNT_FREE_AUDIT.md`, `release/OWNER_RELEASE_CHECKLIST.md`, and this plan. The audit fixed unused Android overlay/write-storage requests and replaced the insufficient Health Connect MainActivity rationale target with a dedicated privacy-rationale activity. The ImagePicker microphone-removal directive, legacy photo read path, haptics, Weight-only Health Connect access, and ordinary food-logging UI remain unchanged.
- Health Connect result: current Android guidance requires a dedicated activity for the permissions-screen privacy link. `PermissionsRationaleActivity` handles Android 13's rationale action, Android 14+'s usage alias targets it, and its explicit intent opens only `eatlog://privacy`. React Navigation maps that URI to Tabs > Profile > Privacy. Focused plugin tests passed 7/7, the navigation-map test passed, and clean prebuild generated the expected manifest and Java source. **PHYSICAL DEVICE** proof of the system tap remains open.
- Final clean root: local clone `/tmp/eatlog-final-audit3.5APtLe/repo` at `ba1cecc29d23b6c6a6dda8532e0a50249803302e` contained no environment file or copied/generated dependency/native output. `env TMPDIR=/tmp npm ci` passed with 781 packages; the exact `env TMPDIR=/tmp npm test` gate passed 7 config-plugin plus 220 TypeScript tests; typecheck, notices, store metadata/artwork validators, current Expo dependency validation, and Expo Doctor 18/18 passed. The filesystem sandbox initially blocked the `tsx` IPC socket; the approved local rerun passed. Read-only network access supplied current Expo and npm advisory metadata.
- Export artifacts: clean Android export `/tmp/eatlog-final-audit3.5APtLe/export-android` passed once with 1,755 modules and a 5.48 MB Hermes bundle; clean iOS export `/tmp/eatlog-final-audit3.5APtLe/export-ios` passed once with 1,744 modules and a 5.45 MB bundle. A value-suppressing scan found no provider-secret name, private-key marker, or recognized Google, AWS, or GitHub credential shape in either artifact.
- Dependency result: root `npm audit --omit=dev` completed with 12 high, 13 moderate, and zero critical findings, unchanged from the documented Expo/Metro build-only upstream constraint; npm still proposes only a forced Expo 57 upgrade. Worker audit reports zero. No forced audit fix or broad upgrade occurred.
- Native result: Android and iOS prebuilds at `/tmp/eatlog-final-audit3.5APtLe/repo` passed without native installation. Android evaluates API 26/36 and generates removal directives for `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, and `WRITE_EXTERNAL_STORAGE`; retains `INTERNET`, photo-library legacy read access, `VIBRATE`, and Health Connect Weight read/write; registers the permission delegate; and contains the dedicated rationale activity and Android 14 alias. The iOS plist contains the correct camera/photo strings, no microphone string, non-exempt encryption false, and dark style. Eight dependency privacy manifests plus the plist passed XML validation; CocoaPods/Xcode aggregation remains unavailable.
- Worker result: clean 40-package install, 18/18 synthetic tests, typecheck, and Wrangler dry-run passed. The dry-run bundled 28.09 KiB / 7.44 KiB gzip and enumerated six rate-limit bindings without deployment. The configured public health endpoint had already returned HTTP 200 in M6 and was not called again. No provider request or production mutation occurred.
- Repository result: `git diff --check 622a0b2..ba1cecc` passed; the previous phase diffs and the final rationale diff were reviewed; tracked-file secret scanning found four synthetic Worker test assignments and no credential/environment/signing file or recognized credential shape; export scanning passed; and ignored-path checks cover dependencies, `dist/`, generated native folders, environment variants, Worker dev variables, signing files, keystores, and credential/service-account JSON. No matched value was printed. The complete command/evidence table is in `release/FINAL_ACCOUNT_FREE_AUDIT.md`.
- UI/device result: **ENVIRONMENT LIMITATION / PHYSICAL DEVICE** no runnable Android emulator/ADB daemon, Xcode, iOS Simulator, signed binary, or physical device was available. No screenshot, native system-flow result, cross-device restore, accessibility pass, or signed merged-manifest/privacy-manifest result is claimed. Exact manual evidence is in `release/qa/` and the real-binary-only shot plan remains in `release/store/SCREENSHOT_PLAN.md`.
- Final decision: M2 through M7 account-free source work is complete. M8 through M10 remain unchecked. The branch is ready for final device testing and paid-account setup, not for store submission or public release. The single ordered owner path is `release/OWNER_RELEASE_CHECKLIST.md`.
- Remaining release blockers: **OWNER INPUT** identity/contact/host/URLs/countries/reviewer/SKU/copyright/device/operations/budget values; **STORE ACCOUNT** enrollments, records, agreements, pricing, banking/tax, forms, tests, review, and rollout; **CREDENTIAL** signing/submission/two-factor and production-service console evidence; **PHYSICAL DEVICE** complete Android/iPhone/native recovery/accessibility/screenshot matrix; **PAID SERVICE** memberships, signed/cloud builds, approved provider use, hosting, submissions, and preview drills; **ENVIRONMENT LIMITATION** no local Android/iOS native runtime or Xcode aggregation. **IMPLEMENTATION DEFECT:** none remains open from the account-free automated/static audit.
