# AI and purchase preview test matrix

Use the standalone `Eatlog Preview` APK (`com.sgaret.eatlog.preview`) on the `subscription-preview` channel, RevenueCat Test Store, and the separate staging Worker. Keep this work in preview. Do not publish an EAS Update containing native billing changes to an older preview runtime.

The public choices are free Eatlog and the optional one-time Eatlog Omelette purchase. `My key` and `Eatlog AI` are request routes. The persisted `pugo`, `manok`, and `itik` values, `eatlog_paid` entitlement, `itik` offering, and `eatlog_itik` product remain compatibility identifiers.

## Route and access cases

| State | Exercise | Expected result |
| --- | --- | --- |
| Free, no key | Complete onboarding with `Not now`; log, edit, reuse a saved meal, search, weigh in, view Analytics, share, export, and back up | Local features work. AI setup is optional and appears only when an AI action needs it. No free hosted estimate or paid local-feature gate appears. |
| Free, saved key | Save a key, choose `My key`, then Scan, Photo, Describe, re-estimate a meal, and re-estimate a component | Every estimate goes directly to Google with the user's key. The estimate path does not require a Worker grant, hosted consent, quota record, or RevenueCat answer. Key validation sends a model-list request without meal content before the key is saved. |
| Omelette, no key | Select Success in the Test Store purchase dialog, then use all four estimate operations | `Eatlog AI` sends selected content through the staging Worker to Gemini after hosted consent. The Worker verifies paid access and applies the paid allowance. Local features remain usable if the service fails. |
| Omelette, saved key | Select each route in Profile → AI estimates; repeat an estimate after each choice | `My key` goes directly to Google and `Eatlog AI` goes through the Worker. The choice persists after restart. A failed request does not silently switch routes. |
| Legacy subscription or complimentary access | Restore or inject a valid legacy/test entitlement; test grace, expiry, refund, revocation, and complimentary expiry | Existing `eatlog_paid` access still works while valid and receives the same hosted allowance. Expired or revoked access cannot start a new hosted estimate. Legacy subscribers retain the applicable store-management action. |

## Failure and privacy cases

- Invalid key shape, definitive Google rejection, unreadable SecureStore item, offline check, unsupported Google location, and Google quota exhaustion produce distinct recoverable states. An inconclusive model-list check does not label a key invalid. Replace and remove the key, restart, and verify route and masked hint behavior. Removing a key from the phone does not revoke it at Google.
- Withdraw hosted consent in Profile → Privacy, then try Eatlog AI. The disclosure must reappear before a selected photo, text, installation token, or Worker request leaves the device. Declining keeps local features and edits usable. This control applies to hosted Eatlog AI; the separate My key settings remain reachable. Test existing accepted consent after restart.
- For My key, verify the separate key consent and direct route. Key replacement preserves the selected route; removal stops that route. A key found after iOS reinstall without its consent record must not be used.
- Mix successful hosted Scan, Photo, Describe, and both re-estimate operations. The Worker allows 30 delivered estimates per rolling 24 hours and 250 per rolling 30 days, with five no-food outcomes per rolling 24 hours as a separate abuse ceiling. Provider failures and timeouts refund the reservation; duplicate requests do not refund a sibling's reservation. Verify exact rolling boundaries, concurrent requests, retry identity, and the reset message. Rate-limit bindings remain a separate throttle.
- Simulate Worker, Gemini, RevenueCat, and store outages. A transient Worker `pugo` answer must not demote a device with unexpired paid store access. Free local features and direct My key estimates remain available when the hosted path is down, subject to Google's own availability.
- Exercise signed-grant expiry/forgery, webhook duplicates and order, purchase cancellation, pending and failed transactions, restore, and repurchase prevention. The preview offering must contain a one-time `eatlog_itik` package; if it does not, record a configuration mismatch instead of showing subscription sales copy.
- Check SQLite, CSV, `.eatlog-backup`, and legacy restore paths. They must exclude the Google key, entitlement, grant, and quota identity. Delete all data removes the local key and consent; it does not undo a store purchase or revoke a Google key at Google. Capture logs and exports to confirm no selected content, credentials, installation token, grants, transaction IDs, or provider error bodies leak.
- On a location refusal, the hosted Worker retries the same Gemini model through its `wnam` relay. My key remains a direct request, so a Google location refusal there is reported to the user rather than rerouted through Eatlog.

Test Store proves app behavior only. It does not prove Google Play Billing, real localized pricing, refund propagation, acknowledgement, pending purchases, or account restore on a store-installed build.

## Physical-device preview sign-off

1. Save and verify an `.eatlog-backup` from the installed preview. Install the new standalone preview as an upgrade and confirm foods, meals, weights, targets, and adaptive history remain intact.
2. Run the route and failure cases above with synthetic content on an available phone. Record the build, route, Test Store outcome, response class, and latency without recording keys, tokens, or meal content.
3. Check the Plan and AI estimates screens at narrow width, largest text, TalkBack or VoiceOver, and reduced motion. Verify long store-localized prices, consent, Support ID copy, restore, and legacy subscription management.
4. Give a preview reviewer restricted access through the Test Store `Success` purchase path without a real payment or personal key. A production store submission still needs a separate reviewer-access mechanism; no such code is present in this preview build.
5. Keep native-runtime rows unsigned until they run on a physical device. Do not create an Android emulator for this task.
