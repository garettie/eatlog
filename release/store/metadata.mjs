export const storeMetadata = {
  sourceVersion: 1,
  locale: 'en-US',
  product: {
    name: 'Eatlog',
    valueProposition: 'Log food and weight, review nutrition estimates, and keep your data on your device.',
    audience: 'Adults using Eatlog for general wellness nutrition and weight logging.',
    androidPackage: 'com.sgaret.eatlog',
    iosBundleIdentifierCandidate: 'com.sgaret.eatlog',
    releaseOrder: ['Google Play', 'Apple App Store'],
    commercial: {
      philippinesPrice: { currency: 'PHP', amount: 299 },
      purchaseType: 'one-time upfront store purchase',
      subscriptions: false,
      inAppPurchases: false,
      crossStoreEntitlement: false,
    },
    accountRequired: false,
    localFirst: true,
    remoteFeatures: ['Scan', 'Describe and re-estimation', 'USDA search and detail', 'Open Food Facts full search'],
    deferredFeatures: ['HealthKit', 'Apple Health', 'cloud sync', 'social features'],
  },
  google: {
    title: 'Eatlog',
    shortDescription: 'Log food and weight, review nutrition estimates, and keep data on your device',
    fullDescription: `Eatlog is a local-first food and weight log for adults.

Log meals your way
• Enter nutrition manually.
• Search USDA FoodData Central and Open Food Facts.
• Use a meal photo or written description to get an editable estimate.
• Reuse recent and pinned foods.

Review your day and plan
• See calories and macros on Today and Diary.
• Edit or delete entries and undo a deletion.
• Log weight and review trends, intake history, and logging consistency.
• Review plan suggestions and choose whether to apply them.

Own your data
Your profile, targets, logs, weights, and saved meal photos stay in app-private storage on your device. Eatlog has no app account or cloud database. You can create an Eatlog backup, restore a supported backup, export readable CSV files, or delete all local data.

Online services and estimates
Manual logging, saved history, and local analytics work without a network connection. Scan and Describe send only the photo or text you choose through the Eatlog Cloudflare Worker to Google Gemini. USDA searches use the Worker. Open Food Facts is contacted directly only when you run a full search. These features require internet access.

Nutrition data, calculated targets, trends, and photo or description results are estimates. Review entries before saving them.

Health and safety
Eatlog is for adult general wellness. Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a qualified healthcare professional for medical advice, diagnosis, or treatment.

On Android, optional Health Connect support reads and writes Weight only after you choose to connect it.

Eatlog is a one-time paid download. It has no subscriptions, in-app purchases, ads, login, or third-party tracking.`,
    releaseNotes: 'Initial release: log meals and weight, review daily totals and trends, choose whether to apply plan suggestions, and back up or export local data. Scan, Describe, USDA search, Open Food Facts search, and Android Health Connect Weight support are optional.',
    category: 'Health & Fitness',
    healthAppsCategory: 'Nutrition and Weight Management',
    requiredHealthDisclaimer: 'Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition.',
  },
  apple: {
    title: 'Eatlog',
    subtitle: 'Food and weight log',
    keywords: 'nutrition,calories,macros,meals,diary,weight,tracker,food log,backup',
    description: `Eatlog is a local-first food and weight log for adults.

LOG FOOD YOUR WAY
Enter nutrition manually, reuse recent or pinned foods, search USDA FoodData Central and Open Food Facts, or use a meal photo or written description to get an editable estimate.

REVIEW YOUR DAY AND PLAN
See calories and macros on Today and Diary. Edit or delete entries, log weight, and review trends, intake history, and logging consistency. When Eatlog has enough evidence to suggest a plan change, you choose whether to apply it.

OWN YOUR DATA
Your profile, targets, logs, weights, and saved meal photos stay in app-private storage on your device. Eatlog has no app account or cloud database. Create an Eatlog backup, restore a supported backup, export readable CSV files, or delete all local data.

ONLINE SERVICES AND ESTIMATES
Manual logging, saved history, and local analytics work without a network connection. Scan and Describe send only the photo or text you choose through the Eatlog Cloudflare Worker to Google Gemini. USDA searches use the Worker. Open Food Facts is contacted directly only when you run a full search. These features require internet access.

Nutrition data, calculated targets, trends, and photo or description results are estimates. Review entries before saving them.

Eatlog is for adult general wellness. It is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a qualified healthcare professional for medical advice, diagnosis, or treatment.

Eatlog is a one-time paid download. It has no subscriptions, in-app purchases, ads, login, or third-party tracking.`,
    promotionalText: 'Food and weight logging with editable estimates, clear trends, local backup, and CSV export.',
    releaseNotes: 'Initial release: log meals and weight, review daily totals and trends, choose whether to apply plan suggestions, and back up or export local data. Optional online tools include Scan, Describe, USDA search, and Open Food Facts search.',
    primaryCategory: 'Health & Fitness',
    secondaryCategory: 'Food & Drink',
    firstVersionReleaseNotesFieldAvailable: false,
  },
  reviewerNotes: {
    google: `Eatlog is a one-time paid download with no login, subscription, in-app purchase, or extra paid feature.

Complete onboarding with synthetic adult data. Manual food entry works without a network connection. Open the center Add control: Scan a meal opens the camera, and Upload photo opens the photo library. Scan and Describe send only user-selected content to Google Gemini through the Eatlog Worker after the first-use disclosure is accepted. USDA uses the Worker; Open Food Facts is contacted directly only after a full search.

Android only: Profile > Health Connect requests read and write access for Weight. Eatlog imports Weight into local history and exports only weights entered in Eatlog. No other Health Connect data type is requested.

Profile > Backup and restore creates or restores .eatlog-backup files. Export data creates readable CSV files that cannot be restored. Delete all data uses two confirmations.`,
    apple: `Eatlog is a one-time paid download with no login, subscription, in-app purchase, or extra paid feature. Saved profiles, targets, logs, weights, and meal photos stay on device unless the user exports a file.

Complete onboarding with synthetic adult data. Use the center Add control for manual entry, Scan a meal, or Upload photo. Scan a meal opens the camera; Upload photo opens the photo library. Scan and Describe send only user-selected content to Google Gemini through the Eatlog Worker after the first-use disclosure is accepted. USDA uses the Worker; Open Food Facts is contacted directly only after a full search.

Profile > Backup and restore creates or restores .eatlog-backup files. Export data creates readable CSV files that cannot be restored. Delete all data uses two confirmations.

iOS v1 has no Health Connect, HealthKit, or Apple Health integration.`,
  },
  artwork: {
    featureGraphicAltText: 'Eatlog white egg-shaped nutrition scale mark centered on a dark background.',
    screenshotAltText: [
      'Today shows calorie and macro progress with the center Add control.',
      'Editable meal estimate lists food components, amounts, and nutrition.',
      'Food search shows common USDA results and explicit full-search options.',
      'Diary shows meals, entries, totals, and a saved meal photo.',
      'Analytics shows weight trend, calorie history, and logging consistency.',
      'Plan review shows a suggested change with Accept and Keep choices.',
      'Profile shows backup, export, privacy, and local data controls.',
    ],
  },
  ownerRequiredFields: [
    'public developer or legal name',
    'monitored support email',
    'privacy policy URL',
    'support URL',
    'review contact name, email, phone, and time zone',
    'launch countries and final console pricing',
  ],
};
