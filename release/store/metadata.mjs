export const storeMetadata = {
  sourceVersion: 2,
  locale: "en-US",
  product: {
    name: "Eatlog",
    valueProposition:
      "Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog.",
    audience:
      "Adults using Eatlog for general wellness nutrition and weight logging.",
    androidPackage: "com.sgaret.eatlog",
    iosBundleIdentifierCandidate: "com.sgaret.eatlog",
    releaseOrder: ["Google Play", "Apple App Store"],
    commercial: {
      acquisitionPrice: "free",
      plans: ["Eatlog", "Eatlog Omelette"],
      hostedProductId: "eatlog_itik",
      hostedPurchaseType: "one-time non-consumable",
      localizedPriceSource: "store purchase sheet",
      legacySubscriptionProductId: "eatlog_manok",
      newSubscriptionSales: false,
      inAppPurchases: true,
      crossStoreEntitlement: false,
    },
    accountRequired: false,
    localFirst: true,
    remoteFeatures: [
      "My key direct Gemini estimates",
      "Eatlog AI hosted estimates",
      "USDA search and detail",
      "Open Food Facts explicit full search",
    ],
    deferredFeatures: [
      "HealthKit",
      "Apple Health",
      "cloud sync",
      "social features",
    ],
  },
  google: {
    title: "Eatlog",
    shortDescription: "Free, open-source AI calorie tracker. Bring your own Gemini key.",
    fullDescription: `Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog.

Snap your meal and Eatlog's AI splits it into foods, with grams, calories, and macros for each. Fix anything it got wrong before you save. Eatlog is a free, open-source calorie and macro tracker with no account, and your diary stays on your phone.

Bring your own key. Paste your own Google Gemini API key from Google AI Studio, and Eatlog sends your photo or description straight to Google. Eatlog doesn't charge for this. Google's free tier is usually enough for one person, but Google sets the limits, can charge a project with billing turned on, and on the free tier may use what you send to improve its models.

No key? Eatlog Omelette is a one-time purchase that runs your estimates through Eatlog instead, up to 30 operations per rolling 24 hours and 250 per rolling 30 days. You see the price in your currency before you buy, and you can switch back to your own key anytime.

Scan with the camera, pick a photo, or type what you ate. Tell it what it missed and it redoes the estimate. You can also search foods, enter a meal by hand, or reuse a past one, no key needed.

Log your weight and see the trend instead of the daily noise, your pace against your plan, and when you'd reach your goal. Once there's enough data, Eatlog suggests a new calorie target, and nothing changes until you accept it.

Everything you log stays on your phone. Back it up and restore it, export it to CSV, share a meal card, or delete it all from Profile. On Android, your weight can sync with Health Connect.

Food entries, nutrition targets, and AI results are estimates. Review them before relying on them. Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a qualified healthcare professional for medical advice, diagnosis, or treatment.`,
    releaseNotes:
      "First release. Snap or describe a meal for an AI estimate with your own Gemini key, or buy Eatlog Omelette once to skip the key. Logging, weight trends, backups, and export are free.",
    category: "Health & Fitness",
    healthAppsCategory: "Nutrition and Weight Management",
    requiredHealthDisclaimer:
      "Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition.",
  },
  apple: {
    title: "Eatlog",
    subtitle: "AI food log, bring your key",
    keywords:
      "calories,macros,calorie ai,food scan,meal photo,nutrition,food diary,weight,tracker,gemini",
    description: `Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog.

Snap your meal and Eatlog's AI splits it into foods, with grams, calories, and macros for each. Fix anything it got wrong before you save. Eatlog is a free, open-source calorie and macro tracker with no account, and your diary stays on your phone.

Bring your own key. Paste your own Google Gemini API key from Google AI Studio, and Eatlog sends your photo or description straight to Google. Eatlog doesn't charge for this. Google's free tier is usually enough for one person, but Google sets the limits, can charge a project with billing turned on, and on the free tier may use what you send to improve its models.

No key? Eatlog Omelette is a one-time purchase that runs your estimates through Eatlog instead, up to 30 operations per rolling 24 hours and 250 per rolling 30 days. You see the price in your currency before you buy, and you can switch back to your own key anytime.

Scan with the camera, pick a photo, or type what you ate. Tell it what it missed and it redoes the estimate. You can also search foods, enter a meal by hand, or reuse a past one, no key needed.

Log your weight and see the trend instead of the daily noise, your pace against your plan, and when you'd reach your goal. Once there's enough data, Eatlog suggests a new calorie target, and nothing changes until you accept it.

Everything you log stays on your phone. Back it up and restore it, export it to CSV, share a meal card, or delete it all from Profile.

Food entries, nutrition targets, and AI results are estimates. Review them before relying on them. Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a qualified healthcare professional for medical advice, diagnosis, or treatment.`,
    promotionalText:
      "Snap a meal, get calories and macros. Free and open source with your own Gemini key, or buy Eatlog Omelette once and skip the key.",
    releaseNotes:
      "First release. Snap or describe a meal for an AI estimate with your own Gemini key, or buy Eatlog Omelette once to skip the key. Logging, weight trends, backups, and export are free.",
    primaryCategory: "Health & Fitness",
    secondaryCategory: "Food & Drink",
    firstVersionReleaseNotesFieldAvailable: false,
  },
  reviewerNotes: {
    google: `Eatlog is free and has no login. Manual logging, saved meals, weight, Diary, Analytics, adaptive target suggestions, backups, export, and sharing need no purchase or API key. Eatlog Omelette is a one-time non-consumable hosted-AI purchase. Existing subscribers retain legacy access, but the app does not offer a new subscription.

To review Eatlog Omelette, sign in to Google Play with the license-tester account listed in App access. Open Profile > Plan, choose Eatlog Omelette, and complete the purchase with the test payment method. License testers are not charged, and no personal Google key is needed.

Complete onboarding with synthetic adult data. Use Add for manual entry. For AI, open Profile > AI estimates and choose Eatlog AI after the test purchase, then accept its separate consent. Scan opens the camera; Photo opens the picker; Describe uses typed text. A selected photo and optional meal title, or typed text and limited re-estimate context, go through Eatlog's Worker to Google Gemini. My key sends selected content directly to Google and its setup validates a key with Google before a meal estimate. Review every result before saving. USDA search uses the Worker; explicit full search also contacts Open Food Facts directly. Local logging works offline.

Android only: Profile > Health Connect requests Weight read/write after Connect. Backup and restore uses .eatlog-backup archives; CSV exports cannot be restored. Delete all data has two confirmations.`,
    apple: `Eatlog is free and has no login. Manual logging, saved meals, weight, Diary, Analytics, adaptive target suggestions, backups, export, and sharing need no purchase or API key. Eatlog Omelette is a one-time non-consumable hosted-AI purchase. Existing subscribers retain legacy access, but the app does not offer a new subscription.

To review Eatlog Omelette, open Profile > Plan, choose Eatlog Omelette, and complete the purchase with a sandbox account. Sandbox purchases are not charged, and no personal Google key is needed.

Complete onboarding with synthetic adult data. Use Add for manual entry. For AI, open Profile > AI estimates and choose Eatlog AI after the sandbox purchase, then accept its separate consent. Scan opens the camera; Photo opens the picker; Describe uses typed text. A selected photo and optional meal title, or typed text and limited re-estimate context, go through Eatlog's Worker to Google Gemini. My key sends selected content directly to Google and its setup validates a key with Google before a meal estimate. Review every result before saving. USDA search uses the Worker; explicit full search also contacts Open Food Facts directly.

Backup and restore uses .eatlog-backup archives; CSV exports cannot be restored. Delete all data has two confirmations. iOS v1 has no Health Connect or Apple Health integration.`,
  },
  artwork: {
    featureGraphicAltText:
      "Eatlog white egg-shaped nutrition scale mark centered on a dark background.",
    screenshotAltText: [
      "Editable meal estimate lists food components, amounts, and nutrition.",
      "AI estimates settings show My key and Eatlog AI choices.",
      "Today shows calorie and macro progress with the center Add control.",
      "Diary shows meals, entries, totals, and a saved meal photo.",
      "Analytics shows weight trend, calorie history, and logging consistency.",
      "Plan review shows a suggested change with Accept and Keep choices.",
      "Profile shows backup, export, privacy, and local data controls.",
    ],
  },
  ownerRequiredFields: [
    "public developer or legal name",
    "monitored support email",
    "privacy policy URL",
    "Terms of Use URL",
    "support URL",
    "review contact name, email, phone, and time zone",
    "launch countries and final console pricing",
  ],
};
