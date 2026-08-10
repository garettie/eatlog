import assert from 'node:assert/strict';
import test from 'node:test';

import { supportsHealthConnect } from './platformFeatures';

test('Health Connect is Android-only', () => {
  assert.equal(supportsHealthConnect('android'), true);
  assert.equal(supportsHealthConnect('ios'), false);
  assert.equal(supportsHealthConnect('web'), false);
});
