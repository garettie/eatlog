# Eatlog store review material

Use the `reviewerNotes` fields in `metadata.mjs` as the canonical text. Add the owner-controlled review contact only in the store console. Do not add a demo account: Eatlog has no login.

## Feature walkthrough

1. Launch Eatlog and complete onboarding with the synthetic profile in `SCREENSHOT_PLAN.md`. The plan preview must pass the adult and nutrition-safety rules before it can be accepted.
2. Open the center Add control. Choose Enter manually, enter the synthetic rice bowl, and save it. Today and Diary update immediately.
3. As Pugo, Scan, Photo, and Describe proceed and share three initial estimates per rolling 24 hours. The separate full-screen AI consent appears when required; Okay enables that allowed estimate and Not now keeps local Eatlog features usable. After an estimate, a meal or component re-estimate opens the plan screen before another consent prompt or private-content construction. Use only non-sensitive test content.
4. Review and edit every estimate before saving. The review result is an estimate, not a medical or guaranteed-accuracy result.
5. In Diary, tap any meal image or food-icon rail, or swipe the meal and select Share immediately left of Delete. Share meal opens directly on a 9:16 preview. Swipe the preview horizontally to move between Photo, Framed, and Nutrition; dots show the current position, and meals without an available photo use Nutrition automatically. The permanent Eatlog mark, Save image, and Share are all visible without vertical scrolling; no mark control or toggle exists. Save image writes one 1080 by 1920 PNG to Photos or Gallery; Share opens the operating-system share menu so the reviewer chooses the destination. Standalone foods do not expose Share.
6. Open Search foods. Typing uses USDA through the Eatlog Worker when configured. Pressing Search also runs the explicit direct Open Food Facts full search.
7. Add and update a weight. Pugo Analytics keeps weight, calorie, and logging metrics but shows a locked adaptive card. Paid/Test Store access can calculate a plan review and the user chooses Accept or Keep.
8. Open Profile → Plan to inspect status, the Pugo free-estimate counter, localized products, paid fair-use counters, Support ID, restore, and management actions. Then open Backup and restore, create an `.eatlog-backup`, inspect a supported archive, and confirm twice before replacement. Open Export data to create readable, non-restorable CSV files without entitlement state.
9. Open Profile → Delete all data. Cancel each confirmation once, then complete deletion. Eatlog returns to onboarding.

## Platform differences

- Android: Profile includes optional Health Connect. Eatlog requests Weight read/write only after the reviewer chooses Connect. Imported weights stay in local history; Eatlog tracks and can delete only records it wrote.
- iOS: no Health Connect row, route, copy, sync, HealthKit, or Apple Health integration exists in v1.
- Both: camera, photo library, Files/document picker, and sharing permissions or system UI appear only when the related action starts. Saving a share image requests only the platform access needed to add that image; sharing requests no Photos permission.

## Provider and privacy explanation

- Initial AI access is authorized before the separate consent flow. Pugo receives five shared photo or description estimates per rolling 24 hours; meal and component re-estimates require Manok, Itik, or complimentary access and are denied before consent or private-content construction. After the user chooses Okay for an allowed request, Eatlog sends the selected photo and any optional meal title through the Eatlog Cloudflare Worker to Google Gemini; Describe and allowed re-estimates send user-entered text. Not now and withdrawal block Gemini requests while leaving history reuse, food search, and local logging available.
- USDA search and detail use the Worker. Open Food Facts is contacted directly only for explicit full search.
- The app-scoped installation token is sent for throttling and is stored outside SQLite backups. The Worker stores only its salted hash for rate limiting.
- Saved profile, target, log, meal, photo, and weight data stays local unless the user invokes a named remote feature or shares an export/backup.
- Share-card images are rendered locally into temporary cache. Eatlog has no sharing backend or social publishing service; only a user-directed Save image or operating-system share destination receives the generated PNG.
- Google Play and Apple process Manok and Itik purchases. RevenueCat verifies store entitlement metadata using the app-scoped installation token as App User ID; Eatlog receives no card, bank, password, or one-time-code details and grants no cross-store entitlement.

## Backup, export, reset, and reviewer evidence

- Backup creates `.eatlog-backup`; supported legacy `.marco-backup` files can be restored. CSV and ordinary ZIP exports must be rejected by restore.
- Restore validates archive paths, sizes, hashes, counts, database integrity, foreign keys, schema version, and photo mappings before replacement. It creates an internal safety copy and attempts automatic rollback on failure.
- Reset uses two confirmations and removes local profile, targets, logs, weights, reviews, and meal photos. Android reports Health Connect cleanup separately; iOS contains no Health Connect wording.
- Record the app commit/version/build, Worker version, test device/OS, path results, and real screenshot paths. Store account, signed-binary, provider-console, and physical-device results remain unsigned until actually performed.
