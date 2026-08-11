# Eatlog native configuration record

Review date: 2026-08-11

## Application identities

| Target | Identifier | Status |
| --- | --- | --- |
| Android production | `com.sgaret.eatlog` | Existing fixed package name |
| Android development | `com.sgaret.eatlog.dev` | Evaluated development variant |
| iOS production candidate | `com.sgaret.eatlog` | STORE ACCOUNT: Apple reservation is unverified |
| iOS development | `com.sgaret.eatlog.dev` | Evaluated development variant; registration is account-bound when signing is attempted |

Every variant keeps the installed name and brand `Eatlog`. Development builds coexist by identifier, not by renaming the product.

## Health Connect plugin decision

`react-native-health-connect` 3.5.3 is the maintained Android library. Its inspected Expo plugin adds the Android 13 rationale action, but it does not install `HealthConnectPermissionDelegate` and does not add the Android 14 permission-usage alias. The older `expo-health-connect` 0.1.0 companion package supplied those missing pieces through an Expo module and manifest plugin, but it is no longer needed.

`plugins/withEatlogHealthConnect.js` now owns the minimum native setup:

- registers `HealthConnectPermissionDelegate` after `MainActivity.super.onCreate`;
- adds a dedicated `PermissionsRationaleActivity` for `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`;
- routes that activity to Eatlog's in-app Profile > Privacy screen without requiring a public URL;
- adds the `ViewPermissionUsageActivity` alias with `android.intent.action.VIEW_PERMISSION_USAGE` and `android.intent.category.HEALTH_PERMISSIONS`, targeting the same rationale activity;
- adds no health-data permission.

Weight access remains declared centrally in `app.json` as only `android.permission.health.READ_WEIGHT` and `android.permission.health.WRITE_WEIGHT`. The original package replacement first preserved the old generated manifest byte-for-byte. The final permission audit then corrected the old manifest's insufficient MainActivity rationale target: current Android guidance requires a dedicated activity that displays the app's privacy policy. The generated `PermissionsRationaleActivity.java` opens only the in-app privacy route, while `MainActivity.kt` contains the explicit delegate registration. Unit tests cover exact manifest output, the generated privacy route, missing intent filters, Kotlin and Java templates, idempotence, and fail-closed behavior when Expo changes its template.

Primary references:

- [React Native Health Connect installation](https://github.com/matinzd/react-native-health-connect#installation)
- [React Native Health Connect permissions](https://matinzd.github.io/react-native-health-connect/docs/permissions)
- [Expo config plugin mods](https://docs.expo.dev/config-plugins/mods/)
- [Android Health Connect setup](https://developer.android.com/health-and-fitness/health-connect/get-started)

## Android permission hygiene

`app.json` blocks `android.permission.SYSTEM_ALERT_WINDOW` and every Android 13 media-read permission (`READ_MEDIA_VISUAL_USER_SELECTED`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, and `READ_MEDIA_AUDIO`). ImagePicker's `microphonePermission: false` continues to produce the separate `RECORD_AUDIO` removal directive. Media Library uses `granularPermissions: []`, so it does not request Android 13 photo, video, or audio reads.

The generated app manifest retains `INTERNET` for named remote features, `VIBRATE` for the app's haptic controls, `READ_EXTERNAL_STORAGE` for the existing pre-Android-13 gallery-picker path, and Health Connect Weight read/write. Point-of-use meal-image saving also retains `WRITE_EXTERNAL_STORAGE` only through API 32. `plugins/withEatlogMediaPermissions.js` applies `android:maxSdkVersion="32"` because Expo's generated base manifest can preserve an older write-removal directive even after the block is removed. Android 13 and newer save through MediaStore without a runtime photo-read prompt.

The merged release manifest is a release gate: the legacy write declaration must be capped at API 32, all Android 13 media-read permissions must be absent, and explicit `android.permissions` must remain limited to Health Connect Weight read/write. Camera, gallery selection, and Save image still require point-of-use device verification.

Primary references: [Expo permissions guide](https://docs.expo.dev/guides/permissions/#android) and [Expo Media Library](https://docs.expo.dev/versions/v54.0.0/sdk/media-library/).

## iOS settings

The evaluated production config uses the candidate bundle identifier, iPhone-only device family, the canonical 1024 by 1024 Eatlog icon, camera and photo-library purpose strings, the add-only string `Allow Eatlog to save meal images to your photo library.`, and `ITSAppUsesNonExemptEncryption=false`. The add-only permission is requested only after Save image; native sharing requests no Photos permission. No microphone purpose string is generated. Eatlog uses standard HTTPS and platform cryptography and does not implement non-exempt encryption.

The canonical icon is 1024 by 1024 with alpha fixed at 255 for every pixel. Visual inspection confirms the existing flat-white egg mask on the dark Eatlog background. Android adaptive and monochrome sources keep their required transparent layers.

Prebuild without CocoaPods found privacy manifests in Expo File System, Expo Constants, Expo Application, and React Native. A signed archive must still be inspected after CocoaPods aggregation and Xcode compilation; Linux prebuild cannot prove the contents of the final binary.

## EAS configuration

The production profile selects store distribution, the production channel, remote version management, automatic build-number increments, Android App Bundle output, and the production Expo environment. With no Android-only restriction, the same profile plans an iOS App Store build. `development-simulator` is available for an iOS simulator build and uses the development identifier. The only submit profile checked in contains account-independent values: Google Play internal testing with draft status. Running it still requires a store record and credentials.

The following fields remain deliberately absent:

- STORE ACCOUNT: App Store Connect app ID and Apple team record;
- CREDENTIAL: Google service-account JSON, App Store Connect API key, certificates, and provisioning profiles;
- STORE ACCOUNT: production Google Play submit profile until closed testing is complete.

No credential filename, store record ID, or owner value is fabricated in runtime or EAS configuration.

## Native binary boundary

`expo-media-library` and `react-native-view-shot` add native modules, Android manifest declarations, and an iOS purpose string. Meal sharing therefore requires a new Android/iOS binary under the existing `runtimeVersion.policy: "appVersion"`. `expo.version` is raised to `1.2.0` so this binary has a different runtime from older `1.1.0` installs; the feature must not be published as an OTA update to those older runtimes.
