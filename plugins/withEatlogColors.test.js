const assert = require('node:assert/strict');
const test = require('node:test');
const { preserveThemeColors, preserveMiuiColors } = require('./withEatlogColors');

test('color opt-out replaces an existing flag without changing theme inheritance or other styles', () => {
  const styles = { resources: { style: [
    { $: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' }, item: [
      { $: { name: 'colorPrimary' }, _: '@color/colorPrimary' },
      { $: { name: 'android:forceDarkAllowed' }, _: 'true' },
    ] },
    { $: { name: 'Theme.App.SplashScreen', parent: 'Theme.SplashScreen' } },
  ] } };
  const expected = structuredClone(styles);
  expected.resources.style[0].item[1]._ = 'false';
  preserveThemeColors(styles);
  preserveThemeColors(styles);
  assert.deepEqual(styles, expected);
});

test('MIUI opt-out preserves application settings and other metadata on repeated prebuilds', () => {
  const manifest = { manifest: { application: [{
    $: { 'android:name': '.MainApplication', 'android:theme': '@style/AppTheme' },
    'meta-data': [{ $: { 'android:name': 'expo.modules.updates.ENABLED', 'android:value': 'true' } }],
  }] } };
  const expected = structuredClone(manifest);
  expected.manifest.application[0]['meta-data'].push({
    $: { 'android:name': 'force_dark_google', 'android:value': 'true' },
  });
  preserveMiuiColors(manifest);
  preserveMiuiColors(manifest);
  assert.deepEqual(manifest, expected);
});

test('missing native targets fail instead of silently generating a different theme', () => {
  assert.throws(() => preserveThemeColors({ resources: { style: [] } }), /existing AppTheme/);
  assert.throws(() => preserveMiuiColors({ manifest: {} }));
});
