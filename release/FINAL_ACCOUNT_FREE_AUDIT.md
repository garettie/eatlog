# Eatlog final account-free release audit

Audit date: 2026-08-14

Branch: `main`

Audited source/config base: `51836cb` (working tree; no implementation commit was created)

Current pass: remote-estimate consent and release-contract reconciliation

## Result

All locally executable, account-free source work in M2 through M7 is implemented and has automated or static evidence. The branch is ready for final signed-binary and physical-device testing and for paid-account setup. It is not ready for store submission or public release: signed AAB/IPA evidence, final merged native artifacts, device runs, real screenshots, production-service checks, public URLs, owner identity/contact values, and store-console records remain unavailable.

No EAS cloud build, EAS Submit, EAS Update publish, remote simulator, store upload, Worker deployment, secret rotation, quota/alert change, paid Gemini Scan, or other cost-bearing provider call ran during this audit.

## Current consent/release-contract pass

The current implementation is audited against source base `51836cb` plus the working-tree changes. It adds versioned app-private Gemini consent, a shared full-screen onboarding/on-demand flow, Profile → Privacy withdrawal, reset clearing, and a pre-token/pre-fetch client guard. Persisted Okay consent is reused without repeated prompts unless the user withdraws it; Not now completes onboarding and leaves local logging, food search, weight, Analytics, backup, export, sharing, and reset usable.

Current automated evidence: `env TMPDIR=/tmp npm test` passed 246/246, `npm run typecheck` passed, `npm run store:metadata:check` passed, `npm run notices:check` passed, `npm run store:artwork:check` passed, and `git diff --check` passed. `npx expo install --check` passed, `npx expo-doctor` passed 18/18, `npx expo config --type public` passed, Android and iOS development exports passed (1,884 and 1,871 modules), and Android/iOS `npx expo prebuild --no-install` passed; generated native directories were removed after inspection. The Worker gate passed 20/20 tests, typecheck, Wrangler dry-run (34.01 KiB / 9.24 KiB gzip), and `npm audit --omit=dev` reported zero vulnerabilities. `npm run fallow:dead-code` still fails on the known baseline of 10 unused exports and 2 unused types, with no new findings. The current focused consent/storage/coordinator/food-estimate tests are included in the 246 total. The dated sections below are historical records and do not supersede this current working-tree audit.

## Clean-checkout root evidence

The final root checks ran in `/tmp/eatlog-final-audit3.5APtLe/repo`, cloned locally without environment files, copied dependencies, native folders, or build output.

| Check | Result |
| --- | --- |
| `env TMPDIR=/tmp npm ci` | Pass: 781 packages from the lockfile. The local install-scripts policy blocked `esbuild@0.28.1` postinstall; tests, typecheck, exports, prebuild, and Doctor still passed. |
| `env TMPDIR=/tmp npm test` | Pass outside the filesystem sandbox: 7 config-plugin tests and 220 TypeScript tests, 0 failures. The initial sandboxed attempt could not create the `tsx` IPC socket and is an environment limitation, not a test failure. |
| `npm run typecheck` | Pass. |
| `npx expo install --check` | Pass against current Expo metadata: dependencies are up to date. |
| `npx expo-doctor` | Pass: 18/18 checks. |
| `npm run notices:check` | Pass: production dependency/font notices reproduce exactly. |
| `npm run store:metadata:check` | Pass: Google and Apple copy limits, fixed commercial facts, disclaimer, network claims, and unsupported-claim checks. |
| `npm run store:artwork:check` | Pass: canonical pixels, dimensions, color types, transparency, byte limit, padding, and feature-graphic focal bounds. |
| `npx expo config --type public` | Pass: Eatlog 1.1.0; Android `com.sgaret.eatlog`; iOS candidate `com.sgaret.eatlog`; iPhone only; app-version runtime policy; Weight-only configured health permissions; unused Android template permissions blocked. |
| `npm audit --omit=dev` | Completed with 12 high, 13 moderate, and 0 critical findings. `release/dependencies/DEPENDENCY_AUDIT.md` classifies the high findings as Expo/Metro repository-input build tooling blocked on an upstream SDK-compatible fix; npm offers only a forced Expo 57 upgrade. No forced fix ran. |

### Local JavaScript exports

- Android: pass, 1,755 modules, 5.48 MB Hermes bundle, artifact `/tmp/eatlog-final-audit3.5APtLe/export-android`.
- iOS: pass, 1,744 modules, 5.45 MB Hermes bundle, artifact `/tmp/eatlog-final-audit3.5APtLe/export-ios`.
- A value-suppressing signature scan found no provider-secret name, private-key marker, or recognized Google, AWS, or GitHub credential shape in either export.

These exports ran once per platform from clean source/config commit `ba1cecc`. No EAS build or remote simulator ran.

## Native configuration evidence

### Android

Final clean prebuild command: `env TMPDIR=/tmp npx expo prebuild --platform android --no-install`.

Artifact root: `/tmp/eatlog-final-audit3.5APtLe/repo/android`.

- `android.minSdkVersion=26`, `android.compileSdkVersion=36`, and `android.targetSdkVersion=36`.
- Generated app manifest keeps `INTERNET`, photo-library legacy read access, `VIBRATE`, and Health Connect `READ_WEIGHT`/`WRITE_WEIGHT`.
- `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, and `WRITE_EXTERNAL_STORAGE` are `tools:node="remove"` merger directives, not requested permissions.
- Android 13 `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` targets a dedicated `PermissionsRationaleActivity`. Android 14+ `ViewPermissionUsageActivity` targets the same activity, and `HealthConnectPermissionDelegate` registration remains present.
- The generated activity sends an explicit `eatlog://privacy` intent to `MainActivity`; React Navigation maps that URI to Tabs > Profile > Privacy. Plugin and navigation tests lock the manifest target and route.
- Regression tests also lock the blocked-permission list, Weight-only configured health list, and ImagePicker `microphonePermission: false`.

The final signed AAB's merged manifest, runtime permission prompts, Health Connect system privacy-link launch, and Play permission declaration remain **CREDENTIAL / PHYSICAL DEVICE / STORE ACCOUNT** gates.

### iOS

Clean prebuild command: `env TMPDIR=/tmp npx expo prebuild --platform ios --no-install`.

Artifact: `/tmp/eatlog-final-audit3.5APtLe/repo/ios/Eatlog/Info.plist`.

- Display name is Eatlog, version is 1.1.0, the Xcode product bundle identifier resolves from the configured `com.sgaret.eatlog` candidate, and the build is iPhone-only in evaluated configuration.
- Camera and photo-library purpose strings name meal scanning; no microphone purpose string exists.
- `ITSAppUsesNonExemptEncryption=false`, `NSAllowsArbitraryLoads=false`, and dark interface style are present.
- Eight dependency privacy manifests were found in Expo File System, Expo Constants, Expo Application, and React Native/Folly/glog/boost sources. They declare no tracking or collected data and list File Timestamp, Disk Space, User Defaults, and System Boot Time required-reason categories. `xmllint --noout` passed for the Info.plist and all eight manifests.

Linux prebuild cannot run CocoaPods/Xcode aggregation, inspect an archive, or prove the signed binary's merged privacy manifest and required-reason API report. Those remain **ENVIRONMENT LIMITATION / CREDENTIAL / STORE ACCOUNT** gates.

## Worker evidence

The Worker checks ran from `/tmp/eatlog-final-audit3.5APtLe/repo/worker` with no `.dev.vars` or secret values.

| Check | Result |
| --- | --- |
| `env TMPDIR=/tmp npm ci` | Pass: 40 packages. Local install-script policy blocked `esbuild`/`workerd` postinstalls; execution and bundling still passed. |
| `npm test` | Pass: 18/18 synthetic tests. |
| `npm run typecheck` | Pass. |
| `npm run dry-run` | Pass: Wrangler 4.120.0, 28.09 KiB / 7.44 KiB gzip, six declared rate-limit bindings, no deployment. |
| `npm audit --omit=dev` | Pass: 0 vulnerabilities. |

The previously configured public `GET /healthz` returned HTTP 200 during M6. It was not called again. No validation, USDA, Describe, Scan, rate-limit, deploy, rollback, secret, binding, quota, or alert mutation ran against production.

## Repository hygiene

- `git diff --check 622a0b2..ba1cecc` passed. The prior phase diffs and the final Health Connect rationale diff were reviewed against the plan scope; no unrelated source change was found.
- A tracked-file secret-signature scan reported four synthetic Worker test assignments. No private-key marker, recognized Google/AWS/GitHub credential shape, tracked environment file, signing file, credential JSON, or real secret candidate was found. The scan printed classifications and counts, not matched values.
- `.gitignore` covers dependency/build output, `dist/`, generated `android/` and `ios/`, local Expo state, `.env` variants, Worker development variables, `.p8`/`.p12`/PEM/key/mobile-provision/JKS/keystore files, and service-account/credential JSON.
- Clean clone status was clean before dependency/native generation. After checks, generated native directories and dependency trees remained ignored. No generated native folder or export artifact was staged.
- Nine implementation commits precede this audit record and separate scope, privacy, configuration, cross-platform identity, recovery, Worker operations, store materials, permission cleanup, and the Health Connect rationale correction. Nothing was pushed, tagged, submitted, deployed, or uploaded.

## Account-free milestone status

| Milestone | Account-free result | External release gate |
| --- | --- | --- |
| M0 | Scope, product decisions, branch, and one owner-input register complete | Owner values, account enrollment, bundle reservation, agreements, payments, and device inventory |
| M1 | Complete before this task; safety policy and tests unchanged and passing | Final binary/device/store-policy review |
| M2 | Data inventory, policy/support source, one-time in-app disclosure, provider compliance, permission source, Health Connect privacy-rationale route, attributions, and form worksheets complete | Published HTTPS pages, owner identity/contact, provider-console review, signed permission/privacy evidence, Health Connect system-flow proof, store form submission, devices |
| M3 | Clean dependency/config baseline, owned Health Connect plugin, iOS config, EAS profiles, audits, and OTA policy complete | Signing, store IDs, credentials, and authorized preview OTA drill |
| M4 | Installation identity and iOS platform guards complete in source/tests | Signed iPhone/Android provider and native-system flows on devices |
| M5 | Sequential v4-current migration, corruption/rollback recovery tests, format-level cross-platform checks, and exact QA scripts complete | Native archive/cross-device/UI/accessibility matrix on real candidates |
| M6 | Worker tests, redacted logs, smoke tooling, dry-run, and release/rollback runbook complete | Production binding/secrets/log/alerts/provider smoke/rollback evidence and named owner |
| M7 | Canonical copy, worksheets, reviewer material, artwork, validators, and screenshot/seed plan complete | Store records, final URLs/contact, real screenshots, forms, pricing, and uploads |

M8 through M10 remain unchecked because no store release action occurred.

## Exact remaining blockers

- **OWNER INPUT:** public developer/legal and rights-holder names; monitored support email and response expectation; privacy/support host and URLs; launch countries and EU trader choice; preview-APK policy; App Store SKU; reviewer contact/phone/time zone; device inventory; support/release/incident owner; budget approval.
- **STORE ACCOUNT:** Play enrollment/account history, paid app/payments record, app signing, testing/access, forms, pricing, countries, pre-launch report, submission, and rollout; Apple membership, bundle reservation, app record, Paid Apps Agreement, banking/tax, pricing/countries, DSA status, TestFlight, review, submission, and phased release.
- **CREDENTIAL:** store submission/signing access and two-factor owner; distribution certificate/provisioning profile; production EAS environment inspection; Worker secrets/bindings/version/rollback; provider retention/log review; secret rotation state; alerts and console access.
- **PHYSICAL DEVICE:** complete Android/iPhone matrix; camera/gallery/Files/share/keyboard/safe-area/accessibility/interruption checks; Health Connect runtime behavior; native backup/restore/rollback; all four cross-device archive transfers; real Android/iPhone screenshots.
- **PAID SERVICE:** enrollments, final signed/cloud builds and submissions, approved Gemini Scan/provider use, domain hosting where paid, test hardware, and preview Worker/OTA drills.
- **ENVIRONMENT LIMITATION:** no usable Android emulator/ADB daemon, Xcode, iOS Simulator, CocoaPods aggregation, signed release archive, or store-installed binary was available locally.
- **IMPLEMENTATION DEFECT:** none remains open from the account-free automated/static audit. Device, signing, provider-console, or store review may still expose defects; the release halt rules apply.

The ordered owner path is `release/OWNER_RELEASE_CHECKLIST.md`.
