# Subscription preview test matrix

Use only the standalone `Eatlog Preview` APK (`com.sgaret.eatlog.preview`) on the `subscription-preview` channel, RevenueCat Test Store, and the separate staging Worker. Do not use Expo Go or the development-client APK. Do not publish an EAS Update containing native billing code.

## Automated and Test Store coverage

- Pugo: local logging, search, weight, charts, export, and backup remain usable; Scan, Photo, and Describe share five initial estimates per rolling 24 hours; meal/component re-estimates and adaptive actions open the plan screen before consent or private-content construction.
- Manok trial: localized offering and one-month trial disclosure; 5 initial estimates and 5 clarifications per rolling 24 hours, 30 of each for the trial.
- Manok: purchase, cancel/pending/failure copy, delayed entitlement refresh, restore, grace period, and 30/24-hour plus 250/30-day combined fair-use counters.
- Itik: localized lifetime package, repurchase prevention, preview-only direct transition from Test Store Manok, production Manok cancellation requirement, restore, refund, and revocation.
- Complimentary: grant, expiry, revocation, no store-management claim, and paid fair-use counters.
- Worker: signed grants with a maximum 30-day TTL, forged/expired rejection, Pugo identity stability, exact rolling-window boundaries, paid-only clarification, atomic concurrent reservations, idempotent retry, provider-failure refund, access-specific model routing, duplicate/out-of-order webhook handling, and cache outage behavior.
- Privacy: no entitlement, grant, or Pugo/paid quota state in SQLite/CSV/backups; no request content, identifiers, grants, transaction IDs, or secrets in app/Worker logs.

Test Store validates app behavior only. It does not prove Google Play Billing, trial eligibility, refund propagation, acknowledgement, pending purchases, account restore, or real localized pricing.

## Physical-device preview checklist

OWNER TESTING REQUIRED before distribution:

1. Create and verify an `.eatlog-backup` from the currently installed preview.
2. Obtain owner approval for the cost-bearing EAS preview build. Confirm `expo.version` is newer and the profile is `preview`, not `development`.
3. Install as an upgrade on the owner's device. Confirm existing foods, meals, weights, targets, and adaptive history remain intact.
4. Exercise every state above with Test Store, including offline startup and Worker/RevenueCat outage simulations.
5. As confirmed Pugo, verify camera/gallery and description entry can proceed for initial estimates. Verify the fifth shared Scan/Photo/Describe request succeeds, the sixth shows the exact rolling-window message, and the free counter shows `0/5` with the next eligibility time.
6. From a Pugo review, invoke meal and component re-estimation. Confirm the plan screen opens before consent, image preparation, installation-token loading, or a Worker request.
7. Confirm paywall scrolling, TalkBack labels, 200% font scaling, narrow Android layout, reduced motion, long localized prices, the Pugo counter, Support ID copy, restore, and management links.
8. Confirm no raw provider message, transaction identifier, grant, stack trace, or JSON error appears onscreen or in captured logs.

OWNER TESTING REQUIRED later on a Google Play closed track: real Manok purchase and trial, pending/cancel/failure, renewal/grace/expiry, restore, Manok-to-Itik transition, Itik repurchase prevention, refund, and revocation. Production readiness also requires the documented lifetime-cost launch gate.
