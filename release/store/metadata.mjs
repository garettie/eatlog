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
      acquisitionPrice: 'free',
      manok: { currency: 'PHP', amount: 79, period: 'monthly', trial: 'one month for eligible users' },
      itik: { currency: 'PHP', amount: 799, purchaseType: 'one-time lifetime entitlement' },
      subscriptions: true,
      inAppPurchases: true,
      crossStoreEntitlement: false,
    },
    accountRequired: false,
    localFirst: true,
    remoteFeatures: ['Scan', 'Describe and re-estimation', 'USDA search and detail', 'Open Food Facts full search'],
    deferredFeatures: ['HealthKit', 'Apple Health', 'cloud sync', 'social features'],
  },
  google: {
    title: 'Eatlog',
    shortDescription: 'Log food and weight, review nutrition estimates, and keep records on your phone',
    fullDescription: `Eatlog turns a meal photo or written description into an editable nutrition estimate.

Log food
Enter nutrition manually, reuse recent or pinned foods, reuse a past meal with a new photo, search USDA FoodData Central and Open Food Facts, or request an editable estimate from a photo or written description.

Review your day and plan
See daily calories and macros on Today and Diary. Edit or delete entries and undo a deletion. Log weight and review trends, intake history, and logging consistency. Review plan suggestions and choose whether to apply them.

Keep your data on your phone
Your profile, targets, food entries, weights, and saved meal photos stay on your device. Eatlog has no app account or cloud database. Create an Eatlog backup, restore a supported backup, export readable CSV files, or delete all local data.

Online services and estimates
Manual logging, camera/gallery selection, past-meal reuse, saved history, and analytics work without a network connection. Estimate as new sends only the selected photo and optional meal title; Describe sends only the text you choose after you choose Okay to enable online estimates. Not now keeps the photo, title, and local reuse options without sending estimate data; a later explicit AI action can ask again. USDA searches also use an online service. Open Food Facts is contacted only when you run a full search. Online estimates and searches require internet access.

Nutrition data, calculated targets, trends, and photo or description results are estimates. Review entries before saving them.

Health and safety
Eatlog is for adult general wellness. Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a qualified healthcare professional for medical advice, diagnosis, or treatment.

On Android, optional Health Connect support reads and writes Weight only after you choose to connect it.

Eatlog is free to download. Eatlog Pugo includes local food and weight logging. Eatlog Manok is a monthly subscription with an eligible one-month trial; Eatlog Itik is a one-time lifetime purchase. Store purchase sheets show localized prices and terms. Paid access unlocks AI estimates and local adaptive recommendations, subject to the disclosed fair-use limits. Eatlog has no ads, login, or third-party analytics.`,
    releaseNotes: 'Initial release. Log food and weight, review daily calories and macros, and view weight trends, intake history, and logging consistency. Reuse saved foods or past meals with a new photo, choose whether to apply plan suggestions, and create backups or CSV exports. Optional online tools include Estimate as new, Describe, USDA search, and Open Food Facts search. Android can optionally read and write Weight through Health Connect.',
    category: 'Health & Fitness',
    healthAppsCategory: 'Nutrition and Weight Management',
    requiredHealthDisclaimer: 'Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition.',
  },
  apple: {
    title: 'Eatlog',
    subtitle: 'Food, nutrition, and weight',
    keywords: 'nutrition,calories,macros,meals,diary,weight,tracker,food log,backup',
    description: `Eatlog reuses past meals with new photos or turns a photo or written description into an editable nutrition estimate.

LOG FOOD
Enter nutrition manually, reuse recent or pinned foods, reuse a past meal with a new photo, search USDA FoodData Central and Open Food Facts, or request an editable estimate from a photo or written description.

REVIEW YOUR DAY AND PLAN
See daily calories and macros on Today and Diary. Edit or delete entries and undo a deletion. Log weight and review trends, intake history, and logging consistency. Review plan suggestions and choose whether to apply them.

KEEP YOUR DATA ON YOUR PHONE
Your profile, targets, food entries, weights, and saved meal photos stay on your device. Eatlog has no app account or cloud database. Create an Eatlog backup, restore a supported backup, export readable CSV files, or delete all local data.

ONLINE SERVICES AND ESTIMATES
Manual logging, camera/gallery selection, past-meal reuse, saved history, and analytics work without a network connection. Estimate as new sends only the selected photo and optional meal title; Describe sends only the text you choose after you choose Okay to enable online estimates. Not now keeps the photo, title, and local reuse options without sending estimate data; a later explicit AI action can ask again. USDA searches also use an online service. Open Food Facts is contacted only when you run a full search. Online estimates and searches require internet access.

Nutrition data, calculated targets, trends, and photo or description results are estimates. Review entries before saving them.

Eatlog is for adult general wellness. It is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a qualified healthcare professional for medical advice, diagnosis, or treatment.

Eatlog is free to download. Eatlog Pugo includes local food and weight logging. Eatlog Manok is a monthly subscription with an eligible one-month trial; Eatlog Itik is a one-time lifetime purchase. Store purchase sheets show localized prices and terms. Paid access unlocks AI estimates and local adaptive recommendations, subject to the disclosed fair-use limits. Eatlog has no ads, login, or third-party analytics.`,
    promotionalText: 'Food and weight logging with editable estimates, clear trends, local backup, and CSV export.',
    releaseNotes: 'Initial release. Log food and weight, review daily calories and macros, and view weight trends, intake history, and logging consistency. Reuse saved foods or past meals with a new photo, choose whether to apply plan suggestions, and create backups or CSV exports. Optional online tools include Estimate as new, Describe, USDA search, and Open Food Facts search.',
    primaryCategory: 'Health & Fitness',
    secondaryCategory: 'Food & Drink',
    firstVersionReleaseNotesFieldAvailable: false,
  },
  reviewerNotes: {
    google: `Eatlog is free to download with Pugo local features. Manok is a monthly subscription and Itik is a one-time lifetime purchase. The build has no login.

Complete onboarding with synthetic adult data. Camera/gallery selection opens Identify meal locally. Reusing a listed past meal loads its editable foods and portions with the new photo without consent or network use. If online estimates are configured, choose Estimate as new to request AI consent when required; Not now returns to the same photo, title, and local suggestions without sending anything. Describe, clarification, and re-estimation use the same consent. Only an invoked online estimate sends user-selected content to Google Gemini through the Eatlog Worker. Manual food entry works offline. USDA uses the Worker; Open Food Facts is contacted directly only after a full search.

Android only: Profile > Health Connect requests read and write access for Weight. Eatlog imports Weight into local history and exports only weights entered in Eatlog. No other Health Connect data type is requested.

Profile > Backup and restore creates or restores .eatlog-backup files. Export data creates readable CSV files that cannot be restored. Delete all data uses two confirmations.`,
    apple: `Eatlog is free to download with Pugo local features. Manok is a monthly subscription and Itik is a one-time lifetime purchase. The build has no login. Saved profiles, targets, logs, weights, and meal photos stay on device unless the user exports a file.

Complete onboarding with synthetic adult data. Use the center Add control for manual entry, Scan a meal, or Upload photo. Scan opens the camera and Upload photo opens the photo library; selection opens Identify meal locally. Reusing a listed past meal loads its editable foods and portions with the new photo without consent or network use. If online estimates are configured, choose Estimate as new to request AI consent when required; Not now returns to the same photo, title, and suggestions without sending anything. Describe, clarification, and re-estimation use the same consent. Only an invoked online estimate sends user-selected content to Google Gemini through the Eatlog Worker. USDA uses the Worker; Open Food Facts is contacted directly only after a full search.

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
    'Terms of Use URL',
    'support URL',
    'review contact name, email, phone, and time zone',
    'launch countries and final console pricing',
  ],
};
