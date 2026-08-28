import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(directory, path), 'utf8');
const app = read('../../App.tsx');
const rootNavigator = read('./RootNavigator.tsx');
const tabNavigator = read('./TabNavigator.tsx');
const profileNavigator = read('./ProfileNavigator.tsx');
const profile = read('../screens/ProfileScreen.tsx');
const paywall = read('../screens/PaywallScreen.tsx');
const tierBirdIcon = read('../components/TierBirdIcon.tsx');
const entitlementProvider = read('../context/EntitlementContext.tsx');
const foodSheet = read('../components/sheet-states/FoodSheetContent.tsx');
const search = read('../components/sheet-states/SearchInputState.tsx');
const addComponent = read('../components/AddComponentSection.tsx');
const describeInput = read('../components/sheet-states/DescribeInputState.tsx');
const review = read('../components/sheet-states/ReviewState.tsx');
const analytics = read('../screens/AnalyticsScreen.tsx');
const adaptive = read('../services/adaptiveReviews.ts');
const database = read('../db/database.ts');
const dataBackup = read('../services/dataBackup.ts');
const dataExport = read('../services/dataExport.ts');

test('entitlement provider owns paywall and Profile plan routes', () => {
  const purchaseDisabled = paywall.slice(
    paywall.indexOf('const purchaseDisabled'),
    paywall.indexOf('const purchaseTitle'),
  );
  assert.match(app, /<EntitlementProvider>/);
  assert.match(rootNavigator, /name="Paywall"/);
  assert.match(profileNavigator, /name="SubscriptionPlan"/);
  assert.match(profile, /Plan/);
  assert.match(paywall, /Support ID/);
  assert.match(paywall, /Restore purchases/);
  assert.match(paywall, /Manage subscription/);
  assert.match(paywall, /Terms of Use/);
  assert.match(paywall, /What you get/);
  assert.match(paywall, /const manokOfferEligible = offering\?\.manok\?\.trialEligible === true/);
  assert.match(paywall, /1 month free, then .* until canceled in Google Play[.]/);
  assert.match(paywall, /manokOfferEligible[\s\S]*Continue to Google Play[\s\S]*Start monthly/);
  assert.match(paywall, /Try store again/);
  assert.match(paywall, /We couldn't reach the store\. Prices and checkout didn't load\. Your logbook still works\./);
  assert.match(paywall, /30 requests per 24 hours · 250 per 30 days/);
  assert.match(paywall, /if \(!selectedProduct\) \{[\s\S]*retryPlans\('purchase'\)/);
  assert.doesNotMatch(purchaseDisabled, /selectedProduct/);
  assert.doesNotMatch(paywall, /Compare plans/);
  assert.doesNotMatch(paywall, /AI actions|AI use left|AI use limits/);
  assert.doesNotMatch(paywall, /This installed build or store did not return/);
  assert.doesNotMatch(paywall, /Trial allowance:/);
  for (const source of [paywall, profile, foodSheet]) {
    assert.doesNotMatch(source, /Trial active|Monthly trial|Manok trial|Trial requests left|Trial total|trial allowance/i);
  }
  assert.doesNotMatch(paywall, /Your logbook stays yours on every plan/);
  assert.doesNotMatch(paywall, /End Manok in the store|unused Manok time/);
});

test('active plans hide purchase options until Manage plan opens', () => {
  const purchaseOptions = paywall.slice(
    paywall.indexOf('{showPurchaseOptions ? ('),
    paywall.indexOf('{!managingCurrentPlan ? ('),
  );
  assert.match(paywall, /const hasCurrentPlan = hasPaidFeatures\(access\)/);
  assert.match(paywall, /const managingCurrentPlan = hasCurrentPlan && managingPlan/);
  assert.match(paywall, /const showPurchaseOptions = \(!hasCurrentPlan \|\| managingCurrentPlan\) && access.kind !== 'itik'/);
  assert.match(paywall, /\{hasCurrentPlan && !managingCurrentPlan \? \([\s\S]*title="Manage plan"/);
  assert.match(purchaseOptions, /\{!manokActive \? \([\s\S]*tier="manok"/);
  assert.match(purchaseOptions, /tier="itik"/);
  assert.match(paywall, /\{!hasCurrentPlan \|\| managingCurrentPlan \? \([\s\S]*Purchase help/);
});

test('subscription tiers use the requested bird identities', () => {
  assert.match(paywall, /tier="manok"/);
  assert.match(paywall, /tier="itik"/);
  assert.match(tierBirdIcon, /tier === 'pugo'/);
  assert.match(tierBirdIcon, /tier === 'manok'/);
  assert.match(tierBirdIcon, /return \([\s\S]*fill="#203431"/);
});

test('purchase support controls keep their layout stable and expose the Support ID', () => {
  const purchaseHelp = paywall.slice(
    paywall.indexOf('Purchase help'),
    paywall.indexOf('<View className="flex-row flex-wrap justify-center gap-4">'),
  );
  assert.notEqual(paywall.indexOf('Purchase help'), -1);
  assert.match(purchaseHelp, />Restore purchases<\/Text>/);
  assert.match(purchaseHelp, />Check access<\/Text>/);
  assert.match(purchaseHelp, />Support ID<\/Text>/);
  assert.match(paywall, /const supportIdDisplay = supportId \?\?/);
  assert.match(purchaseHelp, /\{supportIdDisplay\}/);
  assert.match(purchaseHelp, /min-h-\[64px\][\s\S]*accessibilityLiveRegion=\{utilityMessage \? 'polite' : 'none'\}/);
  assert.doesNotMatch(purchaseHelp, /flex-wrap/);
});

test('local RevenueCat state remains the app authority across automatic and Worker refreshes', () => {
  assert.match(entitlementProvider, /shouldApplyAccessUpdate/);
  assert.match(entitlementProvider, /billing\.customerInfo\(forceStore\)/);
  assert.match(entitlementProvider, /catch \{\s*setUsage\(\{ kind: 'none' \}\);\s*\} finally/);
  assert.doesNotMatch(entitlementProvider, /customerInfo\(true\)/);
  assert.doesNotMatch(entitlementProvider, /applyAccess\(remote\.access\)/);
});

test('cold start stays unresolved until RevenueCat CustomerInfo is available', () => {
  const checkingPlan = paywall.slice(
    paywall.indexOf("if (access === null || entitlementStatus === 'checking')"),
    paywall.indexOf('const hasCurrentPlan'),
  );
  assert.match(entitlementProvider, /useState<EatlogAccess \| null>\(null\)/);
  assert.match(entitlementProvider, /useRef<EatlogAccess \| null>\(null\)/);
  assert.match(entitlementProvider, /entitlementStatus\(access\)/);
  assert.match(entitlementProvider, /ensurePaidAccess/);
  assert.match(entitlementProvider, /await billing\.customerInfo\(forceStore\)/);
  assert.match(app, /export default function App\(\) \{[\s\S]*<EntitlementProvider>[\s\S]*<AppContent \/>/);
  const navigation = app.slice(app.indexOf('<NavigationContainer'), app.indexOf('</NavigationContainer>'));
  assert.doesNotMatch(navigation, /EntitlementProvider/);
  assert.match(profile, /entitlementStatus === 'checking' \? 'Checking plan…'/);
  assert.match(paywall, /if \(access === null \|\| entitlementStatus === 'checking'\) \{[\s\S]*Checking your plan/);
  assert.match(checkingPlan, /PAID_ACCESS_UNAVAILABLE_MESSAGE/);
  assert.match(checkingPlan, /retryPlans\('utility'\)/);
  assert.match(analytics, /entitlementStatus === 'checking'[\s\S]*Checking your plan…/);
});

test('unresolved purchase and restore stop before the billing client', () => {
  const purchase = entitlementProvider.slice(
    entitlementProvider.indexOf('const purchase ='),
    entitlementProvider.indexOf('const restore ='),
  );
  const restore = entitlementProvider.slice(
    entitlementProvider.indexOf('const restore ='),
    entitlementProvider.indexOf('const value ='),
  );
  assert.match(purchase, /entitlementStatus\(current\) === 'checking'[\s\S]*return[\s\S]*billing\.purchase/);
  assert.match(restore, /entitlementStatus\(current\) === 'checking'[\s\S]*return[\s\S]*billing\.restore/);
});

test('Test Store preview can replace Manok with Itik without exposing fake cancellation controls', () => {
  assert.match(paywall, /serviceConfig\.revenueCatTestStore/);
  assert.match(paywall, /Preview mode: choose Lifetime above to switch plans[.] Test purchases never charge you[.]/);
});

test('all AI collection entry points resolve paid access before private content collection', () => {
  const cameraGate = foodSheet.lastIndexOf('requirePaidAccess', foodSheet.indexOf('requestCameraPermissionsAsync'));
  const galleryGate = foodSheet.lastIndexOf('requirePaidAccess', foodSheet.indexOf('launchImageLibraryAsync'));
  assert.ok(cameraGate >= 0 && cameraGate < foodSheet.indexOf('requestCameraPermissionsAsync'));
  assert.ok(galleryGate >= 0 && galleryGate < foodSheet.indexOf('launchImageLibraryAsync'));
  assert.match(tabNavigator, /const openDescribe[\s\S]*?stateKey: 'entry', pendingAction: 'describe'/);
  assert.match(foodSheet, /case 'describe':\s*handleDescribe\(\);/);
  for (const source of [search, addComponent, describeInput]) {
    const consent = source.indexOf('requestConsent()');
    const accessGate = source.lastIndexOf('await ensurePaidAccess()', consent);
    assert.ok(consent >= 0 && accessGate >= 0 && accessGate < consent);
  }
  for (const marker of ['const handleClarify =', 'const handleClarifyComponent =']) {
    const start = review.indexOf(marker);
    const consent = review.indexOf('requestConsent()', start);
    const accessGate = review.lastIndexOf('await ensurePaidAccess()', consent);
    assert.ok(start >= 0 && consent >= 0 && accessGate >= start && accessGate < consent);
  }
  for (const source of [search, addComponent, describeInput, review, analytics]) {
    assert.match(source, /["']unavailable["']/);
  }
});

test('adaptive reads and mutations have UI and service-boundary gates', () => {
  assert.match(analytics, /hasPaidFeatures \? await getAdaptiveReviewState/);
  assert.match(analytics, /Adaptive plan/);
  assert.match(adaptive, /requireAdaptiveAccess\(\)/);
  assert.equal((adaptive.match(/requireAdaptiveAccess\(\)/g) ?? []).length, 4);
});

test('entitlement state remains outside SQLite, exports, and restorable backups', () => {
  for (const source of [database, dataBackup, dataExport]) {
    assert.doesNotMatch(source, /eatlog_paid|revenuecat|ai_grant|subscription_state/i);
  }
  assert.doesNotMatch(read('../services/billing.ts'), /from ['"]\.\.\/db\/database|deleteFood|deleteWeight|deleteTarget/);
});
