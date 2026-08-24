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
  assert.match(paywall, /Paid plans unlock/);
  assert.match(paywall, /First month free\. Then renews monthly\./);
  assert.match(paywall, /Try store again/);
  assert.match(paywall, /We couldn't reach the store\. Prices and checkout didn't load\. Your logbook still works\./);
  assert.match(paywall, /30 requests in any 24 hours and 250 in 30 days/);
  assert.match(paywall, /if \(!selectedProduct\) \{[\s\S]*retryPlans\('purchase'\)/);
  assert.doesNotMatch(purchaseDisabled, /selectedProduct/);
  assert.doesNotMatch(paywall, /Compare plans/);
  assert.doesNotMatch(paywall, /AI actions/);
  assert.doesNotMatch(paywall, /This installed build or store did not return/);
  assert.doesNotMatch(paywall, /Trial allowance:/);
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

test('Test Store preview can replace Manok with Itik without exposing fake cancellation controls', () => {
  assert.match(paywall, /serviceConfig\.revenueCatTestStore/);
  assert.match(paywall, /Preview mode: choose Itik above to switch your test plan\. Test purchases never charge you\./);
});

test('all AI collection entry points gate Pugo before private content collection', () => {
  const cameraGate = foodSheet.lastIndexOf('requirePaidAccess', foodSheet.indexOf('requestCameraPermissionsAsync'));
  const galleryGate = foodSheet.lastIndexOf('requirePaidAccess', foodSheet.indexOf('launchImageLibraryAsync'));
  assert.ok(cameraGate >= 0 && cameraGate < foodSheet.indexOf('requestCameraPermissionsAsync'));
  assert.ok(galleryGate >= 0 && galleryGate < foodSheet.indexOf('launchImageLibraryAsync'));
  assert.match(tabNavigator, /const openDescribe[\s\S]*?stateKey: 'entry', pendingAction: 'describe'/);
  assert.match(foodSheet, /case 'describe':\s*handleDescribe\(\);/);
  assert.match(search, /if \(!hasPaidFeatures\)[\s\S]*navigation\.navigate\("Paywall"\)[\s\S]*requestConsent/);
  assert.match(addComponent, /if \(!hasPaidFeatures\)[\s\S]*navigation\.navigate\('Paywall'\)[\s\S]*requestConsent/);
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
