# Eatlog

> Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog.

Yet another AI calorie and macro tracker. But this time it's free and open source. You bring your own Gemini key from Google AI Studio, and Google's free tier pretty much covers one person forever, or until Google decides to tighten it up.

I made it for myself. I wanted something quick to log in, that let me fix the AI's guesses, that showed my weight trend instead of daily noise, and that kept my diary on my phone. There's no account and no cloud.

Website: [eatlog.pages.dev](https://eatlog.pages.dev)

## What it does

- Scan a photo, upload one, or type what you ate. Taglish works. The AI splits the meal into ingredients with grams and macros for each.
- Fix the estimate before saving. Change the portion, edit the grams, or tell it what it missed and it redoes the estimate.
- Search foods, log manually, or reuse a past meal. None of that needs a key.
- Track weight as a trend line, with your actual pace against your plan and when you'd hit your goal.
- Get calorie target suggestions once there's enough data. It asks first, nothing changes on its own.
- Back up, restore, export to CSV, or wipe everything from Profile.

## AI estimates

The app works fine without AI. If you want photo or text estimates, go to **Profile → AI estimates** and pick one:

**My key.** Paste your own Google AI Studio Gemini key. Your photo or text goes straight from your phone to Google, it doesn't pass through me. I don't charge for this. Google's free tier is plenty for one person, but Google sets the limits and can change them, and on the free tier they can use what you send to improve their models. If you turn on billing for your Google project, Google can charge you. Check their [API terms](https://ai.google.dev/gemini-api/terms) and [billing guide](https://ai.google.dev/gemini-api/docs/billing).

**Eatlog AI.** For people who'd rather not make a key. It's unlocked by the Eatlog Omelette purchase, which is a one-time payment. Your photo or text goes through my Cloudflare worker to Google, using my key. It's capped at 30 estimates per rolling 24 hours and 250 per rolling 30 days so nobody burns through it. The Play Store shows the price in your currency before you buy.

If you paid, you can still switch back to My key whenever. Either way, you review the estimate before it's saved.

About your key: it's kept in your phone's credential store, the app only ever shows its first and last four characters, and it's left out of backups and CSV exports. Removing it from Eatlog doesn't revoke it on Google's side, so do that in AI Studio if you need to.

## Your data

Everything you log stays on your phone, in the app's private storage. It only leaves in these cases:

- AI estimates go to Google, straight from your phone with My key or through my worker with Eatlog AI.
- Food search goes to USDA through my worker. A full search also asks Open Food Facts directly.
- The app checks purchases with RevenueCat using a random install ID, even if you never use AI.
- Backups and exports go wherever you send them.

The [privacy policy](release/site/privacy.md) has the full details.

Backups are `.eatlog-backup` files you can restore later. CSV exports are for spreadsheets and can't be restored. On Android, weight can sync with Health Connect.

Eatlog isn't a medical device. The estimates and targets can be wrong.

## Install

It's not on the Play Store yet, I'm still testing. Android first, iOS maybe later.

To build it yourself you need Node, the Android SDK (Android Studio is the easy way to get it), and a phone with USB debugging or an emulator. Expo Go can't run it because of the native modules.

```bash
npm ci
npm run android
```

That builds a development version of the app, installs it, and starts the bundler. Once it's installed, `npm start` is enough.

With no setup you get everything local, plus My key if you paste in your own Gemini key. USDA search, Eatlog AI, and purchases need your own worker and RevenueCat project. See [worker/README.md](worker/README.md), then put your URLs and keys in `.env.local`.

## Contributing

Found a bug or a wrong food value? Open an [issue](https://github.com/garettie/eatlog/issues). PRs are welcome too. [CONTRIBUTING.md](CONTRIBUTING.md) lists the checks to run first.

For security problems, [email me](mailto:sggajitos@gmail.com) instead of opening a public issue.

## License

[0BSD](LICENSE), so you can do pretty much anything with the code. That doesn't cover free use of Eatlog AI, since that's my key and my bill, or any third-party services and data the app uses.
