const {
  createRunOncePlugin,
  withAndroidManifest,
} = require('expo/config-plugins');

const pkg = require('../package.json');

const WRITE_EXTERNAL_STORAGE = 'android.permission.WRITE_EXTERNAL_STORAGE';

function ensureLegacyMediaWritePermission(androidManifest) {
  const permissions = (androidManifest.manifest['uses-permission'] ??= []);
  let permission = permissions.find(
    (entry) => entry.$?.['android:name'] === WRITE_EXTERNAL_STORAGE,
  );

  if (!permission) {
    permission = { $: {} };
    permissions.push(permission);
  }

  permission.$ = {
    'android:name': WRITE_EXTERNAL_STORAGE,
    'android:maxSdkVersion': '32',
  };

  return androidManifest;
}

const withEatlogMediaPermissions = (config) => withAndroidManifest(
  config,
  (manifestConfig) => {
    ensureLegacyMediaWritePermission(manifestConfig.modResults);
    return manifestConfig;
  },
);

module.exports = createRunOncePlugin(
  withEatlogMediaPermissions,
  'with-eatlog-media-permissions',
  pkg.version,
);
module.exports.ensureLegacyMediaWritePermission = ensureLegacyMediaWritePermission;
