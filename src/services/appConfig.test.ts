import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

interface EvaluatedConfig {
  name: string;
  android: { package: string };
  ios: { bundleIdentifier: string };
}

type ConfigureApp = (input: {
  config: {
    name: string;
    android: { package: string };
    ios: { bundleIdentifier: string };
  };
}) => EvaluatedConfig;

const require = createRequire(import.meta.url);
const configPath = path.resolve(process.cwd(), 'app.config.js');
const easConfig = require(path.resolve(process.cwd(), 'eas.json')) as {
  build: Record<string, {
    autoIncrement?: boolean;
    developmentClient?: boolean;
    env?: Record<string, string>;
    android?: { buildType?: string; gradleCommand?: string };
  }>;
};

function evaluateVariant(appVariant?: string): EvaluatedConfig {
  const previousVariant = process.env.APP_VARIANT;
  const resolvedConfigPath = require.resolve(configPath);

  try {
    if (appVariant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = appVariant;
    delete require.cache[resolvedConfigPath];

    const configure = require(resolvedConfigPath) as ConfigureApp;
    return configure({
      config: {
        name: 'Eatlog',
        android: { package: 'com.sgaret.eatlog' },
        ios: { bundleIdentifier: 'com.sgaret.eatlog' },
      },
    });
  } finally {
    if (previousVariant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previousVariant;
    delete require.cache[resolvedConfigPath];
  }
}

test('Expo variants keep production stable and isolate standalone preview builds', () => {
  const production = evaluateVariant();
  assert.equal(production.name, 'Eatlog');
  assert.equal(production.android.package, 'com.sgaret.eatlog');
  assert.equal(production.ios.bundleIdentifier, 'com.sgaret.eatlog');

  const preview = evaluateVariant('preview');
  assert.equal(preview.name, 'Eatlog Preview');
  assert.equal(preview.android.package, 'com.sgaret.eatlog.preview');
  assert.equal(preview.ios.bundleIdentifier, 'com.sgaret.eatlog.preview');

  const development = evaluateVariant('development');
  assert.equal(development.name, 'Eatlog');
  assert.equal(development.android.package, 'com.sgaret.eatlog.dev');
  assert.equal(development.ios.bundleIdentifier, 'com.sgaret.eatlog.dev');
});

test('standalone preview builds increment independently after the first APK', () => {
  assert.equal(easConfig.build.preview.autoIncrement, true);
  assert.equal(easConfig.build.development.autoIncrement, undefined);
  assert.equal(easConfig.build.production.autoIncrement, true);
});

test('subscription preview is a standalone debug APK that permits RevenueCat Test Store', () => {
  const preview = easConfig.build.preview;
  assert.notEqual(preview.developmentClient, true);
  assert.equal(preview.android?.gradleCommand, ':app:assembleDebug');
  assert.equal(preview.android?.buildType, undefined);
  assert.equal(preview.env?.EX_UPDATES_NATIVE_DEBUG, '1');
  assert.equal(preview.env?.EXPO_PUBLIC_REVENUECAT_TEST_STORE_ALLOWED, 'true');
  assert.equal(easConfig.build.production.env?.EXPO_PUBLIC_REVENUECAT_TEST_STORE_ALLOWED, undefined);
});
