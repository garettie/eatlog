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
const planScreen = read('../screens/PlanScreen.tsx');
const planParts = read('../components/plan/PlanParts.tsx');
const planPurchase = read('../components/plan/usePlanPurchase.ts');
const planCopy = read('../components/plan/planCopy.ts');
const tierPlanIcon = read('../components/TierPlanIcon.tsx');
const entitlementProvider = read('../context/EntitlementContext.tsx');
const aiSetup = read('../context/AiSetupContext.tsx');
const privacy = read('../screens/ProfileInfoScreens.tsx');
const hostedConsent = read('../components/RemoteEstimateConsentContent.tsx');
const foodSheet = read('../components/sheet-states/FoodSheetContent.tsx');
const foodScan = read('../services/foodScan.ts');
const search = read('../components/sheet-states/SearchInputState.tsx');
const addComponent = read('../components/sheet-states/AddComponentView.tsx');
const describeInput = read('../components/sheet-states/DescribeInputState.tsx');
const review = read('../components/sheet-states/ReviewState.tsx');
const analytics = read('../screens/AnalyticsScreen.tsx');
const adaptive = read('../services/adaptiveReviews.ts');
const database = read('../db/database.ts');
const dataBackup = read('../services/dataBackup.ts');
const dataExport = read('../services/dataExport.ts');

test('entitlement provider owns paywall and Profile plan routes', () => {
  assert.match(app, /<EntitlementProvider>/);
  assert.match(rootNavigator, /name="Paywall"/);
  assert.match(profileNavigator, /name="SubscriptionPlan"/);
  assert.match(profileNavigator, /from '\.\.\/screens\/PlanScreen'/);
  assert.match(profile, /Plan/);
  assert.match(planScreen, /Support ID/);
  assert.match(planScreen, /Restore purchases/);
  assert.match(planScreen, /Manage subscription/);
  assert.match(planParts, /What you get/);
  // Only the one-time product is advertised, with its localized store price.
  assert.match(planCopy, /\$\{item\.priceString\} once/);
  assert.match(planCopy, /One payment\. No renewal/);
  assert.match(read('../services/billing.ts'), /item\.product\.identifier === EATLOG_LIFETIME_PRODUCT_ID/);
  assert.doesNotMatch(planPurchase, /freeTrial|Start free trial|packageTrial/);
  // The store-default offering belongs to the closed-testing build; this app reads only `itik`.
  assert.match(read('../services/billing.types.ts'), /EATLOG_OFFERING_ID = 'itik'/);
  for (const source of [paywall, planScreen]) {
    assert.match(source, /Terms of Use/);
    assert.match(source, /one-time \{PAID_PLAN_NAME\} purchase is unavailable/);
    assert.doesNotMatch(source, /Compare plans/);
    assert.doesNotMatch(source, /AI actions|AI use left|AI use limits/);
    assert.doesNotMatch(source, /Your logbook stays yours on every plan/);
    assert.doesNotMatch(source, /estimates a day|free estimates|Manok|Lifetime|lifetime/);
  }
  for (const source of [paywall, planScreen, profile, foodSheet]) {
    assert.doesNotMatch(source, /Trial active|Monthly trial|Manok trial|Trial requests left|Trial total|trial allowance/i);
  }
});

test('the plan surfaces lead with value, then price, then the purchase action', () => {
  // Reasons to buy must precede the prices, and the prices must precede the commitment.
  for (const source of [paywall, planScreen]) {
    const value = source.indexOf('<ValueSummary />');
    const options = source.indexOf('<OfferChoice');
    const cta = source.indexOf('<PrimaryButton');
    assert.ok(value >= 0 && options > value, 'plan options must follow the value summary');
    assert.ok(cta > options, 'the purchase button must follow the plan options');
  }
  // The free app's value is explicit, and the purchase names only hosted AI.
  assert.match(planParts, /free and open source/);
  assert.match(planParts, /Log meals and weight, with no key needed/);
  assert.match(planParts, /Optional AI with your Google key/);
  assert.match(planParts, /Hosted AI estimates, no personal key needed/);
  assert.match(planParts, /Everything in free/);
  assert.doesNotMatch(planParts, /Usage limits/);
  assert.doesNotMatch(planScreen, /Usage limits/);
});

test('Omelette shows its actual hosted allowance without a live request counter', () => {
  assert.doesNotMatch(planParts, /QuotaCard|remaining24Hours|remaining30Days|usage\.kind/);
  assert.match(planParts, /30 estimate actions per rolling 24 hours and 250 per rolling 30 days/);
  assert.match(planParts, /including redos/);
  for (const source of [planScreen, paywall]) {
    assert.doesNotMatch(source, /QuotaCard|remaining24Hours|remaining30Days/);
  }
});

test('the plan screen keeps no manage mode and no control competing with Back', () => {
  // The Profile route exits through the navigator's back affordance alone.
  assert.doesNotMatch(planScreen, /managingPlan|Manage plan|accessibilityLabel="Close plans"/);
  assert.doesNotMatch(planScreen, /name="close"/);
  // A single package is a card, not a radio the user cannot deselect; several are a radio group.
  assert.match(planParts, /if \(options\.length === 1\)[\s\S]*<OfferCard/);
  assert.match(planParts, /accessibilityRole="radiogroup"/);
  // The double-payment guard hides the offer instead of offering a second Itik product.
  for (const source of [paywall, planScreen]) assert.match(source, /\{plan\.canBuy \? \(/);
});

test('both free states use one egg icon and paid access uses the omelette', () => {
  assert.match(planParts, /<TierPlanIcon tier="itik"/);
  assert.match(planParts, /<TierPlanIcon tier=\{tier\}/);
  assert.match(tierPlanIcon, /tier === 'itik'/);
  assert.doesNotMatch(tierPlanIcon, /tier === 'pugo'|tier === 'manok'/);
  // The app draws the same egg and omelette as the website and store artwork.
  for (const name of ['eatlog', 'omelette']) {
    const svg = read(`../../release/artwork/source/tier-${name}.svg`);
    for (const [, d] of svg.matchAll(/ d="([^"]+)"/g)) assert.ok(tierPlanIcon.includes(d), `${name} path differs from its source`);
  }
});

test('every displayed plan name comes from one module', () => {
  const tierNames = read('../services/tierNames.ts');
  assert.match(tierNames, /PAID_PLAN_NAME = 'Omelette'/);
  assert.match(tierNames, /tier === 'itik' \? `Eatlog \$\{PAID_PLAN_NAME\}` : 'Eatlog'/);
  const shown = [
    profile, paywall, planScreen, planParts, planPurchase, planCopy, aiSetup, foodSheet, foodScan,
    read('../services/billing.ts'),
    read('../screens/AiEstimatesScreen.tsx'),
    read('../components/ai/AiChoiceContent.tsx'),
    read('../components/ai/KeySetupContent.tsx'),
  ];
  for (const source of shown) {
    // Comments may use the internal tier names; strings and JSX text may not show them, and
    // only tierNames.ts spells the paid plan's name.
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /['"`>][^'"`<]*\b(Pugo|Manok|Itik|Omelette)\b/);
  }
  // The Profile Plan row names the derived plan, never an old purchase's product.
  assert.match(profile, /planName\(tierOf\(hasItik, keyState\.hasKey\)\)/);
});

test('purchase support controls keep their layout stable and expose the Support ID', () => {
  const purchaseHelp = planScreen.slice(
    planScreen.indexOf('Purchase help'),
    planScreen.indexOf('<View className="flex-row flex-wrap justify-center gap-4">'),
  );
  assert.notEqual(planScreen.indexOf('Purchase help'), -1);
  assert.match(purchaseHelp, />Restore purchases<\/Text>/);
  assert.match(purchaseHelp, />Support ID<\/Text>/);
  assert.match(purchaseHelp, /min-h-\[64px\]/);
  assert.match(purchaseHelp, /accessibilityLiveRegion=\{utilityMessage \? 'polite' : 'none'\}/);
  assert.doesNotMatch(purchaseHelp, /flex-wrap/);
  // Selection inside a control that copies on press fights the press on Android.
  assert.doesNotMatch(purchaseHelp, /selectable/);
  // Checking access is the pull-to-refresh gesture, not a button beside Restore.
  assert.match(planScreen, /<RefreshControl/);
  assert.doesNotMatch(purchaseHelp, />Check access<\/Text>/);
});

test('a background refresh never disables the purchase button', () => {
  const disabled = planPurchase.slice(
    planPurchase.indexOf('const disabled ='),
    planPurchase.indexOf('const run ='),
  );
  // Returning from the camera or a permission dialog must not grey out checkout.
  assert.doesNotMatch(disabled, /refreshing/);
  assert.doesNotMatch(planPurchase, /refreshing/);
  for (const source of [paywall, planScreen]) {
    assert.doesNotMatch(source, /disabled=\{[^}]*refreshing/);
  }
});

test('a refresh reports its own outcome instead of always resolving', () => {
  assert.match(entitlementProvider, /export type RefreshOutcome = 'ok' \| 'partial' \| 'failed'/);
  assert.match(entitlementProvider, /refresh\(\): Promise<RefreshOutcome>/);
  assert.match(entitlementProvider, /return 'failed'/);
  assert.match(entitlementProvider, /return await remoteRequest \? 'ok' : 'partial'/);
  // A failed counter refresh keeps the last known numbers instead of blanking them.
  assert.doesNotMatch(entitlementProvider, /catch \{\s*setUsage\(\{ kind: 'none' \}\);\s*\} finally/);
  assert.match(planScreen, /REFRESH_MESSAGES\[await refresh\(\)\]/);
  // Foregrounding is rate-limited so app switching does not hammer the Worker.
  assert.match(entitlementProvider, /FOREGROUND_REFRESH_INTERVAL_MS/);
});

test('local RevenueCat state remains the app authority across automatic and Worker refreshes', () => {
  assert.match(entitlementProvider, /shouldApplyAccessUpdate/);
  assert.match(entitlementProvider, /billing\.customerInfo\(forceStore\)/);
  assert.doesNotMatch(entitlementProvider, /customerInfo\(true\)/);
  assert.doesNotMatch(entitlementProvider, /applyAccess\(remote\.access\)/);
});

test('an unresolved plan still renders the plan surfaces instead of a blocking spinner', () => {
  assert.match(entitlementProvider, /useState<EatlogAccess \| null>\(null\)/);
  assert.match(entitlementProvider, /useRef<EatlogAccess \| null>\(null\)/);
  assert.match(entitlementProvider, /entitlementStatus\(access\)/);
  assert.match(entitlementProvider, /ensurePaidAccess/);
  assert.match(entitlementProvider, /await billing\.customerInfo\(forceStore\)/);
  assert.match(app, /export default function App\(\) \{[\s\S]*<EntitlementProvider>[\s\S]*<AppContent \/>/);
  const navigation = app.slice(app.indexOf('<NavigationContainer'), app.indexOf('</NavigationContainer>'));
  assert.doesNotMatch(navigation, /EntitlementProvider/);
  assert.match(profile, /entitlementStatus === 'checking' \? 'Checking plan…'/);
  // Adaptive plans are free, so Analytics never waits on the plan.
  assert.doesNotMatch(analytics, /entitlementStatus|Checking your plan/);
  // Neither plan surface replaces itself with a checking state: the plans are content, and
  // only the current-plan card carries the unknown.
  for (const source of [paywall, planScreen]) {
    assert.doesNotMatch(source, /Checking your plan/);
    assert.doesNotMatch(source, /entitlementStatus === 'checking'/);
  }
  assert.match(planParts, /access \? planName\(tier\) : 'Unconfirmed'/);
});

test('AI estimate submission authorizes inline during the Worker request without a blocking preflight', () => {
  const warmEntitlement = entitlementProvider.slice(
    entitlementProvider.indexOf('const warmEntitlement ='),
    entitlementProvider.indexOf('const refreshAccess ='),
  );
  const foodScanClient = read('../services/foodScan.ts');
  const worker = read('../../worker/src/index.ts');
  assert.match(entitlementProvider, /warmEntitlement/);
  assert.doesNotMatch(warmEntitlement, /refreshRemoteAccess/);
  assert.doesNotMatch(warmEntitlement, /getAiAuthorization/);
  assert.match(foodScanClient, /acceptAiGrant/);
  assert.match(foodScanClient, /x-eatlog-ai-grant/i);
  assert.match(foodScanClient, /paid-access-required/);
  assert.match(worker, /authorizeEstimate/);
  assert.match(worker, /refreshRevenueCatAccess/);
  assert.match(worker, /X-Eatlog-AI-Grant/);
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

test('initial estimates proceed while re-estimates gate before private content collection', () => {
  const warmEntitlement = entitlementProvider.slice(
    entitlementProvider.indexOf('const warmEntitlement ='),
    entitlementProvider.indexOf('const refreshAccess ='),
  );
  const ensure = entitlementProvider.slice(
    entitlementProvider.indexOf('const ensurePaidAccess ='),
    entitlementProvider.indexOf('const warmEntitlement ='),
  );
  // Warming resolves an unknown plan but never answers with one, so an initial estimate
  // cannot be blocked by it. Re-estimates await the resolution instead of sampling it.
  assert.match(warmEntitlement, /needsRevalidation\(accessRef\.current, accessConfirmed\.current\)/);
  assert.doesNotMatch(warmEntitlement, /return '(proceed|upgrade|unavailable)'/);
  assert.match(ensure, /await resolveAccess\(false\)/);
  assert.match(ensure, /'checking' \? 'unavailable' : status/);
  // A stored paid plan answers from its own expiry date, with no network call in front of a
  // user who opened the app to take one photo.
  assert.match(ensure, /if \(stored !== null && hasItik\(stored\)\) return 'paid'/);
  assert.ok(
    ensure.indexOf("return 'paid'") < ensure.indexOf('await resolveAccess'),
    'a valid paid plan must answer before any refresh is awaited',
  );
  // A stored free plan is only last session's answer, so it is re-checked before it denies.
  assert.match(ensure, /needsRevalidation\(stored, accessConfirmed\.current\)/);
  assert.match(entitlementProvider, /if \(!transient\) accessConfirmed\.current = true/);
  // A settled subscription is not re-verified on every foreground.
  assert.match(entitlementProvider, /if \(paidAndSettled\(accessRef\.current\)\) return/);

  assert.match(foodSheet, /warmEntitlement/);
  const cameraGate = foodSheet.indexOf('warmEntitlement()');
  const cameraPermission = foodSheet.indexOf('requestCameraPermissionsAsync');
  const galleryLaunch = foodSheet.indexOf('launchImageLibraryAsync');
  assert.ok(cameraGate >= 0 && cameraGate < cameraPermission);
  assert.ok(cameraGate < galleryLaunch);
  assert.match(tabNavigator, /const openDescribe[\s\S]*?stateKey: 'entry', pendingAction: 'describe'/);
  assert.match(foodSheet, /case 'describe':\s*handleDescribe\(\);/);
  for (const source of [search, addComponent, describeInput]) {
    const consent = source.indexOf('ensureAiReady()');
    const accessGate = source.indexOf('warmEntitlement()');
    assert.ok(consent >= 0 && accessGate >= 0 && accessGate < consent);
    assert.equal(source.includes('await ensurePaidAccess()'), false);
  }
  // Redo goes through the same gate as a first estimate: My key redoes on the user's key, and
  // Eatlog AI still needs Itik, which the gate checks and the Worker enforces.
  for (const marker of ['const handleClarify =', 'const handleClarifyComponent =']) {
    const start = review.indexOf(marker);
    const gate = review.indexOf('await ensureAiReady()', start);
    const request = review.indexOf(marker === 'const handleClarify =' ? 'await onClarify(' : 'await onClarifyComponent(', start);
    assert.ok(start >= 0 && gate > start && gate < request);
  }
  assert.equal(review.includes('ensurePaidAccess'), false);
  assert.equal(review.includes('requestConsent'), false);
  // My key is decided before RevenueCat is asked; hosted consent is asked only for Eatlog AI.
  const gateHook = aiSetup.slice(aiSetup.indexOf('export function useAiGate'));
  assert.ok(gateHook.indexOf("keyState.route === 'my-key'") < gateHook.indexOf('await ensurePaidAccess()'));
  assert.match(gateHook, /if \(gate === 'eatlog-ai'\) return requestConsent\(\);/);
  assert.match(foodScan, /acceptAiGrant/);
});

test('saving a personal key does not consent to hosted estimates', () => {
  const finishSetup = aiSetup.slice(aiSetup.indexOf('const finishSetup ='), aiSetup.indexOf('const finishChoice ='));
  assert.doesNotMatch(finishSetup, /acceptHostedConsent|requestConsent|acceptRemoteEstimateConsent/);
  assert.match(aiSetup.slice(aiSetup.indexOf('export function useAiGate')), /if \(gate === 'eatlog-ai'\) return requestConsent\(\);/);
  assert.match(privacy, /Withdraw Eatlog AI consent/);
  assert.match(privacy, /navigation\.navigate\('AiEstimates'\)/);
  assert.match(hostedConsent, /Use Eatlog AI\?/);
  assert.doesNotMatch(hostedConsent, /Enable AI meal estimates/);
});

test('adaptive plans are free: no UI, entitlement, or service-boundary gate', () => {
  assert.match(analytics, /nextRecommendation = await getAdaptiveReviewState\(endDate\)/);
  assert.doesNotMatch(analytics, /useEntitlement|ensurePaidAccess|hasItik|navigate\('Paywall'\)/);
  assert.match(profile, /nextProfile && nextTarget \? await getAdaptiveReviewState\(today\)/);
  assert.doesNotMatch(adaptive, /requireAdaptiveAccess|adaptiveAccess/);
  assert.doesNotMatch(entitlementProvider, /setAdaptiveAccess/);
});

test('entitlement state remains outside SQLite, exports, and restorable backups', () => {
  for (const source of [database, dataBackup, dataExport]) {
    assert.doesNotMatch(source, /eatlog_paid|revenuecat|ai_grant|subscription_state/i);
  }
  assert.doesNotMatch(read('../services/billing.ts'), /from ['"]\.\.\/db\/database|deleteFood|deleteWeight|deleteTarget/);
});
