# Eatlog store policy worksheets

Updated 2026-09-25 for the free, bring-your-own-key release. These are the answers to enter; the consoles only change when you enter them. Recheck them if the app starts sending anything new. The [route matrix](../privacy/ROUTE_MATRIX.md) supplies the code trace.

## Product and consent facts

- Eatlog is free and open source. All local features are free. An API key is optional. My key sends selected estimate content directly to Google; Eatlog does not bill that route. Google's project, region, model, quota, and billing status control its charges and data treatment.
- Eatlog Omelette is a one-time non-consumable purchase of hosted AI access, subject to 30 combined operations per rolling 24 hours and 250 per rolling 30 days. Legacy subscribers and complimentary grants retain access. New monthly sales are out of scope. The purchase price must come from the live localized store sheet.
- Hosted consent and My key consent are separate. Saving/checking a key sends the key to Google before a meal estimate, but no meal content. A selected estimate sends its photo/text. Local diary storage does not mean selected AI content stays on device.
- The app has no Eatlog account, cloud diary, ads, or third-party analytics. RevenueCat and store checks, USDA via the Worker, explicit direct Open Food Facts search, and Expo updates are other network activity.
- Android Health Connect reads/writes Weight only after the user connects it. iOS v1 has no HealthKit or Apple Health.

## Google Play Data Safety answers

Play counts data as collected when the app sends it off the phone, including when an SDK sends it or it goes straight to a third party such as Google. Transfers to a service provider working for you, or ones the user starts and expects, are not "sharing" ([Play definitions](https://support.google.com/googleplay/android-developer/answer/10787469)). So everything below is collected, nothing is shared, and nothing is marked ephemeral, because Google and USDA can keep what they receive.

Overview questions:

- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes** (HTTPS only)
- Which account creation methods does your app support? **My app does not allow users to create an account**
- Data deletion: the app has no account, so no deletion URL is required. Delete all data in Profile erases the phone's copy; the Support page covers email requests.

Data types:

| Play category → type | Collected | Shared | Required or optional | Purposes | Why |
| --- | --- | --- | --- | --- | --- |
| Photos and videos → Photos | Yes | No | Optional | App functionality | A meal photo the user sends for an estimate goes to Google, directly with My key or through the Worker with Eatlog AI |
| App activity → Other user-generated content | Yes | No | Optional | App functionality | Meal descriptions and re-estimate notes sent for an estimate |
| App activity → In-app search history | Yes | No | Optional | App functionality | Food search text goes to USDA through the Worker, and to Open Food Facts on a full search |
| Financial info → Purchase history | Yes | No | Optional | App functionality | Google Play and the RevenueCat SDK handle the Omelette purchase and restores |
| Device or other IDs | Yes | No | Required | App functionality; Fraud prevention, security, and compliance | A random install ID is the RevenueCat user ID and the Worker's quota and abuse key; it's sent even with no purchase |

Leave everything else unchecked:

- Health and fitness: weight syncs with Health Connect on the phone and never leaves it. Food text and photos sent for estimates are already declared above.
- Location, personal info, contacts, messages, audio, files, calendar, web browsing: never requested.
- App info and performance: the app sends no crash logs or diagnostics. The Worker logs only its own status and latency.
- Advertising ID: not used. No ads, no analytics SDK, no tracking.

Eatlog does not sell data. Delete all data cannot erase copies the user shared, revoke a Google key, reverse a store purchase, or remove what providers already hold, so never claim provider-side deletion.

## Apple App Privacy draft

Apple's [App Privacy Details guide](https://developer.apple.com/app-store/app-privacy-details/) defines collection as off-device transmission retained beyond real-time service. It requires third-party partner practices and has narrow optional-disclosure criteria. Do not answer "No data collected" merely because SQLite stays local.

| Data type to evaluate | Reason | Linkage and tracking review |
| --- | --- | --- |
| Photos or Videos | Selected AI image reaches Google, directly or via Worker | No Eatlog account; review provider retention and Google project terms |
| Other User Content | Description, clarification text, and remote food-search query | Check whether Google API key/project or installation ID links the request |
| Identifiers | Installation ID used as RevenueCat App User ID and Worker quota identity | Not advertising ID; verify the SDK's current privacy details |
| Purchases | Store/RevenueCat entitlement and transaction metadata | Linked to installation ID; no Eatlog account |
| Diagnostics and usage | Worker operational data and SDK/service diagnostics | Confirm actual retention and linkage |
| Health & Fitness | iOS local nutrition/weight data has no HealthKit route | Selected food text may still be Other User Content; review final form categories |

There is no Eatlog advertising or cross-company tracking. Saving a share image uses add-only Photos permission; system sharing goes only to the destination the user chooses. The owner must finish and publish App Privacy answers in App Store Connect against the final binary.

## Health, age, and export forms

Google Health Apps: Nutrition and Weight Management; general wellness only. Store description includes the required non-medical-device disclaimer. Health Connect requests only Read Weight and Write Weight, with optional connection and local history. Inspect the merged Android manifest and test permission, import, write, revoke, and reset on physical devices. Do not claim Apple Health support.

The app is aimed at adults and has no public user content, messaging, ads, gambling, or clinical function. Let each store calculate its final age rating from its current questionnaire.

Eatlog uses platform HTTPS/TLS and no proprietary cryptography. Recheck the final iOS binary and App Store Connect export-compliance questions; `ios.config.usesNonExemptEncryption` is currently false.

## Reviewer access

Play review uses license testing. List the reviewer Google accounts as license testers in Play Console, put their email and password in App access, and paste `reviewerNotes.google` from `metadata.mjs` as the instructions. License testers buy Omelette without being charged and need no Google key. There is no hidden unlock in the app and none is needed. The Test Store "Success" button only exists in the preview build, so never point a reviewer at it.

## Sources to recheck at submission

- [Google Gemini API terms](https://ai.google.dev/gemini-api/terms): unpaid API content may improve Google's products and may be human-reviewed; paid API projects have different terms; EEA, Switzerland, and UK have an exception. Buying Omelette does not make the user's BYOK project a paid Google project.
- [Google Gemini billing](https://ai.google.dev/gemini-api/docs/billing) and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits): Google controls charges and project/model limits.
- [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-AE) and [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/): use their current definitions and disclose SDK/partner behavior.
- `release/privacy/ROUTE_MATRIX.md`, `release/site/privacy.md`, `release/store/metadata.mjs`, and the final signed binary.
