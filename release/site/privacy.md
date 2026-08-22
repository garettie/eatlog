---
title: Eatlog Privacy Policy
publication_status: blocked-on-owner-input
policy_version: 1.0-draft
last_updated: 2026-08-11
---

# Eatlog Privacy Policy

This draft is not a live public policy. Before publication, the owner must add the public developer/legal name and monitored support contact listed in `release/OWNER_INPUTS.md`, confirm provider settings, and publish this page at the configured HTTPS privacy URL.

Eatlog is an account-free nutrition and weight log. It stores your profile, targets, food history, weight history, adaptive reviews, pins, estimate cache, and saved meal photos in app-private storage on your device. Eatlog has no account, authentication system, cloud database, advertising, or third-party analytics SDK.

## Data stored on your device

Eatlog stores the information you enter during setup and use, including your display name, birth date, sex, height, activity level, nutrition goal, target weight, preferred units, food logs, meal details, nutrition estimates, targets, weight records, and review decisions. Saved meal photos are stored as app-private files. Recent online search results may stay briefly in memory.

Eatlog also stores an app-scoped random installation token outside its database to limit abuse of the online service. This file is not included in an Eatlog backup or CSV export.

If the build has online meal estimates, Eatlog stores your current Gemini-estimate consent decision in a separate app-private file outside SQLite. The decision is not included in an Eatlog backup or CSV export. Delete all data clears it.

## When Eatlog sends data online

Eatlog uses online services only for the actions described below.

### Scan, Describe, and re-estimation

Before the first request, Eatlog shows a short choice: you can select Okay to enable online meal estimates or Not now to keep using Eatlog without them. Not now does not disable manual logging, local history, USDA/Open Food Facts search, weight tracking, Analytics, backup, export, or sharing. A later explicit AI action can show the choice again. When enabled, Scan, Describe, clarification, and re-estimation require the current accepted consent version; Profile → Privacy lets you turn online estimates off.

Taking or choosing a meal photo and reusing a past meal stays on the device. After consent, choosing Estimate as new sends the selected, resized photo and any optional meal title through the Eatlog Cloudflare Worker to Google Gemini; Describe and re-estimation send the meal text you enter. The request includes an app-scoped installation token. Cloudflare processes the connecting IP address and token to deliver the request and apply rate limits. Eatlog requires you to review the result before saving it.

### USDA FoodData Central

Eatlog can send a food search query or selected USDA food ID through the Eatlog Worker to USDA FoodData Central. The Worker may cache normalized USDA responses. Eatlog stores a USDA result in your history only when you log it.

### Open Food Facts

When you explicitly submit a full food search, Eatlog can send the search text directly to Open Food Facts. Open Food Facts does not run while you type. Requests identify the Eatlog app and its monitored support contact, as required by Open Food Facts. The volunteer-contributed database can be incomplete or inaccurate.

Eatlog does not send your nutrition logs, weight history, profile, targets, saved meal photos, backups, or exports to its Worker unless a specific Scan, Describe, re-estimation, or food-search action needs the selected content described above.

## Purchase processing

Google Play or Apple's App Store processes the one-time upfront purchase. Eatlog has no receipt server and does not receive your card number, bank details, or store-account credentials. The store handles its own purchase records under its policy.

## Android Health Connect

Health Connect is available only on Android. If you choose to connect it, Eatlog requests permission to read and write Weight records only. Eatlog can import Weight records for local trends and write weights you enter in Eatlog. Connection state and record identifiers stay in the local database and are not sent to Eatlog's Worker. You can disconnect Eatlog or revoke access in Android settings.

Eatlog does not use HealthKit or Apple Health in v1.

## Camera, photos, files, and sharing

Eatlog asks for camera access only when you choose camera Scan. It opens the gallery/system photo picker only when you choose Photo. It opens the document picker only when you choose Restore.

When you share a meal card, Eatlog renders one 1080 by 1920 PNG on your device. Save image asks only for the platform access needed to add that image to Photos or Gallery. On current Android versions this does not request photo-read access; on iOS it uses add-only access. Share requests no Photos permission and opens the system share menu so you choose the destination. Eatlog deletes its temporary generated files after the attempt and has no sharing backend, public link, social feed, or share tracking. A destination app or storage provider you choose controls its copy.

A restorable Eatlog backup contains a database snapshot and referenced meal photos. A human-readable CSV export contains profile and history tables but no photos or Health Connect synchronization metadata. CSV exports are not restorable. Backup and Export also open the system share sheet only when you choose those actions, and the destination app or storage provider you choose controls its copy.

## Retention and deletion

You can edit and delete individual logs in Eatlog. Delete all data removes the local database, meal photos, remote-estimate consent, and temporary backup/export files. On Android, Eatlog first attempts to remove Weight records it wrote to Health Connect and warns you if it cannot confirm that removal. Deleting the app removes its app-private storage, subject to operating-system behavior. Files you exported or shared remain in the locations you chose.

The Eatlog Worker is designed to log operational fields only. It must not log request bodies, images, descriptions, search queries, prompts, provider responses, raw installation tokens, token hashes, IP addresses, headers, or secrets. Google, Cloudflare, USDA, Open Food Facts, and any share destination process data under their own terms and policies.

Provider information: [Google Gemini](https://ai.google.dev/gemini-api/terms), [Cloudflare](https://www.cloudflare.com/privacypolicy/), [USDA FoodData Central](https://fdc.nal.usda.gov/), and [Open Food Facts API and reuse terms](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/).

## Children and health information

Eatlog is intended for adults and general wellness use. Its nutrition and weight values are estimates. Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Seek advice from a qualified health professional for health decisions.

## Data sources and licenses

Open Food Facts database data is available under the Open Database License; individual database contents use the Database Contents License; product images use a Creative Commons Attribution-ShareAlike license. USDA FoodData Central is a U.S. government data source. Eatlog shows attributions for Open Food Facts, USDA, the bundled Onest font, third-party software, and Eatlog's 0BSD license in Profile → Licenses and attributions.

## Contact

Publication is blocked until the owner supplies a monitored support contact and stable HTTPS support page. Do not publish this draft with this notice still present.

## Policy changes

Material changes to what Eatlog sends, who receives it, or why require a new policy date and updated in-app privacy copy. Older release copies remain in version control. The final public page must tell users how to contact the developer about a change.
