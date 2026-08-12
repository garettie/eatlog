# Eatlog owner release checklist

This is the ordered path from the completed account-free source state to store submission and rollout. Each box needs owner input, account access, a paid service, a signed binary, a public host, or a device. Android goes first. Do not create a free Google Play listing for `com.sgaret.eatlog`.

## 1. Supply the missing release identity

- [ ] **OWNER INPUT, before submission:** choose the public developer/legal name, monitored support email, support response expectation, rights-holder name, App Store SKU, reviewer contact name/phone/time zone, launch countries, and EU trader decision if any EU country is included.
- [ ] **OWNER INPUT, before public release:** decide who may receive direct preview APKs after launch and remove any public APK link before the paid Play release.
- [ ] **OWNER INPUT / PHYSICAL DEVICE, before final build:** identify the Android API 26, API 36/current Google, Samsung-class, small/large Android, minimum/current iOS, and small/large iPhone targets that will run the matrix.
- [ ] **OWNER INPUT / PAID SERVICE:** approve the budget for Google and Apple enrollment, signing/cloud builds, domain or static hosting, provider use, and any missing test hardware.

Use `release/OWNER_INPUTS.md` as the value-by-value record. Keep personal identity, banking, tax, credentials, and two-factor details outside git.

## 2. Start both account enrollments

- [ ] **STORE ACCOUNT:** confirm Google Play enrollment, account type, and creation date; complete identity/device verification and determine whether the 12-tester/14-day production-access rule applies.
- [ ] **STORE ACCOUNT / CREDENTIAL:** enroll in the Apple Developer Program, confirm App Store Connect access, record the Team ID outside git, and name the person who controls two-factor authentication.
- [ ] **STORE ACCOUNT:** accept current agreements. Complete the Google payments profile and Apple Paid Apps Agreement, banking, tax, legal-identity, and payout setup.
- [ ] **STORE ACCOUNT:** reserve Apple bundle ID `com.sgaret.eatlog`. Keep `com.sgaret.eatlog.dev` for development. Stop and return to source configuration if Apple rejects the candidate identifier.

Start these early, but keep Android submission and testing first.

## 3. Publish support and privacy pages

- [ ] **OWNER INPUT:** put the final legal name, support email, and response expectation into the version-controlled privacy/support page source.
- [ ] **OWNER INPUT / PAID SERVICE:** publish `release/site/privacy.md` and `release/site/support.md` as mobile-readable, public HTTPS pages under stable owner-controlled URLs. Verify both without login or geofencing.
- [ ] **OWNER INPUT:** submit Eatlog's read-only Open Food Facts use with the monitored contact if the provider's current registration process requires it.
- [ ] **CREDENTIAL:** configure production build values for `EXPO_PUBLIC_FOOD_WORKER_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_PRIVACY_URL`, and `EXPO_PUBLIC_SUPPORT_URL`. These are public values; never put Gemini, USDA, Cloudflare, signing, or store credentials in `EXPO_PUBLIC_*`.
- [ ] **PHYSICAL DEVICE:** verify the final Profile links open the published pages and Open Food Facts full search is available only when the real support email produces the required User-Agent.

## 4. Verify production services

- [ ] **CREDENTIAL:** follow `release/runbooks/WORKER_RELEASE.md` to record the Worker origin/version, previous healthy version, rollback target, deployed rate-limit bindings, EAS environments, key-rotation state, provider-retention review, and named deploy/rollback owner.
- [ ] **CREDENTIAL / PAID SERVICE:** configure Gemini quota/budget alerts and Cloudflare notifications supported by the account. Inspect a sampled log and confirm the six-field allowlist without copying payloads into git.
- [ ] **CREDENTIAL:** run health and approved synthetic validation/USDA/Describe smokes. Run a Gemini Scan only with explicit cost approval. Drill deployment and rollback on preview before relying on the production procedure.

Halt on a secret exposure, unsafe target, data loss, provider-contract mismatch, failed rollback, or unexplained log field.

## 5. Create the paid Google Play record

- [ ] **STORE ACCOUNT:** create an app, not a free app, with package `com.sgaret.eatlog`, the final language/countries, and Health & Fitness category.
- [ ] **STORE ACCOUNT:** set the Philippines price to exactly PHP 299 before any public-track publication. Confirm equivalents for owner-approved additional countries. Never publish this package as free; Google does not permit converting a previously free app to paid.
- [ ] **STORE ACCOUNT / CREDENTIAL:** enable Play App Signing, preserve the EAS upload key, and create submission access only after the record exists.
- [ ] **STORE ACCOUNT:** enter `release/store/metadata.mjs` copy and `release/store/STORE_FORM_WORKSHEET.md` answers. Submit Data Safety, Health Apps, Health Connect Weight-only justification, content rating, target audience, ads/account answers, privacy URL, and support email against the exact candidate.

## 6. Build and test Android

- [ ] **PAID SERVICE / CREDENTIAL:** run the full clean release gate, then create one signed production AAB from the frozen commit with the production EAS profile. Record commit, version, version code, EAS build ID, checksum, signing custody, Worker version, and environment names without values.
- [ ] **CREDENTIAL:** inspect the signed AAB: API 36/current target, package, icon, Health Connect Weight read/write, legacy `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` capped at API 32, no Android 13 media-read permission, no microphone/overlay permission, and no bundled provider secret.
- [ ] **PHYSICAL DEVICE:** install the Play-equivalent binary and run `release/qa/UI_SMOKE_SCRIPT.md` plus every Android row in `release/qa/DEVICE_MATRIX.md`, including meal Save image/share, API 26 legacy-write permission behavior, API 33+ save with no media-read prompt, native backup/restore/rollback, and accessibility.
- [ ] **PHYSICAL DEVICE:** inspect saved Meal Photo, Framed, and Nutrition PNGs for exact 1080 by 1920 dimensions, upright orientation, intended crop, legible Onest text, and absence of source GPS, camera model, original filename, and capture timestamp metadata.
- [ ] **PHYSICAL DEVICE:** on Android 13 and Android 14+, tap the privacy-policy link from Health Connect's Eatlog permission screen. Confirm that Eatlog opens Profile > Privacy and that Back returns without exposing a logging sheet or losing app state.
- [ ] **PHYSICAL DEVICE:** capture the seven real Android shots in `release/store/SCREENSHOT_PLAN.md` from that binary with synthetic data. Do not generate, composite, redraw, or reuse iOS UI.
- [ ] **STORE ACCOUNT:** upload only validated artwork and real screenshots, keep the first release draft, review App Bundle Explorer/pre-launch results, and close every P0/P1.

## 7. Complete Google testing and submission

- [ ] **STORE ACCOUNT / PHYSICAL DEVICE:** run internal testing, then the required closed test. If the account is subject to the current personal-account rule, keep at least 12 testers opted in for 14 continuous days and retain the scenario/issue record.
- [ ] **STORE ACCOUNT:** apply for production access when required. Submit the exact tested paid candidate; do not rebuild or change copy/forms without repeating affected checks.
- [ ] **STORE ACCOUNT:** after approval, start at 10 percent and follow the M8 halt gates before 25, 50, and 100 percent. Keep preview APK access restricted.

## 8. Create the App Store record after Android fixes land

- [ ] **STORE ACCOUNT:** create the iPhone app record for reserved bundle ID `com.sgaret.eatlog`, the owner-supplied SKU, final primary language/countries, Health & Fitness primary category, and Food & Drink secondary category where accurate.
- [ ] **STORE ACCOUNT:** choose the Philippines price point that displays PHP 299. If no exact point exists, stop for explicit owner approval before choosing the closest value. Complete EU trader status if applicable.
- [ ] **STORE ACCOUNT / CREDENTIAL:** configure EAS-managed Apple credentials or an App Store Connect API key. Do not commit `.p8`, certificates, profiles, or credential JSON.
- [ ] **STORE ACCOUNT:** enter the Apple fields from `release/store/metadata.mjs` and the App Privacy, age-rating, export-compliance, content-rights, review-contact, privacy/support URL, and reviewer-note answers from the worksheets.

## 9. Build, test, and submit iOS

- [ ] **PAID SERVICE / CREDENTIAL:** build a signed candidate with Apple's current required Xcode/iOS SDK. Record commit, version/build, EAS build ID, processed App Store build, signing identity, and Worker version.
- [ ] **CREDENTIAL:** inspect the signed archive's Info.plist, merged privacy manifest, required-reason APIs, bundle ID, iPhone-only family, opaque icon, camera/photo strings, exact add-only purpose string `Allow Eatlog to save share images to your photo library.`, absent microphone string, and encryption answer.
- [ ] **PHYSICAL DEVICE:** run the complete minimum/current/small/large iPhone matrix from TestFlight, including camera, add-only Photos grant/denial/Settings recovery, card Save image/share and share cancellation, generated PNG dimensions/metadata, Files, cross-platform archives, rollback, accessibility, safe areas, keyboard, and interruption recovery. Confirm Share requests no Photos permission. Confirm no Health Connect, HealthKit, or Apple Health UI/code claim.
- [ ] **PHYSICAL DEVICE:** recapture the seven real iPhone shots from the signed candidate. Do not reuse Android screenshots.
- [ ] **STORE ACCOUNT:** finish internal and external TestFlight, close every P0/P1, select the tested build, and submit for App Review with manual release. After approval, use phased release and the same halt conditions as Android.

## 10. Close the release record

- [ ] **STORE ACCOUNT / CREDENTIAL:** record final commits/tags, store build and submission IDs, checksums, rollout dates, Worker version/rollback target, policy/form dates, device evidence, screenshots, known accepted issues, and support/incident owners.
- [ ] **CREDENTIAL:** tag only after both store binaries are fixed. Meal sharing adds `expo-media-library`, `react-native-view-shot`, and native permission configuration, so it requires new Android and iOS binaries and must not be sent by OTA to an older installed runtime. Follow `release/runbooks/OTA_POLICY.md` for compatible JavaScript/assets only.
- [ ] **STORE ACCOUNT / CREDENTIAL / OWNER INPUT:** monitor store vitals/review messages, support, Worker errors/latency/rate limits, provider quotas/cost, backup/restore reports, and nutrition-safety reports through both staged releases.
