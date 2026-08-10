# Eatlog native configuration record

Review date: 2026-08-10

## Application identities

| Target | Identifier | Status |
| --- | --- | --- |
| Android production | `com.sgaret.eatlog` | Existing fixed package name |
| Android development | `com.sgaret.eatlog.dev` | Evaluated development variant |
| iOS production candidate | `com.sgaret.eatlog` | STORE ACCOUNT — Apple reservation is unverified |
| iOS development | `com.sgaret.eatlog.dev` | Evaluated development variant; registration is account-bound when signing is attempted |

Every variant keeps the installed name and brand `Eatlog`. Development builds coexist by identifier, not by renaming the product.

## Health Connect plugin decision

`react-native-health-connect` 3.5.3 is the maintained Android library. Its inspected Expo plugin adds the Android 13 rationale action, but it does not install `HealthConnectPermissionDelegate` and does not add the Android 14 permission-usage alias. The older `expo-health-connect` 0.1.0 companion package supplied those missing pieces through an Expo module and manifest plugin, but it is no longer needed.

`plugins/withEatlogHealthConnect.js` now owns the minimum native setup:

- registers `HealthConnectPermissionDelegate` after `MainActivity.super.onCreate`;
- adds `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` once;
- adds the `ViewPermissionUsageActivity` alias with `android.intent.action.VIEW_PERMISSION_USAGE` and `android.intent.category.HEALTH_PERMISSIONS` once;
- adds no health-data permission.

Weight access remains declared centrally in `app.json` as only `android.permission.health.READ_WEIGHT` and `android.permission.health.WRITE_WEIGHT`. The generated manifest before and after the replacement was byte-for-byte identical. The new generated `MainActivity.kt` contains the explicit delegate registration. Unit tests cover exact output, missing intent filters, Kotlin and Java templates, idempotence, and fail-closed behavior when Expo changes its template.

Primary references:

- [React Native Health Connect installation](https://github.com/matinzd/react-native-health-connect#installation)
- [React Native Health Connect permissions](https://matinzd.github.io/react-native-health-connect/docs/permissions)
- [Expo config plugin mods](https://docs.expo.dev/config-plugins/mods/)

## iOS settings

The evaluated production config uses the candidate bundle identifier, iPhone-only device family, the canonical 1024 by 1024 Eatlog icon, camera and photo-library purpose strings, and `ITSAppUsesNonExemptEncryption=false`. No microphone purpose string is generated. Eatlog uses standard HTTPS and platform cryptography and does not implement non-exempt encryption.

The canonical icon is 1024 by 1024 with alpha fixed at 255 for every pixel. Visual inspection confirms the existing flat-white egg mask on the dark Eatlog background. Android adaptive and monochrome sources keep their required transparent layers.

Prebuild without CocoaPods found privacy manifests in Expo File System, Expo Constants, Expo Application, and React Native. A signed archive must still be inspected after CocoaPods aggregation and Xcode compilation; Linux prebuild cannot prove the contents of the final binary.

## EAS configuration

The production profile selects store distribution, the production channel, remote version management, automatic build-number increments, Android App Bundle output, and the production Expo environment. With no Android-only restriction, the same profile plans an iOS App Store build. `development-simulator` is available for an iOS simulator build and uses the development identifier. The only submit profile checked in contains account-independent values: Google Play internal testing with draft status. Running it still requires a store record and credentials.

The following fields remain deliberately absent:

- STORE ACCOUNT: App Store Connect app ID and Apple team record;
- CREDENTIAL: Google service-account JSON, App Store Connect API key, certificates, and provisioning profiles;
- STORE ACCOUNT: production Google Play submit profile until closed testing is complete.

No credential filename, store record ID, or owner value is fabricated in runtime or EAS configuration.
