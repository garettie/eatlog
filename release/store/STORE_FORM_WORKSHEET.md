# Eatlog store form worksheet

Preview draft, 2026-09-24. These are source answers, not submitted console records. Use the final signed binary and current forms before publication. Do not put owner-only labels in public fields.

| Area | Google Play source answer | App Store Connect source answer | Release check |
| --- | --- | --- | --- |
| App | Eatlog, `com.sgaret.eatlog`, Health & Fitness | Eatlog, candidate `com.sgaret.eatlog`, Health & Fitness / Food & Drink | Verify store records and Apple bundle reservation |
| Acquisition | Free | Free | Keep acquisition free at first public availability |
| Paid product | Optional one-time, non-consumable Eatlog Omelette under existing `eatlog_itik` ID | Equivalent one-time product only after Apple account setup | Confirm live localized store-sheet price and product availability; no price invented in source |
| Legacy subscription | `eatlog_manok` entitlement/management/restoration retained; do not sell it to new users | Retain any actual legacy entitlement path | Verify final offering does not expose monthly purchase packages |
| Store access | No login. Manual and local features open to all. Preview Test Store offers no-charge Success path for hosted AI | Same preview path where Test Store is used | Production review needs a separate complimentary unlock before submission |
| Ads and tracking | None in app source | None in app source | Verify final SDK/privacy details |
| Target audience and rating | Adults; general-wellness nutrition/weight, no clinical claims | Adults; no public content or messaging | Let current questionnaires calculate rating |
| Health | Nutrition and Weight Management; Android Health Connect Weight read/write only | No Apple Health/HealthKit in v1 | Inspect signed manifest and run device tests |
| Privacy | Use `POLICY_WORKSHEETS.md` and current Data Safety form | Use `POLICY_WORKSHEETS.md` and current App Privacy form | Save actual console answers; a draft is not submission |
| Support and legal | Published HTTPS policy, terms, support; monitored support address | Same plus review contact | Publish revised pages before forms; current rewritten pages are preview drafts |
| Countries | Philippines is the prior selected storefront | Owner selects actual iOS storefronts | Verify exact markets and localized product availability |
| Screenshots | Existing site screenshots are deferred; store assets need real final-device captures | Real iPhone captures, no iPad set currently planned | Do not submit stale images |
| Signing and rollout | Play signing, track access, testing eligibility, draft submission | Apple agreements, Team ID, SKU, signing, TestFlight | Account-bound; do not infer completion from source files |

The store listing copy is in `metadata.mjs` and validated by `npm run store:metadata:check`. Reviewer notes in that file describe the production license-testing purchase path. The owner supplies the license-tester email credentials in App access.

Do not assume a one-time Eatlog purchase changes Google's treatment of a user's own key. A free-tier Google project and a billed project have different [Gemini API terms](https://ai.google.dev/gemini-api/terms), including regional exceptions. Google sets My key quotas and possible charges. Eatlog's hosted quota comes from Worker code.

Store account items still requiring direct verification: current Omelette offering/package and localized price, legacy subscription visibility, purchase and restore on the tested binary, license-tester reviewer accounts, app privacy/data safety forms, account agreements, countries, support/legal URLs, final screenshots, and review contacts. No store form has been changed by this worksheet.

References: [Google Play listing fields](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en), [Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-AE), [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/), [Apple app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/).
