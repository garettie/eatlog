# Safe on-device API-key lifecycle for Manok

Date: 2026-09-24

Research ticket: [Establish a safe on-device API-key lifecycle](https://github.com/garettie/eatlog/issues/21)

Map: [Make Eatlog free with Manok BYOK and optional Itik hosted AI](https://github.com/garettie/eatlog/issues/19)

## Conclusion

Expo SDK 54 documents `expo-secure-store` as a supported native credential store for Android and iOS. It is a suitable candidate for a user's Google API key. It is not currently installed in Eatlog. Adding it requires a compatible native build and backup configuration, not just a JavaScript update.

The main lifecycle distinction is documented: Android uninstall removes the stored credential; iOS Keychain can retain it across reinstall with the same bundle identifier. App reset must explicitly delete the credential on either platform. An Eatlog meal backup must neither contain nor restore it.

This resolves the storage research, not the owner's interaction choices. No dependency was installed, application code changed, native build run, or real key used. Native-device behavior remains to be verified during implementation.

## Current application observations

Read from the working source during this investigation:

- `package.json` uses Expo `~54.0.36` and React Native `0.81.5`; it does not list `expo-secure-store`.
- `app.json` uses Expo config plugins. Android min/target/compile SDK versions are 26/36/36. The iOS bundle identifier is `com.sgaret.eatlog`; `usesNonExemptEncryption` is already false.
- `src/services/dataReset.ts` clears meal photos, remote-estimate consent, estimate-action memory, temporary ownership files, and current/legacy SQLite databases before initializing a new database. It has no separate credential-store deletion.
- Both Profile deletion entry points use that reset service. Extending only one screen would leave another deletion path incomplete.
- The existing backup/restore flow in `src/screens/DataSyncScreens.tsx` concerns the database and meal photos. CSV is a readable export, not a restorable backup. Neither format should acquire a key field.

These are current-source observations, not claims that the branch contains a BYOK implementation.

## Documented storage contract

[Expo's SDK 54 SecureStore reference](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/) documents:

- Android values live in encrypted SharedPreferences backed by Android Keystore.
- iOS values live in Keychain generic-password items.
- Values persist across application restarts and updates.
- Android uninstall removes the stored data and Keystore material.
- iOS values can persist across reinstall with the same bundle ID. Expo explicitly warns not to rely on this behavior as guaranteed recovery.
- `setItemAsync`, `getItemAsync`, and `deleteItemAsync` provide asynchronous storage operations. Native errors must be handled; historically some iOS versions rejected large values above roughly 2,048 bytes.
- The config plugin controls native settings, including Android backup exclusions and Face ID permission text. Those changes require a new binary.

The exact SDK-compatible package patch should be selected during implementation with Expo's installer. This research did not modify the lockfile or establish that an existing preview binary contains the module.

Secure storage does not make the client tamper-proof. [Android's Keystore documentation](https://developer.android.com/privacy-and-security/keystore) distinguishes protection against extracting key material from a compromised process's ability to use a key on the device. [Apple's Keychain documentation](https://developer.apple.com/documentation/security/keychain-services) and [keychain data-protection overview](https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web) describe encrypted storage and accessibility controls, not protection against every action of an authorized or compromised application.

A direct Google request necessarily needs the API key in application memory. Do not promise reliable memory zeroization, resistance to a modified binary, or remote deletion of copies from other systems.

## OS backup and Eatlog backup are different

### Android OS backup

SecureStore data must be excluded from Android backup. Restoring encrypted preferences after uninstall cannot restore the Keystore key needed to decrypt them.

Expo configures the exclusion automatically when there is no custom backup configuration. If custom rules exist, Expo documents excluding `SecureStore` under the `sharedpref` domain and setting the plugin's `configureAndroidBackup` to false so the application owns those rules. Account for both Android 11-and-earlier and Android 12+ formats, including device transfer. Do not disable the automatic configuration without supplying equivalent exclusions.

Sources: [Expo SecureStore backup instructions](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/#android-auto-backup), [Android Auto Backup](https://developer.android.com/identity/data/autobackup).

### iOS Keychain

Expo exposes iOS accessibility options. `WHEN_UNLOCKED` is the documented default. `WHEN_UNLOCKED_THIS_DEVICE_ONLY` prevents migration of that item to another device during restore. `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` requires a passcode and deletes the item if the passcode is removed. These accessibility choices do not configure Android backup.

If the product promises that reinstall always starts without a credential, iOS persistence requires an explicit application policy. A reinstall discriminator must itself be evaluated against OS restoration; a simple restored preference is not proof of a fresh installation.

Source: [Expo SDK 54 SecureStore accessibility constants and persistence](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/).

### User-created archives

An `.eatlog-backup`, legacy `.marco-backup`, or CSV export must not include the key in the database, manifest, photos, filenames, temporary files, or share text. This is an application responsibility, separate from SecureStore's OS backup exclusions.

Restoring meal data must never import or overwrite a key from an archive. Whether restore preserves the current device's existing key or explicitly removes it is an owner decision already covered by the setup ticket.

## Authentication tradeoffs

SecureStore's `requireAuthentication` option changes the interaction and failure contract:

- Expo documents authentication for operations on Android, with different create/read/update prompting behavior on iOS.
- Changes to biometric enrollment can make an authentication-protected value inaccessible.
- Relevant biometric behavior is unavailable in Expo Go without the required iOS usage description.
- Synchronous operations can block the JavaScript thread while prompting; prefer the asynchronous APIs for this app's request path.

Recommendation, not a settled product decision: avoid mandatory per-request biometrics for the first BYOK flow unless the owner specifically wants them. Use the supported storage protections and choose iOS accessibility deliberately. Do not imply that Android's default storage configuration imposes the same per-read device-unlock policy as an iOS accessibility class.

Source: [Expo SDK 54 SecureStore options and APIs](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/).

## Application responsibilities

The following are recommended constraints for the implementation decisions, not claims that SecureStore supplies the whole behavior:

- Use one namespaced credential entry, outside SQLite and exported application data.
- For replacement at the same entry, write the replacement and report success only when the write completes. Do not delete the old entry afterward at that same key, which would delete the replacement. Do not pre-delete a working key before attempting replacement. Do not claim transactional behavior beyond the documented API.
- Distinguish a missing value from an unavailable credential store. A read error must stop the request without implying the user deliberately removed the key or switching to owner-funded AI.
- Explicit Remove key and Delete all data must delete the credential and prevent later requests from using a previously cached copy. Define in-flight request behavior separately.
- Do not claim successful complete deletion when credential deletion fails. The owner must choose the recovery interaction.
- Keep plaintext out of navigation parameters, persistent state, console output, crash payloads, request diagnostics, support bundles, and screenshots.
- The user key must go only to Google through its supported request-authentication mechanism, never to the Eatlog Worker or food-search services. The Google research determines that mechanism.
- Minimize plaintext lifetime in memory, without promising that JavaScript can securely erase all copies.

The current reset service is the shared integration boundary for data deletion. Research does not justify adding a separate reset path just for one screen.

## Input, clipboard, and web limits

[Expo SDK 54 Clipboard](https://docs.expo.dev/versions/v54.0.0/sdk/clipboard/) supports user-initiated paste, including a platform-supported paste button. It does not make clipboard contents a secure vault. Avoid automatic clipboard reads or copying a saved key back to the clipboard. A user may still paste a key from another application; Eatlog cannot revoke those external copies.

[React Native TextInput](https://reactnative.dev/docs/0.81/textinput) supplies secure text entry and input settings. A masked field, disabled autocorrection/capitalization, and clearing the transient field after save are reasonable UI recommendations. Native keyboard, screenshot, app-switcher, and autofill behavior needs device verification if the product promises protection there.

SecureStore's SDK 54 platform list includes Android, iOS, tvOS, and Expo Go, not web. A web build cannot silently substitute localStorage and claim the same Keychain/Keystore protection. Any requirement for persistent browser BYOK needs a separately considered security contract; the current project is Android-first with iOS compatibility.

## Native build and verification implications

A new native module or plugin configuration cannot be supplied to an older binary merely by publishing JavaScript through EAS Update. Use a new compatible standalone preview build for implementation verification. This is consistent with the project's existing preview-binary constraints.

Later evidence should distinguish:

- Deterministic checks for request routing, key exclusion from explicit archives, reset behavior, and unavailable-store errors.
- Real native checks for restart/update, replace/remove, Delete all data, Android uninstall/OS restore, and iOS reinstall/Keychain behavior.
- Separate biometric tests only if that policy is chosen.
- Redacted network inspection establishing that keys do not reach the Worker or diagnostic output.

No such device verification occurred in this research.

## Decision handoff

These questions belong in [Choose BYOK setup, consent, and key-management interactions](https://github.com/garettie/eatlog/issues/24), coordinated with [Define tier identity and AI mode transitions](https://github.com/garettie/eatlog/issues/22):

1. What should iOS reinstall and meal-backup restore do with an existing device key?
2. Is ordinary secure storage sufficient, or does the owner require additional biometric prompts and their recovery flow?
3. What does the user see when removal or Delete all data cannot delete the credential?
4. How are missing, unreadable, invalid, and quota-exhausted keys distinguished without changing the selected funding source?

Native packaging and lifecycle proof belong in [Define proof that the free and hosted routes work end to end](https://github.com/garettie/eatlog/issues/26). No separate account recovery, cloud key synchronization, or server credential service is needed by these findings.

## Evidence limits

This note combines a read-only research subagent's primary-source investigation with parent verification of the SDK 54 SecureStore reference and current package/config/reset files. Retrieval date is the date above. No native device, API key, provider call, install, test suite, or build was used. OEM behavior, actual generated backup configuration, and the selected package patch remain implementation-time verification items.
