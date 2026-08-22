# Eatlog store form worksheet

Updated: 2026-08-10. These are source answers, not submitted records. Reconcile them with the final signed binaries and current console wording. Account-controlled answers remain labeled; do not copy labels into public fields.

## Google Play

| Console area | Source answer | Status |
| --- | --- | --- |
| App or game | App | Ready |
| App name | Eatlog | Ready; 30-character limit checked |
| Default localization | English (United States) source exists | STORE ACCOUNT: choose in record |
| Package | `com.sgaret.eatlog` | Ready; immutable after record creation |
| Free or paid | Change to free only after the subscription closed-track and lifetime-cost gates pass | STORE ACCOUNT: irreversible checkpoint |
| Philippines price | Manok PHP 79 monthly; Itik PHP 799 lifetime | STORE ACCOUNT: verify purchase-sheet prices before release |
| Subscriptions / in-app products | `eatlog_manok` monthly plus trial; non-consumable `eatlog_itik_lifetime` | STORE ACCOUNT / CLOSED TESTING |
| Category | Health & Fitness | Ready; recheck console taxonomy |
| Tags | Select only console tags that literally match food, nutrition, weight, or diary functions | STORE ACCOUNT |
| Ads | No | Ready |
| App access | All core screens are available without login, membership, code, or demo account | Ready |
| Target audience | Adults; not designed for children | Ready; STORE ACCOUNT final selection |
| Content rating | No public user content, messaging, gambling, violence, sexual content, drugs, or unrestricted web access; general-wellness nutrition/weight content | Ready; STORE ACCOUNT questionnaire computes rating |
| Health apps | Nutrition and Weight Management | Ready; STORE ACCOUNT submit declaration |
| Medical device | No | Ready |
| Required health disclaimer | Use the exact sentence in `metadata.mjs` full description | Ready |
| Health Connect | Read Weight and Write Weight only; optional, point-of-use, Android-only | Ready; STORE ACCOUNT/PHYSICAL DEVICE evidence |
| Data Safety | Use `POLICY_WORKSHEETS.md`; conservative remote photo, text/search, token/IP, and operational-log answers | CREDENTIAL provider review; STORE ACCOUNT submit |
| Account deletion | Not applicable; Eatlog has no account. In-app Delete all data removes local data | Ready |
| Privacy policy | Public, active, non-geofenced HTTPS page; not a PDF | OWNER INPUT / STORE ACCOUNT |
| Support email | Monitored address | OWNER INPUT / STORE ACCOUNT |
| Countries | Philippines fixed; any others require owner approval | OWNER INPUT / STORE ACCOUNT |
| Play App Signing / upload key | Enable and retain EAS upload-key custody | STORE ACCOUNT / CREDENTIAL |
| Testing requirement | Determine account type/date and whether 12 testers for 14 continuous days applies | STORE ACCOUNT |

## App Store Connect

| Console area | Source answer | Status |
| --- | --- | --- |
| Name | Eatlog | Ready; 30-character limit checked |
| Subtitle | Food and weight log | Ready; 30-character limit checked |
| Primary language | English (U.S.) source exists | STORE ACCOUNT: choose in record |
| Bundle ID | Candidate `com.sgaret.eatlog` | STORE ACCOUNT: reserve and verify |
| SKU | Owner-defined stable internal value | OWNER INPUT / STORE ACCOUNT; do not invent |
| Platforms | iPhone; `supportsTablet` is false | Ready |
| Primary / secondary category | Health & Fitness / Food & Drink | Ready; STORE ACCOUNT select |
| Price | Free acquisition after launch gates; store-localized Manok monthly and Itik lifetime prices | STORE ACCOUNT |
| In-app purchases / subscriptions | Manok auto-renewable subscription and Itik non-consumable | STORE ACCOUNT / SANDBOX TESTING |
| Sign-in | None; no demo account | Ready |
| Content rights | USDA CC0/public domain, Open Food Facts ODbL/database terms, bundled font/software licenses recorded | Ready; owner legal review before submission |
| Age rating facts | Adult-positioned general wellness; no public UGC, messaging, ads, gambling, violence, sexual content, drugs, unrestricted web access, or medical treatment function | Ready; STORE ACCOUNT questionnaire computes rating |
| Regulated medical device | No | Ready; STORE ACCOUNT declaration where shown |
| App Privacy | Use `POLICY_WORKSHEETS.md`; no tracking, account linkage, ads, or HealthKit | CREDENTIAL provider review; STORE ACCOUNT submit |
| Export compliance | Platform HTTPS/TLS only; `usesNonExemptEncryption` is false | Ready; STORE ACCOUNT answer against final binary |
| Privacy policy URL | Required HTTPS URL | OWNER INPUT / STORE ACCOUNT |
| Support URL | Required page with real contact information | OWNER INPUT / STORE ACCOUNT |
| Marketing URL | Omit unless the owner supplies a real site | OWNER INPUT; optional |
| Copyright | Year plus public rights-holder name | OWNER INPUT / STORE ACCOUNT |
| Review contact | Name, monitored email, phone, and time zone | OWNER INPUT / STORE ACCOUNT |
| Review notes | Canonical Apple reviewer note in `metadata.mjs` | Ready except contact |
| Screenshots | One to ten real iPhone screenshots, no alpha; no iPad set | PHYSICAL DEVICE / CREDENTIAL |
| EU distribution | Complete DSA trader status if launch countries include the EU | OWNER INPUT / STORE ACCOUNT |
| Agreements / banking / tax | Paid Apps Agreement and payout setup | STORE ACCOUNT |

## Shared submission checks

- Use the metadata validator; do not hand-edit console copy without updating `metadata.mjs`.
- Use only the generated artwork that passes the artwork validator.
- Recheck privacy URLs, support contact, pricing, countries, provider contracts, forms, screenshots, and reviewer notes against the exact signed binary.
- Select subscription and in-app purchase disclosures that match Manok and Itik. Do not select account, advertising, social, cloud-sync, Apple Health, HealthKit, medical-device, or guaranteed-outcome options.
- Save dated screenshots or exports of every submitted form in the owner-controlled release record; do not commit personal, banking, tax, credential, or two-factor data.

Primary references: [Google listing fields](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en), [Google preview assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en), [Google health policy](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en), [Apple app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/), [Apple version fields](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information), and [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
