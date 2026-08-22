# Eatlog data inventory

Verified against source on 2026-08-11. This inventory describes the account-free v1 application and its Cloudflare Worker. It is the source for privacy copy and store disclosures; it is not a claim that the draft public pages are hosted.

## Storage on the device

| Data | Contents | Storage and lifetime | Leaves the device? | User controls |
| --- | --- | --- | --- | --- |
| Profile | Display name, sex, birth date, height, activity level, goal, preferred weight unit, target weight, protein preference, analytics-intro state | Singleton row in the app-private SQLite database until reset or app removal | No | Edit in Profile; included in backup and CSV export; removed by Delete all data |
| Nutrition targets and reviews | Calorie and macro history, TDEE estimates, target origin, adaptive evidence and decisions, intake-day confirmations | App-private SQLite tables until reset or app removal | No | Review and edit targets; included in backup and CSV export; removed by reset |
| Food history and meals | Dates, meal type, food names, source identifiers, brands, preparation, portions, grams, calories and macros, meal relationships | App-private SQLite tables until deletion, reset, or app removal | Only content deliberately sent for an online lookup or estimate | Add, edit, delete, undo; included in backup and CSV export |
| Weight history | Dates, scale and trend weight, revision, record origin, and Android Health Connect origin metadata | App-private SQLite until deletion, reset, or app removal | Android Health Connect records can cross the app boundary only after the user enables that connection | Add, edit, delete; included in backup and CSV export |
| Health Connect state | Android-only enabled flag, last-sync time, exported-record IDs, revisions, and pending-delete flags | App-private SQLite; restored archives have device-specific connection state cleared | Only to Android Health Connect, not to Eatlog's Worker | Connect/disconnect; revoke in Android settings; reset attempts to remove Eatlog-written records |
| Meal photos | App-private image files and SQLite file references | A photo used for a reused or newly estimated meal is copied at most once into app-private storage for review and saving; saved files remain until meal-photo removal, reset, or app removal | Camera/gallery selection and past-meal reuse stay local; a resized/compressed representation is sent only when the user chooses Estimate as new; a locally rendered meal card leaves only through user-directed Save image or system sharing | Choose camera/gallery content, reuse local meal history, remove a meal photo, save a derived meal card to Photos/Gallery, share it to a selected destination, exclude photos from CSV, include referenced photos in backup, reset |
| AI food cache | Normalized foods, brands, preparation, serving information, nutrition values, and Scan/Describe source | `food_cache` in SQLite until reset or app removal | No additional transmission; populated from a returned estimate | Included in database backup, excluded from human-readable CSV, removed by reset |
| Pins | Keys for pinned foods | `pinned_foods` in SQLite until unpinned, reset, or app removal | No | Pin/unpin; included in database backup |
| Online search cache | Recent USDA/Open Food Facts result sets and provider state | In process memory for a short TTL; ends when the app process ends | The original lookup already used the provider described below | Search cancellation, retry, or app close |
| Installation identity | App-scoped random token, after M4 implementation | App-private persistence outside SQLite and backups | Sent to the Eatlog Worker for request throttling; never shown or logged | Regenerates after missing/corrupt state or app removal; excluded from backup and CSV |
| Remote-estimate consent | Current version plus `accepted` or `declined` decision | App-private file outside SQLite until the user changes it, resets data, or removes the app | No | Okay enables Gemini estimates; Not now keeps local features usable; Profile → Privacy withdraws it; excluded from backup and CSV |

SQLite tables verified in `src/db/database.ts`: `profile`, `weight_logs`, `meals`, `food_logs`, `food_cache`, `pinned_foods`, `daily_targets`, `adaptive_reviews`, `health_connect_state`, `health_connect_weight_exports`, and `adaptive_intake_day_confirmations`.

## Network data flows

### Estimate as new, Describe, and re-estimation

1. The user can take or choose a photo and search or reuse grouped meal history entirely on the device. Those actions do not request online-estimate consent, prepare an upload, or contact the Worker.
2. If the user chooses Estimate as new, Describe, clarification, or re-estimation, Eatlog requests the current online-estimate consent when required. A decline keeps the selected photo, title, and local suggestions without sending data.
3. Estimate as new sends a resized/compressed base64 image and optional meal title; Describe and re-estimation send the entered food or meal text. Requests also carry the app-scoped installation token.
4. The Eatlog Cloudflare Worker validates the request, applies installation-token and IP-based rate limits, and sends the requested content to Google Gemini.
5. The Worker returns structured estimate data. Eatlog requires review before saving it as a log.

The Worker must not log request bodies, images, descriptions, prompts, model responses, raw installation tokens, token hashes, IP addresses, headers, or secrets. M6 tests and runbooks verify that constraint. Cloudflare and Google process the request to provide and protect the service; their production terms and retention settings require an owner console review before release.

### USDA FoodData Central

- Typing a food query can send the rewritten query and `common` mode to the Eatlog Worker. Pressing Search can send the query and `full` mode. Selecting a USDA result can send its numeric FoodData Central ID for detail.
- The request carries the app-scoped installation token. Cloudflare supplies the connecting IP for rate limiting.
- The Worker sends the query or ID to USDA FoodData Central, normalizes the result, and may cache upstream responses. Query-derived cache keys use a digest rather than readable query text.
- Eatlog receives food descriptions, source IDs, nutrient data, and portions. The app keeps a short in-memory result cache and persists only data the user logs.

### Open Food Facts

- Open Food Facts runs only for an explicit full search, such as pressing the keyboard Search action. It does not run in the type-ahead search.
- The app sends the rewritten search text directly by HTTPS POST to `https://search.openfoodfacts.org/search` and receives matching product records.
- The request uses the provider-required `Eatlog/<version> (<monitored support email>)` User-Agent. The provider is disabled when the owner-controlled support email is absent or invalid.
- Requested fields are product name, code, brands, nutrient data, serving quantity, and serving size. Eatlog does not request product images in this search.
- Open Food Facts data is volunteer-contributed and may be incomplete or inaccurate. Database, database-content, and image license attributions remain visible in the app and policy source.

### No other app network flows

The v1 source has no app account, authentication, cloud database, cloud sync, receipt server, advertising, or third-party analytics/telemetry SDK. Expo/EAS can be used by the owner for builds and updates, but those release operations are not user-facing application data flows and are governed separately by the selected release account and OTA policy.

## Permissions and platform boundaries

| Permission or surface | Platform | Trigger | Scope |
| --- | --- | --- | --- |
| Camera | Android and iOS | User taps Scan with camera | Capture an image for the selected Scan action |
| Photo library/system picker | Android and iOS | User taps Photo | Select one image for Scan |
| Add to photo library | Android and iOS | User taps Save image in a share preview | Save one locally rendered 1080 by 1920 PNG; Android API 26 to 32 uses legacy write access, Android API 33+ uses MediaStore without media-read permission, and iOS uses add-only access |
| Health Connect Weight read/write | Android only | User opens Health Connect and chooses to connect or sync | Read Weight records and write Eatlog-entered Weight records only |
| Files/document picker | Android and iOS | User starts restore | Select an Eatlog/legacy Marco backup archive; CSV is not accepted as restore input |
| Share sheet | Android and iOS | User shares a card image, backup, or CSV export | User selects the destination app or storage provider; card sharing requests no photo-library permission |
| Notifications, microphone, contacts, location, advertising ID | None | Not requested | Not part of v1 |

HealthKit and Apple Health are absent from v1. iOS hides Health Connect navigation, sync, privacy copy, and reset wording. Android backup metadata for Health Connect is ignored safely when restored on iOS.

## Backup, restore, export, sharing, deletion

- A restorable `.eatlog-backup` archive contains `manifest.json`, a SQLite database snapshot, and referenced meal photos. Supported legacy `.marco-backup` archives use the same restorable model. The installation identity and remote-estimate consent file are outside SQLite and never enter the archive.
- Restore stages and validates the archive, file sizes and hashes, record counts, database integrity, foreign keys, schema version, and photo mappings before replacing live data. It rejects future schemas without mutation. A safety copy supports automatic rollback if replacement fails.
- A CSV export is a zipped, human-readable set of profile, meal, component, weight, target, and adaptive-review CSV files plus a manifest. It contains no photos or Health Connect synchronization metadata and cannot be restored.
- Sharing renders the selected meal card on-device as a 1080 by 1920 PNG, writes it only to temporary cache, and removes capture/cache files after the Save image or Share attempt. Save image adds the PNG to Photos or Gallery; Share sends it only to the operating-system destination the user chooses. Every Photo, Framed, Nutrition, and photo-less fallback card permanently includes the Eatlog mark; no mark toggle exists. Eatlog has no sharing backend, public link, social feed, destination tracking, or source-EXIF transfer.
- Backup and export files leave Eatlog only when the user invokes the system share sheet and chooses a destination. Eatlog cannot control a recipient app or cloud-storage provider after sharing.
- Individual food logs, meals, and weights can be deleted in the app. Delete all data removes the SQLite data, meal photos, and temporary ownership files. On Android it first attempts to remove Weight records written by Eatlog from Health Connect and reports warnings before local deletion.
- App removal is controlled by the operating system and removes app-private local storage. Copies the user exported or shared remain wherever the user placed them.

## Source evidence

- Device database and migrations: `src/db/database.ts`
- Meal-photo storage and local share-card export: `src/utils/mealPhotos.ts`, `src/utils/shareContract.json`, `src/utils/shareCards.ts`, and `src/components/share/ShareOverlay.tsx`
- Scan/Describe client and consent boundary: `src/services/foodScan.ts`, `src/services/remoteEstimateConsent.ts`, `src/context/RemoteEstimateConsentContext.tsx`
- USDA and Open Food Facts clients: `src/services/foodSearchRemote.ts`, `src/services/foodSearchEngine.ts`, and `src/hooks/useFoodSearchController.ts`
- Health Connect: `src/services/healthConnect.ts`, `src/screens/DataSyncScreens.tsx`, and `src/navigation/TabNavigator.tsx`
- Backup, restore, CSV, and reset: `src/services/dataBackup.ts`, `src/services/dataExport.ts`, and `src/services/dataReset.ts`
- Worker gateway and rate limiting: `worker/src/index.ts` and `worker/wrangler.jsonc`

## Current audit evidence

Audited source base: `51836cb` on `main`, with the consent/release-contract implementation in the working tree. The current local test suite passed 246/246 and typecheck passed; no commit, signed binary, device run, production-service call, or store submission was performed.

## Release blockers for this inventory

- **OWNER INPUT:** Insert the public developer/legal name, monitored support email, stable HTTPS privacy URL, and stable HTTPS support URL before publication.
- **OWNER INPUT:** Register Eatlog's Open Food Facts API usage and confirm the monitored contact before enabling the provider in production.
- **CREDENTIAL:** Review Google Gemini and Cloudflare production retention, account, and abuse-protection settings without exposing secrets.
- **STORE ACCOUNT:** Reconcile this inventory against the final Google Data Safety and Apple App Privacy console questionnaires.
- **PHYSICAL DEVICE:** Verify permission timing, direct Scan/Describe requests, share destinations, Health Connect behavior, and reset on the release device matrix.
