import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REMOTE_ESTIMATE_CONSENT_VERSION,
  createRemoteEstimateConsent,
  type RemoteEstimateConsentStorage,
} from './remoteEstimateConsent';

function memoryStorage(initial: string | null = null, options: {
  failRead?: boolean;
  failWrite?: boolean;
  failRemove?: boolean;
} = {}) {
  let value = initial;
  let reads = 0;
  let writes = 0;
  const storage: RemoteEstimateConsentStorage = {
    read: async () => {
      reads += 1;
      if (options.failRead) throw new Error('read failed');
      return value;
    },
    write: async (next) => {
      writes += 1;
      if (options.failWrite) throw new Error('write failed');
      value = next;
    },
    remove: async () => {
      if (options.failRemove) throw new Error('remove failed');
      value = null;
    },
  };
  return {
    storage,
    value: () => value,
    reads: () => reads,
    writes: () => writes,
  };
}

function record(decision: 'accepted' | 'declined', version = REMOTE_ESTIMATE_CONSENT_VERSION): string {
  return JSON.stringify({ version, decision });
}

test('missing storage returns null and is not accepted', async () => {
  const consent = createRemoteEstimateConsent(memoryStorage().storage);
  assert.equal(await consent.getDecision(), null);
  assert.equal(await consent.isAccepted(), false);
});

test('current accepted and declined records are parsed correctly', async () => {
  const accepted = createRemoteEstimateConsent(memoryStorage(record('accepted')).storage);
  assert.equal(await accepted.getDecision(), 'accepted');
  assert.equal(await accepted.isAccepted(), true);

  const declined = createRemoteEstimateConsent(memoryStorage(record('declined')).storage);
  assert.equal(await declined.getDecision(), 'declined');
  assert.equal(await declined.isAccepted(), false);
});

test('accept and decline writes use the current consent version', async () => {
  const memory = memoryStorage();
  const consent = createRemoteEstimateConsent(memory.storage);

  await consent.accept();
  assert.deepEqual(JSON.parse(memory.value()!), {
    version: REMOTE_ESTIMATE_CONSENT_VERSION,
    decision: 'accepted',
  });

  await consent.decline();
  assert.deepEqual(JSON.parse(memory.value()!), {
    version: REMOTE_ESTIMATE_CONSENT_VERSION,
    decision: 'declined',
  });
});

test('corrupt, older, future, and unknown records return null', async () => {
  for (const stored of [
    '{not json',
    record('accepted', REMOTE_ESTIMATE_CONSENT_VERSION - 1),
    record('accepted', REMOTE_ESTIMATE_CONSENT_VERSION + 1),
    JSON.stringify({ version: REMOTE_ESTIMATE_CONSENT_VERSION, decision: 'unknown' }),
  ]) {
    const consent = createRemoteEstimateConsent(memoryStorage(stored).storage);
    assert.equal(await consent.getDecision(), null);
    assert.equal(await consent.isAccepted(), false);
  }
});

test('clear removes the record', async () => {
  const memory = memoryStorage(record('accepted'));
  const consent = createRemoteEstimateConsent(memory.storage);
  assert.equal(await consent.isAccepted(), true);
  await consent.clear();
  assert.equal(memory.value(), null);
  assert.equal(await consent.getDecision(), null);
});

test('read failure fails closed and a later read can retry', async () => {
  let shouldFail = true;
  let reads = 0;
  const storage: RemoteEstimateConsentStorage = {
    read: async () => {
      reads += 1;
      if (shouldFail) throw new Error('read failed');
      return record('accepted');
    },
    write: async () => {},
    remove: async () => {},
  };
  const consent = createRemoteEstimateConsent(storage);

  assert.equal(await consent.getDecision(), null);
  shouldFail = false;
  assert.equal(await consent.getDecision(), 'accepted');
  assert.equal(reads, 2);
});

test('acceptance is not lost when an earlier read fails later', async () => {
  let rejectRead!: (error: Error) => void;
  const storage: RemoteEstimateConsentStorage = {
    read: () => new Promise<string | null>((_resolve, reject) => { rejectRead = reject; }),
    write: async () => {},
    remove: async () => {},
  };
  const consent = createRemoteEstimateConsent(storage);
  const read = consent.getDecision();
  await consent.accept();
  rejectRead(new Error('late read failure'));
  await read;
  assert.equal(await consent.isAccepted(), true);
});

test('accept write failure never reports acceptance', async () => {
  const memory = memoryStorage(null, { failWrite: true });
  const consent = createRemoteEstimateConsent(memory.storage);

  await assert.rejects(() => consent.accept(), /write failed/);
  assert.equal(await consent.isAccepted(), false);
  assert.equal(await consent.getDecision(), 'declined');
});

test('decline write failure remains fail-closed', async () => {
  const memory = memoryStorage(record('accepted'), { failWrite: true });
  const consent = createRemoteEstimateConsent(memory.storage);

  await assert.rejects(() => consent.decline(), /write failed/);
  assert.equal(await consent.isAccepted(), false);
  assert.equal(await consent.getDecision(), 'declined');
});

test('persisted decisions survive a new service instance', async () => {
  const memory = memoryStorage();
  const first = createRemoteEstimateConsent(memory.storage);
  await first.accept();

  const second = createRemoteEstimateConsent(memory.storage);
  assert.equal(await second.getDecision(), 'accepted');
  assert.equal(await second.isAccepted(), true);
  assert.equal(memory.writes(), 1);
  assert.equal(memory.reads(), 1);
});
