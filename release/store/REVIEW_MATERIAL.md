# Eatlog store review material

Use the `reviewerNotes` fields in [metadata.mjs](metadata.mjs) as the copy source. This file is a preview walkthrough, not a submitted store record. Add review contacts and the license-tester email credentials only in restricted console fields.

## Preview walkthrough

1. Install the isolated `Eatlog Preview` APK (`com.sgaret.eatlog.preview`, `subscription-preview`). Complete onboarding with synthetic adult data from [SCREENSHOT_PLAN.md](SCREENSHOT_PLAN.md). No login, purchase, or API key is required for local features.
2. Open Add → Enter manually. Log a synthetic meal. Check Today, Diary, Analytics, weight entry, and adaptive target review. All are free. Search foods locally; online USDA uses the Worker, and explicit full search also contacts Open Food Facts directly.
3. To review **My key**, only use a reviewer-owned disposable Google project/key. Saving or replacing the key checks it directly with Google before a meal is sent. Select My key, then Scan, Photo, Describe, or re-estimate a meal/component. The selected content goes directly to Google, outside Eatlog's Worker. Google's own quota, billing, region, and data terms apply. A personal key is not required for restricted-feature review.
4. To review **Eatlog AI without payment or a key**, use a preview build wired to RevenueCat Test Store. Open Profile → Plan, choose Eatlog Omelette, and select **Success** in the Test Store purchase dialog. Return to Profile → AI estimates, select Eatlog AI if a key is also saved, accept the separate hosted consent, then Scan, Describe, and re-estimate. A selected estimate goes through Eatlog's Worker to Google. The Worker enforces 30 combined operations per rolling 24 hours and 250 per rolling 30 days. If the preview offering lacks the one-time product, this path is unavailable and the offering must be fixed before review.
5. Cancel a Test Store purchase, try Restore purchases, restart, and check that access reflects the actual Test Store state. Existing subscriptions retain restore/manage access but no new monthly package should be offered.
6. In Diary, tap a meal image or food-icon rail, or swipe the meal and select Share immediately left of Delete. Swipe the preview between Photo, Framed, and Nutrition. The dots, permanent Eatlog mark, Save image, and Share stay visible without vertical scrolling; a photo-less meal uses Nutrition. Save or share the locally rendered 1080 by 1920 PNG through system UI. Standalone foods have no Share action.
7. In Profile, create a `.eatlog-backup`, preview/restore it with confirmation, export readable CSV, and use Delete all data with its two confirmations. CSV cannot be restored. Removing a key locally does not revoke it at Google. On Android, Health Connect asks for Weight read/write only after Connect; iOS v1 has no Health Connect or Apple Health route.

Use synthetic photos and text. Review estimates before saving; their nutrition values can be wrong. The app has no medical function.

## Privacy and access notes

My key consent is tied to the saved key and route. Hosted consent is a separate versioned choice. Profile → Privacy withdraws hosted consent; Profile → AI estimates removes a key. Capturing a photo or reusing a saved meal locally sends no estimate. Worker/RevenueCat access checks and USDA search can still contact Eatlog even when My key estimates bypass it. Backup/CSV exclude the key, install ID, grants, and quota records.

Production Play review uses license testing. The owner lists the reviewer accounts as Play license testers and gives their email credentials in App access; those accounts buy Omelette without charge, with no personal Google key. The Test Store Success dialog is confined to preview. Never tell a reviewer that all functions are unrestricted or that they must pay.

For each executed run, record commit, app version/build, Worker version, device/OS, selected route, Test Store offering/product, outcome, and real screenshot paths. Provider calls and store/account results remain unverified until actually exercised.
