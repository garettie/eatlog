const assert = require('node:assert/strict');
const test = require('node:test');

const {
  disableSubscriptionPreviewDeveloperSupport,
  ensureSubscriptionPreviewBuildType,
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

test('subscription preview is release-bundled, debuggable, and uses release library fallbacks', () => {
  const configured = ensureSubscriptionPreviewBuildType(fixture);
  const releaseBlock = configured.match(/        release \{[\s\S]*?\n        \}/)?.[0];

  assert.match(configured, /subscriptionPreview \{/);
  assert.match(configured, /initWith release/);
  assert.match(configured, /debuggable true/);
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
