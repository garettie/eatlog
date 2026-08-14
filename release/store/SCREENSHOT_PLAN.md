# Store screenshot plan

No screenshot is complete until it is captured from a running release-candidate binary. Do not use generated, composited, redrawn, or platform-swapped UI. Use only synthetic profile/log data and staged, non-identifying food photos.

## Required capture sets

- Google Play phone: seven portrait screenshots from the Android release candidate. Use a device/emulator resolution accepted by Play: 320–3840 px per side, with the long side no more than twice the short side. Target at least 1080×1920 to meet the four-screenshot recommendation format. PNG or JPEG, no alpha.
- App Store iPhone: the same seven moments recaptured from the iOS release candidate. Target an accepted 6.9-inch portrait size such as 1320×2868; 6.5-inch sizes are the documented fallback when 6.9-inch assets are unavailable. PNG or JPEG, no alpha. No iPad set because `supportsTablet` is false.
- Capture one to ten Apple screenshots and two to eight Play screenshots. Keep all seven when each tells a distinct part of the shipped flow. An onboarding-consent capture is optional and should be added only if it helps explain the permissions/data-use declaration.

## Synthetic seed

- Profile: `Release Tester`; birth date `1990-02-03`; female; 165 cm; 65.0 kg; moderate activity; maintain; moderate protein.
- Foods: `Synthetic rice bowl` (500 kcal, 25 g protein, 70 g carbs, 13 g fat) and `Synthetic toast` (120 kcal, 4 g protein, 20 g carbs, 3 g fat).
- History: 30 days of plausible synthetic meals; 21 complete food-log days; eight synthetic weigh-ins from 65.4 kg to 65.0 kg; no real names, health records, locations, notifications, or account details.
- Photos: staged meal images made for QA with no faces, labels containing personal data, geotags, or copyrighted packaging as the focal point. Strip metadata before capture.
- Provider results: use a real running Scan/Describe/search flow with the synthetic input. Do not inject a result only for the screenshot. Gemini Scan requires explicit cost approval.

## Shot list

| Order | Screen and state | What must be visible | Alt text source |
| --- | --- | --- | --- |
| 1 | Today | Calorie/macro progress, one recent meal, center Add control | Today shows calorie and macro progress with the center Add control. |
| 2 | Estimate review after consent | Editable components, amounts, confidence, nutrition; no transmission disclosure overlay after the user chose Okay | Editable meal estimate lists food components, amounts, and nutrition. |
| 3 | Food search | Useful common USDA results and the explicit full-search action/provider context | Food search shows common USDA results and explicit full-search options. |
| 4 | Diary | Meals, totals, long synthetic food name, and one staged meal photo | Diary shows meals, entries, totals, and a saved meal photo. |
| 5 | Analytics | Weight trend, calorie history, and 30-day logging consistency | Analytics shows weight trend, calorie history, and logging consistency. |
| 6 | Plan review | Evidence and proposed target with Accept and Keep visible | Plan review shows a suggested change with Accept and Keep choices. |
| 7 | Profile data ownership | Backup/restore, export, privacy with Enabled/Off estimate state, and delete-all entry points | Profile shows backup, export, privacy, and local data controls. |

## Capture checks

1. Use final Onest fonts, dark theme, icon, copy, safe areas, status/navigation treatment, and release service configuration.
2. Capture Android and iOS separately. Do not reuse one platform's image for the other.
3. Remove debug banners, development menus, notifications, carrier names that reveal a person, and test endpoints. Keep normal system chrome only when it matches store guidance.
4. Do not add marketing taglines, device frames, badges, prices, ratings, awards, or controls that are absent from the app.
5. Inspect smallest/largest phones, largest text, keyboard, sheets, long names, large totals, VoiceOver/TalkBack labels, touch targets, safe areas, and reduced motion before selecting final shots.
6. Record source commit, app version/build, platform, device/OS, original dimensions, color type/transparency result, capture time, and tester. Run the artifact validator after files are placed in the account-controlled upload set.

Current source references: [Google preview assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) and [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/). Device captures remain **PHYSICAL DEVICE / CREDENTIAL** blocked in this environment.
