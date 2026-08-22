---
title: Eatlog Support
publication_status: blocked-on-owner-input
last_updated: 2026-08-10
---

# Eatlog Support

This draft is not a live support page. Before publication, the owner must add the monitored support email, state the expected response window, and publish it at the configured HTTPS support URL. The owner-input record is `release/OWNER_INPUTS.md`.

## Before contacting support

- Open Profile → About and note the app version, build, platform, and database schema.
- Describe the exact action that failed and the error shown by Eatlog.
- Do not send a backup, meal photo, food description, Health Connect record, API credential, or other personal data unless support explicitly requests a safe diagnostic step.
- Never send store passwords, one-time codes, recovery keys, or API secrets.

## Online estimates or food search are unavailable

Check that the device has an internet connection, then retry. Scan and Describe use Eatlog’s online estimation service. USDA search also runs online. Open Food Facts runs only after you press Search and requires a release build with provider contact details. Manual logging, personal history, targets, and local analytics remain available without these services.

Review each estimate before saving it. Estimates and community food data can be incomplete or wrong.

## Plan, purchase, or restore problem

Open Profile → Plan, refresh access, then use Restore purchases with the same platform and store account that made the purchase. Manok management opens the store subscription screen; Itik and complimentary access do not create a managed subscription. Copy the Support ID from this screen when contacting support. Do not send receipts, transaction IDs, store credentials, or screenshots containing account information.

RevenueCat or Worker outages must not block Eatlog Pugo startup or local logging. If paid access cannot be verified, retry later; local food, weight, target, and adaptive history remains on the device.

## Camera or photo access is unavailable

Choose camera Scan or Photo again so Eatlog can request access at the point of use. If the operating system no longer offers the prompt, open the device's app-permission settings and allow the relevant access. Eatlog does not request microphone access.

## Health Connect does not sync

Health Connect is Android-only. Open Profile → Health Connect, confirm that Weight read and write access is granted, then retry the sync. If you revoked access in Android settings, connect again from Eatlog. Eatlog does not use HealthKit or Apple Health in v1.

## Create a backup

Open Profile → Backup and restore → Create backup, then choose a destination in the system share sheet. Keep the `.eatlog-backup` file private. A supported legacy `.marco-backup` archive can also be restored. A CSV export is readable but cannot be restored.

## Restore a backup

Open Profile → Backup and restore → Restore backup and choose the archive. Eatlog inspects the manifest, files, hashes, record counts, photos, database integrity, and schema before replacement. If validation fails, the live database is not supposed to change. Keep the original archive until you verify the restored profile, meals, weights, targets, and photos.

## Export readable data

Open Profile → Export data to create a zipped set of CSV files. The export excludes meal photos and Health Connect synchronization metadata. It is not a restorable backup.

## Delete data

Delete individual logs from their edit screens. To erase app data, open Profile → Delete all data and complete both confirmations. On Android, Eatlog first attempts to remove Weight records it wrote to Health Connect and reports any warning before local deletion. Copies you previously exported or shared are not deleted from their destinations.

## Contact

Publication is blocked until the owner supplies the monitored support email and response expectation. Do not publish this draft with this notice still present.
