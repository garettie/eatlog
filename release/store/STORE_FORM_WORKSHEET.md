# Eatlog store form worksheet

Updated 2026-09-25 for the free, bring-your-own-key release. These are the answers to paste, not a record of what the consoles currently say. Do not put internal tier names (Pugo, Manok, Itik) in public fields.

| Area | Google Play source answer | App Store Connect source answer | Release check |
| --- | --- | --- | --- |
| App | Eatlog, `com.sgaret.eatlog`, Health & Fitness | Eatlog, candidate `com.sgaret.eatlog`, Health & Fitness / Food & Drink | Verify store records and Apple bundle reservation |
| Acquisition | Free | Free | Keep acquisition free at first public availability |
| Paid product | One-time, non-consumable `eatlog_itik`. Name: `Eatlog Omelette`. Description: `One-time purchase. AI estimates without your own key: 30 per rolling 24 hours, 250 per rolling 30 days.` | Equivalent one-time product only after Apple account setup | The name and description show on the purchase sheet; check them and the price there |
| Legacy subscription | `eatlog_manok` entitlement/management/restoration retained; do not sell it to new users | Retain any actual legacy entitlement path | Verify final offering does not expose monthly purchase packages |
| App access | "All or some functionality is restricted": Eatlog AI needs the Omelette purchase. Give a license-tester Google account and paste `reviewerNotes.google` as instructions | Sandbox account and `reviewerNotes.apple` | License testers buy without being charged; no in-app unlock exists or is needed |
| Ads and tracking | None in app source | None in app source | Verify final SDK/privacy details |
| Target audience and rating | Adults; general-wellness nutrition/weight, no clinical claims | Adults; no public content or messaging | Let current questionnaires calculate rating |
| Health | Nutrition and Weight Management; Android Health Connect Weight read/write only | No Apple Health/HealthKit in v1 | Inspect signed manifest and run device tests |
| Privacy | Use `POLICY_WORKSHEETS.md` and current Data Safety form | Use `POLICY_WORKSHEETS.md` and current App Privacy form | Save actual console answers; a draft is not submission |
| Support and legal | Privacy https://eatlog.pages.dev/privacy/, Terms https://eatlog.pages.dev/terms/, Support https://eatlog.pages.dev/support/, sggajitos@gmail.com | Same plus review contact | Published 2026-09-24 (policy version 1.3) |
| Countries | Philippines is the prior selected storefront | Owner selects actual iOS storefronts | Verify exact markets and localized product availability |
| Screenshots | Real captures from the release build per `SCREENSHOT_PLAN.md`, AI estimate first | Real iPhone captures, no iPad set currently planned | Replace any screenshot that shows a monthly plan or the old three-tier paywall |
| Signing and rollout | Play signing, track access, testing eligibility, draft submission | Apple agreements, Team ID, SKU, signing, TestFlight | Account-bound; do not infer completion from source files |

The store listing copy is in `metadata.mjs` and validated by `npm run store:metadata:check`. Reviewer notes in that file describe the production license-testing purchase path. The owner supplies the license-tester email credentials in App access.

Do not assume a one-time Eatlog purchase changes Google's treatment of a user's own key. A free-tier Google project and a billed project have different [Gemini API terms](https://ai.google.dev/gemini-api/terms), including regional exceptions. Google sets My key quotas and possible charges. Eatlog's hosted quota comes from Worker code.

Store account items still requiring direct verification: current Omelette offering/package and localized price, legacy subscription visibility, purchase and restore on the tested binary, license-tester reviewer accounts, app privacy/data safety forms, account agreements, countries, support/legal URLs, final screenshots, and review contacts. No store form has been changed by this worksheet.

References: [Google Play listing fields](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en), [Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-AE), [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/), [Apple app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/).
