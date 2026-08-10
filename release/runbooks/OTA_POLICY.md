# Eatlog EAS Update policy

Policy date: 2026-08-10

No OTA update is published as part of account-free release preparation.

## Compatibility boundary

Production builds use the `production` channel and `runtimeVersion.policy: "appVersion"`. An update may target an installed build only when its JavaScript and assets work with exactly the native modules, permissions, configuration, database contract, and bundled assets in that build.

A new store binary and marketing-version increment are required for:

- native dependency or config-plugin changes;
- Android or iOS permissions, purpose strings, privacy manifests, entitlements, or identifiers;
- a database or backup change that an older embedded update cannot safely read and roll back from;
- changes to required privacy disclosure or provider data handling;
- any change that store review must evaluate.

OTA must not be used to bypass Apple or Google review.

## Verification gate

Before publishing to production:

1. Start from a clean checkout of the exact commit.
2. Run clean install, full tests, typecheck, Expo dependency check, Expo Doctor, Android and iOS export, and notices check.
3. Confirm the evaluated runtime version matches the installed preview build on both platforms.
4. Publish to a non-production branch/channel only after the release owner authorizes the external operation.
5. Run the complete smoke flow on representative Android and iOS builds. Include launch, onboarding or existing-data startup, manual food logging, Scan/Describe cancellation, Diary edit/delete/undo, weight entry, Analytics, backup, CSV export, restore validation, privacy links, and reset cancellation.
6. Record the update group ID, platform update IDs, runtime version, commit, channel, tester, device/OS, result, and rollback target.
7. Promote only the tested update content. Do not rebuild or alter assets between preview evidence and production publish.

Any failed test, unexplained Expo finding, crash, data loss, provider-contract regression, missing evidence, or platform mismatch halts publication.

## Evidence record

For each production update, append an owner-controlled release record containing:

| Field | Required value |
| --- | --- |
| Marketing/runtime version | Evaluated value from the shipped binary |
| Source | Full commit hash and clean status |
| Update identity | Update group ID and Android/iOS update IDs |
| Target | Branch and mapped channel |
| Verification | Commands, pass/fail results, tester, devices, and timestamp |
| Rollback | Last known-good update group or embedded build |
| Approval | Release owner and publication time |

## Rollback

Stop rollout immediately for crashes, startup failure, incorrect nutrition safety behavior, data corruption, backup/restore failure, disclosure bypass, provider data leakage, or a material store-policy mismatch.

The release owner runs the current EAS interactive rollback command:

```sh
eas update:rollback
```

Select the affected branch and either the recorded last known-good update or the embedded update. Verify recovery on both platforms, record the rollback update IDs, and halt further publication until the cause and data-compatibility impact are understood. A rollback does not reverse data already mutated on device, which is why incompatible migrations are excluded from OTA.

STORE ACCOUNT / CREDENTIAL: practice this process on a preview branch after an authorized preview update exists and before enabling production OTA. The account-free audit cannot create update records or verify dashboard state.

Primary references: [Expo runtime versions](https://docs.expo.dev/eas-update/runtime-versions/) and [Expo rollbacks](https://docs.expo.dev/eas-update/rollbacks/).
