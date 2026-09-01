# Physical-device release matrix

Run the full `UI_SMOKE_SCRIPT.md` on every available target. One device may satisfy multiple iOS size rows, but Android API, Samsung, and constrained-device rows remain distinct evidence.

| ID | Required target | Exact setup | Additional checks | Pass condition |
| --- | --- | --- | --- | --- |
| A26 | Android API 26 | Clean install on API 26; clear app data before the run | Cold launch, process kill, Android Back from viewer/composer, camera grant/deny/cancel, gallery cancel, Save image legacy-write grant/deny/permanent-denial and Settings recovery, native meal share/cancel, offline logging, backup/export share | Core smoke passes; legacy write is requested only after Save image, saving and sharing work, cleanup leaves no stale busy state, and no unsupported API call, crash, dead permission screen, clipped sheet, or data loss occurs |
| A36 | Current Google Android / API 36 | Clean Play-equivalent signed candidate on a Google device or emulator | Edge-to-edge/safe areas, no media-read prompt on Save image, Gallery result, multiple meal-image share targets and cancellation, composer background/resume, TalkBack, reduced motion, Health Connect Weight read/write only, grant/revoke/reconnect, background sync, predictive Back where available | Core smoke and Health Connect round trip pass; meal save/share works without media-read access; generated permissions match the binary |
| ASAM | Current Samsung-class Android | Current One UI with battery optimization left at default | Camera/gallery providers, share-card PNG visibility in Samsung Gallery, Samsung and third-party share targets, share cancellation, Files picker, process recreation, Health Connect provider behavior | No OEM-only navigation, picker, Gallery, sharing, sync, or restore failure |
| ALOW | Small/constrained Android | Small screen, low-memory profile, largest font, reduced motion | Background during camera/picker, force process recreation, long names/totals, keyboard and sheet resizing | State recovers or fails safely; no hidden action, overlap, stale data, or false success |
| IMIN | Minimum supported iOS | iPhone on the minimum evaluated deployment target (currently iOS 15.1; recheck the final config) | First camera permission, photo picker, Save image add-only prompt grant/deny/permanent-denial and Settings recovery, meal share cancellation, VoiceOver, native date modal, Files and share sheets, swipe-back, kill/relaunch | Core smoke passes; Save image uses the approved add-only purpose string, Share requests no Photos permission, and no Health Connect UI/copy/native access exists |
| ICUR | Current production iOS | Physical iPhone on current iOS with signed TestFlight candidate | Photos save result, multiple meal-image share targets and cancellation, composer background/resume, safe areas, largest text, camera denial/retry, Files providers, VoiceOver | Core smoke passes with real Photos/files/sharing, selected composer state survives interruption, and no dead control or false completion occurs |
| ISMALL | Small iPhone | Smallest supported iPhone display, largest text | Onboarding/Profile keyboard avoidance, tab/FAB geometry, every bottom sheet, date picker, long privacy/attribution copy | Every field/action remains visible or scroll-reachable; safe areas and focus order pass |
| ILARGE | Large iPhone | Largest supported iPhone display | Responsive widths, sheet height, tab/FAB alignment, charts, empty/loading/error states | Content does not over-expand or width-cap incorrectly; gestures and touch targets pass |

## Share-image inspection

Run after Save image on A26, A36, ASAM, IMIN, and ICUR where available.

1. Inspect Meal Photo, Framed, and Nutrition PNGs and confirm exact 1080 by 1920 dimensions.
2. Use square, portrait, landscape, panorama, and rotated-orientation synthetic sources. Confirm every result is upright and never stretched. Confirm Photo and Framed apply their intended cover crop, while Nutrition falls back cleanly when no photo is available.
3. Inspect metadata and confirm source GPS/location, camera model, original filename, and capture timestamp are absent.
4. Send one generated PNG through a messaging target that recompresses images. Confirm Onest text, meal title, calories, P/C/F labels, and the permanent Eatlog mark remain legible; no mark toggle or state is exposed.
5. Repeat save/share twice and cancel once. Confirm no stale style, exposed swipe row, false success, blocked action, or generated cache attachment remains in later operations.

## Network and provider cases

Run on A36 and ICUR with synthetic inputs only.

1. Airplane mode: local manual logging, Diary, Analytics, Profile, backup, and CSV remain usable; remote features show a bounded error.
2. Slow network and forced timeout: Scan, Describe, and USDA stop; the selected photo/text remains local and retry is available.
3. HTTP error and malformed response through a controlled test harness: no partial garbage is logged; Open Food Facts failure does not erase USDA/local results and vice versa.
4. Missing or invalid installation identity through a development fault injection: no request is sent and the feature reports unavailable without displaying/logging the token.
5. Pugo rolling limit: across mixed Scan, Photo, and Describe requests, the third initial estimate succeeds and the fourth shows `You've used your 3 free estimates for this 24-hour window. Try again after it resets.` The Plan screen shows `0/3` and the reset time; no repeated automatic request occurs.
6. Pugo re-estimation: meal and component actions open the plan screen before consent, content construction, installation-token loading, or fetch. Paid/Test Store access proceeds to consent and the Worker.
7. Fresh onboarding: verify the concise AI meal-estimate consent appears before setup completes. Select Okay once, then verify allowed Scan and Describe requests proceed without another consent prompt. On a declined run, verify Not now enters Eatlog, sends no request or installation token, preserves local search/manual features, and a later explicit initial AI action reopens the full-screen choice before transmission.
8. With paid estimates enabled, turn them off from Profile → Privacy and invoke re-estimation. Verify the choice reappears before transmission; declining preserves the current edits and undo state.

Do not run a cost-bearing Gemini request against staging or production without owner approval. Record approval, synthetic input, access class, selected model, status, latency, and aggregate token/cost fields without recording content or identifiers.

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
