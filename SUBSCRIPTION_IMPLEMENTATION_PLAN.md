# Eatlog Pricing and Entitlement Implementation Plan

**Status:** Billing and Test Store implementation complete; Android production rollout preparation in progress; lifetime AI economics remain a launch gate

**Last updated:** 2026-08-28

**Release order:** Google Play first, then the Apple App Store

**Account model:** No Eatlog account or sign-in

**Billing provider:** RevenueCat over Google Play Billing and StoreKit

This plan supersedes the one-time PHP 299 purchase model described in `PRODUCT.md`, `STORE_RELEASE_IMPLEMENTATION_PLAN.md`, and the release worksheets. Keep those files unchanged until paid-tier implementation begins, then update them in the documentation phase below.

## 1. Goal

Change Eatlog from a paid download to a free local-first app with three customer-facing tiers: Eatlog Pugo, Eatlog Manok, and Eatlog Itik.

Eatlog Pugo keeps core logging and ownership features free and includes five initial photo or description estimates per rolling 24 hours. Eatlog Manok is a PHP 79 monthly subscription with a one-month store-managed introductory trial for eligible users. Eatlog Itik is a PHP 799 non-consumable lifetime purchase. Manok and Itik add meal and component re-estimates, adaptive recommendations, and higher server-enforced Gemini limits.

The implementation succeeds when:

- Pugo users can log food, track weight, view history and charts, use Health Connect on Android, and manage their data without starting a trial.
- Pugo users share five `scan` or `describe` operations per rolling 24 hours. They cannot send `clarify-meal` or `clarify-component` requests or create, refresh, confirm, accept, or keep adaptive recommendations.
- Eligible users can start one store-managed one-month trial through Eatlog Manok.
- Trial users receive full adaptive features plus the agreed trial AI allowances.
- Eatlog Manok, Eatlog Itik, and complimentary users receive the same product features and fair-use policy.
- Google Play or the App Store remains the authority for purchases, ownership, renewals, cancellation, grace periods, refunds, and trial eligibility.
- RevenueCat supplies normalized entitlement state without adding an Eatlog account.
- The Worker verifies access and quota before it contacts Gemini.
- Reinstalling or restoring a store purchase does not reset paid or trial quotas.
- Trial expiry, Manok subscription loss, or Itik refund preserves local food, weight, target, and adaptive-review data.
- A billing or entitlement outage leaves Pugo features and owned local data available.
- Store copy, privacy disclosures, support material, and in-app behavior describe the same product.

## 2. Fixed product decisions

### Pricing

| Tier | Philippines base price | Store product type |
| --- | ---: | --- |
| Eatlog Pugo | Free | No purchase |
| Eatlog Manok | PHP 79 per month | Auto-renewable monthly subscription |
| Eatlog Itik | PHP 799 lifetime | Non-consumable one-time purchase |

Set Eatlog Manok as the default paywall selection because hosted AI creates recurring cost. Present Eatlog Itik as a separate lifetime option. Fetch and display each store's localized price string. Do not hard-code `PHP 79` or `PHP 799` in purchase buttons or billing disclosures.

### Product names and identifiers

Use these identifiers unless a store rejects one:

| System | Identifier |
| --- | --- |
| RevenueCat project | `Eatlog` |
| RevenueCat entitlement | `eatlog_paid` |
| RevenueCat offering | `default` |
| Google Manok subscription | `eatlog_manok` |
| Google monthly base plan | `monthly` |
| Google Itik one-time product | `eatlog_itik` |
| Apple Manok subscription group | `eatlog_manok` |
| Apple Manok monthly product | `eatlog_manok_monthly` |
| Apple Itik non-consumable | `eatlog_itik` |

Use the exact customer-facing names **Eatlog Pugo**, **Eatlog Manok**, and **Eatlog Itik**. Keep `eatlog_paid` internal.

### Distribution and identity

- Keep `com.sgaret.eatlog` as the production Android package and iOS bundle identifier.
- Use `Eatlog Preview` with `com.sgaret.eatlog.preview`, the `subscription-preview` EAS channel, RevenueCat Test Store, and a staging Worker for standalone owner and friend testing.
- Keep Eatlog local-first and account-free.
- Treat Android and iOS purchases as separate store purchases. Eatlog cannot transfer an entitlement between Google Play and the App Store without an account system.
- Use the existing app-scoped installation token as RevenueCat's custom App User ID.
- Keep the installation token outside SQLite and outside Eatlog backups.
- Set RevenueCat restore behavior to `Transfer to new App User ID` so a store purchase can move to the new installation identity after reinstall.
- Let the store restore paid access under the same store account after reinstall.
- Do not grant production Manok or Itik access to a directly distributed APK unless the developer creates a RevenueCat complimentary grant for that installation.

### Existing purchasers

This plan assumes Eatlog has no public listing or purchasers under the PHP 299 model. Create the production Play app as free from its first availability and do not add grandfathering code. Stop the release and write a migration policy if evidence of an existing purchaser appears.

## 3. Access tiers

| Capability | Pugo | Manok trial | Manok | Itik | Complimentary |
| --- | --- | --- | --- | --- | --- |
| Manual food logging | Yes | Yes | Yes | Yes | Yes |
| Personal history, USDA, and Open Food Facts search | Yes | Yes | Yes | Yes | Yes |
| Diary and nutrition totals | Yes | Yes | Yes | Yes | Yes |
| Weight entry, trend, history, and charts | Yes | Yes | Yes | Yes | Yes |
| Health Connect on Android | Yes | Yes | Yes | Yes | Yes |
| Backup, restore, CSV export, reset, and deletion | Yes | Yes | Yes | Yes | Yes |
| AI Scan, Photo, and Describe | 5 per rolling 24 hours | Trial allowance | Fair use | Fair use | Fair use |
| AI meal and component clarification | No | Trial allowance | Fair use | Fair use | Fair use |
| Adaptive recommendation calculation and review | No | Yes | Yes | Yes | Yes |
| Trial counter display | No | Yes | No | No | No |
| Store subscription management | No | Yes | Yes | No | No |
| Restore store purchase | No | Yes | Yes | Yes | No |

Use one feature-access predicate for trial, paid, and complimentary users:

```ts
const hasPaidFeatures = access.kind !== 'pugo';
```

Keep quota policy separate because the introductory trial uses different limits.

## 4. Introductory trial

### Store configuration

- Offer one month free on Eatlog Manok only.
- Do not attach a trial or recurring billing phase to Eatlog Itik.
- Let Google Play and the App Store determine eligibility.
- Do not implement an on-device trial timestamp.
- Do not unlock the trial until the store reports an active entitlement.
- Show trial copy only when RevenueCat and the store report that the selected package includes an eligible trial.
- State the renewal price, billing period, cancellation route, and automatic-renewal behavior next to the trial action.
- Keep access active until the entitlement expiration when a user cancels during the trial.

### Trial AI allowance

The trial separates initial estimates from clarifications:

| Operation class | Rolling 24-hour limit | Whole-trial limit |
| --- | ---: | ---: |
| Initial estimate | 5 | 30 |
| Clarification | 5 | 30 |

Classify Worker operations as follows:

- Initial estimate: `scan`, `describe`.
- Clarification: `clarify-meal`, `clarify-component`.

The maximum trial allowance is 60 user-requested provider operations. The rolling 24-hour rule avoids timezone and clock-reset edge cases.

Show both remaining totals in trial UI. When a user reaches a 24-hour limit, show the next eligible time. When a user exhausts a whole-trial allowance, keep the other operation class available until its allowance runs out.

### Trial expiry

At expiry:

- Preserve all food logs, meals, weights, targets, adaptive reviews, preferences, and media.
- Keep the latest accepted target active.
- Leave a pending adaptive review stored but dormant.
- Stop new adaptive calculations and all adaptive-review mutations.
- Stop paid-only meal and component re-estimates before consent, installation-token loading, image preparation, context construction, or upload. Keep Pugo initial estimates available under their rolling allowance.
- Keep Pugo logging, weight tracking, charts, history, search, Health Connect, backup, export, and deletion available.
- Replace trial counters with clear Manok and Itik purchase actions.

If the user later buys Manok or Itik, or receives complimentary access, let the adaptive service evaluate current evidence. Do not apply an old pending recommendation without refreshing its evidence and stale-state checks.

## 5. Pugo and paid AI allowances

### Pugo allowance

Pugo shares one installation-scoped pool across `scan` and `describe`:

- 5 initial estimates in any rolling 24-hour window.
- No meal or component clarification.
- `remaining24Hours` counts requests still available. `nextEligibleAt` stays `null` until exhausted, then identifies when the oldest active request leaves the window.
- Clearing app data or reinstalling can reset this allowance because Eatlog has no account or cross-install free identity.

The Worker salts and hashes the canonical installation token for quota state. It returns `PUGO_DAILY_LIMIT` on the sixth active request and `PAID_ACCESS_REQUIRED` for `clarify-meal` or `clarify-component`. Pugo uses `gemini-2.5-flash-lite` first and `gemini-3.5-flash-lite` as fallback.

### Paid and complimentary fair use

Manok and Itik marketing may say **No weekly AI limits**. Do not use the word `unlimited` without a nearby fair-use qualification.

Apply these combined limits to Manok, Itik, and complimentary access:

- 30 AI operations in any rolling 24-hour window.
- 250 AI operations in any rolling 30-day window.

Count initial estimates and clarifications together. Keep the existing Worker abuse throttles as a separate layer:

- 5 Gemini requests per installation per minute.
- 30 Gemini requests per IP per minute.
- 100 Gemini requests across the emergency limiter per minute.

Routine paid UI does not show a counter. Show usage only when the user approaches a fair-use boundary or reaches one. Terms and paywall details must disclose both rolling limits.

Complimentary access receives the paid fair-use policy, not the introductory-trial allowance.

## 6. Quota accounting rules

The Worker owns quota decisions. Client counters provide display state and cannot authorize a request.

For each user action:

1. Validate the route, method, body, operation, consent state, entitlement grant, and request size.
2. Reserve one quota unit in an atomic Worker transaction.
3. Call the primary Gemini model and its configured fallback when needed.
4. Finalize the reservation when Gemini returns a valid recognized or unrecognized result.
5. Refund the reservation when the Worker fails before dispatch or when every provider attempt ends in a Worker, network, timeout, upstream-status, or malformed-upstream failure.

One user action consumes one quota unit even when the Worker calls both the primary and fallback model. Invalid requests, entitlement failures, and rejected uploads consume no quota.

Use a request ID for idempotency. A client retry with the same request ID must return the prior quota outcome or continue the existing reservation instead of charging twice.

Return structured errors:

```text
PAID_ACCESS_REQUIRED
PUGO_DAILY_LIMIT
TRIAL_DAILY_LIMIT
TRIAL_ALLOWANCE_EXHAUSTED
FAIR_USE_DAILY_LIMIT
FAIR_USE_30_DAY_LIMIT
ENTITLEMENT_UNAVAILABLE
```

Include `retryAfter` or `nextEligibleAt` when time can resolve the error. Do not expose store transaction IDs, quota subject hashes, provider messages, or secrets.

## 7. Cost guardrail at the approved prices

Eatlog Manok has recurring revenue for recurring AI cost. Eatlog Itik collects PHP 799 once while Gemini can create cost for as long as the buyer uses hosted AI. Keep the agreed quota, but make lifetime-cost evidence a production launch gate.

The Pugo route uses `gemini-2.5-flash-lite` with `gemini-3.5-flash-lite` fallback. Paid, trial, and complimentary access use `gemini-3.5-flash-lite` with `gemini-3.1-flash-lite` fallback. Recalculate with both production routes, measured token use, current exchange rate, taxes, and store terms before launch.

| Scenario | Estimated Gemini cost per call | 60-call trial | 250-call paid ceiling |
| --- | ---: | ---: | ---: |
| Light: 1,500 input, 300 output tokens | PHP 0.074 | PHP 4.45 | PHP 18.56 |
| Typical: 2,500 input, 600 output tokens | PHP 0.139 | PHP 8.35 | PHP 34.80 |
| Heavy: 5,000 input, 1,500 output tokens | PHP 0.325 | PHP 19.49 | PHP 81.20 |

At a 15% store fee, before tax and infrastructure:

| Tier | Gross proceeds | Estimated proceeds after store fee |
| --- | ---: | ---: |
| Eatlog Pugo | PHP 0 | PHP 0 |
| Eatlog Manok | PHP 79.00 per month | PHP 67.15 per month |
| Eatlog Itik | PHP 799.00 once | PHP 679.15 once |

If an Itik buyer uses all 250 calls each month, cumulative Gemini cost consumes the estimated PHP 679.15 proceeds after about 36.6 light months, 19.5 typical months, or 8.4 heavy months. Continued use after that point creates direct provider loss before tax and infrastructure. Complete these controls before production:

- Set an explicit Gemini output-token ceiling and the minimum thinking budget that preserves estimate quality.
- Record aggregate input tokens, output tokens, model, operation class, access class, outcome, and cost estimate.
- Exclude food text, prompts, responses, images, component names, device IDs, and transaction IDs from logs and analytics.
- Measure median, p90, p95, and maximum cost per successful user operation in closed testing.
- Measure Itik buyer retention and monthly AI use for a long enough test period to model cumulative cost.
- Require owner approval of Manok and Itik unit economics before public production rollout.

The current feature matrix gives Itik the same recurring fair-use allowance as Manok. That policy creates unbounded lifetime provider liability. If measured cost fails the launch gate, change the model, prompt size, output cap, Itik AI allowance, or price before public release. Do not hide an unprofitable lifetime product behind undocumented throttling.

## 8. RevenueCat model

### Product mapping

Attach all four real store products to the `eatlog_paid` entitlement. Add Manok monthly and Itik lifetime packages to the `default` offering. Map equivalent Android and iOS products into the same RevenueCat packages.

Configure both Itik products as non-consumable. RevenueCat must not consume the Google purchase because consumption would let the buyer purchase Itik again and would weaken restore behavior. Select a `react-native-purchases` version whose Android SDK supports non-consumables.

Use RevenueCat's public platform SDK key in the app. Keep RevenueCat secret API keys, Google service-account credentials, App Store keys, webhook authorization, and signing secrets outside the app and repository.

### App User ID

Configure RevenueCat with the existing 32-character installation token as a custom App User ID. Do not use RevenueCat's generated anonymous ID in parallel.

Pass the custom ID during the first SDK configuration and never call RevenueCat `logOut()`. Configure the project to `Transfer to new App User ID`; the account-free model needs that behavior to restore a store transaction after reinstall. Test the transfer with two installation IDs before production.

The no-account model has two restore paths:

- Store purchase: the user selects Restore Purchases under the same Google or Apple account. RevenueCat associates the restored Manok subscription or Itik non-consumable with the new installation identity.
- Complimentary grant: the grant belongs to the RevenueCat customer identity. Reinstalling or moving devices can require a new grant because the installation token does not survive app removal.

Document this limitation in support material. Do not claim cross-platform or automatic complimentary-access restoration.

### Normalized access state

Expose one app model instead of RevenueCat objects throughout the UI:

```ts
export type EatlogAccess =
  | { kind: 'pugo'; checkedAt: string; reason?: string }
  | {
      kind: 'manok-trial';
      expiresAt: string;
      willRenew: boolean;
      productId: string;
      checkedAt: string;
    }
  | {
      kind: 'manok';
      expiresAt: string | null;
      willRenew: boolean;
      productId: string;
      checkedAt: string;
    }
  | {
      kind: 'itik';
      productId: string;
      purchasedAt: string | null;
      checkedAt: string;
    }
  | {
      kind: 'complimentary';
      expiresAt: string;
      checkedAt: string;
    };
```

Derive `manok-trial`, `manok`, `itik`, and `complimentary` from verified entitlement and product metadata. Give Itik precedence when a customer owns Itik and also has Manok or a complimentary grant. Treat unknown, malformed, refunded, revoked, or expired state as Pugo for remote AI authorization. The app may use cached verified access for local adaptive UI. The Worker must reverify Itik ownership with RevenueCat at least once every 24 hours before issuing an AI grant, while platform notifications revoke access sooner after a refund or revocation.

### Manok to Itik transition

Google Play and the App Store cannot prorate or cancel a subscription through a separate non-consumable purchase.

- Hide Manok purchase and trial actions from an Itik owner.
- If Manok still renews, require the user to cancel it in the store before buying Itik.
- Once Manok reports `willRenew: false`, allow the Itik purchase and disclose that the store will not refund the remaining Manok period.
- Give Itik access precedence as soon as its purchase succeeds.
- Fall back to an active Manok entitlement after an Itik refund. Fall back to Pugo when no paid or complimentary entitlement remains.

### Startup and refresh

- Add a global `EntitlementProvider` inside the existing app provider tree.
- Configure RevenueCat after the database and installation token are ready.
- Keep entitlement startup nonblocking. Pugo UI must load when RevenueCat is slow or unavailable.
- Read cached `CustomerInfo`, then refresh it in the background.
- Subscribe to CustomerInfo changes.
- Refresh after purchase, restore, app foreground, and a complimentary grant action initiated through support.
- Store no entitlement row in SQLite and include no entitlement in backup or restore.

## 9. Complimentary access and giveaways

Use RevenueCat Granted Entitlements for developer access, named beta testers, giveaway winners, and support cases.

### App flow

- Add a copyable `Support ID` under Profile > Plan.
- Use the RevenueCat App User ID as the Support ID.
- Show `Complimentary access until <date>` for an active grant.
- Hide `Manage subscription` for a complimentary grant because no store subscription exists.
- Keep `Restore purchases` available in case the user owns Manok or Itik.

### Developer flow

1. Ask the recipient for the Support ID.
2. Find that customer in the RevenueCat dashboard.
3. Grant `eatlog_paid` until the selected date.
4. Ask the recipient to reopen Eatlog or use a refresh action.
5. Revoke the grant from RevenueCat when access should end early.

Use a long-dated revocable grant for the developer's production installation. Use RevenueCat Test Store, Google license testing, and Apple sandbox accounts for purchase testing.

### Promo-code scope

Do not add a universal developer code or client-side bypass.

The first paid-tier release does not need an Eatlog promo-code entry field. Google Play and Apple store offers can support later campaigns. A custom cross-platform code system would require the Worker to store hashed high-entropy codes, expiration, duration, redemption count, and an atomic claim, then call RevenueCat's grant API. The no-account restore limitation still applies to such grants.

## 10. Worker architecture

### Trust boundary

The mobile app cannot assert that a user paid, started a trial, received a complimentary grant, has confirmed Pugo access, or has remaining quota. The Worker verifies access and quota before any Gemini dispatch.

Add these flows:

```text
RevenueCat SDK -> store purchase or restore -> CustomerInfo -> app access UI
RevenueCat webhook -> Worker entitlement cache
App access refresh -> Worker verifies RevenueCat -> signed AI grant for confirmed Pugo or paid access
App estimate request -> Worker validates grant or refreshes inline -> atomic quota -> access-class Gemini route
```

Pugo continues to call USDA through the Worker and may call Gemini for five shared initial estimates per rolling 24 hours. Open Food Facts remains a direct public request. Meal and component clarification plus adaptive recommendations require an active Manok trial, Manok subscription, Itik purchase, or complimentary grant.

### Worker endpoints

Add exact routes and reject all undocumented variants:

```text
POST /v1/access/refresh
GET  /v1/usage
POST /v1/revenuecat/webhook
POST /v1/estimate
```

`POST /v1/access/refresh` verifies the RevenueCat customer and returns normalized access plus a signed AI grant for confirmed Pugo or paid access. Pugo grants use a salted installation-scoped quota subject; paid grants retain stable purchase identities.

`GET /v1/usage` returns only counters and next-eligible timestamps for the verified quota subject.

`POST /v1/revenuecat/webhook` requires a configured authorization value, validates the payload, updates cached entitlement state, and handles duplicate or out-of-order events.

`POST /v1/estimate` validates or refreshes the signed grant, applies the access-class quota, and selects the access-class Gemini model route. Keep the current consent check in the app as a separate privacy requirement.

### Worker state

Use a SQLite-backed Durable Object or an equivalent transactional Worker store for:

- Entitlement cache records with expiry and source.
- Stable salted quota subjects.
- Pugo initial-estimate timestamps keyed to a salted installation identity.
- Trial initial-estimate timestamps and total.
- Trial clarification timestamps and total.
- Manok, Itik, and complimentary combined operation timestamps.
- Request reservations and idempotency outcomes.
- Processed webhook event IDs.

Key Pugo usage from `hashQuotaIdentity("pugo:" + canonicalInstallId, QUOTA_IDENTITY_SALT)`. Key Manok trial and subscription quota state from a salted stable original subscription identity. Key Itik quota state from a salted stable non-consumable transaction identity. Key complimentary usage from a salted stable promotional-grant identity. Never use the installation token as the sole quota subject after a paid entitlement exists.

Prune timestamps outside the longest 30-day window and expired idempotency records. Keep no food content in Worker state.

### Secrets and configuration

Add Worker secrets or encrypted bindings for:

```text
REVENUECAT_SECRET_API_KEY
REVENUECAT_WEBHOOK_AUTH
AI_GRANT_SIGNING_KEY
QUOTA_IDENTITY_SALT
```

Keep the existing `USDA_API_KEY`, `GEMINI_API_KEY`, and `RATE_LIMIT_SALT`. Add non-secret RevenueCat project and entitlement identifiers as Worker configuration.

Update `worker/.dev.vars.example`, `worker/README.md`, and `release/runbooks/WORKER_RELEASE.md` without committing values.

### Entitlement outages

- Use a recent entitlement cache that has not passed its verification TTL when RevenueCat is unavailable.
- Never extend Manok or complimentary access beyond the verified entitlement expiration.
- Refresh Itik ownership on app foreground and before the Worker issues a new AI grant. Process refund and revocation webhooks without waiting for the next app launch.
- Return `ENTITLEMENT_UNAVAILABLE` when the Worker cannot establish current access and no valid cache exists.
- Keep USDA routes available when RevenueCat fails.
- Preserve reserved quota when an in-flight provider call continues; refund it under the failure rules in section 6.

## 11. Mobile implementation

### Dependencies and configuration

- Add `react-native-purchases` at the Expo-compatible version selected at implementation time.
- Use the standalone EAS preview APK; owner and friend testing must not require Metro. RevenueCat purchase code will not run in Expo Go.
- Keep the Test Store preview on the preview identifier, `subscription-preview` channel, and staging Worker. Do not publish native-dependent billing code to an older preview runtime through EAS Update.
- Add platform public SDK keys through EAS environment configuration.
- Keep secret RevenueCat keys out of every `EXPO_PUBLIC_*` variable.
- Add any RevenueCat native configuration required by the selected SDK version to `app.json` and regenerate native projects through the existing Expo workflow.
- Update third-party notices and dependency audits.

### New modules

Create focused modules that match existing service and context patterns:

```text
src/context/EntitlementContext.tsx
src/services/billing.ts
src/services/billing.types.ts
src/screens/PaywallScreen.tsx
```

The service owns RevenueCat calls and normalization. The provider owns app state and refresh. Screens and components consume the normalized model.

### Paywall entry points

Open the paywall from:

- Pugo meal and component re-estimate actions, before consent or private-content construction.
- A Worker `PAID_ACCESS_REQUIRED` defense response.
- A locked adaptive recommendation card in Analytics.
- Profile > Plan.

Initial Scan, Photo, Describe, and food-search estimates call the operation-aware gate with `initial` and proceed for Pugo. Re-estimates call it with `reestimate`; confirmed Pugo opens the plan screen, while unresolved access shows the existing unavailable message. Both re-estimate denials return before consent, image preparation, context construction, installation-token loading, or fetch.

### Paywall content

The paywall must show:

- Eatlog Pugo as the current free tier when the user has no paid entitlement, including five initial estimates per rolling 24 hours and no follow-up re-estimates.
- Eatlog Manok at its localized monthly price.
- Eatlog Itik at its localized lifetime price.
- Higher AI estimate limits plus meal and component re-estimates as paid benefits.
- Adaptive recommendations.
- One-month Manok trial terms when the Manok package reports an eligible offer.
- A clear `Pay once` and `No renewal` statement for Itik.
- Trial AI allowances.
- Paid fair-use disclosure.
- Automatic-renewal and cancellation copy for Manok only.
- Restore Purchases, Manage Subscription, Terms, and Privacy actions.

Support these states without trapping the user:

- Products loading.
- Products unavailable.
- Purchase pending.
- Purchase canceled.
- Purchase failed.
- Purchase succeeded but entitlement refresh is pending.
- Restore found access.
- Restore found no purchase.
- Billing unavailable on the installed build or store.

The close action returns to Pugo. Do not block onboarding or ordinary app startup with the paywall.

### Profile status

Profile > Plan shows:

- Eatlog Pugo, Manok trial, Eatlog Manok, Eatlog Itik, or Complimentary access.
- Renewal or expiration date for Manok and complimentary access.
- `Lifetime` with the purchase date when RevenueCat provides it for Itik.
- Manage Subscription for Manok only.
- Restore Purchases.
- Support ID with a copy action.
- Pugo free-estimate count, trial counters, or near-limit fair-use state when relevant.

### AI client errors

Extend `FoodEstimationFailureKind` in `src/services/foodScan.ts` with paid-access and quota failures. Map each Worker code to a distinct app state instead of collapsing all non-2xx responses into `provider`.

Suggested failure kinds:

```text
paid-access-required
pugo-daily-limit
trial-daily-limit
trial-allowance-exhausted
fair-use-daily-limit
fair-use-30-day-limit
entitlement-unavailable
```

Keep consent failure separate. Manok, Itik, and complimentary access never imply Gemini consent.

## 12. Adaptive recommendation gating

Gate adaptive features at the service boundary and the UI boundary.

`getAdaptiveReviewState()` can create or refresh pending reviews. Check for a Manok trial, Manok, Itik, or complimentary entitlement before calling it. Apply the same gate to:

- Adaptive-state retrieval.
- Intake-day confirmation.
- Recommendation acceptance.
- Recommendation rejection or keep-current actions.
- Any scheduled or foreground refresh that calculates adaptive evidence.

Do not gate:

- Manual weight entry.
- Health Connect weight import.
- Weight trend calculation and charts.
- Food logging and nutrition totals.
- Existing targets and manual plan editing.
- Owned adaptive rows in backup, restore, export, and deletion.

Analytics should show direct metrics and a locked adaptive card for Pugo users. Do not call the adaptive service behind that card until access permits it.

## 13. Consent, privacy, and data ownership

Keep Gemini consent independent of paid access:

- A user can buy Manok or Itik and decline Gemini consent.
- Declining consent keeps adaptive recommendations available because they run locally.
- Eatlog checks consent before installation-token loading or any Gemini request. Pugo initial estimates use the same consent and data flow as paid estimates.
- Consent copy must state that clarification can resend the selected scan image with component names and gram estimates.

Update the data inventory for:

- RevenueCat App User ID.
- Store purchase and entitlement metadata.
- RevenueCat SDK and server API traffic.
- Worker quota records and aggregate token usage.
- RevenueCat webhooks.

Do not put receipts, entitlement state, promotional grants, quota history, or RevenueCat identifiers into `.eatlog-backup` archives or CSV exports. A restored backup restores owned health and logging data, not paid access.

## 14. Store and owner setup

### Safe preparation before implementation

- Complete Google Play developer identity and payments-profile verification.
- Create a RevenueCat account and Eatlog project.
- Enable multifactor authentication and store recovery material.
- Prepare public Privacy, Terms, and Support URLs.
- Keep the identifiers from section 2 reserved in the plan.
- Decide whether the Apple Developer account will use an individual or organization identity before iOS setup.

### Google Play setup during implementation

1. Upload a signed AAB to an internal or closed test track.
2. Create the `eatlog_manok` subscription.
3. Create and activate its `monthly` auto-renewing base plan at PHP 79.
4. Create a one-month new-customer trial offer for Manok.
5. Create the `eatlog_itik` one-time product with a Buy purchase option at PHP 799.
6. Create a dedicated Google Cloud service account for RevenueCat.
7. Enable the required Play Developer APIs and real-time developer notifications.
8. Grant RevenueCat the minimum Play permissions required for subscriptions and orders.
9. Upload the service credentials to RevenueCat and wait for validation.
10. Import Manok and Itik into RevenueCat, mark Itik non-consumable, and attach both to `eatlog_paid`.

### Apple setup during iOS implementation

1. Complete Apple Developer enrollment, Paid Apps Agreement, tax, and banking setup.
2. Create the app record for `com.sgaret.eatlog`.
3. Create the `eatlog_manok` subscription group and `eatlog_manok_monthly` auto-renewable subscription.
4. Select the Apple price point closest to PHP 79 and add a one-month introductory free trial.
5. Create `eatlog_itik` as a non-consumable In-App Purchase.
6. Select the Apple price point closest to PHP 799.
7. Configure App Store keys and notifications required by RevenueCat.
8. Import Manok and Itik into RevenueCat and attach both to `eatlog_paid`.

### Free acquisition

Create and publish `com.sgaret.eatlog` as free from its first availability. Do not use a paid download as a temporary release gate. Keep production billing products and rollout inactive until the signed Play build passes the closed-track, entitlement, restore, and lifetime-cost gates.

Do not create production promo campaigns until the production products and entitlement paths pass sandbox and closed-track testing.

## 15. Test plan

### Pure and service tests

- Normalize each RevenueCat access state.
- Distinguish Manok trial, Manok, Itik, complimentary, grace, expired, refunded, and unknown states.
- Keep Pugo when RevenueCat returns malformed or missing data.
- Show trial copy only for eligible package metadata.
- Distinguish Manok recurring-price copy from Itik lifetime-price copy.
- Suppress Manok and trial purchase actions for an Itik owner.
- Map every Worker entitlement and quota error.
- Confirm consent blocks before identity loading and fetch.
- Confirm AI preflight occurs before camera and gallery work.
- Confirm adaptive gates prevent reads that can write.
- Confirm backup and restore exclude entitlement state.

### Worker tests

- Reject missing, expired, forged, wrong-audience, and malformed AI grants.
- Accept valid Pugo, Manok trial, Manok, Itik, and complimentary grants.
- Allow five mixed Pugo `scan` and `describe` requests per rolling 24 hours, then return `PUGO_DAILY_LIMIT`.
- Reject Pugo `clarify-meal` and `clarify-component` before reservation or Gemini dispatch.
- Enforce both trial operation classes and whole-trial totals.
- Enforce Manok, Itik, and complimentary rolling 24-hour and 30-day windows.
- Count simultaneous requests without exceeding limits.
- Treat fallback model attempts as one operation.
- Refund eligible failures and retain charges for valid unrecognized results.
- Preserve idempotency across retries.
- Keep usage stable after store restore to a new installation ID.
- Authenticate RevenueCat webhooks.
- Ignore duplicate events and reject stale events that would overwrite newer state.
- Handle Manok renewal, cancellation, grace, and expiry.
- Handle Itik purchase, restore, refund, and revocation.
- Handle complimentary grant and revocation.
- Exercise at least one request without injected runtime dependencies.
- Confirm logs contain no food text, image data, prompts, responses, secrets, installation IDs, or raw store identities.

### App integration tests

- Pugo startup with RevenueCat online, slow, offline, and misconfigured.
- Pugo access refresh, initial Scan, Photo, and Describe, shared allowance depletion, quota recovery, and paid-only meal/component re-estimates.
- Manok subscription and Itik non-consumable purchase success.
- Eligible and ineligible trial purchase.
- Purchase cancellation, pending payment, billing error, and interrupted entitlement refresh.
- Restore Manok and Itik with a matching store account, plus a no-purchase case.
- Prevent a second Itik purchase after ownership or restore.
- Require Manok cancellation before an active renewing subscriber can buy Itik.
- Allow Itik after Manok reports `willRenew: false` and give Itik immediate precedence.
- Trial counter changes after each operation class.
- Trial daily and whole-trial exhaustion.
- Paid near-limit and exhausted states.
- Trial expiry while the app is open and while it is closed.
- Subscription cancellation with access through expiration.
- Grace period, account hold, refund, and revocation.
- Complimentary grant, expiry, and early revocation.
- Upgrade from Pugo after adaptive evidence already exists.
- Downgrade with an accepted target and with a pending review.
- Regrant after expiry.
- Data reset without entitlement loss.
- Backup restore without entitlement injection.

### Store and device verification

- Use RevenueCat Test Store for early purchase UI work.
- Use Google Play license testers, closed testing, and Play Billing Lab for Android lifecycle cases.
- Use StoreKit sandbox and TestFlight for iOS lifecycle cases.
- Test on physical devices before release.
- Verify displayed localized prices and trial terms against the store purchase sheet.
- Verify Manok subscription management opens the correct store account screen and Itik shows no manage-subscription action.
- Verify a directly installed APK receives no production purchase entitlement by default.

Run these repository checks after implementation:

```bash
env TMPDIR=/tmp npm test
npx tsc --noEmit
npm run notices:check
npm run store:metadata:check
npx expo export --platform android --dev
cd worker && npm test
```

Run the existing dead-code check and document any known-baseline result.

## 16. Documentation and release updates

Replace the old paid-download model across the repository during implementation. Search for `PHP 299`, `one-time upfront`, `paid download`, `no subscription`, `no paywall`, and `no in-app purchase`. Preserve new Itik one-time-purchase statements.

Update at least:

- `PRODUCT.md`
- `STORE_RELEASE_IMPLEMENTATION_PLAN.md`
- `release/OWNER_INPUTS.md`
- `release/OWNER_RELEASE_CHECKLIST.md`
- `release/privacy/DATA_INVENTORY.md`
- `release/site/privacy.md`
- `release/site/support.md`
- `release/store/POLICY_WORKSHEETS.md`
- `release/store/REVIEW_MATERIAL.md`
- `release/store/STORE_FORM_WORKSHEET.md`
- `release/store/metadata.mjs`
- `scripts/validate-store-metadata.mjs`
- `release/runbooks/WORKER_RELEASE.md`
- `worker/README.md`

Add or publish Terms of Use and configure `EXPO_PUBLIC_TERMS_URL`. Keep the privacy and support URLs public before store submission.

Store and in-app copy must state:

- Eatlog is free to download.
- Eatlog Pugo includes free logging and weight tracking plus five photo or description estimates per rolling 24 hours. Meal and component re-estimates require Manok or Itik.
- Eatlog Manok costs the localized monthly price and renews until canceled.
- Eligible Manok users receive a one-month introductory trial.
- Eatlog Itik costs the localized one-time price, does not renew, and grants lifetime access to the paid tier.
- The trial has 5 initial estimates and 5 clarifications per rolling 24 hours, with 30 of each across the trial.
- Manok, Itik, and complimentary access have no weekly AI limit and use the disclosed 30-per-24-hours and 250-per-30-days fair-use policy.
- Restore works within the same platform and store account.
- Complimentary access does not create or manage a store subscription.

Terms must define `lifetime` as a non-expiring Itik entitlement on the purchase platform while Eatlog and its hosted services remain available, subject to fair use and store refund or revocation. Marketing must not promise that Gemini or another third-party service will operate forever.

## 17. Implementation sequence

### Phase 0: Owner preparation

- Complete the account, payments, URL, and security tasks in section 14.
- Confirm no existing purchaser needs grandfathering.
- Reconfirm pricing, trial, quotas, and product identifiers.

**Exit check:** The developer can access verified Play and RevenueCat accounts, and public legal/support URLs have owners.

### Phase 1: Contracts and test fixtures

- Add normalized entitlement types and pure mapping tests.
- Define Worker access, usage, grant, webhook, and error contracts.
- Add quota-window and cost-accounting test fixtures.

**Exit check:** Tests express each access and quota state before native billing code lands.

### Phase 2: RevenueCat client integration

- Add the SDK and native configuration.
- Configure the installation token as App User ID.
- Add `EntitlementProvider`, purchase, restore, manage, and refresh services.
- Use Test Store products for the first integration pass.

**Exit check:** A standalone preview APK can start and expire Manok, buy and restore Itik, and receive a complimentary test entitlement without gating product features yet.

### Phase 3: Worker entitlement and quota enforcement

- Add RevenueCat verification, webhook cache, signed grants, transactional quota state, and usage responses.
- Gate `/v1/estimate` before Gemini and apply the access-class quota.
- Route Pugo through Gemini 2.5 Flash-Lite then 3.5 Flash-Lite; retain the paid 3.5/3.1 route.
- Add aggregate token and model-specific cost metadata.

**Exit check:** Worker tests prove five shared Pugo initial estimates, paid-only Pugo clarification, exact rolling boundaries, stable installation quota identity, model routing, and unchanged trial/paid limits.

### Phase 4: Feature gates

- Gate paid-only re-estimates before private-content collection while allowing Pugo initial estimates.
- Gate adaptive service reads and writes.
- Preserve Pugo search, logging, weight, charts, Health Connect, ownership features, and initial AI allowance.
- Map paid-access and every quota error in the AI client.

**Exit check:** An expired, refunded, or revoked entitlement receives confirmed Pugo initial access without an adaptive mutation; unresolved access fails closed; Pugo re-estimates stop before consent.

### Phase 5: Paywall and purchase-management UI

- Add paywall, purchase states, trial counters, Profile status, Support ID, restore, and management links.
- Add locked adaptive and AI entry states.
- Verify accessibility, reduced motion, narrow Android layouts, and localized price lengths.

**Exit check:** Screen-level tests and device review cover every state listed in section 11.

### Phase 6: Real store products and legal material

- Configure Play products, trial offers, RevenueCat credentials, notifications, and real product mappings.
- Complete Apple work when iOS implementation begins.
- Update every release, privacy, support, terms, metadata, and review artifact.

**Exit check:** Store purchase sheets, RevenueCat state, Worker state, paywall copy, and public policies agree.

### Phase 7: Closed testing and release

- Run lifecycle, quota, downgrade, restore, consent, backup, and cost tests.
- Review measured Manok and Itik Gemini unit economics, including cumulative lifetime cost.
- Keep Play acquisition free and begin production rollout only after every launch gate passes.
- Roll out through a small production percentage and watch entitlement errors, provider cost, restore failures, and refunds.

**Exit check:** The owner approves production rollout and the measured cost envelope.

## 18. Launch blockers

Do not launch when any item remains unresolved:

- An existing paid purchaser lacks a migration decision.
- Pugo exceeds five initial estimates in a rolling 24-hour window, reaches a meal/component re-estimate, or uses a model outside the 2.5-to-3.5 route.
- Manok expiry, Itik refund, or purchase restore deletes or hides owned Pugo data.
- Reinstall resets trial or paid quota, or two paths on the same Pugo installation use different quota subjects.
- Manok purchase, restore, cancellation, grace, or expiry lacks device evidence.
- Itik purchase, repurchase prevention, restore, refund, or revocation lacks device evidence.
- A Manok-to-Itik transition can leave monthly renewal active without a direct warning and management action.
- The paywall claims a trial for an ineligible package.
- Prices in Eatlog differ from the store purchase sheet.
- Privacy or consent copy omits RevenueCat or clarification image reuse.
- Logs contain food content, identifiers, receipts, prompts, responses, images, or secrets.
- Measured p95 AI cost or cumulative Itik cost fails the owner's unit-economics approval.
- Terms, Privacy, Support, Manage Subscription, or Restore actions fail.
- Production rollout has started before the tested paid-tier build is ready.

## 19. Out of scope

- Eatlog accounts, email login, social login, and cloud profile sync.
- Cross-platform purchase sharing.
- A custom public promo-code entry system.
- Family or team subscriptions.
- Web checkout.
- Grandfathering without evidence of an existing purchaser.
- Advertising-supported AI access.
- Pugo meal or component re-estimates.

## 20. Official setup references

- [RevenueCat React Native SDK](https://www.revenuecat.com/docs/getting-started/installation/reactnative)
- [RevenueCat products, entitlements, and offerings](https://www.revenuecat.com/docs/projects/configuring-products)
- [RevenueCat restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior)
- [RevenueCat Google Play service credentials](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials)
- [RevenueCat Google Play non-consumable setup](https://www.revenuecat.com/docs/getting-started/entitlements/android-products)
- [RevenueCat non-subscription purchases](https://www.revenuecat.com/docs/platform-resources/non-subscriptions)
- [RevenueCat customer profiles and granted entitlements](https://www.revenuecat.com/docs/dashboard-and-metrics/customer-profile)
- [RevenueCat grant-entitlement API](https://www.revenuecat.com/docs/api-v2)
- [Google Play subscriptions](https://developer.android.com/google/play/billing/subscriptions)
- [Google Play subscription products and offers](https://support.google.com/googleplay/android-developer/answer/140504)
- [Google Play one-time products](https://support.google.com/googleplay/android-developer/answer/16430488)
- [Google Play app pricing rules](https://support.google.com/googleplay/android-developer/answer/6334373)
- [Apple introductory offers](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions)
- [Apple non-consumable In-App Purchases](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/create-consumable-or-non-consumable-in-app-purchases/)
- [Apple subscription offer codes](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-subscription-offer-codes)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

Recheck store, RevenueCat, Cloudflare, and Gemini documentation during implementation and again during submission week. Use the installed SDK versions and signed store builds as the release authority.
