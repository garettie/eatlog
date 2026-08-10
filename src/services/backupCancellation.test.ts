import assert from 'node:assert/strict';
import test from 'node:test';

import { assertBackupNotCancelled } from './backupCancellation';

test('backup cancellation stops the next cancellable step', () => {
  assert.doesNotThrow(() => assertBackupNotCancelled());
  assert.doesNotThrow(() => assertBackupNotCancelled({ aborted: false }));
  assert.throws(() => assertBackupNotCancelled({ aborted: true }), /Operation cancelled/);
});
