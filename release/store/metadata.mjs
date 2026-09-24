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
    shortDescription: "Free, open-source food logging. Your diary stays yours.",
    fullDescription: `Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog.

Eatlog is a free, open-source food and weight log. Keep a diary on your phone, with no account to create.

Log lunch, then eat it.
Enter food by hand, search foods, or reuse a past meal. Today shows calories and macros. Diary keeps the details. Analytics shows your weight trend, intake, and logging consistency. Review target suggestions before accepting them. These tools are free.

AI estimates are optional. Add your own Google Gemini API key to send a selected photo or description directly to Google, then edit the result before saving. Eatlog does not charge for My key. Google sets its own availability, limits, data terms, and possible charges.

Eatlog Omelette is an optional one-time purchase for Eatlog-hosted AI estimates without your own key. It has a rolling allowance of 30 operations per 24 hours and 250 per 30 days. A purchase never changes your local feature access, and you can still choose My key. See the localized price in the store purchase sheet.

Make a restorable backup, export readable CSV, share a meal card, or delete local data when you choose. Android also offers optional Weight sync with Health Connect.

Food entries, nutrition targets, and AI results are estimates. Review them before relying on them. Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a qualified healthcare professional for medical advice, diagnosis, or treatment.`,
    releaseNotes:
      "Initial release. Free, open-source food logging with manual entry, saved meals, Diary, Analytics, backups, and optional AI estimates through your own key or Eatlog Omelette.",
    category: "Health & Fitness",
    healthAppsCategory: "Nutrition and Weight Management",
    requiredHealthDisclaimer:
      "Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition.",
  },
  apple: {
    title: "Eatlog",
    subtitle: "Free, open-source food log",
    keywords:
      "nutrition,calories,macros,meals,diary,weight,tracker,food log,backup",
    description: `Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog.

Eatlog is a free, open-source food and weight log. Your diary stays on your phone. No account to create.

LOG LUNCH, THEN EAT IT
Enter food by hand, search foods, or reuse a past meal. Today shows calories and macros. Diary keeps the details. Analytics shows weight trend, intake, and logging consistency. Target suggestions wait for your decision. All local tools are free.

AI estimates are optional. With your own Google Gemini API key, a selected photo or description goes directly to Google. Edit each estimate before saving. Eatlog does not charge for My key; Google controls its limits, billing, and data terms.

Eatlog Omelette is an optional one-time purchase for Eatlog-hosted AI without your own key. Hosted use allows 30 operations per rolling 24 hours and 250 per rolling 30 days. The store shows the current localized price. You can still choose My key after buying.

Create a restorable backup, export readable CSV, share a meal card, or delete local data.

Food entries, nutrition targets, and AI results are estimates. Review them before relying on them. Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a qualified healthcare professional for medical advice, diagnosis, or treatment.`,
    promotionalText:
      "Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog. Free, open-source food logging, with optional AI estimates.",
    releaseNotes:
      "Initial release. Free, open-source food logging with manual entry, saved meals, Diary, Analytics, backups, and optional AI estimates through your own key or Eatlog Omelette.",
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
      "Today shows calorie and macro progress with the center Add control.",
      "Editable meal estimate lists food components, amounts, and nutrition.",
      "Food search shows common USDA results and explicit full-search options.",
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
