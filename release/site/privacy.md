---
title: Eatlog Privacy Policy
publication_status: preview-draft
policy_version: 1.3-draft
last_updated: 2026-09-24
---

# Eatlog Privacy Policy

Preview draft, last updated September 24, 2026. This text is not yet the published policy. Eatlog is developed and operated by Sean Garette Gajitos. Contact [sggajitos@gmail.com](mailto:sggajitos@gmail.com).

Eatlog is a free, open-source, account-free food and weight log. Your diary lives in app-private storage on your device. Eatlog has no account system, cloud diary, advertising, or third-party analytics SDK. Optional online actions still contact the services named below.

## Data on your device

Eatlog stores the profile details you enter, targets, food and weight logs, meal details and photos, nutrition estimates, pins, adaptive review decisions, and food cache in its local database and app-private files. You can log manually and reuse saved meals without an AI key or purchase.

An app-scoped random installation token lives outside the database. Eatlog uses it for hosted-service throttling, purchase access checks, and hosted AI grants. RevenueCat uses it as an App User ID for entitlement checks. The platform store and RevenueCat process purchase, restoration, refund, renewal, and entitlement information. Eatlog stores access and usage state outside the diary database. The token, grants, usage state, and receipts are not part of Eatlog backups or CSV exports.

If you save your own Google Gemini API key, Eatlog stores it in the device credential store, backed by Android Keystore or iOS Keychain. Eatlog shows only its first and last four characters on Profile > AI estimates. A separate app-private record holds your consent and chosen AI route. The key never goes into SQLite, Eatlog backups, CSV exports, logs, or Worker requests. Saving or checking a key sends the key to Google's model-list endpoint without meal content. Removing the key erases the local credential and its consent, but does not revoke the key in your Google project. Delete all data also tries to remove the key and tells you if the credential store refuses.

## Optional AI estimates

Eatlog has two AI routes. You choose them in Profile > AI estimates when both are available. The routes have separate consent records. Turning off Eatlog-hosted estimates in Privacy withdraws hosted consent; remove your key in AI estimates to stop the direct route. Neither action deletes diary entries.

**My key** sends only the selected resized meal photo and optional title, description, or re-estimate context from your device directly to Google Gemini, using your key. Meal and component re-estimates can include the current component names and amounts and, when supplied, the selected photo. The estimate payload, key, installation token, and usage report do not go through Eatlog's Worker. The app may still contact Eatlog for purchase checks or USDA search. Google may limit, reject, or charge for your project's usage. Eatlog does not charge for My key. Google's API terms distinguish unpaid and billed usage, including how Google may use submitted content; regional terms can differ. An Eatlog purchase does not set your Google project's billing or data-treatment category. Read [Google's Gemini terms](https://ai.google.dev/gemini-api/terms), [billing guide](https://ai.google.dev/gemini-api/docs/billing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), and [available regions](https://ai.google.dev/gemini-api/docs/available-regions) before choosing this route.

Under Google's current API terms, unpaid usage can let Google use submitted content to improve products, with human review. For paid API usage, Google says it does not use prompts and responses to improve products, although abuse-monitoring retention can still apply. Google's terms give unpaid usage in the EEA, Switzerland, and the UK the paid-services data treatment. Check your Google project's terms and billing status; buying Omelette does not change them.

**Eatlog AI** is the optional hosted route included with Eatlog Omelette or verified legacy or complimentary access. After hosted consent and access checks, Eatlog sends the selected resized photo and optional title, description, or re-estimate context, plus the installation token and request identifier, through its Cloudflare Worker to Google Gemini. The Worker can retry the same model through a regional Cloudflare relay when Google refuses its first location. The Worker checks a signed grant and enforces the hosted allowance. Cloudflare handles the connecting IP address to deliver requests. The hosted route uses Eatlog's provider credential, never your saved key.

Taking a photo, choosing one, or reusing a saved meal stays local until you explicitly request an online estimate. Eatlog asks you to review every returned estimate before saving. Estimates can be wrong. Declining or withdrawing either AI route leaves manual logging and other local features usable.

## Food search and other network activity

Local history and bundled common foods search on your device. USDA FoodData Central search sends a search query, or a selected USDA food ID, through Eatlog's Worker to USDA. The Worker can cache normalized USDA responses. A full online food search can also send your query directly to Open Food Facts when you press Search; it does not query Open Food Facts for every keystroke. Open Food Facts requests identify Eatlog and its support contact. Eatlog saves a remote result in your diary only when you log it.

The app may contact RevenueCat, the platform store, and Eatlog's Worker to check or refresh purchase access, grants, and hosted usage. These checks do not include your meal photo, food diary, weight history, or Google key. They can happen even if you choose My key. App installation uses the platform store or distribution service; the bundled Expo Updates client can check its configured EAS update channel for app code updates. Those checks do not include your diary.

## Android Health Connect

On Android, you can grant Eatlog permission to read and write Weight records in Health Connect. Eatlog uses imported weights for local trends and can write weights you log. Connection state and record identifiers stay in the local database, not the Eatlog Worker. You can disconnect Eatlog or revoke access in Android settings. Eatlog does not use HealthKit or Apple Health in v1.

## Camera, files, backups, and sharing

Eatlog asks for camera access when you choose camera Scan. Photo uses the system photo picker; Restore uses the document picker. A restorable `.eatlog-backup` or supported legacy `.marco-backup` contains a database snapshot and referenced meal photos. The readable CSV export contains profile and history tables, but no photos, Google key, consent, purchase records, or Health Connect synchronization metadata. A CSV export cannot be restored.

Eatlog creates meal share images on your device and opens the system share sheet. Backup and export sharing also use the system share sheet. You choose the destination. Eatlog has no sharing backend, public link, or feed. Apps or storage providers you choose control their copies.

## Retention and deletion

You can edit or delete individual logs. Profile > Delete all data removes the local database, saved meal photos, hosted-estimate consent, temporary backup and export files, and your saved key and direct-route consent when the device credential store allows it. The app reports a key-removal failure rather than claiming success. On Android, Eatlog first attempts to remove Weight records it wrote to Health Connect and warns if it cannot confirm removal. Deleting the app removes app-private storage subject to operating-system behavior. Files you exported or shared, a Google key in your Google project, and provider-held data need separate action at their destinations.

The Worker records operational fields and aggregate token and cost counts. Its logging code excludes request bodies, images, descriptions, search queries, prompts, provider responses, raw installation tokens, token hashes, transaction IDs, grants, IP addresses, headers, and secrets. Salted hosted quota records and short-lived grants contain no food or photo content. Google, Cloudflare, RevenueCat, the platform store, USDA, Open Food Facts, and any share destination process data under their own terms. See [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/), [RevenueCat's privacy policy](https://www.revenuecat.com/privacy/), [USDA FoodData Central](https://fdc.nal.usda.gov/), and [Open Food Facts API terms](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/).

## Health information and licenses

Eatlog is for adults and general wellness. Nutrition values, targets, trends, and AI estimates can be incomplete or wrong. It is not a medical device. Review estimates and consult a qualified health professional for medical decisions.

The Eatlog app source is licensed under 0BSD. That license does not grant hosted AI service access. Open Food Facts database data uses the Open Database License, individual database contents use the Database Contents License, and product images use a Creative Commons Attribution-ShareAlike license. USDA FoodData Central is a U.S. government data source. Eatlog lists these and its bundled font and software credits in Profile > Licenses and attributions.

## Contact and changes

Contact [sggajitos@gmail.com](mailto:sggajitos@gmail.com) about this draft or a privacy request. Material changes to recipients, data sent, or purposes require updated in-app disclosures and a new published policy version. Earlier versions remain in version control.
