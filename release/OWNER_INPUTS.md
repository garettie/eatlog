# Eatlog owner inputs and account checks

Preview record, 2026-09-24. Source work does not change production billing, hosting, store records, or privacy forms.

| Item | Known source or prior owner decision | Next external check |
| --- | --- | --- |
| Public name and contact | Sean Garette Gajitos; `sggajitos@gmail.com`; prior support expectation within 3 business days | Confirm address is monitored at rollout |
| Public host | `https://eatlog.pages.dev`, with `/privacy`, `/terms`, and `/support` | Revised preview drafts must be approved, dated, published, and checked without login |
| Platform order | Android first, iOS later; Android production ID `com.sgaret.eatlog`; isolated preview ID `com.sgaret.eatlog.preview` | Confirm store records and signed package IDs |
| Public plans | Eatlog free/open source; optional one-time Eatlog Omelette; My key is a setting | Confirm final sales terms and localized purchase sheet |
| Billing identifiers | Keep `eatlog_paid` entitlement, `eatlog_itik` one-time product, `eatlog_manok` legacy subscription compatibility | The app reads the `itik` offering, not the current `default`. On 2026-09-24 `itik` held one `$rc_lifetime` package with the Play `eatlog_itik` one-time product and the Test Store non-consumable, both in `eatlog_paid`; `default` still offered Manok monthly and Itik to older builds. Confirm the Play localized price in a purchase sheet; RevenueCat's API cannot read Play one-time products |
| Omelette price | No verified price for this new offer in repository or accessible preview account | Owner verifies current localized price in RevenueCat Test Store and store console; no number goes in copy until verified |
| Reviewer access | RevenueCat Test Store can present a no-charge Success path in an isolated preview | Production review needs an implemented complimentary unlock without payment or personal key; current source lacks a self-service code flow |
| Hosted AI | Worker code allows 30 combined operations per rolling 24h and 250 per rolling 30d | Confirm staging URL, deployed version, owner Gemini key, quota/budget alerts, and regional relay with synthetic requests |
| Direct My key | User supplies a Google AI Studio key; Eatlog does not charge for its use | Users choose their own Google project; owner does not supply or promise a free quota |
| Food providers | USDA uses owner Worker key; Open Food Facts needs monitored User-Agent contact | Register/confirm Open Food Facts API use and provider terms before public release |
| Google Play | Enrollment, agreements, payment profile, price, countries, testing rule, App access, Data Safety, Health Apps, screenshots, upload key | Store account owner records actual answers and evidence |
| Apple | Developer enrollment, Team ID, bundle reservation, SKU, Paid Apps Agreement, banking/tax, regions, App Privacy, screenshots, review contact | Later iOS release gate |
| Devices | Android API 26, current Google and Samsung-class phones; iPhone minimum/current when iOS starts | Physical-device matrix and real screenshots |
| Release operator | Named person for support, Worker rollback, credentials, and store operations | Owner assigns and keeps secrets outside git |

Prior monthly Manok and PHP lifetime Itik amounts in historical plans are **superseded sales proposals**, not current prices. Keep old product/entitlement identifiers only for compatibility. Do not reconfigure production billing from this document.

The Google Gemini/Cloudflare retention review was previously owner-attested on 2026-08-25 for the older model. Reconcile the new My key route separately with [Google's current terms](https://ai.google.dev/gemini-api/terms), including free versus billed projects and regional rules. A one-time Eatlog purchase alone says nothing about the user's Google project.
