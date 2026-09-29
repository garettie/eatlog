const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withAndroidStyles,
} = require('expo/config-plugins');

const pkg = require('../package.json');

function preserveThemeColors(styles) {
  const parent = AndroidConfig.Styles.getAppThemeGroup();
  if (!AndroidConfig.Styles.getStyleParent(styles, parent)) {
    throw new Error('Eatlog color protection requires an existing AppTheme.');
  }
  return AndroidConfig.Styles.assignStylesValue(styles, {
    add: true,
    parent,
    name: 'android:forceDarkAllowed',
    value: 'false',
  });
}

function preserveMiuiColors(manifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  // Xiaomi documents true as disabling MIUI inversion in favor of the app's colors.
  // https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1595 (FAQ 3)
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(
    application,
    'force_dark_google',
    'true',
  );
  return manifest;
}

const withEatlogColors = (config) => {
  config = withAndroidStyles(config, (mod) => {
    mod.modResults = preserveThemeColors(mod.modResults);
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    mod.modResults = preserveMiuiColors(mod.modResults);
    return mod;
  });
};

module.exports = createRunOncePlugin(withEatlogColors, 'with-eatlog-colors', pkg.version);
module.exports.preserveThemeColors = preserveThemeColors;
module.exports.preserveMiuiColors = preserveMiuiColors;
