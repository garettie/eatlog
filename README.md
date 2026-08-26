# Eatlog

Eatlog is a local-first food, nutrition, and weight log for adults. Record meals manually, reuse saved foods and past meals, or request an editable estimate from a photo or written description.

Core records stay on the device. Eatlog has no app account, cloud food or weight database, ads, or third-party analytics. Online food search, AI meal estimates, and store entitlement checks run only for the features that need them.

Eatlog is for adult general wellness. It is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Nutrition data, calculated targets, trends, and photo or description results are estimates. Review entries before saving them.

## What Eatlog does

- Log food manually, from recent or pinned foods, or by reusing a past meal with a new photo.
- Search USDA FoodData Central and Open Food Facts.
- Request editable meal estimates from a photo or written description after explicit consent.
- Review daily calories and macros in Today and Diary.
- Track weight, calorie history, and logging consistency in Analytics.
- Review adaptive plan suggestions and choose whether to apply them.
- Create restorable Eatlog backups and readable, non-restorable CSV exports.
- Turn a logged meal into a local share card, then save it or share it through the operating system.
- Optionally read and write Weight through Health Connect on Android.

## Local-first boundaries

Profiles, targets, food entries, weights, and saved meal photos use on-device SQLite and app storage. Manual logging, saved history, past-meal reuse, and analytics do not require a network connection.

Eatlog contacts remote services only for named online actions:

| Action | Data path |
| --- | --- |
| Photo or description estimate | User-selected content goes through the Eatlog Cloudflare Worker to Google Gemini after consent. |
| USDA search and food detail | The app sends the search through the Eatlog Worker. |
| Open Food Facts full search | The app contacts Open Food Facts only after an explicit full search. |
| Purchase and entitlement check | Google Play or Apple processes the purchase; RevenueCat verifies entitlement metadata. |

Withdrawing or declining AI consent keeps local logging, saved history, food search, and analytics available. Android Health Connect access is optional and limited to Weight. iOS v1 has no HealthKit or Apple Health integration.

## Access tiers

| Tier | Access |
| --- | --- |
| Pugo | Free local food and weight logging. |
| Manok | Monthly access to AI estimates and local adaptive recommendations, with a one-month trial for eligible users. |
| Itik | One-time lifetime access to the paid features. |

Store purchase sheets provide the current localized price and terms. Android and iOS purchases do not grant cross-store entitlement.

## Platform and release status

Eatlog is an Expo and React Native app for Android and iPhone. Android is the first public release target, followed by the Apple App Store. The repository contains release worksheets and metadata, but those files are preparation records rather than proof of a live store release.

The app uses native modules, so development requires a native build or development client. Expo Go does not cover the full application.

## Repository layout

```text
src/
  components/    Shared interface components and sheets
  context/       Consent, entitlement, and maintenance state
  db/            SQLite schema, migrations, and queries
  navigation/    Root, tab, and profile navigation
  screens/       Today, Diary, Analytics, Profile, and setup flows
  services/      Backup, billing, estimates, search, and platform services
  utils/         Nutrition, chart, calendar, sharing, and safety logic
worker/           Cloudflare Worker for food data, AI, and entitlements
plugins/          Expo config plugins for native release behavior
release/          Store, privacy, legal, QA, artwork, and runbook sources
scripts/          Metadata, artwork, notice, and evaluation tools
```

The mobile app uses TypeScript, React Native, Expo, React Navigation, NativeWind, and `expo-sqlite`. The Worker is a separate TypeScript package under `worker/`.

## Development

Install dependencies:

```bash
npm install
```

Start Metro for the development variant:

```bash
npm start
```

Build and run a native development app:

```bash
npm run android
npm run ios
```

The iOS command requires macOS and Xcode. Android development requires the Android SDK and a compatible JDK.

## Runtime configuration

The app reads public build-time settings from Expo environment variables:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_FOOD_WORKER_URL` | Enables Worker-backed USDA search and Gemini estimates. |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | Enables store entitlement checks. |
| `EXPO_PUBLIC_REVENUECAT_TEST_STORE_ALLOWED` | Allows a RevenueCat Test Store key only in the preview build. |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | Sets the public support address and Open Food Facts user agent. |
| `EXPO_PUBLIC_PRIVACY_URL` | Sets the published privacy policy link. |
| `EXPO_PUBLIC_TERMS_URL` | Sets the published terms link. |
| `EXPO_PUBLIC_SUPPORT_URL` | Sets the published support link. |

Do not put USDA, Gemini, RevenueCat secret, signing, or rate-limit credentials in the mobile app. The Worker owns those secrets. See [`worker/README.md`](worker/README.md) for local Worker setup and [`owner_setup.md`](owner_setup.md) for release configuration.

## Verification

Run the mobile checks from the repository root:

```bash
npm test
npm run typecheck
npm run notices:check
npm run store:metadata:check
npm run store:artwork:check
npm run site:check
```

Run Worker checks separately:

```bash
cd worker
npm install
npm test
npm run typecheck
```

## Store listing sources

[`release/store/metadata.mjs`](release/store/metadata.mjs) is the canonical source for the Google Play and Apple App Store descriptions, release notes, reviewer notes, and product facts. Run `npm run store:metadata:check` after changing public product claims.

The remaining submission sources live in [`release/store/`](release/store/). Store worksheets contain draft answers and owner-controlled fields. Reconcile them with the signed release binary and current console forms before submission.

## License

Eatlog is available under the [BSD Zero Clause License](LICENSE).
