const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withMainActivity,
} = require('expo/config-plugins');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const pkg = require('../package.json');

const RATIONALE_ACTION = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';
const PERMISSION_USAGE_ACTION = 'android.intent.action.VIEW_PERMISSION_USAGE';
const HEALTH_PERMISSIONS_CATEGORY = 'android.intent.category.HEALTH_PERMISSIONS';
const PERMISSION_USAGE_ALIAS = 'ViewPermissionUsageActivity';
const PERMISSIONS_RATIONALE_ACTIVITY = '.PermissionsRationaleActivity';
const PRIVACY_ROUTE = 'eatlog://privacy';
const PERMISSION_DELEGATE_IMPORT =
  'dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const PERMISSION_DELEGATE_CALL =
  'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

function hasAction(intentFilter, actionName) {
  return intentFilter.action?.some(
    (action) => action.$?.['android:name'] === actionName,
  ) === true;
}

function hasCategory(intentFilter, categoryName) {
  return intentFilter.category?.some(
    (category) => category.$?.['android:name'] === categoryName,
  ) === true;
}

function ensureHealthConnectManifest(androidManifest) {
  const mainApplication =
    AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
  mainActivity['intent-filter'] = (mainActivity['intent-filter'] ?? [])
    .filter((intentFilter) => !hasAction(intentFilter, RATIONALE_ACTION));

  const activities = (mainApplication.activity ??= []);
  let rationaleActivity = activities.find(
    (activity) => activity.$?.['android:name'] === PERMISSIONS_RATIONALE_ACTIVITY,
  );
  if (!rationaleActivity) {
    rationaleActivity = { $: {} };
    activities.push(rationaleActivity);
  }
  rationaleActivity.$ = {
    ...rationaleActivity.$,
    'android:name': PERMISSIONS_RATIONALE_ACTIVITY,
    'android:exported': 'true',
    'android:theme': '@style/AppTheme',
  };
  const rationaleFilters = (rationaleActivity['intent-filter'] ??= []);

  if (!rationaleFilters.some((intentFilter) => hasAction(intentFilter, RATIONALE_ACTION))) {
    rationaleFilters.push({
      action: [{ $: { 'android:name': RATIONALE_ACTION } }],
    });
  }

  const activityAliases = (mainApplication['activity-alias'] ??= []);
  let permissionUsageAlias = activityAliases.find(
    (activityAlias) => activityAlias.$?.['android:name'] === PERMISSION_USAGE_ALIAS,
  );

  if (!permissionUsageAlias) {
    permissionUsageAlias = { $: {} };
    activityAliases.push(permissionUsageAlias);
  }

  permissionUsageAlias.$ = {
    ...permissionUsageAlias.$,
    'android:name': PERMISSION_USAGE_ALIAS,
    'android:exported': 'true',
    'android:targetActivity': PERMISSIONS_RATIONALE_ACTIVITY,
    'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
  };

  const aliasIntentFilters = (permissionUsageAlias['intent-filter'] ??= []);
  let permissionUsageFilter = aliasIntentFilters.find((intentFilter) =>
    hasAction(intentFilter, PERMISSION_USAGE_ACTION));
  if (!permissionUsageFilter) {
    permissionUsageFilter = {
      action: [{ $: { 'android:name': PERMISSION_USAGE_ACTION } }],
    };
    aliasIntentFilters.push(permissionUsageFilter);
  }
  const categories = (permissionUsageFilter.category ??= []);
  if (!hasCategory(permissionUsageFilter, HEALTH_PERMISSIONS_CATEGORY)) {
    categories.push({ $: { 'android:name': HEALTH_PERMISSIONS_CATEGORY } });
  }

  return androidManifest;
}

function buildPermissionsRationaleActivity(packageName) {
  if (!/^[a-zA-Z][a-zA-Z0-9_.]*$/.test(packageName)) {
    throw new Error('Android package is required for the Health Connect rationale activity');
  }
  return `package ${packageName};

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

public class PermissionsRationaleActivity extends Activity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    Intent privacyIntent = new Intent(this, MainActivity.class);
    privacyIntent.setData(Uri.parse("${PRIVACY_ROUTE}"));
    privacyIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    startActivity(privacyIntent);
    finish();
  }
}
`;
}

function writePermissionsRationaleActivity(androidProjectRoot, packageName) {
  const sourceDirectory = join(
    androidProjectRoot,
    'app',
    'src',
    'main',
    'java',
    ...packageName.split('.'),
  );
  mkdirSync(sourceDirectory, { recursive: true });
  writeFileSync(
    join(sourceDirectory, 'PermissionsRationaleActivity.java'),
    buildPermissionsRationaleActivity(packageName),
  );
}

function addHealthConnectPermissionDelegate(contents, language) {
  if (contents.includes(PERMISSION_DELEGATE_CALL)) return contents;
  if (language !== 'kt' && language !== 'java') {
    throw new Error(`Unsupported Android MainActivity language: ${language}`);
  }

  const importStatement = `import ${PERMISSION_DELEGATE_IMPORT}${language === 'java' ? ';' : ''}`;
  let next = contents;
  if (!next.includes(importStatement)) {
    next = next.replace(
      /^(package [^\n]+\n)/m,
      `$1\n${importStatement}\n`,
    );
    if (!next.includes(importStatement)) {
      throw new Error('Could not locate MainActivity package declaration for Health Connect setup');
    }
  }

  const superOnCreate = /^(\s*)super\.onCreate\([^\n]*\);?\s*$/m;
  if (!superOnCreate.test(next)) {
    throw new Error('Could not locate MainActivity super.onCreate call for Health Connect setup');
  }

  return next.replace(
    superOnCreate,
    (line, indentation) => `${line}\n${indentation}${PERMISSION_DELEGATE_CALL}${language === 'java' ? ';' : ''}`,
  );
}

const withEatlogHealthConnect = (config) => {
  config = withAndroidManifest(config, (manifestConfig) => {
    ensureHealthConnectManifest(manifestConfig.modResults);
    return manifestConfig;
  });

  config = withMainActivity(config, (activityConfig) => {
    activityConfig.modResults.contents = addHealthConnectPermissionDelegate(
      activityConfig.modResults.contents,
      activityConfig.modResults.language,
    );
    return activityConfig;
  });

  return withDangerousMod(config, ['android', (dangerousConfig) => {
    const packageName = dangerousConfig.android?.package;
    if (!packageName) throw new Error('Android package is required for Health Connect setup');
    writePermissionsRationaleActivity(
      dangerousConfig.modRequest.platformProjectRoot,
      packageName,
    );
    return dangerousConfig;
  }]);
};

module.exports = createRunOncePlugin(
  withEatlogHealthConnect,
  'with-eatlog-health-connect',
  pkg.version,
);
module.exports.addHealthConnectPermissionDelegate = addHealthConnectPermissionDelegate;
module.exports.buildPermissionsRationaleActivity = buildPermissionsRationaleActivity;
module.exports.ensureHealthConnectManifest = ensureHealthConnectManifest;
