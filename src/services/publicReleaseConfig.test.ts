import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenFoodFactsUserAgent,
  normalizePublicHttpsUrl,
  normalizeSupportEmail,
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
