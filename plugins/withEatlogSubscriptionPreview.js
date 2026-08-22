const {
  createRunOncePlugin,
  withAppBuildGradle,
  withMainApplication,
} = require('expo/config-plugins');

const pkg = require('../package.json');

const BUILD_TYPE_NAME = 'subscriptionPreview';

function ensureSubscriptionPreviewBuildType(contents) {
  if (contents.includes(`${BUILD_TYPE_NAME} {`)) return contents;

  const buildTypes = contents.match(/^[\t ]*buildTypes[\t ]*\{/m);
  if (!buildTypes || buildTypes.index === undefined) {
    throw new Error('Could not locate Android buildTypes in app/build.gradle.');
  }

  const openBrace = buildTypes.index + buildTypes[0].lastIndexOf('{');
  let depth = 0;
  let closeBrace = -1;
  for (let index = openBrace; index < contents.length; index += 1) {
    if (contents[index] === '{') depth += 1;
    if (contents[index] === '}') depth -= 1;
    if (depth === 0) {
      closeBrace = index;
      break;
    }
  }

  if (closeBrace < 0) {
    throw new Error('Could not locate the end of Android buildTypes in app/build.gradle.');
  }

  const closingLineStart = contents.lastIndexOf('\n', closeBrace) + 1;
  const buildTypesIndent = buildTypes[0].match(/^[\t ]*/)?.[0] ?? '';
  const entryIndent = `${buildTypesIndent}    `;
  const propertyIndent = `${entryIndent}    `;
  const previewBuildType = [
    `${entryIndent}${BUILD_TYPE_NAME} {`,
    `${propertyIndent}initWith release`,
    `${propertyIndent}debuggable true`,
    `${propertyIndent}signingConfig signingConfigs.debug`,
    `${propertyIndent}matchingFallbacks = ['release']`,
    `${entryIndent}}`,
  ].join('\n');

  return `${contents.slice(0, closingLineStart)}${previewBuildType}\n${contents.slice(closingLineStart)}`;
}

function disableSubscriptionPreviewDeveloperSupport(contents, language) {
  if (language === 'kt') {
    const development = 'override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG';
    const standalone = 'override fun getUseDeveloperSupport(): Boolean = false';
    if (contents.includes(standalone)) return contents;
    if (!contents.includes(development)) {
      throw new Error('Could not locate React Native developer support in MainApplication.kt.');
    }
    return contents.replace(development, standalone);
  }

  if (language === 'java') {
    const development = /(getUseDeveloperSupport\(\)\s*\{\s*)return BuildConfig\.DEBUG;/;
    const standalone = /getUseDeveloperSupport\(\)\s*\{\s*return false;/;
    if (standalone.test(contents)) return contents;
    if (!development.test(contents)) {
      throw new Error('Could not locate React Native developer support in MainApplication.java.');
    }
    return contents.replace(development, '$1return false;');
  }

  throw new Error(`Unsupported Android MainApplication language: ${language}`);
}

const withEatlogSubscriptionPreview = (config) => {
  config = withAppBuildGradle(config, (buildGradleConfig) => {
    if (buildGradleConfig.modResults.language !== 'groovy') {
      throw new Error('Eatlog subscription preview requires a Groovy app/build.gradle.');
    }
    buildGradleConfig.modResults.contents = ensureSubscriptionPreviewBuildType(
      buildGradleConfig.modResults.contents,
    );
    return buildGradleConfig;
  });

  return withMainApplication(config, (mainApplicationConfig) => {
    mainApplicationConfig.modResults.contents = disableSubscriptionPreviewDeveloperSupport(
      mainApplicationConfig.modResults.contents,
      mainApplicationConfig.modResults.language,
    );
    return mainApplicationConfig;
  });
};

module.exports = createRunOncePlugin(
  withEatlogSubscriptionPreview,
  'with-eatlog-subscription-preview',
  pkg.version,
);
module.exports.disableSubscriptionPreviewDeveloperSupport = disableSubscriptionPreviewDeveloperSupport;
module.exports.ensureSubscriptionPreviewBuildType = ensureSubscriptionPreviewBuildType;
