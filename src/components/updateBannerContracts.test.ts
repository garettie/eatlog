import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(directory, path), 'utf8');
const banner = read('./UpdateBanner.tsx');
const hook = read('../hooks/useAppUpdate.ts');
const playUpdates = read('../services/playUpdates.ts');
const playModule = read('../../modules/eatlog-play-updates/android/src/main/java/expo/modules/eatlogplayupdates/EatlogPlayUpdatesModule.kt');
const dashboard = read('../screens/DashboardScreen.tsx');
const tabNavigator = read('../navigation/TabNavigator.tsx');

test('the update notice lives on Today and nowhere else', () => {
  assert.match(dashboard, /import UpdateBanner from '\.\.\/components\/UpdateBanner'/);
  assert.match(dashboard, /<UpdateBanner \/>/);
  // A second mount would put the same alert on two tabs at once.
  assert.equal(dashboard.match(/<UpdateBanner \/>/g)?.length, 1);
  assert.doesNotMatch(tabNavigator, /UpdateBanner/);
});

test('applying either update is gated on there being no unsaved edit', () => {
  assert.match(banner, /useDiscardGuardContext/);
  assert.match(banner, /if \(isAnyDirty\(\)\)/);
  // The guard has to run before the reload or the Play handoff, not alongside it.
  assert.ok(banner.indexOf('isAnyDirty()') < banner.indexOf('void apply()'));
});

test('the notice is suppressed where updates cannot apply', () => {
  // reloadAsync throws in Expo Go and dev builds, so the control must never appear there.
  assert.match(hook, /Updates\.isEnabled && isUpdatePending/);
  assert.match(hook, /if \(!Updates\.isEnabled\) return;/);
  assert.match(hook, /dismissed\s*\?\s*null/);
});

test('a Play Store build is announced, never installed by the app', () => {
  // Detection only: the user updates from the listing. No in-app download, install, or restart.
  assert.match(playModule, /isUpdateAvailableAsync/);
  assert.doesNotMatch(playModule, /completeUpdate|startUpdateFlow/);
  assert.match(playUpdates, /market:\/\/details\?id=/);
  // A new store build supersedes any bundle made for the installed one.
  assert.match(hook, /storeUpdate\s*\?\s*'store'/);
});

test('builds without the Play module keep running OTA updates', () => {
  // requireNativeModule throws on binaries installed before the module shipped.
  assert.match(playUpdates, /requireOptionalNativeModule/);
  assert.doesNotMatch(playUpdates, /requireNativeModule\(/);
  // Sideloaded, forked, and Play-less installs fail the check; that must read as "no update".
  assert.match(playUpdates, /catch \{\s*return false;/);
});

test('a foreground check keeps a long-open session from missing an update', () => {
  assert.match(hook, /AppState\.addEventListener\('change'/);
  assert.match(hook, /FOREGROUND_CHECK_INTERVAL_MS/);
  assert.match(hook, /subscription\.remove\(\)/);
  // An unreachable update server must not surface as an error the user cannot act on.
  assert.match(hook, /catch \{/);
});

test('the notice carries the tonal container role, not the error role', () => {
  assert.match(banner, /bg-m3-secondary-container/);
  assert.match(banner, /text-m3-on-secondary-container/);
  // Error Coral stays reserved for errors and destructive actions.
  assert.doesNotMatch(banner, /error-container/);
});

test('the notice is announced and reachable', () => {
  assert.match(banner, /accessibilityRole="alert"/);
  assert.match(banner, /accessibilityLiveRegion="polite"/);
  assert.match(banner, /actionLabel: 'Restart Eatlog to apply the update'/);
  assert.match(banner, /actionLabel: 'Open Google Play to update Eatlog'/);
  assert.match(banner, /accessibilityLabel=\{copy\.actionLabel\}/);
  assert.match(banner, /accessibilityLabel="Dismiss the update notice"/);
  // Both controls keep the 48dp touch target the rest of the app uses.
  assert.equal(banner.match(/min-h-\[48px\]/g)?.length, 2);
});

test('motion honors the reduced-motion setting', () => {
  assert.match(banner, /useReducedMotion/);
  assert.match(banner, /entering=\{reduced \? undefined : FadeIn\.duration\(DURATION\.short\)\}/);
});
