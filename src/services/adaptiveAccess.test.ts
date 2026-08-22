import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdaptiveAccessRequiredError,
  requireAdaptiveAccess,
  setAdaptiveAccess,
} from './adaptiveAccess';

test('adaptive access rejects Pugo and accepts paid states', () => {
  setAdaptiveAccess(false);
  assert.throws(() => requireAdaptiveAccess(), AdaptiveAccessRequiredError);
  setAdaptiveAccess(true);
  assert.doesNotThrow(() => requireAdaptiveAccess());
  setAdaptiveAccess(false);
});
