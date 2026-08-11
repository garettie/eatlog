# Eatlog store policy worksheets

Updated: 2026-08-11

These are source answers, not submitted console records. Reconcile them against the final binaries, provider contracts, and current store forms. Fields that require an account or owner decision remain labeled.

## Fixed product facts

- Eatlog is a PHP 299 one-time upfront purchase in the Philippines.
- No subscription, in-app purchase, receipt server, paywall, account, authentication, cloud database, ads, or third-party analytics.
- Android ships first. Android and iOS purchases are separate.
- Data is local-first. Online actions are Scan, Describe/re-estimation, USDA search/detail, and explicit Open Food Facts full search.
- Health Connect is Android-only and limited to Weight read/write. HealthKit and Apple Health are absent from v1.
- Adults; general wellness; nutrition and weight values are estimates.

## Google Play Data Safety draft

Use the conservative answers below until the production provider-contract review proves a narrower answer.

| Form area | Draft answer | Purpose | Linkage/tracking | Status |
| --- | --- | --- | --- | --- |
| Photos and videos | Collected when the user chooses Scan | App functionality | Not used for tracking; no account linkage | Verify Gemini/Cloudflare retention in production console |
| Other user-generated content | Collected for Describe/re-estimation and food-search text | App functionality | Not used for tracking; no account linkage | Verify provider retention |
| Device or other IDs | App-scoped random installation token sent to Eatlog Worker | Fraud prevention, security, and app functionality | Not advertising ID; not used for tracking | Confirm final Google category mapping |
| Health and fitness | Weight/nutrition data stays in app-private storage; Android Weight crosses only to Health Connect at user request | App functionality | Not sent to Eatlog backend; not tracking | Confirm Health Connect declaration interaction |
| App activity | Operational route/status/latency fields only; no body/query/prompt/response logs | Analytics for service reliability and security | Aggregate operational use; not tracking | Verify deployed Worker logs |
| Personal info, contacts, location, financial info, messages, audio, files/documents, calendar | Not collected by Eatlog | N/A | N/A | Recheck final binary |

Additional draft answers:

- Data is encrypted in transit with HTTPS.
- Users can delete local data in the app without an account. Provider-side deletion rights and retention must be described from the final contracts; do not promise remote deletion without evidence.
- Data is not sold and is not used for advertising or cross-app tracking.
- Service-provider processing by Cloudflare, Google, USDA, and Open Food Facts must be classified using the current console definitions at submission.
- **STORE ACCOUNT:** Complete and save the final Data Safety questionnaire from the production app record.
- **CREDENTIAL:** Confirm production Gemini and Cloudflare data handling, retention, and logging settings.

## Google Health Apps declaration draft

- App category: Nutrition and Weight Management.
- Core purpose: help adults log food and weight, review nutrition estimates, see weight trends, and choose whether to apply target suggestions.
- Medical-device status: not a medical device; no diagnosis, treatment, cure, or prevention claim.
- Required store disclaimer source: “Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition.”
- Supporting caution: users should consult a qualified health professional for health decisions.
- No clinical workflow, provider messaging, emergency function, medication function, disease management, or regulated-device claim.
- **STORE ACCOUNT:** Complete the declaration and reconcile categories with the current Play form.

## Health Connect declaration and justification

| Permission | User-facing function | Minimum access justification |
| --- | --- | --- |
| Read Weight | Import user-authorized Weight records into the local Eatlog weight history and trend | Weight only; initiated after the user opens Health Connect and grants access |
| Write Weight | Export weights entered in Eatlog so the user can use them in Health Connect | Weight only; records are tracked so Eatlog can update/delete the records it wrote |

Suggested review explanation:

> Eatlog is an account-free nutrition and weight log. Health Connect is optional and Android-only. After the user opens Profile → Health Connect and grants access, Eatlog reads Weight records for its local history and trend and writes only weights entered in Eatlog. Eatlog does not request other health data types and does not send Health Connect data to its Worker. Users can disconnect, revoke access in Android settings, or delete Eatlog-written records through Eatlog's reset flow.

Evidence required:

- Generated manifest with only Weight read/write permissions and the Android 13 rationale/Android 14 usage activity wiring.
- Point-of-use screenshots from API 26/current Android and a Health Connect-capable physical device.
- **STORE ACCOUNT:** Health Connect declaration and review submission.
- **PHYSICAL DEVICE:** End-to-end permission, import, export, disconnect, and delete verification.

## Apple App Privacy draft

Conservative labels for the iOS binary:

| Data type | Collected | Purpose | Linked to identity | Tracking |
| --- | --- | --- | --- | --- |
| Photos or Videos | Yes, only for user-selected Scan | App Functionality | No account; classify as not linked after contract review | No |
| Other User Content | Yes, meal descriptions and submitted food searches | App Functionality | No account; classify as not linked after contract review | No |
| Device ID or Other Data | App-scoped random installation token and network IP used for rate limiting | App Functionality; Fraud Prevention/Security | No account; confirm Apple's current category definitions | No |
| Health & Fitness | Local nutrition and weight data does not leave the iOS app; no HealthKit | Not collected off device | N/A | No |
| Purchases | Store processes the upfront purchase; app has no receipt server or entitlement account | Not collected by developer | N/A | No |
| Diagnostics | Worker keeps restricted operational route/status/latency fields | App Functionality | Not linked | No |

- No third-party advertising or cross-company tracking.
- No precise/coarse location, contacts, audio, messages, browsing history, payment information, or account contact information.
- **CREDENTIAL:** Verify Google/Cloudflare processing and retention before final labels.
- **STORE ACCOUNT:** Complete the current App Privacy questionnaire and save evidence.

## Age-rating worksheet

- Intended audience: adults.
- General wellness nutrition and weight logging; no medical treatment, diagnosis, gambling, contests, social feed, messaging, user-generated public content, violence, sexual content, drugs, alcohol promotion, unrestricted web access, or advertising.
- Camera/gallery content is private and user-selected; it is not published to other users.
- External links are limited to support, privacy, research, provider, and license pages.
- Expected classification is a low age rating, but do not state a final rating before completing each store's current questionnaire.
- **STORE ACCOUNT:** Complete Google content rating and Apple age-rating forms from the final metadata.

## Apple export-compliance worksheet

- Eatlog uses operating-system and platform HTTPS/TLS for network transport.
- Eatlog does not implement proprietary cryptography or expose a user-facing encryption feature.
- Candidate Expo setting: `ios.config.usesNonExemptEncryption: false`.
- **STORE ACCOUNT:** Answer App Store Connect export-compliance questions against the final binary and current Apple guidance; retain the response evidence.

## Reviewer-notes source

Reviewer path:

1. Launch Eatlog. No login is required.
2. Complete local onboarding with synthetic adult data.
3. Use the center Add control; it is an action button, not a fifth tab.
4. Manual logging works without online services.
5. Scan or Describe starts the requested Gemini estimate directly through the Eatlog Worker. Profile → Privacy explains the transmission and providers.
6. Typing food search uses USDA through the Worker when configured. Press Search to additionally use Open Food Facts directly.
7. Android only: Profile → Health Connect requests Weight read/write after the reviewer chooses to connect. iOS has no Health Connect or HealthKit UI.
8. Profile → Backup and restore creates/restores archives; Profile → Export data creates non-restorable CSV; Delete all data uses two confirmations.

Provider explanation:

- Gemini estimates and USDA requests use the owner-operated Cloudflare Worker.
- Open Food Facts is a direct, explicit full-search provider and is attributed under ODbL/Database Contents License terms.
- No account, paywall, subscription, in-app purchase, cloud sync, advertising, or telemetry is present.

Account-bound additions:

- **OWNER INPUT:** Public developer/legal name, monitored support email, privacy/support URLs, launch countries, and reviewer contact.
- **STORE ACCOUNT:** App IDs, review contact fields, content declarations, price, countries, agreements, and final submission notes.
- **CREDENTIAL:** Production service validation and signed binary identifiers.

## Reference sources

- Implementation inventory: `release/privacy/DATA_INVENTORY.md`
- Public policy draft: `release/site/privacy.md`
- Support draft: `release/site/support.md`
- Owner-controlled values: `release/OWNER_INPUTS.md`
- Store metadata source: created in M7 and must remain consistent with these answers.
