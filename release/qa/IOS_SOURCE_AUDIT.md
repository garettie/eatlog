# iOS source-readiness audit

Date: 2026-08-10

This is source and local-test evidence, not device evidence. No EAS build, cloud simulator, signing, upload, or paid action was used.

## Completed source work

| Surface | Account-free evidence | Remaining check |
| --- | --- | --- |
| Worker identity | Scan, Describe, USDA search, and USDA detail await the same app-scoped 32-character lowercase hexadecimal token. The token is stored outside SQLite and the backup allowlist. | Exercise the header from Android and iOS release binaries. **PHYSICAL DEVICE / CREDENTIAL** |
| Health Connect | Navigation, foreground sync, privacy copy, reset copy, and the native-module loader are Android-gated. Restoring a backup clears device-specific sync state while preserving weight history. | Verify Android remains unchanged and iOS shows no dead route. **PHYSICAL DEVICE** |
| Camera | Permission is requested only after the user selects Scan and after the shared estimate-consent screen returns Okay. A declined consent returns to the prior entry state without opening camera; denial, cancellation, launch failure, unreadable image, and retry states are explicit. Accepted consent is persisted and does not prompt again unless the user withdraws it. | Grant/deny/retry and resume testing. **PHYSICAL DEVICE** |
| Photo picker | Selection starts only after Gallery is selected; cancellation returns to the prior entry state and performs no upload. Meal-photo editing asks for library access at the tap point. | Limited-library, large-image, and background/resume behavior. **PHYSICAL DEVICE** |
| Image preparation and request | Image preparation stays local until the current consent gate passes. Worker estimation has a 22-second abort timeout and sanitized failures; the client checks consent before installation-token loading and `fetch`. | Memory-pressure and slow-network behavior. **PHYSICAL DEVICE** |
| Date input | Android retains its calendar dialog. iOS now uses the native date picker in a modal with explicit Cancel and Set actions and the same minimum/maximum bounds. | Small-screen, large-text, VoiceOver, and swipe-dismiss behavior. **PHYSICAL DEVICE** |
| Number and keyboard input | Weight and nutrition fields use decimal/numeric keyboards; onboarding and Profile forms already use iOS keyboard avoidance. | Decimal locale, hardware keyboard, and obscured-field checks. **PHYSICAL DEVICE** |
| Sheets, safe areas, tabs, and FAB | Existing sheets use safe-area insets and the four-tab layout keeps Add as the center FAB. No new disclosure paragraph was added to food entry. | Small/large iPhone geometry, gestures, discard gates, reduced motion, and rotation behavior. **PHYSICAL DEVICE** |
| Files and sharing | Restore accepts only `.eatlog-backup` and `.marco-backup` after selection; CSV is not a restore source. Backup and CSV sharing use platform-neutral errors and iOS-compatible archive metadata. | Files-provider cancellation and share-sheet save/cancel behavior. **PHYSICAL DEVICE** |
| Cross-platform restore | Archive and SQLite formats are platform-neutral. Restore clears Android device-sync metadata and retains imported weight rows. | Android-to-iOS and iOS-to-Android archive runs. **PHYSICAL DEVICE** |
| Apple health APIs | No HealthKit or Apple Health integration is present. | Keep absent through final binary and metadata review. |

## Local verification

- `env TMPDIR=/tmp npm test`: passed 246 tests, including consent-storage/coordinator persistence and concurrency, repeated accepted requests, decline/dismissal, reset behavior, and the pre-token/pre-fetch food-estimate guard.
- `npm run typecheck`: passed after the iOS date-picker and platform-guard changes.
- Worker `npm test`: passed 17 tests with the new 32-character client token shape; limiter storage received only the salted SHA-256 digest, and the redaction test excluded raw tokens and hashes.
- Earlier local SDK 54 configuration/prebuild evidence in this release branch confirms `com.sgaret.eatlog`, iPhone-only support, camera/photo strings, no microphone string, and no non-exempt encryption declaration.

## Blocked evidence

- **ENVIRONMENT LIMITATION:** Linux has no Xcode, `xcrun`, iOS Simulator, or CocoaPods native aggregation. A post-change local iOS JavaScript export is deferred to the single final local audit run.
- **PHYSICAL DEVICE:** no iPhone or iOS simulator is available, so no visual, permission, Files, sharing, camera, accessibility, interruption, or cross-device result is claimed.
- **CREDENTIAL / STORE ACCOUNT / PAID SERVICE:** no signed IPA, TestFlight build, distribution certificate, provisioning profile, Apple record, or EAS cloud build was created or inspected.
