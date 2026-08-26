export const storeMetadata = {
  sourceVersion: 1,
  locale: 'en-US',
  product: {
    name: 'Eatlog',
    valueProposition: 'Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog.',
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
    shortDescription: 'Food logging that minds its own business',
    fullDescription: `Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog.

Fast input, editable estimates, useful trends, and none of the usual clutter around them.

Log it. Eat lunch.
Photo when you're in a hurry. Manual when you're not. Start from a description, food search, saved food, or past meal when that is faster. Every estimate stays editable before it reaches the diary. The robot does not get the last word.

See the useful part
Today keeps calories and macros easy to read. Diary holds the full record. Analytics shows weight trend, average intake, calorie history, and logging consistency without turning the numbers into a soap opera.

The plan has to ask first
When enough evidence exists, Eatlog can propose a target change. Nothing moves until you accept it.

Your diary is not the price of using the app
There is no Eatlog account, no cloud copy of your food or weight history, no ads, and no third-party analytics. Online estimates and full food search run only when you ask. Manual logging, saved meals, history, and analytics keep working without them.

Create a restorable backup, export readable CSV files, delete all local data, or share a meal card through your phone. Eatlog does not publish anything for you.

Eatlog is free to download. Pugo covers food logging, weight tracking, Diary, and Analytics. Manok adds meal estimates and adaptive plan recommendations through a monthly plan, with a one-month trial for eligible users. Itik unlocks the same paid features with a one-time lifetime purchase. Current prices and terms appear in the store purchase sheet.

On Android, optional Health Connect support reads and writes Weight only after you choose to connect it.

Nutrition data, calculated targets, trends, and meal results are estimates. Review entries before saving them. Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a qualified healthcare professional for medical advice, diagnosis, or treatment.`,
    releaseNotes: 'Initial release. Photo when you are in a hurry, manual when you are not. Edit every estimate, reuse saved meals, see calories and macros, track weight trends, accept or keep plan changes, share meal cards, and back up or export your log. No streak mascot will be disappointed in you.',
    category: 'Health & Fitness',
    healthAppsCategory: 'Nutrition and Weight Management',
    requiredHealthDisclaimer: 'Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition.',
  },
  apple: {
    title: 'Eatlog',
    subtitle: 'Food logging, minus the fuss',
    keywords: 'nutrition,calories,macros,meals,diary,weight,tracker,food log,backup',
    description: `Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog.

Fast input, editable estimates, useful trends, and none of the usual clutter around them.

LOG IT. EAT LUNCH.
Photo when you're in a hurry. Manual when you're not. Start from a description, food search, saved food, or past meal when that is faster. Every estimate stays editable before it reaches the diary. The robot does not get the last word.

SEE THE USEFUL PART
Today keeps calories and macros easy to read. Diary holds the full record. Analytics shows weight trend, average intake, calorie history, and logging consistency without turning the numbers into a soap opera.

THE PLAN HAS TO ASK FIRST
When enough evidence exists, Eatlog can propose a target change. Nothing moves until you accept it.

YOUR DIARY IS NOT THE PRICE OF USING THE APP
There is no Eatlog account, no cloud copy of your food or weight history, no ads, and no third-party analytics. Online estimates and full food search run only when you ask. Manual logging, saved meals, history, and analytics keep working without them.

Create a restorable backup, export readable CSV files, delete all local data, or share a meal card through your phone. Eatlog does not publish anything for you.

Eatlog is free to download. Pugo covers food logging, weight tracking, Diary, and Analytics. Manok adds meal estimates and adaptive plan recommendations through a monthly plan, with a one-month trial for eligible users. Itik unlocks the same paid features with a one-time lifetime purchase. Current prices and terms appear in the store purchase sheet.

Nutrition data, calculated targets, trends, and meal results are estimates. Review entries before saving them. Eatlog is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a qualified healthcare professional for medical advice, diagnosis, or treatment.`,
    promotionalText: 'Itlog, eat itlog, log it, log eat, log eat itlog, Eatlog. Fast, editable food logging with useful trends and no cloud diary.',
    releaseNotes: 'Initial release. Photo when you are in a hurry, manual when you are not. Edit every estimate, reuse saved meals, see calories and macros, track weight trends, accept or keep plan changes, share meal cards, and back up or export your log. No streak mascot will be disappointed in you.',
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
