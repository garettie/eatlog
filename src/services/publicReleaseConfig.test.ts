import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenFoodFactsUserAgent,
  isRevenueCatTestStoreKey,
  normalizePublicHttpsUrl,
  normalizeSupportEmail,
  revenueCatApiKeyForBuild,
} from './publicReleaseConfig';

test('public release URLs accept only credential-free HTTPS URLs', () => {
  assert.equal(normalizePublicHttpsUrl('https://example.com/privacy'), 'https://example.com/privacy');
  assert.equal(normalizePublicHttpsUrl('http://example.com/privacy'), null);
  assert.equal(normalizePublicHttpsUrl('https://user:pass@example.com/privacy'), null);
  assert.equal(normalizePublicHttpsUrl('not a URL'), null);
  assert.equal(normalizePublicHttpsUrl(undefined), null);
});

test('Open Food Facts User-Agent requires a valid version and owner-provided support email', () => {
  const email = normalizeSupportEmail(' support@example.com ');
  assert.equal(buildOpenFoodFactsUserAgent('1.1.0', email), 'Eatlog/1.1.0 (support@example.com)');
  assert.equal(buildOpenFoodFactsUserAgent('1.1.0', normalizeSupportEmail('missing-at-sign')), null);
  assert.equal(buildOpenFoodFactsUserAgent('development', email), null);
  assert.equal(buildOpenFoodFactsUserAgent('1.1.0', null), null);
});

test('Test Store keys are disabled unless the build explicitly allows them', () => {
  assert.equal(isRevenueCatTestStoreKey(' test_public_key '), true);
  assert.equal(isRevenueCatTestStoreKey(' goog_public_key '), false);
  assert.equal(revenueCatApiKeyForBuild(' test_public_key ', false), '');
  assert.equal(revenueCatApiKeyForBuild(' test_public_key ', true), 'test_public_key');
  assert.equal(revenueCatApiKeyForBuild(' goog_public_key ', false), 'goog_public_key');
});
