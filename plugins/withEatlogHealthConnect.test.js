const assert = require('node:assert/strict');
const test = require('node:test');

const releaseConfig = require('../app.json').expo;

const {
  addHealthConnectPermissionDelegate,
  buildPermissionsRationaleActivity,
  ensureHealthConnectManifest,
} = require('./withEatlogHealthConnect');

function manifestFixture() {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      'uses-permission': [
        { $: { 'android:name': 'android.permission.INTERNET' } },
        { $: { 'android:name': 'android.permission.health.READ_WEIGHT' } },
        { $: { 'android:name': 'android.permission.health.WRITE_WEIGHT' } },
      ],
      application: [{
        $: { 'android:name': '.MainApplication' },
        activity: [{
          $: { 'android:name': '.MainActivity' },
          'intent-filter': [{
            action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          }, {
            action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }],
          }],
        }],
      }],
    },
  };
}

test('release config blocks unused Android template permissions', () => {
  assert.deepEqual(releaseConfig.android.blockedPermissions, [
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.WRITE_EXTERNAL_STORAGE',
  ]);
  assert.deepEqual(releaseConfig.android.permissions, [
    'android.permission.health.READ_WEIGHT',
    'android.permission.health.WRITE_WEIGHT',
  ]);
  const imagePicker = releaseConfig.plugins.find((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'expo-image-picker');
  assert.equal(imagePicker[1].microphonePermission, false);
});

test('Health Connect manifest setup is exact and idempotent', () => {
  const manifest = manifestFixture();
  const permissionsBefore = structuredClone(manifest.manifest['uses-permission']);

  ensureHealthConnectManifest(manifest);
  ensureHealthConnectManifest(manifest);

  const activities = manifest.manifest.application[0].activity;
  const mainActivity = activities.find((activity) =>
    activity.$?.['android:name'] === '.MainActivity');
  const rationaleActivity = activities.find((activity) =>
    activity.$?.['android:name'] === '.PermissionsRationaleActivity');
  const mainRationaleFilters = mainActivity['intent-filter'].filter((intentFilter) =>
    intentFilter.action?.some((action) =>
      action.$?.['android:name'] === 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE'));
  assert.equal(mainRationaleFilters.length, 0);
  assert.deepEqual(rationaleActivity, {
    $: {
      'android:name': '.PermissionsRationaleActivity',
      'android:exported': 'true',
      'android:theme': '@style/AppTheme',
    },
    'intent-filter': [{
      action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }],
    }],
  });
  assert.equal(activities.length, 2);

  const aliases = manifest.manifest.application[0]['activity-alias'];
  assert.equal(aliases.length, 1);
  assert.deepEqual(aliases[0], {
    $: {
      'android:name': 'ViewPermissionUsageActivity',
      'android:exported': 'true',
      'android:targetActivity': '.PermissionsRationaleActivity',
      'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
    },
    'intent-filter': [{
      action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
      category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
    }],
  });
  assert.deepEqual(manifest.manifest['uses-permission'], permissionsBefore);
});

test('Health Connect manifest setup handles a missing intent-filter list', () => {
  const manifest = manifestFixture();
  delete manifest.manifest.application[0].activity[0]['intent-filter'];
  ensureHealthConnectManifest(manifest);
  assert.deepEqual(
    manifest.manifest.application[0].activity[0]['intent-filter'],
    [],
  );
  const rationaleActivity = manifest.manifest.application[0].activity.find((activity) =>
    activity.$?.['android:name'] === '.PermissionsRationaleActivity');
  assert.equal(
    rationaleActivity['intent-filter'][0]
      .action[0].$['android:name'],
    'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE',
  );
});

test('Health Connect manifest setup repairs a partial permission-usage alias', () => {
  const manifest = manifestFixture();
  manifest.manifest.application[0]['activity-alias'] = [{
    $: { 'android:name': 'ViewPermissionUsageActivity' },
    'intent-filter': [{
      action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
    }],
  }];
  ensureHealthConnectManifest(manifest);
  assert.equal(
    manifest.manifest.application[0]['activity-alias'][0]
      ['intent-filter'][0].category[0].$['android:name'],
    'android.intent.category.HEALTH_PERMISSIONS',
  );
});

test('Health Connect delegate setup supports generated Kotlin and is idempotent', () => {
  const kotlin = `package com.sgaret.eatlog

import android.os.Bundle

class MainActivity {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
`;
  const once = addHealthConnectPermissionDelegate(kotlin, 'kt');
  const twice = addHealthConnectPermissionDelegate(once, 'kt');
  assert.equal(once, twice);
  assert.match(once, /import dev\.matinzd\.healthconnect\.permissions\.HealthConnectPermissionDelegate/);
  assert.match(once, /super\.onCreate\(null\)\n    HealthConnectPermissionDelegate\.setPermissionDelegate\(this\)/);
});

test('Health Connect rationale activity opens only the in-app privacy route', () => {
  const source = buildPermissionsRationaleActivity('com.sgaret.eatlog');
  assert.match(source, /^package com\.sgaret\.eatlog;/);
  assert.match(source, /new Intent\(this, MainActivity\.class\)/);
  assert.match(source, /Uri\.parse\("eatlog:\/\/privacy"\)/);
  assert.match(source, /FLAG_ACTIVITY_CLEAR_TOP \| Intent\.FLAG_ACTIVITY_SINGLE_TOP/);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.throws(
    () => buildPermissionsRationaleActivity(''),
    /Android package is required/,
  );
});

test('Health Connect delegate setup supports Java and fails closed on unknown templates', () => {
  const java = `package com.sgaret.eatlog;

import android.os.Bundle;

class MainActivity {
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
  }
}
`;
  const configured = addHealthConnectPermissionDelegate(java, 'java');
  assert.match(configured, /import dev\.matinzd\.healthconnect\.permissions\.HealthConnectPermissionDelegate;/);
  assert.match(configured, /HealthConnectPermissionDelegate\.setPermissionDelegate\(this\);/);
  assert.throws(
    () => addHealthConnectPermissionDelegate('class MainActivity {}', 'kt'),
    /Could not locate MainActivity package declaration/,
  );
  assert.throws(
    () => addHealthConnectPermissionDelegate(java, 'swift'),
    /Unsupported Android MainActivity language/,
  );
});
