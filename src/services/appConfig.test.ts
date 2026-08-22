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
