const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withMainActivity,
} = require('expo/config-plugins');

const pkg = require('../package.json');

const RATIONALE_ACTION = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';
const PERMISSION_USAGE_ACTION = 'android.intent.action.VIEW_PERMISSION_USAGE';
const HEALTH_PERMISSIONS_CATEGORY = 'android.intent.category.HEALTH_PERMISSIONS';
const PERMISSION_USAGE_ALIAS = 'ViewPermissionUsageActivity';
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
  const intentFilters = (mainActivity['intent-filter'] ??= []);

  if (!intentFilters.some((intentFilter) => hasAction(intentFilter, RATIONALE_ACTION))) {
    intentFilters.push({
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
    'android:targetActivity': mainActivity.$['android:name'],
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

  return withMainActivity(config, (activityConfig) => {
    activityConfig.modResults.contents = addHealthConnectPermissionDelegate(
      activityConfig.modResults.contents,
      activityConfig.modResults.language,
    );
    return activityConfig;
  });
};

module.exports = createRunOncePlugin(
  withEatlogHealthConnect,
  'with-eatlog-health-connect',
  pkg.version,
);
module.exports.addHealthConnectPermissionDelegate = addHealthConnectPermissionDelegate;
module.exports.ensureHealthConnectManifest = ensureHealthConnectManifest;
