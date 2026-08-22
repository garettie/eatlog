import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(directory, path), 'utf8');
const app = read('../../App.tsx');
const rootNavigator = read('./RootNavigator.tsx');
const profileNavigator = read('./ProfileNavigator.tsx');
const profile = read('../screens/ProfileScreen.tsx');
const paywall = read('../screens/PaywallScreen.tsx');
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
  assert.match(paywall, /Compare plans/);
  assert.match(paywall, /1-month trial/);
  assert.match(paywall, /Free for eligible users\. The store confirms eligibility before purchase\./);
  assert.match(paywall, /Retry plans/);
  assert.match(paywall, /Prices and checkout couldn't load\. You can still compare plans\./);
  assert.match(paywall, /Up to 30 AI actions every 24 hours and 250 every 30 days/);
  assert.match(paywall, /if \(!selectedProduct\) \{[\s\S]*retryPlans\(\)/);
  assert.doesNotMatch(purchaseDisabled, /selectedProduct/);
  assert.doesNotMatch(paywall, /This installed build or store did not return/);
  assert.doesNotMatch(paywall, /Trial allowance:/);
});

test('all AI collection entry points gate Pugo before private content collection', () => {
  const cameraGate = foodSheet.lastIndexOf('requirePaidAccess', foodSheet.indexOf('requestCameraPermissionsAsync'));
  const galleryGate = foodSheet.lastIndexOf('requirePaidAccess', foodSheet.indexOf('launchImageLibraryAsync'));
  assert.ok(cameraGate >= 0 && cameraGate < foodSheet.indexOf('requestCameraPermissionsAsync'));
  assert.ok(galleryGate >= 0 && galleryGate < foodSheet.indexOf('launchImageLibraryAsync'));
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
