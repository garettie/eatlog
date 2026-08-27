# Eatlog Android release: owner work remaining

Updated: 2026-08-24

The local production billing work is complete on `main` at commit `f01d160`. This checklist starts with the next owner action. The earlier Play account, app shell, RevenueCat app, Google service account, tester recruitment, and Preview backup work are treated as complete based on the owner's confirmation.

The Preview APK can stay installed and in daily use until the final migration.

## Keep Preview isolated

- Do not edit the EAS `preview` environment.
- Do not replace its RevenueCat `test_` key.
- Do not rename or redeploy `eatlog-food-subscription-staging` for production.
- Do not publish production billing code to the `subscription-preview` channel.
- Do not upload the Preview APK to Play. Its package is `com.sgaret.eatlog.preview`.
- Keep Test Store products attached to the RevenueCat `default` offering.

## Why the EAS variable names repeat

The Preview and production builds intentionally use the same variable names with different values. `eas.json` pins the `preview` profile to the EAS environment named `preview` and the `production` profile to the environment named `production`.

For example:

| EAS environment | Variable | Value |
| --- | --- | --- |
| `preview` | `EXPO_PUBLIC_FOOD_WORKER_URL` | Staging Worker URL |
| `production` | `EXPO_PUBLIC_FOOD_WORKER_URL` | Production Worker URL |
| `preview` | `EXPO_PUBLIC_REVENUECAT_API_KEY` | Test Store `test_` key |
| `production` | `EXPO_PUBLIC_REVENUECAT_API_KEY` | Google `goog_` key |

Setting a value under `production` does not overwrite the value under `preview`. It also cannot rewrite the already-installed Preview APK. Expo embeds `EXPO_PUBLIC_*` values when it builds or bundles the app. Preview changes only if someone edits the `preview` environment and then creates a new Preview build or publishes an update to `subscription-preview`.

Never create these as one shared value. In the Expo dashboard, check that the environment selector says `production` before saving production values. If using the CLI, always include `--environment production`.

## 1. Publish the website

Publish the finished Privacy, Terms, and Support pages over public HTTPS. They must open without login, redirects to an editor, or geographic restrictions.

Record the final URLs:

- [x] Privacy Policy URL
- [x] Terms of Use URL
- [x] Support URL
- [x] Monitored support email

Open all three URLs on the Android phone that will test Eatlog. Fix broken navigation or unreadable mobile layouts before continuing.

## 2. Deploy the production Worker

The checked-in production config is `worker/wrangler.subscription-production.jsonc`. It creates `eatlog-food-subscription-production`; it does not replace the Preview Worker.

From the repository:

```bash
cd worker
npx wrangler whoami
rg -n '^  "name":' wrangler.subscription-production.jsonc
npx wrangler deploy --dry-run --config wrangler.subscription-production.jsonc
```

Confirm that `wrangler whoami` shows the intended Cloudflare account. The `rg` command must show `"name": "eatlog-food-subscription-production"`. The dry run validates the bundle and bindings but does not reliably print the Worker name. Stop if the name command shows anything else or the dry run fails.

Set these secrets one at a time. Wrangler asks for each value without putting it in the command:

```bash
npx wrangler secret put USDA_API_KEY --config wrangler.subscription-production.jsonc
npx wrangler secret put GEMINI_API_KEY --config wrangler.subscription-production.jsonc
npx wrangler secret put RATE_LIMIT_SALT --config wrangler.subscription-production.jsonc
npx wrangler secret put REVENUECAT_SECRET_API_KEY --config wrangler.subscription-production.jsonc
npx wrangler secret put REVENUECAT_WEBHOOK_AUTH --config wrangler.subscription-production.jsonc
npx wrangler secret put AI_GRANT_SIGNING_KEY --config wrangler.subscription-production.jsonc
npx wrangler secret put QUOTA_IDENTITY_SALT --config wrangler.subscription-production.jsonc
```

Use production RevenueCat credentials here. `REVENUECAT_SECRET_API_KEY` is the server key, not the public `goog_` key. Create new production-only random values for the rate-limit salt, webhook authorization value, grant-signing key, and quota salt. Store them in the password manager. Never put them in EAS, `.env` files, chat, screenshots, or git.

Deploy and record the result:

```bash
npx wrangler deploy --config wrangler.subscription-production.jsonc
npx wrangler deployments list --config wrangler.subscription-production.jsonc
```

- [x] Production Worker URL recorded
- [x] Deployment version recorded
- [x] Read-only `GET <Worker URL>/healthz` returns HTTP 200 with `{"ok":true}`

The full rollback procedure is in `release/runbooks/WORKER_RELEASE.md`.

## 3. Configure the EAS production environment

Open the Eatlog project in Expo, then open the EAS environment named `production`. Do not edit a project-wide or Preview value.

Set:

- `EXPO_PUBLIC_FOOD_WORKER_URL` to the production Worker URL.
- `EXPO_PUBLIC_REVENUECAT_API_KEY` to the production Android key beginning with `goog_`.
- `EXPO_PUBLIC_SUPPORT_EMAIL` to the monitored public address.
- `EXPO_PUBLIC_PRIVACY_URL` to the published Privacy URL.
- `EXPO_PUBLIC_TERMS_URL` to the published Terms URL.
- `EXPO_PUBLIC_SUPPORT_URL` to the published Support URL.

These are public app configuration values. Do not put any Worker, RevenueCat server, Google service-account, Gemini, or USDA secret in an `EXPO_PUBLIC_*` variable.

- [x] Production values saved under EAS environment `production`
- [x] Preview environment checked and left unchanged

## 4. Finish and freeze the month calendar feature

Do not build the production AAB while the month calendar work is still changing. This feature may stay inside the existing release if it only reads existing local meal data and calculates daily or weekly calories in JavaScript or SQL.

Before building:

- [x] The calendar agent has finished and stopped editing its files.
- [x] Review the final diff and confirm it adds no native dependency, config plugin, Android permission, database migration, network request, analytics event, or new data export.
- [x] Confirm the calendar uses the existing local date rules and stored calorie data.
- [x] Confirm partial weeks and month boundaries do not double-count or omit days.
- [x] Confirm changing months does not alter the selected diary date or existing meal data.
- [x] Confirm adding, editing, or deleting a meal updates the affected day and weekly total.
- [x] Navigate rapidly across several months and confirm a late query cannot replace the currently selected month with stale data.
- [x] Confirm a failed month query keeps the last successful calendar visible and that Retry loads the selected month.
- [x] Confirm spillover dates use their historical targets and contribute to the complete Monday-to-Sunday weekly total.
- [x] Test short and long months, a leap February, a month beginning midweek, and a month ending midweek.
- [x] Check the narrow phone layout: seven day cells and the weekly summary remain readable without clipping or horizontal scrolling.
- [x] With TalkBack, confirm month controls, day status, weekly totals, and disabled next-month state have useful labels.
- [x] Test the calendar on the physical Android phone that will run the internal build.
- [x] Run the full app tests and TypeScript check.
- [x] Run Expo dependency checking, Expo Doctor, notices checking, store metadata validation, and the Android export.
- [x] Commit and push the finished feature.
- [x] Record the exact clean commit hash. Build the AAB from that commit only.

If the final feature adds any native dependency, config plugin, permission, database migration, network request, or new data handling, stop here. Update the build, migration, privacy, and Play declarations before continuing.

## 5. Build and upload the first production AAB

From the repository root:

```bash
npx eas-cli@latest build --platform android --profile production
```

This is an EAS cloud build and may consume plan build minutes. Wait for it to finish, then download the `.aab` file.

Before uploading, verify the build record says:

- App: Eatlog
- Package: `com.sgaret.eatlog`
- Profile: `production`
- Artifact: Android App Bundle, not APK

Upload the AAB manually to Play Console's internal-testing track. Do not upload the Preview APK.

- [x] Production AAB built successfully
- [x] AAB uploaded to internal testing
- [x] Play App Signing accepted
- [x] Version code recorded
- [x] EAS build ID recorded

## 6. Create the real Play products

Create these only under package `com.sgaret.eatlog`.

### Manok subscription

- Product ID: `eatlog_manok`
- Base plan ID: `monthly`
- Billing period: one month
- Philippines price: PHP 79
- Trial offer ID: `one-month-trial`
- Trial: one month free for eligible new subscribers
- Renewal: PHP 79 each month until canceled

Activate the base plan and trial offer.

### Itik one-time purchase

- Product ID: `eatlog_itik`
- Purchase option ID: `buy`
- Purchase type: Buy
- Multiple quantities: Off
- Philippines price: PHP 799

Activate the purchase option.

Do not create `eatlog_itik_lifetime`. That identifier is obsolete.

- [x] Manok base plan active
- [x] Manok trial offer active
- [x] Itik purchase option active
- [x] Philippines prices show PHP 79 and PHP 799

## 7. Finish RevenueCat production mapping

In the existing Eatlog RevenueCat project:

1. Confirm the Google Play app package is `com.sgaret.eatlog`.
2. Confirm Google service-account validation is green after the AAB and products exist.
3. Import Manok as `eatlog_manok:monthly` if RevenueCat shows the base-plan suffix.
4. Import `eatlog_itik` as a non-consumable product.
5. Attach both products to entitlement `eatlog_paid`.
6. Attach Manok to package `$rc_monthly` in offering `default`.
7. Attach Itik to package `$rc_lifetime` in offering `default`.
8. Keep the Test Store products attached for the Preview app.

- [x] `default` offering returns the Google Manok and Itik products
- [x] Test Store Preview products still work
- [x] Restore behavior remains `Transfer to new App User ID`

## 8. Connect notifications and the webhook

Configure the production RevenueCat webhook:

- URL: `<production Worker URL>/v1/revenuecat/webhook`
- Header name: `Authorization`
- Header value: exactly the full value saved as `REVENUECAT_WEBHOOK_AUTH`

Connect RevenueCat's Google real-time developer notification topic to the Eatlog app in Play Console. Send the available test notifications.

- [x] RevenueCat webhook test returns HTTP 200
- [x] Google real-time developer notifications are connected
- [x] Test notification succeeds
- [x] Preview purchase smoke test still succeeds afterward

## 9. Test the Play-installed build

Add the Google accounts used for testing as Play license testers. Install Eatlog from the internal-testing Play link. Do not sideload the AAB or a production APK.

Test all of these on the Play-installed build:

- [ ] Pugo starts and local logging works without buying anything
- [ ] Paywall shows the localized PHP 79 and PHP 799 prices
- [ ] Eligible Manok account sees the one-month trial
- [ ] Manok purchase unlocks paid access after relaunch
- [ ] Manage subscription opens Google Play
- [ ] Canceling Manok leaves access active until its reported expiration
- [ ] Restore purchases recovers Manok under the same Google account
- [ ] After Manok stops renewing, Itik can be purchased
- [ ] Itik unlocks paid access and survives relaunch
- [ ] Restore purchases recovers Itik after reinstall
- [ ] Refunding or revoking Itik removes access after RevenueCat processes it
- [ ] A temporary network or RevenueCat failure does not randomly remove valid paid access
- [ ] RevenueCat's customer record and the app show the same plan
- [ ] Scan, Photo, Describe, and adaptive planning enforce the correct access
- [ ] Preview remains usable with its Test Store products

Do not start the closed-test clock until these checks pass.

## 10. Run the required closed test

1. Promote the same tested AAB to closed testing.
2. Add the private Google Group containing the testers.
3. Send the Play opt-in link.
4. Confirm at least 12 testers have opted in using their Android Play accounts.
5. Keep at least 12 opted in for 14 continuous days.
6. Collect useful tester feedback and fix release-blocking defects.
7. Apply for production access when Play Console allows it.

- [ ] Twelve-testers-for-fourteen-days requirement completed
- [ ] Production access approved
- [ ] No unresolved P0 or P1 billing issue

## 11. Release and move personal data

Release the tested build in stages. Start with 10 percent and check Play vitals, RevenueCat entitlement errors, Worker errors, restore failures, refunds, and Gemini cost before increasing the rollout.

Keep using Preview until the Play-installed production app is ready for personal use. Then:

1. Stop logging new data in Preview.
2. Create a fresh `.eatlog-backup` from Preview.
3. Save two copies and verify the file can be selected for restore.
4. Install or update Eatlog through Google Play.
5. Restore the backup into the Play app.
6. Buy, restore, or receive the production entitlement separately. Billing is not stored in the backup.
7. Compare meals, weights, targets, and photos between both apps.
8. Create a new backup from the production app.
9. Keep Preview installed but unused for seven days.
10. Remove Preview only after the production data and backup are verified.

Test Store purchases do not transfer to Google Play. Local Eatlog data does.

## Release finish line

The Android release is ready only when every checkbox above is complete, the exact Play-installed build passed billing tests, the website URLs are live, rollback information is recorded, and the owner accepts the measured Manok and Itik AI cost.
