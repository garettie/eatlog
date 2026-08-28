---
title: Eatlog Privacy Policy
publication_status: published
policy_version: 1.1
effective_date: 2026-08-28
last_updated: 2026-08-28
---

# Eatlog Privacy Policy

Eatlog is developed and operated by Sean Garette Gajitos. This Privacy Policy is effective August 28, 2026. Contact: sggajitos@gmail.com.

Eatlog is an account-free nutrition and weight log. It stores your profile, targets, food history, weight history, adaptive reviews, pins, estimate cache, and saved meal photos in app-private storage on your device. Eatlog has no account, authentication system, cloud database, advertising, or third-party analytics SDK.

## Data stored on your device

Eatlog stores the information you enter during setup and use, including your display name, birth date, sex, height, activity level, nutrition goal, target weight, preferred units, food logs, meal details, nutrition estimates, targets, weight records, and review decisions. Saved meal photos are stored as app-private files. Recent online search results may stay briefly in memory.

Eatlog also stores an app-scoped random installation token outside its database. The token identifies one installation for Pugo's rolling AI allowance, request throttling, and RevenueCat access checks. This file is not included in an Eatlog backup or CSV export.

RevenueCat uses that token as its App User ID to check subscription, lifetime, or complimentary access. RevenueCat and the platform store process product, purchase, renewal, refund, and entitlement metadata. Eatlog keeps entitlement, signed grants, and Pugo or paid quota state outside SQLite, backups, and CSV exports.

If the build has online meal estimates, Eatlog stores your current Gemini-estimate consent decision in a separate app-private file outside SQLite. The decision is not included in an Eatlog backup or CSV export. Delete all data clears it.

## When Eatlog sends data online

Eatlog uses online services only for the actions described below.

### Scan, Describe, and re-estimation

Before an allowed request, Eatlog shows a short choice: you can select Okay to enable online meal estimates or Not now to keep using Eatlog without them. Not now does not disable manual logging, local history, USDA/Open Food Facts search, weight tracking, Analytics, backup, export, or sharing. A later explicit AI action can show the choice again. Pugo allows five initial photo or description estimates per rolling 24 hours. Meal and component re-estimates require Manok, Itik, or complimentary access and are denied before consent or private-content construction. Every allowed estimate still requires the current accepted consent version; Profile → Privacy lets you turn online estimates off.

Taking or choosing a meal photo and reusing a past meal stays on the device. After access and consent checks, choosing Estimate as new sends the selected, resized photo and any optional meal title through the Eatlog Cloudflare Worker to Google Gemini; Describe and allowed re-estimates send the meal text you enter. The request includes the app-scoped installation token. Cloudflare processes the connecting IP address and token to deliver the request and apply access-specific limits. Eatlog requires you to review the result before saving it.

### USDA FoodData Central

Eatlog can send a food search query or selected USDA food ID through the Eatlog Worker to USDA FoodData Central. The Worker may cache normalized USDA responses. Eatlog stores a USDA result in your history only when you log it.

### Open Food Facts

When you explicitly submit a full food search, Eatlog can send the search text directly to Open Food Facts. Open Food Facts does not run while you type. Requests identify the Eatlog app and its monitored support contact, as required by Open Food Facts. The volunteer-contributed database can be incomplete or inaccurate.

Eatlog does not send your nutrition logs, weight history, profile, targets, saved meal photos, backups, or exports to its Worker unless a specific Scan, Describe, re-estimation, or food-search action needs the selected content described above.

## Purchase processing

Eatlog is free to download. Pugo local logging and its five-estimate rolling allowance remain usable without a purchase. Google Play or Apple's App Store processes the monthly Manok subscription and one-time Itik purchase. RevenueCat verifies the resulting entitlement for the app and Eatlog Worker. Eatlog does not receive your card number, bank details, store password, or one-time codes. Complimentary access creates no store subscription.

Short-lived signed AI grants and salted Pugo or paid quota records enforce access-specific limits. They contain no food, photo, weight, or profile content and remain outside SQLite, backups, and CSV exports. Expiry, refund, or revocation removes paid features and returns confirmed installations to Pugo without deleting local food, weight, target, or adaptive history.

## Android Health Connect

Health Connect is available only on Android. If you choose to connect it, Eatlog requests permission to read and write Weight records only. Eatlog can import Weight records for local trends and write weights you enter in Eatlog. Connection state and record identifiers stay in the local database and are not sent to Eatlog's Worker. You can disconnect Eatlog or revoke access in Android settings.

Eatlog does not use HealthKit or Apple Health in v1.

## Camera, photos, files, and sharing

Eatlog asks for camera access only when you choose camera Scan. It opens the gallery/system photo picker only when you choose Photo. It opens the document picker only when you choose Restore.

When you share a meal card, Eatlog renders one 1080 by 1920 PNG on your device. Save image asks only for the platform access needed to add that image to Photos or Gallery. On current Android versions this does not request photo-read access; on iOS it uses add-only access. Share requests no Photos permission and opens the system share menu so you choose the destination. Eatlog deletes its temporary generated files after the attempt and has no sharing backend, public link, social feed, or share tracking. A destination app or storage provider you choose controls its copy.

A restorable Eatlog backup contains a database snapshot and referenced meal photos. A human-readable CSV export contains profile and history tables but no photos or Health Connect synchronization metadata. CSV exports are not restorable. Backup and Export also open the system share sheet only when you choose those actions, and the destination app or storage provider you choose controls its copy.

## Retention and deletion

You can edit and delete individual logs in Eatlog. Delete all data removes the local database, meal photos, remote-estimate consent, and temporary backup/export files. On Android, Eatlog first attempts to remove Weight records it wrote to Health Connect and warns you if it cannot confirm that removal. Deleting the app removes its app-private storage, subject to operating-system behavior. Files you exported or shared remain in the locations you chose.

The Eatlog Worker is designed to log operational fields and aggregate token/cost counts only. It must not log request bodies, images, descriptions, search queries, prompts, provider responses, raw installation tokens, token hashes, transaction IDs, grants, IP addresses, headers, or secrets. Google, Cloudflare, RevenueCat, the platform store, USDA, Open Food Facts, and any share destination process data under their own terms and policies.

Provider information: [Google Gemini](https://ai.google.dev/gemini-api/terms), [Cloudflare](https://www.cloudflare.com/privacypolicy/), [RevenueCat](https://www.revenuecat.com/privacy/), [USDA FoodData Central](https://fdc.nal.usda.gov/), and [Open Food Facts API and reuse terms](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/).

## Children and health information

Eatlog is intended for adults and general wellness use. Its nutrition and weight values are estimates. Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Seek advice from a qualified health professional for health decisions.

## Data sources and licenses

Open Food Facts database data is available under the Open Database License; individual database contents use the Database Contents License; product images use a Creative Commons Attribution-ShareAlike license. USDA FoodData Central is a U.S. government data source. Eatlog shows attributions for Open Food Facts, USDA, the bundled Onest font, third-party software, and Eatlog's 0BSD license in Profile → Licenses and attributions.

## Contact

Contact Sean Garette Gajitos at [sggajitos@gmail.com](mailto:sggajitos@gmail.com) about this policy or a privacy request.

## Policy changes

Material changes to what Eatlog sends, who receives it, or why require a new policy date and updated in-app privacy copy. Older policy versions remain in version control.
