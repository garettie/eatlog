---
title: Eatlog Support
publication_status: published
last_updated: 2026-09-24
---

# Eatlog Support

Last updated September 24, 2026. Email [sggajitos@gmail.com](mailto:sggajitos@gmail.com) for support.

## Before contacting support

- Open Profile > About and note the app version, build, platform, and database schema.
- Describe the action that failed and the exact message Eatlog showed.
- Do not send a backup, meal photo, food description, Health Connect record, Gemini key, or other personal data unless support asks for a safe diagnostic step.
- Never send store passwords, one-time codes, receipts, transaction IDs, or API secrets.

## AI estimates or food search are unavailable

Manual logging, saved meals, targets, and local analytics still work. First check your connection. For My key, open Profile > AI estimates and check that your key is saved, the route is My key, and your Google project can use Gemini in your region. The key check sends your key to Google without meal data. An invalid or unreadable key needs replacement; removing it from Eatlog does not revoke it at Google. Google may enforce its own quota or billing rules.

For Eatlog AI, check that Profile > AI estimates selects Eatlog AI and hosted consent is on in Profile > Privacy. Omelette, valid legacy, or complimentary access is required. The hosted allowance is 30 combined operations per rolling 24 hours and 250 per rolling 30 days. If access or the provider is unavailable, try later. Do not buy again to fix a network error.

USDA search runs through Eatlog's Worker. A full food search can also contact Open Food Facts when you press Search. Remote food data and AI estimates can be wrong; review before saving.

## Purchase or restore problem

Open Profile > Plan and refresh access, then use Restore purchases with the same platform and store account used for the purchase. A canceled purchase creates no entitlement. A one-time Omelette purchase has no subscription management page. Existing subscription customers can manage their subscription through the store. Copy the Support ID from Plan when contacting support. Do not send receipts or store credentials.

RevenueCat or Worker outages do not block local logging. If hosted access cannot be verified, retry later. Local diary and adaptive history remain on your phone.

## Camera, photos, and Health Connect

Choose camera Scan or Photo again to let the operating system ask for access. If the prompt no longer appears, check Eatlog's device permissions. Eatlog does not request microphone access.

Health Connect is Android-only. Open Profile > Health Connect, confirm Weight read and write permission, then retry sync. If you revoked permission in Android settings, connect again. Eatlog does not use HealthKit or Apple Health in v1.

## Backup, restore, and export

Open Profile > Backup and restore > Create backup, then choose a destination in the system share sheet. Keep the `.eatlog-backup` archive private. Eatlog can also restore a supported legacy `.marco-backup`.

Choose Restore backup in the same screen and select the archive. Eatlog checks its manifest, files, hashes, record counts, photos, database integrity, and schema before replacement. Keep the original until you verify the restored diary. Backup and restore do not move your Gemini key, route consent, installation token, or store entitlement to another device.

Profile > Export data creates a readable ZIP of CSV files. It excludes meal photos, Gemini keys, route consent, store data, and Health Connect sync metadata. A CSV export cannot be restored.

## Delete data or remove your key

Remove key in Profile > AI estimates deletes the key and its direct-route consent from this device. It does not revoke the key at Google or delete existing meals. Turn off hosted estimates in Profile > Privacy to withdraw the separate Eatlog AI consent. These actions do not remove earlier data held by a provider.

Delete individual logs from their edit screens. Profile > Delete all data removes the local database, meal photos, hosted consent, temporary files, and the saved Gemini key and its consent when the credential store allows it. The app reports if key removal fails. On Android, Eatlog attempts to remove Weight records it wrote to Health Connect and warns if it cannot confirm removal. Previously shared or exported copies remain at their destinations.

## Contact and deletion requests

Email [sggajitos@gmail.com](mailto:sggajitos@gmail.com) with your app version, build, platform, database schema, action, and exact error message. Eatlog keeps no cloud copy of your diary, so Delete all data is the direct way to erase it. If you cannot use the app, email with the subject Eatlog data deletion request and explain what failed. Support can guide device steps, but cannot remotely erase app-private data on your phone. Provider-held copies, files you exported, and support email follow their respective retention rules.
