# Eatlog data inventory

Preview source audit, 2026-09-24. Use the [route matrix](ROUTE_MATRIX.md) for each feature's access, payload, recipient, credential, consent, storage, deletion, limit, and UI location. This is source evidence, not a claim that a revised policy or store form is live.

## On the device

| Data | Storage | Control and export |
| --- | --- | --- |
| Profile, targets, meals, foods, weights, adaptive reviews, pins, food cache | App-private SQLite | Edit/delete in app; restorable backup and selected readable CSV; Delete all data removes local database |
| Meal photos | App-private files with SQLite references | Remove meal/photo or Delete all data; referenced photos enter a restorable backup, not CSV |
| Personal Google Gemini key | Platform SecureStore, device-only credential setting | Profile → AI estimates shows first/last four characters only; Replace/Remove key; excluded from database, backups, CSV, logs, and Worker requests |
| My key consent and route | Separate app-private record beside the credential, not in SecureStore | Removing key removes its record. A key without a current record after restore/reinstall is not used |
| Hosted consent | Versioned app-private record outside SQLite | Profile → Privacy withdraws hosted consent; Delete all data removes the local record; backups/CSV exclude it |
| Installation ID | Random app-scoped token in app-private storage outside SQLite | Used by Worker and RevenueCat, not a name or advertising ID; excluded from backups/CSV. Current Delete all data does not erase it or remote quota records; app removal regenerates it |
| Entitlement/grant and online search cache | RevenueCat SDK cache and app process memory | Excluded from backups/CSV; grant and search memory end with process, while store/provider records follow their own terms |
| Health Connect sync state | Android-only SQLite rows | Device-specific sync authority is cleared on restore; disconnect/revoke in Android, reset attempts cleanup of Eatlog-written Weight records |

SQLite tables include `profile`, `weight_logs`, `meals`, `food_logs`, `food_cache`, `pinned_foods`, `daily_targets`, `adaptive_reviews`, `health_connect_state`, `health_connect_weight_exports`, and `adaptive_intake_day_confirmations`.

## What leaves the device

The user can log manually and reuse saved meals without a key, purchase, or estimate upload. A camera/gallery selection stays local until the user chooses an estimate. My key sends the chosen resized photo/title or text and limited re-estimate context directly to Google with the user's key. Before saving a key, validation sends the key to Google's model-list endpoint, without a meal. The estimate payload on My key does not pass through Eatlog.

Eatlog AI sends the chosen content, app installation ID, request ID, and optional signed grant to the Worker. It forwards estimate content to Google and may retry a location refusal through the regional GeminiRelay Durable Object. The Worker stores salted quota subjects, counters, request identity, entitlement cache, and webhook IDs, without food content. Current hosted limits are 30 combined operations per rolling 24 hours and 250 per rolling 30 days; five rejected-food refunds can occur in a rolling day. The user must accept hosted consent separately. A saved My key no longer accepts it automatically. Existing version-1 hosted decisions remain reusable because the Worker-to-Gemini recipient and selected-payload disclosure have not materially changed; a future recipient or payload change needs consent-version review.

USDA type-ahead/full-search text and selected numeric USDA food ID go via the Worker with installation ID; the Worker uses its own USDA key. Explicit full search also sends rewritten text directly to Open Food Facts, using an Eatlog User-Agent with the monitored support contact. Food source results are cached briefly in app memory; only logged foods enter SQLite.

RevenueCat uses the random installation ID as App User ID to check purchase, restore, subscription, lifetime, or complimentary access. Stores and RevenueCat process purchase/entitlement data. The Worker receives access refresh and usage requests. These contacts can occur without a meal estimate. Expo Updates can also request update metadata; no diary payload is built into that request. Eatlog has no account, cloud diary, ad SDK, or third-party analytics in source.

On Android, Health Connect reads Weight into local history and receives only user-authorized Weight records written by Eatlog. It is separate from the Worker. iOS v1 has no HealthKit or Apple Health integration.

## Ownership actions

- A restorable `.eatlog-backup` or supported legacy `.marco-backup` contains `manifest.json`, a SQLite snapshot, and referenced photos. Restore validates the archive before replacement and uses a safety copy for rollback. It does not restore the key, consent, installation ID, entitlements, grants, quota, or device-specific Health Connect sync authority.
- CSV export is a zipped, readable set of profile, food, weight, target, and adaptive history. It has no photos, credentials, or entitlement data and cannot be restored.
- A meal share card is rendered locally as a 1080 by 1920 PNG in temporary cache. Photo, Framed, and Nutrition styles keep the Eatlog mark. Save image places a copy in Photos/Gallery; Share hands it to the operating-system destination the user chooses. Eatlog has no sharing server.
- Delete all data removes local SQLite data, meal photos, temporary ownership files, hosted consent, and the saved personal key/route. Android attempts cleanup of Eatlog-written Health Connect records first. It does not revoke the Google key at Google, cancel/refund a store purchase, erase provider records, or retrieve files already shared elsewhere. If secure key removal fails, the app reports that the key remains.

## Provider and store disclosure facts

Google controls My key quota, availability, billing, and processing. [Gemini API terms](https://ai.google.dev/gemini-api/terms) say unpaid API content can be used to improve Google products and may be human-reviewed. A billed Google Cloud API project has different treatment; EEA, Switzerland, and UK have an exception for unpaid services. A purchase from Eatlog is not evidence that a user's Google project is billed. [Billing](https://ai.google.dev/gemini-api/docs/billing) and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) are project/model dependent.

Google Play [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-AE) and Apple [App Privacy](https://developer.apple.com/app-store/app-privacy-details/) use different definitions for collection and sharing. The draft [policy worksheets](../store/POLICY_WORKSHEETS.md) identify candidate categories, but the owner must review the final SDKs, signed binary, provider contracts, and console questions before submitting either form.

Evidence paths: `src/db/database.ts`, `src/services/foodScan.ts`, `foodEstimateDirect.ts`, `foodEstimateGemini.ts`, `userApiKey.ts`, `remoteEstimateConsent.ts`, `foodSearchRemote.ts`, `billing.ts`, `subscriptionApi.ts`, `dataBackup.ts`, `dataExport.ts`, `dataReset.ts`, `healthConnect.ts`, `src/utils/shareCards.ts`, `worker/src/index.ts`, `worker/src/subscriptions.ts`, and `worker/src/subscriptionDurableObject.ts`.
