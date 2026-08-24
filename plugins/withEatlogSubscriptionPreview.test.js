const assert = require('node:assert/strict');
const test = require('node:test');

const {
  disableSubscriptionPreviewDeveloperSupport,
  ensureSubscriptionPreviewBuildType,
  SUBSCRIPTION_PREVIEW_MANIFEST,
} = require('./withEatlogSubscriptionPreview');

const fixture = `android {
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}
`;

test('subscription preview uses release native artifacts and debug signing', () => {
  const configured = ensureSubscriptionPreviewBuildType(fixture);
  const releaseBlock = configured.match(/        release \{[\s\S]*?\n        \}/)?.[0];

  assert.match(configured, /subscriptionPreview \{/);
  assert.match(configured, /initWith release/);
  assert.match(configured, /debuggable false/);
  assert.doesNotMatch(configured, /debuggable true/);
  assert.match(configured, /signingConfig signingConfigs\.debug/);
  assert.match(configured, /matchingFallbacks = \['release'\]/);
  assert.ok(configured.indexOf('subscriptionPreview {') > configured.indexOf('release {'));
  assert.equal(releaseBlock, `        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
        }`);
  assert.equal((configured.match(/subscriptionPreview \{/g) ?? []).length, 1);
  assert.equal(ensureSubscriptionPreviewBuildType(configured), configured);
});

test('subscription preview manifest marks the installed APK as debuggable', () => {
  assert.equal(
    SUBSCRIPTION_PREVIEW_MANIFEST,
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
  <application
      android:debuggable="true"
      tools:ignore="HardcodedDebugMode" />
</manifest>
`,
  );
});

test('subscription preview setup fails closed when the generated template changes', () => {
  assert.throws(
    () => ensureSubscriptionPreviewBuildType('android {}'),
    /Could not locate Android buildTypes/,
  );
});

test('subscription preview disables React Native developer support without changing Android debuggability', () => {
  const kotlin = 'override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG';
  const java = `public boolean getUseDeveloperSupport() {
    return BuildConfig.DEBUG;
  }`;

  assert.equal(
    disableSubscriptionPreviewDeveloperSupport(kotlin, 'kt'),
    'override fun getUseDeveloperSupport(): Boolean = false',
  );
  assert.match(disableSubscriptionPreviewDeveloperSupport(java, 'java'), /return false;/);
  assert.equal(
    disableSubscriptionPreviewDeveloperSupport('override fun getUseDeveloperSupport(): Boolean = false', 'kt'),
    'override fun getUseDeveloperSupport(): Boolean = false',
  );
  assert.throws(
    () => disableSubscriptionPreviewDeveloperSupport('class MainApplication', 'kt'),
    /Could not locate React Native developer support/,
  );
});
