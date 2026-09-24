# Eatlog production rollout checklist

The repository changes remain in preview. Each box below changes or verifies an external production state and needs the owner or account holder. Android goes first; iOS follows after its own signed-device and store review.

## 1. Freeze the compatible source and binary

- [ ] Record app commit, version, runtime version, preview APK, Worker commit/deployment, and rollback version. Keep the preview package `com.sgaret.eatlog.preview` on `subscription-preview`; production is `com.sgaret.eatlog` on its own channel.
- [ ] Run the repository tests, typecheck, metadata/artwork/site checks, Android preview export, and the full physical-device matrix. Do not publish native billing changes to an older preview runtime through OTA.
- [ ] Verify free no-key logging, My key direct estimates, hosted Omelette estimates, route switching, key invalid/removal, consent withdrawal/restart, backup/restore, delete-all, offline/provider failures, quota boundaries, purchase cancellation, restore, refund/revocation, and legacy subscription access on the exact candidate.
- [ ] Inspect the merged Android manifest and the signed artifact. Confirm Health Connect Weight only, permitted media/camera behavior, app identity, and no exposed secrets.

## 2. Reconcile services and billing

- [ ] Confirm the `itik` RevenueCat offering (the one this app reads) sells only the non-consumable `eatlog_itik` product, with the intended **localized** price in the actual purchase sheet. After older binaries are retired, decide whether the current `default` offering should stop selling the Manok monthly package; that is a production billing change. Resolve any mismatch before copying the sales wording to production. Keep `eatlog_manok` and `eatlog_paid` identifiers for existing subscribers and restoration.
- [ ] Verify the production store product, entitlement mapping, purchase, restore, refund/revocation, and legacy subscription management with a Play-installed build. Do not hide a monthly package only in copy while the offering still sells it.
- [ ] Keep the reviewer accounts listed as Play license testers and their email credentials current in App access. License testers buy Omelette without charge, so review needs no personal key and no in-app unlock.
- [ ] Confirm Worker/app protocol compatibility, stable quota identity across legacy renewals, 30/24h and 250/30d limits, five/day rejected-food refund guard, grant expiry, entitlement outage fallback, and `wnam` relay for location refusal. Use synthetic staging requests before production cutover.
- [ ] Review current Gemini prices, Google free/billed data terms, Cloudflare and RevenueCat settings, keys, budgets, alerts, and regional behavior. Approve lifetime hosted cost using measured usage; a one-time purchase does not promise unlimited or perpetual third-party service.

## 3. Publish words and forms in the right order

- [ ] Approve final copy and the September 24 owner screenshots now cropped into the website. Keep story step 04's existing plan-update image unless the owner supplies a replacement. Check that screenshots still match the final signed app.
- [x] Website, Privacy, Terms, and Support published September 24, 2026 (policy version 1.3, effective that day). Run `npm run site:check` before each later deploy.
- [ ] Put the exact current app/Worker behavior and localized purchase terms into Play and later Apple listings. Upload final artwork and real store screenshots only after the tested binary matches them.
- [ ] Complete Google Play Data Safety, Health Apps, Health Connect, App access, content rating, prices/regions, and required testing. Complete Apple App Privacy, age rating, export compliance, purchase, and review fields for iOS. Save actual console answers. Draft worksheets alone do not update either console.
- [ ] Recheck support contact, Open Food Facts registration, provider terms, privacy links, refund and legacy subscription management text, and restricted reviewer steps from the published URLs and submitted forms.

## 4. Release and watch

- [ ] Deploy the approved Worker with the production config and secrets only after staging compatibility and rollback are recorded. Read-only `/healthz` first; cost-bearing synthetic estimates only with owner budget approval.
- [ ] Submit the signed Android candidate and matching metadata to the appropriate test track. Complete the required tester period and review, then use a controlled production rollout only after the owner approves it.
- [ ] Watch Worker errors/latency, quotas, provider cost, purchase/restore, consent complaints, and support. Roll back Worker or app with the recorded compatible pair if access or data handling diverges. Keep local logging available during service outages.
- [ ] Repeat the device, billing, privacy, screenshot, and form gates for iOS; Health Connect stays Android-only and HealthKit remains outside v1.

Owner/account dependencies and values are in [OWNER_INPUTS.md](OWNER_INPUTS.md). Exact device actions are in [UI_SMOKE_SCRIPT.md](qa/UI_SMOKE_SCRIPT.md) and [DEVICE_MATRIX.md](qa/DEVICE_MATRIX.md). The Worker procedure is [WORKER_RELEASE.md](runbooks/WORKER_RELEASE.md). No checkbox is marked complete by this preview source update.
