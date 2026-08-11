# Physical-device release matrix

Run the full `UI_SMOKE_SCRIPT.md` on every available target. One device may satisfy multiple iOS size rows, but Android API, Samsung, and constrained-device rows remain distinct evidence.

| ID | Required target | Exact setup | Additional checks | Pass condition |
| --- | --- | --- | --- | --- |
| A26 | Android API 26 | Clean install on API 26; clear app data before the run | Cold launch, process kill, Android Back, camera grant/deny/cancel, gallery cancel, offline logging, backup/export share | Core smoke passes; no unsupported API call, crash, dead permission screen, clipped sheet, or data loss |
| A36 | Current Google Android / API 36 | Clean Play-equivalent signed candidate on a Google device or emulator | Edge-to-edge/safe areas, permission rationale, Health Connect Weight read/write only, grant/revoke/reconnect, background sync, predictive Back where available | Core smoke and Health Connect round trip pass; generated permissions match the binary |
| ASAM | Current Samsung-class Android | Current One UI with battery optimization left at default | Camera/gallery providers, Files picker, share targets, process recreation, Health Connect provider behavior | No OEM-only navigation, picker, sharing, sync, or restore failure |
| ALOW | Small/constrained Android | Small screen, low-memory profile, largest font, reduced motion | Background during camera/picker, force process recreation, long names/totals, keyboard and sheet resizing | State recovers or fails safely; no hidden action, overlap, stale data, or false success |
| IMIN | Minimum supported iOS | iPhone on the minimum evaluated deployment target (currently iOS 15.1; recheck the final config) | First camera permission, photo picker, native date modal, Files and share sheets, swipe-back, kill/relaunch | Core smoke passes; no Health Connect UI/copy/native access; camera/photo purpose strings match behavior |
| ICUR | Current production iOS | Physical iPhone on current iOS with signed TestFlight candidate | Limited Photos access, camera denial/retry, background/resume, Files providers, share cancel/save, VoiceOver | Core smoke passes with real camera/files/sharing and no dead control or false completion |
| ISMALL | Small iPhone | Smallest supported iPhone display, largest text | Onboarding/Profile keyboard avoidance, tab/FAB geometry, every bottom sheet, date picker, long privacy/attribution copy | Every field/action remains visible or scroll-reachable; safe areas and focus order pass |
| ILARGE | Large iPhone | Largest supported iPhone display | Responsive widths, sheet height, tab/FAB alignment, charts, empty/loading/error states | Content does not over-expand or width-cap incorrectly; gestures and touch targets pass |

## Network and provider cases

Run on A36 and ICUR with synthetic inputs only.

1. Airplane mode: local manual logging, Diary, Analytics, Profile, backup, and CSV remain usable; remote features show a bounded error.
2. Slow network and forced timeout: Scan, Describe, and USDA stop; the selected photo/text remains local and retry is available.
3. HTTP error and malformed response through a controlled test harness: no partial garbage is logged; Open Food Facts failure does not erase USDA/local results and vice versa.
4. Missing or invalid installation identity through a development fault injection: no request is sent and the feature reports unavailable without displaying/logging the token.
5. Rate limit: response shows a retryable failure and honors `Retry-After`; no repeated automatic request loop occurs.
6. First Scan/Describe: verify the action proceeds directly to the remote request without an intervening disclosure dialog and returns an editable estimate for synthetic input.

Do not run a cost-bearing Gemini Scan against production without owner approval.

## Backup, corruption, and rollback cases

For each archive run, record source/destination platform, app version/build, schema, database count, manifest photo count, restored photo count, and outcome.

1. Current Eatlog archive with no photos and with at least two synthetic photos.
2. Supported `.marco-backup` archive.
3. Supported schema-v4 archive; confirm automatic migration to the current schema.
4. Wrong extension, CSV/ZIP export, zero-byte file, oversized fixture, missing manifest, missing database, invalid JSON manifest, path traversal, duplicate path, size/hash/count mismatch, corrupt SQLite, and future schema.
5. Development fault after live database replacement; verify automatic rollback restores the prior database and every prior photo.
6. Development fault during rollback; verify Eatlog reports the unrecoverable rollback failure and never shows Operation complete or Backup restored.
7. Android→Android, Android→iOS, iOS→iOS, and iOS→Android. On iOS, restored Android Health Connect rows may remain as weight history, but sync state/export IDs must be inactive and all Health Connect UI/copy absent.

Automated Node tests cover format validation, schema-v4 migration, platform-neutral database compatibility, archive allowlists, corruption signals, and rollback orchestration. These rows remain unsigned until the native ZIP, Files, SQLite, and photo operations run on actual targets.

## Release halt rules

- P0: data loss, unrecoverable database failure, secret exposure, unsafe nutrition target, or paid-app entitlement error. Halt all distribution.
- P1: crash/blocker in onboarding, logging, edit/delete/undo, backup/restore, reset, required permission flow, or store review path. Halt rollout and submission.
- P2: material layout/accessibility defect or provider degradation with a working local path. Fix before public release unless the owner records acceptance.
- P3: cosmetic issue with no misleading behavior or blocked action. Record and schedule; owner decides release impact.
