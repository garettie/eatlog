# Eatlog store policy worksheets

Drafted 2026-09-24 for the preview source. These are proposed form answers, not changes to Play Console or App Store Connect. Reconcile them with the exact signed binary, SDK behavior, provider terms, and current console questions before submission. The [route matrix](../privacy/ROUTE_MATRIX.md) supplies the code trace.

## Product and consent facts

- Eatlog is free and open source. All local features are free. An API key is optional. My key sends selected estimate content directly to Google; Eatlog does not bill that route. Google's project, region, model, quota, and billing status control its charges and data treatment.
- Eatlog Omelette is a one-time non-consumable purchase of hosted AI access, subject to 30 combined operations per rolling 24 hours and 250 per rolling 30 days. Legacy subscribers and complimentary grants retain access. New monthly sales are out of scope. The purchase price must come from the live localized store sheet.
- Hosted consent and My key consent are separate. Saving/checking a key sends the key to Google before a meal estimate, but no meal content. A selected estimate sends its photo/text. Local diary storage does not mean selected AI content stays on device.
- The app has no Eatlog account, cloud diary, ads, or third-party analytics. RevenueCat and store checks, USDA via the Worker, explicit direct Open Food Facts search, and Expo updates are other network activity.
- Android Health Connect reads/writes Weight only after the user connects it. iOS v1 has no HealthKit or Apple Health.

## Google Play Data Safety draft

Play's [Data safety instructions](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-AE) distinguish on-device processing, temporary processing, and transfers to service providers. Use the final console wording to classify each row; a declared transfer is not automatically a declared third-party sharing event.

| Data type to assess | Transfer and reason | Optionality and linkage | Final check |
| --- | --- | --- | --- |
| Photos and videos | User-selected estimate image to Google directly on My key, or via Eatlog Worker on hosted AI | Optional AI action; request can carry provider/account or installation metadata | Confirm Google/Cloudflare retention and console category |
| Other user-generated content | Description, limited re-estimate context, and food-search query to Google, Worker/USDA, or Open Food Facts as selected | Optional online action; no Eatlog account | Distinguish Google BYOK from hosted processing |
| Device or other IDs | Random installation ID to RevenueCat and Worker for entitlement, quota, and abuse controls | Generated for access checks; no ad ID | Verify SDK and Worker fields in signed binary |
| App activity and diagnostics | Worker route/status/latency and aggregate model/token/cost counts; SDK/service operational data may also be processed | No food body in Eatlog logs; no ad tracking | Inspect production logs and SDK disclosures |
| Purchases | Store and RevenueCat process product/entitlement and receipt metadata | Optional purchase, tied to installation ID | Verify store and RevenueCat declarations |
| Health and fitness | Local food/weight data stays on device except selected estimate content and user-authorized Android Health Connect Weight transfer | No Eatlog health-data backend | Complete Health Apps and Health Connect forms separately |
| Financial details, contacts, precise location, audio, messages | No such fields requested by Eatlog | No account or advertising use | Recheck merged manifest and SDK disclosures |

Data uses are app functionality, service security, and entitlement verification. Eatlog does not sell data or use cross-app tracking. HTTPS protects transport. In-app Delete all data removes local records/key/consent, but cannot erase copies the user shared, revoke a Google key, reverse a store purchase, or remove provider records. Do not claim universal provider-side deletion. The owner must save the completed console questionnaire as release evidence.

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

The isolated preview APK uses RevenueCat Test Store. Its purchase dialog can return Success without a charge or personal API key. This is the only self-service restricted-feature review path currently implemented. A production Play/App Store review build still needs a complimentary unlock that works without payment or a personal key; the current source has no hidden code redemption flow. Do not submit a production restricted-access answer that says all features are free or asks a reviewer to buy. See [review material](REVIEW_MATERIAL.md).

## Sources to recheck at submission

- [Google Gemini API terms](https://ai.google.dev/gemini-api/terms): unpaid API content may improve Google's products and may be human-reviewed; paid API projects have different terms; EEA, Switzerland, and UK have an exception. Buying Omelette does not make the user's BYOK project a paid Google project.
- [Google Gemini billing](https://ai.google.dev/gemini-api/docs/billing) and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits): Google controls charges and project/model limits.
- [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-AE) and [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/): use their current definitions and disclose SDK/partner behavior.
- `release/privacy/ROUTE_MATRIX.md`, `release/site/privacy.md`, `release/store/metadata.mjs`, and the final signed binary.
