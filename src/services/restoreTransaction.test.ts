import assert from 'node:assert/strict';
import test from 'node:test';

import { executeRestoreTransaction } from './restoreTransaction';

test('successful restore captures safety state before replacing and verifying live data', async () => {
  const events: string[] = [];
  await executeRestoreTransaction({
    captureSafetyCopy: async () => { events.push('capture'); },
    replaceAndVerify: async () => { events.push('replace'); events.push('verify'); },
    restoreSafetyCopy: async () => { events.push('rollback'); },
  });
  assert.deepEqual(events, ['capture', 'replace', 'verify']);
});

test('capture failure leaves live data alone and does not attempt an unsafe rollback', async () => {
  let rollbackCalled = false;
  await assert.rejects(executeRestoreTransaction({
    captureSafetyCopy: async () => { throw new Error('safety copy failed'); },
    replaceAndVerify: async () => { throw new Error('must not replace'); },
    restoreSafetyCopy: async () => { rollbackCalled = true; },
  }), /safety copy failed/);
  assert.equal(rollbackCalled, false);
});

test('failure after live replacement automatically restores database and photos', async () => {
  const state = { database: 'live-db', photos: ['live-a.jpg', 'live-b.jpg'] };
  let safety = { database: '', photos: [] as string[] };
  await assert.rejects(executeRestoreTransaction({
    captureSafetyCopy: async () => {
      safety = { database: state.database, photos: [...state.photos] };
    },
    replaceAndVerify: async () => {
      state.database = 'restored-db';
      state.photos = ['restored.jpg'];
      throw new Error('post-replacement verification failed');
    },
    restoreSafetyCopy: async () => {
      state.database = safety.database;
      state.photos = [...safety.photos];
    },
  }), /post-replacement verification failed/);
  assert.deepEqual(state, { database: 'live-db', photos: ['live-a.jpg', 'live-b.jpg'] });
});

test('rollback failure reports an unrecoverable aggregate and never returns success', async () => {
  let completed = false;
  await assert.rejects(
    executeRestoreTransaction({
      captureSafetyCopy: async () => {},
      replaceAndVerify: async () => { throw new Error('restore failure'); },
      restoreSafetyCopy: async () => { throw new Error('rollback failure'); },
    }).then(() => { completed = true; }),
    (error: unknown) => {
      assert.equal(error instanceof AggregateError, true);
      assert.equal((error as AggregateError).message, 'Restore failed and Eatlog could not complete its automatic rollback.');
      assert.deepEqual((error as AggregateError).errors.map(String), [
        'Error: restore failure',
        'Error: rollback failure',
      ]);
      return true;
    },
  );
  assert.equal(completed, false);
});
