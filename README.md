# Eatlog

> Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog.

I built Eatlog for myself around a simple rule: everything I need, nothing I don't. Fast input, editable estimates, useful trends, and a diary that stays on my phone. No account to create. No cloud diary. No streak mascot waiting to judge lunch.

Photo when you're in a hurry. Manual when you're not. Fix what it guessed wrong, save the meal, and move on with your day.

## One meal, four moves

1. **Log it.** Take a photo, describe the meal, search, reuse something familiar, or enter it yourself.
2. **Review it.** Edit names, portions, grams, calories, and macros before anything enters the diary. The robot does not get the last word.
3. **Read it.** See today's calories and macros, then use Diary and Analytics when you want the longer view.
4. **Decide.** When enough evidence exists, Eatlog can propose a target change. Nothing moves until you accept it.

## Everything I need

- A fast Today view for calories and macros.
- A proper diary with meals, photos, edits, and undo.
- Weight trend, average intake, calorie history, and logging consistency.
- Saved foods and past meals that make repeat logging quick.
- Meal cards for sharing without turning Eatlog into a social network.
- Restorable backups, readable CSV exports, and a real delete-all button.
- Optional weight sync with Health Connect on Android.

## Nothing I don't

- No Eatlog account. There is nothing to forget a password for.
- No cloud copy of the food log, weight history, targets, or meal photos.
- No ads or third-party analytics.
- No forced online estimate. Manual logging and saved history still work without one.
- No automatic plan changes. The plan has to ask first.
- No medical cosplay. Eatlog records estimates and trends. It does not pretend to be a doctor.

## The birds

- **Pugo.** Food logging, weight tracking, Diary, Analytics, and 5 photo or description estimates per rolling 24 hours.
- **Manok.** Adds follow-up re-estimates, higher estimate limits, and adaptive plan recommendations through a monthly plan.
- **Itik.** The same paid features with a one-time lifetime purchase.

Current prices and terms appear in the app store purchase sheet.

## Platforms

Eatlog is built for Android and iPhone. The first public release is planned for Android, with iPhone to follow.

## Run it locally

Eatlog uses Expo and React Native with native modules. Use a native development build. Expo Go cannot run the full app.

```bash
npm install
npm start
npm run android
```

Running the iPhone build requires macOS and Xcode:

```bash
npm run ios
```

## Checks

```bash
npm test
npm run typecheck
npm run store:metadata:check
```

## License

[BSD Zero Clause](LICENSE)
