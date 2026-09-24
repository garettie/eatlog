# Eatlog

> Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog.

Eatlog is a free, open-source food and weight log. Your diary lives on your device. Log food by hand, search foods, reuse a past meal, or add a photo. Today shows calories and macros; Diary and Analytics give you the longer view. Targets and adaptive suggestions are yours to review and change, with no purchase required.

I built Eatlog for myself around a simple rule: everything I need, nothing I don't. I wanted quick input, editable estimates, useful trends, and a diary that stays on my phone. No account to create. No streak mascot judging lunch.

## Optional AI estimates

Eatlog works without AI or an API key. If you want photo, description, meal, or component estimates, choose a route in **Profile → AI estimates**:

- **My key:** Add your own Google AI Studio Gemini API key. Eatlog sends the selected photo or text directly to Google. Eatlog does not charge for this route. Google controls its availability, quotas, billing, and data treatment; a Google project with billing enabled may incur charges. Check [Google's Gemini API terms](https://ai.google.dev/gemini-api/terms) and [billing guide](https://ai.google.dev/gemini-api/docs/billing) before using it.
- **Eatlog AI:** The optional one-time **Eatlog Omelette** purchase lets you use Eatlog-hosted estimates without your own key. Selected estimate content goes to Eatlog's Worker and then Google. Hosted use has a rolling allowance of 30 operations per 24 hours and 250 per 30 days. The store shows the current localized price before purchase.

A paid user may still choose My key. Both routes return estimates to review before saving. Neither route is needed for local logging, weight tracking, analytics, adaptive suggestions, backup, export, or meal sharing.

The key is kept in the device credential store and shown only as its first and last four characters on the AI estimates screen. It is excluded from backups and CSV exports. Removing it from Eatlog does not revoke it at Google.

## Your data

The profile, meals, weights, photos, and targets stay in app-private storage unless you choose an online action or export/share them. USDA food search goes through the Eatlog Worker; an explicit full search also contacts Open Food Facts directly. Purchase checks use RevenueCat and a random installation ID, even if you never send an AI estimate. See the [privacy policy](release/site/privacy.md) and [data inventory](release/privacy/DATA_INVENTORY.md) for each route.

Create a restorable `.eatlog-backup` archive, export readable CSV files, or delete local data in Profile. CSV is for reading and cannot be restored. Android can optionally read and write Weight through Health Connect. iOS v1 has no Apple Health integration.

## Install and develop

Android is the first planned public release; iOS follows. This repository is source code, not a published store install. Native modules require a development build; Expo Go cannot run the full app.

```bash
npm ci
npm start
npm run android
```

On macOS with Xcode, `npm run ios` starts an iOS development build. Manual logging needs no Worker or billing setup. To work on optional online routes, supply your **own** preview configuration through the Expo environment and follow [native configuration](release/config/NATIVE_CONFIGURATION.md) and [Worker setup](worker/README.md). Do not use or commit the owner's keys. The `preview` EAS profile builds an isolated `Eatlog Preview` APK on the `subscription-preview` channel; it is not a production release.

Run the repository checks with:

```bash
env TMPDIR=/tmp npm test
npm run typecheck
npm run store:metadata:check
npm run store:artwork:check
npm run site:check
```

## Contribute

File bugs and proposed changes in [GitHub issues](https://github.com/garettie/eatlog/issues), or send a pull request with a focused change. Code, docs, accessibility work, and food-data corrections are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup and checks. Send security reports to the [published support email](mailto:sggajitos@gmail.com) instead of posting secrets or exploit details in a public issue.

The source code is licensed under [0BSD](LICENSE). That license does not include paid access to Eatlog-hosted AI or rights to third-party services and data.
